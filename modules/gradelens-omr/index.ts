import { requireNativeModule } from "expo-modules-core";

export type BubbleClassifierLabel =
  | "Crossed_Bubble"
  | "Unshaded_Bubble"
  | "Shaded_Bubble"
  | "Invalid_Bubble";

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
  timingMs: {
    total: number;
    imageLoad: number;
    markerDetection: number;
    perspectiveWarp: number;
    saveNormalizedImage: number;
  };
};

export type HybridFinalRole = "unshaded" | "shaded" | "crossed" | "invalid";

export type QuestionInterpretationStatus =
  | "blank"
  | "selected"
  | "selected_with_correction"
  | "crossed_without_replacement"
  | "multiple"
  | "ambiguous"
  | "unreadable";

export type QuestionQualityStatus = "accepted" | "review" | "reject";

export type InterpretedQuestionBubble = {
  choice: string;
  finalRole: HybridFinalRole;
  cnnLabel: BubbleClassifierLabel;
  cnnConfidence: number;
  coverage: number;
  coverageRole: string;
  crossScore: number;
  crossState: string;
};

export type InterpretedQuestionResult = {
  question: number;
  answer: string | null;
  status: QuestionInterpretationStatus;
  qualityStatus: QuestionQualityStatus;
  needsReview: boolean;
  shadedChoices: string[];
  crossedChoices: string[];
  invalidChoices: string[];
  bubbles: InterpretedQuestionBubble[];
};

export type AnswerKeyBubbleResult = {
  choice: string;
  coverage: number;
  role: "unshaded" | "shaded" | "invalid" | string;
  backgroundMedian: number;
  darkThreshold: number;
};

export type AnswerKeyQuestionResult = {
  question: number;
  answer: string[];
  valid: boolean;
  shadedChoices: string[];
  invalidChoices: string[];
  bubbles: AnswerKeyBubbleResult[];
};

export type ReadAnswerKey50Result = {
  success: boolean;
  questionCount: 50;
  answerCount: number;
  shadedBubbleCount: number;
  invalidBubbleCount: number;
  invalidQuestionNumbers: number[];
  answers: Record<string, string[]>;
  questions: AnswerKeyQuestionResult[];
};

export type ReadAnswerKey100Result = {
  success: boolean;
  questionCount: 100;
  answerCount: number;
  shadedBubbleCount: number;
  invalidBubbleCount: number;
  invalidQuestionNumbers: number[];
  answers: Record<string, string[]>;
  questions: AnswerKeyQuestionResult[];
};

export type Analyze50QuestionsResult = {
  success: boolean;
  questionCount: number;
  cropSize: number;
  statusCounts: Record<QuestionInterpretationStatus, number>;
  acceptedCount: number;
  reviewCount: number;
  rejectCount: number;
  crossExecutedCount: number;
  crossSkippedCount: number;
  crossProfileMs: {
    analyzeCount: number;
    totalAnalyze: number;
    contextCrop: number;
    darknessTotal: number;
    grayscale: number;
    clahe: number;
    gaussianBlur: number;
    darknessConvert: number;
    darknessBulkRead: number;
    geometryBuild: number;
    backgroundScan: number;
    angleSearch: number;
    mainAngleSearch: number;
    antiAngleSearch: number;
    candidateSelection: number;
  };
  cnnProfileMs: {
    predictCount: number;
    totalPredict: number;
    resize: number;
    imageInput: number;
    densityTotal: number;
    densityGray: number;
    densityHistogram: number;
    structuralTotal: number;
    structuralGray: number;
    canny: number;
    edgeDensity: number;
    houghLines: number;
    structuralPack: number;
    tfliteInference: number;
    outputParsing: number;
  };
  timingMs: {
    total: number;
    imageLoad: number;
    grayscale: number;
    classifierInit: number;
    crop: number;
    cnn: number;
    coverage: number;
    cross: number;
    resolver: number;
    interpreter: number;
  };
  questions: InterpretedQuestionResult[];
};

/*
 * The 100-item analyzer intentionally returns the same structural contract
 * as the 50-item analyzer; questionCount/questions simply cover 1..100.
 */
export type Analyze100QuestionsResult = Analyze50QuestionsResult;

export type ReadSheetQr50Result = {
  success: boolean;
  rawValue: string;
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  timingMs: number;
};

export type StudentIdDigitResult = {
  position: number;
  digit: number;
  confidence: number;
  cropUri: string;
  binaryUri: string;
  modelInputUri: string;
};

export type ReadStudentId50Result = {
  success: boolean;
  studentId: string;
  digits: StudentIdDigitResult[];
  minConfidence: number;
  averageConfidence: number;
  weakPositions: number[];
};

type GradeLensOmrModule = {
  hello(): string;

  getOpenCvVersion(): string;

  detectMarkers(imageUri: string): Promise<MarkerDetectionResult>;

  normalizeSheet(imageUri: string): Promise<NormalizeSheetResult>;

  readSheetQr50(normalizedImageUri: string): Promise<ReadSheetQr50Result>;

  readAnswerKey50(normalizedImageUri: string): Promise<ReadAnswerKey50Result>;

  readAnswerKey100(normalizedImageUri: string): Promise<ReadAnswerKey100Result>;

  analyze50Questions(
    normalizedImageUri: string,
  ): Promise<Analyze50QuestionsResult>;

  analyze100Questions(
    normalizedImageUri: string,
  ): Promise<Analyze100QuestionsResult>;

  readStudentId50(normalizedImageUri: string): Promise<ReadStudentId50Result>;
};

export default requireNativeModule<GradeLensOmrModule>("GradeLensOmr");
