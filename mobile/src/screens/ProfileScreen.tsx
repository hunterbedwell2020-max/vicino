import { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import Slider from "@react-native-community/slider";
import { getUsers, postDistancePreference, postUserProfile, uploadImageBase64, type ApiUser } from "../api";
import { theme } from "../theme";
const FONT_REGULAR = "Satoshi-Regular";
const FONT_MEDIUM = "Satoshi-Medium";

const PHOTO_SLOTS = 9;
const GENDER_OPTIONS = ["male", "female", "other"] as const;
const HOBBY_OPTIONS = [
  "Coffee",
  "Hiking",
  "Live music",
  "Travel",
  "Cooking",
  "Gym",
  "Photography",
  "Movies",
  "Art",
  "Running",
  "Brunch",
  "Reading"
] as const;
const PROMPT_OPTIONS = [
  "A perfect first meetup looks like...",
  "A green flag I always notice...",
  "I am known for...",
  "My ideal Sunday is...",
  "I get excited about...",
  "The best way to get to know me is...",
  "A small thing that makes me happy...",
  "My love language is..."
] as const;
const DEFAULT_PROMPTS = [PROMPT_OPTIONS[0], PROMPT_OPTIONS[1], PROMPT_OPTIONS[3]];
type GenderOption = (typeof GENDER_OPTIONS)[number];
const normalizeGender = (value: string | null | undefined): GenderOption => {
  const next = (value ?? "other").toLowerCase();
  return (GENDER_OPTIONS as readonly string[]).includes(next) ? (next as GenderOption) : "other";
};

export function ProfileScreen({
  userId,
  onSignOut,
  onProfileUpdated
}: {
  userId: string;
  onSignOut?: () => void;
  onProfileUpdated?: (user: ApiUser) => void;
}) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [firstName, setFirstName] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [gender, setGender] = useState<GenderOption>("other");
  const [preferredGender, setPreferredGender] = useState<GenderOption>("other");
  const [photos, setPhotos] = useState<string[]>(Array.from({ length: PHOTO_SLOTS }, () => ""));
  const [bio, setBio] = useState("");
  const [selectedHobbies, setSelectedHobbies] = useState<string[]>([]);
  const [customHobby, setCustomHobby] = useState("");
  const [promptOneQuestion, setPromptOneQuestion] = useState<string>(DEFAULT_PROMPTS[0]);
  const [promptTwoQuestion, setPromptTwoQuestion] = useState<string>(DEFAULT_PROMPTS[1]);
  const [promptThreeQuestion, setPromptThreeQuestion] = useState<string>(DEFAULT_PROMPTS[2]);
  const [promptOne, setPromptOne] = useState("");
  const [promptTwo, setPromptTwo] = useState("");
  const [promptThree, setPromptThree] = useState("");
  const [radiusMiles, setRadiusMiles] = useState(25);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState(0);
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
        setProfilePhoto(me.profilePhotoUrl ?? "");
        setGender(normalizeGender(me.gender));
        setPreferredGender(normalizeGender(me.preferredGender));
        setPhotos(Array.from({ length: PHOTO_SLOTS }, (_, idx) => me.photos[idx] ?? ""));
        setBio(me.bio ?? "");
        setSelectedHobbies(Array.isArray(me.hobbies) ? me.hobbies : []);
        setPromptOne(me.promptOne ?? "");
        setPromptTwo(me.promptTwo ?? "");
        setPromptThree(me.promptThree ?? "");
        setRadiusMiles(Math.round(Number(me.maxDistanceMiles ?? 25)));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, [userId]);

  const saveSettings = async () => {
    setStatusText(null);
    setError(null);

    try {
      const normalizedPhotos = photos.map((p) => p.trim()).filter((p) => p.length > 0);
      const finalPhotos: string[] = [];
      let finalProfilePhoto = profilePhoto.trim();
      if (finalProfilePhoto) {
        if (!(finalProfilePhoto.startsWith("http://") || finalProfilePhoto.startsWith("https://"))) {
          const profilePayload = pendingPhotoPayloads[finalProfilePhoto];
          if (profilePayload?.base64) {
            const uploadedProfile = await uploadImageBase64(
              profilePayload.base64,
              profilePayload.mimeType,
              `profile_avatar_${userId}`
            );
            finalProfilePhoto = uploadedProfile.url;
          } else {
            finalProfilePhoto = "";
          }
        }
      }
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
      const normalizedHobbies = Array.from(
        new Set(selectedHobbies.map((h) => h.trim()).filter((h) => h.length > 0))
      ).slice(0, 12);

      const promptOnePacked = `${promptOneQuestion}|||${promptOne.trim()}`;
      const promptTwoPacked = `${promptTwoQuestion}|||${promptTwo.trim()}`;
      const promptThreePacked = `${promptThreeQuestion}|||${promptThree.trim()}`;

      const updatedUser = await postUserProfile(userId, {
        firstName: firstName.trim() || undefined,
        gender,
        preferredGender,
        bio: bio.trim() || undefined,
        profilePhotoUrl: finalProfilePhoto || undefined,
        photos: finalPhotos.length > 0 ? finalPhotos : undefined,
        hobbies: normalizedHobbies.length > 0 ? normalizedHobbies : undefined,
        promptOne: promptOne.trim() ? promptOnePacked : undefined,
        promptTwo: promptTwo.trim() ? promptTwoPacked : undefined,
        promptThree: promptThree.trim() ? promptThreePacked : undefined
      });
      await postDistancePreference(userId, radiusMiles);
      setUser(updatedUser);
      onProfileUpdated?.(updatedUser);
      setProfilePhoto(updatedUser.profilePhotoUrl ?? "");
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
      profilePhoto.trim().length > 0,
      photos.filter((p) => p.trim().length > 0).length > 0,
      bio.trim().length > 0,
      selectedHobbies.length > 0,
      promptOne.trim().length > 0,
      promptTwo.trim().length > 0,
      promptThree.trim().length > 0
    ];

    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }, [firstName, profilePhoto, photos, bio, selectedHobbies.length, promptOne, promptTwo, promptThree]);

  const toggleHobby = (value: string) => {
    setSelectedHobbies((prev) =>
      prev.includes(value) ? prev.filter((h) => h !== value) : [...prev, value]
    );
  };

  const addCustomHobby = () => {
    const value = customHobby.trim();
    if (!value) {
      return;
    }
    setSelectedHobbies((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setCustomHobby("");
  };

  const unpackPrompt = (packed: string | null | undefined, fallbackQuestion: string) => {
    const raw = (packed ?? "").trim();
    if (!raw) {
      return { question: fallbackQuestion, answer: "" };
    }
    const [question, ...rest] = raw.split("|||");
    if (rest.length === 0) {
      return { question: fallbackQuestion, answer: raw };
    }
    return {
      question: question.trim() || fallbackQuestion,
      answer: rest.join("|||").trim()
    };
  };

  useEffect(() => {
    if (!user) {
      return;
    }
    const one = unpackPrompt(user.promptOne, DEFAULT_PROMPTS[0]);
    const two = unpackPrompt(user.promptTwo, DEFAULT_PROMPTS[1]);
    const three = unpackPrompt(user.promptThree, DEFAULT_PROMPTS[2]);
    setPromptOneQuestion(one.question);
    setPromptTwoQuestion(two.question);
    setPromptThreeQuestion(three.question);
    setPromptOne(one.answer);
    setPromptTwo(two.answer);
    setPromptThree(three.answer);
  }, [user]);

  const questionChoicesFor = (slot: 1 | 2 | 3) => {
    const selectedByOtherSlots =
      slot === 1
        ? new Set([promptTwoQuestion, promptThreeQuestion])
        : slot === 2
          ? new Set([promptOneQuestion, promptThreeQuestion])
          : new Set([promptOneQuestion, promptTwoQuestion]);

    const selectedForSlot = slot === 1 ? promptOneQuestion : slot === 2 ? promptTwoQuestion : promptThreeQuestion;

    return PROMPT_OPTIONS.filter(
      (question) => question === selectedForSlot || !selectedByOtherSlots.has(question)
    );
  };

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

  const previewPhotos = photos.map((p) => p.trim()).filter((p) => p.length > 0);
  const currentPreviewPhoto = previewPhotos[previewPhotoIndex] ?? null;

  const addProfilePhotoFrom = async (source: "camera" | "library") => {
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
    setProfilePhoto(uri);
    setPendingPhotoPayloads((prev) => ({
      ...prev,
      [uri]: { base64, mimeType: asset?.mimeType ?? "image/jpeg" }
    }));
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

        <Text style={styles.sectionTitle}>Profile Photo</Text>
        <Text style={styles.helper}>Used for your top-right avatar and message chats.</Text>
        <View style={styles.profilePhotoWrap}>
          {profilePhoto ? (
            <Image source={{ uri: profilePhoto }} style={styles.profilePhotoPreview} resizeMode="cover" />
          ) : (
            <View style={styles.profilePhotoFallback}>
              <Text style={styles.profilePhotoFallbackText}>{(firstName.slice(0, 1) || "U").toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.profilePhotoActions}>
            <Pressable style={styles.photoBtn} onPress={() => void addProfilePhotoFrom("camera")}>
              <Text style={styles.photoBtnText}>Take</Text>
            </Pressable>
            <Pressable style={styles.photoBtn} onPress={() => void addProfilePhotoFrom("library")}>
              <Text style={styles.photoBtnText}>Choose</Text>
            </Pressable>
            {profilePhoto ? (
              <Pressable style={styles.removeAvatarBtn} onPress={() => setProfilePhoto("")}>
                <Text style={styles.removeAvatarBtnText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
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
        <Text style={styles.helper}>Pick a few and add your own.</Text>
        <View style={styles.chipWrap}>
          {HOBBY_OPTIONS.map((hobby) => (
            <Pressable
              key={hobby}
              style={[styles.hobbyChip, selectedHobbies.includes(hobby) && styles.hobbyChipActive]}
              onPress={() => toggleHobby(hobby)}
            >
              <Text
                style={[styles.hobbyChipText, selectedHobbies.includes(hobby) && styles.hobbyChipTextActive]}
              >
                {hobby}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flexInput]}
            value={customHobby}
            onChangeText={setCustomHobby}
            placeholder="Add your own hobby"
            placeholderTextColor={theme.colors.muted}
          />
          <Pressable style={styles.addBtn} onPress={addCustomHobby}>
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>
        {selectedHobbies.length > 0 ? (
          <View style={styles.selectedWrap}>
            {selectedHobbies.map((hobby) => (
              <Pressable key={`selected-${hobby}`} style={styles.selectedChip} onPress={() => toggleHobby(hobby)}>
                <Text style={styles.selectedChipText}>{hobby}  ×</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Q&A</Text>
        <Text style={styles.helper}>Choose 3 prompts and write your answers.</Text>

        <Text style={styles.promptLabel}>Prompt 1</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promptScroll}>
          {questionChoicesFor(1).map((option) => (
            <Pressable
              key={`p1-${option}`}
              style={[styles.promptChoice, promptOneQuestion === option && styles.promptChoiceActive]}
              onPress={() => setPromptOneQuestion(option)}
            >
              <Text
                style={[styles.promptChoiceText, promptOneQuestion === option && styles.promptChoiceTextActive]}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput
          style={styles.input}
          value={promptOne}
          onChangeText={setPromptOne}
          placeholder="Your answer..."
          placeholderTextColor={theme.colors.muted}
        />

        <Text style={styles.promptLabel}>Prompt 2</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promptScroll}>
          {questionChoicesFor(2).map((option) => (
            <Pressable
              key={`p2-${option}`}
              style={[styles.promptChoice, promptTwoQuestion === option && styles.promptChoiceActive]}
              onPress={() => setPromptTwoQuestion(option)}
            >
              <Text
                style={[styles.promptChoiceText, promptTwoQuestion === option && styles.promptChoiceTextActive]}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput
          style={styles.input}
          value={promptTwo}
          onChangeText={setPromptTwo}
          placeholder="Your answer..."
          placeholderTextColor={theme.colors.muted}
        />

        <Text style={styles.promptLabel}>Prompt 3</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promptScroll}>
          {questionChoicesFor(3).map((option) => (
            <Pressable
              key={`p3-${option}`}
              style={[styles.promptChoice, promptThreeQuestion === option && styles.promptChoiceActive]}
              onPress={() => setPromptThreeQuestion(option)}
            >
              <Text
                style={[styles.promptChoiceText, promptThreeQuestion === option && styles.promptChoiceTextActive]}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput
          style={styles.input}
          value={promptThree}
          onChangeText={setPromptThree}
          placeholder="Your answer..."
          placeholderTextColor={theme.colors.muted}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <Text style={styles.item}>Discovery radius: {radiusMiles} miles</Text>
        <View style={styles.sliderWrap}>
          <Slider
            value={radiusMiles}
            minimumValue={1}
            maximumValue={150}
            step={1}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor="#D8C6ED"
            thumbTintColor={theme.colors.primary}
            onValueChange={(value: number) => setRadiusMiles(Math.round(value))}
          />
          <View style={styles.sliderScaleRow}>
            <Text style={styles.sliderScaleLabel}>1 mi</Text>
            <Text style={styles.sliderScaleLabel}>150 mi</Text>
          </View>
        </View>

        <Pressable
          style={styles.previewBtn}
          onPress={() => {
            setPreviewPhotoIndex(0);
            setPreviewOpen(true);
          }}
        >
          <Text style={styles.previewBtnText}>Profile Preview</Text>
        </Pressable>

        <Pressable style={styles.saveBtn} onPress={saveSettings}>
          <Text style={styles.saveText}>Save Profile</Text>
        </Pressable>
      </View>

      {statusText ? <Text style={styles.success}>{statusText}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={previewOpen} animationType="slide">
        <View style={styles.previewWrap}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>Your Profile Preview</Text>
            <Pressable onPress={() => setPreviewOpen(false)}>
              <Text style={styles.previewClose}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.previewContent}>
            {currentPreviewPhoto ? (
              <Image source={{ uri: currentPreviewPhoto }} style={styles.previewHero} resizeMode="cover" />
            ) : (
              <View style={styles.previewHeroFallback}>
                <Text style={styles.previewHeroFallbackText}>Add photos to see profile preview</Text>
              </View>
            )}
            {previewPhotos.length > 1 ? (
              <View style={styles.row}>
                <Pressable
                  style={styles.radiusBtn}
                  onPress={() => setPreviewPhotoIndex((prev) => Math.max(prev - 1, 0))}
                  disabled={previewPhotoIndex === 0}
                >
                  <Text style={styles.radiusBtnText}>Prev Photo</Text>
                </Pressable>
                <Pressable
                  style={styles.radiusBtn}
                  onPress={() =>
                    setPreviewPhotoIndex((prev) => Math.min(prev + 1, previewPhotos.length - 1))
                  }
                  disabled={previewPhotoIndex >= previewPhotos.length - 1}
                >
                  <Text style={styles.radiusBtnText}>Next Photo</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.previewCard}>
              <Text style={styles.previewName}>{firstName || "Your Name"}, {user?.age ?? 18}</Text>
              <Text style={styles.previewBio}>{bio || "Your bio will appear here."}</Text>
            </View>

            <View style={styles.previewCard}>
              <Text style={styles.sectionTitle}>Hobbies</Text>
              <View style={styles.selectedWrap}>
                {(selectedHobbies.length > 0 ? selectedHobbies : ["Add hobbies"]).map((hobby) => (
                  <View key={`preview-${hobby}`} style={styles.selectedChip}>
                    <Text style={styles.selectedChipText}>{hobby}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.previewCard}>
              <Text style={styles.sectionTitle}>Q&A</Text>
              <Text style={styles.previewQuestion}>{promptOneQuestion}</Text>
              <Text style={styles.previewAnswer}>{promptOne || "Your answer..."}</Text>
              <Text style={styles.previewQuestion}>{promptTwoQuestion}</Text>
              <Text style={styles.previewAnswer}>{promptTwo || "Your answer..."}</Text>
              <Text style={styles.previewQuestion}>{promptThreeQuestion}</Text>
              <Text style={styles.previewAnswer}>{promptThree || "Your answer..."}</Text>
            </View>
          </ScrollView>
        </View>
      </Modal>
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
    color: theme.colors.text,
    fontFamily: FONT_REGULAR
  },
  sectionTitle: {
    color: theme.colors.text,
    fontWeight: "700",
    fontSize: 16,
    fontFamily: FONT_REGULAR
  },
  item: {
    color: theme.colors.muted,
    lineHeight: 20,
    fontFamily: FONT_MEDIUM
  },
  helper: {
    color: theme.colors.muted,
    fontSize: 12,
    fontFamily: FONT_MEDIUM
  },
  input: {
    backgroundColor: "#F2ECF8",
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    fontFamily: FONT_MEDIUM
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: "top"
  },
  row: {
    flexDirection: "row",
    gap: 8
  },
  flexInput: {
    flex: 1
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  hobbyChip: {
    backgroundColor: "#F6F1FB",
    borderWidth: 1,
    borderColor: "#E5D8F2",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7
  },
  hobbyChipActive: {
    backgroundColor: theme.colors.primary
  },
  hobbyChipText: {
    color: theme.colors.primary,
    fontWeight: "600",
    fontSize: 11,
    fontFamily: FONT_MEDIUM
  },
  hobbyChipTextActive: {
    color: "#fff"
  },
  addBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  addBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  },
  selectedWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  selectedChip: {
    backgroundColor: "#F4EEF9",
    borderWidth: 1,
    borderColor: "#E5D8F2",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6
  },
  selectedChipText: {
    color: theme.colors.primary,
    fontWeight: "600",
    fontSize: 11,
    fontFamily: FONT_MEDIUM
  },
  promptLabel: {
    color: theme.colors.text,
    fontWeight: "700",
    fontSize: 13,
    marginTop: 4,
    fontFamily: FONT_REGULAR
  },
  promptScroll: {
    gap: 8,
    paddingRight: 10
  },
  promptChoice: {
    backgroundColor: "#F6F1FB",
    borderWidth: 1,
    borderColor: "#E5D8F2",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7
  },
  promptChoiceActive: {
    backgroundColor: theme.colors.primary
  },
  promptChoiceText: {
    color: theme.colors.primary,
    fontWeight: "600",
    fontSize: 11,
    fontFamily: FONT_MEDIUM
  },
  promptChoiceTextActive: {
    color: "#fff"
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
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  },
  sliderWrap: {
    backgroundColor: "#F6F1FB",
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  sliderScaleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -2
  },
  sliderScaleLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "600",
    fontFamily: FONT_MEDIUM
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
    fontWeight: "700",
    fontFamily: FONT_REGULAR
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
    textTransform: "capitalize",
    fontFamily: FONT_REGULAR
  },
  choiceTextActive: {
    color: "#fff"
  },
  profilePhotoWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  profilePhotoPreview: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#EEE"
  },
  profilePhotoFallback: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#EDE7F6",
    alignItems: "center",
    justifyContent: "center"
  },
  profilePhotoFallbackText: {
    color: theme.colors.primary,
    fontWeight: "800",
    fontSize: 24,
    fontFamily: FONT_REGULAR
  },
  profilePhotoActions: {
    flex: 1,
    gap: 8
  },
  removeAvatarBtn: {
    backgroundColor: "#FBEAEA",
    borderRadius: theme.radius.sm,
    alignItems: "center",
    paddingVertical: 10
  },
  removeAvatarBtnText: {
    color: "#B42318",
    fontWeight: "700",
    fontFamily: FONT_REGULAR
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
    color: theme.colors.muted,
    fontFamily: FONT_MEDIUM
  },
  removeBtn: {
    backgroundColor: "#FBEAEA",
    alignItems: "center",
    paddingVertical: 8
  },
  removeBtnText: {
    color: "#B42318",
    fontWeight: "700",
    fontFamily: FONT_REGULAR
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
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  },
  previewBtn: {
    marginTop: 4,
    backgroundColor: "#EDE7F6",
    borderRadius: theme.radius.sm,
    alignItems: "center",
    paddingVertical: 10
  },
  previewBtnText: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontFamily: FONT_REGULAR
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
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  },
  success: {
    color: theme.colors.success,
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  },
  error: {
    color: theme.colors.danger,
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  },
  previewWrap: {
    flex: 1,
    backgroundColor: theme.colors.background
  },
  previewHeader: {
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  previewTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
    fontFamily: FONT_REGULAR
  },
  previewClose: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  },
  previewContent: {
    gap: 10,
    padding: 14,
    paddingBottom: 24
  },
  previewHero: {
    width: "100%",
    height: 330,
    borderRadius: theme.radius.md,
    backgroundColor: "#EEE"
  },
  previewHeroFallback: {
    width: "100%",
    height: 200,
    borderRadius: theme.radius.md,
    backgroundColor: "#F6F1FB",
    alignItems: "center",
    justifyContent: "center"
  },
  previewHeroFallbackText: {
    color: theme.colors.muted,
    fontFamily: FONT_MEDIUM
  },
  previewCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: 12,
    gap: 8
  },
  previewName: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: "800",
    fontFamily: FONT_REGULAR
  },
  previewBio: {
    color: theme.colors.muted,
    fontFamily: FONT_MEDIUM
  },
  previewQuestion: {
    color: theme.colors.text,
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  },
  previewAnswer: {
    color: theme.colors.muted,
    fontFamily: FONT_MEDIUM
  }
});
