import type {
  Analyze50QuestionsResult,
  QuestionInterpretationStatus,
  QuestionQualityStatus,
} from "./index";

export type OmrQuestionCount = 50 | 100;
export type OmrSheetFormat = "50" | "100";

const VALID_CHOICES = ["A", "B", "C", "D", "E"] as const;

export type OmrSubmissionQuestionPayload = {
  question_number: number;

  // Legacy convenience field from the ORIGINAL machine interpretation.
  // It is intentionally not rewritten by faculty pre-sync clarification.
  answer: string | null;

  // ORIGINAL machine physical selection set.
  // Faculty clarification changes `answers`, not this evidence object.
  selected_choices: string[];
  status: QuestionInterpretationStatus;
  quality_status: QuestionQualityStatus;
  needs_review: boolean;
  shaded_choices: string[];
  crossed_choices: string[];
  invalid_choices: string[];
};

export type OmrSubmissionStatusCounts = {
  blank: number;
  selected: number;
  selected_with_correction: number;
  crossed_without_replacement: number;
  multiple: number;
  invalid: number;
  ambiguous: number;
  unreadable: number;
};

export type OmrSubmissionCounts = {
  accepted: number;
  review: number;
  reject: number;
  statuses: OmrSubmissionStatusCounts;
};

export type OmrLocalReviewState = "not_required" | "pending" | "resolved";

export type OmrLocalReviewResolution = {
  question_number: number;

  // Snapshot of what native OMR originally reported.
  original_status: QuestionInterpretationStatus;
  original_quality_status: QuestionQualityStatus;
  original_selected_choices: string[];
  original_shaded_choices: string[];
  original_crossed_choices: string[];
  original_invalid_choices: string[];

  // Faculty-confirmed effective answer used for tentative/server scoring.
  // [] means faculty confirmed the response should be treated as blank.
  resolved_choices: string[];
  reviewed_at: string;
};

export type OmrLocalReview = {
  state: OmrLocalReviewState;

  // Frozen list produced by the original machine interpretation.
  original_review_question_numbers: number[];

  // Questions still blocking synchronization.
  unresolved_question_numbers: number[];

  // Questions already clarified by faculty on this device.
  resolved_question_numbers: number[];

  // Keyed by question number as a string for JSON/SQLite friendliness.
  resolutions: Record<string, OmrLocalReviewResolution>;
};

export type OmrPreSyncReviewMetadata = {
  source: "faculty_mobile";
  reviewed_before_sync: true;
  original_review_question_numbers: number[];
  resolved_question_numbers: number[];
  resolutions: OmrLocalReviewResolution[];
};

export type OmrSyncEvidence = {
  answers: Record<string, string[]>;
  answer_statuses: Record<string, QuestionInterpretationStatus>;
  review_question_numbers: number[];
  requires_review: false;
  review_metadata: OmrPreSyncReviewMetadata | null;
};

export type OmrSubmissionPayload = {
  format: OmrSheetFormat;
  question_count: OmrQuestionCount;

  /*
   * EFFECTIVE answer set.
   *
   * Immediately after scanning this matches the native machine interpretation.
   * If faculty clarifies an uncertain question before sync, only this effective
   * answer map and `local_review` change. The original `questions` evidence is
   * left untouched.
   */
  answers: Record<string, string[]>;

  // Frozen original machine interpretation/evidence.
  questions: OmrSubmissionQuestionPayload[];

  /*
   * CURRENT unresolved review questions.
   *
   * - Immediately after scan: contains all native review questions.
   * - As faculty resolves them locally: numbers are removed.
   * - Ready for sync: must be empty.
   */
  review_question_numbers: number[];

  // Original native machine counts. They are not rewritten by human review.
  counts: OmrSubmissionCounts;

  /*
   * Added for the mobile-first review workflow.
   * Optional for compatibility with older locally stored payloads.
   */
  local_review?: OmrLocalReview;
};

export type OmrSubmissionPayload50 = OmrSubmissionPayload & {
  format: "50";
  question_count: 50;
};

export type OmrSubmissionPayload100 = OmrSubmissionPayload & {
  format: "100";
  question_count: 100;
};

/*
 * The current 50- and future 100-item native question interpreters should
 * expose the same structural contract. Keeping this structural type here
 * prevents the persistence/scoring layer from becoming format-specific.
 */
export type AnalyzeQuestionsResultLike = {
  success: boolean;
  questionCount: number;

  questions: Array<{
    question: number;
    answer: string | null;
    selectedChoices: string[];

    status: QuestionInterpretationStatus;
    qualityStatus: QuestionQualityStatus;
    needsReview: boolean;

    shadedChoices: string[];
    crossedChoices: string[];
    invalidChoices: string[];
  }>;

  statusCounts: Partial<
    Record<
      | "blank"
      | "selected"
      | "selected_with_correction"
      | "crossed_without_replacement"
      | "multiple"
      | "invalid"
      | "ambiguous"
      | "unreadable",
      number
    >
  >;

  acceptedCount: number;
  reviewCount: number;
  rejectCount: number;
};

function normalizeChoice(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeChoices(values: string[]): string[] {
  return values
    .map(normalizeChoice)
    .filter((value) => (VALID_CHOICES as readonly string[]).includes(value))
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort();
}

function normalizeQuestionNumbers(values: number[]): number[] {
  return values
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 100)
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort((a, b) => a - b);
}

function cloneQuestion(
  question: OmrSubmissionQuestionPayload,
): OmrSubmissionQuestionPayload {
  return {
    ...question,
    selected_choices: [...question.selected_choices],
    shaded_choices: [...question.shaded_choices],
    crossed_choices: [...question.crossed_choices],
    invalid_choices: [...question.invalid_choices],
  };
}

function cloneResolution(
  resolution: OmrLocalReviewResolution,
): OmrLocalReviewResolution {
  return {
    ...resolution,
    original_selected_choices: [...resolution.original_selected_choices],
    original_shaded_choices: [...resolution.original_shaded_choices],
    original_crossed_choices: [...resolution.original_crossed_choices],
    original_invalid_choices: [...resolution.original_invalid_choices],
    resolved_choices: [...resolution.resolved_choices],
  };
}

function cloneLocalReview(review: OmrLocalReview): OmrLocalReview {
  const resolutions: Record<string, OmrLocalReviewResolution> = {};

  for (const [questionNumber, resolution] of Object.entries(
    review.resolutions,
  )) {
    resolutions[questionNumber] = cloneResolution(resolution);
  }

  return {
    state: review.state,
    original_review_question_numbers: [
      ...review.original_review_question_numbers,
    ],
    unresolved_question_numbers: [...review.unresolved_question_numbers],
    resolved_question_numbers: [...review.resolved_question_numbers],
    resolutions,
  };
}

function buildDefaultLocalReview(
  submission: Pick<
    OmrSubmissionPayload,
    "review_question_numbers" | "questions"
  >,
): OmrLocalReview {
  const originalReviewQuestionNumbers = normalizeQuestionNumbers(
    submission.review_question_numbers,
  );

  return {
    state:
      originalReviewQuestionNumbers.length > 0 ? "pending" : "not_required",
    original_review_question_numbers: originalReviewQuestionNumbers,
    unresolved_question_numbers: [...originalReviewQuestionNumbers],
    resolved_question_numbers: [],
    resolutions: {},
  };
}

function getLocalReview(submission: OmrSubmissionPayload): OmrLocalReview {
  return submission.local_review
    ? cloneLocalReview(submission.local_review)
    : buildDefaultLocalReview(submission);
}

export function normalizeOmrQuestionCount(value: number): OmrQuestionCount {
  if (value === 50 || value === 100) {
    return value;
  }

  throw new Error(
    `Unsupported GradeLens paper size: ${value} questions. Expected 50 or 100.`,
  );
}

export function getOmrSheetFormat(
  questionCount: OmrQuestionCount,
): OmrSheetFormat {
  return String(questionCount) as OmrSheetFormat;
}

export function buildOmrSubmissionPayload(
  result: AnalyzeQuestionsResultLike,
  questionCount: OmrQuestionCount,
): OmrSubmissionPayload {
  if (!result.success) {
    throw new Error(
      "Cannot build an OMR submission from an unsuccessful analysis.",
    );
  }

  if (result.questionCount !== questionCount) {
    throw new Error(
      `OMR analysis question-count mismatch. Expected ${questionCount}, received ${result.questionCount}.`,
    );
  }

  if (result.questions.length !== questionCount) {
    throw new Error(
      `Expected ${questionCount} interpreted questions, received ${result.questions.length}.`,
    );
  }

  const answers: Record<string, string[]> = {};
  const questions: OmrSubmissionQuestionPayload[] = [];
  const reviewQuestionNumbers: number[] = [];
  const seenQuestions = new Set<number>();

  for (const question of result.questions) {
    if (
      !Number.isInteger(question.question) ||
      question.question < 1 ||
      question.question > questionCount
    ) {
      throw new Error(
        `Invalid interpreted question number: ${question.question}.`,
      );
    }

    if (seenQuestions.has(question.question)) {
      throw new Error(
        `Duplicate interpreted question number: ${question.question}.`,
      );
    }

    seenQuestions.add(question.question);

    const physicallySelected =
      question.status === "selected" ||
      question.status === "selected_with_correction";

    const selectedChoices = physicallySelected
      ? [...question.selectedChoices]
      : [];

    const legacySingleAnswer =
      selectedChoices.length === 1 ? selectedChoices[0] : null;

    answers[String(question.question)] = [...selectedChoices];

    questions.push({
      question_number: question.question,
      answer: legacySingleAnswer,
      selected_choices: [...selectedChoices],
      status: question.status,
      quality_status: question.qualityStatus,
      needs_review: question.needsReview,
      shaded_choices: [...question.shadedChoices],
      crossed_choices: [...question.crossedChoices],
      invalid_choices: [...question.invalidChoices],
    });

    if (
      question.needsReview ||
      question.qualityStatus === "review" ||
      question.qualityStatus === "reject"
    ) {
      reviewQuestionNumbers.push(question.question);
    }
  }

  if (seenQuestions.size !== questionCount) {
    throw new Error(
      `Expected ${questionCount} unique interpreted questions, received ${seenQuestions.size}.`,
    );
  }

  questions.sort((a, b) => a.question_number - b.question_number);

  const normalizedReviewQuestionNumbers = normalizeQuestionNumbers(
    reviewQuestionNumbers,
  );

  const localReview: OmrLocalReview = {
    state:
      normalizedReviewQuestionNumbers.length > 0 ? "pending" : "not_required",
    original_review_question_numbers: [...normalizedReviewQuestionNumbers],
    unresolved_question_numbers: [...normalizedReviewQuestionNumbers],
    resolved_question_numbers: [],
    resolutions: {},
  };

  return {
    format: getOmrSheetFormat(questionCount),

    question_count: questionCount,

    answers,
    questions,

    review_question_numbers: normalizedReviewQuestionNumbers,

    counts: {
      accepted: result.acceptedCount,

      review: result.reviewCount,

      reject: result.rejectCount,

      statuses: {
        blank: result.statusCounts.blank ?? 0,

        selected: result.statusCounts.selected ?? 0,

        selected_with_correction:
          result.statusCounts.selected_with_correction ?? 0,

        crossed_without_replacement:
          result.statusCounts.crossed_without_replacement ?? 0,

        multiple: result.statusCounts.multiple ?? 0,

        invalid: result.statusCounts.invalid ?? 0,

        ambiguous: result.statusCounts.ambiguous ?? 0,

        unreadable: result.statusCounts.unreadable ?? 0,
      },
    },

    local_review: localReview,
  };
}

/*
 * Return the ORIGINAL native evidence for the questions that still need
 * faculty clarification. This is suitable for a "Review Now" screen or a
 * later "Needs Review" list item.
 */
export function getPendingOmrReviewQuestions(
  submission: OmrSubmissionPayload,
): OmrSubmissionQuestionPayload[] {
  const pending = new Set(submission.review_question_numbers);

  return submission.questions
    .filter((question) => pending.has(question.question_number))
    .map(cloneQuestion)
    .sort((a, b) => a.question_number - b.question_number);
}

/*
 * Faculty clarification is LOCAL and PRE-SYNC.
 *
 * Important:
 * - Original native question evidence is NOT changed.
 * - Only the effective `answers` map is changed.
 * - The resolution is recorded separately in `local_review`.
 * - Once every original review question is resolved, the submission becomes
 *   eligible for normal synchronization.
 */
export function resolveOmrReviewQuestion<T extends OmrSubmissionPayload>(
  submission: T,
  questionNumber: number,
  resolvedChoices: string[],
  reviewedAt: string = new Date().toISOString(),
): T {
  if (
    !Number.isInteger(questionNumber) ||
    questionNumber < 1 ||
    questionNumber > submission.question_count
  ) {
    throw new Error(`Invalid review question number: ${questionNumber}.`);
  }

  const question = submission.questions.find(
    (item) => item.question_number === questionNumber,
  );

  if (!question) {
    throw new Error(
      `Question ${questionNumber} is missing from the submission.`,
    );
  }

  const localReview = getLocalReview(submission);

  if (!localReview.original_review_question_numbers.includes(questionNumber)) {
    throw new Error(
      `Question ${questionNumber} was not originally marked for review.`,
    );
  }

  const normalizedResolvedChoices = normalizeChoices(resolvedChoices);

  const reviewTimestamp = new Date(reviewedAt);

  if (Number.isNaN(reviewTimestamp.getTime())) {
    throw new Error(`Invalid review timestamp: ${reviewedAt}.`);
  }

  const resolution: OmrLocalReviewResolution = {
    question_number: questionNumber,
    original_status: question.status,
    original_quality_status: question.quality_status,
    original_selected_choices: [...question.selected_choices],
    original_shaded_choices: [...question.shaded_choices],
    original_crossed_choices: [...question.crossed_choices],
    original_invalid_choices: [...question.invalid_choices],
    resolved_choices: [...normalizedResolvedChoices],
    reviewed_at: reviewTimestamp.toISOString(),
  };

  const resolutions = {
    ...localReview.resolutions,
    [String(questionNumber)]: resolution,
  };

  const resolvedQuestionNumbers = normalizeQuestionNumbers(
    Object.keys(resolutions).map(Number),
  );

  const unresolvedQuestionNumbers =
    localReview.original_review_question_numbers.filter(
      (number) => !resolvedQuestionNumbers.includes(number),
    );

  const answers: Record<string, string[]> = {
    ...submission.answers,
    [String(questionNumber)]: [...normalizedResolvedChoices],
  };

  return {
    ...submission,
    answers,
    questions: submission.questions.map(cloneQuestion),
    review_question_numbers: [...unresolvedQuestionNumbers],
    local_review: {
      state: unresolvedQuestionNumbers.length > 0 ? "pending" : "resolved",
      original_review_question_numbers: [
        ...localReview.original_review_question_numbers,
      ],
      unresolved_question_numbers: [...unresolvedQuestionNumbers],
      resolved_question_numbers: [...resolvedQuestionNumbers],
      resolutions,
    },
  } as T;
}

/*
 * Allows faculty to reopen/change a local clarification BEFORE sync.
 * The effective answer is restored to the original native selection set and
 * the question becomes unresolved again.
 */
export function reopenOmrReviewQuestion<T extends OmrSubmissionPayload>(
  submission: T,
  questionNumber: number,
): T {
  const question = submission.questions.find(
    (item) => item.question_number === questionNumber,
  );

  if (!question) {
    throw new Error(
      `Question ${questionNumber} is missing from the submission.`,
    );
  }

  const localReview = getLocalReview(submission);

  if (!localReview.original_review_question_numbers.includes(questionNumber)) {
    throw new Error(
      `Question ${questionNumber} was not originally marked for review.`,
    );
  }

  const resolutions = { ...localReview.resolutions };
  delete resolutions[String(questionNumber)];

  const resolvedQuestionNumbers = normalizeQuestionNumbers(
    Object.keys(resolutions).map(Number),
  );

  const unresolvedQuestionNumbers =
    localReview.original_review_question_numbers.filter(
      (number) => !resolvedQuestionNumbers.includes(number),
    );

  const answers: Record<string, string[]> = {
    ...submission.answers,
    [String(questionNumber)]: [...question.selected_choices],
  };

  return {
    ...submission,
    answers,
    questions: submission.questions.map(cloneQuestion),
    review_question_numbers: [...unresolvedQuestionNumbers],
    local_review: {
      state: "pending",
      original_review_question_numbers: [
        ...localReview.original_review_question_numbers,
      ],
      unresolved_question_numbers: [...unresolvedQuestionNumbers],
      resolved_question_numbers: [...resolvedQuestionNumbers],
      resolutions,
    },
  } as T;
}

export function isOmrSubmissionReadyToSync(
  submission: OmrSubmissionPayload,
): boolean {
  return submission.review_question_numbers.length === 0;
}

export function assertOmrSubmissionReadyToSync(
  submission: OmrSubmissionPayload,
): void {
  const unresolvedQuestionNumbers = normalizeQuestionNumbers(
    submission.review_question_numbers,
  );

  if (unresolvedQuestionNumbers.length > 0) {
    throw new Error(
      `This OMR submission still needs faculty review for question(s): ${unresolvedQuestionNumbers.join(
        ", ",
      )}. Resolve them before synchronization.`,
    );
  }
}

/*
 * Build the EFFECTIVE server answer-status map.
 *
 * For untouched questions, preserve the original native status.
 * For a faculty-resolved review question:
 *   []       -> blank
 *   [A ...]  -> selected
 *
 * The original ambiguous/unreadable status remains preserved inside
 * `review_metadata` instead of being sent as the effective scoring status.
 */
export function buildOmrEffectiveAnswerStatuses(
  submission: OmrSubmissionPayload,
): Record<string, QuestionInterpretationStatus> {
  const localReview = getLocalReview(submission);
  const statuses: Record<string, QuestionInterpretationStatus> = {};

  for (const question of submission.questions) {
    const resolution =
      localReview.resolutions[String(question.question_number)];

    if (resolution) {
      statuses[String(question.question_number)] =
        resolution.resolved_choices.length === 0 ? "blank" : "selected";
    } else {
      statuses[String(question.question_number)] = question.status;
    }
  }

  return statuses;
}

export function buildOmrPreSyncReviewMetadata(
  submission: OmrSubmissionPayload,
): OmrPreSyncReviewMetadata | null {
  const localReview = getLocalReview(submission);

  if (localReview.original_review_question_numbers.length === 0) {
    return null;
  }

  assertOmrSubmissionReadyToSync(submission);

  const resolutions = localReview.resolved_question_numbers.map(
    (questionNumber) => {
      const resolution = localReview.resolutions[String(questionNumber)];

      if (!resolution) {
        throw new Error(
          `Missing local review resolution for question ${questionNumber}.`,
        );
      }

      return cloneResolution(resolution);
    },
  );

  return {
    source: "faculty_mobile",
    reviewed_before_sync: true,
    original_review_question_numbers: [
      ...localReview.original_review_question_numbers,
    ],
    resolved_question_numbers: [...localReview.resolved_question_numbers],
    resolutions,
  };
}

/*
 * Single helper for the later batch-sync builder.
 *
 * Calling this function is the synchronization gate:
 * unresolved review papers throw and therefore never enter a server batch.
 */
export function buildOmrSyncEvidence(
  submission: OmrSubmissionPayload,
): OmrSyncEvidence {
  assertOmrSubmissionReadyToSync(submission);

  const answers: Record<string, string[]> = {};

  for (
    let questionNumber = 1;
    questionNumber <= submission.question_count;
    questionNumber++
  ) {
    answers[String(questionNumber)] = normalizeChoices(
      submission.answers[String(questionNumber)] ?? [],
    );
  }

  return {
    answers,
    answer_statuses: buildOmrEffectiveAnswerStatuses(submission),
    review_question_numbers: [],
    requires_review: false,
    review_metadata: buildOmrPreSyncReviewMetadata(submission),
  };
}

/*
 * Compatibility wrappers so the current 50-item scan code does not need
 * a large rewrite while we add the 100-item native analyzer.
 */
export function buildOmrSubmissionPayload50(
  result: Analyze50QuestionsResult,
): OmrSubmissionPayload50 {
  return buildOmrSubmissionPayload(result, 50) as OmrSubmissionPayload50;
}

export function buildOmrSubmissionPayload100(
  result: AnalyzeQuestionsResultLike,
): OmrSubmissionPayload100 {
  return buildOmrSubmissionPayload(result, 100) as OmrSubmissionPayload100;
}
