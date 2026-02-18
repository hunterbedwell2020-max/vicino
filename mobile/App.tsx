import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Dimensions,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as Location from "expo-location";
import {
  getAuthSession,
  postAnalyticsEvent,
  postLogout,
  postReportUser,
  postUserLocation,
  postUserPushToken,
  type ApiUser,
  type VerificationStatus
} from "./src/api";
import { TabBar } from "./src/components/TabBar";
import { ProfilePreviewModal } from "./src/components/ProfilePreviewModal";
import { AdminScreen } from "./src/screens/AdminScreen";
import { ActiveMatchesScreen } from "./src/screens/ActiveMatchesScreen";
import { MessagesScreen } from "./src/screens/MessagesScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { SwipeScreen } from "./src/screens/SwipeScreen";
import { useVicinoState } from "./src/state/appState";
import { theme } from "./src/theme";
import type { ProfileCard } from "./src/types";

const AUTH_TOKEN_KEY = "vicino_auth_token";
const LOCATION_SYNC_MS = 3 * 60 * 1000;
const SCREEN_HEIGHT = Dimensions.get("window").height;

export default function App() {
  const [fontsLoaded] = useFonts({
    "Satoshi-Regular": require("./assets/satoshi/Satoshi-Regular.otf"),
    "Satoshi-Medium": require("./assets/satoshi/Satoshi-Medium.otf"),
    "Satoshi-Bold": require("./assets/satoshi/Satoshi-Bold.otf")
  });
  const [booting, setBooting] = useState(true);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [verification, setVerification] = useState<VerificationStatus | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [previewProfile, setPreviewProfile] = useState<ProfileCard | null>(null);
  const [lastPushToken, setLastPushToken] = useState<string | null>(null);
  const menuTranslateY = useRef(new Animated.Value(-SCREEN_HEIGHT)).current;

  const canAccessApp = Boolean(user && (user.isAdmin || verification?.status === "approved"));
  const activeUserId = canAccessApp && user ? user.id : null;
  const state = useVicinoState(activeUserId);

  useEffect(() => {
    if (!fontsLoaded) {
      return;
    }

    const TextAny = Text as unknown as { defaultProps?: Record<string, unknown> };
    const textDefaults = TextAny.defaultProps ?? {};
    TextAny.defaultProps = {
      ...textDefaults,
      style: [{ fontFamily: "Satoshi-Medium" }, textDefaults.style]
    };

    const TextInputAny = TextInput as unknown as { defaultProps?: Record<string, unknown> };
    const inputDefaults = TextInputAny.defaultProps ?? {};
    TextInputAny.defaultProps = {
      ...inputDefaults,
      style: [{ fontFamily: "Satoshi-Medium" }, inputDefaults.style]
    };
  }, [fontsLoaded]);

  const hydrateSession = async () => {
    setBooting(true);
    setAuthError(null);
    try {
      const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) {
        setAuthToken(null);
        setUser(null);
        setVerification(null);
        return;
      }
      const session = await getAuthSession(token);
      setAuthToken(token);
      setUser(session.user);
      setVerification(session.verification);
    } catch (err) {
      setAuthToken(null);
      setUser(null);
      setVerification(null);
      setAuthError((err as Error).message);
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY).catch(() => null);
    } finally {
      setBooting(false);
    }
  };

  useEffect(() => {
    void hydrateSession();
  }, []);

  useEffect(() => {
    if (!user?.isAdmin && state.tab === "admin") {
      state.setTab("swipe");
    }
    if (state.tab === "profile") {
      state.setTab("swipe");
    }
  }, [user?.isAdmin, state.tab, state.setTab]);

  useEffect(() => {
    if (!canAccessApp) {
      setProfileOpen(false);
    }
  }, [canAccessApp]);

  useEffect(() => {
    if (!activeUserId) {
      return;
    }

    let disposed = false;
    let syncInFlight = false;

    const syncLocation = async (promptIfNeeded: boolean) => {
      if (disposed || syncInFlight) {
        return;
      }

      syncInFlight = true;
      try {
        let permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted && promptIfNeeded) {
          permission = await Location.requestForegroundPermissionsAsync();
        }
        if (!permission.granted) {
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        await postUserLocation(activeUserId, current.coords.latitude, current.coords.longitude);
      } catch {
        // Non-blocking: location update failures should not break app usage.
      } finally {
        syncInFlight = false;
      }
    };

    void syncLocation(true);
    const interval = setInterval(() => {
      void syncLocation(false);
    }, LOCATION_SYNC_MS);

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void syncLocation(false);
      }
    });

    return () => {
      disposed = true;
      clearInterval(interval);
      sub.remove();
    };
  }, [activeUserId]);

  useEffect(() => {
    if (!user?.id) {
      setLastPushToken(null);
      return;
    }

    let cancelled = false;

    const registerPushToken = async () => {
      try {
        let NotificationsModule: unknown;
        try {
          NotificationsModule = require("expo-notifications");
        } catch {
          return;
        }

        const Notifications = NotificationsModule as {
          setNotificationHandler?: (handler: unknown) => void;
          getPermissionsAsync: () => Promise<{ status: string }>;
          requestPermissionsAsync: () => Promise<{ status: string }>;
          getExpoPushTokenAsync: () => Promise<{ data: string }>;
        };

        Notifications.setNotificationHandler?.({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: false,
            shouldSetBadge: false
          })
        });

        let permission = await Notifications.getPermissionsAsync();
        if (permission.status !== "granted") {
          permission = await Notifications.requestPermissionsAsync();
        }
        if (permission.status !== "granted") {
          return;
        }

        const tokenData = await Notifications.getExpoPushTokenAsync();
        const expoPushToken = tokenData?.data?.trim();
        if (!expoPushToken || cancelled) {
          return;
        }
        if (expoPushToken === lastPushToken) {
          return;
        }

        await postUserPushToken(user.id, expoPushToken, Platform.OS);
        if (!cancelled) {
          setLastPushToken(expoPushToken);
        }
      } catch {
        // Non-blocking: push token registration should not affect normal app usage.
      }
    };

    void registerPushToken();

    return () => {
      cancelled = true;
    };
  }, [user?.id, lastPushToken]);

  const signIn = async (token: string, nextUser: ApiUser, nextVerification: VerificationStatus) => {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
    setAuthToken(token);
    setUser(nextUser);
    setVerification(nextVerification);
    setAuthError(null);
  };

  const signOut = async () => {
    if (authToken) {
      await postLogout(authToken).catch(() => null);
    }
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY).catch(() => null);
    setAuthToken(null);
    setUser(null);
    setVerification(null);
  };

  const openProfilePreviewForMatch = (matchId: string) => {
    const profile = state.getProfileCardByMatchId(matchId);
    if (profile) {
      setPreviewProfile(profile);
    }
  };

  const reportUserFromProfile = async (targetUserId: string) => {
    if (!user?.id) {
      return;
    }
    try {
      await postReportUser(user.id, targetUserId, "inappropriate_behavior");
      setNotice("Report submitted. Our team will review.");
      setTimeout(() => setNotice(null), 2200);
    } catch (err) {
      setNotice((err as Error).message);
      setTimeout(() => setNotice(null), 2600);
    }
  };

  const locked = !canAccessApp;

  const refreshContent = async () => {
    if (!canAccessApp || refreshing) {
      return;
    }
    setRefreshing(true);
    try {
      await state.refreshAll();
    } finally {
      setRefreshing(false);
    }
  };

  const openMenu = () => {
    if (menuOpen) {
      return;
    }
    setMenuOpen(true);
    menuTranslateY.setValue(-SCREEN_HEIGHT);
    Animated.spring(menuTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 22,
      stiffness: 200,
      mass: 0.8
    }).start();
  };

  const closeMenu = (afterClose?: () => void) => {
    Animated.timing(menuTranslateY, {
      toValue: -SCREEN_HEIGHT,
      duration: 210,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) {
        setMenuOpen(false);
        afterClose?.();
      }
    });
  };

  const headerPullResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && gestureState.dy > 6,
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 36) {
            openMenu();
          }
        }
      }),
    [menuOpen]
  );

  const menuPullResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 5,
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dy < 0) {
            menuTranslateY.setValue(gestureState.dy);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy < -80) {
            closeMenu();
            return;
          }
          Animated.spring(menuTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 220
          }).start();
        }
      }),
    [menuTranslateY]
  );

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.topInset} />
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <View style={[styles.header, styles.headerCompact]} {...headerPullResponder.panHandlers}>
          <View style={styles.headerTopRow}>
            <Image
              source={require("./assets/vicino_header_left.png")}
              style={[styles.headerLogo, styles.headerLogoCompact]}
              resizeMode="contain"
            />
            {!locked && user ? (
              <Pressable style={styles.profileBtn} onPress={() => setProfileOpen(true)}>
                {user.profilePhotoUrl ? (
                  <Image source={{ uri: user.profilePhotoUrl }} style={styles.profileBtnImage} resizeMode="cover" />
                ) : (
                  <Text style={styles.profileBtnText}>
                    {(user.firstName?.slice(0, 1) || "U").toUpperCase()}
                  </Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.body}>
          {!fontsLoaded ? (
            <View style={styles.bootCard}>
              <Text style={styles.bootText}>Loading fonts...</Text>
            </View>
          ) : booting ? (
            <View style={styles.bootCard}>
              <Text style={styles.bootText}>Loading session...</Text>
            </View>
          ) : locked ? (
            <ScrollView contentContainerStyle={styles.scrollWrap}>
              <OnboardingScreen
                currentUser={user}
                onSignedIn={(token, nextUser, nextVerification) => void signIn(token, nextUser, nextVerification)}
                onSignedOut={() => void signOut()}
                onVerificationUpdated={setVerification}
              />
              {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
            </ScrollView>
          ) : (
            <>
              {state.matchToastName ? (
                <View style={styles.matchToast} pointerEvents="none">
                  <Text style={styles.matchToastTitle}>Match!</Text>
                  <Text style={styles.matchToastSub}>You and {state.matchToastName} liked each other.</Text>
                </View>
              ) : null}

              {state.tab === "swipe" && (
                <View style={styles.swipeWrap}>
                  <SwipeScreen
                    card={state.topCard}
                    remaining={state.deck.length}
                    onSwipe={state.swipe}
                    swipeError={state.swipeError}
                    onDismissSwipeError={state.clearSwipeError}
                    onReport={(targetUserId) => void reportUserFromProfile(targetUserId)}
                  />
                </View>
              )}

              {state.tab === "messages" && (
                <MessagesScreen
                  matches={state.matches}
                  activeMatch={state.activeChatMatch}
                  openMatchProfile={openProfilePreviewForMatch}
                  openChat={state.openChat}
                  closeChat={state.closeChat}
                  sendMessage={state.sendMessage}
                  sendAutoReply={state.sendAutoReply}
                  messageCapReached={state.messageCapReached}
                  setMeetDecision={state.setMeetDecision}
                  bothMeetYes={state.bothMeetYes}
                  showDevTools={Boolean(user?.isAdmin)}
                  refreshing={refreshing}
                  onRefresh={refreshContent}
                />
              )}

              {state.tab === "matches" && (
                <ScrollView
                  contentContainerStyle={styles.scrollWrap}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshContent} />}
                >
                  <ActiveMatchesScreen
                    matches={state.matches}
                    openMatchProfile={openProfilePreviewForMatch}
                    bothMeetYes={state.bothMeetYes}
                    messageCapReached={state.messageCapReached}
                    outTonight={state.outTonight}
                    eligibleOutCount={state.eligibleOutMatches.length}
                    startOutTonight={state.startOutTonight}
                    stopOutTonight={state.stopOutTonight}
                    simulateCandidateResponses={state.simulateCandidateResponses}
                    showDevTools={Boolean(user?.isAdmin)}
                    chooseCandidate={state.chooseCandidate}
                    sendMeetOffer={state.sendMeetOffer}
                    respondToMeetOffer={state.respondToMeetOffer}
                    syncMeetupTimers={state.syncMeetupTimers}
                  />
                </ScrollView>
              )}

              {state.tab === "admin" && authToken && user?.isAdmin ? (
                <ScrollView contentContainerStyle={styles.scrollWrap}>
                  <AdminScreen authToken={authToken} />
                </ScrollView>
              ) : null}
            </>
          )}
        </View>
        <ProfilePreviewModal
          visible={Boolean(previewProfile)}
          profile={previewProfile}
          onClose={() => setPreviewProfile(null)}
          onReport={(targetUserId) => void reportUserFromProfile(targetUserId)}
        />

        {notice ? (
          <View style={styles.noticeToast} pointerEvents="none">
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        {!locked ? (
          <View style={styles.footer}>
            <TabBar
              active={state.tab}
              onChange={state.setTab}
              activeMatchesBadgeCount={state.unseenMatchCount}
              isAdmin={Boolean(user?.isAdmin)}
            />
          </View>
        ) : null}

        <Modal visible={profileOpen && Boolean(activeUserId)} animationType="slide">
          <SafeAreaView style={styles.profileModalSafe}>
            <View style={styles.profileModalHeader}>
              <Text style={styles.profileModalTitle}>Profile & Settings</Text>
              <Pressable onPress={() => setProfileOpen(false)}>
                <Text style={styles.profileModalClose}>Close</Text>
              </Pressable>
            </View>
            {activeUserId ? (
              <ScrollView contentContainerStyle={styles.scrollWrap}>
                <ProfileScreen
                  userId={activeUserId}
                  onProfileUpdated={setUser}
                  onSignOut={() => {
                    setProfileOpen(false);
                    void signOut();
                  }}
                />
              </ScrollView>
            ) : null}
          </SafeAreaView>
        </Modal>

        <Modal visible={menuOpen} transparent animationType="none" onRequestClose={() => closeMenu()}>
          <Animated.View
            style={[styles.menuPage, { transform: [{ translateY: menuTranslateY }] }]}
            {...menuPullResponder.panHandlers}
          >
            <SafeAreaView style={styles.menuSafe}>
              <View style={styles.menuHandle} />
              <Text style={styles.menuTitle}>Vicino Menu</Text>

              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  closeMenu(() => setProfileOpen(true));
                }}
              >
                <Text style={styles.menuText}>Profile</Text>
              </Pressable>

              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  closeMenu(() => setSettingsOpen(true));
                }}
              >
                <Text style={styles.menuText}>Settings</Text>
              </Pressable>

              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  closeMenu(() => setPrivacyOpen(true));
                }}
              >
                <Text style={styles.menuText}>Privacy Policy</Text>
              </Pressable>

              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  closeMenu(() => {
                    void Linking.openURL("mailto:support@vicino.app?subject=Vicino%20Support").catch(() => null);
                  });
                }}
              >
                <Text style={styles.menuText}>Support</Text>
              </Pressable>

              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  closeMenu(() => {
                    void signOut();
                  });
                }}
              >
                <Text style={[styles.menuText, styles.menuDanger]}>Log Out</Text>
              </Pressable>
            </SafeAreaView>
          </Animated.View>
        </Modal>

        <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
          <Pressable style={styles.privacyBackdrop} onPress={() => setSettingsOpen(false)}>
            <Pressable style={styles.policySheet} onPress={() => null}>
              <Text style={styles.menuTitleDark}>Settings</Text>
              <View style={styles.settingsList}>
                <Pressable
                  style={styles.settingsRow}
                  onPress={() => {
                    setSettingsOpen(false);
                    setMembershipOpen(true);
                    void postAnalyticsEvent("view_paywall", user?.id, { source: "settings" }).catch(() => null);
                  }}
                >
                  <Text style={styles.settingsLabel}>Membership</Text>
                  <Text style={styles.settingsValue}>
                    {String(user?.planTier ?? "free").toLowerCase() === "plus" ? "Plus" : "Free"}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.settingsRow}
                  onPress={() => {
                    setSettingsOpen(false);
                    setProfileOpen(true);
                  }}
                >
                  <Text style={styles.settingsLabel}>Edit Profile</Text>
                </Pressable>

                <Pressable
                  style={styles.settingsRow}
                  onPress={() => {
                    setSettingsOpen(false);
                    setPrivacyOpen(true);
                  }}
                >
                  <Text style={styles.settingsLabel}>Privacy Policy</Text>
                </Pressable>

                <Pressable
                  style={styles.settingsRow}
                  onPress={() => {
                    setSettingsOpen(false);
                    void Linking.openURL("mailto:support@vicino.app?subject=Vicino%20Support").catch(() => null);
                  }}
                >
                  <Text style={styles.settingsLabel}>Support</Text>
                </Pressable>

                <Pressable
                  style={styles.settingsRow}
                  onPress={() => {
                    setSettingsOpen(false);
                    void signOut();
                  }}
                >
                  <Text style={styles.settingsDanger}>Log Out</Text>
                </Pressable>
              </View>

              <Pressable style={styles.menuCloseBtn} onPress={() => setSettingsOpen(false)}>
                <Text style={styles.menuCloseText}>Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={membershipOpen} transparent animationType="fade" onRequestClose={() => setMembershipOpen(false)}>
          <Pressable style={styles.privacyBackdrop} onPress={() => setMembershipOpen(false)}>
            <Pressable style={styles.policySheet} onPress={() => null}>
              <Text style={styles.menuTitleDark}>Vicino Membership</Text>
              <Text style={styles.membershipBody}>
                Free: capped daily swipes and standard messaging.
              </Text>
              <Text style={styles.membershipBody}>
                Plus (coming soon): unlimited swipes and premium features.
              </Text>
              <Pressable
                style={styles.membershipBtn}
                onPress={() => {
                  void postAnalyticsEvent("tap_upgrade_paywall", user?.id, {
                    source: "settings_membership_modal"
                  }).catch(() => null);
                  void Linking.openURL(
                    "mailto:support@vicino.app?subject=Vicino%20Plus%20Waitlist&body=Please%20add%20me%20to%20Vicino%20Plus."
                  ).catch(() => null);
                }}
              >
                <Text style={styles.membershipBtnText}>Join Plus Waitlist</Text>
              </Pressable>
              <Pressable style={styles.membershipSecondaryBtn} onPress={() => setMembershipOpen(false)}>
                <Text style={styles.membershipSecondaryText}>Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={privacyOpen} transparent animationType="fade" onRequestClose={() => setPrivacyOpen(false)}>
          <Pressable style={styles.privacyBackdrop} onPress={() => setPrivacyOpen(false)}>
            <Pressable style={styles.policySheet} onPress={() => null}>
              <Text style={styles.menuTitleDark}>Privacy Policy</Text>
              <ScrollView style={styles.policyScroll} contentContainerStyle={styles.policyContent}>
                <Text style={styles.policyText}>
                  Vicino collects account details, profile content, messages, and location information to operate core
                  dating and meetup safety features. By using Vicino, you consent to this processing and acknowledge
                  that violating community safety standards can result in moderation action, including account
                  suspension.
                </Text>
                <Text style={styles.policyText}>
                  Identity verification submissions are reviewed for trust and safety. Data is retained only as long as
                  needed for app operations, legal obligations, and abuse prevention. You can request account removal
                  by contacting support.
                </Text>
              </ScrollView>
              <Pressable style={styles.menuCloseBtn} onPress={() => setPrivacyOpen(false)}>
                <Text style={styles.menuCloseText}>Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.primary
  },
  topInset: {
    flex: 0,
    backgroundColor: theme.colors.primary
  },
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background
  },
  header: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20
  },
  headerCompact: {
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },
  headerLogo: {
    flex: 1,
    height: 100,
    marginRight: 2,
    marginLeft: -113
  },
  headerLogoCompact: {
    height: 76
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#EADCF8",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  profileBtnImage: {
    width: "100%",
    height: "100%"
  },
  profileBtnText: {
    color: theme.colors.primary,
    fontWeight: "800",
    fontSize: 16,
    fontFamily: "Satoshi-Regular"
  },
  body: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 14,
    paddingTop: 10
  },
  bootCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 16
  },
  bootText: {
    color: theme.colors.text,
    fontFamily: "Satoshi-Medium"
  },
  scrollWrap: {
    gap: 12,
    paddingBottom: 8
  },
  swipeWrap: {
    flex: 1,
    paddingBottom: 8
  },
  matchToast: {
    position: "absolute",
    top: 10,
    left: 20,
    right: 20,
    zIndex: 30,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14
  },
  matchToastTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    fontFamily: "Satoshi-Regular"
  },
  matchToastSub: {
    color: "#F1E7FC"
  },
  footer: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8
  },
  noticeToast: {
    position: "absolute",
    bottom: 92,
    left: 18,
    right: 18,
    backgroundColor: "rgba(49, 28, 70, 0.95)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 60
  },
  noticeText: {
    color: "#fff",
    textAlign: "center",
    fontFamily: "Satoshi-Regular"
  },
  errorText: {
    color: "#B42318",
    fontWeight: "700",
    textAlign: "center",
    fontFamily: "Satoshi-Regular"
  },
  profileModalSafe: {
    flex: 1,
    backgroundColor: theme.colors.background
  },
  profileModalHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  profileModalTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
    fontFamily: "Satoshi-Regular"
  },
  profileModalClose: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontFamily: "Satoshi-Regular"
  },
  menuPage: {
    flex: 1,
    backgroundColor: theme.colors.primary
  },
  menuSafe: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8
  },
  menuHandle: {
    width: 54,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#DCC7F2",
    alignSelf: "center",
    marginBottom: 12
  },
  menuTitle: {
    paddingHorizontal: 4,
    paddingBottom: 8,
    color: "#fff",
    fontWeight: "800",
    fontSize: 18,
    fontFamily: "Satoshi-Regular"
  },
  menuTitleDark: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    color: theme.colors.text,
    fontWeight: "800",
    fontSize: 16,
    fontFamily: "Satoshi-Regular"
  },
  menuRow: {
    paddingHorizontal: 4,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)"
  },
  menuText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    fontFamily: "Satoshi-Regular"
  },
  menuDanger: {
    color: "#FFD6D6"
  },
  privacyBackdrop: {
    flex: 1,
    backgroundColor: "rgba(14, 7, 22, 0.35)",
    justifyContent: "flex-start",
    paddingTop: 84,
    paddingHorizontal: 14
  },
  policySheet: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EADCF8",
    maxHeight: "68%",
    overflow: "hidden"
  },
  policyScroll: {
    maxHeight: 280
  },
  policyContent: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 10
  },
  policyText: {
    color: theme.colors.text,
    lineHeight: 20
  },
  settingsList: {
    borderTopWidth: 1,
    borderTopColor: "#EFE8F8"
  },
  settingsRow: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE8F8"
  },
  settingsRowStatic: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE8F8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  settingsLabel: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Satoshi-Regular"
  },
  settingsValue: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontFamily: "Satoshi-Regular"
  },
  membershipBody: {
    color: theme.colors.text,
    paddingHorizontal: 14,
    paddingBottom: 10,
    lineHeight: 20
  },
  membershipBtn: {
    marginHorizontal: 14,
    marginTop: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center"
  },
  membershipBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontFamily: "Satoshi-Regular"
  },
  membershipSecondaryBtn: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E3D9F3",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  membershipSecondaryText: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontFamily: "Satoshi-Regular"
  },
  settingsDanger: {
    color: "#B42318",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Satoshi-Regular"
  },
  menuCloseBtn: {
    margin: 14,
    marginTop: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  menuCloseText: {
    color: "#fff",
    fontWeight: "700",
    fontFamily: "Satoshi-Regular"
  }
});
