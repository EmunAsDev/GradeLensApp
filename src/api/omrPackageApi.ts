import { apiRequest } from "@/api/client";

export type OmrPackageResponse = {
  crs_tst_id: number;
  crs_id: number;
  tst_id: number;

  question_count: 50 | 100;

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
  return await apiRequest<OmrPackageResponse>(
    `/course-tests/${courseTestId}/omr-package` +
      `?device_uuid=${encodeURIComponent(deviceUuid)}`,
    {
      method: "GET",

      token,
    },
  );
}
