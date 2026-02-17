import { useEffect } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { MatchPreview, OutTonightState } from "../types";
import { theme } from "../theme";

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
  chooseCandidate: (matchId: string) => void;
  sendMeetOffer: (placeLabel: string) => void;
  respondToMeetOffer: (accept: boolean) => void;
  syncMeetupTimers: () => void;
}) {
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

  return (
    <View style={styles.wrap}>
      <View style={styles.sessionCard}>
        <Text style={styles.sessionTitle}>Out Tonight</Text>
        <Text style={styles.sessionSub}>Mutual yes matches: {eligibleOutCount}</Text>
        <View style={styles.sessionActions}>
          {!outTonight.enabled ? (
            <View style={styles.logoActionWrap}>
              <Pressable
                style={[
                  styles.logoBtn,
                  eligibleOutCount === 0 && styles.actionBtnDisabled
                ]}
                disabled={eligibleOutCount === 0}
                onPress={startOutTonight}
              >
                <Text style={styles.logoMark}>🤝</Text>
                <Text style={styles.logoBtnText}>Go Open Tonight</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={[styles.actionBtn, styles.closeBtn]} onPress={stopOutTonight}>
              <Text style={styles.actionBtnText}>Close Session</Text>
            </Pressable>
          )}
        </View>
        {eligibleOutCount === 0 ? <Text style={styles.flowHint}>No mutual yes matches yet.</Text> : null}
        {outTonight.error ? <Text style={styles.errorText}>{outTonight.error}</Text> : null}

        {outTonight.enabled && (
          <View style={styles.flowWrap}>
            <Text style={styles.flowTitle}>Interested now</Text>
            <Pressable style={[styles.actionBtn, styles.secondaryBtn]} onPress={simulateCandidateResponses}>
              <Text style={styles.actionBtnText}>Refresh Responses</Text>
            </Pressable>

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
                    <Pressable key={place} style={styles.placeBtn} onPress={() => sendMeetOffer(place)}>
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

      {matches.map((match) => {
        const capped = messageCapReached(match);
        const bothYes = bothMeetYes(match);
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
            <View style={[styles.meetBadge, bothYes ? styles.meetBadgeYes : styles.meetBadgePending]}>
              <Text style={styles.meetBadgeText}>
                {bothYes ? "Both said YES" : "Meet status: Not yet"}
              </Text>
            </View>
            {!capped ? <Text style={styles.detail}>Messaging in progress</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  sessionCard: {
    backgroundColor: "#EDE7F6",
    borderRadius: theme.radius.md,
    padding: 14,
    gap: 8
  },
  sessionTitle: { fontSize: 20, fontWeight: "800", color: theme.colors.primary },
  sessionSub: { color: theme.colors.muted },
  sessionActions: { marginTop: 2 },
  logoActionWrap: {
    alignItems: "center",
    marginTop: 4
  },
  logoBtn: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  logoMark: {
    fontSize: 42,
    marginBottom: 8
  },
  logoBtnText: {
    color: "#fff",
    fontWeight: "800",
    textAlign: "center"
  },
  actionBtn: {
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    alignItems: "center"
  },
  openBtn: { backgroundColor: theme.colors.primary },
  closeBtn: { backgroundColor: theme.colors.danger },
  secondaryBtn: { backgroundColor: theme.colors.primaryLight },
  acceptBtn: { backgroundColor: theme.colors.success, flex: 1 },
  declineBtn: { backgroundColor: theme.colors.danger, flex: 1 },
  actionBtnText: { color: "#fff", fontWeight: "700" },
  actionBtnDisabled: { opacity: 0.45 },
  flowWrap: { marginTop: 6, gap: 8 },
  flowTitle: { color: theme.colors.text, fontWeight: "700" },
  flowHint: { color: theme.colors.muted },
  errorText: { color: theme.colors.danger, fontWeight: "600" },
  candidateRow: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.sm,
    padding: 10,
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
    fontWeight: "800"
  },
  candidateName: { flex: 1, color: theme.colors.text, fontWeight: "700" },
  candidateStatusChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  statusYes: {
    backgroundColor: "#D8F3E7"
  },
  statusNo: {
    backgroundColor: "#FBE7E7"
  },
  statusPending: {
    backgroundColor: "#ECECEC"
  },
  candidateStatus: { color: theme.colors.primary, fontWeight: "700", fontSize: 11 },
  pickBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  pickBtnDisabled: { opacity: 0.35 },
  pickBtnActive: { backgroundColor: theme.colors.success },
  pickBtnText: { color: "#fff", fontWeight: "700" },
  offerWrap: { gap: 8 },
  placeList: { gap: 6 },
  placeBtn: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  placeBtnText: { color: theme.colors.primary, fontWeight: "700" },
  offerState: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.sm,
    padding: 10,
    gap: 6
  },
  offerStateText: { color: theme.colors.text },
  offerAccepted: { color: theme.colors.success, fontWeight: "700" },
  offerActions: { flexDirection: "row", gap: 8 },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: 14,
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
    fontWeight: "800"
  },
  name: { fontSize: 18, fontWeight: "700", color: theme.colors.text },
  detail: { color: theme.colors.muted },
  meetBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  meetBadgeYes: {
    backgroundColor: "#D8F3E7"
  },
  meetBadgePending: {
    backgroundColor: "#ECECEC"
  },
  meetBadgeText: {
    color: theme.colors.text,
    fontWeight: "700",
    fontSize: 12
  }
});
