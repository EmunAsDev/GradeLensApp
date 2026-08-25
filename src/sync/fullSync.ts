import { ensureDeviceRegistered } from "@/crypto/deviceRegistration";

import { getCourses } from "@/database/courseRepository";

import { getAllCourseTests } from "@/database/courseTestRepository";

import { syncCourses } from "@/sync/courseSync";

import { syncCourseTests } from "@/sync/courseTestSync";

import { syncCourseTestStudents } from "@/sync/courseTestStudentSync";

import { syncOmrPackage } from "@/sync/omrPackageSync";

export type FullSyncResult = {
  courseCount: number;

  courseTestCoursesSynced: number;

  courseTestsWithStudentsSynced: number;

  omrPackagesSynced: number;

  omrPackagesFailed: number;
};

export async function performFullSync(token: string): Promise<FullSyncResult> {
  /*
    |--------------------------------------------------------------------------
    | Device Registration
    |--------------------------------------------------------------------------
    */

  await ensureDeviceRegistered(token);

  /*
    |--------------------------------------------------------------------------
    | Courses
    |--------------------------------------------------------------------------
    */

  await syncCourses(token);

  const courses = await getCourses();

  /*
    |--------------------------------------------------------------------------
    | Course Tests
    |--------------------------------------------------------------------------
    */

  let courseTestCoursesSynced = 0;

  for (const course of courses) {
    await syncCourseTests(token, course.crs_id);

    courseTestCoursesSynced++;
  }

  /*
    |--------------------------------------------------------------------------
    | Updated Local Course Tests
    |--------------------------------------------------------------------------
    */

  const courseTests = await getAllCourseTests();

  /*
    |--------------------------------------------------------------------------
    | Students + Existing Final Scores
    |--------------------------------------------------------------------------
    */

  let courseTestsWithStudentsSynced = 0;

  for (const courseTest of courseTests) {
    try {
      await syncCourseTestStudents(token, courseTest.crs_tst_id);

      courseTestsWithStudentsSynced++;
    } catch (error) {
      console.error(
        `[STUDENT SYNC] CourseTest ${courseTest.crs_tst_id} failed:`,
        error,
      );
    }
  }

  /*
    |--------------------------------------------------------------------------
    | OMR Packages
    |--------------------------------------------------------------------------
    */

  let omrPackagesSynced = 0;

  let omrPackagesFailed = 0;

  for (const courseTest of courseTests) {
    try {
      await syncOmrPackage(token, courseTest.crs_tst_id);

      omrPackagesSynced++;
    } catch (error) {
      console.error(
        `[OMR SYNC] CourseTest ${courseTest.crs_tst_id} failed:`,
        error,
      );

      omrPackagesFailed++;
    }
  }

  return {
    courseCount: courses.length,

    courseTestCoursesSynced,

    courseTestsWithStudentsSynced,

    omrPackagesSynced,

    omrPackagesFailed,
  };
}
