export type Gender = "male" | "female" | "other";

export interface User {
  id: string;
  firstName: string;
  age: number;
  gender: Gender;
  bio: string;
  verified: boolean;
  photos: string[];
}

export type SwipeDecision = "left" | "right";

export interface Swipe {
  fromUserId: string;
  toUserId: string;
  decision: SwipeDecision;
  createdAt: Date;
}

export type MeetDecision = "yes" | "no";

export interface Match {
  id: string;
  userAId: string;
  userBId: string;
  createdAt: Date;
  messagesByUser: Record<string, number>;
  totalMessages: number;
  meetDecisionByUser: Partial<Record<string, MeetDecision>>;
  coordinationEndsAt?: Date;
}

export interface Message {
  id: string;
  matchId: string;
  senderUserId: string;
  body: string;
  createdAt: Date;
}

export interface AvailabilitySession {
  id: string;
  initiatorUserId: string;
  createdAt: Date;
  active: boolean;
}

export type MeetupOfferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "location_expired";

export interface MeetupOffer {
  id: string;
  sessionId: string;
  initiatorUserId: string;
  recipientUserId: string;
  placeId: string;
  placeLabel: string;
  createdAt: Date;
  respondBy: Date;
  locationExpiresAt: Date;
  status: MeetupOfferStatus;
}
