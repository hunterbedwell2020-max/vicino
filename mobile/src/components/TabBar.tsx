import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";
import type { TabKey } from "../types";

export function TabBar({
  active,
  onChange,
  activeMatchesBadgeCount,
  isAdmin
}: {
  active: TabKey;
  onChange: (next: TabKey) => void;
  activeMatchesBadgeCount: number;
  isAdmin: boolean;
}) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: "swipe", label: "Swipe" },
    { key: "matches", label: "Matches" },
    { key: "messages", label: "Inbox" }
  ];

  return (
    <View style={styles.wrap}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          onPress={() => onChange(tab.key)}
          style={[
            styles.item,
            tab.key === "matches" && styles.centerItem,
            active === tab.key && tab.key !== "matches" && styles.activeItem
          ]}
        >
          {tab.key === "matches" ? (
            <View style={[styles.logoCircle, active === tab.key && styles.logoCircleActive]}>
              <Image source={require("../../assets/vicino-logo.png")} style={styles.logoImage} resizeMode="cover" />
              {activeMatchesBadgeCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {activeMatchesBadgeCount > 99 ? "99+" : activeMatchesBadgeCount}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={[styles.text, active === tab.key && styles.activeText]}>{tab.label}</Text>
          )}

          {tab.key === "matches" ? (
            <Text style={[styles.centerLabel, active === tab.key && styles.centerLabelActive]}>{tab.label}</Text>
          ) : null}
        </Pressable>
      ))}
      {isAdmin ? (
        <Pressable style={[styles.adminPill, active === "admin" && styles.adminPillActive]} onPress={() => onChange("admin")}>
          <Text style={[styles.adminPillText, active === "admin" && styles.adminPillTextActive]}>Admin</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 8,
    gap: 6
  },
  item: {
    flex: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  activeItem: {
    backgroundColor: theme.colors.primary
  },
  centerItem: {
    alignSelf: "flex-start",
    marginTop: -22
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
    borderWidth: 3,
    borderColor: "#EADCF8",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  logoCircleActive: {
    borderColor: "#ffffff"
  },
  logoImage: {
    width: "100%",
    height: "100%"
  },
  centerLabel: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontSize: 12,
    marginTop: 4
  },
  centerLabelActive: {
    color: theme.colors.primary
  },
  text: {
    color: theme.colors.primary,
    fontWeight: "600",
    fontSize: 12
  },
  activeText: {
    color: "#FFFFFF"
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: theme.colors.danger,
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center"
  },
  badgeText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 10
  },
  adminPill: {
    position: "absolute",
    right: 8,
    top: -14,
    backgroundColor: "#EDE7F6",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  adminPillActive: {
    backgroundColor: theme.colors.primary
  },
  adminPillText: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontSize: 11
  },
  adminPillTextActive: {
    color: "#fff"
  }
});
