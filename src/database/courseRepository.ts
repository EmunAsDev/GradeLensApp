import { getDatabase } from "../database/database";

export type LocalCourse = {
  crs_id: number;
  branch_id: number | null;
  code: string | null;
  title: string | null;
  description: string | null;
  unit: string | null;
  department: string | null;
  program: string | null;
  year: string | null;
  section: string | null;
  school_year: string | null;
  semester: string | null;
  term: string | null;
  room: string | null;
  time: string | null;
  synced_at: string | null;
};

export type ApiCourse = {
  crs_id: number;
  branch_id: number | null;
  code: string | null;
  title: string | null;
  description: string | null;
  unit: string | null;
  department: string | null;
  program: string | null;
  year: string | null;
  section: string | null;
  school_year: string | null;
  semester: string | null;
  term: string | null;
  room: string | null;
  time: string | null;
};

export async function saveCourses(courses: ApiCourse[]): Promise<void> {
  const db = await getDatabase();

  const syncedAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    for (const course of courses) {
      await db.runAsync(
        `
                        INSERT INTO courses (
                            crs_id,
                            branch_id,
                            code,
                            title,
                            description,
                            unit,
                            department,
                            program,
                            year,
                            section,
                            school_year,
                            semester,
                            term,
                            room,
                            time,
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
                            ?,
                            ?,
                            ?
                        )
                        ON CONFLICT(crs_id)
                        DO UPDATE SET
                            branch_id = excluded.branch_id,
                            code = excluded.code,
                            title = excluded.title,
                            description = excluded.description,
                            unit = excluded.unit,
                            department = excluded.department,
                            program = excluded.program,
                            year = excluded.year,
                            section = excluded.section,
                            school_year = excluded.school_year,
                            semester = excluded.semester,
                            term = excluded.term,
                            room = excluded.room,
                            time = excluded.time,
                            synced_at = excluded.synced_at
                    `,
        [
          course.crs_id,
          course.branch_id,
          course.code,
          course.title,
          course.description,
          course.unit,
          course.department,
          course.program,
          course.year,
          course.section,
          course.school_year,
          course.semester,
          course.term,
          course.room,
          course.time,
          syncedAt,
        ],
      );
    }
  });
}

export async function getCourses(): Promise<LocalCourse[]> {
  const db = await getDatabase();

  return await db.getAllAsync<LocalCourse>(
    `
            SELECT
                crs_id,
                branch_id,
                code,
                title,
                description,
                unit,
                department,
                program,
                year,
                section,
                school_year,
                semester,
                term,
                room,
                time,
                synced_at
            FROM courses
            ORDER BY code ASC
        `,
  );
}
