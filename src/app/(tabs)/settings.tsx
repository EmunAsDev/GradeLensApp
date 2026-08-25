import { useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { router } from "expo-router";

import { ApiError } from "@/api/client";

import { useAuth } from "@/auth/AuthContext";

import { getDeviceUuid } from "@/crypto/deviceKeyStorage";

import { performFullSync } from "@/sync/fullSync";

export default function SettingsScreen() {
  const { token, employee, logout } = useAuth();

  const [deviceUuid, setDeviceUuid] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);

  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const loadDevice = async () => {
      const uuid = await getDeviceUuid();

      setDeviceUuid(uuid);
    };

    void loadDevice();
  }, []);

  const handleSync = async () => {
    if (!token) {
      Alert.alert("Sync", "You are not currently authenticated.");

      return;
    }

    if (isSyncing) {
      return;
    }

    setIsSyncing(true);

    setSyncStatus("Synchronizing with GradeLens...");

    try {
      const result = await performFullSync(token);

      /*
                |--------------------------------------------------------------------------
                | Reload Device UUID
                |--------------------------------------------------------------------------
                */

      const uuid = await getDeviceUuid();

      setDeviceUuid(uuid);

      setSyncStatus(
        `Sync complete. ` +
          `${result.courseCount} course${
            result.courseCount === 1 ? "" : "s"
          }, ` +
          `${result.omrPackagesSynced} OMR package${
            result.omrPackagesSynced === 1 ? "" : "s"
          } synchronized.`,
      );

      if (result.omrPackagesFailed > 0) {
        Alert.alert(
          "Sync Completed With Issues",
          `${result.omrPackagesSynced} OMR package(s) synchronized. ` +
            `${result.omrPackagesFailed} package(s) could not be downloaded.`,
        );
      } else {
        Alert.alert(
          "Sync Complete",
          "Courses, course tests, and OMR packages are now available offline.",
        );
      }
    } catch (error) {
      console.error("Full synchronization failed:", error);

      if (error instanceof ApiError) {
        if (error.status === 401) {
          setSyncStatus("Your session has expired.");

          Alert.alert("Session Expired", "Please login again.");

          return;
        }

        if (error.status === 403) {
          setSyncStatus("Synchronization was not authorized.");

          Alert.alert("Sync Failed", error.message);

          return;
        }

        setSyncStatus("Synchronization failed.");

        Alert.alert("Sync Failed", error.message);

        return;
      }

      setSyncStatus(
        "Server unavailable. Your existing offline data is unchanged.",
      );

      Alert.alert(
        "Offline",
        "GradeLens could not reach the server. Your previously synchronized data is still available offline.",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const performLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      await logout();

      router.replace("/login");
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      {
        text: "Cancel",

        style: "cancel",
      },

      {
        text: "Logout",

        style: "destructive",

        onPress: () => {
          void performLogout();
        },
      },
    ]);
  };

  const fullName = [employee?.firstname, employee?.lastname]
    .filter(Boolean)
    .join(" ");

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>

        <Text style={styles.subtitle}>
          Account, device, and synchronization
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>

        <View style={styles.card}>
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {employee?.firstname?.charAt(0).toUpperCase() ?? "?"}
              </Text>
            </View>

            <View style={styles.profileMain}>
              <Text style={styles.profileName}>{fullName || "Faculty"}</Text>

              <Text style={styles.profileUsername}>
                @{employee?.username ?? "unknown"}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <InfoRow
            label="Employee ID"
            value={employee?.id != null ? String(employee.id) : "—"}
          />

          <InfoRow label="Email" value={employee?.email ?? "—"} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device</Text>

        <View style={styles.card}>
          <View style={styles.deviceStatusRow}>
            <View>
              <Text style={styles.infoLabel}>Device Identity</Text>

              <Text style={styles.deviceStatusText}>
                {deviceUuid ? "Configured" : "Not configured"}
              </Text>
            </View>

            <View
              style={[
                styles.statusBadge,

                deviceUuid
                  ? styles.statusBadgeSuccess
                  : styles.statusBadgeWarning,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,

                  deviceUuid
                    ? styles.statusBadgeTextSuccess
                    : styles.statusBadgeTextWarning,
                ]}
              >
                {deviceUuid ? "Ready" : "Pending"}
              </Text>
            </View>
          </View>

          {deviceUuid ? (
            <>
              <View style={styles.divider} />

              <Text style={styles.infoLabel}>Device UUID</Text>

              <Text selectable style={styles.deviceUuid}>
                {deviceUuid}
              </Text>
            </>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Synchronization</Text>

        <View style={styles.card}>
          <Text style={styles.syncTitle}>Offline Data</Text>

          <Text style={styles.syncDescription}>
            Synchronize your courses and assigned tests with the GradeLens
            server.
          </Text>

          {syncStatus ? (
            <View style={styles.syncStatus}>
              <Text style={styles.syncStatusText}>{syncStatus}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleSync}
            disabled={isSyncing}
            style={({ pressed }) => [
              styles.syncButton,

              pressed && !isSyncing && styles.buttonPressed,

              isSyncing && styles.disabledButton,
            ]}
          >
            {isSyncing ? (
              <View style={styles.buttonContent}>
                <ActivityIndicator size="small" color="#ffffff" />

                <Text style={styles.syncButtonText}>Synchronizing...</Text>
              </View>
            ) : (
              <Text style={styles.syncButtonText}>Sync Now</Text>
            )}
          </Pressable>

          <Text style={styles.syncHint}>
            Existing local data remains available when the server cannot be
            reached.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>

        <View style={styles.card}>
          <Text style={styles.logoutDescription}>
            Logging out removes your authentication session from this device.
            Previously synchronized offline data is kept.
          </Text>

          <Pressable
            onPress={handleLogout}
            disabled={isLoggingOut}
            style={({ pressed }) => [
              styles.logoutButton,

              pressed && !isLoggingOut && styles.logoutButtonPressed,

              isLoggingOut && styles.disabledButton,
            ]}
          >
            {isLoggingOut ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text style={styles.logoutButtonText}>Logout</Text>
            )}
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

type InfoRowProps = {
  label: string;
  value: string;
};

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>

      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,

    backgroundColor: "#f8fafc",
  },

  content: {
    paddingBottom: 40,
  },

  header: {
    paddingTop: 58,

    paddingHorizontal: 20,

    paddingBottom: 20,

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

  section: {
    marginTop: 22,

    paddingHorizontal: 16,
  },

  sectionTitle: {
    marginBottom: 8,

    marginLeft: 2,

    fontSize: 13,

    fontWeight: "700",

    textTransform: "uppercase",

    letterSpacing: 0.6,

    color: "#6b7280",
  },

  card: {
    padding: 16,

    borderWidth: 1,

    borderColor: "#e5e7eb",

    borderRadius: 12,

    backgroundColor: "#ffffff",
  },

  profileHeader: {
    flexDirection: "row",

    alignItems: "center",
  },

  avatar: {
    width: 52,

    height: 52,

    alignItems: "center",

    justifyContent: "center",

    borderRadius: 26,

    backgroundColor: "#a40c0c",
  },

  avatarText: {
    fontSize: 22,

    fontWeight: "700",

    color: "#ffffff",
  },

  profileMain: {
    flex: 1,

    marginLeft: 14,
  },

  profileName: {
    fontSize: 18,

    fontWeight: "700",

    color: "#111827",
  },

  profileUsername: {
    marginTop: 3,

    fontSize: 13,

    color: "#6b7280",
  },

  divider: {
    height: 1,

    marginVertical: 16,

    backgroundColor: "#e5e7eb",
  },

  infoRow: {
    marginBottom: 14,
  },

  infoLabel: {
    fontSize: 12,

    fontWeight: "600",

    color: "#6b7280",
  },

  infoValue: {
    marginTop: 4,

    fontSize: 15,

    color: "#111827",
  },

  deviceStatusRow: {
    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",
  },

  deviceStatusText: {
    marginTop: 4,

    fontSize: 15,

    fontWeight: "600",

    color: "#111827",
  },

  statusBadge: {
    paddingHorizontal: 10,

    paddingVertical: 5,

    borderRadius: 999,
  },

  statusBadgeSuccess: {
    backgroundColor: "#dcfce7",
  },

  statusBadgeWarning: {
    backgroundColor: "#fef3c7",
  },

  statusBadgeText: {
    fontSize: 12,

    fontWeight: "700",
  },

  statusBadgeTextSuccess: {
    color: "#166534",
  },

  statusBadgeTextWarning: {
    color: "#92400e",
  },

  deviceUuid: {
    marginTop: 6,

    fontSize: 12,

    lineHeight: 18,

    color: "#374151",
  },

  syncTitle: {
    fontSize: 16,

    fontWeight: "700",

    color: "#111827",
  },

  syncDescription: {
    marginTop: 6,

    fontSize: 14,

    lineHeight: 20,

    color: "#6b7280",
  },

  syncStatus: {
    marginTop: 14,

    padding: 12,

    borderRadius: 8,

    backgroundColor: "#f3f4f6",
  },

  syncStatusText: {
    fontSize: 13,

    lineHeight: 18,

    color: "#374151",
  },

  syncButton: {
    height: 48,

    marginTop: 16,

    alignItems: "center",

    justifyContent: "center",

    borderRadius: 8,

    backgroundColor: "#a40c0c",
  },

  buttonContent: {
    flexDirection: "row",

    alignItems: "center",

    gap: 9,
  },

  syncButtonText: {
    fontSize: 15,

    fontWeight: "700",

    color: "#ffffff",
  },

  syncHint: {
    marginTop: 11,

    fontSize: 12,

    lineHeight: 17,

    color: "#9ca3af",
  },

  logoutDescription: {
    fontSize: 14,

    lineHeight: 20,

    color: "#6b7280",
  },

  logoutButton: {
    height: 46,

    marginTop: 16,

    alignItems: "center",

    justifyContent: "center",

    borderWidth: 1,

    borderColor: "#a40c0c",

    borderRadius: 8,

    backgroundColor: "#ffffff",
  },

  logoutButtonPressed: {
    backgroundColor: "#fef2f2",
  },

  logoutButtonText: {
    fontSize: 15,

    fontWeight: "700",

    color: "#a40c0c",
  },

  buttonPressed: {
    opacity: 0.88,
  },

  disabledButton: {
    opacity: 0.6,
  },
});
