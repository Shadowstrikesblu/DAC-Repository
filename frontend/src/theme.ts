// src/theme.ts
import { createTheme, type Theme } from "@mui/material";

export type ColorMode = "light" | "dark";

// Palette commune (accent indigo + émeraude, identique dans les deux modes)
const ACCENT = {
  primary: { main: "#6366f1", light: "#8b5cf6", dark: "#4f46e5" },
  secondary: { main: "#10b981", light: "#34d399", dark: "#059669" },
  error: { main: "#ef4444", light: "#f87171", dark: "#dc2626" },
  warning: { main: "#f59e0b", light: "#fbbf24", dark: "#d97706" },
  success: { main: "#10b981", light: "#34d399", dark: "#059669" },
};

// Dégradé de fond "liquid glass" par mode (appliqué sur <body>)
const BODY_BG = {
  dark:
    "radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,0.18), transparent 60%)," +
    "radial-gradient(1000px 500px at 100% 0%, rgba(16,185,129,0.12), transparent 55%)," +
    "#0b1120",
  light:
    "radial-gradient(1200px 600px at 0% -10%, rgba(99,102,241,0.18), transparent 60%)," +
    "radial-gradient(1000px 600px at 100% 0%, rgba(16,185,129,0.14), transparent 55%)," +
    "linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%)",
};

// Surfaces translucides (effet verre) par mode
const GLASS = {
  dark: {
    paper: "rgba(30, 41, 59, 0.72)",        // slate-800 translucide
    border: "rgba(148, 163, 184, 0.14)",
    inputBg: "rgba(51, 65, 85, 0.45)",
    scrollTrack: "rgba(30,41,59,0.4)",
    scrollThumb: "rgba(100,116,139,0.7)",
  },
  light: {
    paper: "rgba(255, 255, 255, 0.62)",     // verre dépoli clair
    border: "rgba(15, 23, 42, 0.08)",
    inputBg: "rgba(255, 255, 255, 0.55)",
    scrollTrack: "rgba(148,163,184,0.18)",
    scrollThumb: "rgba(100,116,139,0.55)",
  },
};

export function getTheme(mode: ColorMode): Theme {
  const isDark = mode === "dark";
  const g = GLASS[mode];

  return createTheme({
    palette: {
      mode,
      ...ACCENT,
      background: {
        default: isDark ? "#0b1120" : "#f4f6fb",
        paper: isDark ? "#1e293b" : "#ffffff",
      },
      text: {
        primary: isDark ? "#f1f5f9" : "#0f172a",
        secondary: isDark ? "#cbd5e1" : "#475569",
      },
      divider: g.border,
    },
    typography: {
      fontFamily:
        '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      h1: { fontWeight: 700, fontSize: "2.5rem", lineHeight: 1.2, letterSpacing: "-0.025em" },
      h2: { fontWeight: 600, fontSize: "2rem", lineHeight: 1.3, letterSpacing: "-0.025em" },
      h3: { fontWeight: 600, fontSize: "1.5rem", lineHeight: 1.4 },
      h4: { fontWeight: 500, fontSize: "1.25rem", lineHeight: 1.4 },
      body1: { fontSize: "0.875rem", lineHeight: 1.55 },
      body2: { fontSize: "0.75rem", lineHeight: 1.5 },
    },
    shape: { borderRadius: 14 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            background: BODY_BG[mode],
            backgroundAttachment: "fixed",
            scrollbarWidth: "thin",
            "&::-webkit-scrollbar": { width: "8px", height: "8px" },
            "&::-webkit-scrollbar-track": { backgroundColor: g.scrollTrack },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: g.scrollThumb,
              borderRadius: "4px",
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: g.paper,
            backgroundImage: "none",
            backdropFilter: "blur(18px) saturate(160%)",
            WebkitBackdropFilter: "blur(18px) saturate(160%)",
            borderBottom: `1px solid ${g.border}`,
            boxShadow: "none",
            color: isDark ? "#f1f5f9" : "#0f172a",
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 600,
            borderRadius: 10,
            padding: "8px 16px",
            transition: "all 0.2s ease-in-out",
            "&:hover": {
              transform: "translateY(-1px)",
              boxShadow: isDark
                ? "0 6px 16px rgba(0,0,0,0.35)"
                : "0 6px 16px rgba(99,102,241,0.18)",
            },
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": {
              borderRadius: 10,
              backgroundColor: g.inputBg,
              backdropFilter: "blur(8px)",
              "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: ACCENT.primary.main },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: ACCENT.primary.main,
                borderWidth: 2,
              },
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backgroundColor: g.paper,
            backdropFilter: "blur(18px) saturate(160%)",
            WebkitBackdropFilter: "blur(18px) saturate(160%)",
            border: `1px solid ${g.border}`,
            boxShadow: isDark
              ? "0 8px 30px rgba(0,0,0,0.35)"
              : "0 8px 30px rgba(15,23,42,0.08)",
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            margin: "2px 8px",
            "&:hover": {
              backgroundColor: "rgba(99, 102, 241, 0.12)",
              transform: "translateX(4px)",
              transition: "all 0.2s ease-in-out",
            },
            "&.Mui-selected": {
              backgroundColor: "rgba(99, 102, 241, 0.20)",
              borderLeft: "3px solid #6366f1",
              "&:hover": { backgroundColor: "rgba(99, 102, 241, 0.28)" },
            },
          },
        },
      },
    },
  });
}

// Compat : export par défaut (mode sombre) pour les imports existants.
const theme = getTheme("dark");
export default theme;
