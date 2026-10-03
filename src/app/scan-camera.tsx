import { useRef, useState } from "react";

import { router } from "expo-router";

import { StatusBar } from "expo-status-bar";

import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CameraView, useCameraPermissions } from "expo-camera";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import GradeLensOmr from "../../modules/gradelens-omr";

import { scoreOmrSubmission } from "../../modules/gradelens-omr/scoring";

import {
  buildOmrSubmissionPayload,
  normalizeOmrQuestionCount,
} from "../../modules/gradelens-omr/submission";

import { loadAnswerKey } from "@/../services/answerKeyService";

import { theme } from "@/../theme";

import { getCourseTest } from "@/database/courseTestRepository";

import { getCourseTestStudentByStudentId } from "@/database/courseTestStudentRepository";

import {
  DuplicateOmrSubmissionError,
  removeDraftOmrSubmission,
  savePendingOmrSubmission,
} from "@/database/omrSubmissionRepository";

type SheetQrPayloadV1 = {
  v: 1;

  ct: number;

  s: string;
};

type ScanStage = "idle" | "capturing" | "normalizing" | "processing" | "done";

type SavedScanDisposition = "ready" | "needs_review";

type ScanResult = {
  submissionUuid: string;

  studentName: string;

  studentId: string;

  score: number;

  totalQuestions: number;

  disposition: SavedScanDisposition;

  reviewQuestionNumbers: number[];

  invalidQuestionNumbers: number[];
};

class ScanFlowError extends Error {
  title: string;

  userMessage: string;

  constructor(title: string, userMessage: string) {
    super(userMessage);

    this.name = "ScanFlowError";

    this.title = title;

    this.userMessage = userMessage;
  }
}

function parseSheetQrPayload(rawValue: string): SheetQrPayloadV1 {
  let decoded: unknown;

  try {
    decoded = JSON.parse(rawValue);
  } catch {
    throw new Error(
      "The answer-sheet QR code does not contain valid GradeLens JSON.",
    );
  }

  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("The answer-sheet QR payload is invalid.");
  }

  const payload = decoded as {
    v?: unknown;

    ct?: unknown;

    s?: unknown;
  };

  if (payload.v !== 1) {
    throw new Error("Unsupported answer-sheet QR version.");
  }

  if (
    typeof payload.ct !== "number" ||
    !Number.isInteger(payload.ct) ||
    payload.ct <= 0
  ) {
    throw new Error(
      "The answer-sheet QR does not contain a valid course test ID.",
    );
  }

  if (typeof payload.s !== "string" || payload.s.trim().length === 0) {
    throw new Error("The answer-sheet QR does not contain a valid sheet UUID.");
  }

  return {
    v: 1,

    ct: payload.ct,

    s: payload.s.trim(),
  };
}

function getNormalizationError(error: unknown): ScanFlowError {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (message.includes("CAPTURE_TOO_FAR")) {
    return new ScanFlowError(
      "Move Closer",

      "GradeLens found the answer sheet, but it is too small in the captured image for dependable bubble reading. Move the phone closer until the paper nearly fills the yellow guide while keeping all four ArUco corner markers fully visible.",
    );
  }

  if (message.includes("CAPTURE_TOO_SKEWED")) {
    return new ScanFlowError(
      "Align the Sheet",

      "GradeLens found all four ArUco markers, but the paper is too angled. Hold the phone more directly above the sheet, keep the paper flat, and align its edges with the yellow guide before capturing again.",
    );
  }

  if (
    message.includes("ARUCO_MARKERS_MISSING") ||
    message.includes("Missing required markers")
  ) {
    return new ScanFlowError(
      "Corner Markers Not Visible",

      "Make sure the entire answer sheet is inside the yellow guide and all four ArUco corner markers are fully visible. Do not crop a marker at the edge of the camera view.",
    );
  }

  return new ScanFlowError(
    "Sheet Not Detected",

    "GradeLens could not normalize the answer sheet. Keep the whole paper inside the yellow guide, make all four ArUco corner markers visible, hold the phone steady, and avoid strong glare or shadows.",
  );
}

function getStageCopy(stage: ScanStage): {
  title: string;

  message: string;
} {
  switch (stage) {
    case "capturing":
      return {
        title: "Capturing",

        message: "Hold the device steady.",
      };

    case "normalizing":
      return {
        title: "Normalizing",

        message: "Aligning the sheet and correcting perspective.",
      };

    case "processing":
      return {
        title: "Processing",

        message: "Reading the student, answers, and saving the scan.",
      };

    case "done":
      return {
        title: "Done",

        message: "Scan saved locally. Review the result before continuing.",
      };

    default:
      return {
        title: "",

        message: "",
      };
  }
}

export default function ScanScreen() {
  const cameraRef = useRef<CameraView | null>(null);

  const [permission, requestPermission] = useCameraPermissions();

  const [scanStage, setScanStage] = useState<ScanStage>("idle");

  const [torchEnabled, setTorchEnabled] = useState(false);

  const [isRemovingForRescan, setIsRemovingForRescan] = useState(false);

  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);

  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const insets = useSafeAreaInsets();

  const isBusy = scanStage !== "idle";

  const resetScanner = () => {
    setTorchEnabled(false);

    setCapturedImageUri(null);

    setScanResult(null);

    setScanStage("idle");
  };

  const handleScanNext = () => {
    resetScanner();
  };

  const removeDraftAndPrepareRescan = async (submissionUuid: string) => {
    if (isRemovingForRescan) {
      return;
    }

    setIsRemovingForRescan(true);

    try {
      const result = await removeDraftOmrSubmission(submissionUuid);

      if (!result.removed) {
        throw new Error("The local scan is no longer available.");
      }

      resetScanner();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "GradeLens couldn't remove this local scan.";

      Alert.alert("Unable to Retake", message);
    } finally {
      setIsRemovingForRescan(false);
    }
  };

  const handleScanAgain = () => {
    if (!scanResult || isRemovingForRescan) {
      return;
    }

    Alert.alert(
      "Retake This Sheet?",

      "The current local result will be removed and the camera will reopen immediately so you can capture this same sheet again. This is allowed only before submission to GradeLens has started.",

      [
        {
          text: "Cancel",

          style: "cancel",
        },

        {
          text: "Remove & Retake",

          style: "destructive",

          onPress: () => {
            void removeDraftAndPrepareRescan(scanResult.submissionUuid);
          },
        },
      ],
    );
  };

  const handleFinish = () => {
    router.back();
  };

  const handleReviewNow = () => {
    if (!scanResult || scanResult.disposition !== "needs_review") {
      return;
    }

    router.push({
      pathname: "/batch/review/[submissionUuid]",

      params: {
        submissionUuid: scanResult.submissionUuid,

        returnTo: "scan",
      },
    });
  };

  const handleClose = () => {
    if (
      scanStage === "capturing" ||
      scanStage === "normalizing" ||
      scanStage === "processing"
    ) {
      return;
    }

    router.back();
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isBusy) {
      return;
    }

    let completed = false;

    setScanStage("capturing");

    try {
      /*

       * ------------------------------------------------------------------------

       * Capture

       * ------------------------------------------------------------------------

       */

      let photoUri: string;

      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 1,

          skipProcessing: false,
        });

        if (!photo?.uri) {
          throw new Error("Camera did not return an image.");
        }

        photoUri = photo.uri;

        setCapturedImageUri(photo.uri);

        // The torch is only needed for framing/capture. Turn it off as soon as

        // the photo is safely captured so it does not stay on during OMR work.

        setTorchEnabled(false);
      } catch {
        throw new ScanFlowError(
          "Capture Failed",

          "GradeLens could not capture the answer sheet. Please try again.",
        );
      }

      /*

       * ------------------------------------------------------------------------

       * Normalize

       * ------------------------------------------------------------------------

       */

      setScanStage("normalizing");

      let normalizedImageUri: string;

      try {
        const normalized = await GradeLensOmr.normalizeSheet(photoUri);

        if (!normalized.success) {
          throw new Error("Answer sheet could not be normalized.");
        }

        normalizedImageUri = normalized.normalizedUri;
      } catch (error) {
        throw getNormalizationError(error);
      }

      /*

       * Everything after normalization is automatic.

       *

       * The scanner stays completely offline here:

       * QR -> Student ID -> SQLite roster -> Course Test -> local answer key

       * -> bubble analysis -> tentative score -> SQLite save.

       */

      setScanStage("processing");

      /*

       * ------------------------------------------------------------------------

       * 1. Read Sheet QR

       * ------------------------------------------------------------------------

       */

      let qr: SheetQrPayloadV1;

      try {
        const qrResult = await GradeLensOmr.readSheetQr50(normalizedImageUri);

        if (!qrResult.success || !qrResult.rawValue) {
          throw new Error("Answer-sheet QR code could not be read.");
        }

        qr = parseSheetQrPayload(qrResult.rawValue);
      } catch {
        throw new ScanFlowError(
          "Couldn't Read QR Code",

          "The QR code on this sheet couldn't be read. Retake the photo with the QR code fully visible and in focus.",
        );
      }

      /*

       * ------------------------------------------------------------------------

       * 2. Read Student ID

       * ------------------------------------------------------------------------

       */

      let studentIdResult: Awaited<
        ReturnType<typeof GradeLensOmr.readStudentId50>
      >;

      /*
       * ------------------------------------------------------------------------
       * Student ID Diagnostic Checkpoint
       * ------------------------------------------------------------------------
       *
       * IMPORTANT:
       * - Do not change CNN thresholds yet.
       * - Do not change Student ID crop coordinates yet.
       * - Do not change the trained model yet.
       *
       * First separate these two very different cases:
       *
       * 1. The native Student ID reader itself throws/fails.
       * 2. The reader completes and predicts six digits, but its reliability
       *    policy marks one or more positions as weak.
       *
       * Previously both cases became the same generic "better lighting" error,
       * which hid the actual reason for the failure.
       */
      try {
        studentIdResult =
          await GradeLensOmr.readStudentId50(normalizedImageUri);
      } catch (error) {
        console.error("[STUDENT ID] Native reader error:", error);

        throw new ScanFlowError(
          "Student ID Reader Error",
          "GradeLens could not run the Student ID reader on the normalized sheet. Check the Metro/native log for the actual reader error.",
        );
      }

      /*
       * Always log the recognition result, including successful scans.
       * This gives us a clean comparison between accepted and rejected
       * captures of the exact same physical answer sheet.
       */
      console.log(
        "[STUDENT ID] Recognition result:",
        JSON.stringify(
          {
            normalizedImageUri,

            success: studentIdResult.success,

            studentId: studentIdResult.studentId,

            minConfidence: studentIdResult.minConfidence,

            averageConfidence: studentIdResult.averageConfidence,

            weakPositions: studentIdResult.weakPositions,

            digits: studentIdResult.digits.map((digit) => ({
              position: digit.position,

              digit: digit.digit,

              confidence: digit.confidence,

              reliable: digit.reliable,

              consensusCount: digit.consensusCount,

              variantCount: digit.variantCount,

              recognitionMethod: digit.recognitionMethod,

              cropUri: digit.cropUri,

              binaryUri: digit.binaryUri,

              modelInputUri: digit.modelInputUri,
            })),
          },
          null,
          2,
        ),
      );

      if (!studentIdResult.success) {
        /*
         * QR decoding already succeeded, so qr.ct is known.
         *
         * For diagnostics only, check whether the six-digit candidate already
         * matches a student in the locally synchronized roster.
         *
         * We are NOT accepting the weak result here. This simply tells us
         * whether the reliability gate may be rejecting a correct candidate.
         */
        let candidateExistsInRoster = false;
        let candidateStudentName: string | null = null;

        if (studentIdResult.studentId.trim().length > 0) {
          try {
            const candidateStudent = await getCourseTestStudentByStudentId(
              qr.ct,
              studentIdResult.studentId,
            );

            candidateExistsInRoster = candidateStudent !== null;

            candidateStudentName = candidateStudent?.name ?? null;
          } catch (error) {
            console.warn(
              "[STUDENT ID] Candidate roster diagnostic failed:",
              error,
            );
          }
        }

        const weakPositionText =
          studentIdResult.weakPositions.length > 0
            ? studentIdResult.weakPositions.join(", ")
            : "none";

        const digitSummary = studentIdResult.digits
          .map((digit) => {
            const reliability = digit.reliable ? "OK" : "WEAK";

            const confidencePercent = Math.round(digit.confidence * 100);

            return (
              `#${digit.position}: ` +
              `${digit.digit} ` +
              `${confidencePercent}% ` +
              `${reliability} ` +
              `(${digit.consensusCount}/${digit.variantCount}, ` +
              `${digit.recognitionMethod})`
            );
          })
          .join("\n");

        console.warn("[STUDENT ID] Recognition rejected:", {
          candidate: studentIdResult.studentId,

          weakPositions: studentIdResult.weakPositions,

          minConfidence: studentIdResult.minConfidence,

          averageConfidence: studentIdResult.averageConfidence,

          candidateExistsInRoster,

          candidateStudentName,
        });

        throw new ScanFlowError(
          "Student ID Diagnostic",
          [
            `Candidate ID: ${studentIdResult.studentId || "none"}`,

            `Roster match: ${
              candidateExistsInRoster
                ? candidateStudentName
                  ? `YES - ${candidateStudentName}`
                  : "YES"
                : "NO"
            }`,

            `Weak positions: ${weakPositionText}`,

            `Minimum confidence: ${Math.round(
              studentIdResult.minConfidence * 100,
            )}%`,

            `Average confidence: ${Math.round(
              studentIdResult.averageConfidence * 100,
            )}%`,

            "",

            digitSummary,

            "",

            "The crop, binary, and 28x28 model-input paths are printed in the Metro/native console.",
          ].join("\n"),
        );
      }

      /*
       * ------------------------------------------------------------------------
       * 3. Verify Student Against Local Roster
       * ------------------------------------------------------------------------
       */

      let matchedStudent: Awaited<
        ReturnType<typeof getCourseTestStudentByStudentId>
      >;

      try {
        matchedStudent = await getCourseTestStudentByStudentId(
          qr.ct,

          studentIdResult.studentId,
        );

        if (!matchedStudent) {
          throw new Error("Student is not available in the local roster.");
        }
      } catch {
        throw new ScanFlowError(
          "Student Not Found",

          "The recognized student isn't in the synced roster for this test. Sync the course while online, or double-check the answer sheet.",
        );
      }

      /*

       * ------------------------------------------------------------------------

       * 4. Resolve Course Test + Question Count

       * ------------------------------------------------------------------------

       */

      let localCourseTest: Awaited<ReturnType<typeof getCourseTest>>;

      let questionCount: ReturnType<typeof normalizeOmrQuestionCount>;

      try {
        localCourseTest = await getCourseTest(qr.ct);

        if (!localCourseTest) {
          throw new Error("Course Test is not available in local SQLite.");
        }

        if (localCourseTest.question_count === null) {
          throw new Error("Course Test does not have an OMR question count.");
        }

        questionCount = normalizeOmrQuestionCount(
          localCourseTest.question_count,
        );
      } catch {
        throw new ScanFlowError(
          "Test Not Available Offline",

          "This course test hasn't been fully synced to this device yet. Connect to the internet and sync the course, then try again.",
        );
      }

      /*

       * ------------------------------------------------------------------------

       * 5. Load Local Answer Key

       * ------------------------------------------------------------------------

       */

      let answerKey: Awaited<ReturnType<typeof loadAnswerKey>>;

      try {
        answerKey = await loadAnswerKey(qr.ct, questionCount);
      } catch {
        throw new ScanFlowError(
          "Answer Key Unavailable",

          "The answer key for this test isn't available offline yet. Sync this course test while online, then try again.",
        );
      }

      /*

       * ------------------------------------------------------------------------

       * 6. Prepare YOLO Mark Proposals

       * ------------------------------------------------------------------------

       *

       * Production path: one YOLO pass at the frozen 0.10 threshold. The

       * native module caches only accepted Q#/choice proposals. No confidence

       * sweep, debug overlay, question crop, or gallery image is produced.

       */

      try {
        await GradeLensOmr.prepareYoloProposals(
          normalizedImageUri,

          questionCount,
        );
      } catch {
        throw new ScanFlowError(
          "Couldn't Read The Sheet",

          "GradeLens couldn't prepare the answer marks. Retake the photo with the sheet flat, well-lit, and fully inside the guide.",
        );
      }

      /*

       * ------------------------------------------------------------------------

       * 7. Run Native Bubble Analyzer

       * ------------------------------------------------------------------------

       */

      let result: Awaited<ReturnType<typeof GradeLensOmr.analyze50Questions>>;

      try {
        result =
          questionCount === 50
            ? await GradeLensOmr.analyze50Questions(normalizedImageUri)
            : await GradeLensOmr.analyze100Questions(normalizedImageUri);
      } catch {
        throw new ScanFlowError(
          "Couldn't Read The Sheet",

          "GradeLens ran into a problem reading the bubbles. Retake the photo with the sheet flat, well-lit, and fully inside the guide.",
        );
      }

      /*

       * ------------------------------------------------------------------------

       * 8. Build Submission + Tentative Score + Save To SQLite

       * ------------------------------------------------------------------------

       */

      try {
        const submissionPayload = buildOmrSubmissionPayload(
          result,

          questionCount,
        );

        const tentativeScore = scoreOmrSubmission(submissionPayload, answerKey);

        await savePendingOmrSubmission({
          submission_uuid: qr.s,

          sheet_uuid: qr.s,

          crs_tst_id: qr.ct,

          tst_id: localCourseTest.tst_id,

          std_id: matchedStudent.std_id,

          student_id_no: studentIdResult.studentId,

          payload: submissionPayload,

          tentative_score: tentativeScore.score,

          captured_at: new Date().toISOString(),
        });

        const reviewQuestionNumbers = [
          ...submissionPayload.review_question_numbers,
        ].sort((a, b) => a - b);

        const invalidQuestionNumbers = result.questions

          .filter((question) => question.status === "invalid")

          .map((question) => question.question)

          .sort((a, b) => a - b);

        setScanResult({
          submissionUuid: qr.s,

          studentName: matchedStudent.name ?? studentIdResult.studentId,

          studentId: studentIdResult.studentId,

          score: tentativeScore.score,

          totalQuestions: tentativeScore.total_questions,

          disposition:
            reviewQuestionNumbers.length > 0 ? "needs_review" : "ready",

          reviewQuestionNumbers,

          invalidQuestionNumbers,
        });
      } catch (error) {
        if (error instanceof DuplicateOmrSubmissionError) {
          throw error;
        }

        throw new ScanFlowError(
          "Couldn't Save Scan",

          "The sheet was read successfully, but GradeLens couldn't save it on this device. Please try again.",
        );
      }

      /*

       * ------------------------------------------------------------------------

       * Success

       * ------------------------------------------------------------------------

       *

       * Keep the result visible until the user explicitly chooses Scan Next

       * or Finish. The submission is already saved locally at this point.

       */

      setScanStage("done");

      completed = true;
    } catch (error) {
      if (error instanceof DuplicateOmrSubmissionError) {
        const submission = error.submission;

        if (
          submission.sync_status === "pending" &&
          submission.batch_uuid === null
        ) {
          Alert.alert(
            "Already Scanned",

            "This answer sheet is already saved as a local draft. You can remove that draft now and scan the same physical sheet again without going to Batch.",

            [
              {
                text: "Keep Existing",

                style: "cancel",
              },

              {
                text: "Remove & Scan Again",

                style: "destructive",

                onPress: () => {
                  void removeDraftAndPrepareRescan(submission.submission_uuid);
                },
              },
            ],
          );
        } else {
          Alert.alert(
            "Already Submitted",

            "This answer sheet has already started submission to GradeLens and can no longer be replaced from the Scan screen. Review it from Batch instead.",
          );
        }

        return;
      }

      if (error instanceof ScanFlowError) {
        Alert.alert(error.title, error.userMessage);

        return;
      }

      Alert.alert(
        "Scan Failed",

        "GradeLens couldn't finish processing this answer sheet. Please try again.",
      );
    } finally {
      if (!completed) {
        resetScanner();
      }
    }
  };

  /*

   * --------------------------------------------------------------------------

   * Camera Permission Loading

   * --------------------------------------------------------------------------

   */

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />

        <Text style={styles.loadingText}>Preparing camera...</Text>
      </View>
    );
  }

  /*

   * --------------------------------------------------------------------------

   * Camera Permission Required

   * --------------------------------------------------------------------------

   */

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>

        <Text style={styles.permissionText}>
          GradeLens needs camera access to scan answer sheets.
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.permissionButton,

            pressed && styles.permissionButtonPressed,
          ]}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Allow Camera</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.permissionBackButton,

            pressed && styles.permissionBackButtonPressed,
          ]}
        >
          <Text style={styles.permissionBackButtonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const stageCopy = getStageCopy(scanStage);

  /*

   * --------------------------------------------------------------------------

   * Scanner

   * --------------------------------------------------------------------------

   */

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torchEnabled}
        flash="off"
        animateShutter
      />

      {capturedImageUri && (
        <Image
          source={{ uri: capturedImageUri }}
          style={styles.capturedBackground}
          resizeMode="cover"
        />
      )}

      <View
        pointerEvents="box-none"
        style={[
          styles.overlay,

          {
            paddingTop: insets.top + theme.spacing.lg,

            paddingBottom: insets.bottom + theme.spacing.xxl,
          },
        ]}
      >
        <View style={styles.topArea}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
            disabled={
              scanStage === "capturing" ||
              scanStage === "normalizing" ||
              scanStage === "processing"
            }
            onPress={handleClose}
            style={({ pressed }) => [
              styles.closeButton,

              pressed && styles.closeButtonPressed,
            ]}
          >
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              torchEnabled ? "Turn scan light off" : "Turn scan light on"
            }
            accessibilityState={{ checked: torchEnabled, disabled: isBusy }}
            disabled={isBusy}
            onPress={() => setTorchEnabled((enabled) => !enabled)}
            style={({ pressed }) => [
              styles.lightButton,

              torchEnabled && styles.lightButtonActive,

              pressed && !isBusy && styles.lightButtonPressed,

              isBusy && styles.lightButtonDisabled,
            ]}
          >
            <Text style={styles.lightButtonIcon}>⚡</Text>

            <Text style={styles.lightButtonText}>
              {torchEnabled ? "Light On" : "Light Off"}
            </Text>
          </Pressable>

          <View style={styles.topInstruction}>
            <Text style={styles.instructionTitle}>Scan Answer Sheet</Text>

            <Text style={styles.instructionText}>
              Align the paper with the yellow guide. Keep the QR code and all
              four ArUco corner markers fully visible, and move close enough for
              the sheet to nearly fill the guide.
            </Text>
          </View>
        </View>

        <View pointerEvents="none" style={styles.sheetGuide}>
          <View style={[styles.corner, styles.topLeft]} />

          <View style={[styles.corner, styles.topRight]} />

          <View style={[styles.corner, styles.bottomLeft]} />

          <View style={[styles.corner, styles.bottomRight]} />

          <View style={styles.guideMessage}>
            <Text style={styles.guideMessageTitle}>Align paper here</Text>

            <Text style={styles.guideMessageText}>
              4 ArUco markers visible · paper nearly fills guide
            </Text>
          </View>
        </View>

        <View style={styles.captureArea}>
          <Text style={styles.captureHint}>
            Keep the sheet flat and steady. Avoid glare and heavy shadows.
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Capture answer sheet"
            disabled={isBusy}
            onPress={handleCapture}
            style={({ pressed }) => [
              styles.captureOuter,

              pressed && !isBusy && styles.captureOuterPressed,

              isBusy && styles.captureDisabled,
            ]}
          >
            <View style={styles.captureInner}>
              {scanStage === "capturing" && (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.textInverse}
                />
              )}
            </View>
          </Pressable>
        </View>
      </View>

      {scanStage !== "idle" && scanStage !== "capturing" && (
        <View style={styles.processingOverlay}>
          <View
            style={[
              styles.processingCard,
              scanStage === "done" && styles.resultCard,
            ]}
          >
            {scanStage === "done" && scanResult ? (
              <View style={styles.resultContent}>
                <View style={styles.resultHeaderRow}>
                  <View style={styles.resultSuccessCircle}>
                    <Text style={styles.resultSuccessIcon}>✓</Text>
                  </View>

                  <View style={styles.resultIdentity}>
                    <Text style={styles.resultName} numberOfLines={1}>
                      {scanResult.studentName}
                    </Text>

                    <Text style={styles.resultStudentId}>
                      {scanResult.studentId}
                    </Text>
                  </View>

                  <View style={styles.resultScoreBox}>
                    <Text style={styles.resultScore}>
                      {scanResult.score} / {scanResult.totalQuestions}
                    </Text>

                    <Text style={styles.resultLabel}>TENTATIVE SCORE</Text>
                  </View>
                </View>

                {scanResult.disposition === "needs_review" ? (
                  <View style={styles.reviewNotice}>
                    <Text style={styles.reviewNoticeTitle}>
                      Manual Review Required
                    </Text>

                    <Text style={styles.reviewNoticeText}>
                      Q#s: {scanResult.reviewQuestionNumbers.join(", ")}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.readyNotice}>
                    <Text style={styles.readyNoticeText}>
                      <Text style={styles.readyNoticeTitle}>Ready:</Text> No
                      question-level OMR review is required.
                    </Text>
                  </View>
                )}

                {scanResult.invalidQuestionNumbers.length > 0 ? (
                  <View style={styles.invalidNotice}>
                    <Text style={styles.invalidNoticeText}>
                      Invalid marking Q#s:{" "}
                      {scanResult.invalidQuestionNumbers.join(", ")}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.resultDivider} />

                <View style={styles.resultActions}>
                  {scanResult.disposition === "needs_review" ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Manually review uncertain answer marks now"
                      onPress={handleReviewNow}
                      style={({ pressed }) => [
                        styles.reviewNowButton,
                        pressed && styles.resultButtonPressed,
                      ]}
                    >
                      <Text style={styles.reviewNowButtonText}>Review Now</Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove this local scan and retake the same sheet"
                    disabled={isRemovingForRescan}
                    onPress={handleScanAgain}
                    style={({ pressed }) => [
                      styles.retakeButton,
                      pressed &&
                        !isRemovingForRescan &&
                        styles.resultButtonPressed,
                      isRemovingForRescan && styles.retakeButtonDisabled,
                    ]}
                  >
                    {isRemovingForRescan ? (
                      <ActivityIndicator
                        size="small"
                        color={theme.colors.textSecondary}
                      />
                    ) : null}

                    <Text style={styles.retakeButtonText}>
                      {isRemovingForRescan ? "Removing..." : "Remove & Retake"}
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      scanResult.disposition === "needs_review"
                        ? "Keep this review result and scan the next sheet"
                        : "Scan the next answer sheet"
                    }
                    onPress={handleScanNext}
                    style={({ pressed }) => [
                      styles.scanNextCompactButton,
                      pressed && styles.resultButtonPressed,
                    ]}
                  >
                    <Text style={styles.scanNextCompactButtonText}>
                      Scan Next
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      scanResult.disposition === "needs_review"
                        ? "Keep this review result and finish scanning"
                        : "Finish scanning"
                    }
                    onPress={handleFinish}
                    style={({ pressed }) => [
                      styles.finishCompactButton,
                      pressed && styles.resultButtonPressed,
                    ]}
                  >
                    <Text style={styles.finishCompactButtonText}>Finish</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.activityCircle}>
                  <ActivityIndicator
                    size="large"
                    color={theme.colors.textInverse}
                  />
                </View>

                <Text style={styles.processingTitle}>{stageCopy.title}</Text>

                <Text style={styles.processingText}>{stageCopy.message}</Text>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,

    backgroundColor: "#000000",
  },

  capturedBackground: {
    ...StyleSheet.absoluteFill,

    zIndex: 5,

    width: "100%",

    height: "100%",

    backgroundColor: "#000000",
  },

  /*

   * --------------------------------------------------------------------------

   * Camera Overlay

   * --------------------------------------------------------------------------

   */

  overlay: {
    ...StyleSheet.absoluteFill,

    justifyContent: "space-between",

    paddingHorizontal: theme.spacing.xl,
  },

  topArea: {
    width: "100%",

    position: "relative",

    alignItems: "center",
  },

  closeButton: {
    position: "absolute",

    left: 0,

    top: 0,

    zIndex: 4,

    width: 42,

    height: 42,

    alignItems: "center",

    justifyContent: "center",

    borderRadius: 21,

    backgroundColor: "rgba(0, 0, 0, 0.58)",
  },

  closeButtonPressed: {
    opacity: 0.72,
  },

  closeButtonText: {
    marginTop: -2,

    fontSize: 30,

    lineHeight: 32,

    fontWeight: "400",

    color: theme.colors.textInverse,
  },

  lightButton: {
    position: "absolute",

    right: 0,

    top: 0,

    zIndex: 4,

    minHeight: 42,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "center",

    gap: 5,

    paddingHorizontal: 11,

    borderWidth: 1,

    borderColor: "rgba(255, 255, 255, 0.22)",

    borderRadius: 21,

    backgroundColor: "rgba(0, 0, 0, 0.58)",
  },

  lightButtonActive: {
    borderColor: "#F2C231",

    backgroundColor: "rgba(242, 194, 49, 0.24)",
  },

  lightButtonPressed: {
    opacity: 0.76,
  },

  lightButtonDisabled: {
    opacity: 0.55,
  },

  lightButtonIcon: {
    fontSize: 15,

    lineHeight: 18,
  },

  lightButtonText: {
    fontSize: 11,

    lineHeight: 15,

    fontWeight: "700",

    color: theme.colors.textInverse,
  },

  topInstruction: {
    alignItems: "center",

    paddingHorizontal: theme.spacing.lg,

    paddingVertical: theme.spacing.md,

    borderRadius: 14,

    backgroundColor: "rgba(0, 0, 0, 0.58)",
  },

  instructionTitle: {
    fontSize: 18,

    lineHeight: 24,

    fontWeight: "700",

    color: theme.colors.textInverse,
  },

  instructionText: {
    marginTop: theme.spacing.xs,

    maxWidth: 340,

    fontSize: 13,

    lineHeight: 18,

    textAlign: "center",

    color: "#E5E7EB",
  },

  /*

   * --------------------------------------------------------------------------

   * Sheet Guide

   * --------------------------------------------------------------------------

   */

  sheetGuide: {
    alignSelf: "center",

    width: "86%",

    aspectRatio: 0.72,

    position: "relative",
  },

  corner: {
    position: "absolute",

    width: 34,

    height: 34,

    borderColor: "#F2C231",
  },

  topLeft: {
    top: 0,

    left: 0,

    borderTopWidth: 4,

    borderLeftWidth: 4,
  },

  topRight: {
    top: 0,

    right: 0,

    borderTopWidth: 4,

    borderRightWidth: 4,
  },

  bottomLeft: {
    bottom: 0,

    left: 0,

    borderBottomWidth: 4,

    borderLeftWidth: 4,
  },

  bottomRight: {
    right: 0,

    bottom: 0,

    borderRightWidth: 4,

    borderBottomWidth: 4,
  },

  guideMessage: {
    position: "absolute",

    left: "8%",

    right: "8%",

    top: "43%",

    alignItems: "center",

    paddingHorizontal: theme.spacing.md,

    paddingVertical: theme.spacing.sm,

    borderRadius: 12,

    backgroundColor: "rgba(0, 0, 0, 0.46)",
  },

  guideMessageTitle: {
    fontSize: 14,

    lineHeight: 19,

    fontWeight: "700",

    color: theme.colors.textInverse,
  },

  guideMessageText: {
    marginTop: 2,

    fontSize: 11,

    lineHeight: 15,

    textAlign: "center",

    color: "#E5E7EB",
  },

  /*

   * --------------------------------------------------------------------------

   * Capture

   * --------------------------------------------------------------------------

   */

  captureArea: {
    alignItems: "center",

    justifyContent: "center",
  },

  captureHint: {
    marginBottom: theme.spacing.md,

    paddingHorizontal: theme.spacing.md,

    paddingVertical: theme.spacing.sm,

    borderRadius: 10,

    fontSize: 12,

    lineHeight: 17,

    fontWeight: "500",

    textAlign: "center",

    color: "#F4F4F5",

    backgroundColor: "rgba(0, 0, 0, 0.50)",
  },

  captureOuter: {
    width: 78,

    height: 78,

    alignItems: "center",

    justifyContent: "center",

    borderWidth: 5,

    borderColor: theme.colors.textInverse,

    borderRadius: 39,
  },

  captureOuterPressed: {
    opacity: 0.74,
  },

  captureDisabled: {
    opacity: 0.65,
  },

  captureInner: {
    width: 58,

    height: 58,

    alignItems: "center",

    justifyContent: "center",

    borderRadius: 29,

    backgroundColor: theme.colors.primary,
  },

  /*

   * --------------------------------------------------------------------------

   * Processing

   * --------------------------------------------------------------------------

   */

  processingOverlay: {
    ...StyleSheet.absoluteFill,

    zIndex: 20,

    alignItems: "center",

    justifyContent: "center",

    paddingHorizontal: theme.spacing.xxl,

    backgroundColor: "rgba(0, 0, 0, 0.62)",
  },

  processingCard: {
    width: "100%",
    maxWidth: 360,

    alignItems: "center",

    paddingHorizontal: theme.spacing.xxl,
    paddingVertical: theme.spacing.xxxl,

    borderRadius: 20,

    backgroundColor: "rgba(24, 24, 27, 0.96)",
  },

  resultCard: {
    maxWidth: 390,

    alignItems: "stretch",

    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,

    borderRadius: 18,

    backgroundColor: theme.colors.surface,
  },

  activityCircle: {
    width: 72,
    height: 72,

    alignItems: "center",
    justifyContent: "center",

    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 36,

    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },

  processingTitle: {
    marginTop: theme.spacing.lg,

    fontSize: 19,
    lineHeight: 25,
    fontWeight: "700",

    color: theme.colors.textInverse,
  },

  processingText: {
    marginTop: theme.spacing.sm,

    fontSize: 13,
    lineHeight: 19,

    textAlign: "center",

    color: "#D4D4D8",
  },

  resultContent: {
    width: "100%",
  },

  resultHeaderRow: {
    width: "100%",

    flexDirection: "row",
    alignItems: "center",

    gap: theme.spacing.md,
  },

  resultSuccessCircle: {
    width: 56,
    height: 56,

    flexShrink: 0,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 28,

    backgroundColor: theme.colors.success,
  },

  resultSuccessIcon: {
    marginTop: -2,

    fontSize: 29,
    lineHeight: 34,
    fontWeight: "600",

    color: theme.colors.textInverse,
  },

  resultIdentity: {
    flex: 1,
    minWidth: 0,
  },

  resultName: {
    ...theme.typography.cardTitle,

    color: theme.colors.text,
  },

  resultStudentId: {
    marginTop: 2,

    ...theme.typography.body,

    color: theme.colors.textMuted,
  },

  resultScoreBox: {
    minWidth: 104,

    flexShrink: 0,

    alignItems: "center",

    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,

    borderRadius: 8,

    backgroundColor: theme.colors.surfaceMuted,
  },

  resultScore: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "700",

    color: theme.colors.text,
  },

  resultLabel: {
    marginTop: 1,

    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",

    color: theme.colors.textMuted,
  },

  reviewNotice: {
    width: "100%",

    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,

    borderWidth: 1,
    borderColor: theme.colors.warning,
    borderRadius: 10,

    backgroundColor: theme.colors.warningSoft,
  },

  reviewNoticeTitle: {
    ...theme.typography.bodyStrong,

    color: theme.colors.text,
  },

  reviewNoticeText: {
    marginTop: 1,

    ...theme.typography.caption,
    fontWeight: "600",

    color: theme.colors.textSecondary,
  },

  readyNotice: {
    width: "100%",

    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,

    borderRadius: 10,

    backgroundColor: theme.colors.surfaceMuted,
  },

  readyNoticeTitle: {
    fontWeight: "700",

    color: theme.colors.text,
  },

  readyNoticeText: {
    ...theme.typography.caption,
    fontWeight: "600",

    color: theme.colors.text,
  },

  invalidNotice: {
    width: "100%",

    marginTop: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,

    borderRadius: 8,

    backgroundColor: theme.colors.dangerSoft,
  },

  invalidNoticeText: {
    ...theme.typography.caption,
    fontWeight: "600",

    color: theme.colors.danger,
  },

  resultDivider: {
    width: "100%",
    height: StyleSheet.hairlineWidth,

    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,

    backgroundColor: theme.colors.divider,
  },

  resultActions: {
    width: "100%",

    gap: 7,
  },

  reviewNowButton: {
    minHeight: 42,

    alignItems: "center",
    justifyContent: "center",

    paddingHorizontal: theme.spacing.lg,

    borderRadius: 8,

    backgroundColor: theme.colors.primary,
  },

  reviewNowButtonText: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "700",

    color: theme.colors.textInverse,
  },

  retakeButton: {
    minHeight: 42,

    flexDirection: "row",
    gap: theme.spacing.sm,

    alignItems: "center",
    justifyContent: "center",

    paddingHorizontal: theme.spacing.lg,

    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,

    backgroundColor: theme.colors.surface,
  },

  retakeButtonText: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600",

    color: theme.colors.textSecondary,
  },

  retakeButtonDisabled: {
    opacity: 0.58,
  },

  scanNextCompactButton: {
    minHeight: 42,

    alignItems: "center",
    justifyContent: "center",

    paddingHorizontal: theme.spacing.lg,

    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 8,

    backgroundColor: theme.colors.surface,
  },

  scanNextCompactButtonText: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "500",

    color: theme.colors.primary,
  },

  finishCompactButton: {
    minHeight: 34,

    alignItems: "center",
    justifyContent: "center",

    paddingHorizontal: theme.spacing.lg,
  },

  finishCompactButtonText: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "500",

    color: theme.colors.textMuted,
  },

  resultButtonPressed: {
    opacity: 0.72,
  },

  /*

   * --------------------------------------------------------------------------

   * Generic Loading

   * --------------------------------------------------------------------------

   */

  center: {
    flex: 1,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: theme.colors.background,
  },

  loadingText: {
    marginTop: theme.spacing.md,

    ...theme.typography.body,

    color: theme.colors.textSecondary,
  },

  /*

   * --------------------------------------------------------------------------

   * Permission

   * --------------------------------------------------------------------------

   */

  permissionContainer: {
    flex: 1,

    alignItems: "center",

    justifyContent: "center",

    paddingHorizontal: theme.spacing.xxxl,

    backgroundColor: theme.colors.background,
  },

  permissionTitle: {
    ...theme.typography.screenTitle,

    textAlign: "center",

    color: theme.colors.text,
  },

  permissionText: {
    marginTop: theme.spacing.sm,

    maxWidth: 320,

    ...theme.typography.body,

    textAlign: "center",

    color: theme.colors.textSecondary,
  },

  permissionButton: {
    minWidth: 180,

    minHeight: 48,

    marginTop: theme.spacing.xxl,

    paddingHorizontal: theme.spacing.xl,

    alignItems: "center",

    justifyContent: "center",

    borderRadius: 10,

    backgroundColor: theme.colors.primary,
  },

  permissionButtonPressed: {
    backgroundColor: theme.colors.primaryPressed,
  },

  permissionButtonText: {
    ...theme.typography.bodyStrong,

    color: theme.colors.textInverse,
  },

  permissionBackButton: {
    minWidth: 180,

    minHeight: 44,

    marginTop: theme.spacing.sm,

    alignItems: "center",

    justifyContent: "center",
  },

  permissionBackButtonPressed: {
    opacity: 0.7,
  },

  permissionBackButtonText: {
    ...theme.typography.bodyStrong,

    color: theme.colors.textSecondary,
  },
});
