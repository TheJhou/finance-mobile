import { colors } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState } from "react";
import { type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps, ScrollView, StyleSheet, View } from "react-native";

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

interface HorizontalScrollFadeProps extends ScrollViewProps {
  fadeColor?: string;
  fadeWidth?: number;
  children: React.ReactNode;
}

export function HorizontalScrollFade({
  fadeColor,
  fadeWidth = 16,
  children,
  ...scrollViewProps
}: Readonly<HorizontalScrollFadeProps>) {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const bg = fadeColor ?? colors.background;
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);

  return (
    <View style={{ position: "relative" }}>
      <ScrollView
        horizontal
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          setShowLeft(contentOffset.x > 4);
          setShowRight(
            contentOffset.x + layoutMeasurement.width < contentSize.width - 4
          );
        }}
        scrollEventThrottle={16}
        {...scrollViewProps}
      >
        {children}
      </ScrollView>
      {showLeft && (
        <LinearGradient
          colors={[bg, bg + "00"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.hFade, { left: 0, width: fadeWidth }]}
          pointerEvents="none"
        />
      )}
      {showRight && (
        <LinearGradient
          colors={[bg + "00", bg]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.hFade, { right: 0, width: fadeWidth }]}
          pointerEvents="none"
        />
      )}
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
    hFade: {
      position: "absolute",
      top: 0,
      bottom: 0,
    },
  });
}
