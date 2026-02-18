import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  GestureResponderEvent,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import type { ProfileCard } from "../types";
import { theme } from "../theme";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const CARD_PHOTO_HEIGHT = SCREEN_HEIGHT * 0.54;
const RELEASE_THRESHOLD = SCREEN_WIDTH * 0.18;
const AUTO_COMPLETE_THRESHOLD = SCREEN_WIDTH * 0.66;
const SWIPE_OUT_X = SCREEN_WIDTH * 0.72;
const TAP_DISTANCE = 8;
const MODAL_DRAG_ZONE_HEIGHT = SCREEN_HEIGHT * 0.34;
const FONT_REGULAR = "Satoshi-Regular";
const FONT_MEDIUM = "Satoshi-Medium";

export function SwipeScreen({
  card,
  remaining,
  onSwipe,
  swipeError,
  onDismissSwipeError,
  onReport
}: {
  card: ProfileCard | null;
  remaining: number;
  onSwipe: (decision: "left" | "right") => void;
  swipeError?: string | null;
  onDismissSwipeError?: () => void;
  onReport?: (userId: string) => void;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const swipingOutRef = useRef(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [detailPhotoIndex, setDetailPhotoIndex] = useState(0);
  const [modalDragging, setModalDragging] = useState(false);
  const modalTranslateY = useRef(new Animated.Value(0)).current;
  const modalDragStartYRef = useRef<number | null>(null);

  useEffect(() => {
    pan.setValue({ x: 0, y: 0 });
    setPhotoIndex(0);
    setDetailPhotoIndex(0);
    setProfileOpen(false);
    modalTranslateY.setValue(0);
  }, [card?.id, pan]);

  const resetPosition = () => {
    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      tension: 80,
      friction: 9,
      velocity: 0.2,
      useNativeDriver: true
    }).start(() => {
      setDragging(false);
    });
  };

  const completeSwipe = (decision: "left" | "right") => {
    if (swipingOutRef.current) {
      return;
    }
    swipingOutRef.current = true;

    const toX = decision === "right" ? SWIPE_OUT_X : -SWIPE_OUT_X;
    Animated.timing(pan, {
      toValue: { x: toX, y: 0 },
      duration: 140,
      useNativeDriver: true
    }).start(() => {
      pan.setValue({ x: 0, y: 0 });
      setDragging(false);
      swipingOutRef.current = false;
      onSwipe(decision);
    });
  };

  const openProfile = () => {
    setDetailPhotoIndex(photoIndex);
    modalTranslateY.setValue(0);
    setProfileOpen(true);
  };

  const closeProfile = () => {
    setProfileOpen(false);
    modalTranslateY.setValue(0);
    modalDragStartYRef.current = null;
    setModalDragging(false);
  };

  const onModalDragStart = (evt: GestureResponderEvent) => {
    modalDragStartYRef.current = evt.nativeEvent.pageY;
    setModalDragging(true);
  };

  const onModalDragMove = (evt: GestureResponderEvent) => {
    const startY = modalDragStartYRef.current;
    if (startY === null) {
      return;
    }
    const dy = Math.max(0, evt.nativeEvent.pageY - startY);
    modalTranslateY.setValue(dy);
  };

  const snapModalBack = () => {
    Animated.spring(modalTranslateY, {
      toValue: 0,
      tension: 80,
      friction: 10,
      useNativeDriver: true
    }).start(() => {
      setModalDragging(false);
      modalDragStartYRef.current = null;
    });
  };

  const onModalDragEnd = (evt: GestureResponderEvent) => {
    const startY = modalDragStartYRef.current;
    if (startY === null) {
      return;
    }

    const endY = evt.nativeEvent.pageY;
    const dy = Math.max(0, endY - startY);
    const draggedToBottom = endY >= SCREEN_HEIGHT * 0.82;
    const dismiss = dy >= SCREEN_HEIGHT * 0.42 || draggedToBottom;

    if (dismiss) {
      closeProfile();
      return;
    }
    snapModalBack();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          setDragging(true);
        },
        onPanResponderMove: (_evt, gestureState) => {
          if (swipingOutRef.current || profileOpen) {
            return;
          }

          pan.setValue({ x: gestureState.dx, y: gestureState.dy * 0.15 });

          if (gestureState.dx >= AUTO_COMPLETE_THRESHOLD) {
            completeSwipe("right");
            return;
          }
          if (gestureState.dx <= -AUTO_COMPLETE_THRESHOLD) {
            completeSwipe("left");
          }
        },
        onPanResponderRelease: (evt, gestureState) => {
          if (swipingOutRef.current || profileOpen) {
            return;
          }

          const isTap =
            Math.abs(gestureState.dx) < TAP_DISTANCE && Math.abs(gestureState.dy) < TAP_DISTANCE;

          if (isTap) {
            pan.setValue({ x: 0, y: 0 });
            setDragging(false);
            const tapX = evt.nativeEvent.locationX;
            const tapY = evt.nativeEvent.locationY;

            if (tapY <= CARD_PHOTO_HEIGHT) {
              if (tapX >= SCREEN_WIDTH / 2) {
                cycleCardPhoto("next");
              } else {
                cycleCardPhoto("prev");
              }
            } else {
              openProfile();
            }
            return;
          }

          const strongRight = gestureState.dx > RELEASE_THRESHOLD || gestureState.vx > 0.3;
          const strongLeft = gestureState.dx < -RELEASE_THRESHOLD || gestureState.vx < -0.3;

          if (strongRight) {
            completeSwipe("right");
            return;
          }
          if (strongLeft) {
            completeSwipe("left");
            return;
          }
          resetPosition();
        },
        onPanResponderTerminate: () => {
          resetPosition();
        },
        onPanResponderTerminationRequest: () => true
      }),
    [pan, onSwipe, profileOpen, card]
  );

  useEffect(() => {
    if (!dragging) {
      pan.flattenOffset();
    }
  }, [dragging, pan]);

  const rotation = pan.x.interpolate({
    inputRange: [-SWIPE_OUT_X, 0, SWIPE_OUT_X],
    outputRange: ["-18deg", "0deg", "18deg"]
  });

  const likeOpacity = pan.x.interpolate({
    inputRange: [0, RELEASE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: "clamp"
  });

  const passOpacity = pan.x.interpolate({
    inputRange: [-RELEASE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: "clamp"
  });

  const cycleDetailPhoto = (direction: "next" | "prev") => {
    if (!card) {
      return;
    }

    const count = card.photos.length;
    if (count < 2) {
      return;
    }

    setDetailPhotoIndex((prev) => {
      if (direction === "next") {
        return (prev + 1) % count;
      }
      return (prev - 1 + count) % count;
    });
  };

  const cycleCardPhoto = (direction: "next" | "prev") => {
    if (!card) {
      return;
    }

    const count = card.photos.length;
    if (count < 2) {
      return;
    }

    setPhotoIndex((prev) => {
      if (direction === "next") {
        return (prev + 1) % count;
      }
      return (prev - 1 + count) % count;
    });
  };

  if (!card) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>No more profiles right now</Text>
        <Text style={styles.emptySub}>Check back later for new people nearby.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {swipeError ? (
        <Pressable style={styles.swipeErrorBox} onPress={onDismissSwipeError}>
          <Text style={styles.swipeErrorText}>{swipeError}</Text>
        </Pressable>
      ) : null}
      <Animated.View
        style={[
          styles.card,
          {
            transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate: rotation }]
          }
        ]}
        {...panResponder.panHandlers}
      >
        <Image source={{ uri: card.photos[photoIndex] ?? card.photos[0] }} style={styles.photo} />
        <Pressable style={styles.profileThumbBtn} onPress={openProfile}>
          <Image source={{ uri: card.photos[0] ?? card.photos[photoIndex] }} style={styles.profileThumbImage} />
        </Pressable>
        <View style={styles.photoProgressWrap}>
          {card.photos.map((photo, index) => (
            <View
              key={`${photo}-${index}`}
              style={[styles.photoProgressSegment, index === photoIndex && styles.photoProgressActive]}
            />
          ))}
        </View>
        <Animated.View style={[styles.badge, styles.passBadge, { opacity: passOpacity }]}> 
          <Text style={[styles.badgeText, styles.passBadgeText]}>PASS</Text>
        </Animated.View>
        <Animated.View style={[styles.badge, styles.likeBadge, { opacity: likeOpacity }]}> 
          <Text style={[styles.badgeText, styles.likeBadgeText]}>LIKE</Text>
        </Animated.View>
        <View style={styles.meta}>
          <Text style={styles.name}>
            {card.name}, {card.age}
          </Text>
          <Text style={styles.bio}>{card.bio}</Text>
          <Text style={styles.remaining}>{remaining} profiles remaining</Text>
          <Text style={styles.tapHint}>Tap profile to open full details</Text>
        </View>
      </Animated.View>

      <Modal visible={profileOpen} animationType="slide" presentationStyle="pageSheet">
        <Animated.View
          style={[styles.modalRoot, { transform: [{ translateY: modalTranslateY }] }]}
        >
          <View
            style={styles.modalDragZone}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={onModalDragStart}
            onResponderMove={onModalDragMove}
            onResponderRelease={onModalDragEnd}
            onResponderTerminate={snapModalBack}
          />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{card.name}'s Profile</Text>
            <Pressable onPress={closeProfile}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} scrollEnabled={!modalDragging}>
            <View style={styles.detailPhotoWrap}>
              <Image source={{ uri: card.photos[detailPhotoIndex] ?? card.photos[0] }} style={styles.detailPhoto} />
              <View style={styles.detailPhotoTapZones}>
                <Pressable style={styles.detailPhotoTapZone} onPress={() => cycleDetailPhoto("prev")} />
                <Pressable style={styles.detailPhotoTapZone} onPress={() => cycleDetailPhoto("next")} />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{card.name}, {card.age}</Text>
              <Text style={styles.sectionText}>{card.bio}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Hobbies</Text>
              <View style={styles.hobbyWrap}>
                {card.hobbies.map((hobby) => (
                  <View key={hobby} style={styles.hobbyChip}>
                    <Text style={styles.hobbyText}>{hobby}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Q&A</Text>
              {card.questionAnswers.map((qa, index) => (
                <View key={`${qa.question}-${index}`} style={styles.qaCard}>
                  <Text style={styles.qaQuestion}>{qa.question}</Text>
                  <Text style={styles.qaAnswer}>{qa.answer}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={styles.reportBtn}
              onPress={() => {
                if (card?.id) {
                  onReport?.(card.id);
                }
              }}
            >
              <Text style={styles.reportBtnText}>Report Profile</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, flex: 1 },
  swipeErrorBox: {
    backgroundColor: "#FEE4E2",
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  swipeErrorText: {
    color: "#9A3412",
    fontFamily: FONT_MEDIUM
  },
  card: {
    flex: 1,
    minHeight: SCREEN_HEIGHT * 0.7,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    overflow: "hidden"
  },
  photo: {
    width: "100%",
    height: CARD_PHOTO_HEIGHT
  },
  photoProgressWrap: {
    position: "absolute",
    top: 12,
    left: 10,
    right: 10,
    zIndex: 15,
    flexDirection: "row",
    gap: 6
  },
  profileThumbBtn: {
    position: "absolute",
    right: 14,
    bottom: CARD_PHOTO_HEIGHT - 52,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#fff",
    overflow: "hidden",
    zIndex: 25
  },
  profileThumbImage: {
    width: "100%",
    height: "100%"
  },
  photoProgressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.35)"
  },
  photoProgressActive: {
    backgroundColor: "#FFFFFF"
  },
  badge: {
    position: "absolute",
    top: 18,
    zIndex: 20,
    borderWidth: 2,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  passBadge: {
    left: 14,
    borderColor: theme.colors.danger
  },
  likeBadge: {
    right: 14,
    borderColor: theme.colors.success
  },
  badgeText: {
    fontWeight: "800",
    letterSpacing: 1,
    fontFamily: FONT_REGULAR
  },
  passBadgeText: {
    color: theme.colors.danger
  },
  likeBadgeText: {
    color: theme.colors.success
  },
  meta: {
    padding: 16,
    gap: 8
  },
  name: {
    fontSize: 24,
    fontWeight: "700",
    color: theme.colors.text,
    fontFamily: FONT_REGULAR
  },
  bio: {
    fontSize: 14,
    color: theme.colors.muted,
    fontFamily: FONT_MEDIUM
  },
  remaining: {
    marginTop: 8,
    color: theme.colors.primary,
    fontWeight: "600",
    fontFamily: FONT_MEDIUM
  },
  tapHint: {
    color: theme.colors.primaryLight,
    fontSize: 12,
    fontWeight: "600",
    fontFamily: FONT_MEDIUM
  },
  emptyWrap: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 20,
    gap: 8
  },
  emptyTitle: {
    fontSize: 20,
    color: theme.colors.text,
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  },
  emptySub: {
    color: theme.colors.muted,
    fontFamily: FONT_MEDIUM
  },

  modalRoot: {
    flex: 1,
    backgroundColor: theme.colors.background
  },
  modalDragZone: {
    position: "absolute",
    top: 72,
    left: 0,
    right: 0,
    height: MODAL_DRAG_ZONE_HEIGHT - 72,
    zIndex: 50
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: theme.colors.primary,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  modalTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    fontFamily: FONT_REGULAR
  },
  closeText: {
    color: "#fff",
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  },
  modalBody: {
    padding: 14,
    gap: 12,
    paddingBottom: 24
  },
  detailPhotoWrap: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    overflow: "hidden"
  },
  detailPhoto: {
    width: "100%",
    height: SCREEN_HEIGHT * 0.42
  },
  detailPhotoTapZones: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row"
  },
  detailPhotoTapZone: {
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
    fontSize: 18,
    fontFamily: FONT_REGULAR
  },
  sectionText: {
    color: theme.colors.muted,
    lineHeight: 20,
    fontFamily: FONT_MEDIUM
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
    fontWeight: "700",
    fontFamily: FONT_MEDIUM
  },
  qaCard: {
    backgroundColor: "#F7F3FB",
    borderRadius: theme.radius.sm,
    padding: 12,
    gap: 6
  },
  qaQuestion: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  },
  qaAnswer: {
    color: theme.colors.text,
    fontFamily: FONT_MEDIUM
  },
  reportBtn: {
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    borderRadius: theme.radius.sm,
    alignItems: "center",
    paddingVertical: 12
  },
  reportBtnText: {
    color: "#B42318",
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  }
});
