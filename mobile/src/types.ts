export type TabKey = "swipe" | "messages" | "matches" | "profile" | "admin";

export type MeetDecision = "yes" | "no";

export interface ProfileCard {
  id: string;
  name: string;
  age: number;
  bio: string;
  photos: string[];
  hobbies: string[];
  questionAnswers: Array<{
    question: string;
    answer: string;
  }>;
}

export interface ChatMessage {
  id: string;
  sender: "me" | "them";
  body: string;
  createdAt: string;
}

export interface MatchPreview {
  id: string;
  otherUserId: string;
  name: string;
  avatarUrl: string | null;
  messagesUsedByMe: number;
  messagesUsedByThem: number;
  meetDecisionByMe: MeetDecision | null;
  meetDecisionByThem: MeetDecision | null;
  chat: ChatMessage[];
}

export type CandidateResponse = "pending" | "yes" | "no";
export type OfferStatus = "idle" | "pending" | "accepted" | "declined" | "expired";

export interface MeetupCandidate {
  matchId: string;
  userId: string;
  name: string;
  response: CandidateResponse;
  photos?: string[];
}

export interface OutTonightState {
  sessionId: string | null;
  enabled: boolean;
  error: string | null;
  candidates: MeetupCandidate[];
  selectedCandidateMatchId: string | null;
  selectedPlaceLabel: string | null;
  selectedOfferId: string | null;
  offerStatus: OfferStatus;
  offerRespondBy: number | null;
  locationExpiresAt: number | null;
  coordinationEndsAt: number | null;
}
