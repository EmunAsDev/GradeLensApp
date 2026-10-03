import { useCallback, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthContext";

import {
  getOmrSubmissionsForScanBatch,
  removeDraftOmrSubmission,
  type ParsedLocalOmrSubmission,
} from "@/database/omrSubmissionRepository";

import {
  getScanBatchByUuid,
  refreshScanBatchStatus,
  type LocalScanBatchStatus,
  type LocalScanBatchSummary,
} from "@/database/scanBatchRepository";

import { syncScanBatch } from "@/sync/omrSubmissionSync";

import { theme } from "@/../theme";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "primary";

export default function BatchDetailsScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{
    scanBatchUuid?: string | string[];
  }>();

  const scanBatchUuid = useMemo(() => {
    const value = params.scanBatchUuid;

    if (Array.isArray(value)) {
      return value[0]?.trim() ?? "";
    }

    return value?.trim() ?? "";
  }, [params.scanBatchUuid]);

  const [batch, setBatch] = useState<LocalScanBatchSummary | null>(null);
  const [submissions, setSubmissions] = useState<ParsedLocalOmrSubmission[]>(
    [],
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [removingSubmissionUuid, setRemovingSubmissionUuid] = useState<
    string | null
  >(null);

  /*
   * --------------------------------------------------------------------------
   * Local Batch Details
   * --------------------------------------------------------------------------
   *
   * Opening/focusing this screen is SQLite-only. Synchronization happens only
   * when the teacher presses the explicit Submit / Retry button below.
   */
  const loadLocalState = useCallback(
    async (repairBatchStatus = false) => {
      if (!scanBatchUuid) {
        setBatch(null);
        setSubmissions([]);
        return;
      }

      if (repairBatchStatus) {
        await refreshScanBatchStatus(scanBatchUuid);
      }

      const [localBatch, localSubmissions] = await Promise.all([
        getScanBatchByUuid(scanBatchUuid),
        getOmrSubmissionsForScanBatch(scanBatchUuid),
      ]);

      setBatch(localBatch);
      setSubmissions(localSubmissions);
    },
    [scanBatchUuid],
  );

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const load = async () => {
        try {
          await loadLocalState(true);
        } catch (error) {
          console.error("[BATCH DETAIL] Unable to load batch:", error);
        } finally {
          if (isActive) {
            setIsLoading(false);
          }
        }
      };

      void load();

      return () => {
        isActive = false;
      };
    }, [loadLocalState]),
  );

  const counts = useMemo(() => {
    let ready = 0;
    let review = 0;
    let failed = 0;
    let synced = 0;
    let syncing = 0;
    let rejected = 0;
    let retryPending = 0;

    for (const submission of submissions) {
      if (submission.sync_status === "synced") {
        synced++;
        continue;
      }

      if (submission.sync_status === "rejected") {
        rejected++;
        continue;
      }

      if (submission.sync_status === "failed") {
        failed++;
        continue;
      }

      if (submission.sync_status === "syncing") {
        syncing++;
        continue;
      }

      if (submission.requires_review && submission.batch_uuid === null) {
        review++;
        continue;
      }

      if (submission.batch_uuid !== null) {
        retryPending++;
        continue;
      }

      ready++;
    }

    const syncable = ready + failed + syncing + retryPending;
    const outstanding = syncable + review;

    return {
      ready,
      review,
      failed,
      synced,
      syncing,
      rejected,
      retryPending,
      syncable,
      outstanding,
    };
  }, [submissions]);

  const handleRefresh = async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);

    try {
      await loadLocalState(true);
    } catch (error) {
      console.error("[BATCH DETAIL] Local refresh failed:", error);

      Alert.alert(
        "Unable to Refresh",
        "GradeLens couldn't refresh this local Batch. Your saved scans were not changed.",
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSubmitBatch = async () => {
    if (isSyncing || !batch) {
      return;
    }

    if (!token) {
      Alert.alert(
        "Session Required",
        "Please sign in again before submitting this Batch.",
      );
      return;
    }

    if (counts.syncable <= 0) {
      if (counts.review > 0) {
        Alert.alert(
          "Review Required",
          `${counts.review} paper${counts.review === 1 ? "" : "s"} still need faculty clarification. Review papers stay on this device and cannot be submitted until they are resolved.`,
        );
      } else {
        Alert.alert(
          "Batch Submitted",
          "Every submission in this Batch has already been synchronized.",
        );
      }

      return;
    }

    setIsSyncing(true);

    try {
      const result = await syncScanBatch(token, batch.scan_batch_uuid);

      await loadLocalState(true);

      if (result.submissionCount === 0) {
        Alert.alert(
          "Batch Submitted",
          "There are no unresolved submissions in this Batch.",
        );
        return;
      }

      if (result.rateLimited) {
        const retryText =
          result.retryAfterSeconds !== null
            ? ` Try again in about ${result.retryAfterSeconds} seconds.`
            : " Try again shortly.";

        Alert.alert(
          "Submission Paused",
          `GradeLens temporarily paused submission.${retryText} Your scans remain safe on this device.`,
        );
        return;
      }

      if (result.reviewCount > 0) {
        Alert.alert(
          "Server Review Safeguard",
          `${result.reviewCount} submission${result.reviewCount === 1 ? "" : "s"} reached Laravel with a server-side review condition. This is a fallback safeguard; normal mobile review papers should be resolved before synchronization.`,
        );
        return;
      }

      if (result.rejectedCount > 0 && result.failedCount === 0) {
        Alert.alert(
          "Batch Completed with Issues",
          `${result.syncedCount} finalized and ${result.rejectedCount} were not accepted because they conflict with an already finalized result. Rejected scans will not be retried.`,
        );
        return;
      }

      if (result.failedCount > 0 || result.rejectedCount > 0) {
        Alert.alert(
          "Batch Needs Attention",
          `${result.syncedCount} finalized, ${result.failedCount} retryable failure(s), and ${result.rejectedCount} non-retryable issue(s). Only retryable synchronization failures will be attempted again.`,
        );
        return;
      }

      Alert.alert(
        "Batch Submitted",
        `${result.syncedCount} submission(s) synchronized and finalized successfully.`,
      );
    } catch (error) {
      console.error("[BATCH DETAIL] Submission failed:", error);

      await loadLocalState(true);

      Alert.alert(
        "Submission Interrupted",
        "GradeLens couldn't finish submitting this Batch. Anything already accepted remains saved, and unresolved submissions can be retried.",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReviewSubmission = (submission: ParsedLocalOmrSubmission) => {
    if (
      submission.batch_uuid !== null ||
      submission.sync_status !== "pending"
    ) {
      Alert.alert(
        "Review Locked",
        "This scan can no longer be edited locally because synchronization has already started.",
      );
      return;
    }

    router.push({
      pathname: "/batch/review/[submissionUuid]",
      params: {
        submissionUuid: submission.submission_uuid,
        returnTo: "batch",
      },
    });
  };

  const handleRemoveSubmission = (submission: ParsedLocalOmrSubmission) => {
    if (!batch || !canRemoveSubmission(batch, submission)) {
      Alert.alert(
        "Scan Locked",
        "This scan can no longer be removed because submission to GradeLens has already started.",
      );
      return;
    }

    Alert.alert(
      "Remove Scan?",
      `Remove the local scan for student ${submission.student_id_no}? You can scan the physical answer sheet again from the Scan tab.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void performRemoveSubmission(submission);
          },
        },
      ],
    );
  };

  const performRemoveSubmission = async (
    submission: ParsedLocalOmrSubmission,
  ) => {
    if (removingSubmissionUuid) {
      return;
    }

    setRemovingSubmissionUuid(submission.submission_uuid);

    try {
      const result = await removeDraftOmrSubmission(submission.submission_uuid);

      if (!result.removed) {
        Alert.alert("Scan Not Found", "The local scan is no longer available.");
        return;
      }

      const remainingBatch = await getScanBatchByUuid(scanBatchUuid);

      if (!remainingBatch) {
        Alert.alert(
          "Batch Removed",
          "That was the last scan in this local Batch, so the empty Batch was removed.",
          [
            {
              text: "OK",
              onPress: () => router.back(),
            },
          ],
        );
        return;
      }

      await loadLocalState(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "GradeLens couldn't remove this local scan.";

      Alert.alert("Unable to Remove Scan", message);
    } finally {
      setRemovingSubmissionUuid(null);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading Batch...</Text>
      </View>
    );
  }

  if (!scanBatchUuid || !batch) {
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
          <Text style={styles.backButtonLabel}>Batch</Text>
        </Pressable>

        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Batch Not Found</Text>
          <Text style={styles.emptyText}>
            This local Batch is no longer available on this device.
          </Text>
        </View>
      </View>
    );
  }

  const batchStatus = getBatchStatusPresentation(batch.status);

  const submitLabel = getSubmitButtonLabel(
    batch,
    counts.syncable,
    counts.review,
    isSyncing,
  );

  const submitDisabled = isSyncing || counts.syncable === 0;

  return (
    <View style={styles.screen}>
      <FlatList
        data={submissions}
        keyExtractor={(item) => item.submission_uuid}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + theme.spacing.sm,

            paddingBottom: insets.bottom + theme.spacing.xxxl,
          },
        ]}
        ListHeaderComponent={
          <>
            <View style={styles.pageHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to Batch list"
                onPress={() => router.back()}
                style={({ pressed }) => [
                  styles.headerBackButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.headerBackIcon}>‹</Text>
              </Pressable>

              <Text style={styles.pageTitle} numberOfLines={1}>
                Batch {batch.batch_number} -{" "}
                {shortBatchUuid(batch.scan_batch_uuid)}
              </Text>
            </View>

            <Text style={styles.scanBatchLabel}>Scan Batch</Text>

            <View style={styles.headerCard}>
              <View style={styles.batchCourseRow}>
                <Text style={styles.courseLine} numberOfLines={2}>
                  {batch.course_code ?? "Course"}
                  {batch.crs_tst_id ? ` (${batch.crs_tst_id})` : ""}
                  {batch.course_test_title
                    ? ` | ${batch.course_test_title}`
                    : ""}
                </Text>

                <StatusBadge
                  label={batchStatus.label}
                  tone={batchStatus.tone}
                />
              </View>

              <View style={styles.summaryGrid}>
                <SummaryItem label="Scans" value={submissions.length} />

                <SummaryItem label="Ready" value={counts.ready} tone="ready" />

                <SummaryItem
                  label="Review"
                  value={counts.review}
                  tone="review"
                />

                <SummaryItem
                  label="Issues"
                  value={counts.failed + counts.rejected}
                  tone="issues"
                />

                <SummaryItem
                  label="Synced"
                  value={counts.synced}
                  tone="synced"
                />
              </View>

              <Pressable
                disabled={submitDisabled}
                onPress={() => {
                  void handleSubmitBatch();
                }}
                style={({ pressed }) => [
                  styles.submitButton,

                  batch.status === "submitted" && styles.submitButtonComplete,

                  batch.status === "completed_with_issues" &&
                    styles.submitButtonWarning,

                  batch.status === "needs_attention" &&
                    styles.submitButtonDanger,

                  counts.syncable === 0 &&
                    counts.review > 0 &&
                    styles.submitButtonWarning,

                  pressed && !submitDisabled && styles.pressed,

                  submitDisabled &&
                    batch.status !== "submitted" &&
                    counts.review === 0 &&
                    styles.submitButtonDisabled,
                ]}
              >
                {isSyncing ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.textInverse}
                  />
                ) : null}

                <Text style={styles.submitButtonText}>{submitLabel}</Text>
              </Pressable>

              <View style={styles.batchHintRow}>
                <Text style={styles.batchHintIcon}>ⓘ</Text>

                <Text style={styles.submitHint}>
                  Only Ready and retryable synchronization submissions are sent.
                  Needs Review papers stay on this device until faculty resolves
                  every uncertain question.
                </Text>
              </View>
            </View>

            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionHeading}>Submissions</Text>

              <Text style={styles.sectionHeadingHint}>
                {submissions.length} paper
                {submissions.length === 1 ? "" : "s"}
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Submissions</Text>

            <Text style={styles.emptyText}>
              There are no saved scans inside this Batch.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <SubmissionCard
            batch={batch}
            submission={item}
            isRemoving={removingSubmissionUuid === item.submission_uuid}
            onReview={() => handleReviewSubmission(item)}
            onRemove={() => handleRemoveSubmission(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
      />
    </View>
  );
}

function SubmissionCard({
  batch,
  submission,
  isRemoving,
  onReview,
  onRemove,
}: {
  batch: LocalScanBatchSummary;
  submission: ParsedLocalOmrSubmission;
  isRemoving: boolean;
  onReview: () => void;
  onRemove: () => void;
}) {
  const presentation = getSubmissionCardPresentation(submission);

  const canRemove = canRemoveSubmission(batch, submission);

  const canReview =
    submission.sync_status === "pending" &&
    submission.batch_uuid === null &&
    (submission.requires_review ||
      submission.local_review?.state === "resolved");

  const originalReviewQuestionNumbers = submission.local_review
    ?.original_review_question_numbers?.length
    ? submission.local_review.original_review_question_numbers
    : submission.review_question_numbers;

  const score = submission.final_score ?? submission.tentative_score;

  const scoreLabel =
    submission.sync_status === "synced" && submission.final_score !== null
      ? "Final Score"
      : "Tentative Score";

  const showLocalStateBox =
    submission.sync_status === "pending" && submission.batch_uuid === null;

  return (
    <View
      style={[
        styles.submissionCard,

        presentation.tone === "success" && styles.submissionCardSuccess,

        presentation.tone === "warning" && styles.submissionCardWarning,

        presentation.tone === "danger" && styles.submissionCardDanger,

        presentation.tone === "primary" && styles.submissionCardPrimary,
      ]}
    >
      <View
        style={[
          styles.submissionAccent,

          presentation.tone === "success" &&
            (submission.sync_status === "synced"
              ? styles.submissionAccentComplete
              : styles.submissionAccentReady),

          presentation.tone === "warning" && styles.submissionAccentReview,

          presentation.tone === "danger" && styles.submissionAccentDanger,

          presentation.tone === "primary" && styles.submissionAccentPrimary,
        ]}
      />

      <View style={styles.submissionMainRow}>
        <View style={styles.submissionIdentity}>
          <Text style={styles.studentId} numberOfLines={1}>
            {submission.student_id_no}
          </Text>

          <Text style={styles.captureTime} numberOfLines={1}>
            Captured {formatTime(submission.captured_at)}
          </Text>
        </View>

        <View style={styles.scoreBlock}>
          <Text style={styles.scoreLabel} numberOfLines={1}>
            {scoreLabel}
          </Text>

          <Text style={styles.scoreValue} numberOfLines={1}>
            {formatScore(score)} / {submission.question_count}
          </Text>
        </View>

        <StatusBadge label={presentation.label} tone={presentation.tone} />
      </View>

      {showLocalStateBox ? (
        <View style={styles.submissionBottomRow}>
          <View
            style={[
              styles.localStateBox,

              submission.requires_review
                ? styles.localStateBoxReview
                : styles.localStateBoxReady,
            ]}
          >
            <Text
              style={[
                styles.localStateTitle,

                submission.requires_review
                  ? styles.localStateTitleReview
                  : styles.localStateTitleReady,
              ]}
            >
              {submission.requires_review
                ? "Questions to review"
                : submission.local_review?.state === "resolved"
                  ? "Review completed"
                  : "Ready to sync"}
            </Text>

            <Text style={styles.localStateText} numberOfLines={2}>
              {submission.requires_review
                ? formatReviewQuestions(originalReviewQuestionNumbers)
                : submission.local_review?.state === "resolved" &&
                    originalReviewQuestionNumbers.length > 0
                  ? formatReviewQuestions(originalReviewQuestionNumbers)
                  : "No review required"}
            </Text>
          </View>

          {canReview || canRemove ? (
            <View style={styles.cardActionRow}>
              {canReview ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onReview}
                  style={({ pressed }) => [
                    styles.reviewButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.reviewButtonText}>
                    {submission.requires_review
                      ? "Review Answers"
                      : "Edit Review"}
                  </Text>
                </Pressable>
              ) : null}

              {canRemove ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={isRemoving}
                  onPress={onRemove}
                  style={({ pressed }) => [
                    styles.removeButton,
                    pressed && !isRemoving && styles.pressed,
                    isRemoving && styles.disabled,
                  ]}
                >
                  {isRemoving ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.danger}
                    />
                  ) : null}

                  <Text style={styles.removeButtonText}>
                    {isRemoving ? "Removing..." : "Remove Scan"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {submission.sync_status === "rejected" ? (
        <View style={styles.issueMessageBox}>
          <Text style={styles.failureText}>
            Not accepted because this student already has a finalized result for
            this Course Test.
          </Text>
        </View>
      ) : submission.sync_status === "failed" ? (
        <View style={styles.issueMessageBox}>
          <Text style={styles.failureText}>
            Synchronization failed. Submit this Batch again to retry unresolved
            scans.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

type SummaryTone = "neutral" | "ready" | "review" | "issues" | "synced";

function SummaryItem({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: SummaryTone;
}) {
  return (
    <View
      style={[
        styles.summaryItem,

        tone === "ready" && styles.summaryItemReady,

        tone === "review" && styles.summaryItemReview,

        tone === "issues" && styles.summaryItemIssues,

        tone === "synced" && styles.summaryItemSynced,
      ]}
    >
      <Text style={styles.summaryValue}>{value}</Text>

      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  return (
    <View
      style={[
        styles.badge,
        tone === "success" && styles.badgeSuccess,
        tone === "warning" && styles.badgeWarning,
        tone === "danger" && styles.badgeDanger,
        tone === "primary" && styles.badgePrimary,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          tone === "success" && styles.badgeTextSuccess,
          tone === "warning" && styles.badgeTextWarning,
          tone === "danger" && styles.badgeTextDanger,
          tone === "primary" && styles.badgeTextPrimary,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function canRemoveSubmission(
  batch: LocalScanBatchSummary,
  submission: ParsedLocalOmrSubmission,
): boolean {
  return (
    batch.status === "draft" &&
    submission.sync_status === "pending" &&
    submission.batch_uuid === null
  );
}

function getSubmissionCardPresentation(submission: ParsedLocalOmrSubmission): {
  label: string;
  tone: BadgeTone;
} {
  if (submission.sync_status === "synced") {
    if (
      submission.server_status === "review_required" ||
      submission.server_requires_review === true
    ) {
      return {
        label: "Synced · Review",
        tone: "warning",
      };
    }

    return {
      label: "Synced",
      tone: "success",
    };
  }

  if (submission.sync_status === "rejected") {
    return {
      label: "Not Accepted",
      tone: "danger",
    };
  }

  if (submission.sync_status === "failed") {
    return {
      label: "Sync Failed",
      tone: "danger",
    };
  }

  if (submission.sync_status === "syncing") {
    return {
      label: "Syncing",
      tone: "primary",
    };
  }

  if (submission.batch_uuid !== null) {
    return {
      label: "Retry Pending",
      tone: "primary",
    };
  }

  if (submission.requires_review) {
    return {
      label: "Needs Review",
      tone: "warning",
    };
  }

  if (submission.local_review?.state === "resolved") {
    return {
      label: "Reviewed · Ready",
      tone: "success",
    };
  }

  return {
    label: "Ready",
    tone: "success",
  };
}

function shortBatchUuid(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length <= 14) {
    return trimmed.toUpperCase();
  }

  return `${trimmed.slice(0, 10).toUpperCase()}…`;
}

function getQualityPresentation(submission: ParsedLocalOmrSubmission): {
  label: string;
  tone: BadgeTone;
} {
  if (submission.server_requires_review === true) {
    return {
      label: "Server Review",
      tone: "warning",
    };
  }

  if (submission.requires_review) {
    return {
      label: "Needs Review",
      tone: "warning",
    };
  }

  if (submission.local_review?.state === "resolved") {
    return {
      label: "Reviewed · Ready",
      tone: "success",
    };
  }

  return {
    label: "Ready",
    tone: "success",
  };
}

function getSyncPresentation(submission: ParsedLocalOmrSubmission): {
  label: string;
  tone: BadgeTone;
} {
  switch (submission.sync_status) {
    case "syncing":
      return {
        label: "Syncing",
        tone: "primary",
      };

    case "synced":
      if (
        submission.server_status === "review_required" ||
        submission.server_requires_review === true
      ) {
        return {
          label: "Synced · Review",
          tone: "warning",
        };
      }

      return {
        label: "Synced",
        tone: "success",
      };

    case "rejected":
      return {
        label: "Not Accepted",
        tone: "danger",
      };

    case "failed":
      return {
        label: "Sync Failed",
        tone: "danger",
      };

    case "pending":
    default:
      if (submission.requires_review && submission.batch_uuid === null) {
        return {
          label: "Review First",
          tone: "warning",
        };
      }

      return {
        label: submission.batch_uuid ? "Retry Pending" : "Ready to Sync",
        tone: submission.batch_uuid ? "primary" : "neutral",
      };
  }
}

function getBatchStatusPresentation(status: LocalScanBatchStatus): {
  label: string;
  tone: BadgeTone;
} {
  switch (status) {
    case "submitting":
      return {
        label: "Submitting",
        tone: "primary",
      };

    case "submitted":
      return {
        label: "Submitted",
        tone: "success",
      };

    case "completed_with_issues":
      return {
        label: "Completed with Issues",
        tone: "warning",
      };

    case "needs_attention":
      return {
        label: "Needs Attention",
        tone: "warning",
      };

    case "draft":
    default:
      return {
        label: "Open",
        tone: "neutral",
      };
  }
}

function getSubmitButtonLabel(
  batch: LocalScanBatchSummary,
  syncableCount: number,
  reviewCount: number,
  isSyncing: boolean,
): string {
  if (isSyncing) {
    return "Submitting...";
  }

  if (batch.status === "completed_with_issues") {
    return "Batch Complete";
  }

  if (batch.status === "submitted") {
    return "Batch Submitted";
  }

  if (syncableCount <= 0 && reviewCount > 0) {
    return `Review Required (${reviewCount})`;
  }

  if (syncableCount <= 0) {
    return "Batch Submitted";
  }

  if (batch.status === "needs_attention") {
    return `Continue Submission (${syncableCount})`;
  }

  return `Submit ${syncableCount} Submission${syncableCount === 1 ? "" : "s"}`;
}

function formatScore(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatReviewQuestions(questionNumbers: number[]): string {
  const visible = questionNumbers.slice(0, 12).map((number) => `Q${number}`);
  const remaining = questionNumbers.length - visible.length;

  if (remaining <= 0) {
    return visible.join(", ");
  }

  return `${visible.join(", ")} +${remaining} more`;
}

function formatTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "locally";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

  pageHeader: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },

  headerBackButton: {
    width: 36,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
    marginRight: theme.spacing.xs,
  },

  headerBackIcon: {
    marginTop: -3,
    fontSize: 32,
    lineHeight: 34,
    color: theme.colors.text,
  },

  pageTitle: {
    flex: 1,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    color: theme.colors.text,
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

  scanBatchLabel: {
    marginLeft: 4,
    marginBottom: 4,
    ...theme.typography.bodyStrong,
    color: theme.colors.text,
  },

  headerCard: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  batchCourseRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },

  courseLine: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },

  summaryGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: theme.spacing.sm,
  },

  summaryItem: {
    flex: 1,
    minHeight: 54,
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: theme.colors.surfaceMuted,
  },

  summaryItemReady: {
    backgroundColor: "#EAF7EC",
  },

  summaryItemReview: {
    backgroundColor: theme.colors.warningSoft,
  },

  summaryItemIssues: {
    backgroundColor: theme.colors.dangerSoft,
  },

  summaryItemSynced: {
    backgroundColor: "#DCFCE7",
  },

  summaryValue: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "700",
    color: theme.colors.text,
  },

  summaryLabel: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    color: theme.colors.textMuted,
  },

  submitButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
  },

  submitButtonComplete: {
    backgroundColor: "#166534",
  },

  submitButtonWarning: {
    backgroundColor: theme.colors.warning,
  },

  submitButtonDanger: {
    backgroundColor: theme.colors.danger,
  },

  submitButtonDisabled: {
    opacity: 0.55,
  },

  submitButtonText: {
    ...theme.typography.bodyStrong,
    color: theme.colors.textInverse,
  },

  batchHintRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginTop: theme.spacing.sm,
    paddingHorizontal: 2,
  },

  batchHintIcon: {
    marginTop: 1,
    fontSize: 14,
    lineHeight: 17,
    color: theme.colors.textSecondary,
  },

  submitHint: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    color: theme.colors.textMuted,
  },

  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    marginHorizontal: 4,
    marginBottom: theme.spacing.sm,
  },

  sectionHeading: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "700",
    color: theme.colors.text,
  },

  sectionHeadingHint: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  itemSeparator: {
    height: theme.spacing.sm,
  },

  submissionCard: {
    position: "relative",
    overflow: "hidden",
    paddingLeft: theme.spacing.lg,
    paddingRight: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  submissionCardSuccess: {
    borderColor: "#CFEBD5",
  },

  submissionCardWarning: {
    borderColor: "#F2D57C",
  },

  submissionCardDanger: {
    borderColor: "#F6B8BC",
  },

  submissionCardPrimary: {
    borderColor: theme.colors.primary,
  },

  submissionAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 7,
    backgroundColor: theme.colors.border,
  },

  submissionAccentReady: {
    backgroundColor: "#55B96B",
  },

  submissionAccentComplete: {
    backgroundColor: "#166534",
  },

  submissionAccentReview: {
    backgroundColor: theme.colors.warning,
  },

  submissionAccentDanger: {
    backgroundColor: theme.colors.danger,
  },

  submissionAccentPrimary: {
    backgroundColor: theme.colors.primary,
  },

  submissionMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },

  submissionIdentity: {
    flex: 1.25,
    minWidth: 0,
  },

  studentId: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: theme.colors.text,
  },

  captureTime: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 14,
    color: theme.colors.textMuted,
  },

  scoreBlock: {
    minWidth: 78,
    alignItems: "flex-start",
  },

  scoreLabel: {
    fontSize: 9,
    lineHeight: 12,
    color: theme.colors.textMuted,
  },

  scoreValue: {
    marginTop: 1,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "600",
    color: theme.colors.text,
  },

  submissionBottomRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.divider,
  },

  localStateBox: {
    flex: 1,
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: 6,
  },

  localStateBoxReview: {
    backgroundColor: theme.colors.warningSoft,
  },

  localStateBoxReady: {
    backgroundColor: "#EAF7EC",
  },

  localStateTitle: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
  },

  localStateTitleReview: {
    color: theme.colors.warning,
  },

  localStateTitleReady: {
    color: "#2E7D32",
  },

  localStateText: {
    marginTop: 1,
    fontSize: 9,
    lineHeight: 12,
    color: theme.colors.textMuted,
  },

  cardActionRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
  },

  reviewButton: {
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
  },

  reviewButtonText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },

  removeButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: 6,
    backgroundColor: theme.colors.surface,
  },

  removeButtonText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
    color: theme.colors.danger,
  },

  issueMessageBox: {
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: theme.colors.dangerSoft,
  },

  failureText: {
    fontSize: 10,
    lineHeight: 14,
    color: theme.colors.danger,
  },

  badge: {
    flexShrink: 0,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceMuted,
  },

  badgeSuccess: {
    backgroundColor: "#EAF7EC",
  },

  badgeWarning: {
    backgroundColor: theme.colors.warningSoft,
  },

  badgeDanger: {
    backgroundColor: theme.colors.dangerSoft,
  },

  badgePrimary: {
    backgroundColor: theme.colors.primarySoft,
  },

  badgeText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    color: theme.colors.textMuted,
  },

  badgeTextSuccess: {
    color: "#2E7D32",
  },

  badgeTextWarning: {
    color: theme.colors.warning,
  },

  badgeTextDanger: {
    color: theme.colors.danger,
  },

  badgeTextPrimary: {
    color: theme.colors.primary,
  },

  pressed: {
    opacity: 0.75,
  },

  disabled: {
    opacity: 0.45,
  },

  emptyCard: {
    minHeight: 140,
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
});
