import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";
import type { TabKey } from "../types";

const FONT_REGULAR = "Satoshi-Regular";
const FONT_BOLD = "Satoshi-Bold";
const FONT_MEDIUM = "Satoshi-Medium";

export function TabBar({
  active,
  onChange,
  inboxBadgeCount,
  isAdmin
}: {
  active: TabKey;
  onChange: (next: TabKey) => void;
  inboxBadgeCount: number;
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
            tab.key !== "matches" && styles.sideItem,
            tab.key === "matches" && styles.centerItem,
            active === tab.key && tab.key !== "matches" && styles.activeItem
          ]}
        >
          {tab.key === "matches" ? (
            <View style={styles.logoWrap}>
              <View style={[styles.logoCircle, active === tab.key && styles.logoCircleActive]}>
                <Image source={require("../../assets/vicino-logo.png")} style={styles.logoImage} resizeMode="cover" />
              </View>
            </View>
          ) : (
            <View style={styles.sideTabWrap}>
              <Text style={[styles.text, active === tab.key && styles.activeText]}>{tab.label}</Text>
              {tab.key === "messages" && inboxBadgeCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {inboxBadgeCount > 99 ? "99+" : inboxBadgeCount}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
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
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 8
  },
  item: {
    flex: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center"
  },
  sideItem: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EADCF8"
  },
  activeItem: {
    backgroundColor: theme.colors.primary
  },
  centerItem: {
    alignSelf: "flex-start",
    marginTop: -18,
    paddingVertical: 0
  },
  logoWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible"
  },
  sideTabWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center"
  },
  logoCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.primary,
    borderWidth: 2,
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
    height: "100%",
    marginTop: 3
  },
  text: {
    color: theme.colors.primary,
    letterSpacing: 0.2,
    fontSize: 12,
    fontFamily: FONT_BOLD
  },
  activeText: {
    color: "#FFFFFF"
  },
  badge: {
    position: "absolute",
    top: -8,
    right: -12,
    backgroundColor: theme.colors.danger,
    borderRadius: 999,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fff",
    zIndex: 20
  },
  badgeText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 9,
    fontFamily: FONT_REGULAR
  },
  adminPill: {
    position: "absolute",
    right: 8,
    top: -12,
    backgroundColor: "#F4EEF9",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#EADCF8",
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  adminPillActive: {
    backgroundColor: theme.colors.primary
  },
  adminPillText: {
    color: theme.colors.primary,
    fontWeight: "600",
    fontSize: 11,
    fontFamily: FONT_MEDIUM
  },
  adminPillTextActive: {
    color: "#fff"
  }
});
