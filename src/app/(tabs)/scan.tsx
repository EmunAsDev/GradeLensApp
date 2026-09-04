import { useRef, useState } from "react";

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

import GradeLensOmr from "../../../modules/gradelens-omr";

import { scoreOmrSubmission } from "../../../modules/gradelens-omr/scoring";

import {
  buildOmrSubmissionPayload,
  normalizeOmrQuestionCount,
} from "../../../modules/gradelens-omr/submission";

import { loadAnswerKey } from "@/../services/answerKeyService";

import { getCourseTestStudentByStudentId } from "@/database/courseTestStudentRepository";

import { getCourseTest } from "@/database/courseTestRepository";

import { savePendingOmrSubmission } from "@/database/omrSubmissionRepository";

type SheetQrPayloadV1 = {
  v: 1;
  ct: number;
  s: string;
};

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

/*
  |--------------------------------------------------------------------------
  | Friendly Alert Helper
  |--------------------------------------------------------------------------
  |
  | Every stage of handleContinue/handleUsePhoto logs the RAW error to the
  | console (for our own debugging) but only ever shows the user a short,
  | plain-language title + message. Nothing technical ever reaches Alert.
  |--------------------------------------------------------------------------
  */

function showFriendlyError(
  logTag: string,
  rawError: unknown,
  title: string,
  message: string,
) {
  console.error(logTag, rawError);

  Alert.alert(title, message);
}

export default function ScanScreen() {
  const cameraRef = useRef<CameraView | null>(null);

  const [permission, requestPermission] = useCameraPermissions();

  const [isCapturing, setIsCapturing] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);

  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);

  const [normalizedImageUri, setNormalizedImageUri] = useState<string | null>(
    null,
  );

  /*
    |--------------------------------------------------------------------------
    | Capture Photo
    |--------------------------------------------------------------------------
    */

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing || isProcessing) {
      return;
    }

    setIsCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
      });

      if (!photo?.uri) {
        throw new Error("Camera did not return an image.");
      }

      console.log("[OMR] Captured image:", photo.uri);

      setCapturedImageUri(photo.uri);

      setNormalizedImageUri(null);
    } catch (error) {
      showFriendlyError(
        "[OMR] Camera capture failed:",
        error,
        "Capture Failed",
        "GradeLens could not capture the answer sheet. Please try again.",
      );
    } finally {
      setIsCapturing(false);
    }
  };

  /*
    |--------------------------------------------------------------------------
    | Normalize Captured Photo
    |--------------------------------------------------------------------------
    */

  const handleUsePhoto = async () => {
    if (!capturedImageUri || isProcessing) {
      return;
    }

    setIsProcessing(true);

    try {
      console.log("[OMR] Starting normalization:", capturedImageUri);

      const result = await GradeLensOmr.normalizeSheet(capturedImageUri);

      console.log("[OMR PERF] Normalization:", {
        success: result.success,
        markerIds: result.markerIds,
        width: result.width,
        height: result.height,
        timingMs: result.timingMs,
      });

      if (!result.success) {
        Alert.alert(
          "Sheet Not Detected",
          "GradeLens could not detect the answer sheet. Make sure the whole sheet and all four corner markers are visible, then try again.",
        );

        return;
      }

      setNormalizedImageUri(result.normalizedUri);

      Alert.alert(
        "Sheet Ready",
        "The answer sheet was captured and straightened successfully.",
      );
    } catch (error) {
      showFriendlyError(
        "[OMR] Normalization failed:",
        error,
        "Couldn't Process Photo",
        "GradeLens had trouble reading this photo. Please retake it with the sheet flat, well-lit, and fully inside the guide.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  /*
    |--------------------------------------------------------------------------
    | Retake
    |--------------------------------------------------------------------------
    */

  const handleRetake = () => {
    if (isProcessing) {
      return;
    }

    setCapturedImageUri(null);

    setNormalizedImageUri(null);
  };

  /*
    |--------------------------------------------------------------------------
    | Scan Again
    |--------------------------------------------------------------------------
    */

  const handleScanAgain = () => {
    if (isProcessing) {
      return;
    }

    setNormalizedImageUri(null);

    setCapturedImageUri(null);
  };

  /*
    |--------------------------------------------------------------------------
    | Continue
    |--------------------------------------------------------------------------
    |
    | Each stage below has its OWN try/catch. On failure, that stage shows a
    | specific, friendly alert describing THAT problem, then returns to stop
    | the pipeline. This keeps a "student not in roster" failure from ever
    | being reported to the user as a "question interpreter" error, and lets
    | our own logs immediately show which stage broke.
    |--------------------------------------------------------------------------
    */

  const handleContinue = async () => {
    if (!normalizedImageUri || isProcessing) {
      return;
    }

    setIsProcessing(true);

    try {
      /*
      |--------------------------------------------------------------------------
      | Stage 1: Read Sheet QR
      |--------------------------------------------------------------------------
      |
      | The QR was generated by Laravel as:
      |   {"v":1,"ct":<crs_tst_id>,"s":"<sheet_uuid>"}
      |--------------------------------------------------------------------------
      */

      let qr: SheetQrPayloadV1;

      try {
        console.log("[OMR QR] Reading sheet identity:", normalizedImageUri);

        const qrResult = await GradeLensOmr.readSheetQr50(normalizedImageUri);

        console.log("[OMR QR] Native result:", qrResult);

        if (!qrResult.success || !qrResult.rawValue) {
          throw new Error("GradeLens could not read the answer-sheet QR code.");
        }

        qr = parseSheetQrPayload(qrResult.rawValue);

        console.log("[OMR QR] Parsed identity:", {
          version: qr.v,
          courseTestId: qr.ct,
          sheetUuid: qr.s,
        });
      } catch (error) {
        showFriendlyError(
          "[OMR QR] Failed:",
          error,
          "Couldn't Read QR Code",
          "The QR code on this sheet couldn't be read. Try retaking the photo so the QR code in the top-right corner is fully visible and in focus.",
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | Stage 2: Recognize Student ID
      |--------------------------------------------------------------------------
      */

      let studentIdResult: Awaited<
        ReturnType<typeof GradeLensOmr.readStudentId50>
      >;

      try {
        console.log(
          "[OMR STUDENT ID] Starting recognition:",
          normalizedImageUri,
        );

        studentIdResult =
          await GradeLensOmr.readStudentId50(normalizedImageUri);

        console.log("[OMR STUDENT ID] Result:", studentIdResult);

        console.log(
          "[OMR STUDENT ID] Debug crops:",
          studentIdResult.digits.map((digit) => ({
            position: digit.position,
            predictedDigit: digit.digit,
            confidence: digit.confidence,
            cropUri: digit.cropUri,
            binaryUri: digit.binaryUri,
            modelInputUri: digit.modelInputUri,
          })),
        );

        if (!studentIdResult.success) {
          throw new Error(
            [
              "Student ID recognition is uncertain.",
              `Predicted: ${studentIdResult.studentId}`,
              `Weak positions: ${studentIdResult.weakPositions.join(", ")}`,
              `Minimum confidence: ${studentIdResult.minConfidence.toFixed(3)}`,
            ].join("\n"),
          );
        }
      } catch (error) {
        showFriendlyError(
          "[OMR STUDENT ID] Failed:",
          error,
          "Student ID Unclear",
          "GradeLens couldn't confidently read the student ID number. Please retake the photo with better lighting and make sure each digit is clearly shaded.",
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | Stage 3: Verify Student Against Local Roster
      |--------------------------------------------------------------------------
      |
      | qr.ct identifies the Course Test. The repository resolves that Course
      | Test's crs_id and checks the recognized student_id_no against the
      | locally synced course roster. No network request is performed here.
      |--------------------------------------------------------------------------
      */

      let matchedStudent: Awaited<
        ReturnType<typeof getCourseTestStudentByStudentId>
      >;

      try {
        console.log("[OMR STUDENT] Verifying local roster:", {
          courseTestId: qr.ct,
          studentIdNo: studentIdResult.studentId,
        });

        matchedStudent = await getCourseTestStudentByStudentId(
          qr.ct,
          studentIdResult.studentId,
        );

        if (!matchedStudent) {
          throw new Error(
            [
              "Student is not in the local roster for this Course Test.",
              `Course Test: ${qr.ct}`,
              `Recognized Student ID: ${studentIdResult.studentId}`,
            ].join(" "),
          );
        }

        console.log("[OMR STUDENT] Local roster match:", {
          stdId: matchedStudent.std_id,
          courseId: matchedStudent.crs_id,
          studentIdNo: matchedStudent.student_id_no,
          name: matchedStudent.name,
          tentativeScore: matchedStudent.tentative_score,
          finalScore: matchedStudent.final_score,
          syncStatus: matchedStudent.sync_status,
        });
      } catch (error) {
        showFriendlyError(
          "[OMR STUDENT] Failed:",
          error,
          "Student Not Found",
          `Recognized ID "${studentIdResult.studentId}" isn't in your synced roster for this test. Sync this course while online, or double-check the sheet.`,
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | Stage 4: Resolve Course Test + Question Count
      |--------------------------------------------------------------------------
      |
      | question_count is the authoritative paper format. We call the native
      | analyzers directly so the existing scan code keeps the FULL native
      | result type, including timingMs, cnnProfileMs, crossProfileMs,
      | cropSize, crossExecutedCount, and crossSkippedCount.
      |--------------------------------------------------------------------------
      */

      let localCourseTest: Awaited<ReturnType<typeof getCourseTest>>;
      let questionCount: ReturnType<typeof normalizeOmrQuestionCount>;

      try {
        localCourseTest = await getCourseTest(qr.ct);

        if (!localCourseTest) {
          throw new Error(
            `Course Test ${qr.ct} is not available in local SQLite.`,
          );
        }

        if (localCourseTest.question_count === null) {
          throw new Error(
            `Course Test ${qr.ct} does not have a synced OMR question count.`,
          );
        }

        questionCount = normalizeOmrQuestionCount(
          localCourseTest.question_count,
        );

        console.log("[OMR ROUTER] Paper selected:", {
          courseTestId: qr.ct,
          testId: localCourseTest.tst_id,
          questionCount,
          analyzer:
            questionCount === 50 ? "analyze50Questions" : "analyze100Questions",
        });
      } catch (error) {
        showFriendlyError(
          "[OMR ROUTER] Failed:",
          error,
          "Test Not Available Offline",
          "This course test hasn't been fully synced to this device yet. Please connect to the internet and sync this course, then try again.",
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | Stage 5: Load Local Answer Key
      |--------------------------------------------------------------------------
      */

      let answerKey: Awaited<ReturnType<typeof loadAnswerKey>>;

      try {
        console.log(
          "[OMR SCORE] Loading local answer key for course test:",
          qr.ct,
        );

        answerKey = await loadAnswerKey(qr.ct, questionCount);

        console.log("[OMR SCORE] Local answer key loaded:", {
          courseTestId: qr.ct,
          questionCount,

          answerCount: Object.keys(answerKey).length,

          multipleAnswerQuestions: Object.entries(answerKey)
            .filter(([, answers]) => answers.length > 1)
            .map(([questionNumber]) => Number(questionNumber)),
        });
      } catch (error) {
        showFriendlyError(
          "[OMR SCORE] Answer key load failed:",
          error,
          "Answer Key Unavailable",
          "The answer key for this test isn't available offline yet. Please sync this course test while online, then try again.",
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | Stage 6: Run The Native Bubble Analyzer
      |--------------------------------------------------------------------------
      |
      | DIRECT native routing:
      |   50  -> analyze50Questions()
      |   100 -> analyze100Questions()
      |
      | No generic analyzer wrapper is used here.
      |--------------------------------------------------------------------------
      */

      let result: Awaited<ReturnType<typeof GradeLensOmr.analyze50Questions>>;

      try {
        console.log(
          `[OMR QUESTIONS] Starting ${questionCount}-question interpretation:`,
          normalizedImageUri,
        );

        result =
          questionCount === 50
            ? await GradeLensOmr.analyze50Questions(normalizedImageUri)
            : await GradeLensOmr.analyze100Questions(normalizedImageUri);

        /*
         * TEMPORARY 100-item calibration diagnostics.
         *
         * Keep the working analyzer/scoring behavior unchanged. We only
         * print review/reject questions so the 100-item physical detector
         * can be calibrated using the same evidence-first process used for
         * 50 items.
         */
        if (questionCount === 100) {
          const flaggedQuestions = result.questions.filter(
            (question) =>
              question.needsReview || question.qualityStatus !== "accepted",
          );

          console.log("[OMR 100 DIAGNOSTIC] Flagged question count:", {
            flaggedCount: flaggedQuestions.length,
            flaggedQuestionNumbers: flaggedQuestions.map(
              (question) => question.question,
            ),
          });

          for (const question of flaggedQuestions) {
            console.log("[OMR 100 DIAGNOSTIC] Question:", {
              question: question.question,
              answer: question.answer,
              status: question.status,
              qualityStatus: question.qualityStatus,
              needsReview: question.needsReview,
              shadedChoices: question.shadedChoices,
              crossedChoices: question.crossedChoices,
              invalidChoices: question.invalidChoices,
              bubbles: question.bubbles.map((bubble) => ({
                choice: bubble.choice,
                finalRole: bubble.finalRole,
                cnnLabel: bubble.cnnLabel,
                cnnConfidence: bubble.cnnConfidence,
                coverage: bubble.coverage,
                coverageRole: bubble.coverageRole,
                crossScore: bubble.crossScore,
                crossState: bubble.crossState,
              })),
            });
          }
        }

        console.log("[OMR QUESTIONS] Summary:", {
          success: result.success,
          questionCount: result.questionCount,
          cropSize: result.cropSize,
          statusCounts: result.statusCounts,
          acceptedCount: result.acceptedCount,
          reviewCount: result.reviewCount,
          rejectCount: result.rejectCount,
          crossExecutedCount: result.crossExecutedCount,
          crossSkippedCount: result.crossSkippedCount,
          timingMs: result.timingMs,
          cnnProfileMs: result.cnnProfileMs,
          crossProfileMs: result.crossProfileMs,
        });

        console.log(
          "[OMR PERF] Question analysis timing (ms):",
          result.timingMs,
        );

        console.log(
          "[OMR PERF] CNN internal timing (ms):",
          result.cnnProfileMs,
        );

        console.log(
          "[OMR PERF] Cross internal timing (ms):",
          result.crossProfileMs,
        );
      } catch (error) {
        showFriendlyError(
          "[OMR QUESTIONS] Analysis failed:",
          error,
          "Couldn't Read The Sheet",
          "GradeLens ran into a problem reading the bubbles on this sheet. Please retake the photo, making sure it's flat, well-lit, and fully inside the guide.",
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | Stage 7: Build Submission, Score, And Save Locally
      |--------------------------------------------------------------------------
      |
      | For this checkpoint the QR sheet UUID is also used as the submission
      | UUID. This makes repeat processing of the exact same physical sheet
      | idempotent: SQLite updates the same pending row.
      |
      | savePendingOmrSubmission also updates course_test_results in the SAME
      | transaction so the Course Test detail screen immediately shows the
      | tentative score.
      |--------------------------------------------------------------------------
      */

      try {
        const submissionPayload = buildOmrSubmissionPayload(
          result,
          questionCount,
        );

        console.log("[OMR SUBMISSION] Payload summary:", {
          format: submissionPayload.format,
          questionCount: submissionPayload.question_count,
          reviewQuestionNumbers: submissionPayload.review_question_numbers,
          counts: submissionPayload.counts,
        });

        console.log("[OMR SUBMISSION] Answers:", submissionPayload.answers);

        const tentativeScore = scoreOmrSubmission(submissionPayload, answerKey);

        console.log("[OMR SCORE] Tentative score:", {
          courseTestId: qr.ct,

          tentative: tentativeScore.tentative,

          score: tentativeScore.score,

          totalQuestions: tentativeScore.total_questions,

          keyedQuestions: tentativeScore.keyed_questions,

          answered: tentativeScore.answered,

          unanswered: tentativeScore.unanswered,

          correct: tentativeScore.correct,

          incorrect: tentativeScore.incorrect,

          missingKey: tentativeScore.missing_key,

          missingKeyQuestionNumbers:
            tentativeScore.missing_key_question_numbers,

          reviewQuestionNumbers: tentativeScore.review_question_numbers,
        });

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

        console.log("[OMR SUBMISSION] Saved locally:", {
          submissionUuid: qr.s,
          sheetUuid: qr.s,

          courseTestId: qr.ct,
          testId: localCourseTest.tst_id,

          stdId: matchedStudent.std_id,
          studentIdNo: studentIdResult.studentId,

          tentativeScore: tentativeScore.score,

          questionCount: submissionPayload.question_count,
          reviewQuestionNumbers: submissionPayload.review_question_numbers,

          syncStatus: "pending",
        });

        const DEBUG_TENTATIVE_QUESTION_SCORES = false;

        if (DEBUG_TENTATIVE_QUESTION_SCORES) {
          console.log(
            "[OMR SCORE] Per-question:",
            JSON.stringify(tentativeScore.questions, null, 2),
          );
        }

        const DEBUG_SUBMISSION_PAYLOAD = false;

        if (DEBUG_SUBMISSION_PAYLOAD) {
          console.log(
            "[OMR SUBMISSION] Full payload:",
            JSON.stringify(submissionPayload, null, 2),
          );
        }

        const DEBUG_OMR_DETAILS = false;

        if (DEBUG_OMR_DETAILS) {
          for (const question of result.questions) {
            console.log(
              `[OMR QUESTIONS] Q${String(question.question).padStart(2, "0")}:`,
              {
                answer: question.answer,
                status: question.status,
                qualityStatus: question.qualityStatus,
                shadedChoices: question.shadedChoices,
                crossedChoices: question.crossedChoices,
                invalidChoices: question.invalidChoices,
              },
            );
          }
        }

        /*
        |--------------------------------------------------------------------------
        | Success
        |--------------------------------------------------------------------------
        */

        Alert.alert(
          "Scan Complete",
          [
            `Student: ${matchedStudent.name ?? studentIdResult.studentId}`,
            `Tentative score: ${tentativeScore.score} / ${tentativeScore.total_questions}`,
            submissionPayload.review_question_numbers.length > 0
              ? `${submissionPayload.review_question_numbers.length} question(s) flagged for review.`
              : "No questions were flagged for review.",
          ].join("\n"),
        );
      } catch (error) {
        showFriendlyError(
          "[OMR SUBMISSION] Save failed:",
          error,
          "Couldn't Save Scan",
          "The scan was read successfully, but GradeLens couldn't save it on this device. Please try again.",
        );

        return;
      }
    } finally {
      setIsProcessing(false);
    }
  };

  /*
    |--------------------------------------------------------------------------
    | Permission Loading
    |--------------------------------------------------------------------------
    */

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />

        <Text style={styles.loadingText}>Preparing camera...</Text>
      </View>
    );
  }

  /*
    |--------------------------------------------------------------------------
    | Permission Required
    |--------------------------------------------------------------------------
    */

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>

        <Text style={styles.permissionText}>
          GradeLens needs camera access to scan answer sheets.
        </Text>

        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Allow Camera</Text>
        </Pressable>
      </View>
    );
  }

  /*
    |--------------------------------------------------------------------------
    | Normalized Image Preview
    |--------------------------------------------------------------------------
    */

  if (normalizedImageUri) {
    return (
      <View style={styles.container}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewHeaderTitle}>Normalized Sheet</Text>

          <Text style={styles.previewHeaderText}>
            Verify that the sheet is straight and all bubbles are aligned
            correctly.
          </Text>
        </View>

        <Image
          source={{
            uri: normalizedImageUri,
          }}
          style={styles.previewImage}
          resizeMode="contain"
        />

        {isProcessing && (
          <View style={styles.processingOverlay}>
            <View style={styles.processingCard}>
              <ActivityIndicator size="large" color="#ffffff" />

              <Text style={styles.processingTitle}>Reading Answer Sheet</Text>

              <Text style={styles.processingText}>
                Identifying the student and interpreting each answer. This may
                take a moment...
              </Text>
            </View>
          </View>
        )}

        <View style={styles.previewControls}>
          <Pressable
            style={[
              styles.secondaryButton,
              isProcessing && styles.disabledButton,
            ]}
            disabled={isProcessing}
            onPress={handleScanAgain}
          >
            <Text style={styles.secondaryButtonText}>Scan Again</Text>
          </Pressable>

          <Pressable
            style={[
              styles.primaryButton,
              isProcessing && styles.disabledButton,
            ]}
            disabled={isProcessing}
            onPress={handleContinue}
          >
            {isProcessing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Continue</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  /*
    |--------------------------------------------------------------------------
    | Captured Image Preview
    |--------------------------------------------------------------------------
    */

  if (capturedImageUri) {
    return (
      <View style={styles.container}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewHeaderTitle}>Captured Sheet</Text>

          <Text style={styles.previewHeaderText}>
            Make sure the entire answer sheet and all four markers are visible.
          </Text>
        </View>

        <Image
          source={{
            uri: capturedImageUri,
          }}
          style={styles.previewImage}
          resizeMode="contain"
        />

        {isProcessing && (
          <View style={styles.processingOverlay}>
            <View style={styles.processingCard}>
              <ActivityIndicator size="large" color="#ffffff" />

              <Text style={styles.processingTitle}>Normalizing Sheet</Text>

              <Text style={styles.processingText}>
                Detecting markers and correcting perspective...
              </Text>
            </View>
          </View>
        )}

        <View style={styles.previewControls}>
          <Pressable
            style={[
              styles.secondaryButton,

              isProcessing && styles.disabledButton,
            ]}
            disabled={isProcessing}
            onPress={handleRetake}
          >
            <Text style={styles.secondaryButtonText}>Retake</Text>
          </Pressable>

          <Pressable
            style={[
              styles.primaryButton,

              isProcessing && styles.disabledButton,
            ]}
            disabled={isProcessing}
            onPress={handleUsePhoto}
          >
            {isProcessing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Use Photo</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  /*
    |--------------------------------------------------------------------------
    | Camera
    |--------------------------------------------------------------------------
    */

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        animateShutter={true}
      />

      <View pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topInstruction}>
          <Text style={styles.instructionTitle}>Scan Answer Sheet</Text>

          <Text style={styles.instructionText}>
            Place the whole sheet inside the guide.
          </Text>
        </View>

        <View pointerEvents="none" style={styles.sheetGuide}>
          <View style={[styles.corner, styles.topLeft]} />

          <View style={[styles.corner, styles.topRight]} />

          <View style={[styles.corner, styles.bottomLeft]} />

          <View style={[styles.corner, styles.bottomRight]} />
        </View>

        <View style={styles.captureArea}>
          <Pressable
            disabled={isCapturing || isProcessing}
            onPress={handleCapture}
            style={({ pressed }) => [
              styles.captureOuter,

              pressed &&
                !isCapturing &&
                !isProcessing && {
                  opacity: 0.75,
                },

              (isCapturing || isProcessing) && styles.captureDisabled,
            ]}
          >
            <View style={styles.captureInner}>
              {isCapturing && <ActivityIndicator color="#ffffff" />}
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,

    backgroundColor: "#000000",
  },

  /*
    |--------------------------------------------------------------------------
    | Camera Overlay
    |--------------------------------------------------------------------------
    */

  overlay: {
    ...StyleSheet.absoluteFill,

    justifyContent: "space-between",

    paddingTop: 48,

    paddingBottom: 36,

    paddingHorizontal: 22,
  },

  topInstruction: {
    alignItems: "center",

    paddingHorizontal: 18,

    paddingVertical: 12,

    borderRadius: 12,

    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },

  instructionTitle: {
    fontSize: 18,

    fontWeight: "700",

    color: "#ffffff",
  },

  instructionText: {
    marginTop: 4,

    fontSize: 13,

    textAlign: "center",

    color: "#e5e7eb",
  },

  /*
    |--------------------------------------------------------------------------
    | Sheet Guide
    |--------------------------------------------------------------------------
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

    borderColor: "#f2c231",
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
    bottom: 0,

    right: 0,

    borderBottomWidth: 4,

    borderRightWidth: 4,
  },

  /*
    |--------------------------------------------------------------------------
    | Capture Button
    |--------------------------------------------------------------------------
    */

  captureArea: {
    alignItems: "center",

    justifyContent: "center",
  },

  captureOuter: {
    width: 78,

    height: 78,

    borderRadius: 39,

    borderWidth: 5,

    borderColor: "#ffffff",

    alignItems: "center",

    justifyContent: "center",
  },

  captureDisabled: {
    opacity: 0.65,
  },

  captureInner: {
    width: 58,

    height: 58,

    borderRadius: 29,

    backgroundColor: "#a40c0c",

    alignItems: "center",

    justifyContent: "center",
  },

  /*
    |--------------------------------------------------------------------------
    | Preview Header
    |--------------------------------------------------------------------------
    */

  previewHeader: {
    paddingTop: 18,

    paddingBottom: 14,

    paddingHorizontal: 20,

    alignItems: "center",

    backgroundColor: "#ffffff",
  },

  previewHeaderTitle: {
    fontSize: 18,

    fontWeight: "700",

    color: "#111827",
  },

  previewHeaderText: {
    marginTop: 5,

    fontSize: 13,

    lineHeight: 18,

    textAlign: "center",

    color: "#6b7280",
  },

  /*
    |--------------------------------------------------------------------------
    | Preview Image
    |--------------------------------------------------------------------------
    */

  previewImage: {
    flex: 1,

    width: "100%",

    backgroundColor: "#000000",
  },

  /*
    |--------------------------------------------------------------------------
    | Processing Overlay
    |--------------------------------------------------------------------------
    */

  processingOverlay: {
    ...StyleSheet.absoluteFill,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },

  processingCard: {
    width: "78%",

    maxWidth: 320,

    paddingHorizontal: 24,

    paddingVertical: 24,

    alignItems: "center",

    borderRadius: 14,

    backgroundColor: "rgba(0, 0, 0, 0.82)",
  },

  processingTitle: {
    marginTop: 14,

    fontSize: 17,

    fontWeight: "700",

    color: "#ffffff",
  },

  processingText: {
    marginTop: 6,

    fontSize: 13,

    lineHeight: 19,

    textAlign: "center",

    color: "#d1d5db",
  },

  /*
    |--------------------------------------------------------------------------
    | Preview Controls
    |--------------------------------------------------------------------------
    */

  previewControls: {
    flexDirection: "row",

    gap: 12,

    padding: 18,

    backgroundColor: "#ffffff",
  },

  primaryButton: {
    flex: 1,

    minHeight: 50,

    alignItems: "center",

    justifyContent: "center",

    borderRadius: 10,

    backgroundColor: "#a40c0c",
  },

  primaryButtonText: {
    fontSize: 15,

    fontWeight: "700",

    color: "#ffffff",
  },

  secondaryButton: {
    flex: 1,

    minHeight: 50,

    alignItems: "center",

    justifyContent: "center",

    borderWidth: 1,

    borderColor: "#d1d5db",

    borderRadius: 10,

    backgroundColor: "#ffffff",
  },

  secondaryButtonText: {
    fontSize: 15,

    fontWeight: "700",

    color: "#374151",
  },

  disabledButton: {
    opacity: 0.55,
  },

  /*
    |--------------------------------------------------------------------------
    | Generic Loading
    |--------------------------------------------------------------------------
    */

  center: {
    flex: 1,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "#ffffff",
  },

  loadingText: {
    marginTop: 10,

    color: "#6b7280",
  },

  /*
    |--------------------------------------------------------------------------
    | Permission Screen
    |--------------------------------------------------------------------------
    */

  permissionContainer: {
    flex: 1,

    paddingHorizontal: 32,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "#ffffff",
  },

  permissionTitle: {
    fontSize: 22,

    fontWeight: "700",

    color: "#111827",
  },

  permissionText: {
    marginTop: 10,

    textAlign: "center",

    lineHeight: 21,

    color: "#6b7280",
  },

  permissionButton: {
    marginTop: 22,

    minWidth: 180,

    minHeight: 48,

    paddingHorizontal: 20,

    alignItems: "center",

    justifyContent: "center",

    borderRadius: 10,

    backgroundColor: "#a40c0c",
  },

  permissionButtonText: {
    fontSize: 15,

    fontWeight: "700",

    color: "#ffffff",
  },
});
