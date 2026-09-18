import { router, Tabs } from "expo-router";

import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppTabIcon } from "@/../components/navigation/AppTabIcon";
import { isCompactWidth, theme } from "@/../theme";

function TabButton(props: any) {
  const {
    children,
    onPress,
    onLongPress,
    accessibilityLabel,
    accessibilityState,
    testID,
    style,
  } = props;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={null}
      style={({ pressed }) => [
        style,
        styles.tabButton,
        pressed && styles.tabButtonPressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

function ScanTabButton(
  props: any & {
    compact: boolean;
  },
) {
  const { onLongPress, accessibilityState, compact } = props;

  const size = compact
    ? theme.layout.tabBar.scanButtonSizeCompact
    : theme.layout.tabBar.scanButtonSize;

  const offset = compact
    ? theme.layout.tabBar.scanButtonOffsetCompact
    : theme.layout.tabBar.scanButtonOffset;

  return (
    <View style={styles.scanSlot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan answer sheets"
        accessibilityState={accessibilityState}
        onPress={() => router.push("/scan-camera")}
        onLongPress={onLongPress}
        android_ripple={null}
        style={({ pressed }) => [
          styles.scanButton,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            marginTop: offset,
          },
          pressed && styles.scanButtonPressed,
        ]}
      >
        <View style={styles.scanIcon}>
          <AppTabIcon
            icon="scan"
            color={theme.colors.textInverse}
            focused
            size={
              compact
                ? theme.layout.tabBar.scanIconSizeCompact
                : theme.layout.tabBar.scanIconSize
            }
          />
        </View>
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const compact = isCompactWidth(width);

  const baseHeight = compact
    ? theme.layout.tabBar.heightCompact
    : theme.layout.tabBar.height;

  const iconSize = compact
    ? theme.layout.tabBar.iconSizeCompact
    : theme.layout.tabBar.iconSize;

  const labelSize = compact
    ? theme.layout.tabBar.labelSizeCompact
    : theme.layout.tabBar.labelSize;

  const bottomInset = Math.max(insets.bottom, compact ? 4 : theme.spacing.sm);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,

        tabBarHideOnKeyboard: true,

        tabBarButton: (props) => <TabButton {...props} />,

        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFill}>
            <View
              style={[
                styles.systemNavigationDivider,
                {
                  bottom: bottomInset,
                },
              ]}
            />
          </View>
        ),

        tabBarStyle: {
          height: baseHeight + bottomInset,

          paddingTop: compact ? 6 : 8,
          paddingBottom: bottomInset,

          backgroundColor: theme.colors.surface,

          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,

          elevation: 6,

          shadowColor: "#000000",
          shadowOffset: {
            width: 0,
            height: -2,
          },
          shadowOpacity: 0.06,
          shadowRadius: 6,

          overflow: "visible",
        },

        // ...
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <AppTabIcon
              icon="home"
              color={color as string}
              focused={focused}
              size={iconSize}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="courses"
        options={{
          title: "Courses",
          tabBarIcon: ({ color, focused }) => (
            <AppTabIcon
              icon="courses"
              color={color as string}
              focused={focused}
              size={iconSize}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarLabel: () => null,
          tabBarButton: (props) => (
            <ScanTabButton {...props} compact={compact} />
          ),
        }}
      />

      <Tabs.Screen
        name="batch"
        options={{
          title: "Batch",
          tabBarIcon: ({ color, focused }) => (
            <AppTabIcon
              icon="batch"
              color={color as string}
              focused={focused}
              size={iconSize}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) => (
            <AppTabIcon
              icon="settings"
              color={color as string}
              focused={focused}
              size={iconSize}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabButton: {
    alignItems: "center",
    justifyContent: "center",
  },

  tabButtonPressed: {
    opacity: 0.7,
  },

  scanSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  scanButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },

  scanIcon: {
    transform: [{ translateX: 1 }],
  },

  scanButtonPressed: {
    backgroundColor: theme.colors.primaryPressed,
    transform: [{ scale: 0.96 }],
  },

  systemNavigationDivider: {
    position: "absolute",
    left: 0,
    right: 0,

    height: StyleSheet.hairlineWidth,

    backgroundColor: theme.colors.border,
  },
});
