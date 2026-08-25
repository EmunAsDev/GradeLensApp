import { Tabs } from "expo-router";

import { Pressable, StyleSheet, Text, View } from "react-native";

function ScanTabButton(props: any) {
  const { onPress, accessibilityState } = props;

  const selected = accessibilityState?.selected;

  return (
    <View style={styles.scanButtonWrapper}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.scanButton,

          selected && styles.scanButtonActive,

          pressed && {
            opacity: 0.85,
          },
        ]}
      >
        <View style={styles.scanIcon}>
          <Text style={styles.scanIconText}>⌾</Text>
        </View>
      </Pressable>

      <Text style={[styles.scanLabel, selected && styles.scanLabelActive]}>
        Scan
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarActiveTintColor: "#a40c0c",

        tabBarInactiveTintColor: "#6b7280",

        tabBarStyle: {
          height: 70,

          paddingTop: 7,

          paddingBottom: 8,

          backgroundColor: "#ffffff",

          borderTopWidth: 1,

          borderTopColor: "#e5e7eb",
        },

        tabBarLabelStyle: {
          fontSize: 11,

          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",

          tabBarIcon: ({ color }) => (
            <Text
              style={{
                fontSize: 20,

                color,
              }}
            >
              ⌂
            </Text>
          ),
        }}
      />

      <Tabs.Screen
        name="courses"
        options={{
          title: "Courses",

          tabBarIcon: ({ color }) => (
            <Text
              style={{
                fontSize: 19,

                color,
              }}
            >
              ▤
            </Text>
          ),
        }}
      />

      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",

          tabBarButton: ScanTabButton,
        }}
      />

      <Tabs.Screen
        name="batch"
        options={{
          title: "Batch",

          tabBarIcon: ({ color }) => (
            <Text
              style={{
                fontSize: 19,

                color,
              }}
            >
              ⇅
            </Text>
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",

          tabBarIcon: ({ color }) => (
            <Text
              style={{
                fontSize: 19,

                color,
              }}
            >
              ⚙
            </Text>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scanButtonWrapper: {
    flex: 1,

    alignItems: "center",

    justifyContent: "flex-start",

    marginTop: -25,
  },

  scanButton: {
    width: 62,

    height: 62,

    borderRadius: 31,

    alignItems: "center",

    justifyContent: "center",

    borderWidth: 5,

    borderColor: "#ffffff",

    backgroundColor: "#a40c0c",

    shadowColor: "#000000",

    shadowOffset: {
      width: 0,

      height: 4,
    },

    shadowOpacity: 0.2,

    shadowRadius: 5,

    elevation: 8,
  },

  scanButtonActive: {
    backgroundColor: "#8d0a0a",
  },

  scanIcon: {
    alignItems: "center",

    justifyContent: "center",
  },

  scanIconText: {
    fontSize: 30,

    fontWeight: "700",

    color: "#ffffff",
  },

  scanLabel: {
    marginTop: 2,

    fontSize: 11,

    fontWeight: "600",

    color: "#6b7280",
  },

  scanLabelActive: {
    color: "#a40c0c",
  },
});
