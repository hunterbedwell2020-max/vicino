import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  getAdminUsers,
  getLatestVerificationByUser,
  postAdminBanUser,
  postAdminSetPlanTier,
  postAdminUnbanUser,
  postReviewVerification,
  type AdminUserListItem,
  type VerificationSubmission
} from "../api";
import { theme } from "../theme";

const PAGE_SIZE = 40;

export function AdminScreen({ authToken }: { authToken: string }) {
  const [rows, setRows] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VerificationSubmission | null>(null);
  const [segment, setSegment] = useState<"not_verified" | "verified">("not_verified");
  const [query, setQuery] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [countVerified, setCountVerified] = useState(0);
  const [countNotVerified, setCountNotVerified] = useState(0);

  const hasMore = rows.length < total;

  const loadCounts = async (q: string) => {
    const [verifiedRes, notVerifiedRes] = await Promise.all([
      getAdminUsers({ segment: "verified", q, limit: 1, offset: 0 }, authToken),
      getAdminUsers({ segment: "not_verified", q, limit: 1, offset: 0 }, authToken)
    ]);
    setCountVerified(verifiedRes.total);
    setCountNotVerified(notVerifiedRes.total);
  };

  const loadPage = async (reset = false) => {
    const targetOffset = reset ? 0 : rows.length;
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const result = await getAdminUsers(
        {
          segment,
          q: query,
          limit: PAGE_SIZE,
          offset: targetOffset
        },
        authToken
      );

      setTotal(result.total);
      setRows((prev) => (reset ? result.rows : [...prev, ...result.rows]));
      if (reset) {
        await loadCounts(query);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(queryDraft.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [queryDraft]);

  useEffect(() => {
    void loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, segment, query]);

  const openSubmission = async (user: AdminUserListItem) => {
    setError(null);
    try {
      const submission = await getLatestVerificationByUser(user.id, authToken);
      if (!submission) {
        setError("No verification photos submitted yet.");
        return;
      }
      setSelected(submission);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const review = async (submissionId: string, decision: "approved" | "rejected") => {
    setError(null);
    try {
      await postReviewVerification(submissionId, decision, authToken);
      setSelected(null);
      await loadPage(true);
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
      await loadPage(true);
      setSelected((prev) =>
        prev && prev.userId === userId
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

  const setPlanTierForUser = async (userId: string, planTier: "free" | "plus") => {
    setError(null);
    try {
      await postAdminSetPlanTier(userId, planTier, authToken, undefined, "manual_admin_grant");
      await loadPage(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const selectedUser = useMemo(() => rows.find((u) => u.id === selected?.userId) ?? null, [rows, selected]);

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
              Not Yet Verified ({countNotVerified})
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
              Verified ({countVerified})
            </Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.searchInput}
          value={queryDraft}
          onChangeText={setQueryDraft}
          placeholder="Search name, username, or email"
          placeholderTextColor={theme.colors.muted}
          autoCapitalize="none"
        />
        <Pressable
          style={({ pressed }) => [styles.refreshBtn, pressed && styles.refreshBtnPressed]}
          onPress={() => void loadPage(true)}
          disabled={loading}
        >
          <Text style={styles.refreshText}>{loading ? "Refreshing..." : "Refresh"}</Text>
        </Pressable>
      </View>

      {rows.map((user) => (
        <View key={user.id} style={styles.itemCard}>
          <Pressable
            style={({ pressed }) => [pressed && styles.itemCardPressed]}
            onPress={() => {
              if (!user.verified) {
                void openSubmission(user);
              }
            }}
          >
            <Text style={styles.name}>
              {user.firstName} {user.lastName ?? ""}
            </Text>
            <Text style={styles.meta}>
              @{user.username ?? "no-username"} • {user.email ?? "no-email"}
            </Text>
            <Text style={styles.meta}>Age {user.age} • {user.gender}</Text>
            {user.verified ? (
              <Text style={styles.meta}>Membership: {String(user.planTier ?? "free").toUpperCase()}</Text>
            ) : (
              <Text style={styles.uri}>Tap card to review verification photos</Text>
            )}
          </Pressable>
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

      {hasMore ? (
        <Pressable
          style={({ pressed }) => [styles.loadMoreBtn, pressed && styles.loadMoreBtnPressed]}
          onPress={() => void loadPage(false)}
          disabled={loadingMore}
        >
          <Text style={styles.loadMoreText}>{loadingMore ? "Loading..." : `Load more (${rows.length}/${total})`}</Text>
        </Pressable>
      ) : null}

      {selected ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>Review Submission</Text>
          <Text style={styles.meta}>
            {selected.firstName} {selected.lastName ?? ""}
          </Text>
          <Text style={styles.meta}>
            {selectedUser?.email ?? "no-email"} • @{selectedUser?.username ?? "no-username"}
          </Text>
          <Text style={styles.meta}>Age {selected.age} • {selected.gender}</Text>
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
                onPress={() => void setBanStateForUser(selected.userId, false)}
              >
                <Text style={styles.btnText}>Unban User</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.banBtn, pressed && styles.banBtnPressed]}
                onPress={() => void setBanStateForUser(selected.userId, true)}
              >
                <Text style={styles.btnText}>Ban User</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.row}>
            <Pressable
              style={({ pressed }) => [styles.planBtn, pressed && styles.planBtnPressed]}
              onPress={() => void setPlanTierForUser(selected.userId, "plus")}
            >
              <Text style={styles.btnText}>Grant Plus</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.planResetBtn, pressed && styles.planResetBtnPressed]}
              onPress={() => void setPlanTierForUser(selected.userId, "free")}
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

      {!loading && rows.length === 0 ? <Text style={styles.empty}>No users found.</Text> : null}
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
    opacity: 0.9
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
  loadMoreBtn: {
    backgroundColor: "#EFE8F8",
    borderRadius: theme.radius.sm,
    paddingVertical: 11,
    alignItems: "center"
  },
  loadMoreBtnPressed: {
    backgroundColor: "#E3D7F5"
  },
  loadMoreText: {
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
