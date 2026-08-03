import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

/** Best-effort OS toast — silently a no-op when permission is denied or
 * the notification API isn't available (plain browser preview). */
export async function notify(body: string): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === "granted";
    }
    if (granted) {
      sendNotification({ title: "LocalDock", body });
    }
  } catch {
    // not running inside a Tauri window
  }
}
