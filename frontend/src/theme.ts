import { StyleSheet } from "react-native";

// Neo-brutalist tactical theme (from /app/design_guidelines.json)
export const C = {
  bg: "#FFFFFF",
  bgSubtle: "#F4F4F5",
  bgDark: "#0A0A0A",
  text: "#0A0A0A",
  textSecondary: "#52525B",
  textInverse: "#FFFFFF",
  primary: "#0000FF",
  primaryDark: "#0000CC",
  yellow: "#FFCC00",
  red: "#FF3B30",
  green: "#00C300",
  border: "#0A0A0A",
  disabled: "#D4D4D8",
};

export const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  container: { padding: 16, gap: 16 },
  h1: { fontSize: 32, fontWeight: "900", letterSpacing: -1, color: C.text, textTransform: "uppercase" },
  h2: { fontSize: 22, fontWeight: "800", color: C.text, letterSpacing: -0.5 },
  h3: { fontSize: 18, fontWeight: "700", color: C.text },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: C.text, textTransform: "uppercase" },
  body: { fontSize: 15, color: C.text, fontWeight: "500", lineHeight: 22 },
  mono: { fontFamily: "Courier", fontSize: 12, color: C.text },
  card: {
    backgroundColor: C.bg,
    borderWidth: 2,
    borderColor: C.border,
    padding: 16,
    // Solid drop shadow (neo-brutalist)
    shadowColor: C.border,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 0,
  },
  cardCompact: {
    backgroundColor: C.bg,
    borderWidth: 2,
    borderColor: C.border,
    padding: 12,
    shadowColor: C.border,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  input: {
    backgroundColor: C.bg,
    borderWidth: 2,
    borderColor: C.border,
    padding: 14,
    fontSize: 16,
    fontWeight: "500",
    color: C.text,
  },
  btn: {
    borderWidth: 2,
    borderColor: C.border,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: C.border,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  btnPrimary: { backgroundColor: C.primary },
  btnPrimaryText: { color: C.textInverse, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  btnSecondary: { backgroundColor: C.yellow },
  btnSecondaryText: { color: C.text, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  btnDanger: { backgroundColor: C.red },
  btnDangerText: { color: C.textInverse, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  btnGhost: { backgroundColor: C.bg },
  btnGhostText: { color: C.text, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  btnDisabled: { backgroundColor: C.disabled },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: C.border,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1, color: C.text },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});

export const statusStyle = (s: "not_visited" | "uploaded" | "delayed") => {
  if (s === "uploaded") return { backgroundColor: C.green };
  if (s === "delayed") return { backgroundColor: C.yellow };
  return { backgroundColor: "#E4E4E7" };
};
