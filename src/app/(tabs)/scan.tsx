import { useRef, useState } from "react";

import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { CameraView, useCameraPermissions } from "expo-camera";

export default function ScanScreen() {
  const cameraRef = useRef<CameraView | null>(null);

  const [permission, requestPermission] = useCameraPermissions();

  const [isCapturing, setIsCapturing] = useState(false);

  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);

  /*
    |--------------------------------------------------------------------------
    | Permission Loading
    |--------------------------------------------------------------------------
    */

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />

        <Text style={styles.loadingText}>Preparing camera...</Text>
      </View>
    );
  }

  /*
    |--------------------------------------------------------------------------
    | Permission Required
    |--------------------------------------------------------------------------
    */

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>

        <Text style={styles.permissionText}>
          GradeLens needs camera access to scan answer sheets.
        </Text>

        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Allow Camera</Text>
        </Pressable>
      </View>
    );
  }

  /*
    |--------------------------------------------------------------------------
    | Captured Image Preview
    |--------------------------------------------------------------------------
    */

  if (capturedImageUri) {
    return (
      <View style={styles.container}>
        <Image
          source={{
            uri: capturedImageUri,
          }}
          style={styles.previewImage}
          resizeMode="contain"
        />

        <View style={styles.previewControls}>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              setCapturedImageUri(null);
            }}
          >
            <Text style={styles.secondaryButtonText}>Retake</Text>
          </Pressable>

          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              Alert.alert(
                "Capture Ready",
                "The answer sheet image is ready for the next processing stage.",
              );
            }}
          >
            <Text style={styles.primaryButtonText}>Use Photo</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /*
    |--------------------------------------------------------------------------
    | Capture
    |--------------------------------------------------------------------------
    */

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) {
      return;
    }

    setIsCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,

        skipProcessing: false,
      });

      if (!photo?.uri) {
        throw new Error("Camera did not return an image.");
      }

      setCapturedImageUri(photo.uri);
    } catch (error) {
      console.error("Camera capture failed:", error);

      Alert.alert(
        "Capture Failed",
        "GradeLens could not capture the answer sheet. Please try again.",
      );
    } finally {
      setIsCapturing(false);
    }
  };

  /*
    |--------------------------------------------------------------------------
    | Camera
    |--------------------------------------------------------------------------
    */

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        animateShutter={true}
      >
        <View style={styles.overlay}>
          <View style={styles.topInstruction}>
            <Text style={styles.instructionTitle}>Scan Answer Sheet</Text>

            <Text style={styles.instructionText}>
              Place the whole sheet inside the guide.
            </Text>
          </View>

          <View style={styles.sheetGuide}>
            <View style={[styles.corner, styles.topLeft]} />

            <View style={[styles.corner, styles.topRight]} />

            <View style={[styles.corner, styles.bottomLeft]} />

            <View style={[styles.corner, styles.bottomRight]} />
          </View>

          <View style={styles.captureArea}>
            <Pressable
              disabled={isCapturing}
              onPress={handleCapture}
              style={({ pressed }) => [
                styles.captureOuter,

                pressed &&
                  !isCapturing && {
                    opacity: 0.75,
                  },
              ]}
            >
              <View style={styles.captureInner}>
                {isCapturing && <ActivityIndicator />}
              </View>
            </Pressable>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,

    backgroundColor: "#000000",
  },

  camera: {
    flex: 1,
  },

  overlay: {
    flex: 1,

    justifyContent: "space-between",

    paddingTop: 48,

    paddingBottom: 36,

    paddingHorizontal: 22,
  },

  topInstruction: {
    alignItems: "center",

    paddingHorizontal: 18,

    paddingVertical: 12,

    borderRadius: 12,

    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },

  instructionTitle: {
    fontSize: 18,

    fontWeight: "700",

    color: "#ffffff",
  },

  instructionText: {
    marginTop: 4,

    fontSize: 13,

    textAlign: "center",

    color: "#e5e7eb",
  },

  sheetGuide: {
    alignSelf: "center",

    width: "86%",

    aspectRatio: 0.72,

    position: "relative",
  },

  corner: {
    position: "absolute",

    width: 34,

    height: 34,

    borderColor: "#f2c231",
  },

  topLeft: {
    top: 0,

    left: 0,

    borderTopWidth: 4,

    borderLeftWidth: 4,
  },

  topRight: {
    top: 0,

    right: 0,

    borderTopWidth: 4,

    borderRightWidth: 4,
  },

  bottomLeft: {
    bottom: 0,

    left: 0,

    borderBottomWidth: 4,

    borderLeftWidth: 4,
  },

  bottomRight: {
    bottom: 0,

    right: 0,

    borderBottomWidth: 4,

    borderRightWidth: 4,
  },

  captureArea: {
    alignItems: "center",

    justifyContent: "center",
  },

  captureOuter: {
    width: 78,

    height: 78,

    borderRadius: 39,

    borderWidth: 5,

    borderColor: "#ffffff",

    alignItems: "center",

    justifyContent: "center",
  },

  captureInner: {
    width: 58,

    height: 58,

    borderRadius: 29,

    backgroundColor: "#a40c0c",

    alignItems: "center",

    justifyContent: "center",
  },

  previewImage: {
    flex: 1,

    width: "100%",

    backgroundColor: "#000000",
  },

  previewControls: {
    flexDirection: "row",

    gap: 12,

    padding: 18,

    backgroundColor: "#ffffff",
  },

  primaryButton: {
    flex: 1,

    minHeight: 50,

    alignItems: "center",

    justifyContent: "center",

    borderRadius: 10,

    backgroundColor: "#a40c0c",
  },

  primaryButtonText: {
    fontSize: 15,

    fontWeight: "700",

    color: "#ffffff",
  },

  secondaryButton: {
    flex: 1,

    minHeight: 50,

    alignItems: "center",

    justifyContent: "center",

    borderWidth: 1,

    borderColor: "#d1d5db",

    borderRadius: 10,

    backgroundColor: "#ffffff",
  },

  secondaryButtonText: {
    fontSize: 15,

    fontWeight: "700",

    color: "#374151",
  },

  center: {
    flex: 1,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "#ffffff",
  },

  loadingText: {
    marginTop: 10,

    color: "#6b7280",
  },

  permissionContainer: {
    flex: 1,

    paddingHorizontal: 32,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "#ffffff",
  },

  permissionTitle: {
    fontSize: 22,

    fontWeight: "700",

    color: "#111827",
  },

  permissionText: {
    marginTop: 10,

    textAlign: "center",

    lineHeight: 21,

    color: "#6b7280",
  },

  permissionButton: {
    marginTop: 22,

    minWidth: 180,

    minHeight: 48,

    paddingHorizontal: 20,

    alignItems: "center",

    justifyContent: "center",

    borderRadius: 10,

    backgroundColor: "#a40c0c",
  },

  permissionButtonText: {
    fontSize: 15,

    fontWeight: "700",

    color: "#ffffff",
  },
});
