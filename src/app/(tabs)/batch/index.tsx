import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon, type AppIconName } from "@/../components/icons/AppIcon";
import { getScreenHorizontalPadding, theme } from "@/../theme";
import {
  getScanBatches,
  refreshScanBatchStatus,
  type LocalScanBatchSummary,
} from "@/database/scanBatchRepository";

type QueueCounts = {
  ready: number;
  review: number;
  failed: number;
  waiting: number;
};

type BatchCategory = "ready" | "review" | "issues" | "complete";

type BatchFilter = "all" | BatchCategory;

type BatchSection = {
  category: BatchCategory;
  data: LocalScanBatchSummary[];
};

type CategoryPresentation = {
  label: string;
  sectionLabel: string;
  icon: AppIconName;
  color: string;
  softColor: string;
};

const FILTER_ORDER: BatchFilter[] = [
  "all",
  "ready",
  "review",
  "issues",
  "complete",
];

const CATEGORY_ORDER: BatchCategory[] = [
  "issues",
  "review",
  "ready",
  "complete",
];

const BATCH_STATUS_COLORS = {
  ready: {
    color: "#2E7D32",
    softColor: "#EAF7EC",
  },

  complete: {
    color: "#166534",
    softColor: "#DCFCE7",
  },
} as const;

export default function BatchScreen() {
  const [batches, setBatches] = useState<LocalScanBatchSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<BatchFilter>("all");
  const [showInfoBanner, setShowInfoBanner] = useState(true);

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPadding = getScreenHorizontalPadding(width);

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
      {
        ready: 0,
        review: 0,
        failed: 0,
        waiting: 0,
      },
    );
  }, [batches]);

  const filterCounts = useMemo(() => {
    const counts: Record<BatchFilter, number> = {
      all: batches.length,
      ready: 0,
      review: 0,
      issues: 0,
      complete: 0,
    };

    for (const batch of batches) {
      counts[getBatchCategory(batch)] += 1;
    }

    return counts;
  }, [batches]);

  const sections = useMemo<BatchSection[]>(() => {
    const categories = activeFilter === "all" ? CATEGORY_ORDER : [activeFilter];

    return categories
      .map((category) => ({
        category,
        data: batches.filter((batch) => getBatchCategory(batch) === category),
      }))
      .filter((section) => section.data.length > 0);
  }, [batches, activeFilter]);

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
      <View style={styles.screen}>
        <StatusBar style="dark" hidden={false} />
        <View style={{ height: insets.top }} />
        <RootHeader />

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading batches...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" hidden={false} />
      <View style={{ height: insets.top }} />

      {/*
       * ----------------------------------------------------------------------
       * FIXED AREA
       * ----------------------------------------------------------------------
       *
       * The header, information banner, queue summary, Scan Batches heading,
       * and horizontal status filters remain visible.
       */}
      <RootHeader />

      <View
        style={[
          styles.fixedContent,
          {
            paddingHorizontal: horizontalPadding,
          },
        ]}
      >
        {showInfoBanner ? (
          <InfoBanner onClose={() => setShowInfoBanner(false)} />
        ) : null}

        <QueueSection counts={queueCounts} />

        <View style={styles.scanBatchesHeading}>
          <Text style={styles.scanBatchesTitle}>Scan Batches</Text>

          <Text style={styles.scanBatchesSubtitle}>
            Tap a Batch to inspect its submissions.
          </Text>
        </View>

        <BatchFilterBar
          activeFilter={activeFilter}
          counts={filterCounts}
          onSelect={setActiveFilter}
        />
      </View>

      {/*
       * ----------------------------------------------------------------------
       * SCROLLABLE AREA
       * ----------------------------------------------------------------------
       *
       * Only the categorized Scan Batch list scrolls vertically.
       */}
      <SectionList<LocalScanBatchSummary, BatchSection>
        style={styles.batchList}
        sections={sections}
        keyExtractor={(item) => item.scan_batch_uuid}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
        contentContainerStyle={[
          styles.batchListContent,

          {
            paddingHorizontal: horizontalPadding,
          },

          sections.length === 0 && styles.emptyBatchListContent,
        ]}
        renderSectionHeader={({ section }) => (
          <BatchSectionHeader section={section} />
        )}
        renderItem={({ item }) => (
          <BatchCard batch={item} onPress={() => handleOpenBatch(item)} />
        )}
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
        SectionSeparatorComponent={() => (
          <View style={styles.sectionSeparator} />
        )}
        ListEmptyComponent={<EmptyBatches filter={activeFilter} />}
      />
    </View>
  );
}

function RootHeader() {
  return (
    <View style={styles.rootHeader}>
      <Text style={styles.rootHeaderTitle}>Batch</Text>
    </View>
  );
}

function InfoBanner({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.infoBanner}>
      <View style={styles.infoIcon}>
        <AppIcon name="info" size={18} color={theme.colors.info} />
      </View>

      <Text style={styles.infoText}>
        Review your local scan batches and open one when you're ready to inspect
        or submit its papers.
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss Batch information"
        hitSlop={8}
        onPress={onClose}
        style={({ pressed }) => [
          styles.infoCloseButton,
          pressed && styles.infoClosePressed,
        ]}
      >
        <AppIcon name="close" size={17} color={theme.colors.textMuted} />
      </Pressable>
    </View>
  );
}

function QueueSection({ counts }: { counts: QueueCounts }) {
  return (
    <View style={styles.queueSection}>
      <View style={styles.queueHeadingRow}>
        <Text style={styles.queueHeading}>Submission Queue</Text>

        <View style={styles.onDeviceBadge}>
          <AppIcon name="offline" size={13} color={theme.colors.textMuted} />
          <Text style={styles.onDeviceText}>On Device</Text>
        </View>
      </View>

      <View style={styles.queueCard}>
        <View style={styles.queueSummaryRow}>
          <QueueSummaryItem
            label="Ready"
            value={counts.ready}
            icon="sync"
            color={BATCH_STATUS_COLORS.ready.color}
            softColor={BATCH_STATUS_COLORS.ready.softColor}
          />

          <QueueSummaryItem
            label="Review"
            value={counts.review}
            icon="review"
            color={theme.colors.warning}
            softColor={theme.colors.warningSoft}
          />

          <QueueSummaryItem
            label="Failed"
            value={counts.failed}
            icon="error"
            color={theme.colors.danger}
            softColor={theme.colors.dangerSoft}
          />
        </View>

        <View style={styles.queueHintRow}>
          <AppIcon name="info" size={16} color={theme.colors.textMuted} />
          <Text style={styles.queueHint}>
            Opening a Batch never submits it. Submission happens only from Batch
            Details.
          </Text>
        </View>
      </View>
    </View>
  );
}

function QueueSummaryItem({
  label,
  value,
  icon,
  color,
  softColor,
}: {
  label: string;
  value: number;
  icon: AppIconName;
  color: string;
  softColor: string;
}) {
  return (
    <View style={[styles.queueSummaryItem, { backgroundColor: softColor }]}>
      <View style={styles.queueSummaryTopRow}>
        <Text style={styles.queueSummaryValue}>{value}</Text>
        <AppIcon name={icon} size={16} color={color} />
      </View>

      <Text style={styles.queueSummaryLabel}>{label}</Text>
    </View>
  );
}

function BatchFilterBar({
  activeFilter,
  counts,
  onSelect,
}: {
  activeFilter: BatchFilter;
  counts: Record<BatchFilter, number>;
  onSelect: (filter: BatchFilter) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterContent}
      style={styles.filterScroll}
    >
      {FILTER_ORDER.map((filter) => (
        <FilterChip
          key={filter}
          filter={filter}
          count={counts[filter]}
          isActive={activeFilter === filter}
          onPress={() => onSelect(filter)}
        />
      ))}
    </ScrollView>
  );
}

function FilterChip({
  filter,
  count,
  isActive,
  onPress,
}: {
  filter: BatchFilter;
  count: number;
  isActive: boolean;
  onPress: () => void;
}) {
  const presentation = getFilterPresentation(filter);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        {
          borderColor: isActive ? presentation.color : theme.colors.border,
          backgroundColor: isActive
            ? presentation.softColor
            : theme.colors.surface,
        },
        pressed && styles.filterChipPressed,
      ]}
    >
      <AppIcon
        name={presentation.icon}
        size={16}
        color={isActive ? presentation.color : theme.colors.textMuted}
      />

      <Text
        style={[
          styles.filterChipText,
          {
            color: isActive ? presentation.color : theme.colors.textSecondary,
          },
        ]}
      >
        {presentation.label}
      </Text>

      <View
        style={[
          styles.filterCount,
          {
            backgroundColor: isActive
              ? theme.colors.surface
              : theme.colors.surfaceMuted,
          },
        ]}
      >
        <Text
          style={[
            styles.filterCountText,
            {
              color: isActive ? presentation.color : theme.colors.textMuted,
            },
          ]}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function BatchSectionHeader({ section }: { section: BatchSection }) {
  const presentation = getCategoryPresentation(section.category);

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderMain}>
        <View
          style={[
            styles.sectionHeaderIcon,
            { backgroundColor: presentation.softColor },
          ]}
        >
          <AppIcon
            name={presentation.icon}
            size={16}
            color={presentation.color}
          />
        </View>

        <Text style={styles.sectionHeaderTitle}>
          {presentation.sectionLabel}
        </Text>
      </View>

      <Text style={styles.sectionHeaderCount}>
        {section.data.length} {section.data.length === 1 ? "Batch" : "Batches"}
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
  const category = getBatchCategory(batch);
  const presentation = getCategoryPresentation(category);
  const unresolved =
    batch.ready_count + batch.review_count + batch.attention_count;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open Batch ${batch.batch_number}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.batchCard,
        { borderTopColor: presentation.color },
        pressed && styles.batchCardPressed,
      ]}
    >
      <View style={styles.batchTopRow}>
        <View style={styles.batchTitleArea}>
          <View style={styles.batchTitleRow}>
            <Text style={styles.batchTitle}>Batch {batch.batch_number}</Text>

            <View
              style={[
                styles.batchStateBadge,
                { backgroundColor: presentation.softColor },
              ]}
            >
              <AppIcon
                name={presentation.icon}
                size={12}
                color={presentation.color}
              />
              <Text
                style={[styles.batchStateText, { color: presentation.color }]}
              >
                {presentation.label}
              </Text>
            </View>
          </View>

          <Text
            style={styles.batchCourse}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {batch.course_code ?? "Course"}
            {batch.course_test_title ? ` · ${batch.course_test_title}` : ""}
          </Text>
        </View>

        <View style={styles.batchChevron}>
          <AppIcon name="next" size={22} color={theme.colors.textMuted} />
        </View>
      </View>

      <View style={styles.batchMetaRow}>
        <View style={styles.batchMetaItem}>
          <AppIcon name="scan" size={15} color={theme.colors.textMuted} />
          <Text style={styles.batchMetaText}>
            {batch.submission_count}{" "}
            {batch.submission_count === 1 ? "scan" : "scans"}
          </Text>
        </View>

        <View style={styles.batchMetaItem}>
          <AppIcon name="time" size={15} color={theme.colors.textMuted} />
          <Text style={styles.batchMetaText}>
            {formatBatchTime(batch.created_at)}
          </Text>
        </View>
      </View>

      <View style={styles.batchFooter}>
        <View style={styles.batchFooterMain}>
          <Text style={styles.batchDetailText} numberOfLines={1}>
            {getBatchDetailText(batch, category)}
          </Text>

          {unresolved > 0 ? (
            <Text style={styles.batchWaitingText}>{unresolved} waiting</Text>
          ) : null}
        </View>

        <Text style={styles.batchUuid} numberOfLines={1}>
          Local · {shortenUuid(batch.scan_batch_uuid)}
        </Text>
      </View>
    </Pressable>
  );
}

function EmptyBatches({ filter }: { filter: BatchFilter }) {
  const presentation = getFilterPresentation(filter);

  return (
    <View style={styles.emptyState}>
      <View
        style={[styles.emptyIcon, { backgroundColor: presentation.softColor }]}
      >
        <AppIcon
          name={presentation.icon}
          size={26}
          color={presentation.color}
        />
      </View>

      <Text style={styles.emptyTitle}>
        {filter === "all"
          ? "No Scan Batches Yet"
          : `No ${presentation.label} Batches`}
      </Text>

      <Text style={styles.emptyText}>
        {filter === "all"
          ? "Answer sheets you scan will be grouped here automatically by Course Test."
          : `There are no local Batches in the ${presentation.label} category.`}
      </Text>
    </View>
  );
}

function getBatchCategory(batch: LocalScanBatchSummary): BatchCategory {
  if (
    batch.attention_count > 0 ||
    batch.rejected_count > 0 ||
    batch.status === "needs_attention" ||
    batch.status === "completed_with_issues"
  ) {
    return "issues";
  }

  if (batch.review_count > 0) {
    return "review";
  }

  if (batch.status === "submitted") {
    return "complete";
  }

  return "ready";
}

function getCategoryPresentation(
  category: BatchCategory,
): CategoryPresentation {
  switch (category) {
    case "ready":
      return {
        label: "Ready",
        sectionLabel: "Ready to Submit",
        icon: "sync",
        color: BATCH_STATUS_COLORS.ready.color,
        softColor: BATCH_STATUS_COLORS.ready.softColor,
      };

    case "review":
      return {
        label: "Review",
        sectionLabel: "Needs Review",
        icon: "review",
        color: theme.colors.warning,
        softColor: theme.colors.warningSoft,
      };

    case "issues":
      return {
        label: "Issues",
        sectionLabel: "Needs Attention",
        icon: "error",
        color: theme.colors.danger,
        softColor: theme.colors.dangerSoft,
      };

    case "complete":
      return {
        label: "Complete",
        sectionLabel: "Completed",
        icon: "success",
        color: BATCH_STATUS_COLORS.complete.color,
        softColor: BATCH_STATUS_COLORS.complete.softColor,
      };
  }
}

function getFilterPresentation(filter: BatchFilter): CategoryPresentation {
  if (filter === "all") {
    return {
      label: "All",
      sectionLabel: "All Batches",
      icon: "batch",
      color: theme.colors.text,
      softColor: theme.colors.surfaceMuted,
    };
  }

  return getCategoryPresentation(filter);
}

function getBatchDetailText(
  batch: LocalScanBatchSummary,
  category: BatchCategory,
): string {
  switch (category) {
    case "issues": {
      const parts: string[] = [];

      if (batch.attention_count > 0) {
        parts.push(`${batch.attention_count} failed`);
      }

      if (batch.rejected_count > 0) {
        parts.push(`${batch.rejected_count} rejected`);
      }

      return parts.join(" · ") || "Submission needs attention";
    }

    case "review":
      return `${batch.review_count} ${
        batch.review_count === 1 ? "scan needs" : "scans need"
      } review`;

    case "complete":
      return `${batch.submitted_count} ${
        batch.submitted_count === 1 ? "scan" : "scans"
      } synchronized`;

    case "ready":
    default:
      if (batch.status === "submitting") {
        return "Submission in progress";
      }

      return `${batch.ready_count} ${
        batch.ready_count === 1 ? "scan ready" : "scans ready"
      } to submit`;
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

function shortenUuid(value: string): string {
  const normalized = value.trim();

  if (normalized.length <= 8) {
    return normalized.toUpperCase();
  }

  return normalized.slice(0, 8).toUpperCase();
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  rootHeader: {
    minHeight: 72,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.screenHorizontal,
    backgroundColor: theme.colors.background,
  },

  rootHeaderTitle: {
    ...theme.typography.screenTitle,
    color: theme.colors.text,
  },

  /*
   * ------------------------------------------------------------------------
   * Fixed content above the Batch list
   * ------------------------------------------------------------------------
   */
  fixedContent: {
    width: "100%",
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: "center",
    flexShrink: 0,
    paddingTop: theme.spacing.sm,
  },

  /*
   * ------------------------------------------------------------------------
   * Vertically scrollable Scan Batch list
   * ------------------------------------------------------------------------
   */
  batchList: {
    flex: 1,
  },

  batchListContent: {
    width: "100%",
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: "center",
    paddingBottom: theme.spacing.xxxl,
  },

  emptyBatchListContent: {
    flexGrow: 1,
  },

  infoBanner: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.infoSoft,
  },

  infoIcon: {
    width: 24,
    height: 24,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  infoText: {
    flex: 1,
    ...theme.typography.tabLabel,
    color: theme.colors.textSecondary,
  },

  infoCloseButton: {
    width: 36,
    height: 36,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.pill,
  },

  infoClosePressed: {
    opacity: 0.5,
  },

  queueSection: {
    marginTop: theme.spacing.none,
  },

  queueHeadingRow: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },

  queueHeading: {
    ...theme.typography.cardTitle,
    color: theme.colors.text,
  },

  onDeviceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceMuted,
  },

  onDeviceText: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  queueCard: {
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  queueSummaryRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },

  queueSummaryItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 72,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },

  queueSummaryTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },

  queueSummaryValue: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
    color: theme.colors.text,
  },

  queueSummaryLabel: {
    marginTop: 2,
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },

  queueHintRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },

  queueHint: {
    flex: 1,
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  scanBatchesHeading: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xs,
  },

  scanBatchesTitle: {
    ...theme.typography.sectionTitle,
    color: theme.colors.text,
  },

  scanBatchesSubtitle: {
    marginTop: 2,
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  filterScroll: {
    flexGrow: 0,
  },

  filterContent: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    paddingRight: theme.spacing.md,
  },

  filterChip: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
  },

  filterChipPressed: {
    opacity: 0.7,
  },

  filterChipText: {
    ...theme.typography.bodySmallStrong,
  },

  filterCount: {
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderRadius: 11,
  },

  filterCountText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },

  sectionHeaderMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },

  sectionHeaderIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.sm,
  },

  sectionHeaderTitle: {
    ...theme.typography.bodyStrong,
    color: theme.colors.text,
  },

  sectionHeaderCount: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  sectionSeparator: {
    height: theme.spacing.sm,
  },

  itemSeparator: {
    height: theme.spacing.sm,
  },

  batchCard: {
    overflow: "hidden",
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderTopWidth: 4,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  batchCardPressed: {
    opacity: 0.76,
  },

  batchTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
  },

  batchTitleArea: {
    flex: 1,
    minWidth: 0,
  },

  batchTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },

  batchTitle: {
    ...theme.typography.cardTitle,
    color: theme.colors.text,
  },

  batchStateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },

  batchStateText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
  },

  batchCourse: {
    marginTop: theme.spacing.xs,
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
  },

  batchChevron: {
    width: 34,
    minHeight: 44,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  batchMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: theme.spacing.lg,
    rowGap: theme.spacing.xs,
    marginTop: theme.spacing.md,
  },

  batchMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  batchMetaText: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  batchFooter: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.divider,
  },

  batchFooterMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },

  batchDetailText: {
    flex: 1,
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
  },

  batchWaitingText: {
    flexShrink: 0,
    ...theme.typography.caption,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },

  batchUuid: {
    marginTop: theme.spacing.xs,
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    marginTop: theme.spacing.md,
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },

  emptyState: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.lg,
    padding: theme.spacing.xxl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
  },

  emptyIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.lg,
  },

  emptyTitle: {
    marginTop: theme.spacing.md,
    ...theme.typography.cardTitle,
    color: theme.colors.text,
    textAlign: "center",
  },

  emptyText: {
    maxWidth: 310,
    marginTop: theme.spacing.sm,
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
});
