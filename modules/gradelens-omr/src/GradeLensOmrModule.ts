import { requireNativeModule } from "expo-modules-core";

export type MarkerDetectionResult = {
  success: boolean;

  markerCount: number;

  markerIds: number[];

  missingIds: number[];

  rejectedCount: number;

  openCvVersion: string;
};

export type NormalizeSheetResult = {
  success: boolean;

  markerIds: number[];

  missingIds: number[];

  normalizedUri: string;

  width: number;

  height: number;

  openCvVersion: string;
};

export type CoverageRole = "unshaded" | "shaded" | "invalid";

export type BubbleCoverageResult = {
  choice: string;

  centerX: number;

  centerY: number;

  backgroundMedian: number;

  darkThreshold: number;

  coverage: number;

  markedPixels: number;

  analysisPixels: number;

  backgroundPixels: number;

  role: CoverageRole;
};

export type QuestionCoverageResult = {
  question: number;

  bubbles: BubbleCoverageResult[];
};

export type Analyze50CoverageResult = {
  success: boolean;

  questionCount: number;

  bubbleCount: number;

  unshadedCount: number;

  shadedCount: number;

  invalidCount: number;

  thresholds: {
    unshadedMax: number;

    shadedMin: number;

    pixelDarknessExcess: number;
  };

  questions: QuestionCoverageResult[];
};

type GradeLensOmrModuleType = {
  hello(): string;

  getOpenCvVersion(): string;

  detectMarkers(imageUri: string): Promise<MarkerDetectionResult>;

  normalizeSheet(imageUri: string): Promise<NormalizeSheetResult>;

  analyze50Coverage(
    normalizedImageUri: string,
  ): Promise<Analyze50CoverageResult>;

  analyze50Crosses(normalizedImageUri: string): Promise<Analyze50CrossResult>;

  analyze50FinalRoles(
    normalizedImageUri: string,
  ): Promise<Analyze50FinalRolesResult>;
};

export default requireNativeModule<GradeLensOmrModuleType>("GradeLensOmr");

export type CrossState = "not_crossed" | "possible_cross" | "definite_cross";

export type BubbleCrossResult = {
  choice: string;

  crossScore: number;

  mainArmScore: number;

  antiArmScore: number;

  diagonalBalance: number;

  backgroundDarkness: number;

  bestMainAngle: number;

  bestAntiAngle: number;

  bestCenterOffsetX: number;

  bestCenterOffsetY: number;

  crossState: CrossState;

  predictedCross: boolean;

  needsReview: boolean;
};

export type QuestionCrossResult = {
  question: number;

  bubbles: BubbleCrossResult[];
};

export type Analyze50CrossResult = {
  success: boolean;

  questionCount: number;

  bubbleCount: number;

  definiteCrossCount: number;

  possibleCrossCount: number;

  possibleThreshold: number;

  definiteThreshold: number;

  questions: QuestionCrossResult[];
};

export type FinalBubbleRole = "unshaded" | "shaded" | "crossed" | "invalid";

export type FinalBubbleResult = {
  choice: string;

  coverage: number;

  crossScore: number;

  crossState: CrossState;

  finalRole: FinalBubbleRole;

  needsReview: boolean;
};

export type FinalQuestionResult = {
  question: number;

  bubbles: FinalBubbleResult[];
};

export type Analyze50FinalRolesResult = {
  success: boolean;

  questionCount: number;

  bubbleCount: number;

  unshadedCount: number;

  shadedCount: number;

  crossedCount: number;

  invalidCount: number;

  questions: FinalQuestionResult[];
};
