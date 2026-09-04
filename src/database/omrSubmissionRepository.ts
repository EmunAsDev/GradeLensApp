import { getDatabase } from "@/database/database";

import type {
  OmrQuestionCount,
  OmrSheetFormat,
  OmrSubmissionPayload,
} from "@/../modules/gradelens-omr/submission";

export type LocalOmrSubmissionSyncStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "failed";

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

  batch_uuid: string | null;

  sync_status: LocalOmrSubmissionSyncStatus;
  server_status: string | null;
  final_score: number | null;

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
> & {
  answers: OmrSubmissionPayload["answers"];
  questions: OmrSubmissionPayload["questions"];
  review_question_numbers: OmrSubmissionPayload["review_question_numbers"];
  counts: OmrSubmissionPayload["counts"];
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

export async function savePendingOmrSubmission(
  input: SavePendingOmrSubmissionInput,
): Promise<void> {
  validatePendingSubmission(input);

  const db = await getDatabase();

  const now = new Date().toISOString();
  const capturedAt = input.captured_at ?? now;

  const studentIdNo = input.student_id_no.trim();

  const answersJson = JSON.stringify(input.payload.answers);
  const questionsJson = JSON.stringify(input.payload.questions);
  const reviewQuestionNumbersJson = JSON.stringify(
    input.payload.review_question_numbers,
  );
  const countsJson = JSON.stringify(input.payload.counts);

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

          batch_uuid,

          sync_status,
          server_status,
          final_score,

          last_error,

          captured_at,
          created_at,
          updated_at,
          synced_at
        )

        VALUES (
          ?,
          ?,

          ?,
          ?,

          ?,
          ?,

          ?,
          ?,

          ?,
          ?,
          ?,
          ?,

          ?,

          NULL,

          'pending',
          NULL,
          NULL,

          NULL,

          ?,
          ?,
          ?,
          NULL
        )

        ON CONFLICT(submission_uuid)
        DO UPDATE SET
          sheet_uuid = excluded.sheet_uuid,
          crs_tst_id = excluded.crs_tst_id,
          tst_id = excluded.tst_id,

          std_id = excluded.std_id,
          student_id_no = excluded.student_id_no,

          format = excluded.format,
          question_count = excluded.question_count,

          answers_json = excluded.answers_json,
          questions_json = excluded.questions_json,
          review_question_numbers_json =
            excluded.review_question_numbers_json,
          counts_json = excluded.counts_json,

          tentative_score = excluded.tentative_score,

          sync_status =
            CASE
              WHEN omr_submissions.sync_status = 'synced'
                THEN 'synced'

              ELSE 'pending'
            END,

          server_status =
            CASE
              WHEN omr_submissions.sync_status = 'synced'
                THEN omr_submissions.server_status

              ELSE NULL
            END,

          final_score =
            CASE
              WHEN omr_submissions.sync_status = 'synced'
                THEN omr_submissions.final_score

              ELSE NULL
            END,

          last_error = NULL,

          captured_at = excluded.captured_at,
          updated_at = excluded.updated_at,

          synced_at =
            CASE
              WHEN omr_submissions.sync_status = 'synced'
                THEN omr_submissions.synced_at

              ELSE NULL
            END
      `,
      [
        input.submission_uuid.trim(),
        input.sheet_uuid.trim(),

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

        VALUES (
          ?,
          ?,

          ?,
          NULL,

          'pending',

          ?,
          NULL
        )

        ON CONFLICT(
          crs_tst_id,
          std_id
        )

        DO UPDATE SET
          tentative_score = excluded.tentative_score,

          sync_status =
            CASE
              WHEN course_test_results.final_score IS NOT NULL
                THEN 'synced'

              ELSE 'pending'
            END,

          updated_at = excluded.updated_at
      `,
      [input.crs_tst_id, input.std_id, input.tentative_score, now],
    );
  });
}

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

    batch_uuid: row.batch_uuid,

    sync_status: row.sync_status,
    server_status: row.server_status,
    final_score: row.final_score,

    last_error: row.last_error,

    captured_at: row.captured_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    synced_at: row.synced_at,
  };
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

  batch_uuid,

  sync_status,
  server_status,
  final_score,

  last_error,

  captured_at,
  created_at,
  updated_at,
  synced_at
`;

export async function getPendingOmrSubmissions(): Promise<
  ParsedLocalOmrSubmission[]
> {
  const db = await getDatabase();

  const rows = await db.getAllAsync<LocalOmrSubmission>(
    `
      SELECT
        ${SELECT_COLUMNS}

      FROM omr_submissions

      WHERE sync_status IN (
        'pending',
        'failed',
        'syncing'
      )

      ORDER BY created_at ASC
    `,
  );

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

export async function countPendingOmrSubmissions(): Promise<number> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<{
    total: number;
  }>(
    `
      SELECT COUNT(*) AS total

      FROM omr_submissions

      WHERE sync_status IN (
        'pending',
        'failed',
        'syncing'
      )
    `,
  );

  return row?.total ?? 0;
}

/*
 * Assign a persistent batch UUID before the network call.
 *
 * If the connection dies after Laravel processed the request, the mobile can
 * retry with the SAME batch UUID instead of creating a different batch.
 */
export async function assignOmrBatchUuid(
  submissionUuids: string[],
  batchUuid: string,
): Promise<void> {
  if (submissionUuids.length === 0) {
    return;
  }

  const db = await getDatabase();

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
            AND sync_status != 'synced'
        `,
        [batchUuid, new Date().toISOString(), submissionUuid],
      );
    }
  });
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
        AND sync_status != 'synced'
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
    `,
    [serverStatus, errorMessage, new Date().toISOString(), submissionUuid],
  );
}

export async function markOmrSubmissionSynced(
  submissionUuid: string,
  options: {
    serverStatus: string | null;
    finalScore: number | null;
  },
): Promise<void> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<{
    crs_tst_id: number;
    std_id: number;
  }>(
    `
      SELECT
        crs_tst_id,
        std_id

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
          last_error = NULL,
          updated_at = ?,
          synced_at = ?

        WHERE submission_uuid = ?
      `,
      [options.serverStatus, options.finalScore, now, now, submissionUuid],
    );

    if (options.finalScore !== null) {
      await db.runAsync(
        `
          UPDATE course_test_results

          SET
            final_score = ?,
            sync_status = 'synced',
            updated_at = ?,
            synced_at = ?

          WHERE crs_tst_id = ?
            AND std_id = ?
        `,
        [options.finalScore, now, now, row.crs_tst_id, row.std_id],
      );
    }
  });
}
