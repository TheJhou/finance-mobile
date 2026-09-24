import { colors } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps, type StyleProp, type ViewStyle, ScrollView, StyleSheet, View } from "react-native";

interface ScrollFadeProps {
  height?: number;
  fadeColor?: string;
}

export function ScrollFade({ height = 40, fadeColor }: Readonly<ScrollFadeProps>) {
  const styles = useThemedStyles(createStyles);
  const bg = fadeColor ?? colors.background;
  return (
    <View style={styles.container} pointerEvents="none">
      <LinearGradient
        colors={[bg + "00", bg + "80", bg]}
        locations={[0, 0.5, 1]}
        style={[styles.gradient, { height }]}
      />
    </View>
  );
}

interface HorizontalScrollFadeProps extends ScrollViewProps {
  fadeColor?: string;
  /** Estilo do contêiner externo (ex.: margem negativa para ir até a borda da tela) */
  containerStyle?: StyleProp<ViewStyle>;
  fadeWidth?: number;
  children: React.ReactNode;
}

export function HorizontalScrollFade({
  fadeColor,
  fadeWidth = 40,
  children,
  style,
  containerStyle,
  ...scrollViewProps
}: Readonly<HorizontalScrollFadeProps>) {
  const styles = useThemedStyles(createStyles);
  const bg = fadeColor ?? colors.background;
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);

  return (
    // Sem width fixa: o contêiner estica, e margens negativas em containerStyle o
    // alargam até as bordas (com width 100% elas só deslocavam o carrossel)
    <View style={[{ position: "relative" }, containerStyle]}>
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
        style={[{ width: "100%" }, style]}
        {...scrollViewProps}
      >
        {children}
      </ScrollView>
      {showLeft && (
        <LinearGradient
          colors={[bg, bg + "80", bg + "00"]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.hFade, { left: 0, width: fadeWidth }]}
          pointerEvents="none"
        />
      )}
      {showRight && (
        <LinearGradient
          colors={[bg + "00", bg + "80", bg]}
          locations={[0, 0.5, 1]}
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
