import type {
  Analyze50QuestionsResult,
  QuestionInterpretationStatus,
  QuestionQualityStatus,
} from "./index";

export type OmrQuestionCount = 50 | 100;
export type OmrSheetFormat = "50" | "100";

export type OmrSubmissionQuestionPayload = {
  question_number: number;
  answer: string | null;
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
  ambiguous: number;
  unreadable: number;
};

export type OmrSubmissionCounts = {
  accepted: number;
  review: number;
  reject: number;
  statuses: OmrSubmissionStatusCounts;
};

export type OmrSubmissionPayload = {
  format: OmrSheetFormat;
  question_count: OmrQuestionCount;
  answers: Record<string, string | null>;
  questions: OmrSubmissionQuestionPayload[];
  review_question_numbers: number[];
  counts: OmrSubmissionCounts;
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
      | "ambiguous"
      | "unreadable",
      number
    >
  >;

  acceptedCount: number;
  reviewCount: number;
  rejectCount: number;
};

const SCOREABLE_STATUSES = new Set<QuestionInterpretationStatus>([
  "selected",
  "selected_with_correction",
]);

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

  const answers: Record<string, string | null> = {};
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

    const scoreable =
      SCOREABLE_STATUSES.has(question.status) && question.answer !== null;

    const normalizedAnswer = scoreable ? question.answer : null;

    answers[String(question.question)] = normalizedAnswer;

    questions.push({
      question_number: question.question,
      answer: normalizedAnswer,
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

  reviewQuestionNumbers.sort((a, b) => a - b);

  return {
    format: getOmrSheetFormat(questionCount),

    question_count: questionCount,

    answers,
    questions,

    review_question_numbers: reviewQuestionNumbers,

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

        ambiguous: result.statusCounts.ambiguous ?? 0,

        unreadable: result.statusCounts.unreadable ?? 0,
      },
    },
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
