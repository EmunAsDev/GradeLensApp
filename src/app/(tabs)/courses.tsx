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

import { ApiError } from "../../api/client";

import { useAuth } from "../../auth/AuthContext";

import { getCourses, LocalCourse } from "../../database/courseRepository";

import { syncCourses } from "../../sync/courseSync";

import { router } from "expo-router";

export default function CoursesScreen() {
  const { token } = useAuth();

  const [courses, setCourses] = useState<LocalCourse[]>([]);

  const [isLoading, setIsLoading] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadLocalCourses = useCallback(async () => {
    const localCourses = await getCourses();

    setCourses(localCourses);
  }, []);

  const synchronize = useCallback(
    async (showError = false) => {
      if (!token) {
        return;
      }

      try {
        await syncCourses(token);

        await loadLocalCourses();
      } catch (error) {
        console.log("Course sync failed:", error);

        if (!showError) {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          Alert.alert("Session Expired", "Please login again.");

          return;
        }

        Alert.alert(
          "Offline",
          "Unable to reach the server. Showing courses saved on this device.",
        );
      }
    },
    [token, loadLocalCourses],
  );

  useEffect(() => {
    const load = async () => {
      try {
        /*
                    |--------------------------------------------------------------------------
                    | Show SQLite Data First
                    |--------------------------------------------------------------------------
                    */

        await loadLocalCourses();

        /*
                    |--------------------------------------------------------------------------
                    | Then Attempt Online Refresh
                    |--------------------------------------------------------------------------
                    */

        await synchronize();
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [loadLocalCourses, synchronize]);

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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Courses</Text>

        <Text style={styles.subtitle}>Your synchronized courses</Text>
      </View>

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
              Connect to the server and pull down to synchronize.
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

    backgroundColor: "#f8fafc",
  },

  header: {
    paddingHorizontal: 20,

    paddingTop: 58,

    paddingBottom: 18,

    backgroundColor: "#ffffff",
  },

  title: {
    fontSize: 28,

    fontWeight: "700",

    color: "#111827",
  },

  subtitle: {
    marginTop: 4,

    fontSize: 14,

    color: "#6b7280",
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
