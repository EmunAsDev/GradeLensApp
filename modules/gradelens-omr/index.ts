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

export type HybridFinalRole =
  | "unshaded"
  | "shaded"
  | "crossed"
  | "invalid"
  | "review";

export type QuestionInterpretationStatus =
  | "blank"
  | "selected"
  | "selected_with_correction"
  | "crossed_without_replacement"
  // Legacy stored-payload compatibility only. Checkpoint 4.7B native
  // interpretation no longer emits "multiple"; multiple valid physical
  // selections are represented by selectedChoices[].
  | "multiple"
  | "invalid"
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
  backgroundMedian: number;
  darkThreshold: number;

  // Pipeline V2 normalization diagnostics. These are measurement-only in
  // Normalization Checkpoint 1 and do not change the Checkpoint 6 resolver.
  backgroundMean: number;
  backgroundStdDev: number;
  backgroundP10: number;
  backgroundP90: number;
  backgroundRobustSpread: number;
  interiorMeanLuminance: number;
  interiorMedianLuminance: number;
  interiorRelativeDarknessMean: number;
  interiorRelativeDarknessMedian: number;
  interiorCoverageWeak: number;
  interiorCoverageNormal: number;
  interiorCoverageStrong: number;
  interiorCoverageVeryStrong: number;
  strongToNormalPersistence: number;
  veryStrongToNormalPersistence: number;
  outlineBandCoverageNormal: number;

  coreCoverage: number;
  sectorCoverages: number[];
  minSectorCoverage: number;
  maxSectorCoverage: number;
  sectorSpread: number;

  grid3x3Coverages: number[];
  minGridCoverage: number;
  maxGridCoverage: number;
  gridSpread: number;

  radialCoverages: number[];
  minRadialCoverage: number;
  maxRadialCoverage: number;
  radialSpread: number;

  markCentroidOffsetRatio: number;

  normalizedCoverage: number;
  normalizedCoverageRole: string;
  normalizedBackgroundMedian: number;
  normalizedDarkThreshold: number;
  normalizedInteriorRelativeDarknessMean: number;
  normalizedInteriorRelativeDarknessMedian: number;
  normalizedInteriorCoverageWeak: number;
  normalizedInteriorCoverageNormal: number;
  normalizedInteriorCoverageStrong: number;
  normalizedInteriorCoverageVeryStrong: number;
  normalizedOutlineBandCoverageNormal: number;

  quickCrossScore: number;
  quickCrossPlausible: boolean;
  quickCrossDiagonalBalance: number;

  crossScore: number;
  crossState: string;
  crossDiagonalBalance: number;
  crossBackgroundDarkness: number;

  hasYoloProposal: boolean;
  yoloConfidence: number;
  shadowLadderRoute:
    | "clear_blank_fast_exit"
    | "fill_validation"
    | "cross_verification"
    | "uncertain_candidate"
    | string;
  shadowClearBlankCandidate: boolean;

  resolutionReason: string;

  // Checkpoint 4.7A production mark semantics.
  // `shadeCompletenessScore` is a normalized GradeLens completeness score,
  // not a literal percentage of black pixels.
  shadeCompletenessScore?: number;
  shadeCompletenessThreshold?: number;
  shadeEdgeReachRatio?: number;
  shadeEdgeReachMin?: number;
  shadeRawSupportMin?: number;
  invalidReason?: "insufficient_shade" | string;
};

export type InterpretedQuestionResult = {
  question: number;

  // Legacy convenience field. Populated only when exactly one valid selected
  // choice remains. Use selectedChoices for authoritative physical selections.
  answer: string | null;

  // Checkpoint 4.7B: one or many valid choices may be selected. Mobile OMR
  // reports the physical set; authoritative correctness is decided later.
  selectedChoices: string[];

  status: QuestionInterpretationStatus;
  qualityStatus: QuestionQualityStatus;
  needsReview: boolean;
  shadedChoices: string[];
  crossedChoices: string[];
  invalidChoices: string[];
  reviewChoices: string[];
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

export type ChoiceCalibrationResult = {
  choice: string;
  rawCoverageMedian: number;
  effectiveUnshadedRecoveryMax: number;
  sampleCount: number;
};

export type SheetCalibrationResult = {
  mode: string;
  rawCoverageMedian: number;
  effectiveUnshadedRecoveryMax: number;
  hardMax: number;
  sampleCount: number;
  choiceCalibrations?: ChoiceCalibrationResult[];
};

export type NormalizationSignalProfileSummary = {
  sampleCount: number;
  localBackgroundMedian: number;
  localBackgroundP10: number;
  localBackgroundP90: number;
  localBackgroundSpread: number;
  localBackgroundNoiseMedian: number;
  localBackgroundRobustSpreadMedian: number;
  interiorRelativeDarknessMeanMedian: number;
  interiorRelativeDarknessMedianMedian: number;
  interiorCoverageWeakMedian: number;
  interiorCoverageNormalMedian: number;
  interiorCoverageStrongMedian: number;
  interiorCoverageVeryStrongMedian: number;
  outlineBandCoverageNormalMedian: number;
};

export type NormalizationBaselineResult = {
  mode: string;
  decisionBehavior: string;
  interiorRadiusMm: number;
  analysisRadiusMm: number;
  outlineBandInnerRadiusMm: number;
  outlineBandOuterRadiusMm: number;
  darknessThresholds: {
    weak: number;
    normal: number;
    strong: number;
    veryStrong: number;
  };
  raw: NormalizationSignalProfileSummary;
  clahe: NormalizationSignalProfileSummary;
};

export type EscalationLadderResult = {
  mode: string;
  semantics: string;
  yoloCacheUsed: boolean;
  yoloProposalCount: number;
  bubbleCount: number;
  clearBlankFastExitCandidateCount: number;
  markCandidateCount: number;
  proposedCnnSkippedCount: number;
  proposedCnnExecutedCount: number;
  fillValidationRouteCount: number;
  crossVerificationRouteCount: number;
  uncertainRouteCount: number;
  quickCrossPrecheckCount: number;
  quickCrossPlausibleCount: number;
  quickCrossPossibleThreshold: number;
  quickCrossPrecheckMs: number;
  clearBlankThresholds: {
    coverageMax: number;
    interiorNormalMax: number;
    interiorStrongMax: number;
    coreCoverageMax: number;
  };
  controlSamples: Array<{
    question: number;
    choice: string;
    hasYoloProposal: boolean;
    yoloConfidence: number;
    shadowRoute: string;
    clearBlankCandidate: boolean;
    cnnLabel: BubbleClassifierLabel;
    cnnConfidence: number;
    rawCoverage: number;
    interiorCoverageNormal: number;
    interiorCoverageStrong: number;
    coreCoverage: number;
    quickCrossScore: number;
    quickCrossPlausible: boolean;
    quickCrossDiagonalBalance: number;
    finalRole: HybridFinalRole;
    resolutionReason: string;
  }>;
};

export type Analyze50QuestionsResult = {
  success: boolean;
  questionCount: number;
  cropSize: number;
  sheetCalibration?: SheetCalibrationResult;
  normalizationBaseline?: NormalizationBaselineResult;
  escalationLadder?: EscalationLadderResult;
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
    illuminationNormalization: number;
    classifierInit: number;
    crop: number;
    cnn: number;
    coverage: number;
    crossQuickPrecheck: number;
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
  reliable: boolean;
  consensusCount: number;
  variantCount: number;
  recognitionMethod: "consensus" | "best_confidence" | string;
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

export type PrepareYoloProposalsResult = {
  success: boolean;
  questionCount: number;
  proposalCount: number;
  confidenceThreshold: number;
};

export type YoloRoiMatch = {
  question: number;
  choice: string;
  confidence: number;
  centerErrorMm: number;
  expectedCenter: { x: number; y: number };
  detectedCenter: { x: number; y: number };
  box: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    width: number;
    height: number;
  };
};

export type YoloMissingSlot = {
  question: number;
  choice: string;
  expectedCenter: { x: number; y: number };
};
export type YoloConfidenceSweepMatch = {
  question: number;
  choice: string;
  confidence: number;
};

export type YoloConfidenceSweepPoint = {
  threshold: number;
  confidenceFilteredCount: number;
  detectedAfterNms: number;
  mappedProposalCount: number;
  unmatchedDetectionCount: number;
  duplicateRejectedCount: number;
  matchedRatio: number;
  matches: YoloConfidenceSweepMatch[];
};

export type YoloConfidenceSweep = {
  mode: "single_inference_multi_threshold" | string;
  inferenceRunCount: number;
  sweepFloor: number;
  defaultThreshold: number;
  thresholds: number[];
  points: YoloConfidenceSweepPoint[];
};

export type DiagnoseYoloRoisResult = {
  success: boolean;
  diagnosticOnly: boolean;
  decisionBehavior: string;
  model: {
    asset: string;
    className: string;
    inputShape: number[];
    expectedOutputShape: number[];
    confidenceThreshold: number;
    diagnosticSweepFloor: number;
    nmsIouThreshold: number;
  };
  questionCount: number;
  choicesPerQuestion: 5;
  expectedBubbleCount: number;
  detectedAfterNms: number;
  rawCandidateCount: number;
  confidenceFilteredCount: number;
  matchedExpectedCount: number;
  missingExpectedCount: number;
  unmatchedDetectionCount: number;
  duplicateRejectedCount: number;
  matchedRatio: number;
  roiGate: {
    mode: "nearest_expected_bubble_slot" | string;
    acceptedDetectionCount: number;
    ignoredDetectionCount: number;
    ignoredUnmatchedCount: number;
    ignoredDuplicateCount: number;
    matchDistanceLimitMm: number;
    behavior: "diagnostic_gate_only_no_answer_change" | string;
  };
  debugVisualization: {
    fullOverlayUri: string;
    question: number;
    questionCropUri: string;
  };
  likelyDetectorBehavior:
    | "all_or_most_bubble_rois"
    | "likely_marked_answers_only_or_low_recall"
    | "partial_bubble_roi_coverage"
    | "unknown"
    | string;
  matchDistanceLimitMm: number;
  centerErrorMm: {
    mean: number;
    median: number;
    max: number;
  };
  letterbox: {
    scale: number;
    padX: number;
    padY: number;
    resizedWidth: number;
    resizedHeight: number;
  };
  timingMs: {
    detectorInit: number;
    total: number;
    preprocess: number;
    inference: number;
    decode: number;
    nms: number;
    mapping: number;
    sweepMapping: number;
  };
  confidenceSweep: YoloConfidenceSweep;
  matches: YoloRoiMatch[];
  sampleMatches: YoloRoiMatch[];
  worstMatches: YoloRoiMatch[];
  missingSlots: YoloMissingSlot[];
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

  prepareYoloProposals(
    normalizedImageUri: string,
    questionCount: number,
  ): Promise<PrepareYoloProposalsResult>;

  diagnoseYoloRois(
    normalizedImageUri: string,
    questionCount: number,
  ): Promise<DiagnoseYoloRoisResult>;

  readStudentId50(normalizedImageUri: string): Promise<ReadStudentId50Result>;
};

export default requireNativeModule<GradeLensOmrModule>("GradeLensOmr");
