import { randomUUID } from "react-native-quick-crypto";

import {
  uploadOmrBatch,
  type BatchSyncAnswers,
  type BatchSyncAnswerStatuses,
  type BatchSyncRequestPayload,
  type BatchSyncResponse,
} from "@/api/batchSyncApi";

import {
  assignOmrBatchUuid,
  getPendingOmrSubmissions,
  markOmrBatchFailed,
  markOmrSubmissionFailed,
  markOmrSubmissionSynced,
  type ParsedLocalOmrSubmission,
} from "@/database/omrSubmissionRepository";

export type PendingOmrSyncResult = {
  batchCount: number;
  submissionCount: number;
  syncedCount: number;
  failedCount: number;
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

/*
 * Laravel's authoritative scoring contract expects every question value as
 * an ARRAY of selected/shaded choices. We therefore build the server answer
 * map from shaded_choices, not from the compact UI answers map.
 *
 * Example:
 * Q15 shaded C + D -> ["C", "D"]
 * blank Q22        -> []
 * accidental multi -> ["B", "E"]
 */
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

    requires_review: submission.review_question_numbers.length > 0,

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
        null,
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

    /*
     * Prefer the permanent CourseTestResult returned by Laravel.
     * Fall back to the ingestion submission's final_score for compatibility
     * with the earlier synchronous controller response.
     */
    const finalScore = normalizeFinalScore(
      officialResult?.final_score ?? serverSubmission.final_score,
    );

    await markOmrSubmissionSynced(localSubmission.submission_uuid, {
      serverStatus: serverSubmission.status,

      finalScore,
    });

    syncedCount++;
  }

  return {
    syncedCount,
    failedCount,
  };
}

/*
 * Choose the next stable local batch.
 *
 * 1. Retry an already-assigned batch_uuid first.
 * 2. Otherwise group unsent rows by the same crs_tst_id + tst_id,
 *    create ONE batch UUID, and persist it BEFORE network I/O.
 */
async function prepareNextBatch(): Promise<{
  batchUuid: string;
  submissions: ParsedLocalOmrSubmission[];
} | null> {
  const pending = await getPendingOmrSubmissions();

  if (pending.length === 0) {
    return null;
  }

  const alreadyAssigned = pending.find(
    (submission: any) => submission.batch_uuid !== null,
  );

  if (alreadyAssigned?.batch_uuid) {
    return {
      batchUuid: alreadyAssigned.batch_uuid,

      submissions: pending
        .filter(
          (submission) => submission.batch_uuid === alreadyAssigned.batch_uuid,
        )
        .slice(0, MAX_BATCH_SIZE),
    };
  }

  const first = pending[0];

  const submissions = pending
    .filter(
      (submission) =>
        submission.batch_uuid === null &&
        submission.crs_tst_id === first.crs_tst_id &&
        submission.tst_id === first.tst_id,
    )
    .slice(0, MAX_BATCH_SIZE);

  const batchUuid = randomUUID();

  await assignOmrBatchUuid(
    submissions.map((submission) => submission.submission_uuid),
    batchUuid,
  );

  return {
    batchUuid,
    submissions: submissions.map((submission) => ({
      ...submission,
      batch_uuid: batchUuid,
      sync_status: "syncing",
    })),
  };
}

async function syncOneBatch(token: string): Promise<{
  didWork: boolean;
  submissionCount: number;
  syncedCount: number;
  failedCount: number;
}> {
  const prepared = await prepareNextBatch();

  if (!prepared) {
    return {
      didWork: false,
      submissionCount: 0,
      syncedCount: 0,
      failedCount: 0,
    };
  }

  const first = prepared.submissions[0];

  const payload: BatchSyncRequestPayload = {
    batch_uuid: prepared.batchUuid,

    crs_tst_id: first.crs_tst_id,

    tst_id: first.tst_id,

    source: "mobile",

    submissions: prepared.submissions.map(toServerSubmission),
  };

  console.log("[OMR SYNC] Uploading batch:", {
    batchUuid: payload.batch_uuid,

    courseTestId: payload.crs_tst_id,

    testId: payload.tst_id,

    submissionCount: payload.submissions.length,
  });

  try {
    const response = await uploadOmrBatch(token, payload);

    console.log("[OMR SYNC] Server batch response:", {
      batchUuid: response.batch.batch_uuid,

      status: response.batch.status,

      totalSubmissions: response.batch.total_submissions,

      processedSubmissions: response.batch.processed_submissions,

      failedSubmissions: response.batch.failed_submissions,
    });

    const applied = await applyBatchResponse(response, prepared.submissions);

    return {
      didWork: true,
      submissionCount: prepared.submissions.length,

      syncedCount: applied.syncedCount,

      failedCount: applied.failedCount,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown OMR synchronization error.";

    await markOmrBatchFailed(prepared.batchUuid, message);

    console.error("[OMR SYNC] Batch upload failed:", {
      batchUuid: prepared.batchUuid,

      error: message,
    });

    throw error;
  }
}

export async function syncPendingOmrSubmissions(
  token: string,
): Promise<PendingOmrSyncResult> {
  const result: PendingOmrSyncResult = {
    batchCount: 0,
    submissionCount: 0,
    syncedCount: 0,
    failedCount: 0,
  };

  while (true) {
    const batch = await syncOneBatch(token);

    if (!batch.didWork) {
      break;
    }

    result.batchCount++;

    result.submissionCount += batch.submissionCount;

    result.syncedCount += batch.syncedCount;

    result.failedCount += batch.failedCount;
  }

  return result;
}
