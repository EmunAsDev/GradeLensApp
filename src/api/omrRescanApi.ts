import { apiRequest } from "@/api/client";

/*
|--------------------------------------------------------------------------
| OMR Clarification Rescan API
|--------------------------------------------------------------------------
*/

export type VerifyOmrRescanRequest = {
  sheet_uuid: string;

  rescan_code: string;
};

export type VerifiedOmrRescanAuthorization = {
  authorization_uuid: string;

  reference_no: string;

  sheet_uuid: string;

  original_submission_uuid: string;

  crs_tst_id: number;

  std_id: number;

  student_id_no: string | null;

  reason: string;

  notes: string | null;

  status: "approved";

  next_attempt_number: number;

  expires_at: string | null;
};

export type VerifyOmrRescanResponse = {
  message: string;

  authorization: VerifiedOmrRescanAuthorization;
};

/*
|--------------------------------------------------------------------------
| Verify One-Time Rescan Code
|--------------------------------------------------------------------------
|
| Verification does NOT consume the authorization.
|
| Laravel consumes the authorization only after the clarification submission
| is successfully accepted by /batch-sync.
|
*/

export async function verifyOmrRescanAuthorization(
  token: string,
  sheetUuid: string,
  rescanCode: string,
): Promise<VerifiedOmrRescanAuthorization> {
  const response = await apiRequest<VerifyOmrRescanResponse>(
    "/omr/rescan/verify",
    {
      method: "POST",

      token,

      body: JSON.stringify({
        sheet_uuid: sheetUuid.trim(),

        rescan_code: rescanCode.trim(),
      }),
    },
  );

  return response.authorization;
}
