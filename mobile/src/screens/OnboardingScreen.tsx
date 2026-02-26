import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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

const POLICY_VERSION = "v1.0";
const TERMS_TEXT = `Vicino Terms of Service (Draft)

1) Eligibility
- You must be 18+ to use Vicino.
- You must provide accurate information and complete identity verification.

2) Safety and Conduct
- Harassment, threats, hate, impersonation, and fraud are prohibited.
- Do not solicit private home meetups through Vicino.
- Public-meetup safety rules must be followed.

3) Content and Moderation
- You are responsible for your profile content and messages.
- Vicino may review, remove content, suspend, or ban accounts for policy violations.

4) Liability
- You are responsible for your choices and in-person interactions.
- Vicino provides a platform and does not guarantee user behavior.

5) Enforcement
- Violations may lead to temporary or permanent bans.
- Appeals may be reviewed at Vicino's discretion.

By creating an account, you agree to these terms.`;

const PRIVACY_TEXT = `Vicino Privacy Policy (Draft)

What we collect:
- Account data (email, username, profile fields)
- Verification data (selfie/ID images)
- Location and distance preferences
- App activity (matches, messages, meetup decisions)

How we use data:
- Operate the app and safety workflows
- Fraud prevention, moderation, abuse prevention
- Product improvement and analytics

Sharing:
- We may use service providers (hosting, storage, analytics, verification tools).
- We do not sell personal data.

Retention:
- Data may be retained for legal, safety, and operational needs.

Your rights:
- You can request account/data deletion where applicable.

By creating an account, you acknowledge this policy.`;

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
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const [selfieUri, setSelfieUri] = useState("");
  const [licenseUri, setLicenseUri] = useState("");
  const [idType, setIdType] = useState("drivers_license");
  const [selfieBase64, setSelfieBase64] = useState("");
  const [selfieMime, setSelfieMime] = useState<string | undefined>(undefined);
  const [licenseBase64, setLicenseBase64] = useState("");
  const [licenseMime, setLicenseMime] = useState<string | undefined>(undefined);
  const [pickingImage, setPickingImage] = useState<null | "selfie_camera" | "selfie_library" | "license_camera" | "license_library">(null);

  const auth = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      if (mode === "signup" && (!acceptedTerms || !acceptedPrivacy)) {
        setError("You must accept Terms and Privacy Policy to create an account.");
        return;
      }
      const result =
        mode === "signup"
          ? await postRegister({
              email: email.trim(),
              username: username.trim().toLowerCase(),
              password,
              acceptedTerms: true,
              acceptedPrivacy: true,
              marketingConsent,
              policyVersion: POLICY_VERSION
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
    const actionKey = `${kind}_${source}` as "selfie_camera" | "selfie_library" | "license_camera" | "license_library";
    setPickingImage(actionKey);
    setError(null);
    try {
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
    } finally {
      setPickingImage(null);
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
          {mode === "signup" ? (
            <>
              <Pressable style={styles.consentRow} onPress={() => setAcceptedTerms((prev) => !prev)}>
                <View style={[styles.checkbox, acceptedTerms && styles.checkboxOn]}>
                  <Text style={styles.checkboxTick}>{acceptedTerms ? "✓" : ""}</Text>
                </View>
                <Text style={styles.consentText}>
                  I agree to{" "}
                  <Text style={styles.consentLink} onPress={() => setShowTerms(true)}>
                    Terms of Service
                  </Text>
                  .
                </Text>
              </Pressable>
              <Pressable style={styles.consentRow} onPress={() => setAcceptedPrivacy((prev) => !prev)}>
                <View style={[styles.checkbox, acceptedPrivacy && styles.checkboxOn]}>
                  <Text style={styles.checkboxTick}>{acceptedPrivacy ? "✓" : ""}</Text>
                </View>
                <Text style={styles.consentText}>
                  I agree to{" "}
                  <Text style={styles.consentLink} onPress={() => setShowPrivacy(true)}>
                    Privacy Policy
                  </Text>
                  .
                </Text>
              </Pressable>
              <Pressable style={styles.consentRow} onPress={() => setMarketingConsent((prev) => !prev)}>
                <View style={[styles.checkbox, marketingConsent && styles.checkboxOn]}>
                  <Text style={styles.checkboxTick}>{marketingConsent ? "✓" : ""}</Text>
                </View>
                <Text style={styles.consentText}>I agree to optional product updates and announcements.</Text>
              </Pressable>
              <Text style={styles.helper}>Policy version: {POLICY_VERSION}</Text>
            </>
          ) : null}
          <Pressable style={styles.btn} onPress={() => void auth()} disabled={loading}>
            <View style={styles.btnContent}>
              {loading ? <ActivityIndicator size="small" color="#fff" /> : null}
              <Text style={styles.btnText}>
                {loading ? (mode === "signup" ? "Creating..." : "Logging in...") : mode === "signup" ? "Create Account" : "Log In"}
              </Text>
            </View>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.section}>Take Verification Photos</Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.btnFlex, (loading || pickingImage !== null) && styles.btnDisabled]}
              onPress={() => void pickImage("selfie", "camera")}
              disabled={loading || pickingImage !== null}
            >
              <View style={styles.btnContent}>
                {pickingImage === "selfie_camera" ? <ActivityIndicator size="small" color="#fff" /> : null}
                <Text style={styles.btnText}>
                  {pickingImage === "selfie_camera" ? "Opening..." : selfieUri ? "Retake Selfie" : "Take Selfie"}
                </Text>
              </View>
            </Pressable>
            <Pressable
              style={[styles.btnFlex, (loading || pickingImage !== null) && styles.btnDisabled]}
              onPress={() => void pickImage("selfie", "library")}
              disabled={loading || pickingImage !== null}
            >
              <View style={styles.btnContent}>
                {pickingImage === "selfie_library" ? <ActivityIndicator size="small" color="#fff" /> : null}
                <Text style={styles.btnText}>{pickingImage === "selfie_library" ? "Opening..." : "From Library"}</Text>
              </View>
            </Pressable>
          </View>
          <Text style={styles.helper}>{selfieUri || "No selfie captured yet."}</Text>

          <View style={styles.row}>
            <Pressable
              style={[styles.btnFlex, (loading || pickingImage !== null) && styles.btnDisabled]}
              onPress={() => void pickImage("license", "camera")}
              disabled={loading || pickingImage !== null}
            >
              <View style={styles.btnContent}>
                {pickingImage === "license_camera" ? <ActivityIndicator size="small" color="#fff" /> : null}
                <Text style={styles.btnText}>
                  {pickingImage === "license_camera"
                    ? "Opening..."
                    : licenseUri
                      ? "Retake License Photo"
                      : "Take Driver License Photo"}
                </Text>
              </View>
            </Pressable>
            <Pressable
              style={[styles.btnFlex, (loading || pickingImage !== null) && styles.btnDisabled]}
              onPress={() => void pickImage("license", "library")}
              disabled={loading || pickingImage !== null}
            >
              <View style={styles.btnContent}>
                {pickingImage === "license_library" ? <ActivityIndicator size="small" color="#fff" /> : null}
                <Text style={styles.btnText}>{pickingImage === "license_library" ? "Opening..." : "From Library"}</Text>
              </View>
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
            style={[styles.btn, (loading || !selfieUri || !licenseUri) && styles.btnDisabled]}
            onPress={() => void submitVerification()}
            disabled={loading || !selfieUri || !licenseUri}
          >
            <View style={styles.btnContent}>
              {loading ? <ActivityIndicator size="small" color="#fff" /> : null}
              <Text style={styles.btnText}>{loading ? "Submitting..." : "Submit Verification"}</Text>
            </View>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={onSignedOut}>
            <Text style={styles.ghostText}>Sign Out</Text>
          </Pressable>
        </View>
      )}

      {success ? <Text style={styles.success}>{success}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {error ? (
        <Pressable
          style={styles.retryBtn}
          onPress={() => {
            if (!currentUser) {
              void auth();
              return;
            }
            if (selfieUri && licenseUri) {
              void submitVerification();
            }
          }}
          disabled={loading || (!!currentUser && (!selfieUri || !licenseUri))}
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
      ) : null}

      <Modal visible={showTerms} animationType="slide">
        <View style={styles.modalWrap}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Terms of Service</Text>
            <Pressable onPress={() => setShowTerms(false)}>
              <Text style={styles.modalClose}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.modalText}>{TERMS_TEXT}</Text>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showPrivacy} animationType="slide">
        <View style={styles.modalWrap}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Privacy Policy</Text>
            <Pressable onPress={() => setShowPrivacy(false)}>
              <Text style={styles.modalClose}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.modalText}>{PRIVACY_TEXT}</Text>
          </ScrollView>
        </View>
      </Modal>
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
  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#B7A1D8",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff"
  },
  checkboxOn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary
  },
  checkboxTick: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12
  },
  consentText: {
    color: theme.colors.text,
    flex: 1,
    lineHeight: 18
  },
  consentLink: {
    color: theme.colors.primary,
    fontWeight: "700"
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
  btnContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  btnDisabled: {
    opacity: 0.7
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
  },
  retryBtn: {
    alignSelf: "center",
    backgroundColor: "#F3ECFB",
    borderRadius: theme.radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  retryBtnText: {
    color: theme.colors.primary,
    fontWeight: "700"
  },
  modalWrap: {
    flex: 1,
    backgroundColor: theme.colors.background
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800"
  },
  modalClose: {
    color: theme.colors.primary,
    fontWeight: "700"
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingBottom: 24
  },
  modalText: {
    color: theme.colors.text,
    lineHeight: 20
  }
});
