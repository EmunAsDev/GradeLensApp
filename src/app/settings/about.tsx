import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/../components/icons/AppIcon";
import { theme } from "@/../theme";

export default function AboutGradeLensScreen() {
  const insets = useSafeAreaInsets();

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
          About GradeLens
        </Text>

        <View style={styles.detailHeaderSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.hero}>
          <View style={styles.heroLogoWrap}>
            <Image
              source={require("../../../assets/images/gradelenslogov2.png")}
              style={styles.heroLogo}
              resizeMode="contain"
              accessible
              accessibilityLabel="GradeLens logo"
            />
          </View>

          <Text style={styles.heroTitle}>GradeLens</Text>

          <Text style={styles.heroText}>
            A mobile-first paper assessment workflow for scanning OMR answer
            sheets, reviewing uncertain marks, working offline, and
            synchronizing finalized results with the GradeLens server.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>How GradeLens Works</Text>

        <FeatureCard
          icon="scan"
          eyebrow="CAPTURE"
          title="Scan paper assessments"
          description="Capture a GradeLens answer sheet with the phone camera. The app normalizes the paper, reads its QR identity, recognizes the student ID, and interprets the answer marks."
        />

        <FeatureCard
          icon="offline"
          eyebrow="OFFLINE"
          title="Keep working without internet"
          description="Courses, assigned tests, student rosters, answer-key packages, and local scans can remain available on the device after synchronization."
        />

        <FeatureCard
          icon="review"
          eyebrow="REVIEW"
          title="Clarify uncertain physical marks"
          description="When the OMR engine cannot confidently interpret a mark, the paper stays on the device for faculty review. The original machine evidence remains separate from the faculty-confirmed answer."
        />

        <FeatureCard
          icon="batch"
          eyebrow="BATCH"
          title="Organize scans before submission"
          description="Scanned papers are grouped into local batches. Ready papers can be submitted, review papers stay local until resolved, and retryable synchronization failures can be attempted again."
        />

        <FeatureCard
          icon="sync"
          eyebrow="SYNC"
          title="Synchronize authoritative results"
          description="The mobile score is tentative. When a batch is submitted, Laravel validates the evidence and recomputes the authoritative final score."
        />

        <Text style={styles.sectionTitle}>Important Behavior</Text>

        <View style={styles.infoCard}>
          <InfoItem
            title="Before synchronization"
            text="A local draft can be removed and the same physical sheet can be scanned again."
          />

          <View style={styles.divider} />

          <InfoItem
            title="After synchronization starts"
            text="The submitted evidence becomes immutable. Retries reuse the same stored evidence instead of replacing it."
          />

          <View style={styles.divider} />

          <InfoItem
            title="Invalid vs. Review"
            text="A known invalid marking is an understood rule violation and counts as zero. Review is reserved for marks GradeLens cannot reliably interpret."
          />
        </View>

        <Text style={styles.sectionTitle}>Privacy & Device Data</Text>

        <View style={styles.infoCard}>
          <InfoItem
            title="Secure credentials"
            text="Authentication and device cryptographic identity are stored separately from ordinary offline course and scan data."
          />

          <View style={styles.divider} />

          <InfoItem
            title="Offline continuity"
            text="Logging out removes the active authentication session while previously synchronized local data can remain on the device for the offline-first workflow."
          />
        </View>

        <Text style={styles.footer}>
          GradeLens · Paper assessment scanning, review, and synchronization
        </Text>
      </ScrollView>
    </View>
  );
}

function FeatureCard({
  icon,
  eyebrow,
  title,
  description,
}: {
  icon: "scan" | "offline" | "review" | "batch" | "sync";
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.featureCard}>
      <View style={styles.featureIcon}>
        <AppIcon name={icon} size={26} color={theme.colors.primary} />
      </View>

      <View style={styles.featureMain}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>

        <Text style={styles.featureTitle}>{title}</Text>

        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

function InfoItem({ title, text }: { title: string; text: string }) {
  return (
    <View>
      <Text style={styles.infoTitle}>{title}</Text>

      <Text style={styles.infoText}>{text}</Text>
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

  hero: {
    alignItems: "center",
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.primarySoft,
  },

  heroLogoWrap: {
    width: 92,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
  },

  heroLogo: {
    width: 84,
    height: 84,
  },

  heroTitle: {
    marginTop: theme.spacing.lg,
    ...theme.typography.screenTitle,
    color: theme.colors.text,
  },

  heroText: {
    marginTop: theme.spacing.sm,
    maxWidth: 420,
    textAlign: "center",
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },

  sectionTitle: {
    marginTop: theme.spacing.xxxl,
    marginBottom: theme.spacing.sm,
    ...theme.typography.sectionTitle,
    color: theme.colors.text,
  },

  featureCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  featureIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: theme.colors.primarySoft,
  },

  featureMain: {
    flex: 1,
  },

  eyebrow: {
    ...theme.typography.label,
    color: theme.colors.primary,
  },

  featureTitle: {
    marginTop: 2,
    ...theme.typography.cardTitle,
    color: theme.colors.text,
  },

  featureDescription: {
    marginTop: theme.spacing.xs,
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },

  infoCard: {
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.card,
  },

  infoTitle: {
    ...theme.typography.bodyStrong,
    color: theme.colors.text,
  },

  infoText: {
    marginTop: theme.spacing.xs,
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: theme.spacing.md,
    backgroundColor: theme.colors.divider,
  },

  footer: {
    marginTop: theme.spacing.xxxl,
    textAlign: "center",
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },
});
