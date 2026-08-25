import { getDatabase } from "@/database/database";

export type ApiCourseTest = {
  crs_tst_id: number;
  crs_id: number;
  tst_id: number;
  title: string | null;
  deadline: string | null;
  duration: number | null;
  is_paper_only: boolean;
};

export type LocalCourseTest = {
  crs_tst_id: number;
  crs_id: number;
  tst_id: number;
  title: string | null;
  deadline: string | null;
  duration: number | null;
  is_paper_only: number;

  question_count: number | null;

  omr_package_path: string | null;
  omr_iv: string | null;
  omr_tag: string | null;
  omr_wrapped_key: string | null;
  omr_content_algorithm: string | null;
  omr_key_algorithm: string | null;
  omr_synced_at: string | null;

  synced_at: string | null;
};

export async function saveCourseTests(
  courseTests: ApiCourseTest[],
): Promise<void> {
  const db = await getDatabase();

  const syncedAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    for (const courseTest of courseTests) {
      await db.runAsync(
        `
                        INSERT INTO course_tests (
                            crs_tst_id,
                            crs_id,
                            tst_id,
                            title,
                            deadline,
                            duration,
                            is_paper_only,
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
                            ?
                        )
                        ON CONFLICT(crs_tst_id)
                        DO UPDATE SET
                            crs_id = excluded.crs_id,
                            tst_id = excluded.tst_id,
                            title = excluded.title,
                            deadline = excluded.deadline,
                            duration = excluded.duration,
                            is_paper_only = excluded.is_paper_only,
                            synced_at = excluded.synced_at
                    `,
        [
          courseTest.crs_tst_id,
          courseTest.crs_id,
          courseTest.tst_id,
          courseTest.title,
          courseTest.deadline,
          courseTest.duration,
          courseTest.is_paper_only ? 1 : 0,
          syncedAt,
        ],
      );
    }
  });
}

export async function getCourseTests(
  courseId: number,
): Promise<LocalCourseTest[]> {
  const db = await getDatabase();

  return await db.getAllAsync<LocalCourseTest>(
    `
            SELECT
                crs_tst_id,
                crs_id,
                tst_id,
                title,
                deadline,
                duration,
                is_paper_only,

                question_count,

                omr_package_path,
                omr_iv,
                omr_tag,
                omr_wrapped_key,
                omr_content_algorithm,
                omr_key_algorithm,
                omr_synced_at,

                synced_at

            FROM course_tests

            WHERE crs_id = ?

            ORDER BY crs_tst_id DESC
        `,
    [courseId],
  );
}

export type OmrPackageMetadata = {
  crs_tst_id: number;

  question_count: number;

  omr_package_path: string;

  omr_iv: string;
  omr_tag: string;
  omr_wrapped_key: string;

  omr_content_algorithm: string;
  omr_key_algorithm: string;

  omr_synced_at: string;
};

export async function saveOmrPackageMetadata(
  metadata: OmrPackageMetadata,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `
            UPDATE course_tests

            SET
                question_count = ?,
                omr_package_path = ?,
                omr_iv = ?,
                omr_tag = ?,
                omr_wrapped_key = ?,
                omr_content_algorithm = ?,
                omr_key_algorithm = ?,
                omr_synced_at = ?

            WHERE crs_tst_id = ?
        `,
    [
      metadata.question_count,
      metadata.omr_package_path,
      metadata.omr_iv,
      metadata.omr_tag,
      metadata.omr_wrapped_key,
      metadata.omr_content_algorithm,
      metadata.omr_key_algorithm,
      metadata.omr_synced_at,
      metadata.crs_tst_id,
    ],
  );
}

export async function getAllCourseTests(): Promise<LocalCourseTest[]> {
  const db = await getDatabase();

  return await db.getAllAsync<LocalCourseTest>(
    `
            SELECT
                crs_tst_id,
                crs_id,
                tst_id,
                title,
                deadline,
                duration,
                is_paper_only,

                question_count,

                omr_package_path,
                omr_iv,
                omr_tag,
                omr_wrapped_key,
                omr_content_algorithm,
                omr_key_algorithm,
                omr_synced_at,

                synced_at

            FROM course_tests

            ORDER BY crs_tst_id DESC
        `,
  );
}

export async function getCourseTest(
  courseTestId: number,
): Promise<LocalCourseTest | null> {
  const db = await getDatabase();

  return await db.getFirstAsync<LocalCourseTest>(
    `
            SELECT
                crs_tst_id,
                crs_id,
                tst_id,
                title,
                deadline,
                duration,
                is_paper_only,

                question_count,

                omr_package_path,
                omr_iv,
                omr_tag,
                omr_wrapped_key,
                omr_content_algorithm,
                omr_key_algorithm,
                omr_synced_at,

                synced_at

            FROM course_tests

            WHERE crs_tst_id = ?

            LIMIT 1
        `,
    [courseTestId],
  );
}
