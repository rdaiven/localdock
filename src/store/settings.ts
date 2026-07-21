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
  if (theme === "auto") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

interface SettingsState {
  loaded: boolean;
  theme: Theme;
  defaultIdeId: string | null;
  detectedIdes: DetectedIde[];
  autostart: boolean;
  init: () => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  setDefaultIde: (id: string | null) => Promise<void>;
  setAutostart: (value: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  loaded: false,
  theme: "auto",
  defaultIdeId: null,
  detectedIdes: [],
  autostart: false,

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
      detectedIdes: ides,
      autostart,
    });
  },

  setTheme: async (theme) => {
    applyTheme(theme);
    set({ theme });
    await saveSettings({ theme, defaultIdeId: get().defaultIdeId });
  },

  setDefaultIde: async (id) => {
    set({ defaultIdeId: id });
    await saveSettings({ theme: get().theme, defaultIdeId: id });
  },

  setAutostart: async (value) => {
    await setAutostartEnabled(value);
    set({ autostart: value });
  },
}));
