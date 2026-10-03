import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getCourses, type LocalCourse } from "../../database/courseRepository";

import { AppIcon } from "@/../components/icons/AppIcon";
import { getScreenHorizontalPadding, theme } from "@/../theme";

type CourseSection = {
  key: string;
  termLabel: string;
  schoolYear: string | null;
  data: LocalCourse[];
};

export default function CoursesScreen() {
  const [courses, setCourses] = useState<LocalCourse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInfoBanner, setShowInfoBanner] = useState(true);

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const horizontalPadding = getScreenHorizontalPadding(width);

  const loadLocalCourses = useCallback(async () => {
    const localCourses = await getCourses();
    setCourses(localCourses);
  }, []);

  /*
   * Courses is local-first.
   * Opening/focusing this screen reads SQLite only.
   */
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const load = async () => {
        try {
          const localCourses = await getCourses();

          if (!isActive) {
            return;
          }

          setCourses(localCourses);
        } catch (error) {
          console.error("[COURSES] Unable to load local courses:", error);
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
    }, []),
  );

  const handleRefresh = async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);

    try {
      await loadLocalCourses();
    } catch (error) {
      console.error("[COURSES] Local refresh failed:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  /*
   * Local/offline search.
   */
  const filteredCourses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return courses;
    }

    return courses.filter((course) => {
      const searchableValues = [
        course.title,
        course.code,
        course.description,
        course.program,
        course.year,
        course.section,
        course.school_year,
        course.semester,
        course.term,
        course.room,
        course.time,
      ];

      return searchableValues.some(
        (value) => value?.toLowerCase().includes(query) ?? false,
      );
    });
  }, [courses, searchQuery]);

  /*
   * One label per exact:
   * School Year + Semester + Term.
   */
  const sections = useMemo<CourseSection[]>(
    () => buildCourseSections(filteredCourses),
    [filteredCourses],
  );

  const closeSearch = () => {
    setSearchQuery("");
    setIsSearching(false);
  };

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <StatusBar style="dark" hidden={false} />

        <RootHeader
          topInset={insets.top}
          isSearching={false}
          onSearchPress={() => {}}
          onCloseSearch={() => {}}
          searchQuery=""
          onSearchChange={() => {}}
        />

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />

          <Text style={styles.loadingText}>Loading courses...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" hidden={false} />

      <RootHeader
        topInset={insets.top}
        isSearching={isSearching}
        onSearchPress={() => setIsSearching(true)}
        onCloseSearch={closeSearch}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <SectionList<LocalCourse, CourseSection>
        sections={sections}
        keyExtractor={(item) => String(item.crs_id)}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
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
          courses.length === 0 && styles.emptyListContent,
        ]}
        ListHeaderComponent={
          courses.length > 0 && showInfoBanner ? (
            <View style={styles.pageIntro}>
              <View style={styles.infoBanner}>
                <View style={styles.infoIcon}>
                  <AppIcon name="info" size={18} color={theme.colors.info} />
                </View>

                <Text style={styles.infoText}>
                  Select a course to view its available paper assessments.
                </Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss course information"
                  hitSlop={8}
                  onPress={() => setShowInfoBanner(false)}
                  style={({ pressed }) => [
                    styles.infoCloseButton,
                    pressed && styles.infoCloseButtonPressed,
                  ]}
                >
                  <AppIcon
                    name="close"
                    size={18}
                    color={theme.colors.textMuted}
                  />
                </Pressable>
              </View>
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <AcademicSectionHeader
            termLabel={section.termLabel}
            schoolYear={section.schoolYear}
          />
        )}
        renderItem={({ item }) => <CourseCard course={item} />}
        ItemSeparatorComponent={() => <View style={styles.courseSeparator} />}
        SectionSeparatorComponent={() => (
          <View style={styles.sectionSeparator} />
        )}
        ListEmptyComponent={
          courses.length === 0 ? (
            <EmptyCourses />
          ) : (
            <EmptySearch query={searchQuery} onClear={closeSearch} />
          )
        }
      />
    </View>
  );
}

function RootHeader({
  topInset,
  isSearching,
  onSearchPress,
  onCloseSearch,
  searchQuery,
  onSearchChange,
}: {
  topInset: number;
  isSearching: boolean;
  onSearchPress: () => void;
  onCloseSearch: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: topInset,
        },
      ]}
    >
      {isSearching ? (
        <View style={styles.searchHeaderRow}>
          <View style={styles.searchField}>
            <AppIcon name="search" size={20} color={theme.colors.textMuted} />

            <TextInput
              autoFocus
              value={searchQuery}
              onChangeText={onSearchChange}
              placeholder="Search courses"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={styles.searchInput}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close course search"
            hitSlop={8}
            onPress={onCloseSearch}
            style={({ pressed }) => [
              styles.headerIconButton,
              pressed && styles.headerButtonPressed,
            ]}
          >
            <AppIcon name="close" size={22} color={theme.colors.text} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Courses</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search courses"
            hitSlop={8}
            onPress={onSearchPress}
            style={({ pressed }) => [
              styles.headerIconButton,
              pressed && styles.headerButtonPressed,
            ]}
          >
            <AppIcon name="search" size={26} color={theme.colors.text} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function AcademicSectionHeader({
  termLabel,
  schoolYear,
}: {
  termLabel: string;
  schoolYear: string | null;
}) {
  const academicLabel = schoolYear ? `${schoolYear} · ${termLabel}` : termLabel;

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle} numberOfLines={1}>
        {academicLabel}
      </Text>
    </View>
  );
}

function CourseCard({ course }: { course: LocalCourse }) {
  /*
   * Display:
   *
   * AD    CCE106 (2887)
   *       Applications Development...
   *       [time] 3:30A - 5:30E  [location] PS 309
   */
  const title = cleanValue(course.title) ?? "Untitled Course";

  const code = cleanValue(course.code);

  const description = cleanValue(course.description);

  const time = cleanValue(course.time);

  const room = cleanValue(course.room);

  const initials = getDescriptionInitials(description ?? title);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={code ? `${title} (${code})` : title}
      accessibilityHint="Opens the available paper assessments for this course"
      onPress={() => {
        router.push({
          pathname: "/courses/[courseId]",
          params: {
            courseId: String(course.crs_id),
          },
        });
      }}
      style={({ pressed }) => [
        styles.courseCard,
        pressed && styles.courseCardPressed,
      ]}
    >
      <View style={styles.courseBadge}>
        <Text style={styles.courseBadgeText}>{initials}</Text>
      </View>

      <View style={styles.courseContent}>
        <Text
          style={styles.courseHeading}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {title}
          {code ? ` (${code})` : ""}
        </Text>

        {description ? (
          <Text
            style={styles.courseDescription}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {description}
          </Text>
        ) : null}

        {time || room ? (
          <View style={styles.courseMetaRow}>
            {time ? (
              <View style={styles.metaItem}>
                <AppIcon name="time" size={16} color={theme.colors.textMuted} />

                <Text style={styles.metaText} numberOfLines={1}>
                  {time}
                </Text>
              </View>
            ) : null}

            {room ? (
              <View style={styles.metaItem}>
                <AppIcon
                  name="location"
                  size={16}
                  color={theme.colors.textMuted}
                />

                <Text style={styles.metaText} numberOfLines={1}>
                  {room}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.courseChevron}>
        <AppIcon name="next" size={22} color={theme.colors.textMuted} />
      </View>
    </Pressable>
  );
}

function EmptyCourses() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <AppIcon name="courses" size={28} color={theme.colors.primary} />
      </View>

      <Text style={styles.emptyTitle}>No courses available</Text>

      <Text style={styles.emptyText}>
        No courses are stored on this device yet. Connect to the internet and
        use Sync in Settings to download your current GradeLens courses.
      </Text>
    </View>
  );
}

function EmptySearch({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <AppIcon name="search" size={28} color={theme.colors.primary} />
      </View>

      <Text style={styles.emptyTitle}>No matching courses</Text>

      <Text style={styles.emptyText}>
        No course on this device matches “{query.trim()}”.
      </Text>

      <Pressable
        accessibilityRole="button"
        onPress={onClear}
        style={({ pressed }) => [
          styles.clearSearchButton,
          pressed && styles.headerButtonPressed,
        ]}
      >
        <Text style={styles.clearSearchText}>Clear search</Text>
      </Pressable>
    </View>
  );
}

/*
 * --------------------------------------------------------------------------
 * Grouping
 * --------------------------------------------------------------------------
 */

function buildCourseSections(courses: LocalCourse[]): CourseSection[] {
  const grouped = new Map<string, CourseSection>();

  for (const course of courses) {
    const semester = cleanValue(course.semester);

    const term = cleanValue(course.term);

    const schoolYear = formatSchoolYear(cleanValue(course.school_year));

    const semesterNumber = getAcademicValueNumber(semester);

    const termNumber = getAcademicValueNumber(term);

    const termLabel = buildAcademicPeriodLabel(semester, term);

    /*
     * Exact same School Year + Semester + Term
     * = one heading only.
     */
    const key = [
      schoolYear ?? "no-school-year",
      semesterNumber ?? semester ?? "no-semester",
      termNumber ?? term ?? "no-term",
    ].join("|");

    const existing = grouped.get(key);

    if (existing) {
      existing.data.push(course);
      continue;
    }

    grouped.set(key, {
      key,
      termLabel,
      schoolYear,
      data: [course],
    });
  }

  const sections = Array.from(grouped.values());

  for (const section of sections) {
    section.data.sort(compareCourses);
  }

  /*
   * Sort by:
   * 1. newest school year
   * 2. semester
   * 3. term
   */
  sections.sort(compareSections);

  return sections;
}

function buildAcademicPeriodLabel(
  semester: string | null,
  term: string | null,
): string {
  const formattedSem = formatOrdinalAcademicValue(semester, "Sem");

  const formattedTerm = formatOrdinalAcademicValue(term, "Term");

  if (formattedSem && formattedTerm) {
    return `${formattedSem} - ${formattedTerm}`;
  }

  return formattedSem ?? formattedTerm ?? "Other Courses";
}

function formatOrdinalAcademicValue(
  value: string | null,
  label: "Sem" | "Term",
): string | null {
  if (!value) {
    return null;
  }

  const numberMatch = value.match(/\d+/);

  if (!numberMatch) {
    return value;
  }

  const numericValue = Number(numberMatch[0]);

  if (!Number.isFinite(numericValue)) {
    return value;
  }

  return `${numericValue}${getOrdinalSuffix(numericValue)} ${label}`;
}

function getOrdinalSuffix(value: number): string {
  const lastTwoDigits = value % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return "th";
  }

  switch (value % 10) {
    case 1:
      return "st";

    case 2:
      return "nd";

    case 3:
      return "rd";

    default:
      return "th";
  }
}

/*
 * "2026"        -> "2026 - 2027"
 * "2026-2027"   -> "2026 - 2027"
 */
function formatSchoolYear(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const yearMatches = value.match(/\d{4}/g);

  if (yearMatches && yearMatches.length >= 2) {
    return `${yearMatches[0]} - ${yearMatches[1]}`;
  }

  if (yearMatches && yearMatches.length === 1) {
    const startYear = Number(yearMatches[0]);

    if (Number.isFinite(startYear)) {
      return `${startYear} - ${startYear + 1}`;
    }
  }

  return value;
}

/*
 * "Applications Development" -> "AD"
 * "Programming"              -> "PR"
 */
function getDescriptionInitials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  const compact = value.replace(/[^A-Za-z0-9]/g, "");

  return compact.slice(0, 2).toUpperCase() || "GL";
}

function getAcademicValueNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/\d+/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);

  return Number.isFinite(parsed) ? parsed : null;
}

function compareCourses(first: LocalCourse, second: LocalCourse): number {
  const firstTitle = cleanValue(first.title) ?? "";

  const secondTitle = cleanValue(second.title) ?? "";

  return firstTitle.localeCompare(secondTitle, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function compareSections(first: CourseSection, second: CourseSection): number {
  const firstYear = getSchoolYearStart(first.schoolYear);

  const secondYear = getSchoolYearStart(second.schoolYear);

  if (firstYear !== secondYear) {
    return secondYear - firstYear;
  }

  const firstSem = getAcademicNumber(first.termLabel, "Sem");

  const secondSem = getAcademicNumber(second.termLabel, "Sem");

  if (firstSem !== secondSem) {
    return firstSem - secondSem;
  }

  const firstTerm = getAcademicNumber(first.termLabel, "Term");

  const secondTerm = getAcademicNumber(second.termLabel, "Term");

  return firstTerm - secondTerm;
}

function getSchoolYearStart(value: string | null): number {
  if (!value) {
    return -1;
  }

  const match = value.match(/\d{4}/);

  if (!match) {
    return -1;
  }

  const parsed = Number(match[0]);

  return Number.isFinite(parsed) ? parsed : -1;
}

function getAcademicNumber(value: string, label: "Sem" | "Term"): number {
  const expression =
    label === "Term"
      ? /(\d+)(?:st|nd|rd|th)?\s+Term/i
      : /(\d+)(?:st|nd|rd|th)?\s+Sem/i;

  const match = value.match(expression);

  if (!match) {
    return 999;
  }

  const parsed = Number(match[1]);

  return Number.isFinite(parsed) ? parsed : 999;
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

  /*
   * Header:
   * - same background as screen
   * - no bottom border
   * - white circular search/close button
   */
  header: {
    backgroundColor: theme.colors.background,
  },

  headerRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.screenHorizontal,
  },

  headerTitle: {
    ...theme.typography.screenTitle,
    color: theme.colors.text,
  },

  headerIconButton: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
    backgroundColor: theme.colors.surface,
  },

  headerButtonPressed: {
    opacity: 0.68,
    transform: [
      {
        scale: 0.96,
      },
    ],
  },

  /*
   * Search mode.
   */
  searchHeaderRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.screenHorizontal,
  },

  searchField: {
    flex: 1,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
  },

  searchInput: {
    flex: 1,
    height: "100%",
    paddingVertical: 0,
    ...theme.typography.body,
    color: theme.colors.text,
  },

  /*
   * Main list.
   */
  listContent: {
    width: "100%",
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: "center",
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
  },

  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },

  /*
   * Temporary/dismissible information.
   */
  pageIntro: {
    marginBottom: theme.spacing.none,
  },

  infoBanner: {
    minHeight: 46,
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

  infoCloseButtonPressed: {
    opacity: 0.5,
  },

  /*
   * Academic period heading.
   */
  sectionHeader: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.xs,
  },

  sectionTitle: {
    flex: 1,
    ...theme.typography.bodySmallStrong,
    color: theme.colors.text,
  },

  sectionSeparator: {
    height: theme.spacing.sm,
  },

  courseSeparator: {
    height: theme.spacing.sm,
  },

  /*
   * Course card.
   */
  courseCard: {
    minHeight: 106,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  courseCardPressed: {
    opacity: 0.78,
  },

  courseBadge: {
    width: 58,
    height: 58,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
  },

  courseBadgeText: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "700",
    color: theme.colors.textInverse,
    letterSpacing: 0.4,
  },

  courseContent: {
    flex: 1,
    minWidth: 0,
  },

  courseHeading: {
    ...theme.typography.bodyStrong,
    color: theme.colors.text,
  },

  courseDescription: {
    marginTop: 2,
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },

  courseMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: theme.spacing.md,
    rowGap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },

  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "48%",
  },

  metaText: {
    flexShrink: 1,
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
  },

  courseChevron: {
    width: 28,
    minHeight: 48,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  /*
   * Loading / empty states.
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
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxxl,
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

  clearSearchButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
  },

  clearSearchText: {
    ...theme.typography.bodySmallStrong,
    color: theme.colors.primary,
  },
});
