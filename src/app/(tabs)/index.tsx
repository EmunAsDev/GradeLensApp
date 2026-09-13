import { useCallback, useState } from "react";

import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { router, useFocusEffect } from "expo-router";

import { useAuth } from "@/auth/AuthContext";
import {
  getHomeDashboardSummary,
  type HomeDashboardSummary,
  type HomeRecentBatch,
  type HomeUpcomingTest,
} from "@/database/homeRepository";

import { AppScreenHeader } from "@/../components/layout/AppScreenHeader";
import { theme } from "@/../theme";

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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={theme.colors.primary}
        />
      }
    >
      <AppScreenHeader
        eyebrow="GradeLens"
        title={`Hello, ${firstName}`}
        subtitle="Here’s what’s happening on this device."
      />

      <View style={styles.body}>
        <SectionTitle title="Overview" />

        <View style={styles.metricsRow}>
          <MetricCard
            value={dashboard.course_count}
            label="Courses"
            onPress={() => router.push("/courses")}
          />

          <MetricCard
            value={dashboard.test_count}
            label="Tests"
            onPress={() => router.push("/courses")}
          />

          <MetricCard
            value={dashboard.waiting_count}
            label="Waiting"
            tone={dashboard.failed_count > 0 ? "danger" : "default"}
            onPress={() => router.push("/batch")}
          />
        </View>

        <View style={styles.section}>
          <SectionTitle title="Needs Attention" />

          <Pressable
            onPress={() => router.push("/batch")}
            style={({ pressed }) => [
              styles.attentionCard,
              hasAttention ? styles.attentionCardActive : null,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.attentionMain}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: hasAttention
                      ? theme.colors.warning
                      : theme.colors.success,
                  },
                ]}
              />

              <View style={styles.attentionContent}>
                <Text style={styles.attentionTitle}>
                  {hasAttention
                    ? "Some scans need your attention"
                    : "All clear"}
                </Text>

                {hasAttention ? (
                  <Text style={styles.attentionText}>
                    {dashboard.review_count} need review ·{" "}
                    {dashboard.failed_count} failed to sync
                  </Text>
                ) : (
                  <Text style={styles.attentionText}>
                    No local scans currently need review or retry.
                  </Text>
                )}
              </View>
            </View>

            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>

        {dashboard.latest_batch ? (
          <View style={styles.section}>
            <SectionTitle title="Recent Batch" />
            <RecentBatchCard batch={dashboard.latest_batch} />
          </View>
        ) : null}

        {dashboard.upcoming_test ? (
          <View style={styles.section}>
            <SectionTitle title="Upcoming Test" />
            <UpcomingTestCard test={dashboard.upcoming_test} />
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionTitle title="Offline Data" />

          <View style={styles.offlineCard}>
            <View style={styles.offlineTopRow}>
              <View style={styles.offlineStatus}>
                <View style={styles.offlineDot} />
                <Text style={styles.offlineTitle}>
                  Available on this device
                </Text>
              </View>

              <Text style={styles.offlineBadge}>Offline ready</Text>
            </View>

            <Text style={styles.offlineText}>
              GradeLens uses your saved courses, tests, rosters, OMR packages,
              and scan queue even when the server is unavailable.
            </Text>

            <Text style={styles.offlineUpdated}>
              {dashboard.last_successful_sync_at
                ? `Last successful data update: ${formatDateTime(
                    dashboard.last_successful_sync_at,
                  )}`
                : "No successful server update is recorded yet."}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function MetricCard({
  value,
  label,
  tone = "default",
  onPress,
}: {
  value: number;
  label: string;
  tone?: "default" | "danger";
  onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.metricCard,
        tone === "danger" && styles.metricCardDanger,
        pressed && onPress && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.metricValue,
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
  const status = getBatchStatusLabel(batch.status);
  const waiting = batch.ready_count + batch.review_count + batch.failed_count;

  return (
    <Pressable
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
      <View style={styles.featureTopRow}>
        <View style={styles.featureTitleGroup}>
          <Text style={styles.featureTitle}>Batch #{batch.batch_number}</Text>
          <Text style={styles.featureSubtitle} numberOfLines={1}>
            {batch.course_code ?? "Course"}
            {batch.course_test_title ? ` · ${batch.course_test_title}` : ""}
          </Text>
        </View>

        <View style={styles.featureRight}>
          <Text style={styles.featureBadge}>{status}</Text>
          <Text style={styles.chevron}>›</Text>
        </View>
      </View>

      <Text style={styles.featureMeta}>
        {batch.submission_count} scans · {waiting} waiting ·{" "}
        {batch.review_count} review · {batch.synced_count} synced
      </Text>

      <Text style={styles.featureFooter}>
        {formatDateTime(batch.created_at)}
      </Text>
    </Pressable>
  );
}

function UpcomingTestCard({ test }: { test: HomeUpcomingTest }) {
  return (
    <Pressable
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
      <View style={styles.featureTopRow}>
        <View style={styles.featureTitleGroup}>
          <Text style={styles.courseCode}>{test.course_code ?? "Course"}</Text>
          <Text style={styles.featureTitle}>
            {test.title ?? "Untitled Test"}
          </Text>
        </View>

        <Text style={styles.chevron}>›</Text>
      </View>

      <Text style={styles.featureMeta}>
        Deadline: {formatDateTime(test.deadline)}
      </Text>

      <Text style={styles.featureFooter}>
        {test.question_count !== null
          ? `${test.question_count} OMR items available offline`
          : "Question count not synced yet"}
      </Text>
    </Pressable>
  );
}

function getBatchStatusLabel(status: HomeRecentBatch["status"]): string {
  switch (status) {
    case "submitting":
      return "Submitting";
    case "submitted":
      return "Submitted";
    case "needs_attention":
      return "Needs Attention";
    case "draft":
    default:
      return "Open";
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

  content: {
    paddingBottom: theme.spacing.xxxl,
  },

  body: {
    paddingHorizontal: theme.spacing.screenHorizontal,
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

  section: {
    marginTop: theme.spacing.sectionGap,
  },

  sectionTitle: {
    marginBottom: theme.spacing.sm,
    ...theme.typography.sectionTitle,
    color: theme.colors.textSecondary,
  },

  metricsRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },

  metricCard: {
    flex: 1,
    minHeight: 92,
    justifyContent: "center",
    padding: theme.spacing.cardPadding,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  metricCardDanger: {
    borderColor: theme.colors.dangerSoft,
    backgroundColor: theme.colors.dangerSoft,
  },

  metricValue: {
    ...theme.typography.metric,
    color: theme.colors.text,
  },

  metricValueDanger: {
    color: theme.colors.danger,
  },

  metricLabel: {
    marginTop: theme.spacing.xs,
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  attentionCard: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    padding: theme.spacing.cardPadding,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  attentionCardActive: {
    borderColor: theme.colors.warningSoft,
    backgroundColor: theme.colors.warningSoft,
  },

  attentionMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  statusDot: {
    width: 9,
    height: 9,
    marginTop: 5,
    borderRadius: theme.radius.pill,
  },

  attentionContent: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },

  attentionTitle: {
    ...theme.typography.bodyStrong,
    color: theme.colors.text,
  },

  attentionText: {
    marginTop: theme.spacing.xs,
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },

  featureCard: {
    padding: theme.spacing.cardPadding,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  featureTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },

  featureTitleGroup: {
    flex: 1,
  },

  featureTitle: {
    ...theme.typography.cardTitle,
    color: theme.colors.text,
  },

  featureSubtitle: {
    marginTop: theme.spacing.xs,
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },

  featureRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },

  featureBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceMuted,
    ...theme.typography.label,
    color: theme.colors.textMuted,
  },

  featureMeta: {
    marginTop: theme.spacing.lg,
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },

  featureFooter: {
    marginTop: theme.spacing.sm,
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  courseCode: {
    marginBottom: theme.spacing.xs,
    ...theme.typography.label,
    color: theme.colors.primary,
  },

  chevron: {
    marginTop: -3,
    fontSize: 28,
    lineHeight: 28,
    color: theme.colors.textMuted,
  },

  offlineCard: {
    padding: theme.spacing.cardPadding,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  offlineTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },

  offlineStatus: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  offlineDot: {
    width: 9,
    height: 9,
    marginRight: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.success,
  },

  offlineTitle: {
    ...theme.typography.bodyStrong,
    color: theme.colors.text,
  },

  offlineBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.successSoft,
    ...theme.typography.label,
    color: theme.colors.success,
  },

  offlineText: {
    marginTop: theme.spacing.md,
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },

  offlineUpdated: {
    marginTop: theme.spacing.md,
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  pressed: {
    opacity: 0.78,
  },
});
