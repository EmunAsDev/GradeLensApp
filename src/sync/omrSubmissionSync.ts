import { randomUUID } from "react-native-quick-crypto";

import {
  buildBatchSyncRequestPayload,
  uploadOmrBatch,
  type BatchSyncResponse,
} from "@/api/batchSyncApi";
import { ApiError } from "@/api/client";

import {
  assignOmrBatchUuid,
  getOmrSubmissionsForScanBatch,
  getReadyOmrSubmissionsForScanBatch,
  getRetryableOmrSubmissionsForBatch,
  markOmrBatchDeferred,
  markOmrBatchFailed,
  markOmrSubmissionFailed,
  markOmrSubmissionRejected,
  markOmrSubmissionSynced,
  type ParsedLocalOmrSubmission,
} from "@/database/omrSubmissionRepository";

import {
  getScanBatchByUuid,
  markScanBatchStatus,
  refreshScanBatchStatus,
} from "@/database/scanBatchRepository";

export type SyncScanBatchResult = {
  submissionCount: number;
  syncedCount: number;
  reviewCount: number;
  failedCount: number;
  rejectedCount: number;

  rateLimited: boolean;
  retryAfterSeconds: number | null;
};

type GroupResult = SyncScanBatchResult;

const EMPTY_RESULT: SyncScanBatchResult = {
  submissionCount: 0,
  syncedCount: 0,
  reviewCount: 0,
  failedCount: 0,
  rejectedCount: 0,
  rateLimited: false,
  retryAfterSeconds: null,
};

/*
 * Synchronize one faculty-facing local scan batch.
 *
 * Important distinction:
 *
 * - scan_batch_uuid groups papers from one local scanning session.
 * - batch_uuid identifies one immutable Laravel synchronization batch.
 *
 * A local scan batch may therefore create multiple Laravel batches over time.
 * Needs Review papers remain local and are not assigned a batch_uuid until the
 * faculty resolves every uncertain question.
 */
export async function syncScanBatch(
  token: string,
  scanBatchUuid: string,
): Promise<SyncScanBatchResult> {
  const normalizedScanBatchUuid = scanBatchUuid.trim();

  if (!token.trim()) {
    throw new Error("An authenticated session is required for Batch Sync.");
  }

  if (!normalizedScanBatchUuid) {
    throw new Error("A local scan batch UUID is required.");
  }

  const scanBatch = await getScanBatchByUuid(normalizedScanBatchUuid);

  if (!scanBatch) {
    throw new Error("This local scan batch could not be found.");
  }

  const aggregate: SyncScanBatchResult = { ...EMPTY_RESULT };

  const allSubmissions = await getOmrSubmissionsForScanBatch(
    normalizedScanBatchUuid,
  );

  /*
   * First retry any server batches that already exist. Their batch_uuid and
   * membership are immutable, so they must be replayed before starting another
   * new server batch from currently Ready local papers.
   */
  const existingBatchUuids = [
    ...new Set(
      allSubmissions
        .filter(
          (submission) =>
            submission.batch_uuid !== null &&
            submission.sync_status !== "synced" &&
            submission.sync_status !== "rejected",
        )
        .map((submission) => submission.batch_uuid as string),
    ),
  ];

  if (existingBatchUuids.length > 0) {
    await markScanBatchStatus(normalizedScanBatchUuid, "submitting");
  }

  for (const batchUuid of existingBatchUuids) {
    const retryable = await getRetryableOmrSubmissionsForBatch(batchUuid);

    if (retryable.length === 0) {
      continue;
    }

    const result = await synchronizeServerBatch(
      token,
      batchUuid,
      scanBatch.crs_tst_id,
      scanBatch.tst_id,
      retryable,
    );

    mergeResult(aggregate, result);

    if (result.rateLimited) {
      await refreshScanBatchStatus(normalizedScanBatchUuid);
      return aggregate;
    }
  }

  /*
   * Only unresolved-free, unbatched papers are allowed into a new Laravel
   * batch. Needs Review papers are intentionally absent from this query.
   */
  const ready = await getReadyOmrSubmissionsForScanBatch(
    normalizedScanBatchUuid,
  );

  if (ready.length > 0) {
    await markScanBatchStatus(normalizedScanBatchUuid, "submitting");

    const batchUuid = randomUUID();

    await assignOmrBatchUuid(
      ready.map((submission) => submission.submission_uuid),
      batchUuid,
    );

    /*
     * Reload the now-frozen rows before network I/O. From this point onward the
     * request is built from the exact stored evidence tied to batchUuid.
     */
    const frozen = await getRetryableOmrSubmissionsForBatch(batchUuid);

    const result = await synchronizeServerBatch(
      token,
      batchUuid,
      scanBatch.crs_tst_id,
      scanBatch.tst_id,
      frozen,
    );

    mergeResult(aggregate, result);
  }

  await refreshScanBatchStatus(normalizedScanBatchUuid);

  return aggregate;
}

async function synchronizeServerBatch(
  token: string,
  batchUuid: string,
  crsTstId: number,
  tstId: number,
  submissions: ParsedLocalOmrSubmission[],
): Promise<GroupResult> {
  if (submissions.length === 0) {
    return { ...EMPTY_RESULT };
  }

  const result: GroupResult = {
    ...EMPTY_RESULT,
    submissionCount: submissions.length,
  };

  try {
    const payload = buildBatchSyncRequestPayload(
      batchUuid,
      crsTstId,
      tstId,
      submissions,
    );

    const response = await uploadOmrBatch(token, payload);

    await applyServerResponse(submissions, response, result);

    return result;
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      const message =
        error.message || "GradeLens temporarily paused Batch Sync.";

      await markOmrBatchDeferred(batchUuid, message);

      result.rateLimited = true;
      result.retryAfterSeconds = error.retryAfterSeconds;

      return result;
    }

    if (
      error instanceof ApiError &&
      (error.status === 409 || error.status === 422)
    ) {
      const message =
        error.message ||
        "Laravel rejected this immutable synchronization batch.";

      for (const submission of submissions) {
        await markOmrSubmissionRejected(
          submission.submission_uuid,
          message,
          `http_${error.status}`,
        );

        result.rejectedCount++;
      }

      return result;
    }

    const message =
      error instanceof Error
        ? error.message
        : "GradeLens could not complete this synchronization batch.";

    await markOmrBatchFailed(batchUuid, message);

    result.failedCount = submissions.length;

    throw error;
  }
}

async function applyServerResponse(
  submitted: ParsedLocalOmrSubmission[],
  response: BatchSyncResponse,
  result: GroupResult,
): Promise<void> {
  const responseByUuid = new Map(
    response.submissions.map((submission) => [
      submission.submission_uuid,
      submission,
    ]),
  );

  for (const local of submitted) {
    const server = responseByUuid.get(local.submission_uuid);

    if (!server) {
      await markOmrSubmissionFailed(
        local.submission_uuid,
        "Laravel did not return a result for this submission.",
        null,
      );

      result.failedCount++;
      continue;
    }

    if (server.status === "processed") {
      await markOmrSubmissionSynced(local.submission_uuid, {
        serverStatus: server.status,
        finalScore: normalizeNullableNumber(server.final_score),
        serverRequiresReview: false,
        isFlagged: Boolean(server.is_flagged),
      });

      result.syncedCount++;
      continue;
    }

    /*
     * This should not occur in the normal mobile-first workflow because local
     * review blocks synchronization. Keep support as a defensive compatibility
     * path for older app versions or unexpected server-side review rules.
     */
    if (server.status === "review_required") {
      await markOmrSubmissionSynced(local.submission_uuid, {
        serverStatus: server.status,
        finalScore: null,
        serverRequiresReview: true,
        isFlagged: true,
      });

      result.reviewCount++;
      continue;
    }

    if (server.status === "failed") {
      const message =
        server.error_message || "Laravel could not process this submission.";

      if (isFinalizedResultConflict(message)) {
        await markOmrSubmissionRejected(
          local.submission_uuid,
          message,
          server.status,
        );

        result.rejectedCount++;
      } else {
        await markOmrSubmissionFailed(
          local.submission_uuid,
          message,
          server.status,
        );

        result.failedCount++;
      }

      continue;
    }

    await markOmrSubmissionFailed(
      local.submission_uuid,
      `Unsupported Laravel submission status: ${server.status}.`,
      server.status,
    );

    result.failedCount++;
  }
}

function isFinalizedResultConflict(message: string): boolean {
  return message.toLowerCase().includes("already has a final result");
}

function normalizeNullableNumber(value: string | number | null): number | null {
  if (value === null || value === "") {
    return null;
  }

  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : null;
}

function mergeResult(
  target: SyncScanBatchResult,
  source: SyncScanBatchResult,
): void {
  target.submissionCount += source.submissionCount;
  target.syncedCount += source.syncedCount;
  target.reviewCount += source.reviewCount;
  target.failedCount += source.failedCount;
  target.rejectedCount += source.rejectedCount;

  if (source.rateLimited) {
    target.rateLimited = true;
    target.retryAfterSeconds = source.retryAfterSeconds;
  }
}
