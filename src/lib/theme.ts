import { supabase } from "@/integrations/supabase/client";

export type ThemeMode = "dark" | "light" | "system";
export type ThemePreset = "midnight" | "graphite" | "light" | "ocean";
export type AccentColor = "orange" | "blue" | "emerald" | "violet" | "rose" | "gold";

export interface UserAppearanceSettings {
  mode: ThemeMode;
  themePreset: ThemePreset;
  accentColor: AccentColor;
}

export const DEFAULT_APPEARANCE: UserAppearanceSettings = {
  mode: "dark",
  themePreset: "midnight",
  accentColor: "orange",
};

export const ACCENT_SWATCHES: Record<
  AccentColor,
  { label: string; hex: string; hover: string; textDark: string; textLight: string }
> = {
  orange: {
    label: "Orange (Brand)",
    hex: "#ff6a00",
    hover: "#e05d00",
    textDark: "#ff8a3d",
    textLight: "#c2410c",
  },
  blue: {
    label: "Blue",
    hex: "#2563eb",
    hover: "#1d4ed8",
    textDark: "#60a5fa",
    textLight: "#1d4ed8",
  },
  emerald: {
    label: "Emerald",
    hex: "#059669",
    hover: "#047857",
    textDark: "#34d399",
    textLight: "#047857",
  },
  violet: {
    label: "Violet",
    hex: "#7c3aed",
    hover: "#6d28d9",
    textDark: "#a78bfa",
    textLight: "#6d28d9",
  },
  rose: {
    label: "Rose",
    hex: "#e11d48",
    hover: "#be123c",
    textDark: "#fb7185",
    textLight: "#be123c",
  },
  gold: {
    label: "Gold",
    hex: "#d97706",
    hover: "#b45309",
    textDark: "#fbbf24",
    textLight: "#b45309",
  },
};

export const THEME_PRESET_CONFIGS: Record<
  ThemePreset,
  {
    name: string;
    description: string;
    dark: {
      bg: string;
      surface: string;
      surfaceHover: string;
      surface2: string;
      surfaceSolid: string;
      border: string;
      borderSoft: string;
      text: string;
      textMuted: string;
      textSoft: string;
      sidebarBg: string;
    };
    light: {
      bg: string;
      surface: string;
      surfaceHover: string;
      surface2: string;
      surfaceSolid: string;
      border: string;
      borderSoft: string;
      text: string;
      textMuted: string;
      textSoft: string;
      sidebarBg: string;
    };
  }
> = {
  midnight: {
    name: "Midnight",
    description: "Current dark navy and deep black aesthetic",
    dark: {
      bg: "linear-gradient(160deg, #05070c 0%, #0a0e18 45%, #080b13 100%)",
      surface: "rgba(255, 255, 255, 0.055)",
      surfaceHover: "rgba(255, 255, 255, 0.09)",
      surface2: "rgba(255, 255, 255, 0.10)",
      surfaceSolid: "#0e131d",
      border: "rgba(255, 255, 255, 0.12)",
      borderSoft: "rgba(255, 255, 255, 0.07)",
      text: "#eef2f8",
      textMuted: "#9aa5b8",
      textSoft: "#6b7488",
      sidebarBg: "#0c101b",
    },
    light: {
      bg: "linear-gradient(160deg, #f1f5f9 0%, #e2e8f0 100%)",
      surface: "#ffffff",
      surfaceHover: "#f8fafc",
      surface2: "#f1f5f9",
      surfaceSolid: "#ffffff",
      border: "#cbd5e1",
      borderSoft: "#e2e8f0",
      text: "#0f172a",
      textMuted: "#475569",
      textSoft: "#64748b",
      sidebarBg: "#f8fafc",
    },
  },
  graphite: {
    name: "Graphite",
    description: "Neutral dark grey with clean monochrome tones",
    dark: {
      bg: "linear-gradient(160deg, #121316 0%, #181a20 45%, #13151a 100%)",
      surface: "rgba(255, 255, 255, 0.065)",
      surfaceHover: "rgba(255, 255, 255, 0.10)",
      surface2: "rgba(255, 255, 255, 0.12)",
      surfaceSolid: "#1c1e24",
      border: "rgba(255, 255, 255, 0.14)",
      borderSoft: "rgba(255, 255, 255, 0.08)",
      text: "#f3f4f6",
      textMuted: "#9ca3af",
      textSoft: "#6b7280",
      sidebarBg: "#16181d",
    },
    light: {
      bg: "linear-gradient(160deg, #f3f4f6 0%, #e5e7eb 100%)",
      surface: "#ffffff",
      surfaceHover: "#f9fafb",
      surface2: "#f3f4f6",
      surfaceSolid: "#ffffff",
      border: "#d1d5db",
      borderSoft: "#e5e7eb",
      text: "#111827",
      textMuted: "#374151",
      textSoft: "#4b5563",
      sidebarBg: "#ffffff",
    },
  },
  light: {
    name: "Light",
    description: "Clean white and soft grey high-contrast workspace",
    dark: {
      bg: "linear-gradient(160deg, #1e293b 0%, #0f172a 100%)",
      surface: "rgba(255, 255, 255, 0.08)",
      surfaceHover: "rgba(255, 255, 255, 0.12)",
      surface2: "rgba(255, 255, 255, 0.14)",
      surfaceSolid: "#1e293b",
      border: "rgba(255, 255, 255, 0.16)",
      borderSoft: "rgba(255, 255, 255, 0.10)",
      text: "#f8fafc",
      textMuted: "#94a3b8",
      textSoft: "#64748b",
      sidebarBg: "#0f172a",
    },
    light: {
      bg: "linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)",
      surface: "#ffffff",
      surfaceHover: "#f8fafc",
      surface2: "#f1f5f9",
      surfaceSolid: "#ffffff",
      border: "#cbd5e1",
      borderSoft: "#e2e8f0",
      text: "#0f172a",
      textMuted: "#334155",
      textSoft: "#475569",
      sidebarBg: "#ffffff",
    },
  },
  ocean: {
    name: "Ocean",
    description: "Rich oceanic dark blue tailored for premium car-hire",
    dark: {
      bg: "linear-gradient(160deg, #031326 0%, #071d36 45%, #04162c 100%)",
      surface: "rgba(224, 242, 254, 0.07)",
      surfaceHover: "rgba(224, 242, 254, 0.12)",
      surface2: "rgba(224, 242, 254, 0.12)",
      surfaceSolid: "#0b2447",
      border: "rgba(224, 242, 254, 0.15)",
      borderSoft: "rgba(224, 242, 254, 0.08)",
      text: "#e0f2fe",
      textMuted: "#7dd3fc",
      textSoft: "#38bdf8",
      sidebarBg: "#06182e",
    },
    light: {
      bg: "linear-gradient(160deg, #f0f9ff 0%, #e0f2fe 100%)",
      surface: "#ffffff",
      surfaceHover: "#f0f9ff",
      surface2: "#e0f2fe",
      surfaceSolid: "#ffffff",
      border: "#93c5fd",
      borderSoft: "#bae6fd",
      text: "#0c4a6e",
      textMuted: "#0369a1",
      textSoft: "#0284c7",
      sidebarBg: "#f0f9ff",
    },
  },
};

export function getEffectiveMode(mode: ThemeMode, preset: ThemePreset): "dark" | "light" {
  if (preset === "light" && mode !== "dark") return "light";
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark";
}

export function applyThemeToDocument(settings: UserAppearanceSettings): void {
  if (typeof document === "undefined") return;

  const effectiveMode = getEffectiveMode(settings.mode, settings.themePreset);
  const presetConfig = THEME_PRESET_CONFIGS[settings.themePreset] || THEME_PRESET_CONFIGS.midnight;
  const colors = effectiveMode === "light" ? presetConfig.light : presetConfig.dark;
  const accent = ACCENT_SWATCHES[settings.accentColor] || ACCENT_SWATCHES.orange;

  const root = document.documentElement;

  root.setAttribute("data-mode", settings.mode);
  root.setAttribute("data-effective-mode", effectiveMode);
  root.setAttribute("data-theme-preset", settings.themePreset);
  root.setAttribute("data-accent-color", settings.accentColor);

  if (effectiveMode === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    root.classList.add("light");
    root.classList.remove("dark");
  }

  // Set CSS Variables
  root.style.setProperty("--vch-bg", colors.bg);
  root.style.setProperty("--vch-surface", colors.surface);
  root.style.setProperty("--vch-surface-hover", colors.surfaceHover);
  root.style.setProperty("--vch-surface-2", colors.surface2);
  root.style.setProperty("--vch-surface-solid", colors.surfaceSolid);
  root.style.setProperty("--vch-border", colors.border);
  root.style.setProperty("--vch-border-soft", colors.borderSoft);
  root.style.setProperty("--vch-text", colors.text);
  root.style.setProperty("--vch-text-muted", colors.textMuted);
  root.style.setProperty("--vch-text-soft", colors.textSoft);
  root.style.setProperty("--vch-sidebar-bg", colors.sidebarBg);

  // Accent Variables
  root.style.setProperty("--vch-accent", accent.hex);
  root.style.setProperty("--vch-accent-hover", accent.hover);
  root.style.setProperty(
    "--vch-accent-soft",
    accent.hex === "#ff6a00" ? "rgba(255, 106, 0, 0.15)" : `${accent.hex}26`
  );
  root.style.setProperty("--vch-accent-text", effectiveMode === "light" ? accent.textLight : accent.textDark);
  root.style.setProperty("--vch-ring", accent.hex);

  // Status Badge Design Tokens (WCAG AA compliant)
  if (effectiveMode === "light") {
    root.style.setProperty("--vch-success-bg", "#dcfce7");
    root.style.setProperty("--vch-success-text", "#15803d");
    root.style.setProperty("--vch-success-border", "#86efac");

    root.style.setProperty("--vch-danger-bg", "#fee2e2");
    root.style.setProperty("--vch-danger-text", "#b91c1c");
    root.style.setProperty("--vch-danger-border", "#fca5a5");

    root.style.setProperty("--vch-warning-bg", "#fef3c7");
    root.style.setProperty("--vch-warning-text", "#b45309");
    root.style.setProperty("--vch-warning-border", "#fde68a");

    root.style.setProperty("--vch-info-bg", "#e0f2fe");
    root.style.setProperty("--vch-info-text", "#0369a1");
    root.style.setProperty("--vch-info-border", "#bae6fd");
  } else {
    root.style.setProperty("--vch-success-bg", "rgba(34, 197, 94, 0.15)");
    root.style.setProperty("--vch-success-text", "#86efac");
    root.style.setProperty("--vch-success-border", "rgba(34, 197, 94, 0.35)");

    root.style.setProperty("--vch-danger-bg", "rgba(239, 68, 68, 0.15)");
    root.style.setProperty("--vch-danger-text", "#fca5a5");
    root.style.setProperty("--vch-danger-border", "rgba(239, 68, 68, 0.35)");

    root.style.setProperty("--vch-warning-bg", "rgba(245, 158, 11, 0.15)");
    root.style.setProperty("--vch-warning-text", "#fde68a");
    root.style.setProperty("--vch-warning-border", "rgba(245, 158, 11, 0.35)");

    root.style.setProperty("--vch-info-bg", "rgba(56, 189, 248, 0.15)");
    root.style.setProperty("--vch-info-text", "#7dd3fc");
    root.style.setProperty("--vch-info-border", "rgba(56, 189, 248, 0.35)");
  }
}

export function loadSavedAppearance(): UserAppearanceSettings {
  if (typeof localStorage === "undefined") return DEFAULT_APPEARANCE;

  const savedMode = (localStorage.getItem("vch_theme_mode") as ThemeMode) || DEFAULT_APPEARANCE.mode;
  const savedPreset =
    (localStorage.getItem("vch_theme_preset") as ThemePreset) || DEFAULT_APPEARANCE.themePreset;
  const savedAccent =
    (localStorage.getItem("vch_theme_accent") as AccentColor) || DEFAULT_APPEARANCE.accentColor;

  return {
    mode: ["dark", "light", "system"].includes(savedMode) ? savedMode : DEFAULT_APPEARANCE.mode,
    themePreset: ["midnight", "graphite", "light", "ocean"].includes(savedPreset)
      ? savedPreset
      : DEFAULT_APPEARANCE.themePreset,
    accentColor: ["orange", "blue", "emerald", "violet", "rose", "gold"].includes(savedAccent)
      ? savedAccent
      : DEFAULT_APPEARANCE.accentColor,
  };
}

export function saveAppearanceLocal(settings: UserAppearanceSettings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem("vch_theme_mode", settings.mode);
  localStorage.setItem("vch_theme_preset", settings.themePreset);
  localStorage.setItem("vch_theme_accent", settings.accentColor);
}

export async function saveAppearanceToSupabase(
  userId: string,
  settings: UserAppearanceSettings
): Promise<void> {
  if (!userId) return;
  try {
    const { error } = await supabase.from("user_settings").upsert(
      {
        user_id: userId,
        mode: settings.mode,
        theme_preset: settings.themePreset,
        accent_color: settings.accentColor,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) {
      console.warn("[Theme] Supabase user_settings upsert notice:", error.message);
    }
  } catch (err) {
    console.warn("[Theme] Supabase user_settings save exception:", err);
  }
}

export async function loadAppearanceFromSupabase(
  userId: string
): Promise<UserAppearanceSettings | null> {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from("user_settings")
      .select("mode, theme_preset, accent_color")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      mode: (data.mode as ThemeMode) || DEFAULT_APPEARANCE.mode,
      themePreset: (data.theme_preset as ThemePreset) || DEFAULT_APPEARANCE.themePreset,
      accentColor: (data.accent_color as AccentColor) || DEFAULT_APPEARANCE.accentColor,
    };
  } catch {
    return null;
  }
}
