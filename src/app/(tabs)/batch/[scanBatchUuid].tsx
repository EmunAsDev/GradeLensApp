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

import { AppScreenHeader } from "@/../components/layout/AppScreenHeader";
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

    for (const submission of submissions) {
      if (submission.sync_status === "synced") {
        synced++;
        continue;
      }

      if (submission.sync_status === "failed") {
        failed++;
        continue;
      }

      if (submission.sync_status === "syncing") {
        syncing++;
      }

      if (submission.requires_review) {
        review++;
      } else {
        ready++;
      }
    }

    return {
      ready,
      review,
      failed,
      synced,
      syncing,
      outstanding: submissions.length - synced,
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

    if (counts.outstanding <= 0) {
      Alert.alert(
        "Batch Submitted",
        "Every submission in this Batch has already been synchronized.",
      );
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

      if (result.failedCount > 0) {
        Alert.alert(
          "Batch Needs Attention",
          `${result.syncedCount} submission(s) were accepted and ${result.failedCount} could not be completed. Only unresolved submissions will be retried next time.`,
        );
        return;
      }

      Alert.alert(
        "Batch Submitted",
        `${result.syncedCount} submission(s) synchronized successfully.`,
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
      <View style={styles.screen}>
        <AppScreenHeader
          back
          backLabel="Batch"
          title="Batch Not Found"
          subtitle="This local Batch is no longer available on this device."
        />

        <View style={styles.missingBody}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Local Batch Data</Text>
            <Text style={styles.emptyText}>
              Return to Batch and choose another saved scan batch.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const batchStatus = getBatchStatusPresentation(batch.status);
  const submitLabel = getSubmitButtonLabel(
    batch,
    counts.outstanding,
    isSyncing,
  );

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
            paddingBottom: insets.bottom + theme.spacing.xxxl,
          },
        ]}
        ListHeaderComponent={
          <>
            <AppScreenHeader
              embedded
              back
              backLabel="Batch"
              eyebrow="Scan Batch"
              title={`Batch #${batch.batch_number}`}
              subtitle={`${batch.course_code ?? "Course"}${
                batch.course_test_title ? ` · ${batch.course_test_title}` : ""
              }`}
              right={
                <StatusBadge
                  label={batchStatus.label}
                  tone={batchStatus.tone}
                />
              }
            />

            <View style={styles.headerCard}>
              <View style={styles.summaryGrid}>
                <SummaryItem label="Scans" value={submissions.length} />
                <SummaryItem label="Ready" value={counts.ready} />
                <SummaryItem label="Review" value={counts.review} />
                <SummaryItem label="Failed" value={counts.failed} />
                <SummaryItem label="Synced" value={counts.synced} />
              </View>

              <Pressable
                disabled={isSyncing || counts.outstanding === 0}
                onPress={() => {
                  void handleSubmitBatch();
                }}
                style={({ pressed }) => [
                  styles.submitButton,
                  pressed &&
                    !isSyncing &&
                    counts.outstanding > 0 &&
                    styles.pressed,
                  (isSyncing || counts.outstanding === 0) && styles.disabled,
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

              <Text style={styles.submitHint}>
                Ready and Needs Review scans can both be submitted. Once a scan
                has been assigned to a server batch, its stored evidence is
                locked and retries reuse that same identity.
              </Text>
            </View>

            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionHeading}>Submissions</Text>
              <Text style={styles.sectionHeadingHint}>
                {submissions.length} paper{submissions.length === 1 ? "" : "s"}
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
  onRemove,
}: {
  batch: LocalScanBatchSummary;
  submission: ParsedLocalOmrSubmission;
  isRemoving: boolean;
  onRemove: () => void;
}) {
  const quality = getQualityPresentation(submission);
  const sync = getSyncPresentation(submission);
  const canRemove = canRemoveSubmission(batch, submission);
  const score = submission.final_score ?? submission.tentative_score;
  const scoreLabel =
    submission.sync_status === "synced" && submission.final_score !== null
      ? "Final Score"
      : "Tentative Score";

  return (
    <View style={styles.submissionCard}>
      <View style={styles.submissionTopRow}>
        <View style={styles.studentGroup}>
          <Text style={styles.studentId}>{submission.student_id_no}</Text>
          <Text style={styles.captureTime}>
            Captured {formatTime(submission.captured_at)}
          </Text>
        </View>

        <StatusBadge label={sync.label} tone={sync.tone} />
      </View>

      <View style={styles.scoreRow}>
        <View>
          <Text style={styles.scoreLabel}>{scoreLabel}</Text>
          <Text style={styles.scoreValue}>
            {formatScore(score)} / {submission.question_count}
          </Text>
        </View>

        <StatusBadge label={quality.label} tone={quality.tone} />
      </View>

      {submission.review_question_numbers.length > 0 ? (
        <View style={styles.reviewBox}>
          <Text style={styles.reviewTitle}>Questions to review</Text>
          <Text style={styles.reviewText}>
            {formatReviewQuestions(submission.review_question_numbers)}
          </Text>
        </View>
      ) : null}

      {submission.sync_status === "failed" ? (
        <Text style={styles.failureText}>
          This submission could not be completed. Submit this Batch again to
          retry only unresolved scans.
        </Text>
      ) : null}

      {canRemove ? (
        <Pressable
          disabled={isRemoving}
          onPress={onRemove}
          style={({ pressed }) => [
            styles.removeButton,
            pressed && !isRemoving && styles.pressed,
            isRemoving && styles.disabled,
          ]}
        >
          {isRemoving ? (
            <ActivityIndicator size="small" color={theme.colors.danger} />
          ) : null}

          <Text style={styles.removeButtonText}>
            {isRemoving ? "Removing..." : "Remove Scan"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryItem}>
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

function getQualityPresentation(submission: ParsedLocalOmrSubmission): {
  label: string;
  tone: BadgeTone;
} {
  if (submission.requires_review) {
    return {
      label: "Needs Review",
      tone: "warning",
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
      return {
        label: "Synced",
        tone: "success",
      };

    case "failed":
      return {
        label: "Sync Failed",
        tone: "danger",
      };

    case "pending":
    default:
      return {
        label: "Waiting",
        tone: "neutral",
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
  outstandingCount: number,
  isSyncing: boolean,
): string {
  if (isSyncing) {
    return "Submitting...";
  }

  if (outstandingCount <= 0 || batch.status === "submitted") {
    return "Batch Submitted";
  }

  if (batch.status === "needs_attention") {
    return `Continue Submission (${outstandingCount})`;
  }

  return `Submit ${outstandingCount} Submission${outstandingCount === 1 ? "" : "s"}`;
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

  missingBody: {
    paddingHorizontal: theme.spacing.screenHorizontal,
  },

  headerCard: {
    padding: theme.spacing.cardPadding,
    marginBottom: theme.spacing.xxl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  summaryGrid: {
    flexDirection: "row",
  },

  summaryItem: {
    flex: 1,
    alignItems: "center",
  },

  summaryValue: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
  },

  summaryLabel: {
    marginTop: 2,
    fontSize: 10,
    color: theme.colors.textMuted,
  },

  submitButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
  },

  submitButtonText: {
    ...theme.typography.bodyStrong,
    color: theme.colors.textInverse,
  },

  submitHint: {
    marginTop: theme.spacing.sm,
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },

  sectionHeading: {
    ...theme.typography.sectionTitle,
    color: theme.colors.textSecondary,
  },

  sectionHeadingHint: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  itemSeparator: {
    height: theme.spacing.sm,
  },

  submissionCard: {
    padding: theme.spacing.cardPadding,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  submissionTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },

  studentGroup: {
    flex: 1,
  },

  studentId: {
    ...theme.typography.cardTitle,
    color: theme.colors.text,
  },

  captureTime: {
    marginTop: theme.spacing.xs,
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  scoreRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.divider,
  },

  scoreLabel: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  scoreValue: {
    marginTop: 2,
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
  },

  reviewBox: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warningSoft,
  },

  reviewTitle: {
    ...theme.typography.label,
    color: theme.colors.warning,
  },

  reviewText: {
    marginTop: theme.spacing.xs,
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },

  failureText: {
    marginTop: theme.spacing.md,
    ...theme.typography.caption,
    color: theme.colors.danger,
  },

  removeButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
  },

  removeButtonText: {
    ...theme.typography.bodyStrong,
    color: theme.colors.danger,
  },

  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceMuted,
  },

  badgeSuccess: {
    backgroundColor: theme.colors.successSoft,
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
    ...theme.typography.label,
    color: theme.colors.textMuted,
  },

  badgeTextSuccess: {
    color: theme.colors.success,
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
    opacity: 0.78,
  },

  disabled: {
    opacity: 0.45,
  },

  emptyCard: {
    minHeight: 180,
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
