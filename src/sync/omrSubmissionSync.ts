import { randomUUID } from "react-native-quick-crypto";

import { ApiError } from "@/api/client";

import {
  uploadOmrBatch,
  type BatchSyncAnswers,
  type BatchSyncAnswerStatuses,
  type BatchSyncRequestPayload,
  type BatchSyncResponse,
} from "@/api/batchSyncApi";

import {
  assignOmrBatchUuid,
  getOutstandingOmrSubmissionsForScanBatch,
  markOmrBatchDeferred,
  markOmrBatchFailed,
  markOmrSubmissionFailed,
  markOmrSubmissionSynced,
  type ParsedLocalOmrSubmission,
} from "@/database/omrSubmissionRepository";

import {
  getScanBatches,
  markScanBatchStatus,
  refreshScanBatchStatus,
} from "@/database/scanBatchRepository";

export type ScanBatchSyncResult = {
  serverBatchCount: number;
  submissionCount: number;
  syncedCount: number;
  failedCount: number;

  rateLimited: boolean;
  retryAfterSeconds: number | null;
};

export type PendingOmrSyncResult = ScanBatchSyncResult & {
  localBatchCount: number;
};

const MAX_BATCH_SIZE = 100;

function normalizeFinalScore(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function buildServerAnswers(
  submission: ParsedLocalOmrSubmission,
): BatchSyncAnswers {
  const answers: BatchSyncAnswers = {};

  for (const question of submission.questions) {
    answers[String(question.question_number)] = [...question.shaded_choices]
      .map((choice) => choice.trim().toUpperCase())
      .filter(
        (choice, index, values) =>
          ["A", "B", "C", "D", "E"].includes(choice) &&
          values.indexOf(choice) === index,
      )
      .sort();
  }

  return answers;
}

function buildAnswerStatuses(
  submission: ParsedLocalOmrSubmission,
): BatchSyncAnswerStatuses {
  const statuses: BatchSyncAnswerStatuses = {};

  for (const question of submission.questions) {
    statuses[String(question.question_number)] = question.status;
  }

  return statuses;
}

function toServerSubmission(submission: ParsedLocalOmrSubmission) {
  return {
    submission_uuid: submission.submission_uuid,
    sheet_uuid: submission.sheet_uuid,
    student_id_no: submission.student_id_no,
    answers: buildServerAnswers(submission),
    answer_statuses: buildAnswerStatuses(submission),
    tentative_score: submission.tentative_score,
    requires_review: submission.requires_review,
    captured_at: submission.captured_at,
  };
}

function getOfficialResultForSubmission(
  response: BatchSyncResponse,
  submission: ParsedLocalOmrSubmission,
) {
  return response.course_test_results?.find(
    (result) =>
      result.crs_tst_id === submission.crs_tst_id &&
      (result.std_id === submission.std_id ||
        result.student_id_no === submission.student_id_no),
  );
}

async function applyBatchResponse(
  response: BatchSyncResponse,
  localSubmissions: ParsedLocalOmrSubmission[],
): Promise<{
  syncedCount: number;
  failedCount: number;
}> {
  let syncedCount = 0;
  let failedCount = 0;

  for (const localSubmission of localSubmissions) {
    const serverSubmission = response.submissions.find(
      (submission) =>
        submission.submission_uuid === localSubmission.submission_uuid,
    );

    if (!serverSubmission) {
      await markOmrSubmissionFailed(
        localSubmission.submission_uuid,
        "Laravel did not return a result for this submission.",
      );

      failedCount++;
      continue;
    }

    if (serverSubmission.status === "failed") {
      await markOmrSubmissionFailed(
        localSubmission.submission_uuid,
        serverSubmission.error_message ??
          "Laravel failed to process this submission.",
        serverSubmission.status,
      );

      failedCount++;
      continue;
    }

    const officialResult = getOfficialResultForSubmission(
      response,
      localSubmission,
    );

    const finalScore = normalizeFinalScore(
      officialResult?.final_score ?? serverSubmission.final_score,
    );

    await markOmrSubmissionSynced(localSubmission.submission_uuid, {
      serverStatus: serverSubmission.status,
      finalScore,
      serverRequiresReview: serverSubmission.requires_review,
      isFlagged: serverSubmission.is_flagged,
    });

    syncedCount++;
  }

  return {
    syncedCount,
    failedCount,
  };
}

/*
 * One faculty-facing Scan Batch may contain more than 100 papers.
 *
 * Laravel still receives server batches capped at 100. Existing batch_uuid
 * groups are retried first; only never-assigned rows receive a new batch_uuid.
 */
async function prepareNextServerBatch(
  scanBatchUuid: string,
  skipBatchUuids: Set<string>,
): Promise<{
  batchUuid: string;
  submissions: ParsedLocalOmrSubmission[];
} | null> {
  const outstanding =
    await getOutstandingOmrSubmissionsForScanBatch(scanBatchUuid);

  if (outstanding.length === 0) {
    return null;
  }

  const alreadyAssigned = outstanding.find(
    (submission) =>
      submission.batch_uuid !== null &&
      !skipBatchUuids.has(submission.batch_uuid),
  );

  if (alreadyAssigned?.batch_uuid) {
    return {
      batchUuid: alreadyAssigned.batch_uuid,
      submissions: outstanding
        .filter(
          (submission) => submission.batch_uuid === alreadyAssigned.batch_uuid,
        )
        .slice(0, MAX_BATCH_SIZE),
    };
  }

  const unassigned = outstanding
    .filter((submission) => submission.batch_uuid === null)
    .slice(0, MAX_BATCH_SIZE);

  if (unassigned.length === 0) {
    return null;
  }

  const batchUuid = randomUUID();

  await assignOmrBatchUuid(
    unassigned.map((submission) => submission.submission_uuid),
    batchUuid,
  );

  return {
    batchUuid,
    submissions: unassigned.map((submission) => ({
      ...submission,
      batch_uuid: batchUuid,
      sync_status: "syncing",
    })),
  };
}

async function syncOneServerBatch(
  token: string,
  scanBatchUuid: string,
  skipBatchUuids: Set<string>,
): Promise<{
  didWork: boolean;
  stopSyncing: boolean;
  submissionCount: number;
  syncedCount: number;
  failedCount: number;
  rateLimited: boolean;
  retryAfterSeconds: number | null;
}> {
  const prepared = await prepareNextServerBatch(scanBatchUuid, skipBatchUuids);

  if (!prepared) {
    return {
      didWork: false,
      stopSyncing: false,
      submissionCount: 0,
      syncedCount: 0,
      failedCount: 0,
      rateLimited: false,
      retryAfterSeconds: null,
    };
  }

  const first = prepared.submissions[0];

  if (!first) {
    return {
      didWork: false,
      stopSyncing: false,
      submissionCount: 0,
      syncedCount: 0,
      failedCount: 0,
      rateLimited: false,
      retryAfterSeconds: null,
    };
  }

  const mismatched = prepared.submissions.some(
    (submission) =>
      submission.crs_tst_id !== first.crs_tst_id ||
      submission.tst_id !== first.tst_id,
  );

  if (mismatched) {
    throw new Error(
      "A local Scan Batch cannot contain submissions from different Course Tests.",
    );
  }

  const payload: BatchSyncRequestPayload = {
    batch_uuid: prepared.batchUuid,
    crs_tst_id: first.crs_tst_id,
    tst_id: first.tst_id,
    source: "mobile",
    submissions: prepared.submissions.map(toServerSubmission),
  };

  try {
    const response = await uploadOmrBatch(token, payload);

    const applied = await applyBatchResponse(response, prepared.submissions);

    /*
     * Do not immediately retry child-level failures in the same button press.
     * Keep their stable batch_uuid for the teacher's next Retry action while
     * allowing any never-assigned submissions in this local Scan Batch to
     * continue into the next server chunk.
     */
    if (applied.failedCount > 0) {
      skipBatchUuids.add(prepared.batchUuid);
    }

    return {
      didWork: true,
      stopSyncing: false,
      submissionCount: prepared.submissions.length,
      syncedCount: applied.syncedCount,
      failedCount: applied.failedCount,
      rateLimited: false,
      retryAfterSeconds: null,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown OMR synchronization error.";

    if (error instanceof ApiError && error.status === 429) {
      const retryAfterSeconds = error.retryAfterSeconds;

      const deferredMessage =
        retryAfterSeconds !== null
          ? `Server rate limit reached. Retry after about ${retryAfterSeconds} second(s).`
          : "Server rate limit reached. Please wait before syncing again.";

      await markOmrBatchDeferred(prepared.batchUuid, deferredMessage);

      return {
        didWork: true,
        stopSyncing: true,
        submissionCount: prepared.submissions.length,
        syncedCount: 0,
        failedCount: 0,
        rateLimited: true,
        retryAfterSeconds,
      };
    }

    await markOmrBatchFailed(prepared.batchUuid, message);

    skipBatchUuids.add(prepared.batchUuid);

    return {
      didWork: true,
      stopSyncing: true,
      submissionCount: prepared.submissions.length,
      syncedCount: 0,
      failedCount: prepared.submissions.length,
      rateLimited: false,
      retryAfterSeconds: null,
    };
  }
}

export async function syncScanBatch(
  token: string,
  scanBatchUuid: string,
): Promise<ScanBatchSyncResult> {
  const normalizedUuid = scanBatchUuid.trim();

  if (!normalizedUuid) {
    throw new Error("A Scan Batch UUID is required.");
  }

  const result: ScanBatchSyncResult = {
    serverBatchCount: 0,
    submissionCount: 0,
    syncedCount: 0,
    failedCount: 0,
    rateLimited: false,
    retryAfterSeconds: null,
  };

  await markScanBatchStatus(normalizedUuid, "submitting");

  const skipBatchUuids = new Set<string>();

  try {
    while (true) {
      const batch = await syncOneServerBatch(
        token,
        normalizedUuid,
        skipBatchUuids,
      );

      if (!batch.didWork) {
        break;
      }

      result.serverBatchCount++;
      result.submissionCount += batch.submissionCount;
      result.syncedCount += batch.syncedCount;
      result.failedCount += batch.failedCount;

      if (batch.rateLimited) {
        result.rateLimited = true;
        result.retryAfterSeconds = batch.retryAfterSeconds;
      }

      if (batch.stopSyncing) {
        break;
      }
    }

    return result;
  } finally {
    await refreshScanBatchStatus(normalizedUuid);
  }
}

/*
 * Compatibility helper. The Batch screen should use syncScanBatch() so the
 * teacher explicitly chooses which local batch to submit.
 */
export async function syncPendingOmrSubmissions(
  token: string,
): Promise<PendingOmrSyncResult> {
  const result: PendingOmrSyncResult = {
    localBatchCount: 0,
    serverBatchCount: 0,
    submissionCount: 0,
    syncedCount: 0,
    failedCount: 0,
    rateLimited: false,
    retryAfterSeconds: null,
  };

  const batches = await getScanBatches();

  for (const batch of batches) {
    if (batch.status === "submitted") {
      continue;
    }

    const outstanding = await getOutstandingOmrSubmissionsForScanBatch(
      batch.scan_batch_uuid,
    );

    if (outstanding.length === 0) {
      continue;
    }

    const batchResult = await syncScanBatch(token, batch.scan_batch_uuid);

    result.localBatchCount++;
    result.serverBatchCount += batchResult.serverBatchCount;
    result.submissionCount += batchResult.submissionCount;
    result.syncedCount += batchResult.syncedCount;
    result.failedCount += batchResult.failedCount;

    if (batchResult.rateLimited) {
      result.rateLimited = true;
      result.retryAfterSeconds = batchResult.retryAfterSeconds;
      break;
    }
  }

  return result;
}
