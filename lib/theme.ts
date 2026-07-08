export type ThemeMode = "dark" | "light";

const darkColors = {
  primary: "#a78bfa",
  primaryDark: "#7c3aed",
  primaryLight: "#c4b5fd",
  success: "#34d399",
  danger: "#f87171",
  warning: "#fbbf24",
  info: "#60a5fa",

  background: "#0f0d1b",
  surface: "#1a1730",
  surfaceElevated: "#231f3d",
  border: "#2d2950",
  borderStrong: "#3d3766",

  textPrimary: "#f1f0f5",
  textSecondary: "#9d99b3",
  textMuted: "#6b6588",
  textInverse: "#ffffff",

  incomeBg: "#064e3b",
  incomeFg: "#34d399",
  expenseBg: "#7f1d1d",
  expenseFg: "#f87171",

  cardGreen: "#b8e648",
  cardOrange: "#ff8c42",
  cardPurple: "#a78bfa",
  chartLine: "#a78bfa",
  chartLineSecondary: "#34d399",
  chartBar1: "#a78bfa",
  chartBar2: "#f472b6",
  chartBar3: "#60a5fa",
  chartBar4: "#fbbf24",
};

const lightColors = {
  primary: "#6366f1",
  primaryDark: "#4f46e5",
  primaryLight: "#a5b4fc",
  success: "#059669",
  danger: "#dc2626",
  warning: "#d97706",
  info: "#2563eb",

  background: "#f3f4f6",
  surface: "#ffffff",
  surfaceElevated: "#f9fafb",
  border: "#e5e7eb",
  borderStrong: "#d1d5db",

  textPrimary: "#111827",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",
  textInverse: "#ffffff",

  incomeBg: "#d1fae5",
  incomeFg: "#059669",
  expenseBg: "#fee2e2",
  expenseFg: "#dc2626",

  cardGreen: "#b8e648",
  cardOrange: "#ff8c42",
  cardPurple: "#6366f1",
  chartLine: "#6366f1",
  chartLineSecondary: "#059669",
  chartBar1: "#6366f1",
  chartBar2: "#f472b6",
  chartBar3: "#2563eb",
  chartBar4: "#d97706",
};

export type ColorPalette = typeof darkColors;

export const colors: ColorPalette = { ...darkColors };

export function applyTheme(mode: ThemeMode) {
  const palette = mode === "light" ? lightColors : darkColors;
  (Object.keys(palette) as (keyof ColorPalette)[]).forEach((key) => {
    (colors as Record<string, string>)[key] = palette[key];
  });
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;
