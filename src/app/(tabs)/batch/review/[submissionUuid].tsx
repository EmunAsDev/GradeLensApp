import { useCallback, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { loadAnswerKey } from "@/../services/answerKeyService";

import {
  getOmrSubmissionByUuid,
  resolveLocalOmrReviewQuestion,
  type ParsedLocalOmrSubmission,
} from "@/database/omrSubmissionRepository";

import type { AnswerKey } from "@/../modules/gradelens-omr/scoring";

import { theme } from "@/../theme";

const CHOICES = ["A", "B", "C", "D", "E"] as const;

type Choice = (typeof CHOICES)[number];

type SelectionMap = Record<string, string[]>;
type BlankMap = Record<string, boolean>;

type ReturnTarget = "scan" | "batch";

export default function OmrReviewScreen() {
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{
    submissionUuid?: string | string[];
    returnTo?: string | string[];
  }>();

  const submissionUuid = useMemo(() => {
    const value = params.submissionUuid;

    if (Array.isArray(value)) {
      return value[0]?.trim() ?? "";
    }

    return value?.trim() ?? "";
  }, [params.submissionUuid]);

  const returnTarget: ReturnTarget = useMemo(() => {
    const value = Array.isArray(params.returnTo)
      ? params.returnTo[0]
      : params.returnTo;

    return value === "scan" ? "scan" : "batch";
  }, [params.returnTo]);

  const [submission, setSubmission] = useState<ParsedLocalOmrSubmission | null>(
    null,
  );

  const [answerKey, setAnswerKey] = useState<AnswerKey | null>(null);

  const [selections, setSelections] = useState<SelectionMap>({});
  const [confirmedBlank, setConfirmedBlank] = useState<BlankMap>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const reviewQuestionNumbers = useMemo(() => {
    if (!submission) {
      return [];
    }

    const original =
      submission.local_review?.original_review_question_numbers ?? [];

    const source =
      original.length > 0 ? original : submission.review_question_numbers;

    return [...source].sort((a, b) => a - b);
  }, [submission]);

  const loadReview = useCallback(async () => {
    if (!submissionUuid) {
      setSubmission(null);
      setAnswerKey(null);
      setSelections({});
      setConfirmedBlank({});
      return;
    }

    const stored = await getOmrSubmissionByUuid(submissionUuid);

    if (!stored) {
      setSubmission(null);
      setAnswerKey(null);
      return;
    }

    const key = await loadAnswerKey(stored.crs_tst_id, stored.question_count);

    const originalReviewQuestions = stored.local_review
      ?.original_review_question_numbers?.length
      ? stored.local_review.original_review_question_numbers
      : stored.review_question_numbers;

    const nextSelections: SelectionMap = {};
    const nextBlank: BlankMap = {};

    for (const questionNumber of originalReviewQuestions) {
      const resolution =
        stored.local_review?.resolutions?.[String(questionNumber)];

      if (resolution) {
        nextSelections[String(questionNumber)] = [
          ...resolution.resolved_choices,
        ];

        nextBlank[String(questionNumber)] =
          resolution.resolved_choices.length === 0;
      } else {
        nextSelections[String(questionNumber)] = [];
        nextBlank[String(questionNumber)] = false;
      }
    }

    setSubmission(stored);
    setAnswerKey(key);
    setSelections(nextSelections);
    setConfirmedBlank(nextBlank);
    setIsDirty(false);
  }, [submissionUuid]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const run = async () => {
        try {
          await loadReview();
        } catch (error) {
          console.error("[OMR REVIEW] Unable to load local review:", error);

          if (isActive) {
            Alert.alert(
              "Review Unavailable",
              "GradeLens couldn't load this local review. The saved scan was not changed.",
            );
          }
        } finally {
          if (isActive) {
            setIsLoading(false);
          }
        }
      };

      void run();

      return () => {
        isActive = false;
      };
    }, [loadReview]),
  );

  const canEdit =
    submission !== null &&
    submission.sync_status === "pending" &&
    submission.batch_uuid === null;

  const allQuestionsResolved = useMemo(() => {
    if (reviewQuestionNumbers.length === 0) {
      return false;
    }

    return reviewQuestionNumbers.every((questionNumber) => {
      const key = String(questionNumber);
      const selected = selections[key] ?? [];

      return selected.length > 0 || confirmedBlank[key] === true;
    });
  }, [confirmedBlank, reviewQuestionNumbers, selections]);

  const toggleChoice = (questionNumber: number, choice: Choice) => {
    if (!canEdit || isSaving) {
      return;
    }

    const key = String(questionNumber);

    setSelections((current) => {
      const selected = current[key] ?? [];

      const next = selected.includes(choice)
        ? selected.filter((value) => value !== choice)
        : [...selected, choice].sort();

      return {
        ...current,
        [key]: next,
      };
    });

    setConfirmedBlank((current) => ({
      ...current,
      [key]: false,
    }));

    setIsDirty(true);
  };

  const markBlank = (questionNumber: number) => {
    if (!canEdit || isSaving) {
      return;
    }

    const key = String(questionNumber);

    setSelections((current) => ({
      ...current,
      [key]: [],
    }));

    setConfirmedBlank((current) => ({
      ...current,
      [key]: true,
    }));

    setIsDirty(true);
  };

  const navigateAfterReview = () => {
    if (returnTarget === "scan") {
      router.replace("/scan-camera");
      return;
    }

    router.back();
  };

  const handleBack = () => {
    if (!isDirty || isSaving) {
      router.back();
      return;
    }

    Alert.alert(
      "Leave Review?",
      "Your unsaved answer choices will be discarded. The original scan will remain unchanged.",
      [
        {
          text: "Stay",
          style: "cancel",
        },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => router.back(),
        },
      ],
    );
  };

  const handleSave = async () => {
    if (
      !submission ||
      !answerKey ||
      !canEdit ||
      isSaving ||
      !allQuestionsResolved
    ) {
      return;
    }

    setIsSaving(true);

    try {
      let updated = submission;

      for (const questionNumber of reviewQuestionNumbers) {
        const key = String(questionNumber);

        updated = await resolveLocalOmrReviewQuestion(
          submission.submission_uuid,
          questionNumber,
          selections[key] ?? [],
          answerKey,
        );
      }

      setSubmission(updated);
      setIsDirty(false);

      Alert.alert(
        "Review Complete",
        `This paper is now ready to sync. Tentative score: ${formatScore(
          updated.tentative_score,
        )} / ${updated.question_count}.`,
        [
          {
            text: "Continue",
            onPress: navigateAfterReview,
          },
        ],
      );
    } catch (error) {
      console.error("[OMR REVIEW] Unable to save review:", error);

      const message =
        error instanceof Error
          ? error.message
          : "GradeLens couldn't save this local review.";

      Alert.alert("Unable to Save Review", message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading review...</Text>
      </View>
    );
  }

  if (!submissionUuid || !submission || !answerKey) {
    return (
      <View
        style={[
          styles.screen,
          styles.missingScreen,
          {
            paddingTop: insets.top + theme.spacing.xl,
          },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹</Text>
          <Text style={styles.backButtonLabel}>Back</Text>
        </Pressable>

        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Review Not Found</Text>
          <Text style={styles.emptyText}>
            This local OMR submission is no longer available on this device.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + theme.spacing.md,
            paddingBottom: insets.bottom + theme.spacing.xxxl,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave OMR review"
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.backButtonText}>‹</Text>
          <Text style={styles.backButtonLabel}>
            {returnTarget === "scan" ? "Scanner" : "Batch"}
          </Text>
        </Pressable>

        <View style={styles.headerCard}>
          <Text style={styles.eyebrow}>Faculty Clarification</Text>
          <Text style={styles.title}>Review Answer Sheet</Text>

          <Text style={styles.studentId}>{submission.student_id_no}</Text>

          <Text style={styles.description}>
            Clarify only the questions the OMR engine could not confidently
            interpret. Choose every answer you judge the student intended, or
            explicitly mark the response blank.
          </Text>

          <View style={styles.auditNotice}>
            <Text style={styles.auditNoticeText}>
              The original machine interpretation remains stored separately.
              These choices become the effective answers used for tentative and
              Laravel authoritative scoring.
            </Text>
          </View>
        </View>

        {!canEdit ? (
          <View style={styles.lockedCard}>
            <Text style={styles.lockedTitle}>Review Locked</Text>
            <Text style={styles.lockedText}>
              Synchronization has already started for this submission, so its
              stored evidence can no longer be edited on the phone.
            </Text>
          </View>
        ) : null}

        {reviewQuestionNumbers.map((questionNumber) => {
          const key = String(questionNumber);

          const original = submission.questions.find(
            (question) => question.question_number === questionNumber,
          );

          const selected = selections[key] ?? [];
          const isBlank = confirmedBlank[key] === true;

          const evidence = getMachineEvidence(original);

          return (
            <View key={questionNumber} style={styles.questionCard}>
              <View style={styles.questionHeader}>
                <View>
                  <Text style={styles.questionLabel}>
                    Question {questionNumber}
                  </Text>

                  <Text style={styles.machineStatus}>
                    Machine status: {formatMachineStatus(original?.status)}
                  </Text>
                </View>

                <View
                  style={[
                    styles.resolutionBadge,
                    (selected.length > 0 || isBlank) &&
                      styles.resolutionBadgeDone,
                  ]}
                >
                  <Text
                    style={[
                      styles.resolutionBadgeText,
                      (selected.length > 0 || isBlank) &&
                        styles.resolutionBadgeTextDone,
                    ]}
                  >
                    {selected.length > 0 || isBlank ? "Resolved" : "Required"}
                  </Text>
                </View>
              </View>

              <View style={styles.evidenceBox}>
                <Text style={styles.evidenceLabel}>Original OMR evidence</Text>
                <Text style={styles.evidenceText}>{evidence}</Text>
              </View>

              <Text style={styles.choiceInstruction}>
                Faculty-confirmed answer
              </Text>

              <View style={styles.choiceRow}>
                {CHOICES.map((choice) => {
                  const active = selected.includes(choice);

                  return (
                    <Pressable
                      key={choice}
                      disabled={!canEdit || isSaving}
                      onPress={() => toggleChoice(questionNumber, choice)}
                      style={({ pressed }) => [
                        styles.choiceButton,
                        active && styles.choiceButtonActive,
                        pressed && canEdit && styles.pressed,
                        (!canEdit || isSaving) && styles.disabled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.choiceButtonText,
                          active && styles.choiceButtonTextActive,
                        ]}
                      >
                        {choice}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                disabled={!canEdit || isSaving}
                onPress={() => markBlank(questionNumber)}
                style={({ pressed }) => [
                  styles.blankButton,
                  isBlank && styles.blankButtonActive,
                  pressed && canEdit && styles.pressed,
                  (!canEdit || isSaving) && styles.disabled,
                ]}
              >
                <Text
                  style={[
                    styles.blankButtonText,
                    isBlank && styles.blankButtonTextActive,
                  ]}
                >
                  Mark as Blank
                </Text>
              </Pressable>

              {selected.length > 1 ? (
                <Text style={styles.multipleHint}>
                  Multiple choices selected: {selected.join(", ")}
                </Text>
              ) : null}
            </View>
          );
        })}

        {reviewQuestionNumbers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Review Questions</Text>
            <Text style={styles.emptyText}>
              This paper does not currently contain unresolved OMR questions.
            </Text>
          </View>
        ) : null}

        {canEdit && reviewQuestionNumbers.length > 0 ? (
          <View style={styles.saveSection}>
            {!allQuestionsResolved ? (
              <Text style={styles.saveHint}>
                Every listed question must have a faculty-confirmed answer or be
                explicitly marked blank before this paper can become Ready to
                Sync.
              </Text>
            ) : (
              <Text style={styles.saveReadyHint}>
                All review questions have a faculty decision. Saving will make
                this paper Ready to Sync.
              </Text>
            )}

            <Pressable
              disabled={isSaving || !allQuestionsResolved}
              onPress={() => {
                void handleSave();
              }}
              style={({ pressed }) => [
                styles.saveButton,
                pressed && !isSaving && allQuestionsResolved && styles.pressed,
                (isSaving || !allQuestionsResolved) && styles.disabled,
              ]}
            >
              {isSaving ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.textInverse}
                />
              ) : null}

              <Text style={styles.saveButtonText}>
                {isSaving ? "Saving Review..." : "Save Review & Make Ready"}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function getMachineEvidence(
  question: ParsedLocalOmrSubmission["questions"][number] | undefined,
): string {
  if (!question) {
    return "No stored question evidence is available.";
  }

  const parts: string[] = [];

  if (question.selected_choices.length > 0) {
    parts.push(`selected ${question.selected_choices.join(", ")}`);
  }

  if (question.shaded_choices.length > 0) {
    parts.push(`shaded ${question.shaded_choices.join(", ")}`);
  }

  if (question.crossed_choices.length > 0) {
    parts.push(`crossed ${question.crossed_choices.join(", ")}`);
  }

  if (question.invalid_choices.length > 0) {
    parts.push(`invalid ${question.invalid_choices.join(", ")}`);
  }

  if (parts.length === 0) {
    return "No confident choice was produced by the machine interpreter.";
  }

  return parts.join(" · ");
}

function formatMachineStatus(value: string | undefined): string {
  if (!value) {
    return "Unknown";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatScore(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

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

  content: {
    paddingHorizontal: theme.spacing.screenHorizontal,
  },

  missingScreen: {
    paddingHorizontal: theme.spacing.screenHorizontal,
  },

  backButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    marginBottom: theme.spacing.md,
  },

  backButtonText: {
    marginTop: -2,
    marginRight: 4,
    fontSize: 34,
    lineHeight: 34,
    color: theme.colors.primary,
  },

  backButtonLabel: {
    ...theme.typography.bodyStrong,
    color: theme.colors.primary,
  },

  headerCard: {
    padding: theme.spacing.cardPadding,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  eyebrow: {
    ...theme.typography.sectionTitle,
    color: theme.colors.primary,
  },

  title: {
    marginTop: theme.spacing.xs,
    ...theme.typography.screenTitle,
    color: theme.colors.text,
  },

  studentId: {
    marginTop: theme.spacing.md,
    ...theme.typography.cardTitle,
    color: theme.colors.text,
  },

  description: {
    marginTop: theme.spacing.sm,
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },

  auditNotice: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },

  auditNoticeText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },

  lockedCard: {
    padding: theme.spacing.cardPadding,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.warningSoft,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.warningSoft,
  },

  lockedTitle: {
    ...theme.typography.bodyStrong,
    color: theme.colors.warning,
  },

  lockedText: {
    marginTop: theme.spacing.xs,
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },

  questionCard: {
    padding: theme.spacing.cardPadding,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  questionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },

  questionLabel: {
    ...theme.typography.cardTitle,
    color: theme.colors.text,
  },

  machineStatus: {
    marginTop: theme.spacing.xs,
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  resolutionBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.warningSoft,
  },

  resolutionBadgeDone: {
    backgroundColor: theme.colors.successSoft,
  },

  resolutionBadgeText: {
    ...theme.typography.label,
    color: theme.colors.warning,
  },

  resolutionBadgeTextDone: {
    color: theme.colors.success,
  },

  evidenceBox: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },

  evidenceLabel: {
    ...theme.typography.label,
    color: theme.colors.textMuted,
  },

  evidenceText: {
    marginTop: theme.spacing.xs,
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },

  choiceInstruction: {
    marginTop: theme.spacing.lg,
    ...theme.typography.bodyStrong,
    color: theme.colors.text,
  },

  choiceRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },

  choiceButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
  },

  choiceButtonActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },

  choiceButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },

  choiceButtonTextActive: {
    color: theme.colors.textInverse,
  },

  blankButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },

  blankButtonActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },

  blankButtonText: {
    ...theme.typography.bodyStrong,
    color: theme.colors.textSecondary,
  },

  blankButtonTextActive: {
    color: theme.colors.primary,
  },

  multipleHint: {
    marginTop: theme.spacing.sm,
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  saveSection: {
    marginTop: theme.spacing.sm,
    padding: theme.spacing.cardPadding,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
  },

  saveHint: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  saveReadyHint: {
    ...theme.typography.caption,
    color: theme.colors.success,
  },

  saveButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
  },

  saveButtonText: {
    ...theme.typography.bodyStrong,
    color: theme.colors.textInverse,
  },

  emptyCard: {
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.xxl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
  },

  emptyTitle: {
    ...theme.typography.cardTitle,
    color: theme.colors.text,
  },

  emptyText: {
    maxWidth: 290,
    marginTop: theme.spacing.sm,
    textAlign: "center",
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },

  pressed: {
    opacity: 0.78,
  },

  disabled: {
    opacity: 0.45,
  },
});
