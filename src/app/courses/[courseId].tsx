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

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { ApiError } from "../../api/client";

import { useAuth } from "../../auth/AuthContext";

import {
  getCourseTests,
  LocalCourseTest,
} from "../../database/courseTestRepository";

import { syncCourseTests } from "../../sync/courseTestSync";

import { fetchOmrPackage } from "@/api/omrPackageApi";

import { getDeviceUuid } from "@/crypto/deviceKeyStorage";

import {
  buildEmployeeSyncKey,
  runGuardedSync,
  TARGETED_REFRESH_COOLDOWN_MS,
} from "@/sync/syncGuard";

import { AppScreenHeader } from "@/../components/layout/AppScreenHeader";
import { theme } from "@/../theme";

const COURSE_TESTS_SYNC_KEY = "course_tests";

export default function CourseTestsScreen() {
  const { courseId } = useLocalSearchParams<{
    courseId: string;
  }>();

  const { token, employee } = useAuth();

  const numericCourseId = Number(courseId);

  const [courseTests, setCourseTests] = useState<LocalCourseTest[]>([]);

  const [isLoading, setIsLoading] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadLocal = useCallback(async () => {
    if (!Number.isFinite(numericCourseId)) {
      return;
    }

    const localTests = await getCourseTests(numericCourseId);

    setCourseTests(localTests);
  }, [numericCourseId]);

  /*
   * Opening/focusing the screen reloads SQLite only.
   *
   * No automatic API request is made just because the teacher navigated here.
   */
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const load = async () => {
        try {
          if (!Number.isFinite(numericCourseId)) {
            return;
          }

          const localTests = await getCourseTests(numericCourseId);

          if (!isActive) {
            return;
          }

          setCourseTests(localTests);
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

  const synchronize = useCallback(
    async (showFeedback = false) => {
      if (!token || !employee || !Number.isFinite(numericCourseId)) {
        return;
      }

      try {
        const result = await runGuardedSync({
          employeeId: employee.id,

          syncKey: buildEmployeeSyncKey(COURSE_TESTS_SYNC_KEY, numericCourseId),

          cooldownMs: TARGETED_REFRESH_COOLDOWN_MS,

          task: async () => {
            await syncCourseTests(token, numericCourseId);
          },
        });

        if (result.status === "in_progress") {
          return;
        }

        if (result.status === "cooldown") {
          await loadLocal();

          if (showFeedback) {
            const seconds = Math.max(1, Math.ceil(result.remainingMs / 1000));

            Alert.alert(
              "Recently Updated",
              `Course tests were refreshed recently. You can check the server again in about ${seconds} second${
                seconds === 1 ? "" : "s"
              }.`,
            );
          }

          return;
        }

        await loadLocal();
      } catch (error) {
        await loadLocal();

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
              "The server temporarily paused requests. Your saved tests are still available.",
            );

            return;
          }
        }

        Alert.alert(
          "Offline",
          "Unable to reach the server. Showing saved tests on this device.",
        );
      }
    },
    [token, employee, numericCourseId, loadLocal],
  );

  const handleDownloadOmrPackage = async (courseTestId: number) => {
    if (!token) {
      return;
    }

    try {
      const deviceUuid = await getDeviceUuid();

      if (!deviceUuid) {
        Alert.alert(
          "Device Error",
          "This device does not have a registered device identity.",
        );

        return;
      }

      const omrPackage = await fetchOmrPackage(token, courseTestId, deviceUuid);

      Alert.alert(
        "OMR Package",
        `Encrypted ${omrPackage.question_count}-item package downloaded successfully.`,
      );
    } catch {
      Alert.alert("Download Failed", "Unable to download the OMR package.");
    }
  };

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
        back
        backLabel="Courses"
        title="Course Tests"
        subtitle="Tests saved for this course and available to this device."
      />

      <FlatList
        data={courseTests}
        keyExtractor={(item) => String(item.crs_tst_id)}
        contentContainerStyle={
          courseTests.length === 0 ? styles.emptyContainer : styles.list
        }
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No assigned tests</Text>

            <Text style={styles.emptyText}>
              Pull down while online to check GradeLens for updated tests.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              router.push({
                pathname: "/course-tests/[courseTestId]",

                params: {
                  courseTestId: String(item.crs_tst_id),

                  courseId: String(item.crs_id),
                },
              });
            }}
            style={({ pressed }) => [
              styles.card,

              pressed && {
                opacity: 0.82,
              },
            ]}
          >
            <Text style={styles.testTitle}>
              {item.title ?? "Untitled Test"}
            </Text>

            <Text style={styles.meta}>Test ID: {item.tst_id}</Text>

            {item.duration ? (
              <Text style={styles.meta}>Duration: {item.duration} minutes</Text>
            ) : null}

            {item.deadline ? (
              <Text style={styles.meta}>Deadline: {item.deadline}</Text>
            ) : null}

            <Text style={styles.meta}>
              Paper only: {item.is_paper_only ? "Yes" : "No"}
            </Text>
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

  testTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
  },

  meta: {
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
    alignItems: "center",
    padding: 30,
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
