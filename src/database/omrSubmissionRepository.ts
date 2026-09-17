import { getDatabase } from "@/database/database";

import {
  deleteEmptyDraftScanBatch,
  getOrCreateDraftScanBatch,
} from "@/database/scanBatchRepository";

import type {
  OmrQuestionCount,
  OmrSheetFormat,
  OmrSubmissionPayload,
} from "@/../modules/gradelens-omr/submission";

export type LocalOmrSubmissionSyncStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "failed"
  | "rejected";

export class DuplicateOmrSubmissionError extends Error {
  submission: ParsedLocalOmrSubmission;

  constructor(submission: ParsedLocalOmrSubmission) {
    super(
      `Answer sheet ${submission.sheet_uuid} has already been scanned with status ${submission.sync_status}.`,
    );

    this.name = "DuplicateOmrSubmissionError";
    this.submission = submission;
  }
}

export class FinalizedCourseTestResultError extends Error {
  finalScore: number;

  constructor(finalScore: number) {
    super("This student already has a finalized result for this Course Test.");

    this.name = "FinalizedCourseTestResultError";
    this.finalScore = finalScore;
  }
}

export class ExistingStudentOmrSubmissionError extends Error {
  submission: ParsedLocalOmrSubmission;

  constructor(submission: ParsedLocalOmrSubmission) {
    super(
      `Student ${submission.student_id_no} already has a local scan for this Course Test.`,
    );

    this.name = "ExistingStudentOmrSubmissionError";
    this.submission = submission;
  }
}

export type SavePendingOmrSubmissionInput = {
  submission_uuid: string;
  sheet_uuid: string;

  crs_tst_id: number;
  tst_id: number;

  std_id: number;
  student_id_no: string;

  payload: OmrSubmissionPayload;
  tentative_score: number;

  captured_at?: string;
};

export type LocalOmrSubmission = {
  submission_uuid: string;
  sheet_uuid: string;

  crs_tst_id: number;
  tst_id: number;

  std_id: number;
  student_id_no: string;

  format: OmrSheetFormat;
  question_count: OmrQuestionCount;

  answers_json: string;
  questions_json: string;
  review_question_numbers_json: string;
  counts_json: string;

  tentative_score: number;

  scan_batch_uuid: string | null;
  batch_uuid: string | null;

  sync_status: LocalOmrSubmissionSyncStatus;
  server_status: string | null;
  final_score: number | null;

  requires_review: number;
  server_requires_review: number | null;
  is_flagged: number | null;

  last_error: string | null;

  captured_at: string;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
};

export type ParsedLocalOmrSubmission = Omit<
  LocalOmrSubmission,
  | "answers_json"
  | "questions_json"
  | "review_question_numbers_json"
  | "counts_json"
  | "requires_review"
  | "server_requires_review"
  | "is_flagged"
> & {
  answers: OmrSubmissionPayload["answers"];
  questions: OmrSubmissionPayload["questions"];
  review_question_numbers: OmrSubmissionPayload["review_question_numbers"];
  counts: OmrSubmissionPayload["counts"];

  requires_review: boolean;
  server_requires_review: boolean | null;
  is_flagged: boolean | null;
};

function validatePendingSubmission(input: SavePendingOmrSubmissionInput): void {
  if (!input.submission_uuid.trim()) {
    throw new Error("Submission UUID is required.");
  }

  if (!input.sheet_uuid.trim()) {
    throw new Error("Sheet UUID is required.");
  }

  if (!Number.isInteger(input.crs_tst_id) || input.crs_tst_id <= 0) {
    throw new Error("A valid Course Test ID is required.");
  }

  if (!Number.isInteger(input.tst_id) || input.tst_id <= 0) {
    throw new Error("A valid test ID is required.");
  }

  if (!Number.isInteger(input.std_id) || input.std_id <= 0) {
    throw new Error("A valid local student ID is required.");
  }

  if (!input.student_id_no.trim()) {
    throw new Error("Student ID number is required.");
  }

  if (
    input.payload.question_count !== 50 &&
    input.payload.question_count !== 100
  ) {
    throw new Error(
      `Unsupported local OMR submission size: ${input.payload.question_count}. Expected 50 or 100.`,
    );
  }

  if (input.payload.format !== String(input.payload.question_count)) {
    throw new Error(
      `OMR format mismatch. format=${input.payload.format}, question_count=${input.payload.question_count}.`,
    );
  }

  if (input.payload.questions.length !== input.payload.question_count) {
    throw new Error(
      `Expected ${input.payload.question_count} stored OMR questions, received ${input.payload.questions.length}.`,
    );
  }

  if (!Number.isFinite(input.tentative_score)) {
    throw new Error("Tentative score must be a finite number.");
  }

  if (input.captured_at && Number.isNaN(Date.parse(input.captured_at))) {
    throw new Error("captured_at must be a valid date.");
  }
}

const SELECT_COLUMNS = `
  submission_uuid,
  sheet_uuid,

  crs_tst_id,
  tst_id,

  std_id,
  student_id_no,

  format,
  question_count,

  answers_json,
  questions_json,
  review_question_numbers_json,
  counts_json,

  tentative_score,

  scan_batch_uuid,
  batch_uuid,

  sync_status,
  server_status,
  final_score,

  requires_review,
  server_requires_review,
  is_flagged,

  last_error,

  captured_at,
  created_at,
  updated_at,
  synced_at
`;

function parseStoredSubmission(
  row: LocalOmrSubmission,
): ParsedLocalOmrSubmission {
  return {
    submission_uuid: row.submission_uuid,
    sheet_uuid: row.sheet_uuid,

    crs_tst_id: row.crs_tst_id,
    tst_id: row.tst_id,

    std_id: row.std_id,
    student_id_no: row.student_id_no,

    format: row.format,
    question_count: row.question_count,

    answers: JSON.parse(row.answers_json),
    questions: JSON.parse(row.questions_json),
    review_question_numbers: JSON.parse(row.review_question_numbers_json),
    counts: JSON.parse(row.counts_json),

    tentative_score: row.tentative_score,

    scan_batch_uuid: row.scan_batch_uuid,
    batch_uuid: row.batch_uuid,

    sync_status: row.sync_status,
    server_status: row.server_status,
    final_score: row.final_score,

    requires_review: row.requires_review === 1,
    server_requires_review:
      row.server_requires_review === null
        ? null
        : row.server_requires_review === 1,
    is_flagged: row.is_flagged === null ? null : row.is_flagged === 1,

    last_error: row.last_error,

    captured_at: row.captured_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    synced_at: row.synced_at,
  };
}

/*
 * A physical sheet has one current local submission.
 *
 * Before submission starts, the teacher may remove that local draft and scan
 * the same physical sheet again. Once a server batch_uuid has been assigned,
 * the stored evidence is frozen and retries must reuse the same submission.
 */
export async function savePendingOmrSubmission(
  input: SavePendingOmrSubmissionInput,
): Promise<void> {
  validatePendingSubmission(input);

  const db = await getDatabase();

  const submissionUuid = input.submission_uuid.trim();
  const sheetUuid = input.sheet_uuid.trim();

  /*
   * A Laravel-finalized result is immutable. Mobile must not create a new
   * pending scan that can never be accepted by the server.
   */
  const finalizedResult = await db.getFirstAsync<{
    final_score: number | null;
  }>(
    `
      SELECT final_score
      FROM course_test_results
      WHERE crs_tst_id = ?
        AND std_id = ?
      LIMIT 1
    `,
    [input.crs_tst_id, input.std_id],
  );

  if (finalizedResult && finalizedResult.final_score !== null) {
    throw new FinalizedCourseTestResultError(finalizedResult.final_score);
  }

  const duplicate = await db.getFirstAsync<LocalOmrSubmission>(
    `
      SELECT
        ${SELECT_COLUMNS}

      FROM omr_submissions

      WHERE submission_uuid = ?
        OR sheet_uuid = ?

      ORDER BY created_at DESC
      LIMIT 1
    `,
    [submissionUuid, sheetUuid],
  );

  if (duplicate) {
    throw new DuplicateOmrSubmissionError(parseStoredSubmission(duplicate));
  }

  /*
   * One student may have only one current scan for a Course Test. To rescan
   * before submission, the teacher must remove the existing local draft first.
   */
  const existingStudentSubmission = await db.getFirstAsync<LocalOmrSubmission>(
    `
        SELECT
          ${SELECT_COLUMNS}

        FROM omr_submissions

        WHERE crs_tst_id = ?
          AND std_id = ?

        ORDER BY created_at DESC
        LIMIT 1
      `,
    [input.crs_tst_id, input.std_id],
  );

  if (existingStudentSubmission) {
    throw new ExistingStudentOmrSubmissionError(
      parseStoredSubmission(existingStudentSubmission),
    );
  }

  const now = new Date().toISOString();
  const capturedAt = input.captured_at ?? now;
  const studentIdNo = input.student_id_no.trim();

  const answersJson = JSON.stringify(input.payload.answers);
  const questionsJson = JSON.stringify(input.payload.questions);
  const reviewQuestionNumbersJson = JSON.stringify(
    input.payload.review_question_numbers,
  );
  const countsJson = JSON.stringify(input.payload.counts);

  const requiresReview =
    input.payload.review_question_numbers.length > 0 ? 1 : 0;

  const scanBatch = await getOrCreateDraftScanBatch(
    input.crs_tst_id,
    input.tst_id,
  );

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `
        INSERT INTO omr_submissions (
          submission_uuid,
          sheet_uuid,

          crs_tst_id,
          tst_id,

          std_id,
          student_id_no,

          format,
          question_count,

          answers_json,
          questions_json,
          review_question_numbers_json,
          counts_json,

          tentative_score,

          scan_batch_uuid,
          batch_uuid,

          sync_status,
          server_status,
          final_score,

          requires_review,
          server_requires_review,
          is_flagged,

          last_error,

          captured_at,
          created_at,
          updated_at,
          synced_at
        )

        VALUES (
          ?, ?,
          ?, ?,
          ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?,
          ?, NULL,
          'pending', NULL, NULL,
          ?, NULL, NULL,
          NULL,
          ?, ?, ?, NULL
        )
      `,
      [
        submissionUuid,
        sheetUuid,
        input.crs_tst_id,
        input.tst_id,
        input.std_id,
        studentIdNo,
        input.payload.format,
        input.payload.question_count,
        answersJson,
        questionsJson,
        reviewQuestionNumbersJson,
        countsJson,
        input.tentative_score,
        scanBatch.scan_batch_uuid,
        requiresReview,
        capturedAt,
        now,
        now,
      ],
    );

    await db.runAsync(
      `
        INSERT INTO course_test_results (
          crs_tst_id,
          std_id,
          tentative_score,
          final_score,
          sync_status,
          updated_at,
          synced_at
        )

        VALUES (?, ?, ?, NULL, 'pending', ?, NULL)

        ON CONFLICT(crs_tst_id, std_id)
        DO UPDATE SET
          tentative_score = excluded.tentative_score,
          sync_status = 'pending',
          updated_at = excluded.updated_at,
          synced_at = NULL
      `,
      [input.crs_tst_id, input.std_id, input.tentative_score, now],
    );
  });
}

export async function getPendingOmrSubmissions(): Promise<
  ParsedLocalOmrSubmission[]
> {
  const db = await getDatabase();

  const rows = await db.getAllAsync<LocalOmrSubmission>(`
    SELECT
      ${SELECT_COLUMNS}

    FROM omr_submissions

    WHERE sync_status IN ('pending', 'failed', 'syncing')

    ORDER BY created_at ASC
  `);

  return rows.map(parseStoredSubmission);
}

export async function getOmrSubmissionByUuid(
  submissionUuid: string,
): Promise<ParsedLocalOmrSubmission | null> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<LocalOmrSubmission>(
    `
      SELECT
        ${SELECT_COLUMNS}

      FROM omr_submissions

      WHERE submission_uuid = ?
      LIMIT 1
    `,
    [submissionUuid],
  );

  return row ? parseStoredSubmission(row) : null;
}

export async function getOmrSubmissionBySheetUuid(
  sheetUuid: string,
): Promise<ParsedLocalOmrSubmission | null> {
  const normalizedSheetUuid = sheetUuid.trim();

  if (!normalizedSheetUuid) {
    return null;
  }

  const db = await getDatabase();

  const row = await db.getFirstAsync<LocalOmrSubmission>(
    `
      SELECT
        ${SELECT_COLUMNS}

      FROM omr_submissions

      WHERE sheet_uuid = ?

      ORDER BY created_at DESC
      LIMIT 1
    `,
    [normalizedSheetUuid],
  );

  return row ? parseStoredSubmission(row) : null;
}

export async function countPendingOmrSubmissions(): Promise<number> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<{ total: number }>(`
    SELECT COUNT(*) AS total
    FROM omr_submissions
    WHERE sync_status IN ('pending', 'failed', 'syncing')
  `);

  return row?.total ?? 0;
}

/*
 * Freeze the exact server-batch membership before network I/O.
 *
 * If Laravel accepts the request but the response is lost, the mobile retries
 * these same submission UUIDs under the same batch UUID.
 */
export async function assignOmrBatchUuid(
  submissionUuids: string[],
  batchUuid: string,
): Promise<void> {
  if (submissionUuids.length === 0) {
    return;
  }

  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    for (const submissionUuid of submissionUuids) {
      await db.runAsync(
        `
          UPDATE omr_submissions

          SET
            batch_uuid = ?,
            sync_status = 'syncing',
            last_error = NULL,
            updated_at = ?

          WHERE submission_uuid = ?
            AND batch_uuid IS NULL
            AND sync_status != 'synced'
        `,
        [batchUuid, now, submissionUuid],
      );
    }
  });
}

export async function markOmrBatchDeferred(
  batchUuid: string,
  message: string,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `
      UPDATE omr_submissions

      SET
        sync_status = 'pending',
        last_error = ?,
        updated_at = ?

      WHERE batch_uuid = ?
        AND sync_status IN ('pending', 'syncing', 'failed')
    `,
    [message, new Date().toISOString(), batchUuid],
  );
}

export async function markOmrBatchFailed(
  batchUuid: string,
  errorMessage: string,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `
      UPDATE omr_submissions

      SET
        sync_status = 'failed',
        last_error = ?,
        updated_at = ?

      WHERE batch_uuid = ?
        AND sync_status IN ('pending', 'syncing', 'failed')
    `,
    [errorMessage, new Date().toISOString(), batchUuid],
  );
}

export async function markOmrSubmissionFailed(
  submissionUuid: string,
  errorMessage: string,
  serverStatus: string | null = null,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `
      UPDATE omr_submissions

      SET
        sync_status = 'failed',
        server_status = ?,
        last_error = ?,
        updated_at = ?

      WHERE submission_uuid = ?
        AND sync_status NOT IN ('synced', 'rejected')
    `,
    [serverStatus, errorMessage, new Date().toISOString(), submissionUuid],
  );
}

export async function markOmrSubmissionRejected(
  submissionUuid: string,
  errorMessage: string,
  serverStatus: string | null = null,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `
      UPDATE omr_submissions

      SET
        sync_status = 'rejected',
        server_status = ?,
        last_error = ?,
        updated_at = ?

      WHERE submission_uuid = ?
        AND sync_status != 'synced'
    `,
    [serverStatus, errorMessage, new Date().toISOString(), submissionUuid],
  );
}

export async function markOmrSubmissionSynced(
  submissionUuid: string,
  options: {
    serverStatus: string | null;
    finalScore: number | null;
    serverRequiresReview: boolean | null;
    isFlagged: boolean | null;
  },
): Promise<void> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<{
    crs_tst_id: number;
    std_id: number;
  }>(
    `
      SELECT crs_tst_id, std_id
      FROM omr_submissions
      WHERE submission_uuid = ?
      LIMIT 1
    `,
    [submissionUuid],
  );

  if (!row) {
    throw new Error(`Local OMR submission ${submissionUuid} was not found.`);
  }

  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `
        UPDATE omr_submissions

        SET
          sync_status = 'synced',
          server_status = ?,
          final_score = ?,
          server_requires_review = ?,
          is_flagged = ?,
          last_error = NULL,
          updated_at = ?,
          synced_at = ?

        WHERE submission_uuid = ?
      `,
      [
        options.serverStatus,
        options.finalScore,
        options.serverRequiresReview === null
          ? null
          : options.serverRequiresReview
            ? 1
            : 0,
        options.isFlagged === null ? null : options.isFlagged ? 1 : 0,
        now,
        now,
        submissionUuid,
      ],
    );

    await db.runAsync(
      `
        UPDATE course_test_results

        SET
          final_score = COALESCE(?, final_score),
          sync_status = 'synced',
          updated_at = ?,
          synced_at = ?

        WHERE crs_tst_id = ?
          AND std_id = ?
      `,
      [options.finalScore, now, now, row.crs_tst_id, row.std_id],
    );
  });
}

export async function getOmrSubmissionsForScanBatch(
  scanBatchUuid: string,
): Promise<ParsedLocalOmrSubmission[]> {
  const normalizedUuid = scanBatchUuid.trim();

  if (!normalizedUuid) {
    return [];
  }

  const db = await getDatabase();

  const rows = await db.getAllAsync<LocalOmrSubmission>(
    `
      SELECT
        ${SELECT_COLUMNS}

      FROM omr_submissions

      WHERE scan_batch_uuid = ?

      ORDER BY created_at ASC, submission_uuid ASC
    `,
    [normalizedUuid],
  );

  return rows.map(parseStoredSubmission);
}

export async function getOutstandingOmrSubmissionsForScanBatch(
  scanBatchUuid: string,
): Promise<ParsedLocalOmrSubmission[]> {
  const normalizedUuid = scanBatchUuid.trim();

  if (!normalizedUuid) {
    return [];
  }

  const db = await getDatabase();

  const rows = await db.getAllAsync<LocalOmrSubmission>(
    `
      SELECT
        ${SELECT_COLUMNS}

      FROM omr_submissions

      WHERE scan_batch_uuid = ?
        AND sync_status IN ('pending', 'failed', 'syncing')

      ORDER BY created_at ASC, submission_uuid ASC
    `,
    [normalizedUuid],
  );

  return rows.map(parseStoredSubmission);
}

/*
 * Remove & Rescan is allowed only for a true local draft:
 *
 * - pending locally;
 * - no server batch_uuid has ever been assigned;
 * - its faculty-facing scan batch is still draft.
 *
 * Ready and Needs Review scans follow the same rule. Once submission starts,
 * the stored evidence is frozen and must be retried instead of replaced.
 */
export async function removeDraftOmrSubmission(
  submissionUuid: string,
): Promise<{
  removed: boolean;
  scan_batch_uuid: string | null;
}> {
  const normalizedUuid = submissionUuid.trim();

  if (!normalizedUuid) {
    return {
      removed: false,
      scan_batch_uuid: null,
    };
  }

  const db = await getDatabase();

  const row = await db.getFirstAsync<{
    submission_uuid: string;
    scan_batch_uuid: string | null;
    crs_tst_id: number;
    std_id: number;
    sync_status: LocalOmrSubmissionSyncStatus;
    batch_uuid: string | null;
    scan_batch_status: string | null;
  }>(
    `
      SELECT
        os.submission_uuid,
        os.scan_batch_uuid,
        os.crs_tst_id,
        os.std_id,
        os.sync_status,
        os.batch_uuid,
        sb.status AS scan_batch_status

      FROM omr_submissions AS os

      LEFT JOIN scan_batches AS sb
        ON sb.scan_batch_uuid = os.scan_batch_uuid

      WHERE os.submission_uuid = ?
      LIMIT 1
    `,
    [normalizedUuid],
  );

  if (!row) {
    return {
      removed: false,
      scan_batch_uuid: null,
    };
  }

  const isSafeDraft =
    row.sync_status === "pending" &&
    row.batch_uuid === null &&
    row.scan_batch_uuid !== null &&
    row.scan_batch_status === "draft";

  if (!isSafeDraft) {
    throw new Error(
      "This scan can no longer be removed because submission to GradeLens has already started.",
    );
  }

  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `
        DELETE FROM omr_submissions

        WHERE submission_uuid = ?
          AND sync_status = 'pending'
          AND batch_uuid IS NULL
      `,
      [normalizedUuid],
    );

    await db.runAsync(
      `
        UPDATE course_test_results

        SET
          tentative_score = NULL,
          sync_status =
            CASE
              WHEN final_score IS NOT NULL THEN 'synced'
              ELSE 'not_scanned'
            END,
          updated_at = ?,
          synced_at =
            CASE
              WHEN final_score IS NOT NULL THEN synced_at
              ELSE NULL
            END

        WHERE crs_tst_id = ?
          AND std_id = ?
      `,
      [now, row.crs_tst_id, row.std_id],
    );
  });

  if (row.scan_batch_uuid) {
    await deleteEmptyDraftScanBatch(row.scan_batch_uuid);
  }

  return {
    removed: true,
    scan_batch_uuid: row.scan_batch_uuid,
  };
}

/*
 * Compatibility alias for older UI imports. The current rule is the same for
 * every safe local draft; it is no longer restricted to Needs Review scans.
 */
export async function removeLocalDraftOmrSubmission(
  submissionUuid: string,
): Promise<void> {
  const result = await removeDraftOmrSubmission(submissionUuid);

  if (!result.removed) {
    throw new Error("The local OMR scan was not found.");
  }
}

export async function countSyncedOmrSubmissions(): Promise<number> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<{ total: number }>(`
    SELECT COUNT(*) AS total
    FROM omr_submissions
    WHERE sync_status = 'synced'
  `);

  return row?.total ?? 0;
}
