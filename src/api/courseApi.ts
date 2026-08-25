import { apiRequest } from "../api/client";

import { ApiCourse } from "../database/courseRepository";

type CoursesResponse = {
  courses: ApiCourse[];
};

export async function fetchCourses(token: string): Promise<ApiCourse[]> {
  const response = await apiRequest<CoursesResponse>("/courses", {
    method: "GET",
    token,
  });

  return response.courses;
}
