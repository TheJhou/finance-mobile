import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { applyTheme, type ThemeMode } from "@/lib/theme";

const THEME_KEY = "app_theme_mode";

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_KEY);
        if (stored === "light" || stored === "dark") {
          setMode(stored);
          applyTheme(stored);
        }
      } catch {
        // default dark
      }
    })();
  }, []);

  const setTheme = useCallback((newMode: ThemeMode) => {
    setMode(newMode);
    applyTheme(newMode);
    AsyncStorage.setItem(THEME_KEY, newMode).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(mode === "dark" ? "light" : "dark");
  }, [mode, setTheme]);

  return (
    <ThemeContext.Provider value={{ mode, isDark: mode === "dark", toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
