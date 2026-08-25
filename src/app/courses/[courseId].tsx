import { useCallback, useEffect, useState } from "react";

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

import { router, Stack, useLocalSearchParams } from "expo-router";

import { ApiError } from "../../api/client";

import { useAuth } from "../../auth/AuthContext";

import {
  getCourseTests,
  LocalCourseTest,
} from "../../database/courseTestRepository";

import { syncCourseTests } from "../../sync/courseTestSync";

import { fetchOmrPackage } from "@/api/omrPackageApi";

import { getDeviceUuid } from "@/crypto/deviceKeyStorage";

export default function CourseTestsScreen() {
  const { courseId } = useLocalSearchParams<{
    courseId: string;
  }>();

  const { token } = useAuth();

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

  const synchronize = useCallback(
    async (showError = false) => {
      if (!token || !Number.isFinite(numericCourseId)) {
        return;
      }

      try {
        await syncCourseTests(token, numericCourseId);

        await loadLocal();
      } catch (error) {
        console.log("Course test sync failed:", error);

        if (!showError) {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          Alert.alert("Session Expired", "Please login again.");

          return;
        }

        Alert.alert(
          "Offline",
          "Unable to reach the server. Showing saved tests on this device.",
        );
      }
    },
    [token, numericCourseId, loadLocal],
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

      console.log("[OMR PACKAGE]", {
        crs_tst_id: omrPackage.crs_tst_id,

        tst_id: omrPackage.tst_id,

        question_count: omrPackage.question_count,

        content_algorithm: omrPackage.encryption.content_algorithm,

        wrapped_key_length: omrPackage.encryption.wrapped_key.length,

        encrypted_image_length: omrPackage.answer_key.length,
      });

      Alert.alert(
        "OMR Package",
        `Encrypted ${omrPackage.question_count}-item package downloaded successfully.`,
      );
    } catch (error) {
      console.error("OMR package download failed:", error);

      Alert.alert("Download Failed", "Unable to download the OMR package.");
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        await loadLocal();

        await synchronize();
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [loadLocal, synchronize]);

  const handleRefresh = async () => {
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
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Course Tests",
        }}
      />

      <View style={styles.container}>
        <FlatList
          data={courseTests}
          keyExtractor={(item) => String(item.crs_tst_id)}
          contentContainerStyle={
            courseTests.length === 0 ? styles.emptyContainer : styles.list
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No assigned tests</Text>

              <Text style={styles.emptyText}>
                Pull down to synchronize when connected.
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
                <Text style={styles.meta}>
                  Duration: {item.duration} minutes
                </Text>
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
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
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
