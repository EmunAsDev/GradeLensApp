import { apiRequest } from "@/api/client";

export type BatchSyncAnswers = Record<string, string[]>;
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

  course_test_results?: BatchSyncCourseTestResult[];
};

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
