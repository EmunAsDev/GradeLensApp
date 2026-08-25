import { fetchCourseTestStudents } from "@/api/courseTestStudentApi";

import { saveCourseTestStudents } from "@/database/courseTestStudentRepository";

export async function syncCourseTestStudents(
  token: string,
  courseTestId: number,
): Promise<void> {
  const response = await fetchCourseTestStudents(token, courseTestId);

  await saveCourseTestStudents(
    response.course_test.crs_id,
    response.course_test.crs_tst_id,
    response.students,
  );
}
