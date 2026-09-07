import { apiRequest } from "@/api/client";

<<<<<<< HEAD
/*
|--------------------------------------------------------------------------
| Batch Sync API Contract
|--------------------------------------------------------------------------
|
| Every field here was cross-checked against how omrSubmissionSync.ts
| actually consumes this module (buildServerAnswers, buildAnswerStatuses,
| toServerSubmission, applyBatchResponse, getOfficialResultForSubmission) -
| no mismatches. This is the single source of truth for the wire format
| between the app and the Laravel /batch-sync endpoint.
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Request
|--------------------------------------------------------------------------
*/

// Question number (as string) -> shaded choice letters, e.g. {"15": ["C","D"], "22": []}
export type BatchSyncAnswers = Record<string, string[]>;

// Question number (as string) -> interpreter status string for that question
=======
export type BatchSyncAnswers = Record<string, string[]>;
>>>>>>> 5e6ced85ab3217b727f5e3d2c9dbe6f8eff9633a
export type BatchSyncAnswerStatuses = Record<string, string>;

export type BatchSyncSubmissionPayload = {
  submission_uuid: string;
  sheet_uuid: string;

  student_id_no: string;

  answers: BatchSyncAnswers;
  answer_statuses: BatchSyncAnswerStatuses;

  tentative_score: number | null;

  requires_review: boolean;

  captured_at: string;
};

export type BatchSyncRequestPayload = {
  batch_uuid: string;

  crs_tst_id: number;
  tst_id: number;

  source: "mobile";

  submissions: BatchSyncSubmissionPayload[];
};

<<<<<<< HEAD
/*
|--------------------------------------------------------------------------
| Response
|--------------------------------------------------------------------------
*/

=======
>>>>>>> 5e6ced85ab3217b727f5e3d2c9dbe6f8eff9633a
export type BatchSyncResponseSubmission = {
  submission_uuid: string;
  sheet_uuid: string;

  student_id_no: string;

  tentative_score: string | number | null;
  final_score: string | number | null;

  requires_review: boolean;
  is_flagged: boolean;

  status: string;

  error_message: string | null;
  processed_at: string | null;
};

<<<<<<< HEAD
/*
 * The permanent, authoritative record from course_test_results. Matched
 * back to a local submission by crs_tst_id + (std_id OR student_id_no) -
 * see getOfficialResultForSubmission() in omrSubmissionSync.ts. This is
 * preferred over BatchSyncResponseSubmission.final_score when both are
 * present.
 */
=======
>>>>>>> 5e6ced85ab3217b727f5e3d2c9dbe6f8eff9633a
export type BatchSyncCourseTestResult = {
  ctr_id?: number;
  crs_tst_id: number;
  std_id: number;

  student_id_no: string | null;
  student_name: string | null;

  final_score: string | number | null;

  updated_at?: string | null;
};

export type BatchSyncResponse = {
  message: string;

  batch: {
    batch_uuid: string;

    crs_tst_id: number;
    tst_id: number;

    source: "mobile" | "postman";
    status: string;

    total_submissions: number;
    processed_submissions: number;
    failed_submissions: number;

    started_at: string | null;
    completed_at: string | null;
  };

  submissions: BatchSyncResponseSubmission[];

<<<<<<< HEAD
  // Optional: may be absent if Laravel defers grading to a queued job
  // rather than computing course_test_results synchronously in this
  // response.
  course_test_results?: BatchSyncCourseTestResult[];
};

/*
|--------------------------------------------------------------------------
| uploadOmrBatch
|--------------------------------------------------------------------------
*/

=======
  course_test_results?: BatchSyncCourseTestResult[];
};

>>>>>>> 5e6ced85ab3217b727f5e3d2c9dbe6f8eff9633a
export async function uploadOmrBatch(
  token: string,
  payload: BatchSyncRequestPayload,
): Promise<BatchSyncResponse> {
  return await apiRequest<BatchSyncResponse>("/batch-sync", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}
