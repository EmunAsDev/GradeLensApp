import { AppScreenHeader } from "@/../components/layout/AppScreenHeader";
import { useCallback, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { router, useFocusEffect } from "expo-router";

import { ApiError } from "../../api/client";

import { useAuth } from "../../auth/AuthContext";

import { getCourses, LocalCourse } from "../../database/courseRepository";

import { syncCourses } from "../../sync/courseSync";

import { runGuardedSync, TARGETED_REFRESH_COOLDOWN_MS } from "@/sync/syncGuard";

import { getScreenHorizontalPadding, theme } from "@/../theme";

const COURSES_SYNC_KEY = "courses";

export default function CoursesScreen() {
  const { token, employee } = useAuth();

  const [courses, setCourses] = useState<LocalCourse[]>([]);

  const [isLoading, setIsLoading] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const { width } = useWindowDimensions();

  const horizontalPadding = getScreenHorizontalPadding(width);

  const loadLocalCourses = useCallback(async () => {
    const localCourses = await getCourses();

    setCourses(localCourses);
  }, []);

  /*
   * Opening/focusing the screen reads SQLite only.
   *
   * It does NOT automatically call Laravel.
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

  /*
   * Pull-to-refresh is an explicit targeted server refresh.
   *
   * Successful refreshes have a 30-second persisted cooldown.
   * Failed/offline requests do not start the cooldown.
   */
  const synchronize = useCallback(
    async (showFeedback = false) => {
      if (!token || !employee) {
        return;
      }

      try {
        const result = await runGuardedSync({
          employeeId: employee.id,

          syncKey: COURSES_SYNC_KEY,

          cooldownMs: TARGETED_REFRESH_COOLDOWN_MS,

          task: async () => {
            await syncCourses(token);
          },
        });

        if (result.status === "in_progress") {
          return;
        }

        if (result.status === "cooldown") {
          await loadLocalCourses();

          if (showFeedback) {
            const seconds = Math.max(1, Math.ceil(result.remainingMs / 1000));

            Alert.alert(
              "Recently Updated",
              `Courses were refreshed recently. You can check the server again in about ${seconds} second${
                seconds === 1 ? "" : "s"
              }.`,
            );
          }

          return;
        }

        await loadLocalCourses();
      } catch (error) {
        /*
         * Existing SQLite data remains visible even when
         * the API request fails.
         */
        await loadLocalCourses();

        if (!showFeedback) {
          return;
        }

        if (error instanceof ApiError) {
          if (error.status === 401) {
            Alert.alert("Session Expired", "Please login again.");

            return;
          }

          if (error.status === 429) {
            Alert.alert(
              "Refresh Paused",
              "The server temporarily paused requests. Your saved courses are still available.",
            );

            return;
          }
        }

        Alert.alert(
          "Offline",
          "Unable to reach the server. Showing courses saved on this device.",
        );
      }
    },
    [token, employee, loadLocalCourses],
  );

  const handleRefresh = async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);

    try {
      await synchronize(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppScreenHeader eyebrow="GradeLens" title="Courses" />

      <View
        style={[
          styles.infoBannerWrapper,
          {
            paddingHorizontal: horizontalPadding,
          },
        ]}
      >
        <View style={styles.infoBanner}>
          <View accessible={false} style={styles.infoIcon}>
            <Text style={styles.infoIconText}>i</Text>
          </View>

          <Text style={styles.infoText}>
            Your synchronized courses are available for offline use on this
            device.
          </Text>
        </View>
      </View>

      <FlatList
        data={courses}
        keyExtractor={(item) => String(item.crs_id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          courses.length === 0 ? styles.emptyContainer : styles.list,
          {
            paddingHorizontal: horizontalPadding,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No courses found</Text>

            <Text style={styles.emptyText}>
              Pull down while online to check GradeLens for updated courses.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const title = item.title?.trim() || "Untitled Course";

          const code = item.code?.trim() || null;

          const description = item.description?.trim() || null;

          const time = item.time?.trim() || null;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={code ? `${title}, ${code}` : title}
              onPress={() => {
                router.push({
                  pathname: "/courses/[courseId]",

                  params: {
                    courseId: String(item.crs_id),
                  },
                });
              }}
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
            >
              <Text style={styles.courseTitle}>
                {title}
                {code ? ` (${code})` : ""}
              </Text>

              {description ? (
                <Text
                  style={styles.courseDescription}
                  numberOfLines={3}
                  ellipsizeMode="tail"
                >
                  {description}
                </Text>
              ) : null}

              {time ? (
                <Text style={styles.courseTime}>Time: {time}</Text>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,

    backgroundColor: theme.colors.background,
  },

  infoBannerWrapper: {
    width: "100%",

    marginBottom: theme.spacing.md,
  },

  infoBanner: {
    width: "100%",
    maxWidth: theme.layout.contentMaxWidth,

    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",

    gap: theme.spacing.sm,

    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,

    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,

    backgroundColor: theme.colors.surfaceMuted,
  },

  infoIcon: {
    width: 24,
    height: 24,

    flexShrink: 0,

    alignItems: "center",
    justifyContent: "center",

    borderRadius: 12,

    backgroundColor: theme.colors.infoSoft,
  },

  infoIconText: {
    marginTop: -1,

    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",

    color: theme.colors.info,
  },

  infoText: {
    flex: 1,
    minWidth: 0,

    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",

    color: theme.colors.textSecondary,
  },

  list: {
    width: "100%",
    maxWidth: theme.layout.contentMaxWidth,

    alignSelf: "center",

    gap: theme.spacing.md,

    paddingBottom: theme.spacing.xxxl,
  },

  card: {
    width: "100%",

    padding: theme.spacing.lg,

    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,

    backgroundColor: theme.colors.surface,

    ...theme.shadows.card,
  },

  cardPressed: {
    opacity: 0.72,
  },

  courseTitle: {
    ...theme.typography.cardTitle,

    color: theme.colors.text,
  },

  courseDescription: {
    marginTop: theme.spacing.sm,

    ...theme.typography.body,

    color: theme.colors.textSecondary,
  },

  courseTime: {
    marginTop: theme.spacing.md,

    ...theme.typography.caption,

    color: theme.colors.textMuted,
  },

  center: {
    flex: 1,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: theme.colors.background,
  },

  emptyContainer: {
    flexGrow: 1,

    width: "100%",
    maxWidth: theme.layout.contentMaxWidth,

    alignSelf: "center",
    justifyContent: "center",

    paddingBottom: theme.spacing.xxxl,
  },

  empty: {
    alignItems: "center",

    paddingHorizontal: theme.spacing.xxl,
    paddingVertical: theme.spacing.xxxl,
  },

  emptyTitle: {
    ...theme.typography.cardTitle,

    textAlign: "center",

    color: theme.colors.text,
  },

  emptyText: {
    maxWidth: 300,

    marginTop: theme.spacing.sm,

    ...theme.typography.body,

    textAlign: "center",

    color: theme.colors.textSecondary,
  },
});
