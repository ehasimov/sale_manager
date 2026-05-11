import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const STORAGE_KEY = "merch.last_reminder_ts";
// Minimum spacing between reminder notifications (ms)
const MIN_INTERVAL_MS = 1000 * 60 * 60 * 6; // 6 hours

// Configure how notifications show when the app is foregrounded.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    } as any),
  });
} catch {
  // ignore on web / unsupported
}

const isNative = Platform.OS === "ios" || Platform.OS === "android";

export async function ensureNotificationsPermission(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted) return true;
    const req = await Notifications.requestPermissionsAsync();
    return !!req.granted;
  } catch {
    return false;
  }
}

type CustomerLike = {
  customer_code: string;
  customer_name: string;
  status: "not_visited" | "uploaded" | "delayed";
  visits_per_week?: number;
  visits_this_week?: number;
};

export async function scheduleVisitReminders(customers: CustomerLike[]): Promise<number> {
  if (!isNative) return 0;
  // Throttle — don't spam the user.
  const lastTs = parseInt((await AsyncStorage.getItem(STORAGE_KEY)) || "0", 10);
  if (Date.now() - lastTs < MIN_INTERVAL_MS) return 0;

  const ok = await ensureNotificationsPermission();
  if (!ok) return 0;

  // Pending / late items requiring action
  const pending = customers.filter((c) => {
    if (c.status === "delayed" || c.status === "not_visited") return true;
    if ((c.visits_per_week || 0) > 0 && (c.visits_this_week || 0) < (c.visits_per_week || 0)) return true;
    return false;
  });
  if (pending.length === 0) return 0;

  // Cancel previously scheduled reminders to avoid build-up
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}

  const summaryBody =
    pending.length === 1
      ? `${pending[0].customer_name} is waiting for a visit this week.`
      : `${pending.length} customers still need a visit this week.`;

  // One nudge after ~30 minutes, one tomorrow at 9 AM local
  const tomorrow9 = new Date();
  tomorrow9.setDate(tomorrow9.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  const delaySec = Math.max(60, Math.floor((tomorrow9.getTime() - Date.now()) / 1000));

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Visit reminder",
        body: summaryBody,
        data: { type: "visit-reminder", count: pending.length },
      },
      trigger: { seconds: 30 * 60 } as any, // 30 min
    });
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Field plan for today",
        body: summaryBody,
        data: { type: "visit-reminder-daily" },
      },
      trigger: { seconds: delaySec } as any,
    });
    await AsyncStorage.setItem(STORAGE_KEY, String(Date.now()));
    return pending.length;
  } catch {
    return 0;
  }
}
