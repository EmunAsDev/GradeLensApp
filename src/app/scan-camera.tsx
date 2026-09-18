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
    savePendingOmrSubmission,
} from "@/database/omrSubmissionRepository";

type SheetQrPayloadV1 = {
  v: 1;
  ct: number;
  s: string;
};

type ScanStage = "idle" | "capturing" | "normalizing" | "processing" | "done";

type ScanResult = {
  studentName: string;
  studentId: string;
  score: number;
  totalQuestions: number;
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
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const insets = useSafeAreaInsets();

  const isBusy = scanStage !== "idle";

  const resetScanner = () => {
    setCapturedImageUri(null);
    setScanResult(null);
    setScanStage("idle");
  };

  const handleScanNext = () => {
    resetScanner();
  };

  const handleFinish = () => {
    router.back();
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
      } catch {
        throw new ScanFlowError(
          "Sheet Not Detected",
          "GradeLens could not detect the answer sheet. Make sure the whole sheet and all four corner markers are visible, then try again.",
        );
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

      try {
        studentIdResult =
          await GradeLensOmr.readStudentId50(normalizedImageUri);

        if (!studentIdResult.success) {
          throw new Error("Student ID recognition was uncertain.");
        }
      } catch {
        throw new ScanFlowError(
          "Student ID Unclear",
          "GradeLens couldn't confidently read the student ID. Retake the photo with better lighting and make sure each digit is clearly shaded.",
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
       * 6. Run Native Bubble Analyzer
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
       * 7. Build Submission + Tentative Score + Save To SQLite
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

        setScanResult({
          studentName: matchedStudent.name ?? studentIdResult.studentId,
          studentId: studentIdResult.studentId,
          score: tentativeScore.score,
          totalQuestions: tentativeScore.total_questions,
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
            "This answer sheet is already saved in the current local Batch. Remove the draft scan from Batch first if you want to scan the sheet again.",
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

          <View style={styles.topInstruction}>
            <Text style={styles.instructionTitle}>Scan Answer Sheet</Text>

            <Text style={styles.instructionText}>
              Keep the whole sheet, QR code, and all four corner markers inside
              the guide.
            </Text>
          </View>
        </View>

        <View pointerEvents="none" style={styles.sheetGuide}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>

        <View style={styles.captureArea}>
          <Text style={styles.captureHint}>
            Scans are saved locally. Submit them later from Batch.
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
          <View style={styles.processingCard}>
            {scanStage === "done" ? (
              <View style={styles.doneCircle}>
                <Text style={styles.doneIcon}>✓</Text>
              </View>
            ) : (
              <View style={styles.activityCircle}>
                <ActivityIndicator
                  size="large"
                  color={theme.colors.textInverse}
                />
              </View>
            )}

            <Text style={styles.processingTitle}>{stageCopy.title}</Text>

            {scanStage === "done" && scanResult ? (
              <View style={styles.resultContent}>
                <Text style={styles.resultName}>{scanResult.studentName}</Text>

                {scanResult.studentName !== scanResult.studentId ? (
                  <Text style={styles.resultStudentId}>
                    Student ID {scanResult.studentId}
                  </Text>
                ) : null}

                <Text style={styles.resultScore}>
                  {scanResult.score} / {scanResult.totalQuestions}
                </Text>

                <Text style={styles.resultLabel}>Tentative Score</Text>

                <Text style={styles.resultSavedText}>
                  Saved locally and waiting in Batch.
                </Text>

                <View style={styles.resultActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleScanNext}
                    style={({ pressed }) => [
                      styles.scanNextButton,
                      pressed && styles.resultButtonPressed,
                    ]}
                  >
                    <Text style={styles.scanNextButtonText}>Scan Next</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    onPress={handleFinish}
                    style={({ pressed }) => [
                      styles.finishButton,
                      pressed && styles.resultButtonPressed,
                    ]}
                  >
                    <Text style={styles.finishButtonText}>Finish</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Text style={styles.processingText}>{stageCopy.message}</Text>
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
    maxWidth: 340,

    alignItems: "center",

    paddingHorizontal: theme.spacing.xxl,
    paddingVertical: theme.spacing.xxxl,

    borderRadius: 20,

    backgroundColor: "rgba(24, 24, 27, 0.96)",
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

  doneCircle: {
    width: 72,
    height: 72,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 36,

    backgroundColor: theme.colors.success,
  },

  doneIcon: {
    marginTop: -2,

    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700",

    color: theme.colors.textInverse,
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

    marginTop: theme.spacing.md,

    alignItems: "center",
  },

  resultName: {
    ...theme.typography.cardTitle,

    textAlign: "center",

    color: theme.colors.textInverse,
  },

  resultStudentId: {
    marginTop: theme.spacing.xs,

    ...theme.typography.caption,

    textAlign: "center",

    color: "#D4D4D8",
  },

  resultScore: {
    marginTop: theme.spacing.lg,

    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",

    color: theme.colors.textInverse,
  },

  resultLabel: {
    marginTop: theme.spacing.xs,

    ...theme.typography.caption,

    color: "#D4D4D8",
  },

  resultSavedText: {
    marginTop: theme.spacing.md,

    ...theme.typography.caption,

    textAlign: "center",

    color: "#A1A1AA",
  },

  resultActions: {
    width: "100%",

    marginTop: theme.spacing.xxl,

    gap: theme.spacing.sm,
  },

  scanNextButton: {
    minHeight: 48,

    alignItems: "center",
    justifyContent: "center",

    paddingHorizontal: theme.spacing.lg,

    borderRadius: 12,

    backgroundColor: theme.colors.primary,
  },

  scanNextButtonText: {
    ...theme.typography.bodyStrong,

    color: theme.colors.textInverse,
  },

  finishButton: {
    minHeight: 48,

    alignItems: "center",
    justifyContent: "center",

    paddingHorizontal: theme.spacing.lg,

    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.20)",
    borderRadius: 12,

    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },

  finishButtonText: {
    ...theme.typography.bodyStrong,

    color: theme.colors.textInverse,
  },

  resultButtonPressed: {
    opacity: 0.78,
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
