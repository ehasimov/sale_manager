import { StyleSheet, Platform } from "react-native";

// Refined "Tactical Modern" — keeps neo-brutalist DNA but is comfortable for long mobile sessions.
// Less uppercase, smaller scales, generous whitespace, subtle tonal layers.
export const C = {
  // Surfaces (warm off-white instead of pure white — easier on the eyes)
  bg: "#FAFAF7",
  surface: "#FFFFFF",
  bgSubtle: "#F1F1ED",
  bgMuted: "#E8E8E2",
  bgDark: "#0E0E10",
  bgDeep: "#1A1A1D",
  bgInk: "#0A0A0A",

  // Text
  text: "#0E0E10",
  textSecondary: "#5C5C66",
  textMuted: "#8A8A92",
  textInverse: "#FFFFFF",
  textOnDarkMuted: "rgba(255,255,255,0.65)",

  // Brand & accents
  primary: "#1B43FF", // cobalt — softer than pure blue
  primaryDark: "#0F2BCC",
  yellow: "#FFD43B",
  yellowSoft: "#FFF4C2",
  red: "#FF4D4F",
  redSoft: "#FFE4E5",
  green: "#10B981",
  greenSoft: "#D1FAE5",
  orange: "#FF8A3D",

  // Borders
  border: "#0E0E10",
  borderSoft: "#D6D6D0",
};

// Bigger touch targets, generous radius (small but present), softer shadows.
export const RADIUS = 14;
export const RADIUS_SM = 10;

const monoFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

export const F = {
  mono: monoFont as string,
};

export const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  container: { padding: 18, gap: 16 },

  // Type scale — comfortable on phone
  display: { fontSize: 32, fontWeight: "800", letterSpacing: -1, color: C.text, lineHeight: 36 },
  h1: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5, color: C.text, lineHeight: 30 },
  h2: { fontSize: 20, fontWeight: "800", color: C.text, letterSpacing: -0.3, lineHeight: 24 },
  h3: { fontSize: 16, fontWeight: "700", color: C.text, lineHeight: 22 },
  body: { fontSize: 15, color: C.text, fontWeight: "500", lineHeight: 22 },
  bodySm: { fontSize: 13, color: C.textSecondary, fontWeight: "500", lineHeight: 19 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: C.textSecondary, textTransform: "uppercase" },
  micro: { fontSize: 10, fontWeight: "700", letterSpacing: 1, color: C.textMuted, textTransform: "uppercase" },
  mono: { fontFamily: monoFont, fontSize: 12, color: C.text },

  // Cards (kept brutalist drop shadow but smaller offset for less visual noise)
  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS,
    borderWidth: 1.5,
    borderColor: C.border,
    padding: 16,
    shadowColor: C.border,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  cardSoft: {
    backgroundColor: C.surface,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: C.borderSoft,
    padding: 16,
  },

  // Inputs
  input: {
    backgroundColor: C.surface,
    borderRadius: RADIUS_SM,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    fontWeight: "500",
    color: C.text,
  },

  // Buttons (soft pop shadow, comfortable height)
  btn: {
    minHeight: 50,
    borderRadius: RADIUS_SM,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: C.border,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  btnPrimary: { backgroundColor: C.primary, borderColor: C.border },
  btnPrimaryText: { color: C.textInverse, fontWeight: "700", fontSize: 15, letterSpacing: 0.3 },
  btnYellow: { backgroundColor: C.yellow },
  btnYellowText: { color: C.text, fontWeight: "700", fontSize: 15, letterSpacing: 0.3 },
  btnDanger: { backgroundColor: C.red },
  btnDangerText: { color: C.textInverse, fontWeight: "700", fontSize: 15, letterSpacing: 0.3 },
  btnGhost: { backgroundColor: C.surface, borderColor: C.border },
  btnGhostText: { color: C.text, fontWeight: "700", fontSize: 15, letterSpacing: 0.3 },
  btnDisabled: { opacity: 0.45 },

  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: C.border,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, color: C.text },

  row: { flexDirection: "row", alignItems: "center", gap: 8 },

  // Big primary FAB-style action (bottom sticky)
  bigCta: {
    minHeight: 58,
    borderRadius: RADIUS,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    shadowColor: C.border,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
});

export const statusStyle = (s: "not_visited" | "uploaded" | "delayed") => {
  if (s === "uploaded") return { backgroundColor: C.greenSoft, borderColor: C.green };
  if (s === "delayed") return { backgroundColor: C.yellowSoft, borderColor: "#C99A00" };
  return { backgroundColor: C.bgMuted, borderColor: C.borderSoft };
};

export const statusTextColor = (s: "not_visited" | "uploaded" | "delayed") => {
  if (s === "uploaded") return "#047857";
  if (s === "delayed") return "#92670B";
  return C.textSecondary;
};
