import { fetchOmrPackage } from "@/api/omrPackageApi";

import { saveOmrPackageMetadata } from "@/database/courseTestRepository";

import { getDeviceUuid } from "@/crypto/deviceKeyStorage";

import { saveEncryptedOmrPackage } from "@/storage/omrPackageStorage";

export async function syncOmrPackage(
  token: string,
  courseTestId: number,
): Promise<void> {
  const deviceUuid = await getDeviceUuid();

  if (!deviceUuid) {
    throw new Error("Device UUID is not available.");
  }

  const omrPackage = await fetchOmrPackage(token, courseTestId, deviceUuid);

  /*
    |--------------------------------------------------------------------------
    | Save AES Ciphertext Only
    |--------------------------------------------------------------------------
    */

  const packagePath = await saveEncryptedOmrPackage(
    courseTestId,
    omrPackage.answer_key,
  );

  /*
    |--------------------------------------------------------------------------
    | Save Non-secret Encryption Metadata
    |--------------------------------------------------------------------------
    */

  await saveOmrPackageMetadata({
    crs_tst_id: omrPackage.crs_tst_id,

    question_count: omrPackage.question_count,

    omr_package_path: packagePath,

    omr_iv: omrPackage.encryption.iv,

    omr_tag: omrPackage.encryption.tag,

    omr_wrapped_key: omrPackage.encryption.wrapped_key,

    omr_content_algorithm: omrPackage.encryption.content_algorithm,

    omr_key_algorithm: omrPackage.encryption.key_algorithm,

    omr_synced_at: new Date().toISOString(),
  });
}
