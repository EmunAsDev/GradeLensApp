import * as SQLite from "expo-sqlite";

const DATABASE_NAME = "gradelens.db";

let database: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) {
    return database;
  }

  database = await SQLite.openDatabaseAsync(DATABASE_NAME);

  return database;
}

export async function initializeDatabase(): Promise<void> {
  const db = await getDatabase();

  await db.execAsync(`
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS courses (
            crs_id INTEGER PRIMARY KEY NOT NULL,
            branch_id INTEGER,
            code TEXT,
            title TEXT,
            description TEXT,
            unit TEXT,
            department TEXT,
            program TEXT,
            year TEXT,
            section TEXT,
            school_year TEXT,
            semester TEXT,
            term TEXT,
            room TEXT,
            time TEXT,
            synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS course_tests (
            crs_tst_id INTEGER PRIMARY KEY NOT NULL,
            crs_id INTEGER NOT NULL,
            tst_id INTEGER NOT NULL,

            title TEXT,
            deadline TEXT,
            duration INTEGER,

            is_paper_only INTEGER NOT NULL DEFAULT 0,

            question_count INTEGER,

            omr_package_path TEXT,
            omr_iv TEXT,
            omr_tag TEXT,
            omr_wrapped_key TEXT,
            omr_content_algorithm TEXT,
            omr_key_algorithm TEXT,
            omr_synced_at TEXT,

            synced_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_course_tests_crs_id
        ON course_tests(crs_id);

        CREATE TABLE IF NOT EXISTS course_students (
            std_id INTEGER NOT NULL,
            crs_id INTEGER NOT NULL,

            student_id_no TEXT,
            name TEXT,

            synced_at TEXT,

            PRIMARY KEY (
                std_id,
                crs_id
            )
        );

        CREATE INDEX IF NOT EXISTS idx_course_students_crs_id
        ON course_students(crs_id);

        CREATE TABLE IF NOT EXISTS course_test_results (
            crs_tst_id INTEGER NOT NULL,
            std_id INTEGER NOT NULL,

            tentative_score REAL,
            final_score REAL,

            sync_status TEXT NOT NULL DEFAULT 'not_scanned',

            updated_at TEXT,
            synced_at TEXT,

            PRIMARY KEY (
                crs_tst_id,
                std_id
            )
        );

        CREATE INDEX IF NOT EXISTS idx_course_test_results_crs_tst_id
        ON course_test_results(crs_tst_id);

        CREATE TABLE IF NOT EXISTS omr_submissions (
            submission_uuid TEXT PRIMARY KEY NOT NULL,

            sheet_uuid TEXT NOT NULL UNIQUE,

            crs_tst_id INTEGER NOT NULL,
            tst_id INTEGER NOT NULL,

            std_id INTEGER NOT NULL,
            student_id_no TEXT NOT NULL,

            format TEXT NOT NULL,
            question_count INTEGER NOT NULL,

            answers_json TEXT NOT NULL,
            questions_json TEXT NOT NULL,
            review_question_numbers_json TEXT NOT NULL,
            counts_json TEXT NOT NULL,

            tentative_score REAL NOT NULL,

            batch_uuid TEXT,

            sync_status TEXT NOT NULL DEFAULT 'pending',
            server_status TEXT,
            final_score REAL,

            last_error TEXT,

            captured_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            synced_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_omr_submissions_sync_status
        ON omr_submissions(sync_status);

        CREATE INDEX IF NOT EXISTS idx_omr_submissions_crs_tst_id
        ON omr_submissions(crs_tst_id);

        CREATE INDEX IF NOT EXISTS idx_omr_submissions_student
        ON omr_submissions(crs_tst_id, std_id);
    `);

  /*
    |--------------------------------------------------------------------------
    | Upgrade Older Development Database
    |--------------------------------------------------------------------------
    */

  const courseTestColumns = await db.getAllAsync<{
    name: string;
  }>(`PRAGMA table_info(course_tests)`);

  const existingColumns = new Set(
    courseTestColumns.map((column) => column.name),
  );

  const additions: Array<{
    name: string;
    sql: string;
  }> = [
    {
      name: "question_count",

      sql: "ALTER TABLE course_tests ADD COLUMN question_count INTEGER",
    },

    {
      name: "omr_package_path",

      sql: "ALTER TABLE course_tests ADD COLUMN omr_package_path TEXT",
    },

    {
      name: "omr_iv",

      sql: "ALTER TABLE course_tests ADD COLUMN omr_iv TEXT",
    },

    {
      name: "omr_tag",

      sql: "ALTER TABLE course_tests ADD COLUMN omr_tag TEXT",
    },

    {
      name: "omr_wrapped_key",

      sql: "ALTER TABLE course_tests ADD COLUMN omr_wrapped_key TEXT",
    },

    {
      name: "omr_content_algorithm",

      sql: "ALTER TABLE course_tests ADD COLUMN omr_content_algorithm TEXT",
    },

    {
      name: "omr_key_algorithm",

      sql: "ALTER TABLE course_tests ADD COLUMN omr_key_algorithm TEXT",
    },

    {
      name: "omr_synced_at",

      sql: "ALTER TABLE course_tests ADD COLUMN omr_synced_at TEXT",
    },
  ];

  for (const addition of additions) {
    if (existingColumns.has(addition.name)) {
      continue;
    }

    await db.execAsync(addition.sql);
  }

  /*
    |--------------------------------------------------------------------------
    | Upgrade OMR Submission Queue
    |--------------------------------------------------------------------------
    |
    | These columns were introduced after the first local pending-submission
    | checkpoint. Existing development databases must be upgraded in place.
    */

  const omrSubmissionColumns = await db.getAllAsync<{
    name: string;
  }>(`PRAGMA table_info(omr_submissions)`);

  const existingOmrSubmissionColumns = new Set(
    omrSubmissionColumns.map((column) => column.name),
  );

  const omrSubmissionAdditions: Array<{
    name: string;
    sql: string;
  }> = [
    {
      name: "batch_uuid",
      sql: "ALTER TABLE omr_submissions ADD COLUMN batch_uuid TEXT",
    },
    {
      name: "server_status",
      sql: "ALTER TABLE omr_submissions ADD COLUMN server_status TEXT",
    },
    {
      name: "final_score",
      sql: "ALTER TABLE omr_submissions ADD COLUMN final_score REAL",
    },
    {
      name: "captured_at",
      sql: "ALTER TABLE omr_submissions ADD COLUMN captured_at TEXT",
    },
  ];

  for (const addition of omrSubmissionAdditions) {
    if (existingOmrSubmissionColumns.has(addition.name)) {
      continue;
    }

    await db.execAsync(addition.sql);
  }

  /*
   * Backfill captured_at for rows created by the previous checkpoint.
   */
  await db.runAsync(
    `
      UPDATE omr_submissions

      SET captured_at = created_at

      WHERE captured_at IS NULL
    `,
  );

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_omr_submissions_batch_uuid
    ON omr_submissions(batch_uuid);
  `);
}
