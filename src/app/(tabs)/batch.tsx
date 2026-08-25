import { StyleSheet, Text, View } from "react-native";

export default function BatchScreen() {
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
        <SummaryCard label="Pending" value={0} />

        <SummaryCard label="Synced" value={0} />

        <SummaryCard label="Failed" value={0} />
      </View>

      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>No Scanned Submissions</Text>

        <Text style={styles.emptyText}>
          Answer sheets scanned with GradeLens will appear here before they are
          synchronized with the Laravel server.
        </Text>
      </View>
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
});
