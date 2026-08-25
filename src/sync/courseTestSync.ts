import { fetchCourseTests } from "../api/courseTestApi";

import { saveCourseTests } from "../database/courseTestRepository";

export async function syncCourseTests(
  token: string,
  courseId: number,
): Promise<void> {
  const courseTests = await fetchCourseTests(token, courseId);

  await saveCourseTests(courseTests);
}
