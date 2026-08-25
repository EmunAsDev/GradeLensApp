import { fetchCourses } from "../api/courseApi";

import { saveCourses } from "../database/courseRepository";

export async function syncCourses(token: string): Promise<void> {
  const courses = await fetchCourses(token);

  await saveCourses(courses);
}
