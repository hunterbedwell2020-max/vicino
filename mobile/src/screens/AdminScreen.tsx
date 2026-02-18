import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  getUsers,
  getVerificationQueue,
  postAdminBanUser,
  postAdminSetPlanTier,
  postAdminUnbanUser,
  postReviewVerification,
  type ApiUser,
  type VerificationSubmission
} from "../api";
import { theme } from "../theme";

export function AdminScreen({ authToken }: { authToken: string }) {
  const [queue, setQueue] = useState<VerificationSubmission[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VerificationSubmission | null>(null);
  const [segment, setSegment] = useState<"not_verified" | "verified">("not_verified");
  const [query, setQuery] = useState("");

  const loadQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getVerificationQueue("all", authToken);
      setQueue(rows);
      const allUsers = await getUsers();
      setUsers(allUsers);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue();
  }, [authToken]);

  const review = async (submissionId: string, decision: "approved" | "rejected") => {
    setError(null);
    try {
      await postReviewVerification(submissionId, decision, authToken);
      setSelected(null);
      await loadQueue();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const setBanState = async (item: VerificationSubmission, nextBanned: boolean) => {
    setError(null);
    try {
      if (nextBanned) {
        await postAdminBanUser(item.userId, "Admin moderation", authToken);
      } else {
        await postAdminUnbanUser(item.userId, authToken);
      }
      await loadQueue();
      setSelected((prev) =>
        prev && prev.id === item.id
          ? {
              ...prev,
              isBanned: nextBanned
            }
          : prev
      );
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const setPlanTier = async (item: VerificationSubmission, planTier: "free" | "plus") => {
    setError(null);
    try {
      await postAdminSetPlanTier(item.userId, planTier, authToken, undefined, "manual_admin_grant");
      await loadQueue();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const setPlanTierForUser = async (userId: string, planTier: "free" | "plus") => {
    setError(null);
    try {
      await postAdminSetPlanTier(userId, planTier, authToken, undefined, "manual_admin_grant");
      await loadQueue();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const setBanStateForUser = async (userId: string, nextBanned: boolean) => {
    setError(null);
    try {
      if (nextBanned) {
        await postAdminBanUser(userId, "Admin moderation", authToken);
      } else {
        await postAdminUnbanUser(userId, authToken);
      }
      await loadQueue();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const usersById = Object.fromEntries(users.map((u) => [u.id, u])) as Record<string, ApiUser>;
  const normalizedQuery = query.trim().toLowerCase();
  const byUserLatestSubmission = new Map<string, VerificationSubmission>();
  for (const item of queue) {
    if (!byUserLatestSubmission.has(item.userId)) {
      byUserLatestSubmission.set(item.userId, item);
    }
  }

  const pendingRows = users
    .filter((u) => !u.verified)
    .map((u) => ({
      user: u,
      submission: byUserLatestSubmission.get(u.id) ?? null
    }))
    .filter((row) => {
      if (!normalizedQuery) {
        return true;
      }
      const fullName = `${row.user.firstName} ${row.user.lastName ?? ""}`.toLowerCase();
      const email = (row.user.email ?? "").toLowerCase();
      const username = (row.user.username ?? "").toLowerCase();
      return (
        fullName.includes(normalizedQuery) ||
        email.includes(normalizedQuery) ||
        username.includes(normalizedQuery)
      );
    });

  const verifiedRows = users
    .filter((u) => u.verified)
    .filter((u) => {
      if (!normalizedQuery) {
        return true;
      }
      const fullName = `${u.firstName} ${u.lastName ?? ""}`.toLowerCase();
      const email = (u.email ?? "").toLowerCase();
      const username = (u.username ?? "").toLowerCase();
      return (
        fullName.includes(normalizedQuery) ||
        email.includes(normalizedQuery) ||
        username.includes(normalizedQuery)
      );
    });

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>Admin Queue</Text>
        <Text style={styles.sub}>Verification + membership controls at scale</Text>
        <View style={styles.segmentRow}>
          <Pressable
            style={({ pressed }) => [
              styles.segmentBtn,
              segment === "not_verified" && styles.segmentBtnActive,
              pressed && styles.segmentBtnPressed
            ]}
            onPress={() => setSegment("not_verified")}
          >
            <Text style={[styles.segmentText, segment === "not_verified" && styles.segmentTextActive]}>
              Not Yet Verified ({pendingRows.length})
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.segmentBtn,
              segment === "verified" && styles.segmentBtnActive,
              pressed && styles.segmentBtnPressed
            ]}
            onPress={() => setSegment("verified")}
          >
            <Text style={[styles.segmentText, segment === "verified" && styles.segmentTextActive]}>
              Verified ({verifiedRows.length})
            </Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, username, or email"
          placeholderTextColor={theme.colors.muted}
          autoCapitalize="none"
        />
        <Pressable
          style={({ pressed }) => [styles.refreshBtn, pressed && styles.refreshBtnPressed]}
          onPress={() => void loadQueue()}
          disabled={loading}
        >
          <Text style={styles.refreshText}>{loading ? "Refreshing..." : "Refresh"}</Text>
        </Pressable>
      </View>

      {segment === "not_verified"
        ? pendingRows.map((row) => (
            <Pressable
              key={row.user.id}
              style={({ pressed }) => [styles.itemCard, pressed && styles.itemCardPressed]}
              onPress={() => {
                if (row.submission) {
                  setSelected(row.submission);
                }
              }}
            >
              <Text style={styles.name}>
                {row.user.firstName} {row.user.lastName ?? ""}
              </Text>
              <Text style={styles.meta}>
                @{row.user.username ?? "no-username"} • {row.user.email ?? "no-email"}
              </Text>
              <Text style={styles.meta}>Age {row.user.age} • {row.user.gender}</Text>
              <Text style={styles.uri}>
                {row.submission
                  ? "Tap to review verification photos"
                  : "No verification photos submitted yet"}
              </Text>
            </Pressable>
          ))
        : verifiedRows.map((user) => (
            <View key={user.id} style={styles.itemCard}>
              <Text style={styles.name}>
                {user.firstName} {user.lastName ?? ""}
              </Text>
              <Text style={styles.meta}>
                @{user.username ?? "no-username"} • {user.email ?? "no-email"}
              </Text>
              <Text style={styles.meta}>
                Membership: {String(user.planTier ?? "free").toUpperCase()}
              </Text>
              <View style={styles.row}>
                <Pressable
                  style={({ pressed }) => [styles.planBtn, pressed && styles.planBtnPressed]}
                  onPress={() => void setPlanTierForUser(user.id, "plus")}
                >
                  <Text style={styles.btnText}>Grant Plus</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.planResetBtn, pressed && styles.planResetBtnPressed]}
                  onPress={() => void setPlanTierForUser(user.id, "free")}
                >
                  <Text style={styles.btnText}>Set Free</Text>
                </Pressable>
              </View>
              <View style={styles.row}>
                <Pressable
                  style={({ pressed }) => [styles.banBtn, pressed && styles.banBtnPressed]}
                  onPress={() => void setBanStateForUser(user.id, true)}
                >
                  <Text style={styles.btnText}>Ban</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.unbanBtn, pressed && styles.unbanBtnPressed]}
                  onPress={() => void setBanStateForUser(user.id, false)}
                >
                  <Text style={styles.btnText}>Unban</Text>
                </Pressable>
              </View>
            </View>
          ))}

      {selected ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>Review Submission</Text>
          <Text style={styles.meta}>
            {selected.firstName} {selected.lastName ?? ""}
          </Text>
          <Text style={styles.meta}>
            {usersById[selected.userId]?.email ?? "no-email"} • @{usersById[selected.userId]?.username ?? "no-username"}
          </Text>
          <Text style={styles.meta}>
            Age {selected.age} • {selected.gender}
          </Text>
          <Text style={[styles.meta, selected.isBanned ? styles.bannedMeta : null]}>
            Status: {selected.isBanned ? "Banned" : "Active"}
          </Text>

          <Text style={styles.imageLabel}>Selfie</Text>
          <Image source={{ uri: selected.selfieUri }} style={styles.image} resizeMode="cover" />
          <Text style={styles.imageLabel}>Driver License</Text>
          <Image source={{ uri: selected.idDocumentUri }} style={styles.image} resizeMode="cover" />

          <View style={styles.row}>
            <Pressable
              style={({ pressed }) => [styles.approveBtn, pressed && styles.approveBtnPressed]}
              onPress={() => void review(selected.id, "approved")}
            >
              <Text style={styles.btnText}>Verify</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.rejectBtn, pressed && styles.rejectBtnPressed]}
              onPress={() => void review(selected.id, "rejected")}
            >
              <Text style={styles.btnText}>Reject</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            {selected.isBanned ? (
              <Pressable
                style={({ pressed }) => [styles.unbanBtn, pressed && styles.unbanBtnPressed]}
                onPress={() => void setBanState(selected, false)}
              >
                <Text style={styles.btnText}>Unban User</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.banBtn, pressed && styles.banBtnPressed]}
                onPress={() => void setBanState(selected, true)}
              >
                <Text style={styles.btnText}>Ban User</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.row}>
            <Pressable
              style={({ pressed }) => [styles.planBtn, pressed && styles.planBtnPressed]}
              onPress={() => void setPlanTier(selected, "plus")}
            >
              <Text style={styles.btnText}>Grant Plus</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.planResetBtn, pressed && styles.planResetBtnPressed]}
              onPress={() => void setPlanTier(selected, "free")}
            >
              <Text style={styles.btnText}>Set Free</Text>
            </Pressable>
          </View>
          <Pressable
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            onPress={() => setSelected(null)}
          >
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && segment === "not_verified" && pendingRows.length === 0 ? (
        <Text style={styles.empty}>No unverified users found.</Text>
      ) : null}
      {!loading && segment === "verified" && verifiedRows.length === 0 ? (
        <Text style={styles.empty}>No verified users found.</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    paddingBottom: 16
  },
  bannedMeta: {
    color: "#B42318",
    fontWeight: "700"
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 16,
    gap: 8
  },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: "800"
  },
  sub: {
    color: theme.colors.muted
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8
  },
  segmentBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E7E1F3",
    borderRadius: theme.radius.sm,
    paddingVertical: 9,
    alignItems: "center"
  },
  segmentBtnActive: {
    backgroundColor: theme.colors.primary
  },
  segmentBtnPressed: {
    opacity: 0.86
  },
  segmentText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "600"
  },
  segmentTextActive: {
    color: "#fff"
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#DDD6F2",
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text
  },
  refreshBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    alignItems: "center"
  },
  refreshBtnPressed: {
    backgroundColor: "#5A2D8A"
  },
  refreshText: {
    color: "#fff",
    fontWeight: "700"
  },
  itemCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 14,
    gap: 6
  },
  itemCardPressed: {
    backgroundColor: "#F4EFFB"
  },
  detailCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 14,
    gap: 8
  },
  detailTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800"
  },
  name: {
    color: theme.colors.text,
    fontWeight: "700",
    fontSize: 16
  },
  meta: {
    color: theme.colors.muted
  },
  uri: {
    color: theme.colors.muted,
    fontSize: 12
  },
  imageLabel: {
    color: theme.colors.text,
    fontWeight: "700"
  },
  image: {
    width: "100%",
    height: 220,
    borderRadius: theme.radius.sm,
    backgroundColor: "#EEE"
  },
  row: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4
  },
  approveBtn: {
    flex: 1,
    backgroundColor: "#087F5B",
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    alignItems: "center"
  },
  approveBtnPressed: {
    backgroundColor: "#066A4C"
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: "#B42318",
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    alignItems: "center"
  },
  rejectBtnPressed: {
    backgroundColor: "#8F1C13"
  },
  banBtn: {
    flex: 1,
    backgroundColor: "#B42318",
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    alignItems: "center"
  },
  banBtnPressed: {
    backgroundColor: "#8F1C13"
  },
  unbanBtn: {
    flex: 1,
    backgroundColor: "#087F5B",
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    alignItems: "center"
  },
  unbanBtnPressed: {
    backgroundColor: "#066A4C"
  },
  planBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    alignItems: "center"
  },
  planBtnPressed: {
    backgroundColor: "#5A2D8A"
  },
  planResetBtn: {
    flex: 1,
    backgroundColor: "#6B7280",
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    alignItems: "center"
  },
  planResetBtnPressed: {
    backgroundColor: "#4B5563"
  },
  btnText: {
    color: "#fff",
    fontWeight: "700"
  },
  closeBtn: {
    marginTop: 2,
    backgroundColor: "#EDE7F6",
    borderRadius: theme.radius.sm,
    alignItems: "center",
    paddingVertical: 10
  },
  closeBtnPressed: {
    backgroundColor: "#E3D7F5"
  },
  closeText: {
    color: theme.colors.primary,
    fontWeight: "700"
  },
  empty: {
    color: theme.colors.muted,
    textAlign: "center"
  },
  error: {
    color: "#B42318",
    fontWeight: "700",
    textAlign: "center"
  }
});
