import { apiRequest } from "../api/client";

import { ApiCourseTest } from "../database/courseTestRepository";

type CourseTestsResponse = {
  course_tests: ApiCourseTest[];
};

export async function fetchCourseTests(
  token: string,
  courseId: number,
): Promise<ApiCourseTest[]> {
  const response = await apiRequest<CourseTestsResponse>(
    `/courses/${courseId}/tests`,
    {
      method: "GET",
      token,
    },
  );

  return response.course_tests;
}
