import DrawerMenu from "@/components/drawer-menu";
import { getStoredUserName } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { onNotificationQueued } from "@/lib/notification-events";
import { countPendingApproval } from "@/lib/notification-queue";
import { getProfilePhotoUri, onProfilePhotoChange } from "@/lib/profile-photo";
import { colors, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { formatCurrency } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function AppHeader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);

  const [drawerVisible, setDrawerVisible] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);

  const loadUserData = useCallback(async () => {
    const name = await getStoredUserName();
    setUserName(name);
    const photo = await getProfilePhotoUri();
    setProfilePhoto(photo);
    try {
      const db = await getDb();
      const [balanceRow, pendingCountResult] = await Promise.all([
        db.getFirstAsync<{ balance: number | null }>(
          `SELECT COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END), 0) as balance
           FROM transactions WHERE status = 'PAID'`
        ),
        countPendingApproval(),
      ]);
      setBalance(balanceRow?.balance ?? 0);
      setPendingCount(pendingCountResult);
    } catch {
      // offline
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [loadUserData])
  );

  // Subscribe to real-time photo changes from account screen
  useEffect(() => {
    return onProfilePhotoChange((uri) => setProfilePhoto(uri));
  }, []);

  // Update badge in real-time when notification queue changes
  useEffect(() => {
    return onNotificationQueued(() => {
      loadUserData();
    });
  }, [loadUserData]);

  return (
    <>
      <DrawerMenu
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        userName={userName}
        profilePhoto={profilePhoto}
      />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.push("/(app)/account")}
        >
          {profilePhoto ? (
            <Image source={{ uri: profilePhoto }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={18} color={colors.textSecondary} />
            </View>
          )}
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.greeting} numberOfLines={1}>
            {getGreeting()}, {userName ?? "..."}
          </Text>
          {balance !== null && (
            <Text style={styles.balanceText} numberOfLines={1}>
              {formatCurrency(balance)}
            </Text>
          )}
        </View>

        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          onPress={toggleTheme}
        >
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          style={{ overflow: "visible" }}
          onPress={() => router.push("/(app)/notifications")}
        >
          <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
          {pendingCount > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{Math.min(pendingCount, 9)}</Text></View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => setDrawerVisible(true)}
        >
          <Ionicons name="menu" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </>
  );
}

function createStyles() {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: spacing.md,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    avatarPlaceholder: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary + "22",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: colors.primary,
    },
    title: {
      flex: 1,
      fontSize: 17,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    greeting: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    balanceText: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 1,
    },
    badge: {
      position: "absolute",
      top: -6,
      right: -8,
      backgroundColor: colors.danger,
      borderRadius: 10,
      width: 18,
      height: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: {
      fontSize: 10,
      fontWeight: "700",
      color: "#fff",
    },
  });
}
