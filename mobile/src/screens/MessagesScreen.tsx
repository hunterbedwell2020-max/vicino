import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { theme } from "../theme";
import type { MatchPreview, MeetDecision } from "../types";

export function MessagesScreen({
  matches,
  activeMatch,
  openChat,
  closeChat,
  sendMessage,
  sendAutoReply,
  messageCapReached,
  setMeetDecision,
  bothMeetYes
}: {
  matches: MatchPreview[];
  activeMatch: MatchPreview | null;
  openChat: (matchId: string) => void;
  closeChat: () => void;
  sendMessage: (
    matchId: string,
    sender: "me" | "them",
    body: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  sendAutoReply: (matchId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  messageCapReached: (match: MatchPreview) => boolean;
  setMeetDecision: (matchId: string, user: "me" | "them", decision: MeetDecision) => Promise<void>;
  bothMeetYes: (match: MatchPreview) => boolean;
}) {
  const [compose, setCompose] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<{ id: string; sender: "me" | "them"; body: string }>>(null);

  const capReached = activeMatch ? messageCapReached(activeMatch) : false;

  const shouldForceDecision = Boolean(
    activeMatch &&
      capReached &&
      (activeMatch.meetDecisionByMe === null || activeMatch.meetDecisionByThem === null)
  );

  const meetSummary = useMemo(() => {
    if (!activeMatch || !capReached) {
      return null;
    }

    return (
      <View style={styles.promptCard}>
        <View style={styles.promptRow}>
          <Text style={styles.promptLabel}>Your answer: {activeMatch.meetDecisionByMe ?? "pending"}</Text>
        </View>

        <View style={styles.promptRow}>
          <Text style={styles.promptLabel}>Their answer: {activeMatch.meetDecisionByThem ?? "pending"}</Text>
        </View>

        <Text style={styles.promptStatus}>
          {bothMeetYes(activeMatch)
            ? "Both selected YES. This match is now eligible for the 'I am out and open to meeting' flow."
            : "Both responses are required before out-tonight eligibility."}
        </Text>
      </View>
    );
  }, [activeMatch, capReached, bothMeetYes]);

  const decisionModal = useMemo(() => {
    if (!activeMatch || !shouldForceDecision) {
      return null;
    }

    return (
      <Modal transparent animationType="fade" visible>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.promptTitle}>Would you like to meet this person?</Text>
            <Text style={styles.modalSub}>
              60 total messages reached. Both people must decide before this chat can move forward.
            </Text>

            <View style={styles.promptRow}>
              <Text style={styles.promptLabel}>Your answer:</Text>
              <View style={styles.promptActions}>
                <Pressable
                  style={[
                    styles.promptBtn,
                    activeMatch.meetDecisionByMe === "yes" && styles.promptBtnYes
                  ]}
                  onPress={() => setMeetDecision(activeMatch.id, "me", "yes")}
                >
                  <Text style={styles.promptBtnText}>Yes</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.promptBtn,
                    activeMatch.meetDecisionByMe === "no" && styles.promptBtnNo
                  ]}
                  onPress={() => setMeetDecision(activeMatch.id, "me", "no")}
                >
                  <Text style={styles.promptBtnText}>No</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.promptRow}>
              <Text style={styles.promptLabel}>Simulate their answer:</Text>
              <View style={styles.promptActions}>
                <Pressable
                  style={[
                    styles.promptBtn,
                    activeMatch.meetDecisionByThem === "yes" && styles.promptBtnYes
                  ]}
                  onPress={() => setMeetDecision(activeMatch.id, "them", "yes")}
                >
                  <Text style={styles.promptBtnText}>Yes</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.promptBtn,
                    activeMatch.meetDecisionByThem === "no" && styles.promptBtnNo
                  ]}
                  onPress={() => setMeetDecision(activeMatch.id, "them", "no")}
                >
                  <Text style={styles.promptBtnText}>No</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    );
  }, [activeMatch, shouldForceDecision, setMeetDecision]);

  const closeChatWithGuard = () => {
    if (shouldForceDecision) {
      setError("Meet decision required before leaving this chat.");
      return;
    }
    closeChat();
  };

  useEffect(() => {
    if (!activeMatch) {
      return;
    }
    const timer = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: false });
    }, 10);
    return () => clearTimeout(timer);
  }, [activeMatch?.id, activeMatch?.chat.length]);

  if (!activeMatch) {
    return (
      <FlatList
        data={matches}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listWrap}
        renderItem={({ item }) => {
          const total = item.messagesUsedByMe + item.messagesUsedByThem;
          const isCapped = messageCapReached(item);
          const preview = item.chat[item.chat.length - 1]?.body ?? "No messages yet.";
          return (
            <Pressable style={styles.listCard} onPress={() => openChat(item.id)}>
              <View style={styles.listRow}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatar} resizeMode="cover" />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>{item.name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.listTextWrap}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.preview}>{preview}</Text>
                  <Text style={styles.meta}>Messages: {total}/60</Text>
                  {isCapped ? <Text style={styles.cappedLabel}>Messages Capped</Text> : null}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    );
  }

  const sendMine = async () => {
    const result = await sendMessage(activeMatch.id, "me", compose);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setCompose("");
  };

  const sendTheirs = async () => {
    const result = await sendAutoReply(activeMatch.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.chatWrap}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <View style={styles.chatHeader}>
        <Pressable onPress={closeChatWithGuard}>
          <Text style={styles.back}>{"< Back"}</Text>
        </Pressable>
        <View style={styles.headerIdentity}>
          {activeMatch.avatarUrl ? (
            <Image source={{ uri: activeMatch.avatarUrl }} style={styles.headerAvatar} resizeMode="cover" />
          ) : (
            <View style={styles.headerAvatarFallback}>
              <Text style={styles.headerAvatarFallbackText}>
                {activeMatch.name.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.chatName}>{activeMatch.name}</Text>
        </View>
        <Text style={styles.counts}>
          You {activeMatch.messagesUsedByMe}/30 | Them {activeMatch.messagesUsedByThem}/30
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={activeMatch.chat}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatList}
        style={styles.chatListSurface}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.sender === "me" ? styles.myBubble : styles.theirBubble]}>
            <Text style={[styles.bubbleText, item.sender === "me" && styles.myBubbleText]}>{item.body}</Text>
          </View>
        )}
      />

      {meetSummary}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!capReached && (
        <View style={styles.composeWrap}>
          <TextInput
            value={compose}
            onChangeText={setCompose}
            placeholder="Write a message..."
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
          />
          <View style={styles.composeActions}>
            <Pressable style={styles.composeBtn} onPress={sendMine}>
              <Text style={styles.composeBtnText}>Send</Text>
            </Pressable>
            <Pressable style={[styles.composeBtn, styles.replyBtn]} onPress={sendTheirs}>
              <Text style={styles.composeBtnText}>Sim Reply</Text>
            </Pressable>
          </View>
        </View>
      )}

      {decisionModal}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  listWrap: { gap: 10, paddingBottom: 8 },
  listCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: 14,
    gap: 4
  },
  listRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center"
  },
  listTextWrap: {
    flex: 1
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EEE"
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EDE7F6",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarFallbackText: {
    color: theme.colors.primary,
    fontWeight: "800",
    fontSize: 18
  },
  name: { fontWeight: "700", fontSize: 18, color: theme.colors.text },
  preview: { color: theme.colors.muted },
  meta: { color: theme.colors.primary, fontWeight: "600", marginTop: 4 },
  cappedLabel: { color: theme.colors.danger, fontWeight: "700", marginTop: 2 },

  chatWrap: { gap: 10, flex: 1 },
  chatHeader: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: 12,
    gap: 4
  },
  back: { color: theme.colors.primary, fontWeight: "700" },
  headerIdentity: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center"
  },
  headerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EEE"
  },
  headerAvatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EDE7F6",
    alignItems: "center",
    justifyContent: "center"
  },
  headerAvatarFallbackText: {
    color: theme.colors.primary,
    fontWeight: "800"
  },
  chatName: { color: theme.colors.text, fontSize: 18, fontWeight: "700" },
  counts: { color: theme.colors.muted },
  chatListSurface: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    flex: 1,
    minHeight: 0
  },
  chatList: {
    padding: 12,
    gap: 8
  },
  bubble: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    maxWidth: "85%"
  },
  myBubble: {
    alignSelf: "flex-end",
    backgroundColor: theme.colors.primary
  },
  theirBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#EDE7F6"
  },
  bubbleText: { color: theme.colors.text },
  myBubbleText: { color: "#fff" },

  promptCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: 12,
    gap: 10
  },
  promptTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "700" },
  modalSub: { color: theme.colors.muted, marginTop: 6, marginBottom: 6 },
  promptRow: { gap: 6 },
  promptLabel: { color: theme.colors.muted },
  promptActions: { flexDirection: "row", gap: 8 },
  promptBtn: {
    flex: 1,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    paddingVertical: 8
  },
  promptBtnYes: { backgroundColor: theme.colors.success },
  promptBtnNo: { backgroundColor: theme.colors.danger },
  promptBtnText: { color: "#fff", fontWeight: "700" },
  promptStatus: { color: theme.colors.text },

  composeWrap: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: 12,
    gap: 8,
    marginBottom: 4
  },
  input: {
    backgroundColor: "#F2ECF8",
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text
  },
  composeActions: { flexDirection: "row", gap: 8 },
  composeBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    paddingVertical: 10
  },
  replyBtn: { backgroundColor: theme.colors.primaryLight },
  composeBtnText: { color: "#fff", fontWeight: "700" },
  error: { color: theme.colors.danger, fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.42)",
    justifyContent: "center",
    padding: 18
  },
  modalCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 14,
    gap: 10
  }
});
