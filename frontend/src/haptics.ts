import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

// Centralised, safe-to-fail haptic helpers. No-op on web.
const isNative = Platform.OS === "ios" || Platform.OS === "android";

export const tap = () => {
  if (!isNative) return;
  Haptics.selectionAsync().catch(() => {});
};

export const light = () => {
  if (!isNative) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

export const medium = () => {
  if (!isNative) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};

export const success = () => {
  if (!isNative) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

export const warning = () => {
  if (!isNative) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
};

export const error = () => {
  if (!isNative) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
};
