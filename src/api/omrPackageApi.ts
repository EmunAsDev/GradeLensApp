import { apiRequest } from "@/api/client";

export type OmrPackageResponse = {
  crs_tst_id: number;
  crs_id: number;
  tst_id: number;

  question_count: number;

  encryption: {
    content_algorithm: "AES-256-GCM";

    key_algorithm: "RSA-OAEP";

    iv: string;

    tag: string;

    wrapped_key: string;
  };

  answer_key: string;
};

export async function fetchOmrPackage(
  token: string,
  courseTestId: number,
  deviceUuid: string,
): Promise<OmrPackageResponse> {
  const response = await apiRequest<OmrPackageResponse>(
    `/course-tests/${courseTestId}/omr-package` +
      `?device_uuid=${encodeURIComponent(deviceUuid)}`,
    {
      method: "GET",
      token,
    },
  );

  if (
    !Number.isInteger(response.question_count) ||
    response.question_count < 1 ||
    response.question_count > 100
  ) {
    throw new Error(
      `Invalid OMR package question count: ${response.question_count}. Expected an integer from 1 to 100.`,
    );
  }

  if (response.crs_tst_id !== courseTestId) {
    throw new Error(
      "The OMR package Course Test ID does not match the requested test.",
    );
  }

  return response;
}
