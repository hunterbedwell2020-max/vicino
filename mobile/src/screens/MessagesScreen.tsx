import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { theme } from "../theme";
import type { MatchPreview, MeetDecision } from "../types";

const FONT_REGULAR = "Satoshi-Regular";
const FONT_MEDIUM = "Satoshi-Medium";

export function MessagesScreen({
  matches,
  activeMatch,
  openMatchProfile,
  openChat,
  closeChat,
  sendMessage,
  sendAutoReply,
  messageCapReached,
  setMeetDecision,
  blockMatch,
  unmatch,
  bothMeetYes,
  showDevTools = false,
  refreshing = false,
  onRefresh
}: {
  matches: MatchPreview[];
  activeMatch: MatchPreview | null;
  openMatchProfile: (matchId: string) => void;
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
  blockMatch: (matchId: string) => Promise<void>;
  unmatch: (matchId: string) => Promise<void>;
  bothMeetYes: (match: MatchPreview) => boolean;
  showDevTools?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const [compose, setCompose] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [meetPromptOpen, setMeetPromptOpen] = useState(false);
  const [decisionBusyKey, setDecisionBusyKey] = useState<string | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [menuBusy, setMenuBusy] = useState<string | null>(null);
  const listRef = useRef<FlatList<{ id: string; sender: "me" | "them"; body: string }>>(null);

  const capReached = activeMatch ? messageCapReached(activeMatch) : false;

  const formatInboxTime = (value?: string) => {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    const daysAgo = (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000);
    if (daysAgo < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    }
    return date.toLocaleDateString([], { month: "numeric", day: "numeric" });
  };

  const sortedMatches = useMemo(() => {
    const rows = [...matches];
    rows.sort((a, b) => {
      const aLast = a.chat[a.chat.length - 1] ?? null;
      const bLast = b.chat[b.chat.length - 1] ?? null;
      const aAwaiting = Boolean(aLast && aLast.sender === "them" && !messageCapReached(a));
      const bAwaiting = Boolean(bLast && bLast.sender === "them" && !messageCapReached(b));
      if (aAwaiting !== bAwaiting) {
        return aAwaiting ? -1 : 1;
      }

      const aTime = aLast ? new Date(aLast.createdAt).getTime() : 0;
      const bTime = bLast ? new Date(bLast.createdAt).getTime() : 0;
      if (aTime !== bTime) {
        return bTime - aTime;
      }

      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [matches, messageCapReached]);

  const meetSummary = useMemo(() => {
    if (!activeMatch || bothMeetYes(activeMatch)) {
      return null;
    }

    return (
      <View style={styles.promptCompactCard}>
        <Pressable style={styles.promptCompactHeader} onPress={() => setMeetPromptOpen((prev) => !prev)}>
          <Text style={styles.promptCompactTitle}>Would you like to meet?</Text>
          <Text style={styles.promptCompactCaret}>{meetPromptOpen ? "▾" : "▸"}</Text>
        </Pressable>
        {!meetPromptOpen ? null : (
          <>
            <View style={styles.promptRow}>
              <Text style={styles.promptLabel}>Your answer:</Text>
              <View style={styles.promptActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.promptBtn,
                    activeMatch.meetDecisionByMe === "yes" && styles.promptBtnYes,
                    pressed && styles.pressedBtn
                  ]}
                  disabled={decisionBusyKey !== null}
                  onPress={() => void submitMeetDecision(activeMatch.id, "me", "yes")}
                >
                  <Text style={styles.promptBtnText}>
                    {decisionBusyKey === `${activeMatch.id}:me:yes` ? "..." : "Yes"}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.promptBtn,
                    activeMatch.meetDecisionByMe === "no" && styles.promptBtnNo,
                    pressed && styles.pressedBtn
                  ]}
                  disabled={decisionBusyKey !== null}
                  onPress={() => void submitMeetDecision(activeMatch.id, "me", "no")}
                >
                  <Text style={styles.promptBtnText}>
                    {decisionBusyKey === `${activeMatch.id}:me:no` ? "..." : "No"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {showDevTools ? (
              <View style={styles.promptRow}>
                <Text style={styles.promptLabel}>Simulate their answer:</Text>
                <View style={styles.promptActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.promptBtn,
                      activeMatch.meetDecisionByThem === "yes" && styles.promptBtnYes,
                      pressed && styles.pressedBtn
                    ]}
                    disabled={decisionBusyKey !== null}
                    onPress={() => void submitMeetDecision(activeMatch.id, "them", "yes")}
                  >
                    <Text style={styles.promptBtnText}>
                      {decisionBusyKey === `${activeMatch.id}:them:yes` ? "..." : "Yes"}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.promptBtn,
                      activeMatch.meetDecisionByThem === "no" && styles.promptBtnNo,
                      pressed && styles.pressedBtn
                    ]}
                    disabled={decisionBusyKey !== null}
                    onPress={() => void submitMeetDecision(activeMatch.id, "them", "no")}
                  >
                    <Text style={styles.promptBtnText}>
                      {decisionBusyKey === `${activeMatch.id}:them:no` ? "..." : "No"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <Text style={styles.promptStatus}>
              {capReached
                ? "Messages capped. Waiting for both decisions."
                : "You can decide now or later. Both need to select yes."}
            </Text>
          </>
        )}
      </View>
    );
  }, [activeMatch, capReached, bothMeetYes, setMeetDecision, showDevTools, meetPromptOpen, decisionBusyKey]);

  const closeChatWithGuard = () => {
    closeChat();
  };

  useEffect(() => {
    if (!activeMatch) {
      return;
    }
    if (capReached && !bothMeetYes(activeMatch)) {
      setMeetPromptOpen(true);
    }
  }, [activeMatch?.id, activeMatch?.messagesUsedByMe, activeMatch?.messagesUsedByThem, capReached, bothMeetYes]);

  useEffect(() => {
    setActionMenuOpen(false);
  }, [activeMatch?.id]);

  async function submitMeetDecision(
    matchId: string,
    user: "me" | "them",
    decision: MeetDecision
  ) {
    const key = `${matchId}:${user}:${decision}`;
    setDecisionBusyKey(key);
    try {
      await setMeetDecision(matchId, user, decision);
    } finally {
      setDecisionBusyKey(null);
    }
  }

  async function runMenuAction(action: "block" | "unmatch" | "meet", task: () => Promise<void> | void) {
    setMenuBusy(action);
    try {
      await Promise.resolve(task());
      setActionMenuOpen(false);
    } finally {
      setMenuBusy(null);
    }
  }

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
        data={sortedMatches}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listWrap}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const lastMessage = item.chat[item.chat.length - 1] ?? null;
          const timestamp = formatInboxTime(lastMessage?.createdAt);
          const total = item.messagesUsedByMe + item.messagesUsedByThem;
          const isCapped = messageCapReached(item);
          const preview = lastMessage?.body ?? "No messages yet.";
          const awaitingReply = Boolean(lastMessage && lastMessage.sender === "them" && !isCapped);
          return (
            <Pressable style={styles.listCard} onPress={() => openChat(item.id)}>
              <View style={styles.listRow}>
                <Pressable onPress={() => openMatchProfile(item.id)}>
                  {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={styles.avatar} resizeMode="cover" />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackText}>{item.name.slice(0, 1).toUpperCase()}</Text>
                    </View>
                  )}
                </Pressable>
                <View style={styles.listTextWrap}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{item.name}</Text>
                    {timestamp ? <Text style={styles.timeText}>{timestamp}</Text> : null}
                  </View>
                  <View style={styles.previewRow}>
                    {awaitingReply ? <View style={styles.unreadDot} /> : null}
                    <Text
                      style={[styles.preview, awaitingReply && styles.previewUnread]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {preview}
                    </Text>
                  </View>
                  <Text style={styles.meta}>
                    {awaitingReply ? "Awaiting your reply" : isCapped ? "Messages capped" : `Messages: ${total}/60`}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    );
  }

  const sendMine = async () => {
    if (sending) {
      return;
    }
    setSending(true);
    try {
      const result = await sendMessage(activeMatch.id, "me", compose);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setCompose("");
    } finally {
      setSending(false);
    }
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
      keyboardVerticalOffset={Platform.OS === "ios" ? 104 : 0}
    >
      <View style={styles.chatHeader}>
        <View style={styles.chatTopRow}>
          <Pressable onPress={closeChatWithGuard}>
            <Text style={styles.back}>{"< Back"}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.moreBtn, pressed && styles.pressedBtn]}
            onPress={() => setActionMenuOpen((prev) => !prev)}
          >
            <Text style={styles.moreBtnText}>...</Text>
          </Pressable>
        </View>
        <View style={styles.headerIdentity}>
          <Pressable onPress={() => openMatchProfile(activeMatch.id)}>
            {activeMatch.avatarUrl ? (
              <Image source={{ uri: activeMatch.avatarUrl }} style={styles.headerAvatar} resizeMode="cover" />
            ) : (
              <View style={styles.headerAvatarFallback}>
                <Text style={styles.headerAvatarFallbackText}>
                  {activeMatch.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
          </Pressable>
          <Text style={styles.chatName}>{activeMatch.name}</Text>
        </View>
        <Text style={styles.counts}>
          You {activeMatch.messagesUsedByMe}/30 | Them {activeMatch.messagesUsedByThem}/30
        </Text>
        {actionMenuOpen ? (
          <View style={styles.headerMenu}>
            <Pressable
              style={({ pressed }) => [styles.headerMenuItem, pressed && styles.pressedBtn]}
              disabled={Boolean(menuBusy)}
              onPress={() =>
                void runMenuAction("meet", async () => {
                  setMeetPromptOpen(true);
                })
              }
            >
              <Text style={styles.headerMenuItemText}>
                {menuBusy === "meet" ? "Opening..." : "Open to meet"}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.headerMenuItem, pressed && styles.pressedBtn]}
              disabled={Boolean(menuBusy)}
              onPress={() => void runMenuAction("unmatch", () => unmatch(activeMatch.id))}
            >
              <Text style={styles.headerMenuItemText}>
                {menuBusy === "unmatch" ? "Unmatching..." : "Unmatch"}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.headerMenuItem, pressed && styles.pressedBtn]}
              disabled={Boolean(menuBusy)}
              onPress={() => void runMenuAction("block", () => blockMatch(activeMatch.id))}
            >
              <Text style={[styles.headerMenuItemText, styles.headerMenuDanger]}>
                {menuBusy === "block" ? "Blocking..." : "Block"}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {meetPromptOpen || capReached ? meetSummary : null}

      <FlatList
        ref={listRef}
        data={activeMatch.chat}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatList}
        style={styles.chatListSurface}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.sender === "me" ? styles.myBubble : styles.theirBubble]}>
            <Text style={[styles.bubbleText, item.sender === "me" && styles.myBubbleText]}>{item.body}</Text>
          </View>
        )}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!capReached && (
        <View style={styles.composeWrap}>
          <View style={styles.inputRow}>
            <TextInput
              value={compose}
              onChangeText={setCompose}
              placeholder="Write a message..."
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
              returnKeyType="send"
              onSubmitEditing={() => void sendMine()}
            />
            <Pressable
              style={({ pressed }) => [styles.sendFab, sending && styles.sendFabDisabled, pressed && styles.pressedBtn]}
              onPress={() => void sendMine()}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sendFabIcon}>✈</Text>
              )}
            </Pressable>
          </View>
          <View style={styles.composeActions}>
            {error ? (
              <Pressable
                style={({ pressed }) => [styles.composeBtn, styles.retryBtn, pressed && styles.pressedBtn]}
                onPress={() => void sendMine()}
                disabled={sending}
              >
                <Text style={[styles.composeBtnText, styles.retryBtnText]}>Retry Send</Text>
              </Pressable>
            ) : null}
            {showDevTools ? (
              <Pressable style={({ pressed }) => [styles.composeBtn, styles.replyBtn, pressed && styles.pressedBtn]} onPress={sendTheirs}>
                <Text style={styles.composeBtnText}>Sim Reply</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  listWrap: { gap: 8, paddingBottom: 8 },
  listCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: "#EADCF8",
    paddingVertical: 12,
    paddingHorizontal: 12,
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
  nameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
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
    fontSize: 18,
    fontFamily: FONT_REGULAR
  },
  name: { fontWeight: "700", fontSize: 17, color: theme.colors.text, fontFamily: FONT_REGULAR },
  timeText: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "600",
    fontFamily: FONT_MEDIUM
  },
  previewRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary
  },
  preview: { color: theme.colors.muted, flex: 1, fontSize: 13, fontFamily: FONT_MEDIUM },
  previewUnread: {
    color: theme.colors.text,
    fontWeight: "600",
    fontFamily: FONT_REGULAR
  },
  meta: { color: theme.colors.primary, fontWeight: "600", marginTop: 4, fontSize: 12, fontFamily: FONT_MEDIUM },

  chatWrap: { gap: 10, flex: 1 },
  chatHeader: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: "#EADCF8",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4
  },
  chatTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  back: { color: theme.colors.primary, fontWeight: "700", fontFamily: FONT_REGULAR },
  moreBtn: {
    minWidth: 36,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#F2ECF8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },
  moreBtnText: {
    color: theme.colors.primary,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: -4,
    fontFamily: FONT_REGULAR
  },
  headerMenu: {
    marginTop: 8,
    alignSelf: "flex-end",
    width: 168,
    backgroundColor: "#FFFFFF",
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: "#EADCF8",
    overflow: "hidden"
  },
  headerMenuItem: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F1E8FA"
  },
  headerMenuItemText: {
    color: theme.colors.text,
    fontSize: 14,
    fontFamily: FONT_MEDIUM
  },
  headerMenuDanger: {
    color: theme.colors.danger
  },
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
    fontWeight: "800",
    fontFamily: FONT_REGULAR
  },
  chatName: { color: theme.colors.text, fontSize: 18, fontWeight: "700", fontFamily: FONT_REGULAR },
  counts: { color: theme.colors.muted, fontSize: 12, fontFamily: FONT_MEDIUM },
  chatListSurface: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: "#EADCF8",
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
  bubbleText: { color: theme.colors.text, fontFamily: FONT_MEDIUM },
  myBubbleText: { color: "#fff", fontFamily: FONT_MEDIUM },

  promptCompactCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: "#EADCF8",
    padding: 12,
    gap: 8
  },
  promptCompactHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  promptCompactTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  },
  promptCompactCaret: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  },
  promptRow: { gap: 6 },
  promptLabel: { color: theme.colors.muted, fontFamily: FONT_MEDIUM },
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
  promptBtnText: { color: "#fff", fontWeight: "700", fontFamily: FONT_REGULAR },
  promptStatus: { color: theme.colors.text, fontSize: 13, lineHeight: 18, fontFamily: FONT_MEDIUM },

  composeWrap: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: "#EADCF8",
    padding: 12,
    gap: 8,
    marginBottom: 4
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  input: {
    flex: 1,
    backgroundColor: "#F2ECF8",
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    fontFamily: FONT_MEDIUM
  },
  sendFab: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  sendFabDisabled: { opacity: 0.7 },
  sendFabIcon: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    marginLeft: 1,
    fontFamily: FONT_REGULAR
  },
  composeActions: { flexDirection: "row", gap: 8 },
  composeBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    paddingVertical: 9
  },
  retryBtn: { backgroundColor: "#F3ECFB" },
  retryBtnText: { color: theme.colors.primary },
  replyBtn: { backgroundColor: theme.colors.primaryLight },
  composeBtnText: { color: "#fff", fontWeight: "700", fontFamily: FONT_REGULAR },
  error: { color: theme.colors.danger, fontWeight: "600", fontFamily: FONT_MEDIUM },
  pressedBtn: {
    opacity: 0.78
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.42)",
    justifyContent: "center",
    padding: 18
  },
  modalCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: "#EADCF8",
    padding: 14,
    gap: 10
  }
});
