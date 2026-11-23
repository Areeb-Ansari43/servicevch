import { useState, useEffect } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  ThemeMode,
  ThemePreset,
  AccentColor,
  UserAppearanceSettings,
  DEFAULT_APPEARANCE,
  ACCENT_SWATCHES,
  applyThemeToDocument,
  getEffectiveMode,
  THEME_PRESET_CONFIGS,
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
            <h2 className="text-base font-bold text-[var(--vch-text)]">Appearance</h2>
          </div>
          <p className="mt-0.5 text-xs text-[var(--vch-text-muted)]">
            Pick a theme and accent colour. Changes apply straight away and are saved to your account.
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
          Mode
        </label>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              { id: "dark" as ThemeMode, label: "Dark", Icon: Moon },
              { id: "light" as ThemeMode, label: "Light", Icon: Sun },
              { id: "system" as ThemeMode, label: "Match device", Icon: Monitor },
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
                <item.Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. THEME PRESETS */}
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-[var(--vch-text-muted)]">
          Theme
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(Object.keys(THEME_PRESET_CONFIGS) as ThemePreset[]).map((id) => {
            const preset = THEME_PRESET_CONFIGS[id];
            const active = appearance.themePreset === id;
            const tone = getEffectiveMode(appearance.mode, id) === "light" ? preset.light : preset.dark;
            const accent = ACCENT_SWATCHES[appearance.accentColor]?.hex ?? "#ff6a00";
            return (
              <button
                type="button"
                key={id}
                onClick={() => updateAppearance({ themePreset: id })}
                aria-pressed={active}
                className={`vch-lift group overflow-hidden rounded-xl border text-left ${
                  active ? "border-[var(--vch-accent)] ring-1 ring-[var(--vch-accent)]" : "border-[var(--vch-border-soft)]"
                }`}
              >
                {/* Mini dashboard in this theme's real colours */}
                <div className="relative h-20 overflow-hidden" style={{ background: tone.bg }} aria-hidden="true">
                  <div className="absolute inset-y-0 left-0 w-1/5" style={{ background: tone.sidebarBg, borderRight: `1px solid ${tone.borderSoft}` }}>
                    <div className="mx-auto mt-2 h-1.5 w-3/5 rounded-full" style={{ background: accent }} />
                    <div className="mx-auto mt-1.5 h-1 w-3/5 rounded-full" style={{ background: tone.textSoft, opacity: 0.5 }} />
                    <div className="mx-auto mt-1 h-1 w-3/5 rounded-full" style={{ background: tone.textSoft, opacity: 0.5 }} />
                  </div>
                  <div className="absolute left-[24%] right-2 top-2 grid grid-cols-2 gap-1.5">
                    {[0, 1].map((i) => (
                      <div key={i} className="rounded-md p-1.5" style={{ background: tone.surface, border: `1px solid ${tone.border}` }}>
                        <div className="h-1 w-1/2 rounded-full" style={{ background: tone.textMuted, opacity: 0.7 }} />
                        <div className="mt-1 h-2 w-3/4 rounded-full" style={{ background: tone.text }} />
                      </div>
                    ))}
                    <div className="col-span-2 flex items-center justify-between rounded-md px-1.5 py-1" style={{ background: tone.surface, border: `1px solid ${tone.border}` }}>
                      <div className="h-1 w-2/5 rounded-full" style={{ background: tone.textMuted, opacity: 0.7 }} />
                      <div className="h-2.5 w-8 rounded" style={{ background: accent }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-start justify-between gap-2 bg-[var(--vch-surface-2)] px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[var(--vch-text)]">{preset.name}</div>
                    <div className="truncate text-[10px] text-[var(--vch-text-muted)]">{preset.description}</div>
                  </div>
                  {active && (
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--vch-accent)] text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </div>
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
