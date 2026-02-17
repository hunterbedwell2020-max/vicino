import { useEffect, useMemo, useRef, useState } from "react";
import {
  getAvailabilityState,
  getDiscovery,
  getMatches,
  getMessages,
  getUsers,
  postAvailabilityClose,
  postAvailabilityRespondInterest,
  postAvailabilityStart,
  postMeetDecision,
  postMessage,
  postOffer,
  postOfferRespond,
  postSwipe,
  type ApiMatch,
  type ApiOffer,
  type ApiUser,
  type AvailabilityCandidate
} from "../api";
import type { MatchPreview, MeetDecision, OutTonightState, ProfileCard, TabKey } from "../types";
import { matchSeed, swipeDeckSeed } from "./mockData";

const MAX_PER_PERSON = 30;
const MAX_TOTAL = 60;

const cannedReplies = [
  "Sounds good.",
  "That works for me.",
  "I like that idea.",
  "What time works for you?",
  "Nice, let's keep chatting."
];

const emptyOutTonight = (): OutTonightState => ({
  sessionId: null,
  enabled: false,
  error: null,
  candidates: [],
  selectedCandidateMatchId: null,
  selectedPlaceLabel: null,
  selectedOfferId: null,
  offerStatus: "idle",
  offerRespondBy: null,
  locationExpiresAt: null,
  coordinationEndsAt: null
});

const toDeckCard = (user: ApiUser): ProfileCard => ({
  id: user.id,
  name: user.firstName,
  age: Number(user.age),
  bio: user.bio,
  photos: Array.isArray(user.photos) && user.photos.length > 0 ? user.photos : ["https://picsum.photos/600/900"],
  hobbies: Array.isArray(user.hobbies) && user.hobbies.length > 0 ? user.hobbies : ["Coffee", "Music", "Walking"],
  questionAnswers: [
    {
      question: "My idea of a great night?",
      answer: user.promptOne?.trim() || "Good conversation and a relaxed public spot."
    },
    {
      question: "Something I value in dating?",
      answer: user.promptTwo?.trim() || "Intentionality and clear communication."
    },
    {
      question: "A green flag I look for?",
      answer: user.promptThree?.trim() || "Consistency and kindness."
    }
  ]
});

function toMatchPreview(
  apiMatch: ApiMatch,
  usersById: Record<string, ApiUser>,
  currentUserId: string,
  existing?: MatchPreview
): MatchPreview {
  const otherId = apiMatch.userAId === currentUserId ? apiMatch.userBId : apiMatch.userAId;
  const otherUser = usersById[otherId];

  return {
    id: apiMatch.id,
    name: otherUser?.firstName ?? "Match",
    avatarUrl: otherUser?.profilePhotoUrl
      ? String(otherUser.profilePhotoUrl)
      : otherUser && Array.isArray(otherUser.photos) && otherUser.photos.length > 0
        ? String(otherUser.photos[0])
        : null,
    messagesUsedByMe: Number(apiMatch.messagesByUser?.[currentUserId] ?? 0),
    messagesUsedByThem: Number(apiMatch.messagesByUser?.[otherId] ?? 0),
    meetDecisionByMe: (apiMatch.meetDecisionByUser?.[currentUserId] as MeetDecision | undefined) ?? null,
    meetDecisionByThem: (apiMatch.meetDecisionByUser?.[otherId] as MeetDecision | undefined) ?? null,
    chat: existing?.chat ?? []
  };
}

function mapCandidates(rows: AvailabilityCandidate[]) {
  return rows.map((row) => ({
    matchId: row.matchId,
    userId: row.candidateUserId,
    name: row.firstName,
    response: row.response
  }));
}

function applyOffer(outTonight: OutTonightState, offer: ApiOffer | null): OutTonightState {
  if (!offer) {
    return {
      ...outTonight,
      selectedOfferId: null,
      selectedPlaceLabel: null,
      offerStatus: "idle",
      offerRespondBy: null,
      locationExpiresAt: null,
      coordinationEndsAt: null
    };
  }

  return {
    ...outTonight,
    selectedOfferId: offer.id,
    selectedPlaceLabel: offer.placeLabel,
    offerStatus: offer.status === "location_expired" ? "expired" : offer.status,
    offerRespondBy: offer.respondBy ? new Date(offer.respondBy).getTime() : null,
    locationExpiresAt: offer.locationExpiresAt ? new Date(offer.locationExpiresAt).getTime() : null
  };
}

export function useVicinoState(currentUserId: string | null) {
  const [tab, setTab] = useState<TabKey>("swipe");
  const [deck, setDeck] = useState<ProfileCard[]>(swipeDeckSeed);
  const [matches, setMatches] = useState<MatchPreview[]>(matchSeed);
  const [usersById, setUsersById] = useState<Record<string, ApiUser>>({});
  const [activeChatMatchId, setActiveChatMatchId] = useState<string | null>(null);
  const [acknowledgedMatchIds, setAcknowledgedMatchIds] = useState<Set<string>>(new Set());
  const [matchToastName, setMatchToastName] = useState<string | null>(null);
  const [outTonight, setOutTonight] = useState<OutTonightState>(emptyOutTonight);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outTonightSyncRef = useRef<number>(0);

  const topCard = deck[0] ?? null;
  const activeChatMatch = matches.find((m) => m.id === activeChatMatchId) ?? null;

  const bothMeetYes = (match: MatchPreview) =>
    match.meetDecisionByMe === "yes" && match.meetDecisionByThem === "yes";

  const messageCapReached = (match: MatchPreview) =>
    match.messagesUsedByMe >= MAX_PER_PERSON && match.messagesUsedByThem >= MAX_PER_PERSON;

  const refreshFromApi = async () => {
    if (!currentUserId) {
      setUsersById({});
      setDeck([]);
      setMatches([]);
      return;
    }

    const users = await getUsers();
    const byId = Object.fromEntries(users.map((user) => [user.id, user])) as Record<string, ApiUser>;
    setUsersById(byId);

    const apiMatches = await getMatches(currentUserId, 50, 0);
    setMatches((prev) => {
      const prevById = Object.fromEntries(prev.map((match) => [match.id, match])) as Record<string, MatchPreview>;
      return apiMatches.map((apiMatch) =>
        toMatchPreview(apiMatch, byId, currentUserId, prevById[apiMatch.id])
      );
    });

    const discovery = await getDiscovery(currentUserId);
    setDeck(discovery.map(toDeckCard));
  };

  const refreshOutTonightState = async (sessionId?: string | null) => {
    const target = sessionId ?? outTonight.sessionId;
    if (!target) {
      return;
    }

    const state = await getAvailabilityState(target);

    setOutTonight((prev) => {
      const next = {
        ...prev,
        sessionId: state.session.id,
        enabled: state.session.active,
        error: null,
        candidates: mapCandidates(state.candidates),
        selectedCandidateMatchId:
          prev.selectedCandidateMatchId && state.candidates.some((c) => c.matchId === prev.selectedCandidateMatchId)
            ? prev.selectedCandidateMatchId
            : prev.selectedCandidateMatchId,
        coordinationEndsAt: prev.coordinationEndsAt
      };
      return applyOffer(next, state.latestOffer);
    });
  };

  useEffect(() => {
    refreshFromApi().catch(() => {
      setUsersById({});
      setDeck(swipeDeckSeed);
      setMatches(matchSeed);
    });

    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, [currentUserId]);

  useEffect(() => {
    if (tab !== "matches" || matches.length === 0) {
      return;
    }

    setAcknowledgedMatchIds((prev) => {
      const next = new Set(prev);
      for (const match of matches) {
        next.add(match.id);
      }
      return next;
    });
  }, [tab, matches]);

  const swipe = (decision: "left" | "right") => {
    const current = topCard;
    if (!current || !currentUserId) {
      return;
    }

    setDeck((prev) => prev.slice(1));

    void postSwipe(currentUserId, current.id, decision)
      .then((result) => {
        if (result.matched) {
          if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
          }
          setMatchToastName(current.name);
          toastTimerRef.current = setTimeout(() => {
            setMatchToastName(null);
          }, 2000);
        }
        return refreshFromApi();
      })
      .catch(() => {
        // If swipe write fails, put the card back so user can retry.
        setDeck((prev) => [current, ...prev]);
      });
  };

  const openChat = (matchId: string) => {
    setActiveChatMatchId(matchId);

    const match = matches.find((m) => m.id === matchId);
    const otherId = match
      ? Object.entries(usersById).find(([, user]) => user.firstName === match.name)?.[0]
      : null;

    void getMessages(matchId)
      .then((messages) => {
        setMatches((prev) =>
          prev.map((m) => {
            if (m.id !== matchId) {
              return m;
            }
            return {
              ...m,
              chat: messages.map((msg) => ({
                id: msg.id,
                sender: msg.senderUserId === currentUserId ? "me" : "them",
                body: msg.body,
                createdAt: msg.createdAt
              })),
              messagesUsedByMe: messages.filter((msg) => msg.senderUserId === currentUserId).length,
              messagesUsedByThem: otherId
                ? messages.filter((msg) => msg.senderUserId === otherId).length
                : messages.filter((msg) => msg.senderUserId !== currentUserId).length
            };
          })
        );
      })
      .catch(() => {});
  };

  const sendMessage = async (matchId: string, sender: "me" | "them", body: string) => {
    const trimmed = body.trim();
    if (!trimmed) {
      return { ok: false as const, error: "Message cannot be empty." };
    }

    const match = matches.find((m) => m.id === matchId);
    if (!match) {
      return { ok: false as const, error: "Match not found." };
    }

    const total = match.messagesUsedByMe + match.messagesUsedByThem;
    if (total >= MAX_TOTAL) {
      return { ok: false as const, error: "60-message cap reached for this chat." };
    }

    if (sender === "me" && match.messagesUsedByMe >= MAX_PER_PERSON) {
      return { ok: false as const, error: "You already used your 30 messages." };
    }

    if (sender === "them" && match.messagesUsedByThem >= MAX_PER_PERSON) {
      return { ok: false as const, error: "They already used their 30 messages." };
    }

    const senderUserId =
      sender === "me"
        ? currentUserId ?? "u1"
        : Object.entries(usersById).find(([, user]) => user.firstName === match.name)?.[0] ?? "u2";

    try {
      const result = await postMessage(matchId, senderUserId, trimmed);

      setMatches((prev) =>
        prev.map((m) => {
          if (m.id !== matchId) {
            return m;
          }
          return {
            ...m,
            messagesUsedByMe: sender === "me" ? m.messagesUsedByMe + 1 : m.messagesUsedByMe,
            messagesUsedByThem: sender === "them" ? m.messagesUsedByThem + 1 : m.messagesUsedByThem,
            chat: [
              ...m.chat,
              {
                id: result.message.id,
                sender,
                body: result.message.body,
                createdAt: result.message.createdAt
              }
            ]
          };
        })
      );

      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  };

  const sendAutoReply = (matchId: string) => {
    const text = cannedReplies[Math.floor(Math.random() * cannedReplies.length)] ?? "Sounds good.";
    return sendMessage(matchId, "them", text);
  };

  const setMeetDecision = async (matchId: string, user: "me" | "them", decision: MeetDecision) => {
    const match = matches.find((m) => m.id === matchId);
    if (!match) {
      return;
    }

    if (!currentUserId) {
      return;
    }

    const userId =
      user === "me"
        ? currentUserId
        : Object.entries(usersById).find(([, u]) => u.firstName === match.name)?.[0] ?? "u2";

    await postMeetDecision(matchId, userId, decision).catch(() => null);

    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== matchId) {
          return m;
        }
        return user === "me"
          ? { ...m, meetDecisionByMe: decision }
          : { ...m, meetDecisionByThem: decision };
      })
    );
  };

  const eligibleOutMatches = useMemo(
    () => matches.filter((match) => bothMeetYes(match)),
    [matches]
  );

  const startOutTonight = async () => {
    if (!currentUserId) {
      return;
    }
    try {
      const result = await postAvailabilityStart(currentUserId);
      const next: OutTonightState = {
        sessionId: result.session.id,
        enabled: true,
        error: null,
        candidates: mapCandidates(result.candidates),
        selectedCandidateMatchId: null,
        selectedPlaceLabel: null,
        selectedOfferId: null,
        offerStatus: "idle",
        offerRespondBy: null,
        locationExpiresAt: null,
        coordinationEndsAt: null
      };
      setOutTonight(next);
    } catch (err) {
      setOutTonight((prev) => ({
        ...prev,
        error: (err as Error).message
      }));
    }
  };

  const stopOutTonight = async () => {
    if (!currentUserId) {
      return;
    }
    if (outTonight.sessionId) {
      await postAvailabilityClose(outTonight.sessionId, currentUserId).catch(() => null);
    }
    setOutTonight(emptyOutTonight());
  };

  const simulateCandidateResponses = async () => {
    if (!outTonight.sessionId) {
      return;
    }

    for (const candidate of outTonight.candidates) {
      const response = Math.random() > 0.4 ? "yes" : "no";
      await postAvailabilityRespondInterest(outTonight.sessionId, candidate.userId, response).catch(() => null);
    }

    await refreshOutTonightState(outTonight.sessionId).catch(() => null);
  };

  const chooseCandidate = (matchId: string) => {
    setOutTonight((prev) => {
      const target = prev.candidates.find((candidate) => candidate.matchId === matchId);
      if (!target || target.response !== "yes") {
        return prev;
      }

      return {
        ...prev,
        selectedCandidateMatchId: matchId
      };
    });
  };

  const sendMeetOffer = async (placeLabel: string) => {
    if (!currentUserId || !outTonight.sessionId || !outTonight.selectedCandidateMatchId) {
      return;
    }

    const candidate = outTonight.candidates.find((c) => c.matchId === outTonight.selectedCandidateMatchId);
    if (!candidate) {
      return;
    }

    const placeId = `poi_${placeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    const offer = await postOffer(
      outTonight.sessionId,
      currentUserId,
      candidate.userId,
      placeId,
      placeLabel
    );

    setOutTonight((prev) => applyOffer(prev, offer));
  };

  const respondToMeetOffer = async (accept: boolean) => {
    if (!outTonight.selectedOfferId || !outTonight.selectedCandidateMatchId) {
      return;
    }

    const candidate = outTonight.candidates.find((c) => c.matchId === outTonight.selectedCandidateMatchId);
    if (!candidate) {
      return;
    }

    const result = await postOfferRespond(outTonight.selectedOfferId, candidate.userId, accept);

    setOutTonight((prev) => {
      let next = applyOffer(prev, result.offer);
      if (!accept) {
        next = {
          ...next,
          selectedCandidateMatchId: null
        };
      } else if (result.coordinationEndsAt) {
        next = {
          ...next,
          coordinationEndsAt: new Date(result.coordinationEndsAt).getTime()
        };
      }
      return next;
    });
  };

  const syncMeetupTimers = () => {
    setOutTonight((prev) => {
      const nowTs = Date.now();
      if (prev.offerStatus === "pending" && prev.offerRespondBy && nowTs > prev.offerRespondBy) {
        return { ...prev, offerStatus: "expired" };
      }
      if (prev.offerStatus === "accepted" && prev.locationExpiresAt && nowTs > prev.locationExpiresAt) {
        return { ...prev, offerStatus: "expired" };
      }
      return prev;
    });

    if (!outTonight.sessionId) {
      return;
    }

    if (Date.now() - outTonightSyncRef.current > 5000) {
      outTonightSyncRef.current = Date.now();
      void refreshOutTonightState(outTonight.sessionId).catch(() => null);
    }
  };

  const stats = useMemo(() => {
    const capped = matches.filter(messageCapReached).length;
    return { totalMatches: matches.length, cappedChats: capped };
  }, [matches]);

  const unseenMatchCount = useMemo(
    () => matches.filter((match) => !acknowledgedMatchIds.has(match.id)).length,
    [matches, acknowledgedMatchIds]
  );

  return {
    tab,
    setTab,
    topCard,
    deck,
    matches,
    activeChatMatch,
    eligibleOutMatches,
    outTonight,
    unseenMatchCount,
    matchToastName,
    stats,
    swipe,
    messageCapReached,
    sendMessage,
    sendAutoReply,
    setMeetDecision,
    bothMeetYes,
    startOutTonight,
    stopOutTonight,
    simulateCandidateResponses,
    chooseCandidate,
    sendMeetOffer,
    respondToMeetOffer,
    syncMeetupTimers,
    openChat,
    closeChat: () => setActiveChatMatchId(null)
  };
}
