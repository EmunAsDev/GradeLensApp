import * as SQLite from "expo-sqlite";

const DATABASE_PREFIX = "gradelens_emp_";
const DATABASE_SUFFIX = ".db";

let database: SQLite.SQLiteDatabase | null = null;
let activeEmployeeId: number | null = null;

/*
|--------------------------------------------------------------------------
| Database Operation Queue
|--------------------------------------------------------------------------
|
| Prevent overlapping initialization, account switching, and reset
| operations from changing the active database unexpectedly.
|
*/

let databaseOperation: Promise<void> = Promise.resolve();

function enqueueDatabaseOperation<T>(operation: () => Promise<T>): Promise<T> {
  const nextOperation = databaseOperation.then(operation, operation);

  databaseOperation = nextOperation.then(
    () => undefined,
    () => undefined,
  );

  return nextOperation;
}

/*
|--------------------------------------------------------------------------
| Employee Database Helpers
|--------------------------------------------------------------------------
*/

function isValidEmployeeId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function assertValidEmployeeId(value: unknown): asserts value is number {
  if (!isValidEmployeeId(value)) {
    throw new Error(
      "A valid authenticated employee ID is required before opening GradeLens local storage.",
    );
  }
}

function getDatabaseName(employeeId: number): string {
  assertValidEmployeeId(employeeId);

  return `${DATABASE_PREFIX}${employeeId}${DATABASE_SUFFIX}`;
}

/**
 * Returns the employee ID belonging to the currently active database.
 *
 * Returns null before a faculty database has been selected or after logout.
 */
export function getActiveDatabaseEmployeeId(): number | null {
  return activeEmployeeId;
}

/**
 * Returns the database connection for the active faculty account.
 *
 * This function deliberately does not create a database automatically.
 * The authenticated employee must be selected first.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  await databaseOperation;

  if (!database || activeEmployeeId === null) {
    throw new Error(
      "No faculty database is active. Initialize the database for the logged-in employee first.",
    );
  }

  return database;
}

/**
 * Closes the current connection without deleting the database file.
 */
async function closeDatabaseInternal(): Promise<void> {
  const currentDatabase = database;

  database = null;
  activeEmployeeId = null;

  if (currentDatabase) {
    await currentDatabase.closeAsync();
  }
}

/**
 * Opens and initializes the database for one faculty account.
 */
async function openAndInitializeDatabase(employeeId: number): Promise<void> {
  assertValidEmployeeId(employeeId);

  /*
   * If this employee's database is already open, reuse the connection.
   */
  if (database && activeEmployeeId === employeeId) {
    try {
      await prepareDatabase(database);
      return;
    } catch (error) {
      await closeDatabaseInternal();
      throw error;
    }
  }

  /*
   * Switching accounts:
   * close the previous connection but preserve its database file.
   */
  await closeDatabaseInternal();

  const nextDatabase = await SQLite.openDatabaseAsync(
    getDatabaseName(employeeId),
  );

  database = nextDatabase;
  activeEmployeeId = employeeId;

  try {
    await prepareDatabase(nextDatabase);
  } catch (error) {
    await closeDatabaseInternal();
    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| Initialize Database
|--------------------------------------------------------------------------
*/

/**
 * Opens and prepares the database for the specified employee.
 *
 * Examples:
 *   initializeDatabase(12)
 *     -> gradelens_emp_12.db
 *
 *   initializeDatabase(27)
 *     -> gradelens_emp_27.db
 *
 * If employeeId is omitted, an already-active employee database is required.
 */
export async function initializeDatabase(employeeId?: number): Promise<void> {
  await enqueueDatabaseOperation(async () => {
    const targetEmployeeId = employeeId ?? activeEmployeeId;

    assertValidEmployeeId(targetEmployeeId);

    await openAndInitializeDatabase(targetEmployeeId);
  });
}

/*
|--------------------------------------------------------------------------
| Close Database
|--------------------------------------------------------------------------
*/

/**
 * Closes the active employee database during logout.
 *
 * The database file and its local data are preserved.
 */
export async function closeDatabase(): Promise<void> {
  await enqueueDatabaseOperation(async () => {
    await closeDatabaseInternal();
  });
}

/*
|--------------------------------------------------------------------------
| Development Database Reset
|--------------------------------------------------------------------------
|
| Development utility only.
|
| Deletes only the selected employee's database and recreates its schema.
| It does not delete other employees' databases, authentication credentials,
| device UUIDs, or device keys.
|
*/

export async function resetDatabase(employeeId?: number): Promise<void> {
  await enqueueDatabaseOperation(async () => {
    const targetEmployeeId = employeeId ?? activeEmployeeId;

    assertValidEmployeeId(targetEmployeeId);

    await closeDatabaseInternal();

    await SQLite.deleteDatabaseAsync(getDatabaseName(targetEmployeeId));

    await openAndInitializeDatabase(targetEmployeeId);
  });
}

/*
|--------------------------------------------------------------------------
| Prepare Database Schema
|--------------------------------------------------------------------------
*/

async function prepareDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
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

    CREATE TABLE IF NOT EXISTS sync_metadata (
      employee_id INTEGER NOT NULL,
      sync_key TEXT NOT NULL,

      last_success_at TEXT NOT NULL,

      PRIMARY KEY (
        employee_id,
        sync_key
      )
    );

    CREATE INDEX IF NOT EXISTS idx_sync_metadata_employee
    ON sync_metadata(employee_id);

    CREATE TABLE IF NOT EXISTS scan_batches (
      scan_batch_uuid TEXT PRIMARY KEY NOT NULL,

      crs_tst_id INTEGER NOT NULL,
      tst_id INTEGER NOT NULL,

      batch_number INTEGER NOT NULL,

      status TEXT NOT NULL DEFAULT 'draft',

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      submitted_at TEXT,

      UNIQUE (
        crs_tst_id,
        batch_number
      )
    );

    CREATE INDEX IF NOT EXISTS idx_scan_batches_crs_tst_id
    ON scan_batches(crs_tst_id);

    CREATE INDEX IF NOT EXISTS idx_scan_batches_status
    ON scan_batches(status);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_batches_one_draft_per_course_test
    ON scan_batches(crs_tst_id)
    WHERE status = 'draft';

    CREATE TABLE IF NOT EXISTS omr_submissions (
      submission_uuid TEXT PRIMARY KEY NOT NULL,
      sheet_uuid TEXT NOT NULL,

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

      /*
       * Local-only faculty clarification state.
       *
       * The original native questions_json remains immutable evidence.
       * This JSON stores pre-sync faculty resolutions so they survive app
       * restarts without requiring a Laravel schema change.
       */
      local_review_json TEXT,

      tentative_score REAL NOT NULL,

      scan_batch_uuid TEXT,
      batch_uuid TEXT,

      sync_status TEXT NOT NULL DEFAULT 'pending',
      server_status TEXT,
      final_score REAL,

      requires_review INTEGER NOT NULL DEFAULT 0,
      server_requires_review INTEGER,
      is_flagged INTEGER,

      last_error TEXT,

      captured_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT
    );
  `);

  await upgradeCourseTestSchema(db);
  await upgradeOmrSubmissionSchema(db);
  await createOmrSubmissionIndexes(db);
}

/*
|--------------------------------------------------------------------------
| Course Test Schema Upgrade
|--------------------------------------------------------------------------
*/

async function upgradeCourseTestSchema(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(course_tests)`,
  );

  const existing = new Set(columns.map((column) => column.name));

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
    if (!existing.has(addition.name)) {
      await db.execAsync(addition.sql);
    }
  }
}

/*
|--------------------------------------------------------------------------
| OMR Submission Schema Upgrade
|--------------------------------------------------------------------------
*/

async function upgradeOmrSubmissionSchema(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  let columns = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(omr_submissions)`,
  );

  let existing = new Set(columns.map((column) => column.name));

  const additions: Array<{
    name: string;
    sql: string;
  }> = [
    {
      name: "scan_batch_uuid",
      sql: "ALTER TABLE omr_submissions ADD COLUMN scan_batch_uuid TEXT",
    },
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
    {
      name: "requires_review",
      sql: "ALTER TABLE omr_submissions ADD COLUMN requires_review INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "server_requires_review",
      sql: "ALTER TABLE omr_submissions ADD COLUMN server_requires_review INTEGER",
    },
    {
      name: "is_flagged",
      sql: "ALTER TABLE omr_submissions ADD COLUMN is_flagged INTEGER",
    },
    {
      name: "local_review_json",
      sql: "ALTER TABLE omr_submissions ADD COLUMN local_review_json TEXT",
    },
  ];

  for (const addition of additions) {
    if (!existing.has(addition.name)) {
      await db.execAsync(addition.sql);
    }
  }

  /*
   * Backfill captured_at for existing submissions.
   */
  await db.runAsync(`
    UPDATE omr_submissions
    SET captured_at = created_at
    WHERE captured_at IS NULL
  `);

  /*
   * Recalculate the local review flag from saved review question numbers.
   */
  await db.runAsync(`
    UPDATE omr_submissions
    SET requires_review =
      CASE
        WHEN review_question_numbers_json IS NOT NULL
          AND TRIM(review_question_numbers_json) NOT IN ('', '[]')
          THEN 1
        ELSE 0
      END
  `);

  columns = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(omr_submissions)`,
  );

  existing = new Set(columns.map((column) => column.name));

  /*
   * Detect the old authorized-rescan schema.
   */
  const legacyColumns = [
    "attempt_number",
    "submission_type",
    "parent_submission_uuid",
    "rescan_authorization_uuid",
  ];

  const hasLegacyRescanSchema = legacyColumns.some((column) =>
    existing.has(column),
  );

  if (!hasLegacyRescanSchema) {
    return;
  }

  /*
   * The old authorized-clarification architecture was removed.
   *
   * Rebuild the table once so existing local evidence is preserved while
   * obsolete columns and the old UNIQUE(sheet_uuid, attempt_number) rule
   * are removed.
   */
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DROP TABLE IF EXISTS omr_submissions_current;

      CREATE TABLE omr_submissions_current (
        submission_uuid TEXT PRIMARY KEY NOT NULL,
        sheet_uuid TEXT NOT NULL,

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
        local_review_json TEXT,

        tentative_score REAL NOT NULL,

        scan_batch_uuid TEXT,
        batch_uuid TEXT,

        sync_status TEXT NOT NULL DEFAULT 'pending',
        server_status TEXT,
        final_score REAL,

        requires_review INTEGER NOT NULL DEFAULT 0,
        server_requires_review INTEGER,
        is_flagged INTEGER,

        last_error TEXT,

        captured_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced_at TEXT
      );

      INSERT INTO omr_submissions_current (
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
        local_review_json,
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
      SELECT
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
        local_review_json,
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
      FROM omr_submissions;

      DROP TABLE omr_submissions;

      ALTER TABLE omr_submissions_current
      RENAME TO omr_submissions;
    `);
  });
}

/*
|--------------------------------------------------------------------------
| OMR Submission Indexes
|--------------------------------------------------------------------------
*/

async function createOmrSubmissionIndexes(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_omr_submissions_sync_status
    ON omr_submissions(sync_status);

    CREATE INDEX IF NOT EXISTS idx_omr_submissions_crs_tst_id
    ON omr_submissions(crs_tst_id);

    CREATE INDEX IF NOT EXISTS idx_omr_submissions_student
    ON omr_submissions(crs_tst_id, std_id);

    CREATE INDEX IF NOT EXISTS idx_omr_submissions_scan_batch_uuid
    ON omr_submissions(scan_batch_uuid);

    CREATE INDEX IF NOT EXISTS idx_omr_submissions_batch_uuid
    ON omr_submissions(batch_uuid);

    CREATE INDEX IF NOT EXISTS idx_omr_submissions_sheet_uuid
    ON omr_submissions(sheet_uuid);
  `);
}
