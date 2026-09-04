import type {
  OmrQuestionCount,
  OmrSubmissionPayload,
  OmrSubmissionPayload100,
  OmrSubmissionPayload50,
} from "./submission";

export type AnswerKey = Record<number, string[]>;
export type AnswerKey50 = AnswerKey;
export type AnswerKey100 = AnswerKey;

export type TentativeQuestionScore = {
  question_number: number;
  student_answers: string[];
  correct_answers: string[];
  status: "correct" | "incorrect" | "unanswered" | "missing_key";
  needs_review: boolean;
};

export type TentativeScoreResult = {
  tentative: true;
  score: number;
  total_questions: OmrQuestionCount;
  keyed_questions: number;
  answered: number;
  unanswered: number;
  correct: number;
  incorrect: number;
  missing_key: number;
  review_question_numbers: number[];
  missing_key_question_numbers: number[];
  questions: TentativeQuestionScore[];
};

export type TentativeScoreResult50 = TentativeScoreResult & {
  total_questions: 50;
};

export type TentativeScoreResult100 = TentativeScoreResult & {
  total_questions: 100;
};

const VALID_CHOICES = ["A", "B", "C", "D", "E"] as const;

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

function arraysEqual(first: string[], second: string[]): boolean {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function buildReviewSet(reviewQuestionNumbers: number[]): Set<number> {
  return new Set(
    reviewQuestionNumbers.filter((questionNumber) =>
      Number.isInteger(questionNumber),
    ),
  );
}

/*
 * Tentative scoring rules:
 *
 * - No shaded choices -> unanswered.
 * - Exact single-answer match -> correct.
 * - Exact multiple-answer match -> correct.
 * - Order of multiple answers does not matter.
 * - Missing or extra choices -> incorrect.
 * - Crossed/invalid choices are not treated as selected answers because
 *   scoring uses the interpreter's shaded_choices field.
 * - A review flag does not automatically make an answer incorrect.
 * - Missing answer key -> missing_key and is not scored.
 *
 * The same rules are used for both 50- and 100-item papers.
 */
export function scoreOmrSubmission(
  submission: OmrSubmissionPayload,
  answerKey: AnswerKey,
): TentativeScoreResult {
  const questionCount = submission.question_count;

  if (questionCount !== 50 && questionCount !== 100) {
    throw new Error(
      `Unsupported OMR submission size: ${questionCount}. Expected 50 or 100.`,
    );
  }

  if (submission.format !== String(questionCount)) {
    throw new Error(
      `OMR format mismatch. format=${submission.format}, question_count=${questionCount}.`,
    );
  }

  if (submission.questions.length !== questionCount) {
    throw new Error(
      `Expected ${questionCount} stored questions, received ${submission.questions.length}.`,
    );
  }

  const reviewSet = buildReviewSet(submission.review_question_numbers);

  const submissionQuestionMap = new Map<
    number,
    OmrSubmissionPayload["questions"][number]
  >();

  for (const question of submission.questions) {
    if (
      !Number.isInteger(question.question_number) ||
      question.question_number < 1 ||
      question.question_number > questionCount
    ) {
      throw new Error(
        `Invalid stored OMR question number: ${question.question_number}.`,
      );
    }

    if (submissionQuestionMap.has(question.question_number)) {
      throw new Error(
        `Duplicate stored OMR question number: ${question.question_number}.`,
      );
    }

    submissionQuestionMap.set(question.question_number, question);
  }

  if (submissionQuestionMap.size !== questionCount) {
    throw new Error(
      `Expected ${questionCount} unique stored questions, received ${submissionQuestionMap.size}.`,
    );
  }

  let correct = 0;
  let incorrect = 0;
  let answered = 0;
  let unanswered = 0;
  let missingKey = 0;
  let keyedQuestions = 0;

  const missingKeyQuestionNumbers: number[] = [];
  const questions: TentativeQuestionScore[] = [];

  for (
    let questionNumber = 1;
    questionNumber <= questionCount;
    questionNumber++
  ) {
    const correctAnswers = normalizeChoices(answerKey[questionNumber] ?? []);

    const submissionQuestion = submissionQuestionMap.get(questionNumber);

    if (correctAnswers.length === 0) {
      missingKey++;
      missingKeyQuestionNumbers.push(questionNumber);

      questions.push({
        question_number: questionNumber,
        student_answers: [],
        correct_answers: [],
        status: "missing_key",
        needs_review: reviewSet.has(questionNumber),
      });

      continue;
    }

    keyedQuestions++;

    /*
     * IMPORTANT:
     * Use shaded_choices rather than the single "answer" field.
     *
     * This is what allows:
     *
     *   key ["A"]       + student ["A"]       -> correct
     *   key ["A","C"]   + student ["C","A"]   -> correct
     *   key ["A","C"]   + student ["A"]      -> incorrect
     *   key ["A","C"]   + student ["A","C","D"] -> incorrect
     *
     * Therefore multiple-answer questions work naturally for both
     * 50-item and 100-item sheets.
     */
    const studentAnswers = submissionQuestion?.shaded_choices ?? [];

    const normalizedStudentAnswers = normalizeChoices(studentAnswers);

    const needsReview =
      reviewSet.has(questionNumber) ||
      submissionQuestion?.needs_review === true ||
      submissionQuestion?.quality_status === "review" ||
      submissionQuestion?.quality_status === "reject";

    if (normalizedStudentAnswers.length === 0) {
      unanswered++;

      questions.push({
        question_number: questionNumber,
        student_answers: [],
        correct_answers: correctAnswers,
        status: "unanswered",
        needs_review: needsReview,
      });

      continue;
    }

    answered++;

    if (arraysEqual(normalizedStudentAnswers, correctAnswers)) {
      correct++;

      questions.push({
        question_number: questionNumber,
        student_answers: normalizedStudentAnswers,
        correct_answers: correctAnswers,
        status: "correct",
        needs_review: needsReview,
      });
    } else {
      incorrect++;

      questions.push({
        question_number: questionNumber,
        student_answers: normalizedStudentAnswers,
        correct_answers: correctAnswers,
        status: "incorrect",
        needs_review: needsReview,
      });
    }
  }

  return {
    tentative: true,
    score: correct,
    total_questions: questionCount,
    keyed_questions: keyedQuestions,
    answered,
    unanswered,
    correct,
    incorrect,
    missing_key: missingKey,
    review_question_numbers: [...reviewSet].sort((a, b) => a - b),
    missing_key_question_numbers: missingKeyQuestionNumbers.sort(
      (a, b) => a - b,
    ),
    questions,
  };
}

export function scoreOmrSubmission50(
  submission: OmrSubmissionPayload50,
  answerKey: AnswerKey50,
): TentativeScoreResult50 {
  if (submission.question_count !== 50) {
    throw new Error(
      `Expected a 50-item submission, received ${submission.question_count}.`,
    );
  }

  return scoreOmrSubmission(submission, answerKey) as TentativeScoreResult50;
}

export function scoreOmrSubmission100(
  submission: OmrSubmissionPayload100,
  answerKey: AnswerKey100,
): TentativeScoreResult100 {
  if (submission.question_count !== 100) {
    throw new Error(
      `Expected a 100-item submission, received ${submission.question_count}.`,
    );
  }

  return scoreOmrSubmission(submission, answerKey) as TentativeScoreResult100;
}
