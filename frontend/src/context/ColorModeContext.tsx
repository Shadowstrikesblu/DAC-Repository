import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { getTheme, type ColorMode } from "../theme";

interface ColorModeContextType {
  mode: ColorMode;
  toggleColorMode: () => void;
  setMode: (m: ColorMode) => void;
}

const ColorModeContext = createContext<ColorModeContextType | undefined>(undefined);

const STORAGE_KEY = "dac_color_mode";

function initialMode(): ColorMode {
  const saved = (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY)) as ColorMode | null;
  if (saved === "light" || saved === "dark") return saved;
  // Par défaut : on respecte la préférence système, sinon sombre.
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(initialMode);

  const setMode = (m: ColorMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  };

  const toggleColorMode = () => setMode(mode === "dark" ? "light" : "dark");

  const theme = useMemo(() => getTheme(mode), [mode]);

  return (
    <ColorModeContext.Provider value={{ mode, toggleColorMode, setMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export function useColorMode(): ColorModeContextType {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error("useColorMode must be used within a ColorModeProvider");
  return ctx;
}
