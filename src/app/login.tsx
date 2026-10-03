import { useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { router } from "expo-router";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError } from "../api/client";

import { useAuth } from "../auth/AuthContext";

import { useOnboarding } from "../onboarding/OnboardingContext";

import { theme } from "@/../theme";

import { AppIcon } from "@/../components/icons/AppIcon";

export default function LoginScreen() {
  const { login, isAuthenticated } = useAuth();

  const { hasCompletedOnboarding, isLoading: isOnboardingLoading } =
    useOnboarding();

  const { height } = useWindowDimensions();

  const insets = useSafeAreaInsets();

  const [username, setUsername] = useState("");

  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  /*
   * --------------------------------------------------------------------------
   * Splash -> Login Brand Transition
   * --------------------------------------------------------------------------
   *
   * Final position:
   * Logo + GradeLens stay slightly above the login form.
   *
   * Starting position:
   * The brand begins around the middle of the screen, matching the splash.
   */
  const finalBrandTop = Math.max(insets.top + 72, height * 0.195);

  /*
   * Approximate center position of the splash branding.
   */
  const splashBrandTop = height * 0.46;

  /*
   * Since brandContainer already sits at finalBrandTop,
   * translate it downward initially so it appears near the
   * old splash position.
   */
  const initialBrandTranslateY = Math.max(0, splashBrandTop - finalBrandTop);

  const brandTranslateY = useRef(
    new Animated.Value(initialBrandTranslateY),
  ).current;

  const formOpacity = useRef(new Animated.Value(0)).current;

  const formTranslateY = useRef(new Animated.Value(12)).current;

  /*
   * --------------------------------------------------------------------------
   * Run Login Entrance
   * --------------------------------------------------------------------------
   */
  useEffect(() => {
    /*
     * Logo moves first.
     */
    Animated.timing(brandTranslateY, {
      toValue: 0,

      duration: 520,

      useNativeDriver: true,
    }).start();

    /*
     * Login form appears shortly after the logo begins moving.
     */
    const formTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(formOpacity, {
          toValue: 1,

          duration: 320,

          useNativeDriver: true,
        }),

        Animated.timing(formTranslateY, {
          toValue: 0,

          duration: 320,

          useNativeDriver: true,
        }),
      ]).start();
    }, 180);

    return () => {
      clearTimeout(formTimer);
    };
  }, [brandTranslateY, formOpacity, formTranslateY]);

  /*
   * --------------------------------------------------------------------------
   * Post-login Routing
   * --------------------------------------------------------------------------
   */
  useEffect(() => {
    if (!isAuthenticated || isOnboardingLoading) {
      return;
    }

    router.replace(hasCompletedOnboarding ? "/(tabs)" : "/onboarding");
  }, [hasCompletedOnboarding, isAuthenticated, isOnboardingLoading]);

  /*
   * --------------------------------------------------------------------------
   * Login
   * --------------------------------------------------------------------------
   */
  const handleLogin = async () => {
    const cleanUsername = username.trim();

    if (!cleanUsername || !password) {
      Alert.alert("Login", "Enter your username and password.");

      return;
    }

    setIsSubmitting(true);

    try {
      await login(cleanUsername, password);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 422) {
          Alert.alert("Login Failed", "The username or password is incorrect.");

          return;
        }

        if (error.status === 403) {
          Alert.alert("Account Inactive", error.message);

          return;
        }

        Alert.alert("Login Failed", error.message);

        return;
      }

      Alert.alert(
        "Unable to Connect",
        "GradeLens could not reach the server. Check your internet connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/*
       * ----------------------------------------------------------------------
       * GradeLens Brand
       * ----------------------------------------------------------------------
       *
       * It starts around the splash-screen center and moves upward.
       */}
      <Animated.View
        style={[
          styles.brandContainer,

          {
            top: finalBrandTop,

            transform: [
              {
                translateY: brandTranslateY,
              },
            ],
          },
        ]}
      >
        <View style={styles.brandRow}>
          <Animated.Image
            source={require("../../assets/images/gradelenslogov2.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.brandName}>GradeLens</Text>
        </View>
      </Animated.View>

      {/*
       * ----------------------------------------------------------------------
       * Centered Login Form
       * ----------------------------------------------------------------------
       */}
      <View style={styles.formCenter}>
        <Animated.View
          style={[
            styles.formContainer,

            {
              opacity: formOpacity,

              transform: [
                {
                  translateY: formTranslateY,
                },
              ],
            },
          ]}
        >
          <Text style={styles.loginTitle}>Login to your account</Text>

          {/*
           * Username
           */}
          <View style={styles.field}>
            <Text style={styles.label}>Username</Text>

            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="Enter your username"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
              returnKeyType="next"
            />
          </View>

          {/*
           * Password
           */}
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>

            <View style={styles.passwordInputContainer}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.passwordInput}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isSubmitting}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword ? "Hide password" : "Show password"
                }
                accessibilityState={{
                  expanded: showPassword,
                }}
                hitSlop={8}
                disabled={isSubmitting}
                onPress={() => {
                  setShowPassword((current) => !current);
                }}
                style={({ pressed }) => [
                  styles.passwordToggle,

                  pressed && styles.passwordTogglePressed,
                ]}
              >
                <AppIcon
                  name={showPassword ? "visibilityOff" : "visibility"}
                  size={22}
                  color={theme.colors.textMuted}
                />
              </Pressable>
            </View>
          </View>

          {/*
           * Login Button
           */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Login"
            disabled={isSubmitting}
            onPress={handleLogin}
            style={({ pressed }) => [
              styles.loginButton,

              pressed && !isSubmitting && styles.loginButtonPressed,

              isSubmitting && styles.loginButtonDisabled,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </Pressable>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  /*
   * ------------------------------------------------------------------------
   * Screen
   * ------------------------------------------------------------------------
   */
  screen: {
    flex: 1,

    backgroundColor: "#FFFFFF",
  },

  /*
   * ------------------------------------------------------------------------
   * Brand
   * ------------------------------------------------------------------------
   *
   * Absolute positioning lets the form remain truly centered,
   * independently of the logo.
   */
  brandContainer: {
    position: "absolute",

    left: 0,
    right: 0,

    zIndex: 2,

    alignItems: "center",
  },

  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
  },

  logo: {
    width: 56,
    height: 56,
  },

  brandName: {
    ...theme.typography.display,
    color: theme.colors.primary,
    fontWeight: "700",
  },

  /*
   * ------------------------------------------------------------------------
   * Form Center
   * ------------------------------------------------------------------------
   *
   * This is the important part:
   *
   * the form is centered using the whole screen,
   * not pushed downward by the branding.
   */
  formCenter: {
    flex: 1,

    alignItems: "center",

    justifyContent: "center",

    paddingHorizontal: theme.spacing.xxl,

    paddingTop: 80,
  },

  formContainer: {
    width: "100%",

    maxWidth: 420,
  },

  loginTitle: {
    marginBottom: theme.spacing.xxl,

    fontSize: 22,

    lineHeight: 28,

    fontWeight: "600",

    color: theme.colors.text,

    textAlign: "center",
  },

  /*
   * ------------------------------------------------------------------------
   * Fields
   * ------------------------------------------------------------------------
   */
  field: {
    width: "100%",

    marginBottom: theme.spacing.xl,
  },

  label: {
    marginBottom: theme.spacing.sm,

    ...theme.typography.label,

    color: theme.colors.textSecondary,
  },

  passwordInputContainer: {
    width: "100%",

    height: theme.layout.controls.inputHeight,

    flexDirection: "row",

    alignItems: "center",

    borderWidth: 1,

    borderColor: theme.colors.border,

    borderRadius: theme.radius.md,

    backgroundColor: theme.colors.surface,
  },

  passwordInput: {
    flex: 1,

    height: "100%",

    paddingLeft: theme.spacing.lg,

    paddingRight: theme.spacing.sm,

    ...theme.typography.body,

    color: theme.colors.text,
  },

  passwordToggle: {
    width: 48,

    height: 48,

    alignItems: "center",

    justifyContent: "center",

    borderRadius: theme.radius.md,
  },

  passwordTogglePressed: {
    opacity: 0.55,
  },

  input: {
    width: "100%",

    height: theme.layout.controls.inputHeight,

    paddingHorizontal: theme.spacing.lg,

    borderWidth: 1,

    borderColor: theme.colors.border,

    borderRadius: theme.radius.md,

    backgroundColor: theme.colors.surface,

    ...theme.typography.body,

    color: theme.colors.text,
  },
  /*
   * ------------------------------------------------------------------------
   * Login Button
   * ------------------------------------------------------------------------
   */
  loginButton: {
    width: "100%",

    height: theme.layout.controls.buttonHeight,

    alignItems: "center",

    justifyContent: "center",

    marginTop: theme.spacing.sm,

    borderRadius: theme.radius.md,

    backgroundColor: theme.colors.primary,
  },

  loginButtonPressed: {
    backgroundColor: theme.colors.primaryPressed,
  },

  loginButtonDisabled: {
    opacity: 0.6,
  },

  loginButtonText: {
    ...theme.typography.button,

    color: "#FFFFFF",
  },
});
