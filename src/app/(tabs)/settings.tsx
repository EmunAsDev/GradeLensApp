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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { getDeviceUuid } from "@/crypto/deviceKeyStorage";
import { performFullSync } from "@/sync/fullSync";

import { AppIcon } from "@/../components/icons/AppIcon";
import { theme } from "@/../theme";

export default function SettingsScreen() {
  const { token, employee, logout } = useAuth();
  const insets = useSafeAreaInsets();

  const [deviceUuid, setDeviceUuid] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const loadDevice = async () => {
      setDeviceUuid(await getDeviceUuid());
    };

    void loadDevice();
  }, []);

  const handleSync = async () => {
    if (!token || !employee) {
      Alert.alert("Sync", "You are not currently authenticated.");
      return;
    }

    if (isSyncing) {
      return;
    }

    setIsSyncing(true);
    setSyncStatus("Updating offline GradeLens data...");

    try {
      const result = await performFullSync(token, employee.id);

      if (result.status === "in_progress") {
        setSyncStatus("Synchronization is already in progress.");
        return;
      }

      if (result.status === "cooldown") {
        const waitText = formatRemainingTime(result.remainingMs);

        setSyncStatus(
          `GradeLens was synchronized recently. Try again in ${waitText}.`,
        );

        Alert.alert(
          "Recently Synchronized",
          `Your offline data was updated recently. You can synchronize again in ${waitText}.`,
        );

        return;
      }

      const summary = result.data;

      setDeviceUuid(await getDeviceUuid());

      setSyncStatus(
        `Updated ${summary.courseCount} course${
          summary.courseCount === 1 ? "" : "s"
        } and ${summary.omrPackagesSynced} OMR package${
          summary.omrPackagesSynced === 1 ? "" : "s"
        }.`,
      );

      const issueCount =
        summary.courseTestsWithStudentsFailed + summary.omrPackagesFailed;

      if (issueCount > 0) {
        Alert.alert(
          "Sync Completed With Issues",
          `${summary.courseTestsWithStudentsSynced} course-test roster(s) updated, ` +
            `${summary.courseTestsWithStudentsFailed} roster(s) failed, ` +
            `${summary.omrPackagesSynced} OMR package(s) updated, and ` +
            `${summary.omrPackagesFailed} package(s) failed. ` +
            "Existing offline data was preserved where updates failed.",
        );

        return;
      }

      Alert.alert(
        "Sync Complete",
        "Courses, course tests, students, existing results, and OMR packages are updated for offline use.",
      );
    } catch (error) {
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

        if (error.status === 429) {
          setSyncStatus("The server temporarily paused synchronization.");

          Alert.alert(
            "Sync Paused",
            "GradeLens received too many requests. Your existing offline data is unchanged. Please try again later.",
          );

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
    Alert.alert(
      "Log Out?",
      "Your GradeLens session will be removed from this device. Previously synchronized offline data will remain available.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Log Out",
          style: "destructive",
          onPress: () => {
            void performLogout();
          },
        },
      ],
    );
  };

  const fullName = [employee?.firstname, employee?.lastname]
    .filter(Boolean)
    .join(" ");

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + theme.spacing.sm,
          },
        ]}
      >
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.firstSection}>
          <Text style={styles.sectionTitle}>Profile</Text>

          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {employee?.firstname?.charAt(0).toUpperCase() ?? "?"}
              </Text>
            </View>

            <View style={styles.profileMain}>
              <Text style={styles.profileName} numberOfLines={1}>
                {fullName || "Faculty"}
              </Text>

              <Text style={styles.profileEmail} numberOfLines={1}>
                {employee?.email ?? "No email available"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Synchronization</Text>

          <View style={styles.syncCard}>
            <Text style={styles.syncTitle}>Offline Data</Text>

            <Text style={styles.syncDescription}>
              Synchronize your courses, assigned tests, student rosters,
              existing results, and OMR packages with GradeLens.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Synchronize offline GradeLens data"
              disabled={isSyncing}
              onPress={() => {
                void handleSync();
              }}
              style={({ pressed }) => [
                styles.syncButton,
                pressed && !isSyncing && styles.pressed,
                isSyncing && styles.syncButtonBusy,
              ]}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <AppIcon name="sync" size={20} color={theme.colors.primary} />
              )}

              <Text style={styles.syncButtonText}>
                {isSyncing ? "Synchronizing..." : "Sync Now"}
              </Text>
            </Pressable>

            <Text style={styles.syncHint}>
              {syncStatus ??
                "Existing offline data remains available when the server cannot be reached."}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Settings</Text>

          <SettingsRow
            icon="settings"
            title="Account Security"
            subtitle={
              deviceUuid
                ? "Device identity and login activity"
                : "Device identity needs attention"
            }
            onPress={() => router.push("/settings/account-security")}
          />

          <SettingsRow
            icon="info"
            title="About App"
            subtitle="Learn how GradeLens scanning, review, offline work, and sync operate"
            onPress={() => router.push("/settings/about")}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log out of GradeLens"
            disabled={isLoggingOut}
            onPress={handleLogout}
            style={({ pressed }) => [
              styles.logoutRow,
              pressed && !isLoggingOut && styles.pressed,
              isLoggingOut && styles.disabled,
            ]}
          >
            <View style={styles.logoutIcon}>
              {isLoggingOut ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.textInverse}
                />
              ) : (
                <AppIcon
                  name="logout"
                  size={22}
                  color={theme.colors.textInverse}
                />
              )}
            </View>

            <Text style={styles.logoutText}>
              {isLoggingOut ? "Logging Out..." : "Log Out"}
            </Text>

            <AppIcon name="next" size={24} color={theme.colors.textInverse} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

type SettingsRowProps = {
  icon: "settings" | "info";
  title: string;
  subtitle: string;
  onPress: () => void;
};

function SettingsRow({ icon, title, subtitle, onPress }: SettingsRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}
    >
      <View style={styles.settingsRowIcon}>
        <AppIcon name={icon} size={24} color={theme.colors.text} />
      </View>

      <View style={styles.settingsRowMain}>
        <Text style={styles.settingsRowTitle}>{title}</Text>

        <Text style={styles.settingsRowSubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>

      <AppIcon name="next" size={24} color={theme.colors.text} />
    </Pressable>
  );
}

function formatRemainingTime(remainingMs: number): string {
  const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

  if (totalSeconds < 60) {
    return `${totalSeconds} second${totalSeconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.ceil(totalSeconds / 60);

  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  container: {
    flex: 1,
  },

  header: {
    minHeight: 68,
    justifyContent: "flex-end",
    paddingHorizontal: theme.spacing.screenHorizontal,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
    backgroundColor: theme.colors.surface,
  },

  headerTitle: {
    ...theme.typography.screenTitle,
    color: theme.colors.text,
  },

  content: {
    paddingHorizontal: theme.spacing.screenHorizontal,
    paddingTop: theme.spacing.lg,
    paddingBottom: 48,
  },

  firstSection: {
    marginTop: 0,
  },

  section: {
    marginTop: theme.spacing.xxl,
  },

  sectionTitle: {
    marginBottom: theme.spacing.sm,
    ...theme.typography.sectionTitle,
    color: theme.colors.text,
  },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 88,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  avatar: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 29,
    backgroundColor: theme.colors.primary,
  },

  avatarText: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },

  profileMain: {
    flex: 1,
    minWidth: 0,
    marginLeft: theme.spacing.lg,
  },

  profileName: {
    ...theme.typography.cardTitle,
    color: theme.colors.text,
  },

  profileEmail: {
    marginTop: 2,
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },

  syncCard: {
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  syncTitle: {
    ...theme.typography.cardTitle,
    color: theme.colors.text,
  },

  syncDescription: {
    marginTop: 3,
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },

  syncButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
  },

  syncButtonBusy: {
    backgroundColor: theme.colors.primarySoft,
  },

  syncButtonText: {
    ...theme.typography.bodyStrong,
    color: theme.colors.primary,
  },

  syncHint: {
    marginTop: theme.spacing.sm,
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 64,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  settingsRowIcon: {
    width: 42,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  settingsRowMain: {
    flex: 1,
    minWidth: 0,
    paddingRight: theme.spacing.sm,
  },

  settingsRowTitle: {
    ...theme.typography.bodyStrong,
    color: theme.colors.text,
  },

  settingsRowSubtitle: {
    marginTop: 1,
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 58,
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.danger,
  },

  logoutIcon: {
    width: 42,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  logoutText: {
    flex: 1,
    ...theme.typography.bodyStrong,
    color: theme.colors.textInverse,
  },

  pressed: {
    opacity: 0.76,
  },

  disabled: {
    opacity: 0.55,
  },
});
