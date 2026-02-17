import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import type { ProfileCard } from "../types";
import { theme } from "../theme";

export function ProfilePreviewModal({
  visible,
  profile,
  onClose
}: {
  visible: boolean;
  profile: ProfileCard | null;
  onClose: () => void;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    setPhotoIndex(0);
  }, [profile?.id, visible]);

  if (!profile) {
    return null;
  }

  const photos = profile.photos.length > 0 ? profile.photos : ["https://picsum.photos/600/900"];
  const safeIndex = Math.min(photoIndex, photos.length - 1);
  const currentPhoto = photos[safeIndex] ?? photos[0];

  const cyclePhoto = (direction: "next" | "prev") => {
    if (photos.length < 2) {
      return;
    }
    setPhotoIndex((prev) => {
      if (direction === "next") {
        return (prev + 1) % photos.length;
      }
      return (prev - 1 + photos.length) % photos.length;
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>{profile.name}'s Profile</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.photoWrap}>
            <Image source={{ uri: currentPhoto }} style={styles.photo} resizeMode="cover" />
            <View style={styles.tapZones}>
              <Pressable style={styles.tapZone} onPress={() => cyclePhoto("prev")} />
              <Pressable style={styles.tapZone} onPress={() => cyclePhoto("next")} />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {profile.name}, {profile.age}
            </Text>
            <Text style={styles.sectionText}>{profile.bio}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hobbies</Text>
            <View style={styles.hobbyWrap}>
              {profile.hobbies.map((hobby) => (
                <View key={hobby} style={styles.hobbyChip}>
                  <Text style={styles.hobbyText}>{hobby}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Q&A</Text>
            {profile.questionAnswers.map((qa, index) => (
              <View key={`${qa.question}-${index}`} style={styles.qaCard}>
                <Text style={styles.qaQuestion}>{qa.question}</Text>
                <Text style={styles.qaAnswer}>{qa.answer}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: theme.colors.primary,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800"
  },
  closeText: {
    color: "#fff",
    fontWeight: "700"
  },
  body: {
    padding: 14,
    gap: 12,
    paddingBottom: 24
  },
  photoWrap: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    overflow: "hidden"
  },
  photo: {
    width: "100%",
    height: 360
  },
  tapZones: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row"
  },
  tapZone: {
    flex: 1
  },
  section: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: 14,
    gap: 10
  },
  sectionTitle: {
    color: theme.colors.text,
    fontWeight: "800",
    fontSize: 18
  },
  sectionText: {
    color: theme.colors.muted,
    lineHeight: 20
  },
  hobbyWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  hobbyChip: {
    backgroundColor: "#F1E8FA",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12
  },
  hobbyText: {
    color: theme.colors.primary,
    fontWeight: "700"
  },
  qaCard: {
    backgroundColor: "#F7F3FB",
    borderRadius: theme.radius.sm,
    padding: 12,
    gap: 6
  },
  qaQuestion: {
    color: theme.colors.primary,
    fontWeight: "700"
  },
  qaAnswer: {
    color: theme.colors.text
  }
});
