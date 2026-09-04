import GradeLensOmr from "./index";

import type {
  AnalyzeQuestionsResultLike,
  OmrQuestionCount,
} from "./submission";

/*
 * Single authoritative routing point.
 *
 * Paper type is NOT guessed from pixels.
 *
 * QR -> Course Test -> local question_count -> exact native analyzer
 */
export async function analyzeQuestionsForPaper(
  normalizedImageUri: string,
  questionCount: OmrQuestionCount,
): Promise<AnalyzeQuestionsResultLike> {
  switch (questionCount) {
    case 50:
      return await GradeLensOmr.analyze50Questions(normalizedImageUri);

    case 100:
      return await GradeLensOmr.analyze100Questions(normalizedImageUri);
  }
}
