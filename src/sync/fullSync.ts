import { ensureDeviceRegistered } from "@/crypto/deviceRegistration";

import { getCourses } from "@/database/courseRepository";

import { getAllCourseTests } from "@/database/courseTestRepository";

import { syncCourses } from "@/sync/courseSync";

import { syncCourseTests } from "@/sync/courseTestSync";

import { syncCourseTestStudents } from "@/sync/courseTestStudentSync";

import { syncOmrPackage } from "@/sync/omrPackageSync";

import {
  FULL_REFERENCE_SYNC_COOLDOWN_MS,
  runGuardedSync,
  type GuardedSyncResult,
} from "@/sync/syncGuard";

const FULL_REFERENCE_SYNC_KEY = "full_reference_sync";

export type FullSyncSummary = {
  courseCount: number;

  courseTestCoursesSynced: number;

  courseTestsWithStudentsSynced: number;
  courseTestsWithStudentsFailed: number;

  omrPackagesSynced: number;
  omrPackagesFailed: number;
};

export type FullSyncResult = GuardedSyncResult<FullSyncSummary>;

export async function performFullSync(
  token: string,
  employeeId: number,
  options?: {
    ignoreCooldown?: boolean;
    recordSuccess?: boolean;
  },
): Promise<FullSyncResult> {
  return await runGuardedSync({
    employeeId,

    syncKey: FULL_REFERENCE_SYNC_KEY,

    cooldownMs: FULL_REFERENCE_SYNC_COOLDOWN_MS,

    ignoreCooldown: options?.ignoreCooldown ?? false,

    recordSuccess: options?.recordSuccess ?? true,

    task: async () => {
      return await performReferenceSync(token);
    },
  });
}

async function performReferenceSync(token: string): Promise<FullSyncSummary> {
  /*
   * Full Sync is intentionally REFERENCE DATA ONLY.
   *
   * It prepares/updates the information required for offline GradeLens use.
   * It does NOT upload locally scanned OMR submissions.
   *
   * Scanned papers are submitted only from the Batch screen.
   */

  /*
   * Device Registration
   */
  await ensureDeviceRegistered(token);

  /*
   * Courses
   */
  await syncCourses(token);

  const courses = await getCourses();

  /*
   * Course Tests
   */
  let courseTestCoursesSynced = 0;

  for (const course of courses) {
    await syncCourseTests(token, course.crs_id);

    courseTestCoursesSynced++;
  }

  /*
   * Updated Local Course Tests
   */
  const courseTests = await getAllCourseTests();

  /*
   * Students + Existing Final Scores
   */
  let courseTestsWithStudentsSynced = 0;
  let courseTestsWithStudentsFailed = 0;

  for (const courseTest of courseTests) {
    try {
      await syncCourseTestStudents(token, courseTest.crs_tst_id);

      courseTestsWithStudentsSynced++;
    } catch {
      courseTestsWithStudentsFailed++;
    }
  }

  /*
   * OMR Packages
   */
  let omrPackagesSynced = 0;
  let omrPackagesFailed = 0;

  for (const courseTest of courseTests) {
    try {
      await syncOmrPackage(token, courseTest.crs_tst_id);

      omrPackagesSynced++;
    } catch {
      omrPackagesFailed++;
    }
  }

  return {
    courseCount: courses.length,

    courseTestCoursesSynced,

    courseTestsWithStudentsSynced,
    courseTestsWithStudentsFailed,

    omrPackagesSynced,
    omrPackagesFailed,
  };
}
