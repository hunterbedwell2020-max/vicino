import { Pressable, StyleSheet, Text, View } from "react-native";
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
    { key: "messages", label: "Messages" },
    { key: "matches", label: "Matches" },
    { key: "profile", label: "Profile" },
    ...(isAdmin ? [{ key: "admin" as const, label: "Admin" }] : [])
  ];

  return (
    <View style={styles.wrap}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          onPress={() => onChange(tab.key)}
          style={[styles.item, active === tab.key && styles.activeItem]}
        >
          {tab.key === "matches" && activeMatchesBadgeCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {activeMatchesBadgeCount > 99 ? "99+" : activeMatchesBadgeCount}
              </Text>
            </View>
          ) : null}
          <Text style={[styles.text, active === tab.key && styles.activeText]}>{tab.label}</Text>
        </Pressable>
      ))}
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
    top: -6,
    right: 18,
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
  }
});
