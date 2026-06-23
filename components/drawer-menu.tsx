import { colors, radius, spacing } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
    Animated,
    Dimensions,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SCREEN_WIDTH = Dimensions.get("window").width;
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.78, 320);

interface DrawerMenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  route?: string;
  onPress?: () => void;
  color?: string;
  badge?: string;
}

interface DrawerMenuProps {
  visible: boolean;
  onClose: () => void;
  userName?: string | null;
  userEmail?: string | null;
}

export default function DrawerMenu({ visible, onClose, userName, userEmail }: DrawerMenuProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = React.useState(false);

  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -DRAWER_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => setModalVisible(false));
    }
  }, [visible, translateX, overlayOpacity]);

  const navigate = (route: string) => {
    onClose();
    setTimeout(() => router.push(route as any), 50);
  };

  const menuItems: DrawerMenuItem[] = [
    {
      icon: "person-circle-outline",
      label: "Minha Conta",
      sublabel: "Perfil e configurações",
      route: "/account",
      color: colors.primary,
    },
    {
      icon: "share-outline",
      label: "Exportar Dados",
      sublabel: "PDF, Excel ou CSV",
      route: "/export-data",
      color: colors.info,
    },
    {
      icon: "save-outline",
      label: "Backup",
      sublabel: "Gerencie seus backups",
      route: "/backup",
      color: colors.warning,
    },
    {
      icon: "shield-checkmark-outline",
      label: "Política de Privacidade",
      sublabel: "LGPD e direitos",
      route: "/privacy",
      color: colors.success,
    },
    {
      icon: "diamond-outline",
      label: "Assinatura",
      sublabel: "Gerencie seu plano",
      route: "/billing",
      color: "#f472b6",
    },
  ];

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Overlay */}
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          { transform: [{ translateX }], paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg },
        ]}
      >
        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Avatar + nome */}
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {userName ? userName.charAt(0).toUpperCase() : "U"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName} numberOfLines={1}>
              {userName || "Usuário"}
            </Text>
            {userEmail ? (
              <Text style={styles.profileEmail} numberOfLines={1}>
                {userEmail}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Menu items */}
        <View style={[styles.menuList, { flex: 1 }]}>
          {menuItems.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.menuItem, !item.route && styles.menuItemDisabled]}
              onPress={() => {
                if (item.onPress) { item.onPress(); onClose(); }
                else if (item.route) navigate(item.route);
              }}
              activeOpacity={item.route ? 0.7 : 1}
            >
              <View style={[styles.menuIcon, { backgroundColor: (item.color ?? colors.primary) + "22" }]}>
                <Ionicons name={item.icon} size={20} color={item.color ?? colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                {item.sublabel ? (
                  <Text style={styles.menuSublabel}>{item.sublabel}</Text>
                ) : null}
              </View>
              {item.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              ) : item.route ? (
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              ) : (
                <View style={styles.comingSoon}>
                  <Text style={styles.comingSoonText}>Em breve</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.divider} />

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Finance App</Text>
          <Text style={styles.footerVersion}>v1.0.0</Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 16,
    paddingHorizontal: spacing.lg,
  },
  closeBtn: {
    alignSelf: "flex-end",
    padding: spacing.xs,
    marginBottom: spacing.md,
  },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary + "33",
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.primary,
  },
  profileName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  profileEmail: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  menuList: {
    gap: spacing.xs,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  menuItemDisabled: {
    opacity: 0.7,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  menuSublabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textInverse,
  },
  comingSoon: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  comingSoonText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: "600",
  },
  footer: {
    alignItems: "center",
    paddingTop: spacing.lg,
  },
  footerText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
  },
  footerVersion: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
