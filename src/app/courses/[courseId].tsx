import { useCallback, useState } from "react";

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

import { getCourses, type LocalCourse } from "../../database/courseRepository";

import {
  getCourseTests,
  type LocalCourseTest,
} from "../../database/courseTestRepository";

import { getCourseTestStudents } from "../../database/courseTestStudentRepository";

import { AppIcon } from "@/../components/icons/AppIcon";

import {
  getCourseTestAccentColor,
  getCourseTestInitials,
} from "@/ui/courseTestVisual";

import { getScreenHorizontalPadding, theme } from "@/../theme";

type TestProgressStatus = "completed" | "incomplete" | "new";

type CourseTestRow = {
  test: LocalCourseTest;

  totalStudents: number;

  resultCount: number;

  status: TestProgressStatus;
};

export default function CourseTestsScreen() {
  const { courseId } = useLocalSearchParams<{
    courseId: string;
  }>();

  const numericCourseId = Number(courseId);

  const [course, setCourse] = useState<LocalCourse | null>(null);

  const [testRows, setTestRows] = useState<CourseTestRow[]>([]);

  const [isLoading, setIsLoading] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const { width } = useWindowDimensions();

  const insets = useSafeAreaInsets();

  const horizontalPadding = getScreenHorizontalPadding(width);

  const previewWidth = Math.min(124, Math.max(104, width * 0.29));

  /*
   * --------------------------------------------------------------------------
   * Local Data Loading
   * --------------------------------------------------------------------------
   *
   * This screen remains local-first.
   *
   * Opening/focusing the screen reads SQLite only.
   * It does not contact Laravel.
   */
  const loadLocal = useCallback(async () => {
    if (!Number.isFinite(numericCourseId)) {
      setCourse(null);
      setTestRows([]);
      return;
    }

    const [localCourses, localTests] = await Promise.all([
      getCourses(),
      getCourseTests(numericCourseId),
    ]);

    const selectedCourse =
      localCourses.find((item) => item.crs_id === numericCourseId) ?? null;

    /*
     * Build local progress for every Course Test.
     *
     * A student counts as having a result when either:
     * - a tentative mobile score exists, or
     * - a final Laravel score exists.
     *
     * NEW
     *     No locally saved student results yet.
     *
     * INCOMPLETE
     *     Some students have results, but not all students
     *     in the locally synchronized roster.
     *
     * COMPLETED
     *     Every student in the locally synchronized roster
     *     has a result.
     */
    const rows = await Promise.all(
      localTests.map(async (test): Promise<CourseTestRow> => {
        const students = await getCourseTestStudents(
          test.crs_tst_id,
          numericCourseId,
        );

        const totalStudents = students.length;

        const resultCount = students.filter(
          (student) =>
            student.tentative_score !== null || student.final_score !== null,
        ).length;

        let status: TestProgressStatus = "new";

        if (totalStudents > 0 && resultCount >= totalStudents) {
          status = "completed";
        } else if (resultCount > 0) {
          status = "incomplete";
        }

        return {
          test,
          totalStudents,
          resultCount,
          status,
        };
      }),
    );

    setCourse(selectedCourse);

    setTestRows(rows);
  }, [numericCourseId]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const load = async () => {
        try {
          if (!Number.isFinite(numericCourseId)) {
            return;
          }

          const [localCourses, localTests] = await Promise.all([
            getCourses(),

            getCourseTests(numericCourseId),
          ]);

          const selectedCourse =
            localCourses.find((item) => item.crs_id === numericCourseId) ??
            null;

          const rows = await Promise.all(
            localTests.map(async (test): Promise<CourseTestRow> => {
              const students = await getCourseTestStudents(
                test.crs_tst_id,
                numericCourseId,
              );

              const totalStudents = students.length;

              const resultCount = students.filter(
                (student) =>
                  student.tentative_score !== null ||
                  student.final_score !== null,
              ).length;

              let status: TestProgressStatus = "new";

              if (totalStudents > 0 && resultCount >= totalStudents) {
                status = "completed";
              } else if (resultCount > 0) {
                status = "incomplete";
              }

              return {
                test,
                totalStudents,
                resultCount,
                status,
              };
            }),
          );

          if (!isActive) {
            return;
          }

          setCourse(selectedCourse);

          setTestRows(rows);
        } catch (error) {
          console.error("[COURSE TESTS] Unable to load local data:", error);
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
    }, [numericCourseId]),
  );

  const handleRefresh = async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);

    try {
      await loadLocal();
    } catch (error) {
      console.error("[COURSE TESTS] Local refresh failed:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <StatusBar style="dark" hidden={false} />

        <View style={[styles.statusBarSpacer, { height: insets.top }]} />

        <View style={styles.heroSection}>
          <DetailHeader topInset={0} />
        </View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />

          <Text style={styles.loadingText}>Loading course tests...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" hidden={false} />

      <View style={[styles.statusBarSpacer, { height: insets.top }]} />

      <View style={styles.heroSection}>
        <DetailHeader topInset={0} />

        <View style={styles.heroSpacer} />
      </View>

      <FlatList
        style={styles.list}
        data={testRows}
        keyExtractor={(item) => String(item.test.crs_tst_id)}
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
          styles.listContent,

          {
            paddingHorizontal: horizontalPadding,
          },

          testRows.length === 0 && styles.emptyListContent,
        ]}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <CourseDetailsCard course={course} />

            {testRows.length > 0 ? (
              <Text style={styles.testsHeading}>Paper Assessments</Text>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <CourseTestItem
            row={item}
            testNumber={index + 1}
            previewWidth={previewWidth}
            onPress={() => {
              router.push({
                pathname: "/course-tests/[courseTestId]",

                params: {
                  courseTestId: String(item.test.crs_tst_id),

                  courseId: String(item.test.crs_id),
                },
              });
            }}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.testDivider} />}
        ListEmptyComponent={<EmptyTests />}
      />
    </View>
  );
}

function DetailHeader({ topInset }: { topInset: number }) {
  return (
    <View
      style={[
        styles.detailHeader,
        {
          paddingTop: topInset,
        },
      ]}
    >
      <View style={styles.detailHeaderRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Courses"
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,

            pressed && styles.backButtonPressed,
          ]}
        >
          <AppIcon
            name="chevronLeft"
            size={26}
            color={theme.colors.textInverse}
          />
        </Pressable>

        <Text style={styles.detailHeaderTitle}>Course Tests</Text>
      </View>
    </View>
  );
}

function CourseDetailsCard({ course }: { course: LocalCourse | null }) {
  const description =
    cleanValue(course?.description) ?? cleanValue(course?.title) ?? "Course";

  const courseIdentity = buildCourseIdentity(course);

  const time = cleanValue(course?.time);

  const room = cleanValue(course?.room);

  return (
    <View style={styles.courseDetailsCard}>
      <Text style={styles.courseDetailsLabel}>COURSE DETAILS</Text>

      <Text style={styles.courseDetailsTitle} numberOfLines={2}>
        {description}
      </Text>

      <View style={styles.courseDetailsDivider} />

      {courseIdentity ? (
        <View style={styles.courseDetailRow}>
          <AppIcon name="courses" size={17} color={theme.colors.textMuted} />

          <Text style={styles.courseDetailText} numberOfLines={1}>
            {courseIdentity}
          </Text>
        </View>
      ) : null}

      {time || room ? (
        <View style={styles.courseScheduleRow}>
          {time ? (
            <View style={styles.courseDetailRow}>
              <AppIcon name="time" size={17} color={theme.colors.textMuted} />

              <Text style={styles.courseDetailText} numberOfLines={1}>
                {time}
              </Text>
            </View>
          ) : null}

          {room ? (
            <View style={styles.courseDetailRow}>
              <AppIcon
                name="location"
                size={17}
                color={theme.colors.textMuted}
              />

              <Text style={styles.courseDetailText} numberOfLines={1}>
                {room}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function CourseTestItem({
  row,
  testNumber,
  previewWidth,
  onPress,
}: {
  row: CourseTestRow;
  testNumber: number;
  previewWidth: number;
  onPress: () => void;
}) {
  const { test, totalStudents, resultCount, status } = row;

  const presentation = getStatusPresentation(status);

  const progress =
    totalStudents > 0 ? Math.min(1, resultCount / totalStudents) : 0;

  const title = cleanValue(test.title) ?? "Untitled Test";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Test ${testNumber}, ${title}`}
      accessibilityHint="Opens this Course Test"
      onPress={onPress}
      style={({ pressed }) => [
        styles.testRow,

        pressed && styles.testRowPressed,
      ]}
    >
      <View
        style={[
          styles.previewContainer,

          {
            width: previewWidth,

            backgroundColor: getCourseTestAccentColor(test.crs_tst_id),
          },
        ]}
      >
        <Text style={styles.previewInitials}>
          {getCourseTestInitials(title)}
        </Text>

        <View style={styles.previewProgressTextWrap}>
          <Text style={styles.previewProgressText}>
            {resultCount} / {totalStudents}
          </Text>
        </View>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,

              {
                width: `${progress * 100}%`,

                backgroundColor: theme.colors.textInverse,
              },
            ]}
          />
        </View>
      </View>

      <View style={styles.testContent}>
        <View style={styles.testTopRow}>
          <Text style={styles.testNumber}>TEST NO. {testNumber}</Text>

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
        </View>

        <Text style={styles.testTitle} numberOfLines={2} ellipsizeMode="tail">
          {title}
        </Text>

        {test.deadline ? (
          <Text style={styles.deadlineText} numberOfLines={1}>
            {formatDeadline(test.deadline)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function EmptyTests() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <AppIcon name="scan" size={28} color={theme.colors.primary} />
      </View>

      <Text style={styles.emptyTitle}>No paper assessments</Text>

      <Text style={styles.emptyText}>
        No Course Tests are currently stored for this course on this device.
      </Text>
    </View>
  );
}

function getStatusPresentation(status: TestProgressStatus): {
  label: string;
  color: string;
  background: string;
} {
  switch (status) {
    case "completed":
      return {
        label: "COMPLETED",

        color: theme.colors.success,

        background: theme.colors.successSoft,
      };

    case "incomplete":
      return {
        label: "INCOMPLETE",

        color: theme.colors.warning,

        background: theme.colors.warningSoft,
      };

    case "new":
    default:
      return {
        label: "NEW",

        color: theme.colors.textMuted,

        background: theme.colors.surfaceMuted,
      };
  }
}

function buildCourseIdentity(course: LocalCourse | null): string | null {
  if (!course) {
    return null;
  }

  const title = cleanValue(course.title);

  const code = cleanValue(course.code);

  if (title && code) {
    return `${title} - ${code}`;
  }

  return title ?? code;
}

function formatDeadline(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `Due ${date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function cleanValue(value: string | null | undefined): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,

    backgroundColor: theme.colors.background,
  },

  statusBarSpacer: {
    width: "100%",

    backgroundColor: theme.colors.surface,
  },

  heroSection: {
    backgroundColor: theme.colors.primary,
  },

  heroSpacer: {
    height: 72,
  },

  list: {
    flex: 1,

    marginTop: -72,
  },

  /*
   * ------------------------------------------------------------------------
   * Detail Header
   * ------------------------------------------------------------------------
   */
  detailHeader: {
    backgroundColor: theme.colors.primary,
  },

  detailHeaderRow: {
    minHeight: 72,

    flexDirection: "row",

    alignItems: "center",

    gap: theme.spacing.sm,

    paddingHorizontal: theme.spacing.screenHorizontal,
  },

  backButton: {
    width: 44,

    height: 44,

    alignItems: "center",

    justifyContent: "center",

    borderRadius: theme.radius.pill,
  },

  backButtonPressed: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },

  detailHeaderTitle: {
    fontSize: 20,

    lineHeight: 26,

    fontWeight: "700",

    color: theme.colors.textInverse,
  },

  /*
   * ------------------------------------------------------------------------
   * List
   * ------------------------------------------------------------------------
   */
  listContent: {
    width: "100%",

    maxWidth: theme.layout.contentMaxWidth,

    alignSelf: "center",

    paddingTop: theme.spacing.none,

    paddingBottom: theme.spacing.xxxl,
  },

  emptyListContent: {
    flexGrow: 1,
  },

  headerContent: {
    marginBottom: theme.spacing.lg,
  },

  /*
   * ------------------------------------------------------------------------
   * Course Details
   * ------------------------------------------------------------------------
   */
  courseDetailsCard: {
    padding: theme.spacing.lg,

    borderWidth: 1,

    borderColor: theme.colors.border,

    borderRadius: theme.radius.lg,

    backgroundColor: theme.colors.surface,

    elevation: 3,

    shadowColor: "#000000",

    shadowOffset: {
      width: 0,
      height: 2,
    },

    shadowOpacity: 0.1,

    shadowRadius: 4,
  },

  courseDetailsLabel: {
    ...theme.typography.caption,

    fontWeight: "600",

    color: theme.colors.textMuted,

    letterSpacing: 0.3,
  },

  courseDetailsTitle: {
    marginTop: theme.spacing.xs,

    fontSize: 18,

    lineHeight: 23,

    fontWeight: "600",

    color: theme.colors.text,
  },

  courseDetailsDivider: {
    height: StyleSheet.hairlineWidth,

    marginVertical: theme.spacing.md,

    backgroundColor: theme.colors.divider,
  },

  courseDetailRow: {
    flexDirection: "row",

    alignItems: "center",

    gap: 6,

    minWidth: 0,
  },

  courseDetailText: {
    ...theme.typography.bodySmall,

    color: theme.colors.textSecondary,
  },

  courseScheduleRow: {
    flexDirection: "row",

    alignItems: "center",

    flexWrap: "wrap",

    columnGap: theme.spacing.md,

    rowGap: theme.spacing.xs,

    marginTop: theme.spacing.sm,
  },

  testsHeading: {
    marginTop: theme.spacing.xxl,

    ...theme.typography.sectionTitle,

    color: theme.colors.text,
  },

  /*
   * ------------------------------------------------------------------------
   * Course Test Row
   * ------------------------------------------------------------------------
   */
  testRow: {
    minHeight: 104,

    flexDirection: "row",

    alignItems: "stretch",

    gap: theme.spacing.md,

    paddingVertical: theme.spacing.sm,
  },

  testRowPressed: {
    opacity: 0.72,
  },

  previewContainer: {
    height: 86,

    flexShrink: 0,

    overflow: "hidden",

    borderRadius: theme.radius.sm,

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: theme.colors.border,

    backgroundColor: theme.colors.surface,

    position: "relative",
  },

  previewInitials: {
    position: "absolute",

    left: 0,

    right: 0,

    top: 0,

    bottom: 0,

    textAlign: "center",

    textAlignVertical: "center",

    fontSize: 28,

    lineHeight: 34,

    fontWeight: "700",

    color: theme.colors.textInverse,

    letterSpacing: 0.8,
  },

  previewProgressTextWrap: {
    position: "absolute",

    right: 6,

    bottom: 7,

    paddingHorizontal: 4,

    paddingVertical: 2,

    borderRadius: 4,

    backgroundColor: "rgba(255,255,255,0.90)",
  },

  previewProgressText: {
    fontSize: 10,

    lineHeight: 12,

    fontWeight: "600",

    color: theme.colors.textSecondary,
  },

  progressTrack: {
    position: "absolute",

    left: 0,

    right: 0,

    bottom: 0,

    height: 4,

    backgroundColor: "rgba(255,255,255,0.34)",
  },

  progressFill: {
    height: "100%",
  },

  testContent: {
    flex: 1,

    minWidth: 0,

    justifyContent: "center",
  },

  testTopRow: {
    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

    gap: theme.spacing.sm,
  },

  testNumber: {
    ...theme.typography.caption,

    color: theme.colors.textMuted,
  },

  statusBadge: {
    minWidth: 78,

    alignItems: "center",

    paddingHorizontal: theme.spacing.sm,

    paddingVertical: 4,

    borderRadius: theme.radius.sm,
  },

  statusBadgeText: {
    fontSize: 10,

    lineHeight: 12,

    fontWeight: "700",

    letterSpacing: 0.3,
  },

  testTitle: {
    marginTop: 3,

    ...theme.typography.cardTitle,

    color: theme.colors.text,
  },

  deadlineText: {
    marginTop: 2,

    ...theme.typography.caption,

    color: theme.colors.textSecondary,
  },

  testDivider: {
    height: StyleSheet.hairlineWidth,

    backgroundColor: theme.colors.divider,
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
  },

  loadingText: {
    marginTop: theme.spacing.md,

    ...theme.typography.body,

    color: theme.colors.textSecondary,
  },

  emptyState: {
    alignItems: "center",

    paddingTop: theme.spacing.xxxl,

    paddingHorizontal: theme.spacing.xl,
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

    textAlign: "center",
  },

  emptyText: {
    maxWidth: 340,

    marginTop: theme.spacing.sm,

    ...theme.typography.bodySmall,

    color: theme.colors.textSecondary,

    textAlign: "center",
  },
});
