import { create } from "zustand";
import {
  detectIdes,
  getAutostartEnabled,
  loadSettings,
  saveSettings,
  setAutostartEnabled,
  type DetectedIde,
} from "../lib/settingsApi";

type Theme = "light" | "dark" | "auto";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "auto") {
    // No forced attribute — index.css follows prefers-color-scheme.
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

interface SettingsState {
  loaded: boolean;
  theme: Theme;
  defaultIdeId: string | null;
  detectedIdes: DetectedIde[];
  autostart: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  init: () => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  setDefaultIde: (id: string | null) => Promise<void>;
  setAutostart: (value: boolean) => Promise<void>;
  setStartMinimized: (value: boolean) => Promise<void>;
  setCloseToTray: (value: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  // One place builds the persisted shape from state — a new field added to
  // PersistedSettings can't be silently dropped by one setter out of four.
  function persistSettings(): Promise<void> {
    const s = get();
    return saveSettings({
      theme: s.theme,
      defaultIdeId: s.defaultIdeId,
      startMinimized: s.startMinimized,
      closeToTray: s.closeToTray,
    });
  }

  return {
    loaded: false,
    theme: "auto",
    defaultIdeId: null,
    detectedIdes: [],
    autostart: false,
    startMinimized: false,
    closeToTray: true,

    init: async () => {
      if (get().loaded) return;
      const [persisted, ides, autostart] = await Promise.all([
        loadSettings(),
        detectIdes().catch(() => []),
        getAutostartEnabled().catch(() => false),
      ]);
      applyTheme(persisted.theme);
      set({
        loaded: true,
        theme: persisted.theme,
        defaultIdeId: persisted.defaultIdeId,
        startMinimized: persisted.startMinimized,
        closeToTray: persisted.closeToTray,
        detectedIdes: ides,
        autostart,
      });
    },

    setTheme: async (theme) => {
      applyTheme(theme);
      set({ theme });
      await persistSettings();
    },

    setDefaultIde: async (id) => {
      set({ defaultIdeId: id });
      await persistSettings();
    },

    setAutostart: async (value) => {
      await setAutostartEnabled(value);
      set({ autostart: value });
    },

    setStartMinimized: async (value) => {
      set({ startMinimized: value });
      await persistSettings();
    },

    setCloseToTray: async (value) => {
      set({ closeToTray: value });
      await persistSettings();
    },
  };
});
