import GradeLensOmr from "./index";

import { getOmrSheetFormat } from "./submission";

import type {
  AnalyzeQuestionsResultLike,
  OmrQuestionCount,
} from "./submission";

/*
 * Single authoritative routing point.
 *
 * QR -> Course Test -> question_count -> physical sheet format
 *
 * 1–50 questions  -> 50-item sheet analyzer
 * 51–100 questions -> 100-item sheet analyzer
 */
export async function analyzeQuestionsForPaper(
  normalizedImageUri: string,
  questionCount: OmrQuestionCount,
): Promise<AnalyzeQuestionsResultLike> {
  const format = getOmrSheetFormat(questionCount);

  switch (format) {
    case "50":
      return GradeLensOmr.analyze50Questions(normalizedImageUri);

    case "100":
      return GradeLensOmr.analyze100Questions(normalizedImageUri);

    default:
      throw new Error(`Unsupported OMR sheet format: ${String(format)}`);
  }
}
