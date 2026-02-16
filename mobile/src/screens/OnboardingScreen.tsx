import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  getAuthSession,
  getVerificationStatus,
  postLogin,
  postRegister,
  postVerificationSubmit,
  uploadImageBase64,
  type ApiUser,
  type VerificationStatus
} from "../api";
import { theme } from "../theme";

interface OnboardingScreenProps {
  currentUser: ApiUser | null;
  onSignedIn: (token: string, user: ApiUser, verification: VerificationStatus) => void;
  onSignedOut: () => void;
  onVerificationUpdated: (verification: VerificationStatus) => void;
}

export function OnboardingScreen({
  currentUser,
  onSignedIn,
  onSignedOut,
  onVerificationUpdated
}: OnboardingScreenProps) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [selfieUri, setSelfieUri] = useState("");
  const [licenseUri, setLicenseUri] = useState("");
  const [idType, setIdType] = useState("drivers_license");
  const [selfieBase64, setSelfieBase64] = useState("");
  const [selfieMime, setSelfieMime] = useState<string | undefined>(undefined);
  const [licenseBase64, setLicenseBase64] = useState("");
  const [licenseMime, setLicenseMime] = useState<string | undefined>(undefined);

  const auth = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result =
        mode === "signup"
          ? await postRegister({
              email: email.trim(),
              username: username.trim().toLowerCase(),
              password
            })
          : await postLogin({
              username: username.trim().toLowerCase(),
              password
            });

      const session = await getAuthSession(result.token);
      onSignedIn(result.token, session.user, session.verification);
      setSuccess(mode === "signup" ? "Account created. Submit verification photos." : "Logged in.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async (kind: "selfie" | "license", source: "camera" | "library") => {
    setError(null);
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(source === "camera" ? "Camera permission is required." : "Photo library permission is required.");
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: "images",
            quality: 0.8,
            base64: true,
            cameraType: kind === "selfie" ? ImagePicker.CameraType.front : ImagePicker.CameraType.back
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: "images",
            quality: 0.8,
            base64: true
          });
    if (result.canceled) {
      return;
    }
    const asset = result.assets[0];
    const uri = asset?.uri ?? "";
    const b64 = asset?.base64 ?? "";
    if (!uri || !b64) {
      return;
    }
    if (kind === "selfie") {
      setSelfieUri(uri);
      setSelfieBase64(b64);
      setSelfieMime(asset?.mimeType ?? "image/jpeg");
    } else {
      setLicenseUri(uri);
      setLicenseBase64(b64);
      setLicenseMime(asset?.mimeType ?? "image/jpeg");
    }
  };

  const submitVerification = async () => {
    if (!currentUser) {
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const uploadedSelfie = await uploadImageBase64(selfieBase64, selfieMime, `selfie_${currentUser.id}`);
      const uploadedLicense = await uploadImageBase64(licenseBase64, licenseMime, `license_${currentUser.id}`);
      await postVerificationSubmit(currentUser.id, uploadedLicense.url, uploadedSelfie.url, idType);
      const next = await getVerificationStatus(currentUser.id);
      onVerificationUpdated(next);
      setSuccess("Verification submitted. Wait for admin approval.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = useMemo(() => {
    if (!currentUser) {
      return null;
    }
    return currentUser.verified ? "Approved" : "Pending/Not submitted";
  }, [currentUser]);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>{currentUser ? "Verification Required" : "Create or Sign In"}</Text>
        {currentUser ? <Text style={styles.sub}>Signed in as @{currentUser.username}</Text> : null}
        {statusLabel ? <Text style={styles.status}>Status: {statusLabel}</Text> : null}
      </View>

      {!currentUser ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <Pressable
              style={[styles.switchBtn, mode === "signup" && styles.switchBtnActive]}
              onPress={() => setMode("signup")}
            >
              <Text style={[styles.switchText, mode === "signup" && styles.switchTextActive]}>Sign Up</Text>
            </Pressable>
            <Pressable
              style={[styles.switchBtn, mode === "login" && styles.switchBtnActive]}
              onPress={() => setMode("login")}
            >
              <Text style={[styles.switchText, mode === "login" && styles.switchTextActive]}>Log In</Text>
            </Pressable>
          </View>

          {mode === "signup" ? (
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              autoCapitalize="none"
              placeholderTextColor={theme.colors.muted}
            />
          ) : null}
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            autoCapitalize="none"
            placeholderTextColor={theme.colors.muted}
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor={theme.colors.muted}
          />
          <Pressable style={styles.btn} onPress={() => void auth()} disabled={loading}>
            <Text style={styles.btnText}>{mode === "signup" ? "Create Account" : "Log In"}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.section}>Take Verification Photos</Text>
          <View style={styles.row}>
            <Pressable style={styles.btnFlex} onPress={() => void pickImage("selfie", "camera")}>
              <Text style={styles.btnText}>{selfieUri ? "Retake Selfie" : "Take Selfie"}</Text>
            </Pressable>
            <Pressable style={styles.btnFlex} onPress={() => void pickImage("selfie", "library")}>
              <Text style={styles.btnText}>From Library</Text>
            </Pressable>
          </View>
          <Text style={styles.helper}>{selfieUri || "No selfie captured yet."}</Text>

          <View style={styles.row}>
            <Pressable style={styles.btnFlex} onPress={() => void pickImage("license", "camera")}>
              <Text style={styles.btnText}>{licenseUri ? "Retake License Photo" : "Take Driver License Photo"}</Text>
            </Pressable>
            <Pressable style={styles.btnFlex} onPress={() => void pickImage("license", "library")}>
              <Text style={styles.btnText}>From Library</Text>
            </Pressable>
          </View>
          <Text style={styles.helper}>{licenseUri || "No ID captured yet."}</Text>

          <TextInput
            style={styles.input}
            value={idType}
            onChangeText={setIdType}
            placeholder="ID type"
            placeholderTextColor={theme.colors.muted}
          />
          <Pressable
            style={styles.btn}
            onPress={() => void submitVerification()}
            disabled={loading || !selfieUri || !licenseUri}
          >
            <Text style={styles.btnText}>Submit Verification</Text>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={onSignedOut}>
            <Text style={styles.ghostText}>Sign Out</Text>
          </Pressable>
        </View>
      )}

      {success ? <Text style={styles.success}>{success}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    paddingBottom: 16
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 16,
    gap: 10
  },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: "800"
  },
  sub: {
    color: theme.colors.muted
  },
  status: {
    color: theme.colors.primary,
    fontWeight: "700"
  },
  section: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "700"
  },
  row: {
    flexDirection: "row",
    gap: 8
  },
  switchBtn: {
    flex: 1,
    backgroundColor: "#EFE8F8",
    borderRadius: theme.radius.sm,
    alignItems: "center",
    paddingVertical: 10
  },
  switchBtnActive: {
    backgroundColor: theme.colors.primary
  },
  switchText: {
    color: theme.colors.primary,
    fontWeight: "700"
  },
  switchTextActive: {
    color: "#fff"
  },
  input: {
    backgroundColor: "#F2ECF8",
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text
  },
  helper: {
    color: theme.colors.muted,
    fontSize: 12
  },
  btn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    paddingVertical: 10
  },
  btnFlex: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    paddingVertical: 10
  },
  btnText: {
    color: "#fff",
    fontWeight: "700"
  },
  ghostBtn: {
    backgroundColor: "#EDE7F6",
    borderRadius: theme.radius.sm,
    alignItems: "center",
    paddingVertical: 10
  },
  ghostText: {
    color: theme.colors.primary,
    fontWeight: "700"
  },
  success: {
    color: "#087F5B",
    fontWeight: "700",
    textAlign: "center"
  },
  error: {
    color: "#B42318",
    fontWeight: "700",
    textAlign: "center"
  }
});
