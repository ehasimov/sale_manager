import { View, Text, TouchableOpacity, ScrollView, ImageBackground } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth";
import { S, C } from "../../src/theme";
import { ASSETS } from "../../src/assets";

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const isAdmin = user?.role === "admin";

  return (
    <SafeAreaView style={[S.screen, { backgroundColor: "#0A0A0A" }]} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Hero */}
        <ImageBackground
          source={{ uri: ASSETS.loginBackground }}
          style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 }}
          imageStyle={{ opacity: 0.35 }}
        >
          <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.55)" }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: C.yellow, fontSize: 10, fontWeight: "900", letterSpacing: 2.5, fontFamily: "Courier" }}>
              ◢ OPERATOR PROFILE
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, backgroundColor: C.green }} />
              <Text style={{ color: C.green, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, fontFamily: "Courier" }}>
                ACTIVE
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 18, flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View
              style={{
                width: 76,
                height: 76,
                backgroundColor: isAdmin ? C.red : C.primary,
                borderWidth: 3,
                borderColor: "#fff",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 34, letterSpacing: -1 }}>
                {user?.name?.[0]?.toUpperCase() || "U"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900", letterSpacing: -0.5 }} numberOfLines={2}>
                {user?.name?.toUpperCase()}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Courier", fontSize: 12, marginTop: 2 }}>
                @{user?.username}
              </Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                <View style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: isAdmin ? C.red : C.yellow, borderWidth: 2, borderColor: "#fff" }}>
                  <Text style={{ fontSize: 10, fontWeight: "900", letterSpacing: 1, color: isAdmin ? "#fff" : C.text }}>
                    {user?.role?.toUpperCase()}
                  </Text>
                </View>
                {user?.sales_rep_code && (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 2, borderColor: "#fff" }}>
                    <Text style={{ fontSize: 10, fontWeight: "900", letterSpacing: 1, color: "#fff" }}>
                      {user.sales_rep_code}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </ImageBackground>

        <View style={{ padding: 16, gap: 12 }}>
          {/* Security capabilities */}
          <View style={{ borderWidth: 2, borderColor: "#fff", backgroundColor: "#000", padding: 14, gap: 10 }}>
            <Text style={{ color: C.yellow, fontSize: 11, fontWeight: "900", letterSpacing: 2, fontFamily: "Courier" }}>
              ◢ SECURITY POLICY
            </Text>
            {[
              { icon: "navigate", label: "GPS proximity gate · 30m radius", color: C.green },
              { icon: "shield-checkmark", label: "Mock-location detection blocks fake GPS", color: C.red },
              { icon: "lock-closed", label: "Customer location set ONCE · admin-only reset", color: C.yellow },
              { icon: "cloud-offline", label: "Offline queue · auto-sync on reconnect", color: C.primary },
              { icon: "camera", label: "In-app camera only · gallery upload disabled", color: "#fff" },
              { icon: "barcode", label: "Each photo watermarked with date/coord/user", color: "#fff" },
            ].map((row, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 26, height: 26, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 2, borderColor: row.color, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={row.icon as any} size={14} color={row.color} />
                </View>
                <Text style={{ color: "#fff", flex: 1, fontSize: 13, fontWeight: "500" }}>{row.label}</Text>
                <Ionicons name="checkmark-sharp" size={16} color={C.green} />
              </View>
            ))}
          </View>

          {/* Build info */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, padding: 10, backgroundColor: "#fff", borderWidth: 2, borderColor: "#fff" }}>
              <Text style={{ fontSize: 9, fontWeight: "900", letterSpacing: 1.5, color: C.text }}>BUILD</Text>
              <Text style={{ fontSize: 18, fontWeight: "900", color: C.text, marginTop: 4 }}>v1.0.0</Text>
            </View>
            <View style={{ flex: 1, padding: 10, backgroundColor: C.yellow, borderWidth: 2, borderColor: "#fff" }}>
              <Text style={{ fontSize: 9, fontWeight: "900", letterSpacing: 1.5, color: C.text }}>RADIUS</Text>
              <Text style={{ fontSize: 18, fontWeight: "900", color: C.text, marginTop: 4 }}>30 m</Text>
            </View>
            <View style={{ flex: 1, padding: 10, backgroundColor: C.primary, borderWidth: 2, borderColor: "#fff" }}>
              <Text style={{ fontSize: 9, fontWeight: "900", letterSpacing: 1.5, color: "#fff" }}>REGION</Text>
              <Text style={{ fontSize: 18, fontWeight: "900", color: "#fff", marginTop: 4 }}>BAKU</Text>
            </View>
          </View>

          <TouchableOpacity
            testID="logout-btn"
            onPress={async () => {
              await logout();
              router.replace("/login");
            }}
            style={{ backgroundColor: C.red, borderWidth: 2, borderColor: "#fff", padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 6 }}
          >
            <Ionicons name="log-out" size={20} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "900", letterSpacing: 1.5, textTransform: "uppercase", fontSize: 14 }}>
              Sign Out
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
