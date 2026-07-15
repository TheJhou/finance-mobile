import { colors } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

interface ScrollFadeProps {
  height?: number;
  fadeColor?: string;
}

export function ScrollFade({ height = 24, fadeColor }: Readonly<ScrollFadeProps>) {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const bg = fadeColor ?? colors.background;
  return (
    <View style={styles.container} pointerEvents="none">
      <LinearGradient
        colors={[bg + "00", bg]}
        style={[styles.gradient, { height }]}
      />
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    container: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
    },
    gradient: {
      width: "100%",
    },
  });
}
