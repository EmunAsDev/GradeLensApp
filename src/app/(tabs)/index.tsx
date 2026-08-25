import { StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";

export default function HomeScreen() {
  const { employee } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>GradeLens</Text>

      <Text style={styles.welcome}>Welcome, {employee?.firstname}.</Text>

      <Text style={styles.description}>
        Your synchronized courses and examination data are available from this
        device.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,

    paddingHorizontal: 24,

    paddingTop: 70,

    backgroundColor: "#ffffff",
  },

  brand: {
    fontSize: 30,

    fontWeight: "700",

    color: "#a40c0c",
  },

  welcome: {
    marginTop: 26,

    fontSize: 22,

    fontWeight: "700",

    color: "#111827",
  },

  description: {
    marginTop: 8,

    maxWidth: 340,

    fontSize: 14,

    lineHeight: 21,

    color: "#6b7280",
  },
});
