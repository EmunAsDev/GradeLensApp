import { apiRequest } from "@/api/client";

import { ApiCourseTestStudent } from "@/database/courseTestStudentRepository";

export type CourseTestStudentsResponse = {
  course_test: {
    crs_tst_id: number;

    crs_id: number;

    tst_id: number;

    title: string | null;
  };

  students: ApiCourseTestStudent[];
};

export async function fetchCourseTestStudents(
  token: string,
  courseTestId: number,
): Promise<CourseTestStudentsResponse> {
  return await apiRequest<CourseTestStudentsResponse>(
    `/course-tests/${courseTestId}/students`,
    {
      method: "GET",

      token,
    },
  );
}
