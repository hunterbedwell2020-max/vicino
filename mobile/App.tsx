import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  AppState,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from "react-native";
import * as Location from "expo-location";
import { getAuthSession, postLogout, postUserLocation, type ApiUser, type VerificationStatus } from "./src/api";
import { TabBar } from "./src/components/TabBar";
import { AdminScreen } from "./src/screens/AdminScreen";
import { ActiveMatchesScreen } from "./src/screens/ActiveMatchesScreen";
import { MessagesScreen } from "./src/screens/MessagesScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { SwipeScreen } from "./src/screens/SwipeScreen";
import { useVicinoState } from "./src/state/appState";
import { theme } from "./src/theme";

const AUTH_TOKEN_KEY = "vicino_auth_token";
const LOCATION_SYNC_MS = 3 * 60 * 1000;

export default function App() {
  const [booting, setBooting] = useState(true);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [verification, setVerification] = useState<VerificationStatus | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const canAccessApp = Boolean(user && (user.isAdmin || verification?.status === "approved"));
  const activeUserId = canAccessApp && user ? user.id : null;
  const state = useVicinoState(activeUserId);

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

  const locked = !canAccessApp;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.topInset} />
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.brand}>Vicino</Text>
              <Text style={styles.subtitle}>Near, intentional, and in-person.</Text>
            </View>
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
          {booting ? (
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
                  <SwipeScreen card={state.topCard} remaining={state.deck.length} onSwipe={state.swipe} />
                </View>
              )}

              {state.tab === "messages" && (
                <MessagesScreen
                  matches={state.matches}
                  activeMatch={state.activeChatMatch}
                  openChat={state.openChat}
                  closeChat={state.closeChat}
                  sendMessage={state.sendMessage}
                  sendAutoReply={state.sendAutoReply}
                  messageCapReached={state.messageCapReached}
                  setMeetDecision={state.setMeetDecision}
                  bothMeetYes={state.bothMeetYes}
                />
              )}

              {state.tab === "matches" && (
                <ScrollView contentContainerStyle={styles.scrollWrap}>
                  <ActiveMatchesScreen
                    matches={state.matches}
                    bothMeetYes={state.bothMeetYes}
                    messageCapReached={state.messageCapReached}
                    outTonight={state.outTonight}
                    eligibleOutCount={state.eligibleOutMatches.length}
                    startOutTonight={state.startOutTonight}
                    stopOutTonight={state.stopOutTonight}
                    simulateCandidateResponses={state.simulateCandidateResponses}
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
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },
  brand: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 30
  },
  subtitle: {
    marginTop: 2,
    color: "#EADCF8"
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
    fontSize: 16
  },
  body: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 14,
    paddingTop: 14
  },
  bootCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 16
  },
  bootText: {
    color: theme.colors.text
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
    fontWeight: "800"
  },
  matchToastSub: {
    color: "#F1E7FC"
  },
  footer: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8
  },
  errorText: {
    color: "#B42318",
    fontWeight: "700",
    textAlign: "center"
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
    fontWeight: "800"
  },
  profileModalClose: {
    color: theme.colors.primary,
    fontWeight: "700"
  }
});
