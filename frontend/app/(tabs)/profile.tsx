import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth";
import { S, C } from "../../src/theme";
import * as h from "../../src/haptics";

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  const onLogout = () =>
    Alert.alert("Sign out?", "You'll be returned to the login screen.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          h.medium();
          await logout();
          router.replace("/login");
        },
      },
    ]);

  return (
    <SafeAreaView style={S.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {/* Hero card */}
        <View style={{ padding: 16 }}>
          <View
            style={{
              borderRadius: 20,
              overflow: "hidden",
              backgroundColor: C.bgInk,
              padding: 22,
              gap: 14,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 18,
                  backgroundColor: isAdmin ? C.red : C.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: isAdmin ? C.red : C.primary,
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.4,
                  shadowRadius: 14,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 28 }}>
                  {user?.name?.[0]?.toUpperCase() || "U"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: -0.3 }} numberOfLines={2}>
                  {user?.name}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, marginTop: 2 }}>
                  @{user?.username}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              <Chip label={user?.role || ""} bg={isAdmin ? C.red : C.yellow} fg={isAdmin ? "#fff" : C.text} />
              {user?.sales_rep_code && <Chip label={user.sales_rep_code} bg="rgba(255,255,255,0.15)" fg="#fff" />}
              <Chip label="Active" bg="rgba(16,185,129,0.2)" fg={C.green} dot />
            </View>
          </View>
        </View>

        {/* Section: How it works */}
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: C.text, marginTop: 4 }}>How it keeps you safe</Text>

          <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.borderSoft, overflow: "hidden" }}>
            {[
              { icon: "navigate", title: "30 m proximity gate", sub: "Photo capture only when you're at the store.", color: C.primary },
              { icon: "shield-checkmark", title: "Anti-spoof", sub: "Mock GPS attempts are blocked and logged.", color: C.green },
              { icon: "lock-closed", title: "Single location lock", sub: "Customer GPS is set once. Only admin can reset.", color: C.yellow, dark: true },
              { icon: "cloud-offline", title: "Offline ready", sub: "Photos queue locally and auto-sync.", color: C.orange },
              { icon: "barcode", title: "Photo watermark", sub: "Date · Coordinates · User · Customer code.", color: C.text },
            ].map((row, i, arr) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                  borderBottomColor: C.borderSoft,
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.bgSubtle, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={row.icon as any} size={18} color={row.dark ? "#92670B" : row.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>{row.title}</Text>
                  <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 2 }}>{row.sub}</Text>
                </View>
                <Ionicons name="checkmark-circle" size={18} color={C.green} />
              </View>
            ))}
          </View>

          {/* Build info pills */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <Pill label="Version" value="1.0.0" />
            <Pill label="Radius" value="30 m" />
            <Pill label="Region" value="Baku" />
          </View>

          <TouchableOpacity
            testID="logout-btn"
            onPress={onLogout}
            style={{
              marginTop: 8,
              minHeight: 54,
              borderRadius: 14,
              backgroundColor: C.surface,
              borderWidth: 1,
              borderColor: "#FECDD3",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
            }}
          >
            <Ionicons name="log-out-outline" size={20} color={C.red} />
            <Text style={{ color: C.red, fontWeight: "700", fontSize: 15 }}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ label, bg, fg, dot }: { label: string; bg: string; fg: string; dot?: boolean }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: bg, flexDirection: "row", alignItems: "center", gap: 5 }}>
      {dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} />}
      <Text style={{ color: fg, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderSoft }}>
      <Text style={{ fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 1, textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ fontSize: 17, fontWeight: "800", color: C.text, marginTop: 4 }}>{value}</Text>
    </View>
  );
}
