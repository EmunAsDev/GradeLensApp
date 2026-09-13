import { useCallback, useMemo, useState } from "react";

import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  getScanBatches,
  refreshScanBatchStatus,
  type LocalScanBatchStatus,
  type LocalScanBatchSummary,
} from "@/database/scanBatchRepository";
import { router, useFocusEffect } from "expo-router";

import { AppScreenHeader } from "@/../components/layout/AppScreenHeader";
import { theme } from "@/../theme";

type QueueCounts = {
  ready: number;
  review: number;
  failed: number;
  waiting: number;
};

const EMPTY_QUEUE_COUNTS: QueueCounts = {
  ready: 0,
  review: 0,
  failed: 0,
  waiting: 0,
};

export default function BatchScreen() {
  const [batches, setBatches] = useState<LocalScanBatchSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /*
   * --------------------------------------------------------------------------
   * Local Batch List
   * --------------------------------------------------------------------------
   *
   * Opening/focusing Batch is SQLite-only. No submission is uploaded from this
   * screen. The teacher chooses one Batch first, then submits it from the Batch
   * Details screen.
   */
  const loadLocalState = useCallback(async (repairBatchStatus = false) => {
    if (repairBatchStatus) {
      const existingBatches = await getScanBatches();

      await Promise.allSettled(
        existingBatches.map((batch) =>
          refreshScanBatchStatus(batch.scan_batch_uuid),
        ),
      );
    }

    setBatches(await getScanBatches());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const load = async () => {
        try {
          await loadLocalState(true);
        } catch (error) {
          console.error("[BATCH] Unable to load local batches:", error);
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

  const queueCounts = useMemo<QueueCounts>(() => {
    return batches.reduce<QueueCounts>(
      (counts, batch) => {
        counts.ready += batch.ready_count;
        counts.review += batch.review_count;
        counts.failed += batch.attention_count;
        counts.waiting +=
          batch.ready_count + batch.review_count + batch.attention_count;

        return counts;
      },
      { ...EMPTY_QUEUE_COUNTS },
    );
  }, [batches]);

  const handleRefresh = async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);

    try {
      await loadLocalState(true);
    } catch (error) {
      console.error("[BATCH] Local refresh failed:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleOpenBatch = (batch: LocalScanBatchSummary) => {
    router.push({
      pathname: "/batch/[scanBatchUuid]",
      params: {
        scanBatchUuid: batch.scan_batch_uuid,
      },
    });
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading batches...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={batches}
        keyExtractor={(item) => item.scan_batch_uuid}
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
          batches.length === 0 && styles.emptyContent,
        ]}
        ListHeaderComponent={
          <>
            <AppScreenHeader
              embedded
              eyebrow="GradeLens"
              title="Batch"
              subtitle="Review your local scan batches and open one when you're ready to inspect or submit its papers."
            />

            <View style={styles.queueCard}>
              <View style={styles.queueHeader}>
                <View style={styles.queueTitleGroup}>
                  <Text style={styles.queueTitle}>Submission Queue</Text>
                  <Text style={styles.queueSubtitle}>
                    {queueCounts.waiting === 0
                      ? "No submissions waiting"
                      : `${queueCounts.waiting} submission${queueCounts.waiting === 1 ? "" : "s"} waiting`}
                  </Text>
                </View>

                <StatusBadge
                  label={
                    queueCounts.failed > 0 ? "Needs Attention" : "On Device"
                  }
                  tone={queueCounts.failed > 0 ? "danger" : "neutral"}
                />
              </View>

              <View style={styles.summaryRow}>
                <SummaryItem label="Ready" value={queueCounts.ready} />
                <SummaryItem label="Review" value={queueCounts.review} />
                <SummaryItem label="Failed" value={queueCounts.failed} />
              </View>

              <Text style={styles.queueHint}>
                Open a Batch to see its individual submissions. Nothing is sent
                to GradeLens until you explicitly submit that Batch.
              </Text>
            </View>

            <View style={styles.listHeadingRow}>
              <Text style={styles.listHeading}>Scan Batches</Text>
              <Text style={styles.listHeadingHint}>Tap a batch to open</Text>
            </View>
          </>
        }
        ListEmptyComponent={<EmptyBatches />}
        renderItem={({ item }) => (
          <BatchCard batch={item} onPress={() => handleOpenBatch(item)} />
        )}
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
      />
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

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "primary";

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

function BatchCard({
  batch,
  onPress,
}: {
  batch: LocalScanBatchSummary;
  onPress: () => void;
}) {
  const status = getBatchStatusPresentation(batch.status);
  const unresolved =
    batch.ready_count + batch.review_count + batch.attention_count;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open Batch ${batch.batch_number}`}
      onPress={onPress}
      style={({ pressed }) => [styles.batchCard, pressed && styles.pressed]}
    >
      <View style={styles.batchTopRow}>
        <View style={styles.batchTitleGroup}>
          <Text style={styles.batchTitle}>Batch #{batch.batch_number}</Text>

          <Text style={styles.batchCourse} numberOfLines={1}>
            {batch.course_code ?? "Course"}
            {batch.course_test_title ? ` · ${batch.course_test_title}` : ""}
          </Text>
        </View>

        <View style={styles.batchStatusGroup}>
          <StatusBadge label={status.label} tone={status.tone} />
          <Text style={styles.chevron}>›</Text>
        </View>
      </View>

      <View style={styles.batchStats}>
        <BatchStat label="Scans" value={batch.submission_count} />
        <BatchStat label="Waiting" value={unresolved} />
        <BatchStat label="Review" value={batch.review_count} />
        <BatchStat label="Failed" value={batch.attention_count} />
        <BatchStat label="Synced" value={batch.submitted_count} />
      </View>

      <Text style={styles.batchFooter}>
        {formatBatchTime(batch.created_at)}
      </Text>
    </Pressable>
  );
}

function BatchStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.batchStat}>
      <Text style={styles.batchStatValue}>{value}</Text>
      <Text style={styles.batchStatLabel}>{label}</Text>
    </View>
  );
}

function EmptyBatches() {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>No Scan Batches Yet</Text>
      <Text style={styles.emptyText}>
        Answer sheets you scan will be grouped here automatically by Course
        Test.
      </Text>
    </View>
  );
}

function getBatchStatusPresentation(status: LocalScanBatchStatus): {
  label: string;
  tone: BadgeTone;
} {
  switch (status) {
    case "submitting":
      return { label: "Submitting", tone: "primary" };

    case "submitted":
      return { label: "Submitted", tone: "success" };

    case "needs_attention":
      return { label: "Needs Attention", tone: "warning" };

    case "draft":
    default:
      return { label: "Open", tone: "neutral" };
  }
}

function formatBatchTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Saved locally";
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
    paddingBottom: theme.spacing.xxxl,
  },

  emptyContent: {
    flexGrow: 1,
  },

  queueCard: {
    padding: theme.spacing.cardPadding,
    marginBottom: theme.spacing.xxl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  queueHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },

  queueTitleGroup: {
    flex: 1,
  },

  queueTitle: {
    ...theme.typography.cardTitle,
    color: theme.colors.text,
  },

  queueSubtitle: {
    marginTop: theme.spacing.xs,
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },

  summaryRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },

  summaryItem: {
    flex: 1,
    minHeight: 68,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },

  summaryValue: {
    ...theme.typography.metric,
    color: theme.colors.text,
  },

  summaryLabel: {
    marginTop: 2,
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  queueHint: {
    marginTop: theme.spacing.md,
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  listHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },

  listHeading: {
    ...theme.typography.sectionTitle,
    color: theme.colors.textSecondary,
  },

  listHeadingHint: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  itemSeparator: {
    height: theme.spacing.sm,
  },

  batchCard: {
    padding: theme.spacing.cardPadding,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  batchTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },

  batchTitleGroup: {
    flex: 1,
  },

  batchTitle: {
    ...theme.typography.cardTitle,
    color: theme.colors.text,
  },

  batchCourse: {
    marginTop: theme.spacing.xs,
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },

  batchStatusGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },

  chevron: {
    marginTop: -2,
    fontSize: 28,
    lineHeight: 28,
    color: theme.colors.textMuted,
  },

  batchStats: {
    flexDirection: "row",
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.divider,
  },

  batchStat: {
    flex: 1,
    alignItems: "center",
  },

  batchStatValue: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },

  batchStatLabel: {
    marginTop: 2,
    fontSize: 10,
    color: theme.colors.textMuted,
  },

  batchFooter: {
    marginTop: theme.spacing.md,
    ...theme.typography.caption,
    color: theme.colors.textMuted,
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
