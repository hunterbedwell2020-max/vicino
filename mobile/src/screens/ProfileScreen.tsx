import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { getUsers, postDistancePreference, postUserProfile, uploadImageBase64, type ApiUser } from "../api";
import { theme } from "../theme";

const PHOTO_SLOTS = 9;
const GENDER_OPTIONS = ["male", "female", "other"] as const;
type GenderOption = (typeof GENDER_OPTIONS)[number];
const normalizeGender = (value: string | null | undefined): GenderOption => {
  const next = (value ?? "other").toLowerCase();
  return (GENDER_OPTIONS as readonly string[]).includes(next) ? (next as GenderOption) : "other";
};

export function ProfileScreen({ userId, onSignOut }: { userId: string; onSignOut?: () => void }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [firstName, setFirstName] = useState("");
  const [gender, setGender] = useState<GenderOption>("other");
  const [preferredGender, setPreferredGender] = useState<GenderOption>("other");
  const [photos, setPhotos] = useState<string[]>(Array.from({ length: PHOTO_SLOTS }, () => ""));
  const [bio, setBio] = useState("");
  const [hobbies, setHobbies] = useState("");
  const [promptOne, setPromptOne] = useState("");
  const [promptTwo, setPromptTwo] = useState("");
  const [radiusMiles, setRadiusMiles] = useState(25);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingPhotoPayloads, setPendingPhotoPayloads] = useState<
    Record<string, { base64: string; mimeType?: string }>
  >({});

  const verificationLabel = useMemo(() => {
    if (!user) {
      return "Loading";
    }
    return user.verified ? "Verified" : "Not verified";
  }, [user]);

  const loadProfile = async () => {
    setError(null);
    try {
      const users = await getUsers();
      const me = users.find((u) => u.id === userId) ?? null;
      setUser(me);

      if (me) {
        setFirstName(me.firstName ?? "");
        setGender(normalizeGender(me.gender));
        setPreferredGender(normalizeGender(me.preferredGender));
        setPhotos(Array.from({ length: PHOTO_SLOTS }, (_, idx) => me.photos[idx] ?? ""));
        setBio(me.bio ?? "");
        setHobbies(Array.isArray(me.hobbies) ? me.hobbies.join(", ") : "");
        setPromptOne(me.promptOne ?? "");
        setPromptTwo(me.promptTwo ?? "");
        setRadiusMiles(Math.round(Number(me.maxDistanceMiles ?? 25)));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, [userId]);

  const adjustRadius = (delta: number) => {
    setRadiusMiles((prev) => Math.max(1, Math.min(150, prev + delta)));
  };

  const saveSettings = async () => {
    setStatusText(null);
    setError(null);

    try {
      const normalizedPhotos = photos.map((p) => p.trim()).filter((p) => p.length > 0);
      const finalPhotos: string[] = [];
      for (const photo of normalizedPhotos) {
        if (photo.startsWith("http://") || photo.startsWith("https://")) {
          finalPhotos.push(photo);
          continue;
        }
        const payload = pendingPhotoPayloads[photo];
        if (!payload?.base64) {
          continue;
        }
        const uploaded = await uploadImageBase64(payload.base64, payload.mimeType, `profile_${userId}`);
        finalPhotos.push(uploaded.url);
      }
      const normalizedHobbies = hobbies
        .split(",")
        .map((h) => h.trim())
        .filter((h) => h.length > 0);

      const updatedUser = await postUserProfile(userId, {
        firstName: firstName.trim() || undefined,
        gender,
        preferredGender,
        bio: bio.trim() || undefined,
        photos: finalPhotos.length > 0 ? finalPhotos : undefined,
        hobbies: normalizedHobbies.length > 0 ? normalizedHobbies : undefined,
        promptOne: promptOne.trim() || undefined,
        promptTwo: promptTwo.trim() || undefined
      });
      await postDistancePreference(userId, radiusMiles);
      setUser(updatedUser);
      setPhotos(Array.from({ length: PHOTO_SLOTS }, (_, idx) => updatedUser.photos[idx] ?? ""));
      setPendingPhotoPayloads({});
      setStatusText("Profile and settings saved.");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const profileCompleteness = useMemo(() => {
    const fields = [
      firstName.trim().length > 0,
      photos.filter((p) => p.trim().length > 0).length > 0,
      bio.trim().length > 0,
      hobbies.trim().length > 0,
      promptOne.trim().length > 0,
      promptTwo.trim().length > 0
    ];

    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }, [firstName, photos, bio, hobbies, promptOne, promptTwo]);

  const addPhotoFrom = async (source: "camera" | "library") => {
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
        ? await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.8, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.8, base64: true });
    if (result.canceled) {
      return;
    }
    const asset = result.assets[0];
    const uri = asset?.uri ?? "";
    const base64 = asset?.base64 ?? "";
    if (!uri || !base64) {
      return;
    }

    setPhotos((prev) => {
      const next = [...prev];
      const firstEmpty = next.findIndex((p) => !p.trim());
      if (firstEmpty >= 0) {
        next[firstEmpty] = uri;
      } else {
        next[next.length - 1] = uri;
      }
      return next;
    });
    setPendingPhotoPayloads((prev) => ({
      ...prev,
      [uri]: { base64, mimeType: asset?.mimeType ?? "image/jpeg" }
    }));
  };

  const removePhotoAt = (idx: number) => {
    const removed = photos[idx];
    setPhotos((prev) => {
      const next = [...prev];
      next[idx] = "";
      return next;
    });
    if (removed) {
      setPendingPhotoPayloads((payloads) => {
        const copy = { ...payloads };
        delete copy[removed];
        return copy;
      });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>Your Profile</Text>
        <Text style={styles.item}>Account: {user?.firstName ?? "User"}</Text>
        <Text style={styles.item}>Verification: {verificationLabel}</Text>
        <Text style={styles.item}>Profile completion: {profileCompleteness}%</Text>
        {onSignOut ? (
          <Pressable style={styles.signOutBtn} onPress={onSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Name</Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First name"
          placeholderTextColor={theme.colors.muted}
        />

        <Text style={styles.sectionTitle}>Gender</Text>
        <View style={styles.row}>
          {GENDER_OPTIONS.map((value) => (
            <Pressable
              key={`gender-${value}`}
              style={[styles.choiceBtn, gender === value && styles.choiceBtnActive]}
              onPress={() => setGender(value)}
            >
              <Text style={[styles.choiceText, gender === value && styles.choiceTextActive]}>{value}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Interested In</Text>
        <View style={styles.row}>
          {GENDER_OPTIONS.map((value) => (
            <Pressable
              key={`pref-${value}`}
              style={[styles.choiceBtn, preferredGender === value && styles.choiceBtnActive]}
              onPress={() => setPreferredGender(value)}
            >
              <Text style={[styles.choiceText, preferredGender === value && styles.choiceTextActive]}>{value}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Photos (up to 9)</Text>
        <Text style={styles.helper}>Use camera or camera roll. Photos upload when you save profile.</Text>
        <View style={styles.row}>
          <Pressable style={styles.photoBtn} onPress={() => void addPhotoFrom("camera")}>
            <Text style={styles.photoBtnText}>Take Photo</Text>
          </Pressable>
          <Pressable style={styles.photoBtn} onPress={() => void addPhotoFrom("library")}>
            <Text style={styles.photoBtnText}>From Library</Text>
          </Pressable>
        </View>
        {photos.map((value, idx) => (
          <View key={`photo-${idx}`} style={styles.photoSlot}>
            {value ? (
              <Image source={{ uri: value }} style={styles.photoPreview} resizeMode="cover" />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderText}>Photo {idx + 1}</Text>
              </View>
            )}
            {value ? (
              <Pressable style={styles.removeBtn} onPress={() => removePhotoAt(idx)}>
                <Text style={styles.removeBtnText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Bio</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          multiline
          value={bio}
          onChangeText={setBio}
          placeholder="Write a short bio"
          placeholderTextColor={theme.colors.muted}
        />

        <Text style={styles.sectionTitle}>Hobbies</Text>
        <TextInput
          style={styles.input}
          value={hobbies}
          onChangeText={setHobbies}
          placeholder="Example: Running, Live music, Cooking"
          placeholderTextColor={theme.colors.muted}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Prompts</Text>
        <TextInput
          style={styles.input}
          value={promptOne}
          onChangeText={setPromptOne}
          placeholder="Prompt answer #1"
          placeholderTextColor={theme.colors.muted}
        />
        <TextInput
          style={styles.input}
          value={promptTwo}
          onChangeText={setPromptTwo}
          placeholder="Prompt answer #2"
          placeholderTextColor={theme.colors.muted}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <Text style={styles.item}>Discovery radius: {radiusMiles} miles</Text>
        <View style={styles.row}>
          <Pressable style={styles.radiusBtn} onPress={() => adjustRadius(-5)}>
            <Text style={styles.radiusBtnText}>-5</Text>
          </Pressable>
          <Pressable style={styles.radiusBtn} onPress={() => adjustRadius(5)}>
            <Text style={styles.radiusBtnText}>+5</Text>
          </Pressable>
        </View>

        <Pressable style={styles.saveBtn} onPress={saveSettings}>
          <Text style={styles.saveText}>Save Profile</Text>
        </Pressable>
      </View>

      {statusText ? <Text style={styles.success}>{statusText}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    paddingBottom: 24
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 16,
    gap: 10
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.text
  },
  sectionTitle: {
    color: theme.colors.text,
    fontWeight: "700",
    fontSize: 16
  },
  item: {
    color: theme.colors.muted,
    lineHeight: 20
  },
  helper: {
    color: theme.colors.muted,
    fontSize: 12
  },
  input: {
    backgroundColor: "#F2ECF8",
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: "top"
  },
  row: {
    flexDirection: "row",
    gap: 8
  },
  radiusBtn: {
    flex: 1,
    backgroundColor: "#EDE7F6",
    borderRadius: theme.radius.sm,
    alignItems: "center",
    paddingVertical: 10
  },
  radiusBtnText: {
    color: theme.colors.primary,
    fontWeight: "700"
  },
  photoBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    paddingVertical: 10
  },
  photoBtnText: {
    color: "#fff",
    fontWeight: "700"
  },
  choiceBtn: {
    flex: 1,
    backgroundColor: "#EFE8F8",
    borderRadius: theme.radius.sm,
    alignItems: "center",
    paddingVertical: 10
  },
  choiceBtnActive: {
    backgroundColor: theme.colors.primary
  },
  choiceText: {
    color: theme.colors.primary,
    fontWeight: "700",
    textTransform: "capitalize"
  },
  choiceTextActive: {
    color: "#fff"
  },
  photoSlot: {
    borderRadius: theme.radius.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E4D8F2"
  },
  photoPreview: {
    width: "100%",
    height: 190,
    backgroundColor: "#EEE"
  },
  photoPlaceholder: {
    width: "100%",
    height: 70,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6F1FB"
  },
  photoPlaceholderText: {
    color: theme.colors.muted
  },
  removeBtn: {
    backgroundColor: "#FBEAEA",
    alignItems: "center",
    paddingVertical: 8
  },
  removeBtnText: {
    color: "#B42318",
    fontWeight: "700"
  },
  saveBtn: {
    marginTop: 4,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    paddingVertical: 10
  },
  saveText: {
    color: "#fff",
    fontWeight: "700"
  },
  signOutBtn: {
    marginTop: 6,
    backgroundColor: "#EDE7F6",
    borderRadius: theme.radius.sm,
    alignItems: "center",
    paddingVertical: 10
  },
  signOutText: {
    color: theme.colors.primary,
    fontWeight: "700"
  },
  success: {
    color: theme.colors.success,
    fontWeight: "700"
  },
  error: {
    color: theme.colors.danger,
    fontWeight: "700"
  }
});
