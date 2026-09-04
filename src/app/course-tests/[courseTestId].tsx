import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Stack, useLocalSearchParams } from "expo-router";

import { ApiError } from "@/api/client";

import { useAuth } from "@/auth/AuthContext";

import { getCourseTest } from "@/database/courseTestRepository";

import {
  getCourseTestStudents,
  LocalCourseTestStudent,
} from "@/database/courseTestStudentRepository";

import { syncCourseTestStudents } from "@/sync/courseTestStudentSync";

export default function CourseTestDetailScreen() {
  const { courseTestId, courseId } = useLocalSearchParams<{
    courseTestId: string;

    courseId: string;
  }>();

  const { token } = useAuth();

  const numericCourseTestId = Number(courseTestId);

  const numericCourseId = Number(courseId);

  const [title, setTitle] = useState("Course Test");

  const [questionCount, setQuestionCount] = useState<number | null>(null);

  const [students, setStudents] = useState<LocalCourseTestStudent[]>([]);

  const [isLoading, setIsLoading] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);

  /*
    |--------------------------------------------------------------------------
    | Load Local SQLite Data
    |--------------------------------------------------------------------------
    */

  const loadLocal = useCallback(async () => {
    if (
      !Number.isFinite(numericCourseTestId) ||
      !Number.isFinite(numericCourseId)
    ) {
      return;
    }

    const courseTest = await getCourseTest(numericCourseTestId);

    if (courseTest) {
      setTitle(courseTest.title ?? "Course Test");

      setQuestionCount(courseTest.question_count);
    }

    const localStudents = await getCourseTestStudents(
      numericCourseTestId,
      numericCourseId,
    );

    setStudents(localStudents);
  }, [numericCourseTestId, numericCourseId]);

  /*
    |--------------------------------------------------------------------------
    | Online Refresh
    |--------------------------------------------------------------------------
    */

  const synchronize = useCallback(
    async (showError = false) => {
      if (!token || !Number.isFinite(numericCourseTestId)) {
        return;
      }

      try {
        await syncCourseTestStudents(token, numericCourseTestId);

        await loadLocal();
      } catch (error) {
        console.error("Course Test student sync failed:", error);

        if (!showError) {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          Alert.alert("Session Expired", "Please login again.");

          return;
        }

        Alert.alert(
          "Offline",
          "Unable to reach the GradeLens server. Showing saved student data.",
        );
      }
    },
    [token, numericCourseTestId, loadLocal],
  );

  /*
    |--------------------------------------------------------------------------
    | Initial Load
    |--------------------------------------------------------------------------
    */

  useEffect(() => {
    const load = async () => {
      try {
        /*
                    |--------------------------------------------------------------------------
                    | SQLite First
                    |--------------------------------------------------------------------------
                    */

        await loadLocal();

        /*
                    |--------------------------------------------------------------------------
                    | Server Second
                    |--------------------------------------------------------------------------
                    */

        await synchronize();
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [loadLocal, synchronize]);

  /*
    |--------------------------------------------------------------------------
    | Pull To Refresh
    |--------------------------------------------------------------------------
    */

  const handleRefresh = async () => {
    setIsRefreshing(true);

    try {
      await synchronize(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  /*
    |--------------------------------------------------------------------------
    | Summary
    |--------------------------------------------------------------------------
    */

  const resultCount = useMemo(
    () =>
      students.filter(
        (student) =>
          student.tentative_score !== null || student.final_score !== null,
      ).length,
    [students],
  );

  const finalCount = useMemo(
    () => students.filter((student) => student.final_score !== null).length,
    [students],
  );

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

          title,
        }}
      />

      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.summaryRow}>
            <SummaryBox value={students.length} label="Students" />

            <SummaryBox value={resultCount} label="Scanned" />

            <SummaryBox value={finalCount} label="Final" />

            <SummaryBox value={questionCount ?? "—"} label="Items" />
          </View>
        </View>

        <FlatList
          data={students}
          keyExtractor={(item) => String(item.std_id)}
          contentContainerStyle={
            students.length === 0 ? styles.emptyContainer : styles.list
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No Students</Text>

              <Text style={styles.emptyText}>
                Connect to GradeLens and synchronize this Course Test.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <StudentResultCard student={item} questionCount={questionCount} />
          )}
        />
      </View>
    </>
  );
}

type SummaryBoxProps = {
  value: number | string;

  label: string;
};

function SummaryBox({ value, label }: SummaryBoxProps) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{value}</Text>

      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

type StudentResultCardProps = {
  student: LocalCourseTestStudent;

  questionCount: number | null;
};

function StudentResultCard({ student, questionCount }: StudentResultCardProps) {
  const status = getResultStatus(student);

  return (
    <View style={styles.card}>
      <View style={styles.studentHeader}>
        <View style={styles.studentMain}>
          <Text style={styles.studentName}>
            {student.name ?? "Unnamed Student"}
          </Text>

          <Text style={styles.studentNumber}>
            {student.student_id_no ?? "No Student ID"}
          </Text>
        </View>

        <StatusBadge status={status} />
      </View>

      <View style={styles.scoreRow}>
        <ScoreBox
          label="Tentative"
          score={student.tentative_score}
          questionCount={questionCount}
        />

        <ScoreBox
          label="Final"
          score={student.final_score}
          questionCount={questionCount}
        />
      </View>
    </View>
  );
}

type ScoreBoxProps = {
  label: string;

  score: number | null;

  questionCount: number | null;
};

function ScoreBox({ label, score, questionCount }: ScoreBoxProps) {
  return (
    <View style={styles.scoreBox}>
      <Text style={styles.scoreLabel}>{label}</Text>

      <Text style={styles.scoreValue}>
        {score !== null
          ? questionCount
            ? `${score} / ${questionCount}`
            : String(score)
          : "—"}
      </Text>
    </View>
  );
}

type ResultStatus = "not_scanned" | "pending" | "synced";

function getResultStatus(student: LocalCourseTestStudent): ResultStatus {
  if (student.final_score !== null) {
    return "synced";
  }

  if (student.tentative_score !== null) {
    return "pending";
  }

  return "not_scanned";
}

function StatusBadge({ status }: { status: ResultStatus }) {
  const label =
    status === "synced"
      ? "Final"
      : status === "pending"
        ? "Pending"
        : "Not Scanned";

  return (
    <View
      style={[
        styles.badge,

        status === "synced"
          ? styles.badgeSuccess
          : status === "pending"
            ? styles.badgePending
            : styles.badgeNeutral,
      ]}
    >
      <Text
        style={[
          styles.badgeText,

          status === "synced"
            ? styles.badgeTextSuccess
            : status === "pending"
              ? styles.badgeTextPending
              : styles.badgeTextNeutral,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,

    backgroundColor: "#f8fafc",
  },

  header: {
    paddingHorizontal: 16,

    paddingTop: 18,

    paddingBottom: 18,

    borderBottomWidth: 1,

    borderBottomColor: "#e5e7eb",

    backgroundColor: "#ffffff",
  },

  title: {
    fontSize: 22,

    fontWeight: "700",

    color: "#111827",
  },

  summaryRow: {
    flexDirection: "row",

    marginTop: 18,

    gap: 8,
  },

  summaryItem: {
    flex: 1,

    paddingVertical: 11,

    paddingHorizontal: 8,

    borderRadius: 10,

    backgroundColor: "#f3f4f6",
  },

  summaryValue: {
    fontSize: 17,

    fontWeight: "700",

    color: "#111827",
  },

  summaryLabel: {
    marginTop: 3,

    fontSize: 10,

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

    borderRadius: 12,

    backgroundColor: "#ffffff",
  },

  studentHeader: {
    flexDirection: "row",

    alignItems: "flex-start",

    justifyContent: "space-between",
  },

  studentMain: {
    flex: 1,

    paddingRight: 12,
  },

  studentName: {
    fontSize: 16,

    fontWeight: "700",

    color: "#111827",
  },

  studentNumber: {
    marginTop: 4,

    fontSize: 13,

    color: "#6b7280",
  },

  scoreRow: {
    flexDirection: "row",

    gap: 10,

    marginTop: 16,
  },

  scoreBox: {
    flex: 1,

    padding: 12,

    borderRadius: 8,

    backgroundColor: "#f9fafb",
  },

  scoreLabel: {
    fontSize: 11,

    fontWeight: "600",

    color: "#6b7280",
  },

  scoreValue: {
    marginTop: 5,

    fontSize: 16,

    fontWeight: "700",

    color: "#111827",
  },

  badge: {
    paddingHorizontal: 9,

    paddingVertical: 5,

    borderRadius: 999,
  },

  badgeSuccess: {
    backgroundColor: "#dcfce7",
  },

  badgePending: {
    backgroundColor: "#fef3c7",
  },

  badgeNeutral: {
    backgroundColor: "#f3f4f6",
  },

  badgeText: {
    fontSize: 11,

    fontWeight: "700",
  },

  badgeTextSuccess: {
    color: "#166534",
  },

  badgeTextPending: {
    color: "#92400e",
  },

  badgeTextNeutral: {
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

    fontWeight: "700",

    color: "#111827",
  },

  emptyText: {
    marginTop: 8,

    textAlign: "center",

    lineHeight: 20,

    color: "#6b7280",
  },
});
