import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import Slider from "@react-native-community/slider";
import { getUsers, postDistancePreference, postUserProfile, uploadImageBase64, type ApiUser } from "../api";
import { theme } from "../theme";
const FONT_REGULAR = "Satoshi-Regular";
const FONT_MEDIUM = "Satoshi-Medium";

const PHOTO_SLOTS = 9;
const PHOTO_GRID_COLUMNS = 3;
const PHOTO_GRID_GAP = 8;
const AUTO_SCROLL_EDGE_PX = 120;
const AUTO_SCROLL_STEP_PX = 14;
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
const normalizeImageUrl = (value: string | null | undefined) => {
  const next = (value ?? "").trim();
  if (!next) {
    return "";
  }
  const isLocalHost =
    /^http:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(next);
  if (isLocalHost) {
    return next;
  }
  return next.replace(/^http:\/\//i, "https://");
};

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
  const [age, setAge] = useState("18");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [gender, setGender] = useState<GenderOption>("other");
  const [preferredGender, setPreferredGender] = useState<GenderOption>("other");
  const [preferredAgeMin, setPreferredAgeMin] = useState(18);
  const [preferredAgeMax, setPreferredAgeMax] = useState(35);
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
  const [saving, setSaving] = useState(false);
  const [slotUploadState, setSlotUploadState] = useState<Record<number, "uploading" | "done" | "error">>({});
  const [photoActionLoading, setPhotoActionLoading] = useState<null | "avatar_camera" | "avatar_library" | "photo_camera" | "photo_library">(null);
  const [photoGridWidth, setPhotoGridWidth] = useState(0);
  const [draggingPhotoIndex, setDraggingPhotoIndex] = useState<number | null>(null);
  const [dragOverPhotoIndex, setDragOverPhotoIndex] = useState<number | null>(null);
  const [dragReadyIndex, setDragReadyIndex] = useState<number | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);
  const [pendingPhotoPayloads, setPendingPhotoPayloads] = useState<
    Record<string, { base64: string; mimeType?: string }>
  >({});
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollOffsetYRef = useRef(0);
  const scrollViewHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const photoGridRef = useRef<View | null>(null);
  const photoGridOriginRef = useRef({ x: 0, y: 0 });
  const photoCellRefs = useRef<Array<View | null>>([]);
  const dragPreviewSizeRef = useRef({ width: 0, height: 0 });
  const dragTouchOffsetRef = useRef({ x: 0, y: 0 });
  const dragPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragScale = useRef(new Animated.Value(1)).current;
  const windowHeight = Dimensions.get("window").height;
  const ageRangeTrackRef = useRef<View | null>(null);
  const ageRangeTrackLeftRef = useRef(0);
  const [ageRangeTrackWidth, setAgeRangeTrackWidth] = useState(0);

  const verificationLabel = useMemo(() => {
    if (!user) {
      return "Loading";
    }
    return user.verified ? "Verified" : "Not verified";
  }, [user]);

  const clampAge = (value: number) => Math.max(18, Math.min(99, Math.round(value)));
  const ageRangeSpan = 99 - 18;
  const minThumbLeft = ageRangeTrackWidth > 0 ? ((preferredAgeMin - 18) / ageRangeSpan) * ageRangeTrackWidth : 0;
  const maxThumbLeft = ageRangeTrackWidth > 0 ? ((preferredAgeMax - 18) / ageRangeSpan) * ageRangeTrackWidth : 0;

  const updateAgeTrackMetrics = () => {
    ageRangeTrackRef.current?.measureInWindow((x, _y, width) => {
      ageRangeTrackLeftRef.current = x;
      if (width > 0) {
        setAgeRangeTrackWidth(width);
      }
    });
  };

  const setAgeFromTrackPosition = (pageX: number, thumb: "min" | "max") => {
    const width = ageRangeTrackWidth;
    if (width <= 0) {
      return;
    }
    const relative = Math.max(0, Math.min(width, pageX - ageRangeTrackLeftRef.current));
    const rawAge = 18 + (relative / width) * ageRangeSpan;
    const nextAge = clampAge(rawAge);
    if (thumb === "min") {
      setPreferredAgeMin(Math.min(nextAge, preferredAgeMax));
    } else {
      setPreferredAgeMax(Math.max(nextAge, preferredAgeMin));
    }
  };

  const minAgeThumbResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          updateAgeTrackMetrics();
          setAgeFromTrackPosition(evt.nativeEvent.pageX, "min");
        },
        onPanResponderMove: (evt) => {
          setAgeFromTrackPosition(evt.nativeEvent.pageX, "min");
        }
      }),
    [ageRangeTrackWidth, preferredAgeMax]
  );

  const maxAgeThumbResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          updateAgeTrackMetrics();
          setAgeFromTrackPosition(evt.nativeEvent.pageX, "max");
        },
        onPanResponderMove: (evt) => {
          setAgeFromTrackPosition(evt.nativeEvent.pageX, "max");
        }
      }),
    [ageRangeTrackWidth, preferredAgeMin]
  );

  const loadProfile = async () => {
    setError(null);
    try {
      const users = await getUsers();
      const me = users.find((u) => u.id === userId) ?? null;
      setUser(me);

      if (me) {
        setFirstName(me.firstName ?? "");
        setAge(String(Math.max(18, Math.min(99, Number(me.age ?? 18)))));
        setProfilePhoto(normalizeImageUrl(me.profilePhotoUrl));
        setGender(normalizeGender(me.gender));
        setPreferredGender(normalizeGender(me.preferredGender));
        setPreferredAgeMin(Math.max(18, Math.min(99, Number(me.preferredAgeMin ?? 18))));
        setPreferredAgeMax(Math.max(18, Math.min(99, Number(me.preferredAgeMax ?? 99))));
        setPhotos(Array.from({ length: PHOTO_SLOTS }, (_, idx) => normalizeImageUrl(me.photos[idx] ?? "")));
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
    if (saving) {
      return;
    }
    setSaving(true);
    setSlotUploadState({});
    setStatusText(null);
    setError(null);

    try {
      const normalizedPhotoSlots = photos.map((p) => normalizeImageUrl(p));
      const finalPhotos: string[] = [];
      let finalProfilePhoto = normalizeImageUrl(profilePhoto);
      if (finalProfilePhoto) {
        if (!(finalProfilePhoto.startsWith("http://") || finalProfilePhoto.startsWith("https://"))) {
          const profilePayload = pendingPhotoPayloads[finalProfilePhoto];
          if (profilePayload?.base64) {
            const uploadedProfile = await uploadImageBase64(
              profilePayload.base64,
              profilePayload.mimeType,
              `profile_avatar_${userId}`
            );
            finalProfilePhoto = normalizeImageUrl(uploadedProfile.url);
            await ensureRemoteImageReachable(finalProfilePhoto);
          } else {
            finalProfilePhoto = "";
          }
        }
      }
      for (let slotIdx = 0; slotIdx < normalizedPhotoSlots.length; slotIdx += 1) {
        const photo = normalizedPhotoSlots[slotIdx];
        if (!photo) {
          continue;
        }
        if (photo.startsWith("http://") || photo.startsWith("https://")) {
          finalPhotos.push(photo);
          continue;
        }
        const payload = pendingPhotoPayloads[photo];
        if (!payload?.base64) {
          continue;
        }
        setSlotUploadState((prev) => ({ ...prev, [slotIdx]: "uploading" }));
        try {
          const uploaded = await uploadImageBase64(payload.base64, payload.mimeType, `profile_${userId}`);
          const normalizedUploadedUrl = normalizeImageUrl(uploaded.url);
          await ensureRemoteImageReachable(normalizedUploadedUrl);
          finalPhotos.push(normalizedUploadedUrl);
          setSlotUploadState((prev) => ({ ...prev, [slotIdx]: "done" }));
        } catch (err) {
          setSlotUploadState((prev) => ({ ...prev, [slotIdx]: "error" }));
          throw err;
        }
      }
      const normalizedHobbies = Array.from(
        new Set(selectedHobbies.map((h) => h.trim()).filter((h) => h.length > 0))
      ).slice(0, 12);

      const promptOnePacked = `${promptOneQuestion}|||${promptOne.trim()}`;
      const promptTwoPacked = `${promptTwoQuestion}|||${promptTwo.trim()}`;
      const promptThreePacked = `${promptThreeQuestion}|||${promptThree.trim()}`;

      const updatedUser = await postUserProfile(userId, {
        firstName: firstName.trim() || undefined,
        age: Math.max(18, Math.min(99, Number(age) || 18)),
        preferredAgeMin: preferredAgeMin,
        preferredAgeMax: preferredAgeMax,
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
      setProfilePhoto(normalizeImageUrl(updatedUser.profilePhotoUrl ?? ""));
      setPhotos(Array.from({ length: PHOTO_SLOTS }, (_, idx) => normalizeImageUrl(updatedUser.photos[idx] ?? "")));
      setPendingPhotoPayloads({});
      setStatusText("Profile and settings saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
      setTimeout(() => {
        setSlotUploadState({});
      }, 1200);
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

  const addPhotoFrom = async (
    source: "camera" | "library",
    slotIndex?: number,
    allowMultipleFromLibrary = false
  ) => {
    const actionKey = source === "camera" ? "photo_camera" : "photo_library";
    setPhotoActionLoading(actionKey);
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
          ? await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.8, base64: true })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: "images",
              quality: 0.8,
              base64: true,
              allowsMultipleSelection: allowMultipleFromLibrary
            });
      if (result.canceled) {
        return;
      }
      const assets = result.assets ?? [];
      const prepared = assets
        .map((asset) => ({
          uri: asset?.uri ?? "",
          base64: asset?.base64 ?? "",
          mimeType: asset?.mimeType ?? "image/jpeg"
        }))
        .filter((asset) => asset.uri && asset.base64);

      if (prepared.length === 0) {
        setError("No valid image selected. Try another photo.");
        return;
      }

      if (slotIndex != null) {
        putPhotoInSpecificSlot(slotIndex, prepared[0].uri);
      } else {
        placePhotoInSlots(prepared.map((item) => item.uri));
      }
      setPendingPhotoPayloads((prev) => {
        const next = { ...prev };
        for (const item of prepared) {
          next[item.uri] = { base64: item.base64, mimeType: item.mimeType };
        }
        return next;
      });
    } finally {
      setPhotoActionLoading(null);
    }
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

  const placePhotoInSlots = (uris: string[]) => {
    const sanitized = uris.map((u) => u.trim()).filter(Boolean);
    if (sanitized.length === 0) {
      return;
    }
    setPhotos((prev) => {
      const next = [...prev];
      const emptyIndexes: number[] = [];
      for (let i = 0; i < next.length; i += 1) {
        if (!next[i]?.trim()) {
          emptyIndexes.push(i);
        }
      }
      let overflowIndex = next.length - 1;
      for (const uri of sanitized) {
        if (emptyIndexes.length > 0) {
          const target = emptyIndexes.shift();
          if (target != null) {
            next[target] = uri;
          }
        } else {
          next[overflowIndex] = uri;
          overflowIndex = Math.max(0, overflowIndex - 1);
        }
      }
      return next;
    });
  };

  const putPhotoInSpecificSlot = (slotIndex: number, uri: string) => {
    setPhotos((prev) => {
      const next = [...prev];
      next[slotIndex] = uri;
      return next;
    });
  };

  const ensureRemoteImageReachable = async (url: string) => {
    const normalized = normalizeImageUrl(url);
    if (!/^https?:\/\//i.test(normalized)) {
      return;
    }
    const ok = await Image.prefetch(normalized);
    if (!ok) {
      throw new Error("Uploaded image URL is unreachable. Please check storage settings and retry.");
    }
  };

  const photoCellWidth =
    photoGridWidth > 0 ? (photoGridWidth - PHOTO_GRID_GAP * (PHOTO_GRID_COLUMNS - 1)) / PHOTO_GRID_COLUMNS : 96;
  const photoThumbHeight = Math.max(72, photoCellWidth * (16 / 9));

  const syncPhotoGridMetrics = () => {
    photoGridRef.current?.measureInWindow((x, y, width) => {
      photoGridOriginRef.current = { x, y };
      if (width > 0) {
        setPhotoGridWidth(width);
      }
    });
  };

  const triggerHaptic = async (kind: "start" | "drop") => {
    try {
      const Haptics = require("expo-haptics") as {
        impactAsync?: (style: unknown) => Promise<void>;
        ImpactFeedbackStyle?: { Light?: unknown; Medium?: unknown };
      };
      if (!Haptics?.impactAsync) {
        return;
      }
      await Haptics.impactAsync(
        kind === "start" ? Haptics.ImpactFeedbackStyle?.Light : Haptics.ImpactFeedbackStyle?.Medium
      );
    } catch {
      // Optional dependency; ignore when unavailable.
    }
  };

  const maybeAutoScroll = (fingerPageY: number) => {
    const currentOffset = scrollOffsetYRef.current;
    const visibleHeight = scrollViewHeightRef.current || windowHeight;
    const contentHeight = contentHeightRef.current || visibleHeight;
    const lowerBound = Math.max(0, contentHeight - visibleHeight);
    const nearTop = fingerPageY < AUTO_SCROLL_EDGE_PX;
    const nearBottom = fingerPageY > visibleHeight - AUTO_SCROLL_EDGE_PX;
    if (!nearTop && !nearBottom) {
      return;
    }
    const nextOffset = nearTop
      ? Math.max(0, currentOffset - AUTO_SCROLL_STEP_PX)
      : Math.min(lowerBound, currentOffset + AUTO_SCROLL_STEP_PX);
    if (nextOffset === currentOffset) {
      return;
    }
    scrollOffsetYRef.current = nextOffset;
    scrollRef.current?.scrollTo({ y: nextOffset, animated: false });
  };

  const getDropIndexFromPoint = (moveX: number, moveY: number) => {
    const { x, y } = photoGridOriginRef.current;
    const relX = moveX - x;
    const relY = moveY - y;
    if (relX < 0 || relY < 0) {
      return null;
    }

    const rowHeight = photoThumbHeight + 34 + PHOTO_GRID_GAP;
    const colWidth = photoCellWidth + PHOTO_GRID_GAP;
    const col = Math.floor(relX / colWidth);
    const row = Math.floor(relY / rowHeight);
    if (col < 0 || col >= PHOTO_GRID_COLUMNS || row < 0) {
      return null;
    }

    const withinCol = relX - col * colWidth;
    const withinRow = relY - row * rowHeight;
    if (withinCol > photoCellWidth || withinRow > photoThumbHeight + 34) {
      return null;
    }

    const nextIndex = row * PHOTO_GRID_COLUMNS + col;
    if (nextIndex < 0 || nextIndex >= PHOTO_SLOTS) {
      return null;
    }
    return nextIndex;
  };

  const reorderPhotosByInsertion = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= PHOTO_SLOTS || toIndex >= PHOTO_SLOTS) {
      return;
    }
    setPhotos((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved ?? "");
      return next.slice(0, PHOTO_SLOTS);
    });
  };

  const finishPhotoDrag = (fromIndex: number, moveX: number, moveY: number) => {
    const dropIndex = getDropIndexFromPoint(moveX, moveY);
    if (dropIndex != null) {
      reorderPhotosByInsertion(fromIndex, dropIndex);
      void triggerHaptic("drop");
    }
    setDraggingPhotoIndex(null);
    setDragOverPhotoIndex(null);
    setDragPreview(null);
    setDragReadyIndex(null);
    dragPreviewSizeRef.current = { width: 0, height: 0 };
    dragTouchOffsetRef.current = { x: 0, y: 0 };
    Animated.spring(dragScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 24,
      bounciness: 5
    }).start();
  };

  const openSlotPhotoPrompt = (slotIndex: number) => {
    const hasPhoto = photos[slotIndex]?.trim().length > 0;
    Alert.alert("Photo options", "Choose how to set this slot.", [
      {
        text: "Take photo",
        onPress: () => {
          void addPhotoFrom("camera", slotIndex);
        }
      },
      {
        text: "From library",
        onPress: () => {
          void addPhotoFrom("library", slotIndex, false);
        }
      },
      ...(hasPhoto
        ? [
            {
              text: "Remove photo",
              style: "destructive" as const,
              onPress: () => removePhotoAt(slotIndex)
            }
          ]
        : []),
      { text: "Cancel", style: "cancel" }
    ]);
  };

  const previewPhotos = photos.map((p) => p.trim()).filter((p) => p.length > 0);
  const currentPreviewPhoto = previewPhotos[previewPhotoIndex] ?? null;

  const addProfilePhotoFrom = async (source: "camera" | "library") => {
    const actionKey = source === "camera" ? "avatar_camera" : "avatar_library";
    setPhotoActionLoading(actionKey);
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
    } finally {
      setPhotoActionLoading(null);
    }
  };

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.wrap}
      scrollEnabled={draggingPhotoIndex === null}
      scrollEventThrottle={16}
      onScroll={(event) => {
        scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
      }}
      onLayout={(event) => {
        scrollViewHeightRef.current = event.nativeEvent.layout.height;
      }}
      onContentSizeChange={(_w, h) => {
        contentHeightRef.current = h;
      }}
    >
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

        <Text style={styles.sectionTitle}>Your Age</Text>
        <TextInput
          style={styles.input}
          value={age}
          onChangeText={(value) => setAge(value.replace(/[^0-9]/g, "").slice(0, 2))}
          keyboardType="number-pad"
          placeholder="18-99"
          placeholderTextColor={theme.colors.muted}
        />

        <Text style={styles.sectionTitle}>Preferred Age Range</Text>
        <Text style={styles.item}>{preferredAgeMin} - {preferredAgeMax}</Text>
        <View style={styles.ageRangeInputs}>
          <View style={styles.ageRangeInputWrap}>
            <Text style={styles.sliderCaption}>Min</Text>
            <TextInput
              style={styles.ageRangeInput}
              value={String(preferredAgeMin)}
              onChangeText={(value) => {
                const numeric = clampAge(Number(value.replace(/[^0-9]/g, "").slice(0, 2) || "18"));
                setPreferredAgeMin(Math.min(numeric, preferredAgeMax));
              }}
              keyboardType="number-pad"
              placeholder="18"
              placeholderTextColor={theme.colors.muted}
            />
          </View>
          <View style={styles.ageRangeInputWrap}>
            <Text style={styles.sliderCaption}>Max</Text>
            <TextInput
              style={styles.ageRangeInput}
              value={String(preferredAgeMax)}
              onChangeText={(value) => {
                const numeric = clampAge(Number(value.replace(/[^0-9]/g, "").slice(0, 2) || "99"));
                setPreferredAgeMax(Math.max(numeric, preferredAgeMin));
              }}
              keyboardType="number-pad"
              placeholder="99"
              placeholderTextColor={theme.colors.muted}
            />
          </View>
        </View>
        <View style={styles.ageRangeSliderWrap}>
          <View
            ref={ageRangeTrackRef}
            style={styles.ageRangeTrack}
            onLayout={() => updateAgeTrackMetrics()}
          >
            <View
              style={[
                styles.ageRangeSelectedTrack,
                {
                  left: minThumbLeft,
                  width: Math.max(maxThumbLeft - minThumbLeft, 0)
                }
              ]}
            />
            <View
              style={[styles.ageRangeThumb, { left: Math.max(minThumbLeft - 14, -14) }]}
              {...minAgeThumbResponder.panHandlers}
            />
            <View
              style={[styles.ageRangeThumb, { left: Math.max(maxThumbLeft - 14, -14) }]}
              {...maxAgeThumbResponder.panHandlers}
            />
          </View>
          <View style={styles.ageRangeLabels}>
            <Text style={styles.ageRangeLabel}>18</Text>
            <Text style={styles.ageRangeLabel}>99+</Text>
          </View>
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
            <Pressable
              style={[styles.photoBtn, (saving || photoActionLoading !== null) && styles.actionBtnDisabled]}
              onPress={() => void addProfilePhotoFrom("camera")}
              disabled={saving || photoActionLoading !== null}
            >
              <View style={styles.buttonContent}>
                {photoActionLoading === "avatar_camera" ? <ActivityIndicator size="small" color="#fff" /> : null}
                <Text style={styles.photoBtnText}>{photoActionLoading === "avatar_camera" ? "Opening..." : "Take"}</Text>
              </View>
            </Pressable>
            <Pressable
              style={[styles.photoBtn, (saving || photoActionLoading !== null) && styles.actionBtnDisabled]}
              onPress={() => void addProfilePhotoFrom("library")}
              disabled={saving || photoActionLoading !== null}
            >
              <View style={styles.buttonContent}>
                {photoActionLoading === "avatar_library" ? <ActivityIndicator size="small" color="#fff" /> : null}
                <Text style={styles.photoBtnText}>{photoActionLoading === "avatar_library" ? "Opening..." : "Choose"}</Text>
              </View>
            </Pressable>
            {profilePhoto ? (
              <Pressable
                style={[styles.removeAvatarBtn, saving && styles.actionBtnDisabled]}
                onPress={() => setProfilePhoto("")}
                disabled={saving}
              >
                <Text style={styles.removeAvatarBtnText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Photos (up to 9)</Text>
        <Text style={styles.helper}>
          Use camera or camera roll. Photos upload when you save profile. Drag photos to reorder display order.
        </Text>
        <View style={styles.row}>
          <Pressable
            style={[styles.photoBtn, (saving || photoActionLoading !== null) && styles.actionBtnDisabled]}
            onPress={() => void addPhotoFrom("camera")}
            disabled={saving || photoActionLoading !== null}
          >
            <View style={styles.buttonContent}>
              {photoActionLoading === "photo_camera" ? <ActivityIndicator size="small" color="#fff" /> : null}
              <Text style={styles.photoBtnText}>{photoActionLoading === "photo_camera" ? "Opening..." : "Take Photo"}</Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.photoBtn, (saving || photoActionLoading !== null) && styles.actionBtnDisabled]}
            onPress={() => void addPhotoFrom("library", undefined, true)}
            disabled={saving || photoActionLoading !== null}
          >
            <View style={styles.buttonContent}>
              {photoActionLoading === "photo_library" ? <ActivityIndicator size="small" color="#fff" /> : null}
              <Text style={styles.photoBtnText}>
                {photoActionLoading === "photo_library" ? "Opening..." : "Library (Multi)"}
              </Text>
            </View>
          </Pressable>
        </View>
        <View
          ref={photoGridRef}
          style={styles.photoGrid}
          onLayout={() => {
            requestAnimationFrame(syncPhotoGridMetrics);
          }}
        >
          {photos.map((value, idx) => {
            const isFilled = value.trim().length > 0;
            const dragEnabled = isFilled && !saving && photoActionLoading === null;
            const isDragging = draggingPhotoIndex === idx;
            const isDropTarget = dragOverPhotoIndex === idx && draggingPhotoIndex !== null && draggingPhotoIndex !== idx;
            const uploadState = slotUploadState[idx];
            const panResponder = dragEnabled
              ? PanResponder.create({
                  onStartShouldSetPanResponder: () => false,
                  onStartShouldSetPanResponderCapture: () => false,
                  onMoveShouldSetPanResponder: (_evt, gestureState) =>
                    dragReadyIndex === idx &&
                    (Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4),
                  onMoveShouldSetPanResponderCapture: () => false,
                  onPanResponderGrant: (evt) => {
                    syncPhotoGridMetrics();
                    setDraggingPhotoIndex(idx);
                    setDragOverPhotoIndex(idx);
                    setDragReadyIndex(null);
                    void triggerHaptic("start");
                    Animated.spring(dragScale, {
                      toValue: 1.035,
                      useNativeDriver: true,
                      speed: 28,
                      bounciness: 8
                    }).start();
                    photoCellRefs.current[idx]?.measureInWindow((x, y, width, height) => {
                      const previewWidth = width || photoCellWidth;
                      const previewHeight = height || photoThumbHeight + 34;
                      dragPreviewSizeRef.current = { width: previewWidth, height: previewHeight };
                      dragTouchOffsetRef.current = {
                        x: previewWidth / 2,
                        y: previewHeight / 2
                      };
                      setDragPreview({
                        uri: value,
                        width: previewWidth,
                        height: previewHeight
                      });
                      dragPosition.setValue({
                        x: evt.nativeEvent.pageX - previewWidth / 2,
                        y: evt.nativeEvent.pageY - previewHeight / 2
                      });
                    });
                  },
                  onPanResponderMove: (_evt, gestureState) => {
                    maybeAutoScroll(gestureState.moveY);
                    const overIndex = getDropIndexFromPoint(gestureState.moveX, gestureState.moveY);
                    setDragOverPhotoIndex(overIndex);
                    const previewWidth = dragPreviewSizeRef.current.width;
                    const previewHeight = dragPreviewSizeRef.current.height;
                    if (previewWidth > 0 && previewHeight > 0) {
                      dragPosition.setValue({
                        x: gestureState.moveX - previewWidth / 2,
                        y: gestureState.moveY - previewHeight / 2
                      });
                    }
                  },
                  onPanResponderRelease: (_evt, gestureState) => {
                    const moved = Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6;
                    if (!moved) {
                      setDraggingPhotoIndex(null);
                      setDragOverPhotoIndex(null);
                      setDragPreview(null);
                      setDragReadyIndex(null);
                      dragPreviewSizeRef.current = { width: 0, height: 0 };
                      dragTouchOffsetRef.current = { x: 0, y: 0 };
                      Animated.spring(dragScale, {
                        toValue: 1,
                        useNativeDriver: true,
                        speed: 24,
                        bounciness: 5
                      }).start();
                      openSlotPhotoPrompt(idx);
                      return;
                    }
                    finishPhotoDrag(idx, gestureState.moveX, gestureState.moveY);
                  },
                  onPanResponderTerminate: (_evt, gestureState) => {
                    finishPhotoDrag(idx, gestureState.moveX, gestureState.moveY);
                  },
                  onPanResponderTerminationRequest: () => false
                })
              : null;

            return (
              <View
                key={`photo-${idx}`}
                ref={(node) => {
                  photoCellRefs.current[idx] = node;
                }}
                style={[
                  styles.photoCell,
                  { width: photoCellWidth },
                  isDropTarget && styles.photoCellDropTarget,
                  isDragging && styles.photoCellDragging
                ]}
              >
                <View style={styles.photoOrderBadge}>
                  <Text style={styles.photoOrderBadgeText}>{idx + 1}</Text>
                </View>
                {isFilled ? (
                  <View style={styles.photoDragHandle}>
                    <Text style={styles.photoDragHandleText}>↕</Text>
                  </View>
                ) : null}

                <View
                  style={[styles.photoThumbWrap, { height: photoThumbHeight }]}
                  {...(panResponder ? panResponder.panHandlers : {})}
                >
                  <Pressable
                    style={styles.photoThumbPressable}
                    onPress={() => openSlotPhotoPrompt(idx)}
                    onLongPress={() => {
                      if (dragEnabled) {
                        setDragReadyIndex(idx);
                      }
                    }}
                    delayLongPress={120}
                    disabled={saving || photoActionLoading !== null}
                  >
                    {value ? (
                      <Image source={{ uri: value }} style={styles.photoThumb} resizeMode="cover" />
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <Text style={styles.photoPlaceholderText}>Photo {idx + 1}</Text>
                      </View>
                    )}
                  </Pressable>
                  {uploadState === "uploading" ? (
                    <View style={styles.photoUploadingOverlay}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.photoUploadingText}>Uploading...</Text>
                    </View>
                  ) : null}
                </View>

                {value ? (
                  <View>
                    {uploadState === "done" ? <Text style={styles.slotStateDone}>Uploaded</Text> : null}
                    {uploadState === "error" ? <Text style={styles.slotStateError}>Upload failed</Text> : null}
                    <Pressable
                      style={[styles.removeBtn, saving && styles.actionBtnDisabled]}
                      onPress={() => removePhotoAt(idx)}
                      disabled={saving}
                    >
                      <Text style={styles.removeBtnText}>Remove</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.emptySlotFooter}>
                    <Text style={styles.emptySlotFooterText}>Empty</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
      {dragPreview ? (
        <Modal transparent visible animationType="none">
          <View style={styles.dragPreviewOverlay} pointerEvents="none">
            <Animated.View
              style={[
                styles.dragPreview,
                {
                  width: dragPreview.width,
                  height: dragPreview.height,
                  transform: [...dragPosition.getTranslateTransform(), { scale: dragScale }]
                }
              ]}
            >
              <Image source={{ uri: dragPreview.uri }} style={styles.dragPreviewImage} resizeMode="cover" />
            </Animated.View>
          </View>
        </Modal>
      ) : null}

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
          <Pressable style={[styles.addBtn, saving && styles.actionBtnDisabled]} onPress={addCustomHobby} disabled={saving}>
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

        <Pressable style={[styles.saveBtn, saving && styles.actionBtnDisabled]} onPress={saveSettings} disabled={saving}>
          <View style={styles.buttonContent}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : null}
            <Text style={styles.saveText}>{saving ? "Saving..." : "Save Profile"}</Text>
          </View>
        </Pressable>
      </View>

      {statusText ? <Text style={styles.success}>{statusText}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {error ? (
        <Pressable style={[styles.retryBtn, saving && styles.actionBtnDisabled]} onPress={saveSettings} disabled={saving}>
          <Text style={styles.retryBtnText}>Retry Save</Text>
        </Pressable>
      ) : null}

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
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  actionBtnDisabled: {
    opacity: 0.7
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
  ageRangeInputs: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    marginBottom: 10
  },
  ageRangeInputWrap: {
    flex: 1,
    gap: 6
  },
  ageRangeInput: {
    backgroundColor: "#F6F1FB",
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: "#E2D4F3",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    fontFamily: FONT_MEDIUM
  },
  ageRangeSliderWrap: {
    backgroundColor: "#F6F1FB",
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 12
  },
  ageRangeTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "#D8C6ED",
    position: "relative",
    marginHorizontal: 2
  },
  ageRangeSelectedTrack: {
    position: "absolute",
    top: 0,
    height: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.primary
  },
  ageRangeThumb: {
    position: "absolute",
    top: -11,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: theme.colors.primary,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3
  },
  ageRangeLabels: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between"
  },
  ageRangeLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontFamily: FONT_MEDIUM
  },
  sliderCaption: {
    color: theme.colors.muted,
    fontSize: 12,
    fontFamily: FONT_MEDIUM
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
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: PHOTO_GRID_GAP
  },
  photoCell: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: "#E4D8F2",
    backgroundColor: "#fff",
    overflow: "hidden"
  },
  photoCellDragging: {
    opacity: 0.2
  },
  photoCellDropTarget: {
    borderColor: theme.colors.primary,
    borderWidth: 2
  },
  photoOrderBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    zIndex: 4,
    backgroundColor: "rgba(89, 40, 134, 0.9)",
    borderRadius: 999,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center"
  },
  photoOrderBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  },
  photoDragHandle: {
    position: "absolute",
    top: 6,
    right: 6,
    zIndex: 4,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    borderRadius: 999,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center"
  },
  photoDragHandleText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  },
  photoThumbWrap: {
    width: "100%",
    backgroundColor: "#EEE"
  },
  photoThumbPressable: {
    width: "100%",
    height: "100%"
  },
  photoThumb: {
    width: "100%",
    height: "100%",
    backgroundColor: "#EEE"
  },
  photoUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  },
  photoUploadingText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: FONT_REGULAR
  },
  dragPreview: {
    position: "absolute",
    top: 0,
    left: 0,
    borderRadius: theme.radius.sm,
    overflow: "hidden",
    zIndex: 200,
    elevation: 14,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }
  },
  dragPreviewOverlay: {
    flex: 1
  },
  dragPreviewImage: {
    width: "100%",
    height: "100%"
  },
  photoPlaceholder: {
    width: "100%",
    height: "100%",
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
  slotStateDone: {
    color: theme.colors.success,
    fontSize: 11,
    textAlign: "center",
    paddingTop: 6,
    fontFamily: FONT_MEDIUM
  },
  slotStateError: {
    color: theme.colors.danger,
    fontSize: 11,
    textAlign: "center",
    paddingTop: 6,
    fontFamily: FONT_MEDIUM
  },
  emptySlotFooter: {
    backgroundColor: "#F8F4FC",
    alignItems: "center",
    paddingVertical: 8
  },
  emptySlotFooterText: {
    color: theme.colors.muted,
    fontSize: 11,
    fontFamily: FONT_MEDIUM
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
  retryBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#F3ECFB",
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  retryBtnText: {
    color: theme.colors.primary,
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
