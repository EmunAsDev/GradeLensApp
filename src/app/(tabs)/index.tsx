import { useCallback, useState } from "react";

import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthContext";
import {
  getHomeDashboardSummary,
  type HomeDashboardSummary,
  type HomeRecentBatch,
  type HomeUpcomingTest,
} from "@/database/homeRepository";

import { AppIcon } from "@/../components/icons/AppIcon";
import { getScreenHorizontalPadding, theme } from "@/../theme";

const EMPTY_DASHBOARD: HomeDashboardSummary = {
  course_count: 0,
  test_count: 0,
  waiting_count: 0,
  review_count: 0,
  failed_count: 0,
  latest_batch: null,
  upcoming_test: null,
  last_successful_sync_at: null,
};

export default function HomeScreen() {
  const { employee } = useAuth();

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const horizontalPadding = getScreenHorizontalPadding(width);

  const firstName = employee?.firstname?.trim() || "Faculty";

  const [dashboard, setDashboard] =
    useState<HomeDashboardSummary>(EMPTY_DASHBOARD);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadDashboard = useCallback(async () => {
    const summary = await getHomeDashboardSummary(employee?.id ?? null);
    setDashboard(summary);
  }, [employee?.id]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const load = async () => {
        try {
          const summary = await getHomeDashboardSummary(employee?.id ?? null);

          if (!isActive) {
            return;
          }

          setDashboard(summary);
        } catch (error) {
          console.error("[HOME] Unable to load local dashboard:", error);
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
    }, [employee?.id]),
  );

  const handleRefresh = async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);

    try {
      await loadDashboard();
    } catch (error) {
      console.error("[HOME] Local refresh failed:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading your workspace...</Text>
      </View>
    );
  }

  const hasAttention = dashboard.review_count > 0 || dashboard.failed_count > 0;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: horizontalPadding,

            paddingTop: insets.top + theme.spacing.xl,
          },
        ]}
      >
        {/*
         * ----------------------------------------------------------------------
         * Welcome
         * ----------------------------------------------------------------------
         */}
        <View style={styles.welcomeBlock}>
          <Text style={styles.welcomeTitle}>Hello, {firstName}</Text>

          <Text style={styles.welcomeSubtitle}>
            Here’s what’s happening on this device.
          </Text>
        </View>

        {/*
         * ----------------------------------------------------------------------
         * Overview
         * ----------------------------------------------------------------------
         */}
        <SectionTitle title="Overview" />

        <View style={styles.metricsRow}>
          <MetricCard
            icon="courses"
            value={dashboard.course_count}
            label="Courses"
            onPress={() => router.push("/courses")}
          />

          <MetricCard
            icon="review"
            value={dashboard.test_count}
            label="Tests"
            onPress={() => router.push("/courses")}
          />

          <MetricCard
            icon={dashboard.failed_count > 0 ? "error" : "batch"}
            value={dashboard.waiting_count}
            label="Waiting"
            tone={
              dashboard.failed_count > 0
                ? "danger"
                : dashboard.waiting_count > 0
                  ? "warning"
                  : "default"
            }
            onPress={() => router.push("/batch")}
          />
        </View>

        {/*
         * ----------------------------------------------------------------------
         * Needs Attention
         * ----------------------------------------------------------------------
         */}
        <View style={styles.section}>
          <SectionTitle title="Needs Attention" />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              hasAttention
                ? "Open scan items that need attention"
                : "Open Batch"
            }
            onPress={() => router.push("/batch")}
            style={({ pressed }) => [
              styles.attentionCard,
              hasAttention
                ? styles.attentionCardActive
                : styles.attentionCardClear,
              pressed && styles.pressed,
            ]}
          >
            <View
              style={[
                styles.attentionIcon,
                hasAttention
                  ? styles.attentionIconWarning
                  : styles.attentionIconSuccess,
              ]}
            >
              <AppIcon
                name={hasAttention ? "review" : "success"}
                size={22}
                color={
                  hasAttention ? theme.colors.warning : theme.colors.success
                }
              />
            </View>

            <View style={styles.attentionContent}>
              <Text style={styles.attentionTitle}>
                {hasAttention ? "Some scans need your attention" : "All clear"}
              </Text>

              <Text style={styles.attentionText}>
                {hasAttention
                  ? `${dashboard.review_count} need review · ${dashboard.failed_count} failed to sync`
                  : "No local scans currently need review or retry."}
              </Text>
            </View>

            <AppIcon name="next" size={22} color={theme.colors.textMuted} />
          </Pressable>
        </View>

        {/*
         * ----------------------------------------------------------------------
         * Continue Working
         * ----------------------------------------------------------------------
         */}
        {dashboard.latest_batch || dashboard.upcoming_test ? (
          <View style={styles.section}>
            <SectionTitle title="Continue Working" />

            {dashboard.latest_batch ? (
              <RecentBatchCard batch={dashboard.latest_batch} />
            ) : null}

            {dashboard.upcoming_test ? (
              <UpcomingTestCard test={dashboard.upcoming_test} />
            ) : null}
          </View>
        ) : null}

        {/*
         * ----------------------------------------------------------------------
         * Offline Data
         * ----------------------------------------------------------------------
         */}
        <View style={styles.section}>
          <SectionTitle title="Offline Data" />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Settings synchronization"
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [
              styles.offlineCard,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.offlineTopRow}>
              <View style={styles.offlineStatus}>
                <View style={styles.offlineIcon}>
                  <AppIcon
                    name="offline"
                    size={21}
                    color={theme.colors.success}
                  />
                </View>

                <View style={styles.offlineMain}>
                  <Text style={styles.offlineTitle}>
                    Available on this device
                  </Text>

                  <Text style={styles.offlineText}>
                    Courses, tests, rosters, OMR packages, and scan data remain
                    available offline.
                  </Text>
                </View>
              </View>

              <View style={styles.offlineRight}>
                <Text style={styles.offlineBadge}>Offline Ready</Text>

                <AppIcon name="next" size={20} color={theme.colors.textMuted} />
              </View>
            </View>

            <View style={styles.offlineDivider} />

            <View style={styles.offlineUpdateRow}>
              <AppIcon name="sync" size={16} color={theme.colors.textMuted} />

              <Text style={styles.offlineUpdated}>
                {dashboard.last_successful_sync_at
                  ? `Last update ${formatDateTime(
                      dashboard.last_successful_sync_at,
                    )}`
                  : "No successful server update is recorded yet."}
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function MetricCard({
  icon,
  value,
  label,
  tone = "default",
  onPress,
}: {
  icon: "courses" | "review" | "batch" | "error";
  value: number;
  label: string;
  tone?: "default" | "warning" | "danger";
  onPress?: () => void;
}) {
  const iconColor =
    tone === "danger"
      ? theme.colors.danger
      : tone === "warning"
        ? theme.colors.warning
        : theme.colors.primary;

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.metricCard,
        tone === "warning" && styles.metricCardWarning,
        tone === "danger" && styles.metricCardDanger,
        pressed && onPress && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.metricIcon,
          tone === "warning" && styles.metricIconWarning,
          tone === "danger" && styles.metricIconDanger,
        ]}
      >
        <AppIcon name={icon} size={19} color={iconColor} />
      </View>

      <Text
        style={[
          styles.metricValue,
          tone === "warning" && styles.metricValueWarning,
          tone === "danger" && styles.metricValueDanger,
        ]}
      >
        {value}
      </Text>

      <Text style={styles.metricLabel}>{label}</Text>
    </Pressable>
  );
}

function RecentBatchCard({ batch }: { batch: HomeRecentBatch }) {
  const status = getBatchStatusPresentation(batch.status);

  const waiting = batch.ready_count + batch.review_count + batch.failed_count;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open Batch ${batch.batch_number}`}
      onPress={() =>
        router.push({
          pathname: "/batch/[scanBatchUuid]",
          params: {
            scanBatchUuid: batch.scan_batch_uuid,
          },
        })
      }
      style={({ pressed }) => [styles.featureCard, pressed && styles.pressed]}
    >
      <View style={[styles.featureIcon, styles.featureIconBatch]}>
        <AppIcon name="batch" size={23} color={theme.colors.primary} />
      </View>

      <View style={styles.featureMain}>
        <View style={styles.featureTopRow}>
          <View style={styles.featureTitleGroup}>
            <Text style={styles.featureEyebrow}>RECENT BATCH</Text>

            <Text style={styles.featureTitle} numberOfLines={1}>
              Batch #{batch.batch_number}
            </Text>
          </View>

          <View
            style={[
              styles.featureBadge,
              status.tone === "success" && styles.featureBadgeSuccess,
              status.tone === "warning" && styles.featureBadgeWarning,
              status.tone === "danger" && styles.featureBadgeDanger,
              status.tone === "primary" && styles.featureBadgePrimary,
            ]}
          >
            <Text
              style={[
                styles.featureBadgeText,
                status.tone === "success" && styles.featureBadgeTextSuccess,
                status.tone === "warning" && styles.featureBadgeTextWarning,
                status.tone === "danger" && styles.featureBadgeTextDanger,
                status.tone === "primary" && styles.featureBadgeTextPrimary,
              ]}
            >
              {status.label}
            </Text>
          </View>
        </View>

        <Text style={styles.featureSubtitle} numberOfLines={1}>
          {batch.course_code ?? "Course"}
          {batch.course_test_title ? ` · ${batch.course_test_title}` : ""}
        </Text>

        <Text style={styles.featureMeta}>
          {batch.submission_count} scan
          {batch.submission_count === 1 ? "" : "s"} · {waiting} waiting ·{" "}
          {batch.review_count} review · {batch.synced_count} synced
        </Text>

        <Text style={styles.featureFooter}>
          {formatDateTime(batch.created_at)}
        </Text>
      </View>

      <AppIcon name="next" size={22} color={theme.colors.textMuted} />
    </Pressable>
  );
}

function UpcomingTestCard({ test }: { test: HomeUpcomingTest }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${test.title ?? "upcoming test"}`}
      onPress={() =>
        router.push({
          pathname: "/course-tests/[courseTestId]",
          params: {
            courseTestId: String(test.crs_tst_id),
            courseId: String(test.crs_id),
          },
        })
      }
      style={({ pressed }) => [styles.featureCard, pressed && styles.pressed]}
    >
      <View style={[styles.featureIcon, styles.featureIconUpcoming]}>
        <AppIcon name="time" size={23} color={theme.colors.info} />
      </View>

      <View style={styles.featureMain}>
        <Text style={styles.featureEyebrow}>UPCOMING TEST</Text>

        <Text style={styles.featureTitle} numberOfLines={1}>
          {test.title ?? "Untitled Test"}
        </Text>

        <Text style={styles.featureSubtitle} numberOfLines={1}>
          {test.course_code ?? "Course"}
        </Text>

        <Text style={styles.featureMeta}>
          Deadline {formatDateTime(test.deadline)}
        </Text>

        <Text style={styles.featureFooter}>
          {test.question_count !== null
            ? `${test.question_count} OMR items available offline`
            : "Question count not synced yet"}
        </Text>
      </View>

      <AppIcon name="next" size={22} color={theme.colors.textMuted} />
    </Pressable>
  );
}

type BatchStatusTone = "neutral" | "success" | "warning" | "danger" | "primary";

function getBatchStatusPresentation(status: HomeRecentBatch["status"]): {
  label: string;
  tone: BatchStatusTone;
} {
  switch (status) {
    case "submitting":
      return {
        label: "Submitting",
        tone: "primary",
      };

    case "submitted":
      return {
        label: "Complete",
        tone: "success",
      };

    case "completed_with_issues":
      return {
        label: "Issues",
        tone: "danger",
      };

    case "needs_attention":
      return {
        label: "Attention",
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

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Saved locally";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  scrollView: {
    flex: 1,
  },

  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",

    paddingBottom: theme.spacing.xxxl,
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

  /*
   * ------------------------------------------------------------------------
   * Welcome
   * ------------------------------------------------------------------------
   */
  welcomeBlock: {
    marginBottom: theme.spacing.xxl,
  },

  welcomeTitle: {
    ...theme.typography.screenTitle,

    color: theme.colors.text,
  },

  welcomeSubtitle: {
    marginTop: theme.spacing.xs,

    ...theme.typography.body,

    color: theme.colors.textSecondary,
  },

  section: {
    marginTop: theme.spacing.sectionGap,
  },

  sectionTitle: {
    marginBottom: theme.spacing.sm,

    ...theme.typography.sectionTitle,

    color: theme.colors.text,
  },

  /*
   * ------------------------------------------------------------------------
   * Overview
   * ------------------------------------------------------------------------
   */
  metricsRow: {
    flexDirection: "row",

    gap: theme.spacing.sm,
  },

  metricCard: {
    flex: 1,
    minHeight: 104,

    justifyContent: "center",

    padding: theme.spacing.md,

    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,

    backgroundColor: theme.colors.surface,

    ...theme.shadows.card,
  },

  metricCardWarning: {
    borderColor: "#F2D57C",

    backgroundColor: theme.colors.warningSoft,
  },

  metricCardDanger: {
    borderColor: "#F6B8BC",

    backgroundColor: theme.colors.dangerSoft,
  },

  metricIcon: {
    width: 34,
    height: 34,

    alignItems: "center",
    justifyContent: "center",

    marginBottom: theme.spacing.sm,

    borderRadius: 17,

    backgroundColor: theme.colors.primarySoft,
  },

  metricIconWarning: {
    backgroundColor: theme.colors.warningSoft,
  },

  metricIconDanger: {
    backgroundColor: theme.colors.dangerSoft,
  },

  metricValue: {
    ...theme.typography.metric,

    color: theme.colors.text,
  },

  metricValueWarning: {
    color: theme.colors.warning,
  },

  metricValueDanger: {
    color: theme.colors.danger,
  },

  metricLabel: {
    marginTop: 2,

    ...theme.typography.caption,

    color: theme.colors.textMuted,
  },

  /*
   * ------------------------------------------------------------------------
   * Needs attention
   * ------------------------------------------------------------------------
   */
  attentionCard: {
    minHeight: 78,

    flexDirection: "row",
    alignItems: "center",

    gap: theme.spacing.md,

    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,

    borderWidth: 1,
    borderRadius: theme.radius.lg,

    backgroundColor: theme.colors.surface,

    ...theme.shadows.card,
  },

  attentionCardActive: {
    borderColor: "#F2D57C",

    backgroundColor: theme.colors.warningSoft,
  },

  attentionCardClear: {
    borderColor: "#CFEBD5",

    backgroundColor: "#EAF7EC",
  },

  attentionIcon: {
    width: 42,
    height: 42,

    flexShrink: 0,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 21,
  },

  attentionIconWarning: {
    backgroundColor: theme.colors.surface,
  },

  attentionIconSuccess: {
    backgroundColor: theme.colors.surface,
  },

  attentionContent: {
    flex: 1,
    minWidth: 0,
  },

  attentionTitle: {
    ...theme.typography.bodyStrong,

    color: theme.colors.text,
  },

  attentionText: {
    marginTop: 2,

    ...theme.typography.caption,

    color: theme.colors.textSecondary,
  },

  /*
   * ------------------------------------------------------------------------
   * Recent / Upcoming
   * ------------------------------------------------------------------------
   */
  featureCard: {
    flexDirection: "row",
    alignItems: "center",

    gap: theme.spacing.md,

    padding: theme.spacing.lg,

    marginBottom: theme.spacing.sm,

    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,

    backgroundColor: theme.colors.surface,

    ...theme.shadows.card,
  },

  featureIcon: {
    width: 46,
    height: 46,

    flexShrink: 0,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 23,
  },

  featureIconBatch: {
    backgroundColor: theme.colors.primarySoft,
  },

  featureIconUpcoming: {
    backgroundColor: theme.colors.infoSoft,
  },

  featureMain: {
    flex: 1,
    minWidth: 0,
  },

  featureTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",

    gap: theme.spacing.sm,
  },

  featureTitleGroup: {
    flex: 1,
    minWidth: 0,
  },

  featureEyebrow: {
    ...theme.typography.label,

    color: theme.colors.textMuted,
  },

  featureTitle: {
    marginTop: 1,

    ...theme.typography.cardTitle,

    color: theme.colors.text,
  },

  featureSubtitle: {
    marginTop: 2,

    ...theme.typography.caption,

    color: theme.colors.textSecondary,
  },

  featureMeta: {
    marginTop: theme.spacing.sm,

    ...theme.typography.caption,

    color: theme.colors.textSecondary,
  },

  featureFooter: {
    marginTop: 3,

    ...theme.typography.caption,

    color: theme.colors.textMuted,
  },

  featureBadge: {
    flexShrink: 0,

    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,

    borderRadius: theme.radius.pill,

    backgroundColor: theme.colors.surfaceMuted,
  },

  featureBadgeSuccess: {
    backgroundColor: "#EAF7EC",
  },

  featureBadgeWarning: {
    backgroundColor: theme.colors.warningSoft,
  },

  featureBadgeDanger: {
    backgroundColor: theme.colors.dangerSoft,
  },

  featureBadgePrimary: {
    backgroundColor: theme.colors.primarySoft,
  },

  featureBadgeText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",

    color: theme.colors.textMuted,
  },

  featureBadgeTextSuccess: {
    color: "#2E7D32",
  },

  featureBadgeTextWarning: {
    color: theme.colors.warning,
  },

  featureBadgeTextDanger: {
    color: theme.colors.danger,
  },

  featureBadgeTextPrimary: {
    color: theme.colors.primary,
  },

  /*
   * ------------------------------------------------------------------------
   * Offline data
   * ------------------------------------------------------------------------
   */
  offlineCard: {
    padding: theme.spacing.lg,

    borderWidth: 1,
    borderColor: "#CFEBD5",
    borderRadius: theme.radius.lg,

    backgroundColor: theme.colors.surface,

    ...theme.shadows.card,
  },

  offlineTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",

    gap: theme.spacing.md,
  },

  offlineStatus: {
    flex: 1,

    flexDirection: "row",
    alignItems: "flex-start",

    gap: theme.spacing.md,
  },

  offlineIcon: {
    width: 40,
    height: 40,

    flexShrink: 0,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 20,

    backgroundColor: "#EAF7EC",
  },

  offlineMain: {
    flex: 1,
    minWidth: 0,
  },

  offlineTitle: {
    ...theme.typography.bodyStrong,

    color: theme.colors.text,
  },

  offlineText: {
    marginTop: 2,

    ...theme.typography.caption,

    color: theme.colors.textSecondary,
  },

  offlineRight: {
    flexShrink: 0,

    alignItems: "flex-end",

    gap: theme.spacing.sm,
  },

  offlineBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,

    borderRadius: theme.radius.pill,

    backgroundColor: "#EAF7EC",

    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",

    color: "#2E7D32",
  },

  offlineDivider: {
    height: StyleSheet.hairlineWidth,

    marginVertical: theme.spacing.md,

    backgroundColor: theme.colors.divider,
  },

  offlineUpdateRow: {
    flexDirection: "row",
    alignItems: "center",

    gap: theme.spacing.sm,
  },

  offlineUpdated: {
    flex: 1,

    ...theme.typography.caption,

    color: theme.colors.textMuted,
  },

  pressed: {
    opacity: 0.76,
  },
});
