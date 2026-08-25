import { getDatabase } from "@/database/database";

export type ApiCourseTestStudent = {
  std_id: number;

  student_id_no: string | null;

  name: string | null;

  final_score: number | null;
};

export type LocalCourseTestStudent = {
  std_id: number;
  crs_id: number;

  student_id_no: string | null;

  name: string | null;

  tentative_score: number | null;

  final_score: number | null;

  sync_status: string;

  student_synced_at: string | null;

  result_synced_at: string | null;
};

export async function saveCourseTestStudents(
  courseId: number,
  courseTestId: number,
  students: ApiCourseTestStudent[],
): Promise<void> {
  const db = await getDatabase();

  const syncedAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    for (const student of students) {
      /*
                |--------------------------------------------------------------------------
                | Student Roster
                |--------------------------------------------------------------------------
                */

      await db.runAsync(
        `
                        INSERT INTO course_students (
                            std_id,
                            crs_id,
                            student_id_no,
                            name,
                            synced_at
                        )
                        VALUES (
                            ?,
                            ?,
                            ?,
                            ?,
                            ?
                        )

                        ON CONFLICT(
                            std_id,
                            crs_id
                        )

                        DO UPDATE SET
                            student_id_no =
                                excluded.student_id_no,

                            name =
                                excluded.name,

                            synced_at =
                                excluded.synced_at
                    `,
        [
          student.std_id,
          courseId,
          student.student_id_no,
          student.name,
          syncedAt,
        ],
      );

      /*
                |--------------------------------------------------------------------------
                | Course Test Result
                |--------------------------------------------------------------------------
                |
                | Laravel owns final_score.
                |
                | Mobile owns tentative_score.
                |
                | Therefore server synchronization must NEVER overwrite
                | tentative_score.
                |
                */

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

                            NULL,
                            ?,

                            ?,

                            ?,
                            ?
                        )

                        ON CONFLICT(
                            crs_tst_id,
                            std_id
                        )

                        DO UPDATE SET
                            final_score =
                                excluded.final_score,

                            sync_status =
                                CASE
                                    WHEN excluded.final_score IS NOT NULL
                                        THEN 'synced'

                                    ELSE course_test_results.sync_status
                                END,

                            synced_at =
                                excluded.synced_at
                    `,
        [
          courseTestId,
          student.std_id,

          student.final_score,

          student.final_score !== null ? "synced" : "not_scanned",

          syncedAt,
          syncedAt,
        ],
      );
    }
  });
}

export async function getCourseTestStudents(
  courseTestId: number,
  courseId: number,
): Promise<LocalCourseTestStudent[]> {
  const db = await getDatabase();

  return await db.getAllAsync<LocalCourseTestStudent>(
    `
            SELECT
                students.std_id,
                students.crs_id,

                students.student_id_no,
                students.name,

                results.tentative_score,
                results.final_score,

                COALESCE(
                    results.sync_status,
                    'not_scanned'
                ) AS sync_status,

                students.synced_at
                    AS student_synced_at,

                results.synced_at
                    AS result_synced_at

            FROM course_students AS students

            LEFT JOIN course_test_results AS results
                ON results.std_id =
                    students.std_id

                AND results.crs_tst_id =
                    ?

            WHERE students.crs_id =
                ?

            ORDER BY
                students.name ASC
        `,
    [courseTestId, courseId],
  );
}
