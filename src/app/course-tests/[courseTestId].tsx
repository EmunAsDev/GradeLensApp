import { useCallback, useMemo, useState } from "react";

import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { StatusBar } from "expo-status-bar";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getCourseTest } from "@/database/courseTestRepository";

import {
  getCourseTestStudents,
  type LocalCourseTestStudent,
} from "@/database/courseTestStudentRepository";

import { AppIcon } from "@/../components/icons/AppIcon";

import { getCourseTestAccentColor } from "@/ui/courseTestVisual";

import { getScreenHorizontalPadding, theme } from "@/../theme";

type ResultStatus = "not_scanned" | "pending" | "synced";

export default function CourseTestDetailScreen() {
  const { courseTestId, courseId } = useLocalSearchParams<{
    courseTestId: string;
    courseId: string;
  }>();

  const numericCourseTestId = Number(courseTestId);

  const numericCourseId = Number(courseId);

  const [title, setTitle] = useState("Course Test");

  const [questionCount, setQuestionCount] = useState<number | null>(null);

  const [students, setStudents] = useState<LocalCourseTestStudent[]>([]);

  const [isLoading, setIsLoading] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const [showInfoBanner, setShowInfoBanner] = useState(true);

  const { width } = useWindowDimensions();

  const insets = useSafeAreaInsets();

  const horizontalPadding = getScreenHorizontalPadding(width);

  /*
   * The same Course Test ID always receives
   * the same GradeLens-friendly accent color.
   */
  const accentColor = getCourseTestAccentColor(numericCourseTestId);

  /*
   * --------------------------------------------------------------------------
   * Local SQLite Loading
   * --------------------------------------------------------------------------
   *
   * This screen remains local-first.
   *
   * Opening, focusing, and pull-to-refresh read SQLite only.
   * They do not contact Laravel directly.
   */
  const loadLocal = useCallback(async () => {
    if (
      !Number.isFinite(numericCourseTestId) ||
      !Number.isFinite(numericCourseId)
    ) {
      return;
    }

    const [courseTest, localStudents] = await Promise.all([
      getCourseTest(numericCourseTestId),

      getCourseTestStudents(numericCourseTestId, numericCourseId),
    ]);

    if (courseTest) {
      setTitle(courseTest.title ?? "Course Test");

      setQuestionCount(courseTest.question_count);
    }

    setStudents(localStudents);
  }, [numericCourseTestId, numericCourseId]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const load = async () => {
        try {
          if (
            !Number.isFinite(numericCourseTestId) ||
            !Number.isFinite(numericCourseId)
          ) {
            return;
          }

          const [courseTest, localStudents] = await Promise.all([
            getCourseTest(numericCourseTestId),

            getCourseTestStudents(numericCourseTestId, numericCourseId),
          ]);

          if (!isActive) {
            return;
          }

          if (courseTest) {
            setTitle(courseTest.title ?? "Course Test");

            setQuestionCount(courseTest.question_count);
          }

          setStudents(localStudents);
        } catch (error) {
          console.error("[COURSE TEST] Unable to load local data:", error);
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
    }, [numericCourseTestId, numericCourseId]),
  );

  const handleRefresh = async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);

    try {
      await loadLocal();
    } catch (error) {
      console.error("[COURSE TEST] Local refresh failed:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  /*
   * --------------------------------------------------------------------------
   * Summary
   * --------------------------------------------------------------------------
   */
  const scannedCount = useMemo(
    () =>
      students.filter(
        (student) =>
          student.tentative_score !== null || student.final_score !== null,
      ).length,
    [students],
  );

  const finalCount = useMemo(
    () =>
      students.filter(
        (student) =>
          student.sync_status === "synced" && student.final_score !== null,
      ).length,
    [students],
  );

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <StatusBar style="dark" hidden={false} />

        <View
          style={[
            styles.statusBarArea,
            {
              height: insets.top,
            },
          ]}
        />

        <CourseTestHeader title="Course Test" accentColor={accentColor} />

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={accentColor} />

          <Text style={styles.loadingText}>Loading Course Test...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" hidden={false} />

      {/*
       * Native phone status-bar area remains light.
       */}
      <View
        style={[
          styles.statusBarArea,
          {
            height: insets.top,
          },
        ]}
      />

      {/*
       * Fixed Course Test header.
       */}
      <CourseTestHeader title={title} accentColor={accentColor} />

      {/*
       * Everything in this content block remains fixed
       * except the FlatList at the bottom.
       */}
      <View
        style={[
          styles.content,
          {
            paddingHorizontal: horizontalPadding,
          },
        ]}
      >
        {/*
         * Temporary/dismissible guidance.
         */}
        {showInfoBanner ? (
          <View style={styles.infoBanner}>
            <View style={styles.infoIcon}>
              <AppIcon name="info" size={18} color={theme.colors.info} />
            </View>

            <Text style={styles.infoText}>
              Student scan progress and results shown here are saved on this
              device. Use Settings Sync while online to update reference data.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss Course Test information"
              hitSlop={8}
              onPress={() => setShowInfoBanner(false)}
              style={({ pressed }) => [
                styles.infoCloseButton,

                pressed && styles.infoClosePressed,
              ]}
            >
              <AppIcon name="close" size={17} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        {/*
         * Fixed summary card.
         */}
        <SummaryCard
          studentCount={students.length}
          scannedCount={scannedCount}
          finalCount={finalCount}
          questionCount={questionCount}
        />

        {/*
         * Fixed Students section title.
         */}
        <View style={styles.studentsHeader}>
          <Text style={styles.studentsTitle}>Students</Text>
        </View>

        {/*
         * ----------------------------------------------------------------------
         * ONLY THIS AREA SCROLLS
         * ----------------------------------------------------------------------
         */}
        <FlatList
          style={styles.studentList}
          data={students}
          keyExtractor={(item) => String(item.std_id)}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={accentColor}
              colors={[accentColor]}
            />
          }
          contentContainerStyle={[
            styles.studentListContent,

            students.length === 0 && styles.emptyStudentListContent,
          ]}
          renderItem={({ item }) => (
            <StudentResultRow student={item} questionCount={questionCount} />
          )}
          ItemSeparatorComponent={() => <View style={styles.studentDivider} />}
          ListEmptyComponent={<EmptyStudents />}
        />
      </View>
    </View>
  );
}

function CourseTestHeader({
  title,
  accentColor,
}: {
  title: string;
  accentColor: string;
}) {
  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: accentColor,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Course Tests"
        hitSlop={8}
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.backButton,

          pressed && styles.backButtonPressed,
        ]}
      >
        <AppIcon
          name="chevronLeft"
          size={25}
          color={theme.colors.textInverse}
        />
      </Pressable>

      <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
        {title}
      </Text>
    </View>
  );
}

function SummaryCard({
  studentCount,
  scannedCount,
  finalCount,
  questionCount,
}: {
  studentCount: number;
  scannedCount: number;
  finalCount: number;
  questionCount: number | null;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryRow}>
        <SummaryBox value={studentCount} label="Students" />

        <SummaryBox value={scannedCount} label="Scanned" />

        <SummaryBox value={finalCount} label="Final" />

        <SummaryBox value={questionCount ?? "—"} label="Items" />
      </View>
    </View>
  );
}

function SummaryBox({
  value,
  label,
}: {
  value: number | string;

  label: string;
}) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{value}</Text>

      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function StudentResultRow({
  student,
  questionCount,
}: {
  student: LocalCourseTestStudent;

  questionCount: number | null;
}) {
  const status = getResultStatus(student);

  const initials = getStudentInitials(student.name);

  /*
   * Laravel final score is displayed only when
   * the result is considered synchronized/final.
   */
  const visibleFinalScore = status === "synced" ? student.final_score : null;

  return (
    <View style={styles.studentRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>

      <View style={styles.studentBody}>
        <View style={styles.studentTopRow}>
          <View style={styles.studentIdentity}>
            <Text style={styles.studentName} numberOfLines={1}>
              {student.name ?? "Unnamed Student"}
            </Text>

            <Text style={styles.studentNumber} numberOfLines={1}>
              {student.student_id_no ?? "No Student ID"}
            </Text>
          </View>

          <StatusBadge status={status} />
        </View>

        <View style={styles.scoreRow}>
          <ScoreBox
            label="Tentative Score"
            score={student.tentative_score}
            questionCount={questionCount}
          />

          <ScoreBox
            label="Final Score"
            score={visibleFinalScore}
            questionCount={questionCount}
          />
        </View>
      </View>
    </View>
  );
}

function StatusBadge({ status }: { status: ResultStatus }) {
  const presentation = getStatusPresentation(status);

  return (
    <View
      style={[
        styles.statusBadge,

        {
          backgroundColor: presentation.background,
        },
      ]}
    >
      <Text
        style={[
          styles.statusBadgeText,

          {
            color: presentation.color,
          },
        ]}
      >
        {presentation.label}
      </Text>
    </View>
  );
}

function ScoreBox({
  label,
  score,
  questionCount,
}: {
  label: string;

  score: number | null;

  questionCount: number | null;
}) {
  return (
    <View style={styles.scoreBox}>
      <Text style={styles.scoreLabel} numberOfLines={2}>
        {label}
      </Text>

      <Text style={styles.scoreValue}>
        {score !== null ? String(score) : "—"}
      </Text>
    </View>
  );
}

function EmptyStudents() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <AppIcon name="student" size={28} color={theme.colors.primary} />
      </View>

      <Text style={styles.emptyTitle}>No students</Text>

      <Text style={styles.emptyText}>
        No student roster is stored for this Course Test yet. Use Sync in
        Settings while online to update the local GradeLens data.
      </Text>
    </View>
  );
}

function getResultStatus(student: LocalCourseTestStudent): ResultStatus {
  /*
   * Local tentative result remains Pending until
   * Batch Sync confirms Laravel's authoritative result.
   */
  if (student.sync_status === "pending") {
    return "pending";
  }

  if (student.sync_status === "synced" && student.final_score !== null) {
    return "synced";
  }

  if (student.tentative_score !== null) {
    return "pending";
  }

  if (student.final_score !== null) {
    return "synced";
  }

  return "not_scanned";
}

function getStatusPresentation(status: ResultStatus): {
  label: string;
  color: string;
  background: string;
} {
  switch (status) {
    case "synced":
      return {
        label: "Scanned",

        color: theme.colors.success,

        background: theme.colors.successSoft,
      };

    case "pending":
      return {
        label: "Pending",

        color: theme.colors.warning,

        background: theme.colors.warningSoft,
      };

    case "not_scanned":
    default:
      return {
        label: "Not Scanned",

        color: theme.colors.textSecondary,

        background: theme.colors.surfaceMuted,
      };
  }
}

function getStudentInitials(name: string | null | undefined): string {
  const cleaned = name?.trim() ?? "";

  if (!cleaned) {
    return "—";
  }

  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  return cleaned
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase();
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,

    backgroundColor: theme.colors.surface,
  },

  /*
   * Native/system status-bar area.
   */
  statusBarArea: {
    width: "100%",

    backgroundColor: theme.colors.surface,
  },

  /*
   * ------------------------------------------------------------------------
   * Accent Header
   * ------------------------------------------------------------------------
   */
  header: {
    minHeight: 66,

    flexDirection: "row",

    alignItems: "center",

    paddingHorizontal: theme.spacing.md,
  },

  backButton: {
    width: 48,

    height: 48,

    flexShrink: 0,

    alignItems: "center",

    justifyContent: "center",

    borderRadius: theme.radius.pill,
  },

  backButtonPressed: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },

  headerTitle: {
    flex: 1,

    marginLeft: theme.spacing.xs,

    marginRight: theme.spacing.md,

    fontSize: 20,

    lineHeight: 26,

    fontWeight: "700",

    color: theme.colors.textInverse,
  },

  /*
   * ------------------------------------------------------------------------
   * Fixed Screen Content
   * ------------------------------------------------------------------------
   *
   * This View does not scroll.
   *
   * Its child FlatList consumes the remaining space.
   */
  content: {
    flex: 1,

    width: "100%",

    maxWidth: theme.layout.contentMaxWidth,

    alignSelf: "center",

    paddingTop: theme.spacing.md,
  },

  /*
   * ------------------------------------------------------------------------
   * Temporary Information Banner
   * ------------------------------------------------------------------------
   */
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

  /*
   * ------------------------------------------------------------------------
   * Fixed Summary
   * ------------------------------------------------------------------------
   */
  summaryCard: {
    marginTop: theme.spacing.lg,

    padding: theme.spacing.lg,

    borderWidth: 1,

    borderColor: theme.colors.border,

    borderRadius: theme.radius.lg,

    backgroundColor: theme.colors.surface,

    ...theme.shadows.card,
  },

  summaryRow: {
    flexDirection: "row",

    gap: theme.spacing.sm,
  },

  summaryItem: {
    flex: 1,

    minWidth: 0,

    paddingHorizontal: theme.spacing.sm,

    paddingVertical: theme.spacing.md,

    borderRadius: theme.radius.md,

    backgroundColor: theme.colors.surfaceMuted,
  },

  summaryValue: {
    fontSize: 17,

    lineHeight: 21,

    fontWeight: "600",

    color: theme.colors.text,
  },

  summaryLabel: {
    marginTop: 2,

    ...theme.typography.tabLabel,

    color: theme.colors.textMuted,
  },

  /*
   * ------------------------------------------------------------------------
   * Fixed Students Heading
   * ------------------------------------------------------------------------
   */
  studentsHeader: {
    flexShrink: 0,

    marginTop: theme.spacing.xxl,

    paddingBottom: theme.spacing.sm,

    borderBottomWidth: StyleSheet.hairlineWidth,

    borderBottomColor: theme.colors.divider,
  },

  studentsTitle: {
    ...theme.typography.sectionTitle,

    color: theme.colors.text,
  },

  /*
   * ------------------------------------------------------------------------
   * Scrollable Students Area
   * ------------------------------------------------------------------------
   */
  studentList: {
    flex: 1,
  },

  studentListContent: {
    paddingBottom: theme.spacing.xxxl,
  },

  emptyStudentListContent: {
    flexGrow: 1,

    justifyContent: "center",
  },

  studentRow: {
    flexDirection: "row",

    alignItems: "flex-start",

    gap: theme.spacing.md,

    paddingVertical: theme.spacing.lg,
  },

  studentDivider: {
    height: StyleSheet.hairlineWidth,

    backgroundColor: theme.colors.divider,
  },

  avatar: {
    width: 48,

    height: 48,

    flexShrink: 0,

    alignItems: "center",

    justifyContent: "center",

    borderRadius: 29,

    backgroundColor: theme.colors.surfaceMuted,
  },

  avatarText: {
    fontSize: 16,

    lineHeight: 22,

    fontWeight: "500",

    color: theme.colors.text,
  },

  studentBody: {
    flex: 1,

    minWidth: 0,
  },

  studentTopRow: {
    flexDirection: "row",

    alignItems: "flex-start",

    justifyContent: "space-between",

    gap: theme.spacing.sm,
  },

  studentIdentity: {
    flex: 1,

    minWidth: 0,
  },

  studentName: {
    ...theme.typography.bodyExtraSmallStrong,

    color: theme.colors.text,
  },

  studentNumber: {
    marginTop: 2,

    ...theme.typography.bodyExtraSmall,

    color: theme.colors.textMuted,
  },

  /*
   * ------------------------------------------------------------------------
   * Student Status
   * ------------------------------------------------------------------------
   */
  statusBadge: {
    flexShrink: 0,

    minWidth: 72,

    alignItems: "center",

    paddingHorizontal: theme.spacing.sm,

    paddingVertical: 3,

    borderRadius: theme.radius.pill,
  },

  statusBadgeText: {
    fontSize: 10,

    lineHeight: 13,

    fontWeight: "600",
  },

  /*
   * ------------------------------------------------------------------------
   * Scores
   * ------------------------------------------------------------------------
   */
  scoreRow: {
    flexDirection: "row",

    justifyContent: "flex-end",

    gap: theme.spacing.sm,

    marginTop: theme.spacing.sm,
  },

  scoreBox: {
    width: 100,

    minHeight: 48,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

    gap: theme.spacing.xs,

    paddingHorizontal: theme.spacing.sm,

    paddingVertical: 6,

    borderRadius: theme.radius.sm,

    backgroundColor: theme.colors.surfaceMuted,
  },

  scoreLabel: {
    flex: 1,

    fontSize: 9,

    lineHeight: 11,

    color: theme.colors.textMuted,
  },

  scoreValue: {
    flexShrink: 0,

    fontSize: 14,

    lineHeight: 20,

    fontWeight: "600",

    color: theme.colors.text,
  },

  /*
   * ------------------------------------------------------------------------
   * Loading / Empty
   * ------------------------------------------------------------------------
   */
  loadingContainer: {
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

  emptyState: {
    alignItems: "center",

    paddingHorizontal: theme.spacing.xl,

    paddingBottom: theme.spacing.xxxl,
  },

  emptyIcon: {
    width: 56,

    height: 56,

    alignItems: "center",

    justifyContent: "center",

    borderRadius: theme.radius.lg,

    backgroundColor: theme.colors.primarySoft,
  },

  emptyTitle: {
    marginTop: theme.spacing.lg,

    ...theme.typography.cardTitle,

    color: theme.colors.text,
  },

  emptyText: {
    maxWidth: 340,

    marginTop: theme.spacing.sm,

    ...theme.typography.bodySmall,

    color: theme.colors.textSecondary,

    textAlign: "center",
  },
});
