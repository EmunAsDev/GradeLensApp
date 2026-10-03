import { apiRequest } from "@/api/client";

import type { ParsedLocalOmrSubmission } from "@/database/omrSubmissionRepository";

import {
  buildOmrSyncEvidence,
  type OmrPreSyncReviewMetadata,
  type OmrSubmissionPayload,
} from "@/../modules/gradelens-omr/submission";

/*
|--------------------------------------------------------------------------
| Batch Sync API Contract
|--------------------------------------------------------------------------
|
| Mobile sends immutable local scan evidence to Laravel. Partial retries keep
| the same batch_uuid and submission_uuid; only unresolved submissions need to
| be included in a retry request.
|
*/

export type BatchSyncAnswers = Record<string, string[]>;

export type BatchSyncAnswerStatuses = Record<string, string>;

export type BatchSyncSubmissionPayload = {
  submission_uuid: string;
  sheet_uuid: string;

  student_id_no: string;

  answers: BatchSyncAnswers;
  answer_statuses: BatchSyncAnswerStatuses;

  /*
   * Exact question numbers whose OMR interpretation needs human review.
   * This is immutable scan evidence, not a teacher verdict.
   */
  review_question_numbers: number[];

  /*
   * Present only when the native reader originally required review and faculty
   * resolved every uncertain question locally before first synchronization.
   *
   * This is audit metadata. Laravel still scores `answers`.
   */
  review_metadata: OmrPreSyncReviewMetadata | null;

  tentative_score: number | null;
  requires_review: boolean;

  captured_at: string;
};

function toOmrSubmissionPayload(
  submission: ParsedLocalOmrSubmission,
): OmrSubmissionPayload {
  return {
    format: submission.format,
    question_count: submission.question_count,
    answers: { ...submission.answers },
    questions: submission.questions.map((question) => ({
      ...question,
      selected_choices: [...question.selected_choices],
      shaded_choices: [...question.shaded_choices],
      crossed_choices: [...question.crossed_choices],
      invalid_choices: [...question.invalid_choices],
    })),
    review_question_numbers: [...submission.review_question_numbers],
    counts: {
      ...submission.counts,
      statuses: { ...submission.counts.statuses },
    },
    local_review: submission.local_review,
  };
}

/*
 * Single mobile -> API conversion point.
 *
 * buildOmrSyncEvidence() throws while a paper still Needs Review, which means
 * unresolved local scans can never accidentally enter /batch-sync.
 */
export function buildBatchSyncSubmissionPayload(
  submission: ParsedLocalOmrSubmission,
): BatchSyncSubmissionPayload {
  const evidence = buildOmrSyncEvidence(toOmrSubmissionPayload(submission));

  return {
    submission_uuid: submission.submission_uuid,
    sheet_uuid: submission.sheet_uuid,
    student_id_no: submission.student_id_no,

    answers: evidence.answers,
    answer_statuses: evidence.answer_statuses,

    review_question_numbers: evidence.review_question_numbers,
    review_metadata: evidence.review_metadata,

    tentative_score: submission.tentative_score,
    requires_review: evidence.requires_review,

    captured_at: submission.captured_at,
  };
}

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
  review_question_numbers: number[];
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
    review_submissions: number;
    failed_submissions: number;

    started_at: string | null;
    completed_at: string | null;
  };

  submissions: BatchSyncResponseSubmission[];

  course_test_results?: BatchSyncCourseTestResult[];
};

export function buildBatchSyncRequestPayload(
  batchUuid: string,
  crsTstId: number,
  tstId: number,
  submissions: ParsedLocalOmrSubmission[],
): BatchSyncRequestPayload {
  const normalizedBatchUuid = batchUuid.trim();

  if (!normalizedBatchUuid) {
    throw new Error("Batch UUID is required.");
  }

  if (!Number.isInteger(crsTstId) || crsTstId <= 0) {
    throw new Error("A valid Course Test ID is required.");
  }

  if (!Number.isInteger(tstId) || tstId <= 0) {
    throw new Error("A valid Test ID is required.");
  }

  if (submissions.length === 0) {
    throw new Error("At least one ready OMR submission is required.");
  }

  for (const submission of submissions) {
    if (submission.crs_tst_id !== crsTstId || submission.tst_id !== tstId) {
      throw new Error(
        "All OMR submissions in one server batch must belong to the same Course Test.",
      );
    }
  }

  return {
    batch_uuid: normalizedBatchUuid,
    crs_tst_id: crsTstId,
    tst_id: tstId,
    source: "mobile",
    submissions: submissions.map(buildBatchSyncSubmissionPayload),
  };
}

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
