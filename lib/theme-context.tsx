import { applyTheme, type ThemeMode } from "@/lib/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

const THEME_KEY = "app_theme_mode";

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveIsDark(mode: ThemeMode, systemScheme: string | null): boolean {
  if (mode === "system") return systemScheme !== "light";
  return mode === "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_KEY);
        if (stored === "light" || stored === "dark" || stored === "system") {
          setMode(stored);
        }
      } catch {
        // default system
      }
    })();
  }, []);

  const isDark = resolveIsDark(mode, systemScheme as string | null);

  // Apply theme synchronously during render so that children using
  // useMemo([isDark]) see the correct colors object immediately.
  applyTheme(isDark ? "dark" : "light");

  const setTheme = useCallback((newMode: ThemeMode) => {
    setMode(newMode);
    AsyncStorage.setItem(THEME_KEY, newMode).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(mode === "dark" ? "light" : "dark");
  }, [mode, setTheme]);

  return (
    <ThemeContext.Provider value={{ mode, isDark, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/**
 * Recria os estilos quando o tema muda.
 * `colors` (lib/theme) é um objeto mutado por applyTheme durante o render, então
 * a fábrica lê as cores direto dele; isDark é só o sinal de que elas mudaram.
 */
export function useThemedStyles<T>(factory: () => T): T {
  const { isDark } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, [isDark]);
}
