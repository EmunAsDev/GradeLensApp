import { useEffect, useState } from "react";

import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { router } from "expo-router";

import { ApiError } from "../api/client";

import { useAuth } from "../auth/AuthContext";

export default function LoginScreen() {
  const { login, isAuthenticated } = useAuth();

  const [username, setUsername] = useState("");

  const [password, setPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated]);

  const handleLogin = async () => {
    const cleanUsername = username.trim();

    if (!cleanUsername || !password) {
      Alert.alert("Login", "Enter your username and password.");

      return;
    }

    setIsSubmitting(true);

    try {
      await login(cleanUsername, password);

      router.replace("/(tabs)");
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
        "GradeLens could not reach the server. An internet connection is required for the first login.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <View style={styles.brand}>
          <Text style={styles.title}>GradeLens</Text>

          <Text style={styles.subtitle}>Faculty Login</Text>
        </View>

        <View style={styles.form}>
          <View>
            <Text style={styles.label}>Username</Text>

            <TextInput
              value={username}
              onChangeText={setUsername}
              style={styles.input}
              placeholder="Enter username"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
              returnKeyType="next"
            />
          </View>

          <View>
            <Text style={styles.label}>Password</Text>

            <TextInput
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              placeholder="Enter password"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </View>

          <Pressable
            onPress={handleLogin}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.loginButton,

              pressed && !isSubmitting && styles.loginButtonPressed,

              isSubmitting && styles.loginButtonDisabled,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,

    backgroundColor: "#ffffff",
  },

  content: {
    flex: 1,

    justifyContent: "center",

    paddingHorizontal: 28,
  },

  brand: {
    marginBottom: 36,
  },

  title: {
    fontSize: 32,

    fontWeight: "700",

    color: "#a40c0c",
  },

  subtitle: {
    marginTop: 4,

    fontSize: 16,

    color: "#6b7280",
  },

  form: {
    gap: 18,
  },

  label: {
    marginBottom: 7,

    fontSize: 14,

    fontWeight: "600",

    color: "#111827",
  },

  input: {
    height: 50,

    paddingHorizontal: 14,

    borderWidth: 1,

    borderColor: "#d1d5db",

    borderRadius: 8,

    fontSize: 16,

    backgroundColor: "#ffffff",

    color: "#111827",
  },

  loginButton: {
    height: 50,

    alignItems: "center",

    justifyContent: "center",

    marginTop: 8,

    borderRadius: 8,

    backgroundColor: "#a40c0c",
  },

  loginButtonPressed: {
    opacity: 0.85,
  },

  loginButtonDisabled: {
    opacity: 0.65,
  },

  loginButtonText: {
    fontSize: 16,

    fontWeight: "600",

    color: "#ffffff",
  },
});
