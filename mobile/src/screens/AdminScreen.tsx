import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  getVerificationQueue,
  postAdminBanUser,
  postAdminUnbanUser,
  postReviewVerification,
  type VerificationSubmission
} from "../api";
import { theme } from "../theme";

export function AdminScreen({ authToken }: { authToken: string }) {
  const [queue, setQueue] = useState<VerificationSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VerificationSubmission | null>(null);

  const loadQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getVerificationQueue("pending", authToken);
      setQueue(rows);
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

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>Admin Queue</Text>
        <Text style={styles.sub}>Pending profile verifications</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void loadQueue()} disabled={loading}>
          <Text style={styles.refreshText}>{loading ? "Refreshing..." : "Refresh"}</Text>
        </Pressable>
      </View>

      {queue.map((item) => (
        <Pressable key={item.id} style={styles.itemCard} onPress={() => setSelected(item)}>
          <Text style={styles.name}>
            {item.firstName} {item.lastName ?? ""}
          </Text>
          <Text style={styles.meta}>
            Age {item.age} • {item.gender}
          </Text>
          <Text style={styles.uri}>Tap to review photos</Text>
        </Pressable>
      ))}

      {selected ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>Review Submission</Text>
          <Text style={styles.meta}>
            {selected.firstName} {selected.lastName ?? ""}
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
            <Pressable style={styles.approveBtn} onPress={() => void review(selected.id, "approved")}>
              <Text style={styles.btnText}>Verify</Text>
            </Pressable>
            <Pressable style={styles.rejectBtn} onPress={() => void review(selected.id, "rejected")}>
              <Text style={styles.btnText}>Reject</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            {selected.isBanned ? (
              <Pressable
                style={styles.unbanBtn}
                onPress={() => void setBanState(selected, false)}
              >
                <Text style={styles.btnText}>Unban User</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.banBtn}
                onPress={() => void setBanState(selected, true)}
              >
                <Text style={styles.btnText}>Ban User</Text>
              </Pressable>
            )}
          </View>
          <Pressable style={styles.closeBtn} onPress={() => setSelected(null)}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && queue.length === 0 ? <Text style={styles.empty}>No pending submissions.</Text> : null}
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
  refreshBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    alignItems: "center"
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
  rejectBtn: {
    flex: 1,
    backgroundColor: "#B42318",
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    alignItems: "center"
  },
  banBtn: {
    flex: 1,
    backgroundColor: "#B42318",
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    alignItems: "center"
  },
  unbanBtn: {
    flex: 1,
    backgroundColor: "#087F5B",
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    alignItems: "center"
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
