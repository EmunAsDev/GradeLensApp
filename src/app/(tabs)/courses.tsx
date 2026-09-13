import { useCallback, useState } from "react";

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

import { router, useFocusEffect } from "expo-router";

import { ApiError } from "../../api/client";

import { useAuth } from "../../auth/AuthContext";

import { getCourses, LocalCourse } from "../../database/courseRepository";

import { syncCourses } from "../../sync/courseSync";

import { runGuardedSync, TARGETED_REFRESH_COOLDOWN_MS } from "@/sync/syncGuard";

import { AppScreenHeader } from "@/../components/layout/AppScreenHeader";
import { theme } from "@/../theme";

const COURSES_SYNC_KEY = "courses";

export default function CoursesScreen() {
  const { token, employee } = useAuth();

  const [courses, setCourses] = useState<LocalCourse[]>([]);

  const [isLoading, setIsLoading] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);

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
         * Existing SQLite data remains visible even when the API request fails.
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
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppScreenHeader
        eyebrow="GradeLens"
        title="Courses"
        subtitle="Your synchronized courses and offline course workspace."
      />

      <FlatList
        data={courses}
        keyExtractor={(item) => String(item.crs_id)}
        contentContainerStyle={
          courses.length === 0 ? styles.emptyContainer : styles.list
        }
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No courses found</Text>

            <Text style={styles.emptyText}>
              Pull down while online to check GradeLens for updated courses.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              router.push({
                pathname: "/courses/[courseId]",

                params: {
                  courseId: String(item.crs_id),
                },
              });
            }}
            style={styles.card}
          >
            <Text style={styles.courseCode}>{item.code}</Text>

            <Text style={styles.courseTitle}>{item.title}</Text>

            <Text style={styles.courseMeta}>
              {[item.program, item.year, item.section]
                .filter(Boolean)
                .join(" • ")}
            </Text>

            {item.room ? (
              <Text style={styles.courseMeta}>Room: {item.room}</Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,

    backgroundColor: theme.colors.background,
  },

  list: {
    padding: 16,

    gap: 12,
  },

  card: {
    padding: 16,

    borderWidth: 1,

    borderColor: "#e5e7eb",

    borderRadius: 10,

    backgroundColor: "#ffffff",
  },

  courseCode: {
    fontSize: 13,

    fontWeight: "700",

    color: "#a40c0c",
  },

  courseTitle: {
    marginTop: 5,

    fontSize: 17,

    fontWeight: "600",

    color: "#111827",
  },

  courseMeta: {
    marginTop: 6,

    fontSize: 13,

    color: "#6b7280",
  },

  center: {
    flex: 1,

    alignItems: "center",

    justifyContent: "center",
  },

  emptyContainer: {
    flexGrow: 1,

    justifyContent: "center",
  },

  empty: {
    padding: 30,

    alignItems: "center",
  },

  emptyTitle: {
    fontSize: 18,

    fontWeight: "600",

    color: "#111827",
  },

  emptyText: {
    marginTop: 8,

    textAlign: "center",

    color: "#6b7280",
  },
});
