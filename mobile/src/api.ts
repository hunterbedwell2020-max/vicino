const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

function parseErrorMessage(payload: unknown, status: number) {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.error === "string") {
      return obj.error;
    }
    if (obj.error && typeof obj.error === "object") {
      return JSON.stringify(obj.error);
    }
    return JSON.stringify(obj);
  }
  return `Request failed: ${status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string> | undefined) ?? {})
  };

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(parseErrorMessage(data, res.status));
  }

  return (await res.json()) as T;
}

async function requestRaw(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...(init ?? {})
  });
}

export interface ApiUser {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string | null;
  isAdmin?: boolean;
  email?: string | null;
  phone?: string | null;
  age: number;
  gender: string;
  preferredGender?: string | null;
  likes?: string | null;
  dislikes?: string | null;
  bio: string;
  verified: boolean;
  photos: string[];
  hobbies?: string[];
  promptOne?: string | null;
  promptTwo?: string | null;
  distanceMiles?: number;
  maxDistanceMiles?: number;
}

export interface ApiMatch {
  id: string;
  userAId: string;
  userBId: string;
  createdAt: string;
  coordinationEndsAt?: string | null;
  messagesByUser: Record<string, number>;
  totalMessages: number;
  meetDecisionByUser: Record<string, "yes" | "no">;
}

export interface ApiMessage {
  id: string;
  matchId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
}

export interface AvailabilityCandidate {
  matchId: string;
  candidateUserId: string;
  response: "pending" | "yes" | "no";
  firstName: string;
  age: number;
  gender: string;
  bio: string;
  verified: boolean;
  photos: string[];
}

export interface AvailabilityState {
  session: {
    id: string;
    initiatorUserId: string;
    createdAt: string;
    active: boolean;
  };
  candidates: AvailabilityCandidate[];
  latestOffer: ApiOffer | null;
}

export interface ApiOffer {
  id: string;
  sessionId: string;
  initiatorUserId: string;
  recipientUserId: string;
  placeId: string;
  placeLabel: string;
  createdAt: string;
  respondBy: string;
  locationExpiresAt: string;
  status: "pending" | "accepted" | "declined" | "expired" | "location_expired";
}

export interface VerificationStatus {
  userId: string;
  verified: boolean;
  status: "unsubmitted" | "pending" | "approved" | "rejected";
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewerNote: string | null;
}

export interface VerificationSubmission {
  id: string;
  userId: string;
  firstName: string;
  lastName?: string;
  age: number;
  gender: string;
  idDocumentUri: string;
  selfieUri: string;
  idDocumentType: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewerId: string | null;
  reviewerNote: string | null;
  reviewedAt: string | null;
}

export interface AuthResponse {
  token: string;
  user: ApiUser;
}

export interface AuthSessionResponse {
  token: string;
  user: ApiUser;
  verification: VerificationStatus;
}

export interface UploadImageResponse {
  url: string;
}

export interface UserLocationResponse {
  id: string;
  firstName: string;
  latitude: number;
  longitude: number;
  lastLocationAt: string;
}

export function getUsers() {
  return request<ApiUser[]>("/users");
}

export function postRegister(payload: {
  email: string;
  username: string;
  password: string;
}) {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function postLogin(payload: { username: string; password: string }) {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getAuthSession(token: string) {
  return request<AuthSessionResponse>("/auth/session", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export function postLogout(token: string) {
  return request<{ ok: boolean }>("/auth/logout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function uploadImageBase64(base64: string, mimeType?: string, filename?: string) {
  const res = await requestRaw("/uploads/image-base64", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ base64, mimeType, filename })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Upload failed: ${res.status}`);
  }

  return (await res.json()) as UploadImageResponse;
}

export function postDistancePreference(userId: string, maxDistanceMiles: number) {
  return request<{ id: string; firstName: string; maxDistanceMiles: number }>(
    `/users/${userId}/preferences/distance`,
    {
      method: "POST",
      body: JSON.stringify({ maxDistanceMiles })
    }
  );
}

export function postUserLocation(userId: string, latitude: number, longitude: number) {
  return request<UserLocationResponse>(`/users/${userId}/location`, {
    method: "POST",
    body: JSON.stringify({ latitude, longitude })
  });
}

export function postUserProfile(
  userId: string,
  payload: {
    firstName?: string;
    email?: string;
    phone?: string;
    age?: number;
    gender?: "male" | "female" | "other";
    preferredGender?: "male" | "female" | "other";
    likes?: string;
    dislikes?: string;
    bio?: string;
    photos?: string[];
    hobbies?: string[];
    promptOne?: string;
    promptTwo?: string;
  }
) {
  return request<ApiUser>(`/users/${userId}/profile`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getDiscovery(userId: string) {
  return request<ApiUser[]>(`/discovery/${userId}`);
}

export function getMatches() {
  return request<ApiMatch[]>("/matches");
}

export function getMessages(matchId: string) {
  return request<ApiMessage[]>(`/messages/${matchId}`);
}

export function postSwipe(fromUserId: string, toUserId: string, decision: "left" | "right") {
  return request<{ matched: boolean }>("/swipes", {
    method: "POST",
    body: JSON.stringify({ fromUserId, toUserId, decision })
  });
}

export function postMessage(matchId: string, senderUserId: string, body: string) {
  return request<{ message: ApiMessage }>("/messages", {
    method: "POST",
    body: JSON.stringify({ matchId, senderUserId, body })
  });
}

export function postMeetDecision(matchId: string, userId: string, decision: "yes" | "no") {
  return request<{ bothYes: boolean; decisions: Record<string, "yes" | "no"> }>("/meet-decisions", {
    method: "POST",
    body: JSON.stringify({ matchId, userId, decision })
  });
}

export function postAvailabilityStart(initiatorUserId: string) {
  return request<{ session: AvailabilityState["session"]; candidates: AvailabilityCandidate[] }>(
    "/availability/start",
    {
      method: "POST",
      body: JSON.stringify({ initiatorUserId })
    }
  );
}

export function getAvailabilityState(sessionId: string) {
  return request<AvailabilityState>(`/availability/${sessionId}`);
}

export function postAvailabilityRespondInterest(
  sessionId: string,
  userId: string,
  response: "yes" | "no"
) {
  return request<{ sessionId: string; candidateUserId: string; response: "yes" | "no" }>(
    "/availability/respond-interest",
    {
      method: "POST",
      body: JSON.stringify({ sessionId, userId, response })
    }
  );
}

export function postAvailabilityClose(sessionId: string, initiatorUserId: string) {
  return request<{ ok: boolean }>(`/availability/${sessionId}/close`, {
    method: "POST",
    body: JSON.stringify({ initiatorUserId })
  });
}

export function postOffer(
  sessionId: string,
  initiatorUserId: string,
  recipientUserId: string,
  placeId: string,
  placeLabel: string
) {
  return request<ApiOffer>("/offers", {
    method: "POST",
    body: JSON.stringify({ sessionId, initiatorUserId, recipientUserId, placeId, placeLabel })
  });
}

export function postOfferRespond(offerId: string, recipientUserId: string, accept: boolean) {
  return request<{ offer: ApiOffer; coordinationEndsAt: string | null }>("/offers/respond", {
    method: "POST",
    body: JSON.stringify({ offerId, recipientUserId, accept })
  });
}

export function getVerificationStatus(userId: string) {
  return request<VerificationStatus>(`/verification/${userId}/status`);
}

export function postVerificationSubmit(
  userId: string,
  idDocumentUri: string,
  selfieUri: string,
  idDocumentType: string
) {
  return request<{ submissionId: string; userId: string; status: "pending" }>("/verification/submit", {
    method: "POST",
    body: JSON.stringify({ userId, idDocumentUri, selfieUri, idDocumentType })
  });
}

export function getVerificationQueue(
  status: "pending" | "approved" | "rejected" | "all" = "pending",
  authToken?: string,
  adminKey?: string
) {
  return request<VerificationSubmission[]>(`/admin/verifications?status=${status}`, {
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(adminKey ? { "x-admin-key": adminKey } : {})
    }
  });
}

export function postReviewVerification(
  submissionId: string,
  decision: "approved" | "rejected",
  reviewerId: string,
  authToken?: string,
  adminKey?: string,
  reviewerNote?: string
) {
  return request<{ submissionId: string; userId: string; decision: "approved" | "rejected" }>(
    `/admin/verifications/${submissionId}/review`,
    {
      method: "POST",
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(adminKey ? { "x-admin-key": adminKey } : {})
      },
      body: JSON.stringify({ decision, reviewerId, reviewerNote })
    }
  );
}
