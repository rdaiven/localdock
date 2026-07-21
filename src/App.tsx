import { useEffect, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { Settings } from "./components/Settings";
import { useSettingsStore } from "./store/settings";

function App() {
  const [view, setView] = useState<"dashboard" | "settings">("dashboard");
  const initSettings = useSettingsStore((s) => s.init);

  useEffect(() => {
    void initSettings();
  }, [initSettings]);

  return view === "settings" ? (
    <Settings onBack={() => setView("dashboard")} />
  ) : (
    <Dashboard onOpenSettings={() => setView("settings")} />
  );
}

export default App;
