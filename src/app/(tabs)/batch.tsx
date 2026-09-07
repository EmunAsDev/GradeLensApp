import { useCallback, useEffect, useMemo, useState } from "react";

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

import { useAuth } from "../../auth/AuthContext";

import {
  countSyncedOmrSubmissions,
  getPendingOmrSubmissions,
  type ParsedLocalOmrSubmission,
} from "@/database/omrSubmissionRepository";

import { syncPendingOmrSubmissions } from "@/sync/omrSubmissionSync";

type StatusCounts = {
  pending: number;
  syncing: number;
  failed: number;
  synced: number;
};

const EMPTY_COUNTS: StatusCounts = {
  pending: 0,
  syncing: 0,
  failed: 0,
  synced: 0,
};

export default function BatchScreen() {
  const { token } = useAuth();

  const [outstanding, setOutstanding] = useState<ParsedLocalOmrSubmission[]>(
    [],
  );

  const [syncedCount, setSyncedCount] = useState(0);

  const [isLoading, setIsLoading] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);

  const loadLocalState = useCallback(async () => {
    const [pending, synced] = await Promise.all([
      getPendingOmrSubmissions(),
      countSyncedOmrSubmissions(),
    ]);

    setOutstanding(pending);

    setSyncedCount(synced);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        await loadLocalState();
      } catch (error) {
        console.error("[BATCH] Failed to load local submission state:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [loadLocalState]);

  const handleRefresh = async () => {
    setIsRefreshing(true);

    try {
      await loadLocalState();
    } catch (error) {
      console.error("[BATCH] Refresh failed:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const counts = useMemo<StatusCounts>(() => {
    const result: StatusCounts = { ...EMPTY_COUNTS, synced: syncedCount };

    for (const submission of outstanding) {
      if (submission.sync_status === "pending") {
        result.pending++;
      } else if (submission.sync_status === "syncing") {
        result.syncing++;
      } else if (submission.sync_status === "failed") {
        result.failed++;
      }
    }

    return result;
  }, [outstanding, syncedCount]);

  const handleSyncNow = async () => {
    if (isSyncing) {
      return;
    }

    if (!token) {
      Alert.alert(
        "Not Signed In",
        "Please log in again before syncing scanned sheets.",
      );

      return;
    }

    if (outstanding.length === 0) {
      Alert.alert(
        "Nothing To Sync",
        "There are no scans waiting to be synchronized.",
      );

      return;
    }

    setIsSyncing(true);

    try {
      console.log("[BATCH] Starting OMR submission sync...");

      const result = await syncPendingOmrSubmissions(token);

      console.log("[BATCH] Sync result:", result);

      await loadLocalState();

      if (result.submissionCount === 0) {
        Alert.alert(
          "Nothing To Sync",
          "There are no scans waiting to be synchronized.",
        );

        return;
      }

      const messageLines = [
        `${result.syncedCount} of ${result.submissionCount} scan(s) synchronized across ${result.batchCount} batch(es).`,
      ];

      if (result.failedCount > 0) {
        messageLines.push(
          `${result.failedCount} scan(s) could not be finalized — see the list below for details.`,
        );
      }

      Alert.alert("Sync Complete", messageLines.join("\n"));
    } catch (error) {
      // syncPendingOmrSubmissions stops and re-throws on a batch-level
      // failure (e.g. no network) rather than silently skipping to the
      // next course test's batch - see markOmrBatchFailed in
      // omrSubmissionSync.ts. Whatever got through before the failure is
      // still saved locally as synced; the rest stays pending for retry.
      console.error("[BATCH] Sync failed:", error);

      await loadLocalState();

      Alert.alert(
        "Sync Interrupted",
        "GradeLens couldn't finish syncing — this is usually a connectivity issue. Anything already synced is saved; the rest will retry next time.",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const hasAnySubmissions = outstanding.length > 0 || counts.synced > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Batch Sync</Text>

        <Text style={styles.subtitle}>
          Manage scanned answer sheets waiting to be synchronized with
          GradeLens.
        </Text>
      </View>

      <View style={styles.summaryContainer}>
        <SummaryCard label="Pending" value={counts.pending + counts.syncing} />

        <SummaryCard label="Synced" value={counts.synced} />

        <SummaryCard label="Failed" value={counts.failed} />
      </View>

      <Pressable
        style={[
          styles.primaryButton,
          (isSyncing || outstanding.length === 0) && styles.disabledButton,
        ]}
        disabled={isSyncing || outstanding.length === 0}
        onPress={handleSyncNow}
      >
        {isSyncing ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>Sync Now</Text>
        )}
      </Pressable>

      {!hasAnySubmissions ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No Scanned Submissions</Text>

          <Text style={styles.emptyText}>
            Answer sheets scanned with GradeLens will appear here before they
            are synchronized with the Laravel server.
          </Text>
        </View>
      ) : (
        <FlatList
          data={outstanding}
          keyExtractor={(item) => item.submission_uuid}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
            />
          }
          ListHeaderComponent={
            outstanding.length > 0 ? (
              <Text style={styles.listHeading}>Not Yet Synced</Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.allSyncedCard}>
              <Text style={styles.allSyncedText}>
                Everything is synced. Nothing needs attention right now.
              </Text>
            </View>
          }
          renderItem={({ item }) => <SubmissionRow submission={item} />}
        />
      )}
    </View>
  );
}

type SummaryCardProps = {
  label: string;

  value: number;
};

function SummaryCard({ label, value }: SummaryCardProps) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>

      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

type SubmissionRowProps = {
  submission: ParsedLocalOmrSubmission;
};

function SubmissionRow({ submission }: SubmissionRowProps) {
  const isFailed = submission.sync_status === "failed";

  const isSyncing = submission.sync_status === "syncing";

  return (
    <View style={[styles.rowCard, isFailed && styles.rowCardFailed]}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowStudent}>
          Student ID: {submission.student_id_no}
        </Text>

        <View
          style={[
            styles.statusBadge,
            isFailed
              ? styles.statusBadgeFailed
              : isSyncing
                ? styles.statusBadgeSyncing
                : styles.statusBadgePending,
          ]}
        >
          <Text style={styles.statusBadgeText}>
            {isFailed ? "Failed" : isSyncing ? "Syncing" : "Pending"}
          </Text>
        </View>
      </View>

      {isFailed && submission.last_error ? (
        <Text style={styles.rowError}>{submission.last_error}</Text>
      ) : null}

      <Text style={styles.rowMeta}>
        Tentative score: {submission.tentative_score} · Captured{" "}
        {new Date(submission.captured_at).toLocaleString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,

    padding: 18,

    backgroundColor: "#f8fafc",
  },

  header: {
    paddingTop: 20,

    paddingBottom: 18,
  },

  title: {
    fontSize: 26,

    fontWeight: "700",

    color: "#111827",
  },

  subtitle: {
    marginTop: 6,

    maxWidth: 360,

    fontSize: 14,

    lineHeight: 20,

    color: "#6b7280",
  },

  summaryContainer: {
    flexDirection: "row",

    gap: 10,
  },

  summaryCard: {
    flex: 1,

    padding: 15,

    borderWidth: 1,

    borderColor: "#e5e7eb",

    borderRadius: 12,

    backgroundColor: "#ffffff",
  },

  summaryValue: {
    fontSize: 22,

    fontWeight: "700",

    color: "#111827",
  },

  summaryLabel: {
    marginTop: 4,

    fontSize: 12,

    color: "#6b7280",
  },

  primaryButton: {
    marginTop: 16,

    minHeight: 48,

    alignItems: "center",

    justifyContent: "center",

    borderRadius: 10,

    backgroundColor: "#a40c0c",
  },

  primaryButtonText: {
    fontSize: 15,

    fontWeight: "700",

    color: "#ffffff",
  },

  disabledButton: {
    opacity: 0.55,
  },

  emptyCard: {
    marginTop: 20,

    padding: 24,

    alignItems: "center",

    borderWidth: 1,

    borderColor: "#e5e7eb",

    borderRadius: 12,

    backgroundColor: "#ffffff",
  },

  emptyTitle: {
    fontSize: 17,

    fontWeight: "700",

    color: "#111827",
  },

  emptyText: {
    marginTop: 8,

    maxWidth: 320,

    textAlign: "center",

    lineHeight: 20,

    color: "#6b7280",
  },

  list: {
    marginTop: 18,

    gap: 10,

    paddingBottom: 24,
  },

  listHeading: {
    marginBottom: 4,

    fontSize: 13,

    fontWeight: "700",

    textTransform: "uppercase",

    letterSpacing: 0.6,

    color: "#6b7280",
  },

  allSyncedCard: {
    marginTop: 18,

    padding: 20,

    alignItems: "center",

    borderWidth: 1,

    borderColor: "#e5e7eb",

    borderRadius: 12,

    backgroundColor: "#ffffff",
  },

  allSyncedText: {
    fontSize: 14,

    color: "#6b7280",
  },

  rowCard: {
    padding: 14,

    borderWidth: 1,

    borderColor: "#e5e7eb",

    borderRadius: 10,

    backgroundColor: "#ffffff",
  },

  rowCardFailed: {
    borderColor: "#fecaca",

    backgroundColor: "#fef2f2",
  },

  rowHeader: {
    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",
  },

  rowStudent: {
    fontSize: 15,

    fontWeight: "700",

    color: "#111827",
  },

  statusBadge: {
    paddingHorizontal: 9,

    paddingVertical: 4,

    borderRadius: 999,
  },

  statusBadgePending: {
    backgroundColor: "#f3f4f6",
  },

  statusBadgeSyncing: {
    backgroundColor: "#fef3c7",
  },

  statusBadgeFailed: {
    backgroundColor: "#fee2e2",
  },

  statusBadgeText: {
    fontSize: 11,

    fontWeight: "700",

    color: "#374151",
  },

  rowError: {
    marginTop: 6,

    fontSize: 13,

    color: "#991b1b",
  },

  rowMeta: {
    marginTop: 6,

    fontSize: 12,

    color: "#6b7280",
  },

  center: {
    flex: 1,

    alignItems: "center",

    justifyContent: "center",
  },
});
