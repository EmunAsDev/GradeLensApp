import { getDatabase } from "@/database/database";

export type HomeRecentBatch = {
  scan_batch_uuid: string;
  crs_tst_id: number;
  batch_number: number;
  status: "draft" | "submitting" | "submitted" | "needs_attention";
  created_at: string;

  course_code: string | null;
  course_test_title: string | null;

  submission_count: number;
  ready_count: number;
  review_count: number;
  failed_count: number;
  synced_count: number;
};

export type HomeUpcomingTest = {
  crs_tst_id: number;
  crs_id: number;
  title: string | null;
  deadline: string;
  question_count: number | null;

  course_code: string | null;
  course_title: string | null;
};

export type HomeDashboardSummary = {
  course_count: number;
  test_count: number;

  waiting_count: number;
  review_count: number;
  failed_count: number;

  latest_batch: HomeRecentBatch | null;
  upcoming_test: HomeUpcomingTest | null;

  last_successful_sync_at: string | null;
};

export async function getHomeDashboardSummary(
  employeeId: number | null,
): Promise<HomeDashboardSummary> {
  const db = await getDatabase();

  const [courseCountRow, testCountRow, queueRow, latestBatch, upcomingTest] =
    await Promise.all([
      db.getFirstAsync<{ total: number }>(`
        SELECT COUNT(*) AS total
        FROM courses
      `),

      db.getFirstAsync<{ total: number }>(`
        SELECT COUNT(*) AS total
        FROM course_tests
      `),

      db.getFirstAsync<{
        waiting_count: number;
        review_count: number;
        failed_count: number;
      }>(`
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN sync_status IN ('pending', 'syncing', 'failed')
                  THEN 1
                ELSE 0
              END
            ),
            0
          ) AS waiting_count,

          COALESCE(
            SUM(
              CASE
                WHEN requires_review = 1
                  AND sync_status IN ('pending', 'syncing')
                  THEN 1
                ELSE 0
              END
            ),
            0
          ) AS review_count,

          COALESCE(
            SUM(
              CASE
                WHEN sync_status = 'failed'
                  THEN 1
                ELSE 0
              END
            ),
            0
          ) AS failed_count

        FROM omr_submissions
      `),

      db.getFirstAsync<HomeRecentBatch>(`
        SELECT
          sb.scan_batch_uuid,
          sb.crs_tst_id,
          sb.batch_number,
          sb.status,
          sb.created_at,

          c.code AS course_code,
          ct.title AS course_test_title,

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
          ) AS failed_count,

          COALESCE(
            SUM(
              CASE
                WHEN os.sync_status = 'synced'
                  THEN 1
                ELSE 0
              END
            ),
            0
          ) AS synced_count

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
          sb.batch_number,
          sb.status,
          sb.created_at,
          c.code,
          ct.title

        ORDER BY sb.created_at DESC
        LIMIT 1
      `),

      db.getFirstAsync<HomeUpcomingTest>(`
        SELECT
          ct.crs_tst_id,
          ct.crs_id,
          ct.title,
          ct.deadline,
          ct.question_count,

          c.code AS course_code,
          c.title AS course_title

        FROM course_tests AS ct

        LEFT JOIN courses AS c
          ON c.crs_id = ct.crs_id

        WHERE ct.deadline IS NOT NULL
          AND TRIM(ct.deadline) != ''
          AND datetime(ct.deadline) >= datetime('now')

        ORDER BY datetime(ct.deadline) ASC
        LIMIT 1
      `),
    ]);

  let lastSuccessfulSyncAt: string | null = null;

  if (employeeId !== null && Number.isFinite(employeeId)) {
    const syncRow = await db.getFirstAsync<{
      last_successful_sync_at: string | null;
    }>(
      `
        SELECT MAX(last_success_at) AS last_successful_sync_at
        FROM sync_metadata
        WHERE employee_id = ?
      `,
      [employeeId],
    );

    lastSuccessfulSyncAt = syncRow?.last_successful_sync_at ?? null;
  }

  return {
    course_count: courseCountRow?.total ?? 0,
    test_count: testCountRow?.total ?? 0,

    waiting_count: queueRow?.waiting_count ?? 0,
    review_count: queueRow?.review_count ?? 0,
    failed_count: queueRow?.failed_count ?? 0,

    latest_batch: latestBatch ?? null,
    upcoming_test: upcomingTest ?? null,

    last_successful_sync_at: lastSuccessfulSyncAt,
  };
}
