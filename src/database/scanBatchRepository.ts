import { randomUUID } from "react-native-quick-crypto";

import { getDatabase } from "@/database/database";

export type LocalScanBatchStatus =
  | "draft"
  | "submitting"
  | "submitted"
  | "needs_attention";

export type LocalScanBatch = {
  scan_batch_uuid: string;

  crs_tst_id: number;
  tst_id: number;

  batch_number: number;

  status: LocalScanBatchStatus;

  created_at: string;
  updated_at: string;
  submitted_at: string | null;
};

export type LocalScanBatchSummary = LocalScanBatch & {
  course_test_title: string | null;
  course_code: string | null;
  course_title: string | null;

  submission_count: number;

  ready_count: number;
  review_count: number;
  attention_count: number;
  submitted_count: number;
};

function assertValidCourseTestIds(crsTstId: number, tstId: number): void {
  if (!Number.isInteger(crsTstId) || crsTstId <= 0) {
    throw new Error("A valid Course Test ID is required.");
  }

  if (!Number.isInteger(tstId) || tstId <= 0) {
    throw new Error("A valid Test ID is required.");
  }
}

export async function getOrCreateDraftScanBatch(
  crsTstId: number,
  tstId: number,
): Promise<LocalScanBatch> {
  assertValidCourseTestIds(crsTstId, tstId);

  const db = await getDatabase();

  const existing = await db.getFirstAsync<LocalScanBatch>(
    `
      SELECT
        scan_batch_uuid,
        crs_tst_id,
        tst_id,
        batch_number,
        status,
        created_at,
        updated_at,
        submitted_at

      FROM scan_batches

      WHERE crs_tst_id = ?
        AND status = 'draft'

      LIMIT 1
    `,
    [crsTstId],
  );

  if (existing) {
    if (existing.tst_id !== tstId) {
      throw new Error(
        `Draft scan batch test mismatch for Course Test ${crsTstId}.`,
      );
    }

    return existing;
  }

  const nextNumberRow = await db.getFirstAsync<{
    next_number: number;
  }>(
    `
      SELECT
        COALESCE(MAX(batch_number), 0) + 1 AS next_number

      FROM scan_batches

      WHERE crs_tst_id = ?
    `,
    [crsTstId],
  );

  const now = new Date().toISOString();

  const batch: LocalScanBatch = {
    scan_batch_uuid: randomUUID(),

    crs_tst_id: crsTstId,
    tst_id: tstId,

    batch_number: nextNumberRow?.next_number ?? 1,

    status: "draft",

    created_at: now,
    updated_at: now,
    submitted_at: null,
  };

  await db.runAsync(
    `
      INSERT INTO scan_batches (
        scan_batch_uuid,

        crs_tst_id,
        tst_id,

        batch_number,

        status,

        created_at,
        updated_at,
        submitted_at
      )

      VALUES (
        ?,

        ?,
        ?,

        ?,

        'draft',

        ?,
        ?,
        NULL
      )
    `,
    [
      batch.scan_batch_uuid,

      batch.crs_tst_id,
      batch.tst_id,

      batch.batch_number,

      batch.created_at,
      batch.updated_at,
    ],
  );

  return batch;
}

export async function getScanBatchByUuid(
  scanBatchUuid: string,
): Promise<LocalScanBatchSummary | null> {
  const normalizedUuid = scanBatchUuid.trim();

  if (!normalizedUuid) {
    return null;
  }

  const db = await getDatabase();

  return await db.getFirstAsync<LocalScanBatchSummary>(
    `
      SELECT
        sb.scan_batch_uuid,

        sb.crs_tst_id,
        sb.tst_id,

        sb.batch_number,

        sb.status,

        sb.created_at,
        sb.updated_at,
        sb.submitted_at,

        ct.title AS course_test_title,

        c.code AS course_code,
        c.title AS course_title,

        COUNT(os.submission_uuid) AS submission_count,

        COALESCE(
          SUM(
            CASE
              WHEN os.sync_status IN ('pending', 'syncing')
                AND os.requires_review = 0
                THEN 1
              ELSE 0
            END
          ),
          0
        ) AS ready_count,

        COALESCE(
          SUM(
            CASE
              WHEN os.sync_status IN ('pending', 'syncing')
                AND os.requires_review = 1
                THEN 1
              ELSE 0
            END
          ),
          0
        ) AS review_count,

        COALESCE(
          SUM(
            CASE
              WHEN os.sync_status = 'failed'
                THEN 1
              ELSE 0
            END
          ),
          0
        ) AS attention_count,

        COALESCE(
          SUM(
            CASE
              WHEN os.sync_status = 'synced'
                THEN 1
              ELSE 0
            END
          ),
          0
        ) AS submitted_count

      FROM scan_batches AS sb

      LEFT JOIN course_tests AS ct
        ON ct.crs_tst_id = sb.crs_tst_id

      LEFT JOIN courses AS c
        ON c.crs_id = ct.crs_id

      LEFT JOIN omr_submissions AS os
        ON os.scan_batch_uuid = sb.scan_batch_uuid

      WHERE sb.scan_batch_uuid = ?

      GROUP BY
        sb.scan_batch_uuid,
        sb.crs_tst_id,
        sb.tst_id,
        sb.batch_number,
        sb.status,
        sb.created_at,
        sb.updated_at,
        sb.submitted_at,
        ct.title,
        c.code,
        c.title

      LIMIT 1
    `,
    [normalizedUuid],
  );
}

export async function getScanBatches(): Promise<LocalScanBatchSummary[]> {
  const db = await getDatabase();

  return await db.getAllAsync<LocalScanBatchSummary>(
    `
      SELECT
        sb.scan_batch_uuid,

        sb.crs_tst_id,
        sb.tst_id,

        sb.batch_number,

        sb.status,

        sb.created_at,
        sb.updated_at,
        sb.submitted_at,

        ct.title AS course_test_title,

        c.code AS course_code,
        c.title AS course_title,

        COUNT(os.submission_uuid) AS submission_count,

        COALESCE(
          SUM(
            CASE
              WHEN os.sync_status IN ('pending', 'syncing')
                AND os.requires_review = 0
                THEN 1
              ELSE 0
            END
          ),
          0
        ) AS ready_count,

        COALESCE(
          SUM(
            CASE
              WHEN os.sync_status IN ('pending', 'syncing')
                AND os.requires_review = 1
                THEN 1
              ELSE 0
            END
          ),
          0
        ) AS review_count,

        COALESCE(
          SUM(
            CASE
              WHEN os.sync_status = 'failed'
                THEN 1
              ELSE 0
            END
          ),
          0
        ) AS attention_count,

        COALESCE(
          SUM(
            CASE
              WHEN os.sync_status = 'synced'
                THEN 1
              ELSE 0
            END
          ),
          0
        ) AS submitted_count

      FROM scan_batches AS sb

      LEFT JOIN course_tests AS ct
        ON ct.crs_tst_id = sb.crs_tst_id

      LEFT JOIN courses AS c
        ON c.crs_id = ct.crs_id

      LEFT JOIN omr_submissions AS os
        ON os.scan_batch_uuid = sb.scan_batch_uuid

      GROUP BY
        sb.scan_batch_uuid,
        sb.crs_tst_id,
        sb.tst_id,
        sb.batch_number,
        sb.status,
        sb.created_at,
        sb.updated_at,
        sb.submitted_at,
        ct.title,
        c.code,
        c.title

      ORDER BY
        sb.created_at DESC,
        sb.batch_number DESC
    `,
  );
}

export async function markScanBatchStatus(
  scanBatchUuid: string,
  status: LocalScanBatchStatus,
): Promise<void> {
  const db = await getDatabase();

  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE scan_batches

      SET
        status = ?,
        updated_at = ?,

        submitted_at =
          CASE
            WHEN ? = 'submitted'
              THEN COALESCE(submitted_at, ?)

            ELSE submitted_at
          END

      WHERE scan_batch_uuid = ?
    `,
    [status, now, status, now, scanBatchUuid],
  );
}

export async function refreshScanBatchStatus(
  scanBatchUuid: string,
): Promise<LocalScanBatchStatus | null> {
  const db = await getDatabase();

  const counts = await db.getFirstAsync<{
    total: number;
    synced: number;
    assigned_to_server_batch: number;
  }>(
    `
      SELECT
        COUNT(*) AS total,

        COALESCE(
          SUM(
            CASE
              WHEN sync_status = 'synced'
                THEN 1
              ELSE 0
            END
          ),
          0
        ) AS synced,

        COALESCE(
          SUM(
            CASE
              WHEN batch_uuid IS NOT NULL
                THEN 1
              ELSE 0
            END
          ),
          0
        ) AS assigned_to_server_batch

      FROM omr_submissions

      WHERE scan_batch_uuid = ?
    `,
    [scanBatchUuid],
  );

  if (!counts || counts.total <= 0) {
    return null;
  }

  let nextStatus: LocalScanBatchStatus;

  if (counts.synced === counts.total) {
    nextStatus = "submitted";
  } else if (counts.assigned_to_server_batch > 0) {
    nextStatus = "needs_attention";
  } else {
    nextStatus = "draft";
  }

  await markScanBatchStatus(scanBatchUuid, nextStatus);

  return nextStatus;
}

export async function deleteEmptyDraftScanBatch(
  scanBatchUuid: string,
): Promise<boolean> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<{
    status: LocalScanBatchStatus;
    submission_count: number;
  }>(
    `
      SELECT
        sb.status,

        COUNT(os.submission_uuid) AS submission_count

      FROM scan_batches AS sb

      LEFT JOIN omr_submissions AS os
        ON os.scan_batch_uuid = sb.scan_batch_uuid

      WHERE sb.scan_batch_uuid = ?

      GROUP BY sb.scan_batch_uuid, sb.status

      LIMIT 1
    `,
    [scanBatchUuid],
  );

  if (!row || row.status !== "draft" || row.submission_count > 0) {
    return false;
  }

  const result = await db.runAsync(
    `
      DELETE FROM scan_batches

      WHERE scan_batch_uuid = ?
        AND status = 'draft'
    `,
    [scanBatchUuid],
  );

  return result.changes > 0;
}
