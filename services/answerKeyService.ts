import { Directory, File, Paths } from "expo-file-system";

import GradeLensOmr from "@/../modules/gradelens-omr";

import { decryptOmrPackage } from "@/crypto/omrPackageDecryption";

import type {
  AnswerKey,
  AnswerKey100,
  AnswerKey50,
} from "@/../modules/gradelens-omr/scoring";

import {
  getOmrSheetFormat,
  normalizeOmrQuestionCount,
} from "@/../modules/gradelens-omr/submission";

import type { OmrQuestionCount } from "@/../modules/gradelens-omr/submission";

function getTemporaryAnswerKeyDirectory(): Directory {
  return new Directory(Paths.cache, "gradelens", "answer-key");
}

function ensureTemporaryAnswerKeyDirectory(): void {
  const directory = getTemporaryAnswerKeyDirectory();

  if (directory.exists) {
    return;
  }

  directory.create({
    intermediates: true,
    idempotent: true,
  });
}

function safeDeleteFile(uri: string | null): void {
  if (!uri) {
    return;
  }

  try {
    const file = new File(uri);

    if (file.exists) {
      file.delete();
    }
  } catch {
    // Cleanup must never hide the real decryption/OMR error.
  }
}

export async function loadAnswerKey(
  courseTestId: number,
  questionCount: OmrQuestionCount,
): Promise<AnswerKey> {
  if (!Number.isFinite(courseTestId) || courseTestId <= 0) {
    throw new Error(
      "A valid course test ID is required to load the answer key.",
    );
  }

  const actualQuestionCount = normalizeOmrQuestionCount(questionCount);
  const sheetFormat = getOmrSheetFormat(actualQuestionCount);
  const layoutQuestionCount = sheetFormat === "50" ? 50 : 100;

  const plaintextPng = await decryptOmrPackage(courseTestId);

  ensureTemporaryAnswerKeyDirectory();

  const temporaryFile = new File(
    getTemporaryAnswerKeyDirectory(),
    `${courseTestId}-${actualQuestionCount}-${Date.now()}.png`,
  );

  let normalizedUri: string | null = null;

  try {
    temporaryFile.create({
      intermediates: true,
    });

    temporaryFile.write(plaintextPng);

    const normalized = await GradeLensOmr.normalizeSheet(temporaryFile.uri);

    if (!normalized.success) {
      throw new Error(
        "GradeLens could not normalize the decrypted answer-key image.",
      );
    }

    normalizedUri = normalized.normalizedUri;

    // The native reader parses the physical layout but validates only the
    // actual questions configured for this Course Test.
    const result =
      sheetFormat === "50"
        ? await GradeLensOmr.readAnswerKey50(
            normalized.normalizedUri,
            actualQuestionCount,
          )
        : await GradeLensOmr.readAnswerKey100(
            normalized.normalizedUri,
            actualQuestionCount,
          );

    if (!result.success) {
      const invalidQuestions =
        result.invalidQuestionNumbers.length > 0
          ? result.invalidQuestionNumbers.join(", ")
          : "unknown";

      throw new Error(
        "The decrypted answer key is not valid for scoring. " +
          `Invalid questions: ${invalidQuestions}.`,
      );
    }

    if (result.questionCount !== layoutQuestionCount) {
      throw new Error(
        `Answer-key layout mismatch. Expected ${layoutQuestionCount} physical positions, received ${result.questionCount}.`,
      );
    }

    if (result.answerCount !== actualQuestionCount) {
      throw new Error(
        `Expected ${actualQuestionCount} answer-key entries, received ${result.answerCount}.`,
      );
    }

    const answerKey: AnswerKey = {};

    for (
      let questionNumber = 1;
      questionNumber <= actualQuestionCount;
      questionNumber++
    ) {
      const answer = result.answers[String(questionNumber)];

      if (!Array.isArray(answer) || answer.length === 0) {
        throw new Error(
          `The answer key is missing question ${questionNumber}.`,
        );
      }

      answerKey[questionNumber] = [...answer];
    }

    return answerKey;
  } finally {
    safeDeleteFile(normalizedUri);

    safeDeleteFile(temporaryFile.uri);
  }
}

/*
 * Compatibility wrappers.
 */
export async function loadAnswerKey50(
  courseTestId: number,
): Promise<AnswerKey50> {
  return await loadAnswerKey(courseTestId, 50);
}

export async function loadAnswerKey100(
  courseTestId: number,
): Promise<AnswerKey100> {
  return await loadAnswerKey(courseTestId, 100);
}
