import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { MatchPreview, OutTonightState } from "../types";
import { theme } from "../theme";

const FONT_REGULAR = "Satoshi-Regular";
const FONT_MEDIUM = "Satoshi-Medium";

const PLACE_OPTIONS = [
  "Starbucks - Main Street",
  "Whole Foods Cafe - Downtown",
  "Public Library Courtyard",
  "City Park Main Entrance"
];

const fmtCountdown = (targetTs: number | null) => {
  if (!targetTs) {
    return "--:--";
  }
  const diffMs = Math.max(targetTs - Date.now(), 0);
  const totalSec = Math.floor(diffMs / 1000);
  const min = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const sec = (totalSec % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
};

const getOutLabel = () => {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) {
    return "Out This Morning?";
  }
  if (hour >= 12 && hour < 17) {
    return "Out This Afternoon?";
  }
  return "Out Tonight?";
};

const isMeetupLockedWindow = () => {
  const hour = new Date().getHours();
  return hour >= 2 && hour < 4;
};

export function ActiveMatchesScreen({
  matches,
  openMatchProfile,
  bothMeetYes,
  messageCapReached,
  outTonight,
  eligibleOutCount,
  startOutTonight,
  stopOutTonight,
  simulateCandidateResponses,
  showDevTools = false,
  chooseCandidate,
  sendMeetOffer,
  respondToMeetOffer,
  syncMeetupTimers
}: {
  matches: MatchPreview[];
  openMatchProfile: (matchId: string) => void;
  bothMeetYes: (match: MatchPreview) => boolean;
  messageCapReached: (match: MatchPreview) => boolean;
  outTonight: OutTonightState;
  eligibleOutCount: number;
  startOutTonight: () => void;
  stopOutTonight: () => void;
  simulateCandidateResponses: () => void;
  showDevTools?: boolean;
  chooseCandidate: (matchId: string) => void;
  sendMeetOffer: (placeLabel: string) => void;
  respondToMeetOffer: (accept: boolean) => void;
  syncMeetupTimers: () => void;
}) {
  const [showMessagingPhase, setShowMessagingPhase] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      syncMeetupTimers();
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const selectedCandidate = outTonight.candidates.find(
    (candidate) => candidate.matchId === outTonight.selectedCandidateMatchId
  );

  const yesCandidates = outTonight.candidates.filter((candidate) => candidate.response === "yes");
  const readyMatches = matches.filter((match) => bothMeetYes(match));
  const messagingMatches = matches.filter((match) => !bothMeetYes(match));
  const outLabel = getOutLabel();
  const meetupLocked = isMeetupLockedWindow();

  return (
    <View style={styles.wrap}>
      <View style={styles.sessionCard}>
        <Text style={styles.sessionTitle}>{outLabel}</Text>
        <Text style={styles.sessionSub}>Eligible tonight: {eligibleOutCount}</Text>
        <View style={styles.sessionActions}>
          {!outTonight.enabled ? (
            <View style={styles.logoActionWrap}>
              <Pressable
                style={[
                  styles.logoBtn,
                  (eligibleOutCount === 0 || meetupLocked) && styles.actionBtnDisabled
                ]}
                disabled={eligibleOutCount === 0 || meetupLocked}
                onPress={startOutTonight}
              >
                <Text style={styles.logoMark}>🤝</Text>
                <Text style={styles.logoBtnText}>Go Open</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={[styles.actionBtn, styles.closeBtn]} onPress={stopOutTonight}>
              <Text style={styles.actionBtnText}>Close Session</Text>
            </Pressable>
          )}
        </View>
        {meetupLocked ? (
          <Text style={styles.flowHint}>For safety, meetup offers and location sharing are paused from 2:00 AM to 4:00 AM.</Text>
        ) : null}
        {eligibleOutCount === 0 ? <Text style={styles.flowHint}>No mutual yes matches yet.</Text> : null}
        {outTonight.error ? <Text style={styles.errorText}>{outTonight.error}</Text> : null}

        {outTonight.enabled && (
          <View style={styles.flowWrap}>
            <Text style={styles.flowTitle}>Interested now</Text>
            {showDevTools ? (
              <Pressable style={[styles.actionBtn, styles.secondaryBtn]} onPress={simulateCandidateResponses}>
                <Text style={styles.actionBtnText}>Refresh Responses</Text>
              </Pressable>
            ) : null}

            {outTonight.candidates.length === 0 ? (
              <Text style={styles.flowHint}>No candidates yet.</Text>
            ) : (
              outTonight.candidates.map((candidate) => (
                <View key={candidate.matchId} style={styles.candidateRow}>
                  <Pressable onPress={() => openMatchProfile(candidate.matchId)}>
                    {candidate.photos && candidate.photos[0] ? (
                      <Image source={{ uri: candidate.photos[0] }} style={styles.candidateAvatar} />
                    ) : (
                      <View style={styles.candidateAvatarFallback}>
                        <Text style={styles.candidateAvatarFallbackText}>
                          {candidate.name.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                  <Text style={styles.candidateName}>{candidate.name}</Text>
                  <View
                    style={[
                      styles.candidateStatusChip,
                      candidate.response === "yes"
                        ? styles.statusYes
                        : candidate.response === "no"
                          ? styles.statusNo
                          : styles.statusPending
                    ]}
                  >
                    <Text style={styles.candidateStatus}>{candidate.response.toUpperCase()}</Text>
                  </View>
                  <Pressable
                    disabled={candidate.response !== "yes"}
                    onPress={() => chooseCandidate(candidate.matchId)}
                    style={[
                      styles.pickBtn,
                      candidate.response !== "yes" && styles.pickBtnDisabled,
                      outTonight.selectedCandidateMatchId === candidate.matchId && styles.pickBtnActive
                    ]}
                  >
                    <Text style={styles.pickBtnText}>Pick</Text>
                  </Pressable>
                </View>
              ))
            )}

            {yesCandidates.length > 0 && !outTonight.selectedCandidateMatchId && (
              <Text style={styles.flowHint}>Pick one YES to send location.</Text>
            )}

            {selectedCandidate && (
              <View style={styles.offerWrap}>
                <Text style={styles.flowTitle}>Send public place to {selectedCandidate.name}</Text>
                <View style={styles.placeList}>
                  {PLACE_OPTIONS.map((place) => (
                    <Pressable
                      key={place}
                      style={[styles.placeBtn, meetupLocked && styles.actionBtnDisabled]}
                      onPress={() => sendMeetOffer(place)}
                      disabled={meetupLocked}
                    >
                      <Text style={styles.placeBtnText}>{place}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {outTonight.offerStatus === "pending" && (
              <View style={styles.offerState}>
                <Text style={styles.offerStateText}>Offer sent: {outTonight.selectedPlaceLabel}</Text>
                <Text style={styles.offerStateText}>
                  Waiting for recipient response: {fmtCountdown(outTonight.offerRespondBy)}
                </Text>
                <View style={styles.offerActions}>
                  <Pressable style={[styles.actionBtn, styles.acceptBtn]} onPress={() => respondToMeetOffer(true)}>
                    <Text style={styles.actionBtnText}>Accept</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, styles.declineBtn]} onPress={() => respondToMeetOffer(false)}>
                    <Text style={styles.actionBtnText}>Decline</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {outTonight.offerStatus === "accepted" && (
              <View style={styles.offerState}>
                <Text style={styles.offerAccepted}>Meetup confirmed at: {outTonight.selectedPlaceLabel}</Text>
                <Text style={styles.offerStateText}>
                  Location expires in: {fmtCountdown(outTonight.locationExpiresAt)}
                </Text>
                <Text style={styles.offerStateText}>
                  Coordination chat ends in: {fmtCountdown(outTonight.coordinationEndsAt)}
                </Text>
              </View>
            )}

            {(outTonight.offerStatus === "declined" || outTonight.offerStatus === "expired") && (
              <Text style={styles.flowHint}>
                Offer {outTonight.offerStatus}. Pick another YES and resend.
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Open to meeting</Text>
        {readyMatches.length === 0 ? <Text style={styles.flowHint}>No matches are ready yet.</Text> : null}
      </View>

      {readyMatches.map((match) => {
        const capped = messageCapReached(match);
        return (
          <View key={match.id} style={styles.card}>
            <View style={styles.matchHeaderRow}>
              <Pressable onPress={() => openMatchProfile(match.id)}>
                {match.avatarUrl ? (
                  <Image source={{ uri: match.avatarUrl }} style={styles.matchAvatar} />
                ) : (
                  <View style={styles.matchAvatarFallback}>
                    <Text style={styles.matchAvatarFallbackText}>
                      {match.name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
              </Pressable>
              <Text style={styles.name}>{match.name}</Text>
            </View>
            <View style={[styles.meetBadge, styles.meetBadgeYes]}>
              <Text style={styles.meetBadgeText}>Both said YES</Text>
            </View>
            {!capped ? <Text style={styles.detail}>Messaging in progress</Text> : null}
          </View>
        );
      })}

      <Pressable style={styles.sectionCard} onPress={() => setShowMessagingPhase((prev) => !prev)}>
        <View style={styles.dropdownHeader}>
          <Text style={styles.sectionTitle}>Messaging Phase ({messagingMatches.length})</Text>
          <Text style={styles.dropdownCaret}>{showMessagingPhase ? "▾" : "▸"}</Text>
        </View>
        <Text style={styles.sectionSubtext}>People you matched with who haven’t both said yes yet.</Text>
      </Pressable>

      {showMessagingPhase
        ? messagingMatches.map((match) => {
            const capped = messageCapReached(match);
            return (
              <View key={match.id} style={styles.card}>
                <View style={styles.matchHeaderRow}>
                  <Pressable onPress={() => openMatchProfile(match.id)}>
                    {match.avatarUrl ? (
                      <Image source={{ uri: match.avatarUrl }} style={styles.matchAvatar} />
                    ) : (
                      <View style={styles.matchAvatarFallback}>
                        <Text style={styles.matchAvatarFallbackText}>
                          {match.name.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                  <Text style={styles.name}>{match.name}</Text>
                </View>
                <View style={[styles.meetBadge, styles.meetBadgePending]}>
                  <Text style={styles.meetBadgeText}>Meet status: Not yet</Text>
                </View>
                {!capped ? <Text style={styles.detail}>Messaging in progress</Text> : null}
              </View>
            );
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  sectionCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: "#EADCF8",
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4
  },
  sectionTitle: {
    color: theme.colors.text,
    fontWeight: "700",
    fontSize: 14,
    fontFamily: FONT_REGULAR
  },
  sectionSubtext: {
    color: theme.colors.muted,
    fontSize: 12,
    fontFamily: FONT_MEDIUM
  },
  dropdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  dropdownCaret: {
    color: theme.colors.primary,
    fontSize: 15,
    fontWeight: "700",
    fontFamily: FONT_REGULAR
  },
  sessionCard: {
    backgroundColor: "#EDE7F6",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: "#E4D8F2",
    padding: 12,
    gap: 8
  },
  sessionTitle: { fontSize: 19, fontWeight: "800", color: theme.colors.primary, fontFamily: FONT_REGULAR },
  sessionSub: { color: theme.colors.muted, fontSize: 12, fontFamily: FONT_MEDIUM },
  sessionActions: { marginTop: 0 },
  logoActionWrap: {
    alignItems: "center",
    marginTop: 4
  },
  logoBtn: {
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  logoMark: {
    fontSize: 36,
    marginBottom: 6
  },
  logoBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
    fontFamily: FONT_REGULAR
  },
  actionBtn: {
    borderRadius: theme.radius.sm,
    paddingVertical: 9,
    alignItems: "center"
  },
  openBtn: { backgroundColor: theme.colors.primary },
  closeBtn: { backgroundColor: theme.colors.danger },
  secondaryBtn: { backgroundColor: theme.colors.primaryLight },
  acceptBtn: { backgroundColor: theme.colors.success, flex: 1 },
  declineBtn: { backgroundColor: theme.colors.danger, flex: 1 },
  actionBtnText: { color: "#fff", fontWeight: "700", fontFamily: FONT_REGULAR },
  actionBtnDisabled: { opacity: 0.45 },
  flowWrap: { marginTop: 4, gap: 8 },
  flowTitle: { color: theme.colors.text, fontWeight: "700", fontFamily: FONT_REGULAR },
  flowHint: { color: theme.colors.muted, fontFamily: FONT_MEDIUM },
  errorText: { color: theme.colors.danger, fontWeight: "600", fontFamily: FONT_MEDIUM },
  candidateRow: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: "#EADCF8",
    padding: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  candidateAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18
  },
  candidateAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EDE7F6",
    alignItems: "center",
    justifyContent: "center"
  },
  candidateAvatarFallbackText: {
    color: theme.colors.primary,
    fontWeight: "800",
    fontFamily: FONT_REGULAR
  },
  candidateName: { flex: 1, color: theme.colors.text, fontWeight: "700", fontFamily: FONT_REGULAR },
  candidateStatusChip: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1
  },
  statusYes: {
    backgroundColor: "#ECF9F2",
    borderColor: "#BEEAD4"
  },
  statusNo: {
    backgroundColor: "#FDEEEE",
    borderColor: "#F3CBCF"
  },
  statusPending: {
    backgroundColor: "#F2F2F4",
    borderColor: "#E2E2E6"
  },
  candidateStatus: { color: theme.colors.muted, fontWeight: "600", fontSize: 10, letterSpacing: 0.2, fontFamily: FONT_MEDIUM },
  pickBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  pickBtnDisabled: { opacity: 0.35 },
  pickBtnActive: { backgroundColor: theme.colors.success },
  pickBtnText: { color: "#fff", fontWeight: "700", fontFamily: FONT_REGULAR },
  offerWrap: { gap: 8 },
  placeList: { gap: 6 },
  placeBtn: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: "#EADCF8",
    paddingVertical: 9,
    paddingHorizontal: 10
  },
  placeBtnText: { color: theme.colors.primary, fontWeight: "700", fontFamily: FONT_REGULAR },
  offerState: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: "#EADCF8",
    padding: 10,
    gap: 6
  },
  offerStateText: { color: theme.colors.text, fontFamily: FONT_MEDIUM },
  offerAccepted: { color: theme.colors.success, fontWeight: "700", fontFamily: FONT_REGULAR },
  offerActions: { flexDirection: "row", gap: 8 },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: "#EADCF8",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 6
  },
  matchHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  matchAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20
  },
  matchAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EDE7F6",
    alignItems: "center",
    justifyContent: "center"
  },
  matchAvatarFallbackText: {
    color: theme.colors.primary,
    fontWeight: "800",
    fontFamily: FONT_REGULAR
  },
  name: { fontSize: 17, fontWeight: "700", color: theme.colors.text, fontFamily: FONT_REGULAR },
  detail: { color: theme.colors.muted, fontSize: 12, fontFamily: FONT_MEDIUM },
  meetBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  meetBadgeYes: {
    backgroundColor: "#ECF9F2",
    borderColor: "#BEEAD4"
  },
  meetBadgePending: {
    backgroundColor: "#F2F2F4",
    borderColor: "#E2E2E6"
  },
  meetBadgeText: {
    color: theme.colors.muted,
    fontWeight: "600",
    fontSize: 11,
    fontFamily: FONT_MEDIUM
  }
});
