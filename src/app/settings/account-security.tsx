import { useEffect, useState } from "react";

import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthContext";
import { getDeviceUuid } from "@/crypto/deviceKeyStorage";

import { AppIcon } from "@/../components/icons/AppIcon";
import { theme } from "@/../theme";

export default function AccountSecurityScreen() {
  const insets = useSafeAreaInsets();

  const { employee } = useAuth();

  const [deviceUuid, setDeviceUuid] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const uuid = await getDeviceUuid();

        if (active) {
          setDeviceUuid(uuid);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const fullName = [employee?.firstname, employee?.lastname]
    .filter(Boolean)
    .join(" ");

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.detailHeader,
          {
            paddingTop: insets.top + theme.spacing.sm,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Settings"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.detailBackButton,
            pressed && styles.detailHeaderPressed,
          ]}
        >
          <AppIcon name="chevronLeft" size={26} color={theme.colors.text} />
        </Pressable>

        <Text style={styles.detailHeaderTitle} numberOfLines={1}>
          Account Security
        </Text>

        <View style={styles.detailHeaderSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <AppIcon name="settings" size={28} color={theme.colors.primary} />
          </View>

          <View style={styles.heroMain}>
            <Text style={styles.heroTitle}>Account & Device</Text>

            <Text style={styles.heroText}>
              Review the signed-in faculty account and the device identity used
              by GradeLens on this phone.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Current Account</Text>

        <View style={styles.card}>
          <InfoRow label="Faculty" value={fullName || "Faculty"} />

          <View style={styles.divider} />

          <InfoRow
            label="Email"
            value={employee?.email ?? "No email available"}
          />

          <View style={styles.divider} />

          <InfoRow
            label="Session"
            value="Signed in on this device"
            tone="success"
          />
        </View>

        <Text style={styles.sectionTitle}>Device Identity</Text>

        <View style={styles.card}>
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />

              <Text style={styles.loadingText}>Loading device identity...</Text>
            </View>
          ) : (
            <>
              <View style={styles.deviceTopRow}>
                <View>
                  <Text style={styles.infoLabel}>Registration State</Text>

                  <Text style={styles.deviceState}>
                    {deviceUuid ? "Configured" : "Not configured"}
                  </Text>
                </View>

                <View
                  style={[
                    styles.badge,
                    deviceUuid ? styles.badgeSuccess : styles.badgeWarning,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      deviceUuid
                        ? styles.badgeTextSuccess
                        : styles.badgeTextWarning,
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
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Login History</Text>

        <View style={styles.card}>
          <View style={styles.historyHeader}>
            <View style={styles.historyIcon}>
              <AppIcon
                name="time"
                size={22}
                color={theme.colors.textSecondary}
              />
            </View>

            <View style={styles.historyMain}>
              <Text style={styles.historyTitle}>Server Login Activity</Text>

              <Text style={styles.historyText}>
                GradeLens web already has login-history functionality, but the
                mobile Sanctum API does not expose those records yet.
              </Text>
            </View>
          </View>

          <View style={styles.pendingBox}>
            <Text style={styles.pendingTitle}>
              Mobile API connection pending
            </Text>

            <Text style={styles.pendingText}>
              Once the mobile endpoint is added, this section can show login
              time, device information, and other server-approved session
              metadata without inventing local history.
            </Text>
          </View>
        </View>

        <View style={styles.securityNote}>
          <AppIcon name="info" size={19} color={theme.colors.info} />

          <Text style={styles.securityNoteText}>
            GradeLens keeps authentication credentials and device cryptographic
            identity separate from normal offline course and scan data.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success";
}) {
  return (
    <View>
      <Text style={styles.infoLabel}>{label}</Text>

      <Text
        style={[
          styles.infoValue,
          tone === "success" && styles.infoValueSuccess,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  /*
   * ------------------------------------------------------------------------
   * Detail header
   * ------------------------------------------------------------------------
   * Matches the Course-detail direction:
   * neutral surface, dark title, chevron-left, subtle divider.
   */
  detailHeader: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.screenHorizontal,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
    backgroundColor: theme.colors.surface,
  },

  detailBackButton: {
    width: 40,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  detailHeaderTitle: {
    flex: 1,
    textAlign: "center",
    ...theme.typography.cardTitle,
    color: theme.colors.text,
  },

  detailHeaderSpacer: {
    width: 40,
    height: 40,
  },

  detailHeaderPressed: {
    opacity: 0.65,
  },

  content: {
    paddingHorizontal: theme.spacing.screenHorizontal,
    paddingTop: theme.spacing.lg,
    paddingBottom: 48,
  },

  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primarySoft,
  },

  heroIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
    backgroundColor: theme.colors.surface,
  },

  heroMain: {
    flex: 1,
  },

  heroTitle: {
    ...theme.typography.cardTitle,
    color: theme.colors.text,
  },

  heroText: {
    marginTop: 2,
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },

  sectionTitle: {
    marginTop: theme.spacing.xxl,
    marginBottom: theme.spacing.sm,
    ...theme.typography.sectionTitle,
    color: theme.colors.text,
  },

  card: {
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  infoLabel: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },

  infoValue: {
    marginTop: 2,
    ...theme.typography.bodyStrong,
    color: theme.colors.text,
  },

  infoValueSuccess: {
    color: theme.colors.success,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: theme.spacing.md,
    backgroundColor: theme.colors.divider,
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },

  loadingText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },

  deviceTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },

  deviceState: {
    marginTop: 2,
    ...theme.typography.bodyStrong,
    color: theme.colors.text,
  },

  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
  },

  badgeSuccess: {
    backgroundColor: theme.colors.successSoft,
  },

  badgeWarning: {
    backgroundColor: theme.colors.warningSoft,
  },

  badgeText: {
    ...theme.typography.label,
  },

  badgeTextSuccess: {
    color: theme.colors.success,
  },

  badgeTextWarning: {
    color: theme.colors.warning,
  },

  deviceUuid: {
    marginTop: theme.spacing.xs,
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.textSecondary,
  },

  historyHeader: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },

  historyIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: theme.colors.surfaceMuted,
  },

  historyMain: {
    flex: 1,
  },

  historyTitle: {
    ...theme.typography.bodyStrong,
    color: theme.colors.text,
  },

  historyText: {
    marginTop: 2,
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },

  pendingBox: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },

  pendingTitle: {
    ...theme.typography.bodySmallStrong,
    color: theme.colors.text,
  },

  pendingText: {
    marginTop: theme.spacing.xs,
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },

  securityNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xxl,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.infoSoft,
  },

  securityNoteText: {
    flex: 1,
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
});
