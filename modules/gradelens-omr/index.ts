import { requireNativeModule } from "expo-modules-core";

export type BubbleClassifierLabel =
  | "Crossed_Bubble"
  | "Unshaded_Bubble"
  | "Shaded_Bubble"
  | "Invalid_Bubble";

export type BubbleProbabilities = {
  Crossed_Bubble: number;
  Unshaded_Bubble: number;
  Shaded_Bubble: number;
  Invalid_Bubble: number;
};

export type BubbleCropInfo = {
  centerX: number;
  centerY: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

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

export type CrossBubbleResult = {
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
  crossState: string;
  predictedCross: boolean;
  needsReview: boolean;
};

export type Analyze50CrossesResult = {
  success: boolean;
  questionCount: number;
  bubbleCount: number;
  definiteCrossCount: number;
  possibleCrossCount: number;
  possibleThreshold: number;
  definiteThreshold: number;
  questions: Array<{
    question: number;
    bubbles: CrossBubbleResult[];
  }>;
};

export type CoverageBubbleResult = {
  choice: string;
  centerX: number;
  centerY: number;
  backgroundMedian: number;
  darkThreshold: number;
  coverage: number;
  markedPixels: number;
  analysisPixels: number;
  backgroundPixels: number;
  role: string;
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
  questions: Array<{
    question: number;
    bubbles: CoverageBubbleResult[];
  }>;
};

export type FinalRoleBubbleResult = {
  choice: string;
  coverage: number;
  crossScore: number;
  crossState: string;
  finalRole: string;
  needsReview: boolean;
};

export type Analyze50FinalRolesResult = {
  success: boolean;
  questionCount: number;
  bubbleCount: number;
  unshadedCount: number;
  shadedCount: number;
  crossedCount: number;
  invalidCount: number;
  questions: Array<{
    question: number;
    bubbles: FinalRoleBubbleResult[];
  }>;
};

export type BubbleClassifierTestResult = {
  success: boolean;
  question: number;
  choice: string;
  crop: BubbleCropInfo;
  label: BubbleClassifierLabel;
  classIndex: number;
  confidence: number;
  margin: number;
  probabilities: BubbleProbabilities;
};

export type BubbleClassifierParityRow = {
  question: number;
  choice: string;
  expectedPhysicalRole:
    | "unshaded"
    | "shaded"
    | "crossed"
    | "partial_or_invalid"
    | string;
  note: string;
  crop: BubbleCropInfo;
  label: BubbleClassifierLabel;
  classIndex: number;
  confidence: number;
  margin: number;
  probabilities: BubbleProbabilities;
};

export type BubbleClassifierParity50Result = {
  success: boolean;
  questionCount: number;
  testedBubbleCount: number;
  cropSize: number;
  classCounts: Record<BubbleClassifierLabel, number>;
  results: BubbleClassifierParityRow[];
};

export type CnnBubbleResult = {
  choice: string;
  crop: BubbleCropInfo;
  label: BubbleClassifierLabel;
  classIndex: number;
  confidence: number;
  margin: number;
  probabilities: BubbleProbabilities;
};

export type Analyze50CnnResult = {
  success: boolean;
  questionCount: number;
  bubbleCount: number;
  predictionCount: number;
  cropSize: number;
  classCounts: Record<BubbleClassifierLabel, number>;
  questions: Array<{
    question: number;
    bubbles: CnnBubbleResult[];
  }>;
};

export type SignalCnnResult = {
  label: BubbleClassifierLabel;
  classIndex: number;
  confidence: number;
  margin: number;
  probabilities: BubbleProbabilities;
};

export type SignalCoverageResult = {
  value: number;
  role: "unshaded" | "shaded" | "invalid" | string;
  backgroundMedian: number;
  darkThreshold: number;
  markedPixels: number;
  analysisPixels: number;
  backgroundPixels: number;
};

export type SignalCrossResult = {
  crossScore: number;
  mainArmScore: number;
  antiArmScore: number;
  diagonalBalance: number;
  backgroundDarkness: number;
  bestMainAngle: number;
  bestAntiAngle: number;
  bestCenterOffsetX: number;
  bestCenterOffsetY: number;
  crossState: "not_crossed" | "possible_cross" | "definite_cross" | string;
  predictedCross: boolean;
  needsReview: boolean;
};

export type SignalBubbleResult = {
  choice: string;
  centerX: number;
  centerY: number;
  cnn: SignalCnnResult;
  coverage: SignalCoverageResult;
  cross: SignalCrossResult;
};

export type Analyze50SignalsResult = {
  success: boolean;
  questionCount: number;
  bubbleCount: number;
  predictionCount: number;
  signalCount: number;
  cropSize: number;
  cnnClassCounts: Record<BubbleClassifierLabel, number>;
  coverageRoleCounts: Record<string, number>;
  crossStateCounts: Record<string, number>;
  coverageThresholds: {
    unshadedMax: number;
    shadedMin: number;
    pixelDarknessExcess: number;
  };
  crossThresholds: {
    possible: number;
    definite: number;
  };
  questions: Array<{
    question: number;
    bubbles: SignalBubbleResult[];
  }>;
};

export type HybridFinalRole = "unshaded" | "shaded" | "crossed" | "invalid";

export type HybridBubbleResult = {
  choice: string;
  centerX: number;
  centerY: number;
  cnn: SignalCnnResult;
  coverage: {
    value: number;
    role: "unshaded" | "shaded" | "invalid" | string;
  };
  cross: {
    crossScore: number;
    crossState: "not_crossed" | "possible_cross" | "definite_cross" | string;
    predictedCross: boolean;
    needsReview: boolean;
  };
  cnnPhysicalRole: HybridFinalRole;
  directAgreement: boolean;
  finalRole: HybridFinalRole;
  needsReview: boolean;
};

export type Analyze50HybridRolesResult = {
  success: boolean;
  questionCount: number;
  bubbleCount: number;
  cropSize: number;
  finalRoleCounts: Record<HybridFinalRole, number>;
  cnnClassCounts: Record<BubbleClassifierLabel, number>;
  coverageRoleCounts: Record<string, number>;
  crossStateCounts: Record<string, number>;
  agreementCount: number;
  disagreementCount: number;
  reviewCount: number;
  questions: Array<{
    question: number;
    bubbles: HybridBubbleResult[];
  }>;
};

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

  analyze50Crosses(normalizedImageUri: string): Promise<Analyze50CrossesResult>;

  analyze50Coverage(
    normalizedImageUri: string,
  ): Promise<Analyze50CoverageResult>;

  analyze50FinalRoles(
    normalizedImageUri: string,
  ): Promise<Analyze50FinalRolesResult>;

  testBubbleClassifier50(
    normalizedImageUri: string,
  ): Promise<BubbleClassifierTestResult>;

  testBubbleClassifierParity50(
    normalizedImageUri: string,
  ): Promise<BubbleClassifierParity50Result>;

  analyze50Cnn(normalizedImageUri: string): Promise<Analyze50CnnResult>;

  analyze50Signals(normalizedImageUri: string): Promise<Analyze50SignalsResult>;

  analyze50HybridRoles(
    normalizedImageUri: string,
  ): Promise<Analyze50HybridRolesResult>;

  readSheetQr50(normalizedImageUri: string): Promise<ReadSheetQr50Result>;

  readAnswerKey50(
    normalizedImageUri: string,
    actualQuestionCount: number,
  ): Promise<ReadAnswerKey50Result>;

  readAnswerKey100(
    normalizedImageUri: string,
    actualQuestionCount: number,
  ): Promise<ReadAnswerKey100Result>;

  analyze50Questions(
    normalizedImageUri: string,
  ): Promise<Analyze50QuestionsResult>;

  analyze100Questions(
    normalizedImageUri: string,
  ): Promise<Analyze100QuestionsResult>;

  readStudentId50(normalizedImageUri: string): Promise<ReadStudentId50Result>;
};

export default requireNativeModule<GradeLensOmrModule>("GradeLensOmr");
