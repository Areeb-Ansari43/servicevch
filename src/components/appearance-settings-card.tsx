import { useState, useEffect } from "react";
import {
  ThemeMode,
  ThemePreset,
  AccentColor,
  UserAppearanceSettings,
  DEFAULT_APPEARANCE,
  ACCENT_SWATCHES,
  applyThemeToDocument,
  loadSavedAppearance,
  saveAppearanceLocal,
  saveAppearanceToSupabase,
  loadAppearanceFromSupabase,
} from "@/lib/theme";

export function AppearanceSettingsCard({
  toast,
  userId,
}: {
  toast?: (msg: string, type?: "success" | "error" | "info") => void;
  userId?: string;
}) {
  const [appearance, setAppearance] = useState<UserAppearanceSettings>(() => loadSavedAppearance());

  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    void (async () => {
      const remote = await loadAppearanceFromSupabase(userId);
      if (!cancelled && remote) {
        setAppearance(remote);
        applyThemeToDocument(remote);
        saveAppearanceLocal(remote);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const updateAppearance = (patch: Partial<UserAppearanceSettings>) => {
    const next = { ...appearance, ...patch };
    setAppearance(next);
    applyThemeToDocument(next);
    saveAppearanceLocal(next);

    if (userId) {
      saveAppearanceToSupabase(userId, next);
    }
  };

  const handleReset = () => {
    setAppearance(DEFAULT_APPEARANCE);
    applyThemeToDocument(DEFAULT_APPEARANCE);
    saveAppearanceLocal(DEFAULT_APPEARANCE);
    if (userId) {
      saveAppearanceToSupabase(userId, DEFAULT_APPEARANCE);
    }
    if (toast) toast("Appearance reset to defaults");
  };

  return (
    <div
      className="rounded-2xl border p-5 space-y-6"
      style={{
        borderColor: "var(--vch-border)",
        background: "var(--vch-surface)",
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--vch-border-soft)" }}>
        <div>
          <div className="flex items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 text-[var(--vch-accent)]"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a7 7 0 1 0 10 10" />
            </svg>
            <h2 className="text-base font-bold text-[var(--vch-text)]">Appearance & Customisation</h2>
          </div>
          <p className="mt-0.5 text-xs text-[var(--vch-text-muted)]">
            Tailor the look and feel of your CRM workspace. Mode, theme preset, and accent colour apply live.
          </p>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--vch-border)] bg-[var(--vch-surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--vch-text)] hover:bg-[var(--vch-border-soft)] transition-colors shrink-0"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          Reset to Default
        </button>
      </div>

      {/* 1. COLOR MODE */}
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-[var(--vch-text-muted)]">
          Color Mode
        </label>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              { id: "dark" as ThemeMode, label: "Dark (Default)", icon: "🌙" },
              { id: "light" as ThemeMode, label: "Light", icon: "☀️" },
              { id: "system" as ThemeMode, label: "System", icon: "💻" },
            ] as const
          ).map((item) => {
            const active = appearance.mode === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => updateAppearance({ mode: item.id })}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-xs font-semibold transition-all ${
                  active
                    ? "border-[var(--vch-accent)] bg-[var(--vch-accent-soft)] text-[var(--vch-accent)] shadow-sm font-bold"
                    : "border-[var(--vch-border-soft)] bg-[var(--vch-surface-2)] text-[var(--vch-text)] hover:border-[var(--vch-border)]"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. THEME PRESETS */}
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-[var(--vch-text-muted)]">
          Theme Presets
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              {
                id: "midnight" as ThemePreset,
                name: "Midnight",
                desc: "Dark Navy / Black",
                bg: "#05070c",
                card: "#0d111d",
              },
              {
                id: "graphite" as ThemePreset,
                name: "Graphite",
                desc: "Neutral Charcoal",
                bg: "#121316",
                card: "#1b1c22",
              },
              {
                id: "light" as ThemePreset,
                name: "Light",
                desc: "Clean White & Slate",
                bg: "#f4f6fa",
                card: "#ffffff",
              },
              {
                id: "ocean" as ThemePreset,
                name: "Ocean",
                desc: "Deep Blue Horizon",
                bg: "#070e1b",
                card: "#0f1a2e",
              },
            ] as const
          ).map((preset) => {
            const active = appearance.themePreset === preset.id;
            return (
              <button
                type="button"
                key={preset.id}
                onClick={() => updateAppearance({ themePreset: preset.id })}
                className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                  active
                    ? "border-[var(--vch-accent)] bg-[var(--vch-accent-soft)] ring-1 ring-[var(--vch-accent)]"
                    : "border-[var(--vch-border-soft)] bg-[var(--vch-surface-2)] hover:border-[var(--vch-border)]"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-2 w-full">
                  <div
                    className="h-4 w-4 rounded-full border border-white/20 shadow-inner"
                    style={{ background: preset.bg }}
                  />
                  <div
                    className="h-4 w-4 rounded-full border border-white/20 shadow-inner -ml-2"
                    style={{ background: preset.card }}
                  />
                  {active && (
                    <span className="ml-auto text-[10px] font-extrabold uppercase text-[var(--vch-accent)]">
                      Active
                    </span>
                  )}
                </div>
                <div className="text-xs font-bold text-[var(--vch-text)]">{preset.name}</div>
                <div className="text-[10px] text-[var(--vch-text-muted)]">{preset.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. ACCENT COLOUR */}
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-[var(--vch-text-muted)]">
          Accent Colour
        </label>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          {(Object.entries(ACCENT_SWATCHES) as [AccentColor, (typeof ACCENT_SWATCHES)[AccentColor]][]).map(
            ([accentKey, swatch]) => {
              const active = appearance.accentColor === accentKey;
              return (
                <button
                  type="button"
                  key={accentKey}
                  onClick={() => updateAppearance({ accentColor: accentKey })}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-medium transition-all ${
                    active
                      ? "border-[var(--vch-accent)] bg-[var(--vch-accent-soft)] ring-2 ring-[var(--vch-accent)]"
                      : "border-[var(--vch-border-soft)] bg-[var(--vch-surface-2)] hover:border-[var(--vch-border)]"
                  }`}
                >
                  <span
                    className="h-5 w-5 rounded-full shadow-md transition-transform"
                    style={{ background: swatch.hex, transform: active ? "scale(1.15)" : "scale(1)" }}
                  />
                  <span
                    className={`text-[11px] capitalize ${
                      active ? "font-bold text-[var(--vch-accent)]" : "text-[var(--vch-text)]"
                    }`}
                  >
                    {accentKey}
                  </span>
                </button>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}
