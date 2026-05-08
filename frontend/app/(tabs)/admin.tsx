import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  ImageBackground,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, useAuth } from "../../src/auth";
import { S, C } from "../../src/theme";
import { ASSETS } from "../../src/assets";

type Photo = {
  id: string;
  customer_code: string;
  customer_name?: string | null;
  username?: string | null;
  user_code: string;
  latitude: number;
  longitude: number;
  distance: number;
  upload_date: string;
  photo_base64: string;
};

type FakeLog = {
  id: string;
  user_code: string;
  username?: string | null;
  customer_code?: string | null;
  latitude: number;
  longitude: number;
  reason: string;
  created_at: string;
};

type Customer = {
  customer_code: string;
  customer_name: string;
  location_locked: boolean;
  latitude: number | null;
  longitude: number | null;
  sales_rep_code?: string | null;
};

type User = { id: string; username: string; name: string; role: string; sales_rep_code?: string | null };

type Tab = "photos" | "fakegps" | "customers" | "users";

const SCREEN_W = Dimensions.get("window").width;
const PHOTO_W = (SCREEN_W - 16 * 2 - 8) / 2;

export default function Admin() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("photos");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [logs, setLogs] = useState<FakeLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [p, l, u] = await Promise.all([
        api<Photo[]>("/api/admin/photos", { token }),
        api<FakeLog[]>("/api/admin/fake-gps-logs", { token }),
        api<User[]>("/api/admin/users", { token }),
      ]);
      setPhotos(p);
      setLogs(l);
      setUsers(u);
      const codes = new Set<string>();
      const cs: Customer[] = [];
      for (const usr of u) {
        if (usr.role !== "sales_rep") continue;
        try {
          const list = await api<any[]>(`/api/customers/by-user/${usr.id}`, { token });
          for (const c of list) {
            if (codes.has(c.customer_code)) continue;
            codes.add(c.customer_code);
            cs.push({
              customer_code: c.customer_code,
              customer_name: c.customer_name,
              location_locked: c.location_locked,
              latitude: c.latitude,
              longitude: c.longitude,
              sales_rep_code: c.sales_rep_code,
            });
          }
        } catch { /* ignore */ }
      }
      setCustomers(cs);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const resetLocation = async (code: string) => {
    if (!token) return;
    try {
      await api(`/api/admin/customer/${code}/reset-location`, { method: "POST", token });
      Alert.alert("Done", `Location reset for ${code}`);
      loadAll();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Reset failed");
    }
  };

  const stats = {
    photos: photos.length,
    fakeGps: logs.length,
    locked: customers.filter((c) => c.location_locked).length,
    users: users.length,
  };

  const tabConfig: Record<Tab, { label: string; icon: any; color: string }> = {
    photos: { label: "Photos", icon: "images", color: C.primary },
    fakegps: { label: "Fake GPS", icon: "warning", color: C.red },
    customers: { label: "Customers", icon: "storefront", color: C.yellow },
    users: { label: "Users", icon: "people", color: C.green },
  };

  return (
    <SafeAreaView style={[S.screen, { backgroundColor: "#0A0A0A" }]} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Hero */}
        <ImageBackground
          source={{ uri: ASSETS.syncGraphic }}
          style={{ padding: 16, paddingTop: 8 }}
          imageStyle={{ opacity: 0.25 }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 10, height: 10, backgroundColor: C.red }} />
              <Text style={{ color: C.red, fontSize: 10, fontWeight: "900", letterSpacing: 2.5, fontFamily: "Courier" }}>
                ADMIN · CONTROL CENTER
              </Text>
            </View>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, fontFamily: "Courier" }}>
              {new Date().toLocaleTimeString()}
            </Text>
          </View>
          <Text style={{ color: "#fff", fontSize: 40, fontWeight: "900", letterSpacing: -2, marginTop: 4 }}>
            COMMAND.
          </Text>

          {/* KPI tiles */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            {[
              { v: stats.photos, label: "PHOTOS", bg: C.primary, fg: "#fff" },
              { v: stats.fakeGps, label: "ALERTS", bg: C.red, fg: "#fff" },
              { v: stats.locked, label: "LOCKED", bg: C.yellow, fg: C.text },
              { v: stats.users, label: "USERS", bg: "#fff", fg: C.text },
            ].map((s, i) => (
              <View key={i} style={{ flex: 1, padding: 10, backgroundColor: s.bg, borderWidth: 2, borderColor: "#fff" }}>
                <Text style={{ fontSize: 26, fontWeight: "900", color: s.fg, letterSpacing: -1 }}>{s.v}</Text>
                <Text style={{ fontSize: 9, fontWeight: "900", color: s.fg, letterSpacing: 1.5 }}>{s.label}</Text>
              </View>
            ))}
          </View>
        </ImageBackground>

        {/* Tabs */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {(Object.keys(tabConfig) as Tab[]).map((t) => {
              const cfg = tabConfig[t];
              const active = tab === t;
              return (
                <TouchableOpacity
                  key={t}
                  testID={`admin-tab-${t}`}
                  onPress={() => setTab(t)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    paddingHorizontal: 4,
                    backgroundColor: active ? cfg.color : "transparent",
                    borderWidth: 2,
                    borderColor: "#fff",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <Ionicons name={cfg.icon} size={16} color={active ? (t === "customers" ? C.text : "#fff") : "#fff"} />
                  <Text style={{ fontSize: 9, fontWeight: "900", letterSpacing: 1, color: active ? (t === "customers" ? C.text : "#fff") : "#fff" }}>
                    {cfg.label.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Body */}
        <View style={{ padding: 16, gap: 10 }}>
          {loading ? (
            <View style={{ padding: 24, alignItems: "center" }}>
              <ActivityIndicator color={C.primary} />
            </View>
          ) : tab === "photos" ? (
            photos.length === 0 ? (
              <Empty icon="images" label="No photos uploaded" />
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {photos.map((p) => (
                  <View key={p.id} testID={`admin-photo-${p.id}`} style={{ width: PHOTO_W, backgroundColor: "#000", borderWidth: 2, borderColor: "#fff" }}>
                    <Image source={{ uri: `data:image/jpeg;base64,${p.photo_base64}` }} style={{ width: "100%", height: PHOTO_W }} resizeMode="cover" />
                    <View style={{ padding: 6, gap: 2 }}>
                      <Text style={{ color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 0.5 }} numberOfLines={1}>
                        {p.customer_name || p.customer_code}
                      </Text>
                      <Text style={{ color: C.green, fontFamily: "Courier", fontSize: 9, fontWeight: "900" }}>
                        ◉ {p.distance.toFixed(1)}m · {p.username}
                      </Text>
                      <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Courier", fontSize: 9 }}>
                        {new Date(p.upload_date).toLocaleDateString()} {new Date(p.upload_date).toLocaleTimeString().slice(0, 5)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )
          ) : tab === "fakegps" ? (
            logs.length === 0 ? (
              <Empty icon="shield-checkmark" label="No fake GPS attempts" sub="System integrity nominal" />
            ) : (
              logs.map((l) => (
                <View key={l.id} style={{ borderLeftWidth: 6, borderLeftColor: C.red, borderTopWidth: 2, borderRightWidth: 2, borderBottomWidth: 2, borderColor: "#fff", backgroundColor: "rgba(255,59,48,0.12)", padding: 12, gap: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="warning" size={16} color={C.red} />
                      <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>{l.username || l.user_code}</Text>
                    </View>
                    <View style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: C.red, borderWidth: 1, borderColor: "#fff" }}>
                      <Text style={{ fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 1 }}>BLOCKED</Text>
                    </View>
                  </View>
                  <Text style={{ color: "#fff", fontSize: 13 }}>{l.reason}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontFamily: "Courier", fontSize: 10 }}>
                    {l.customer_code || "—"} · {l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}
                  </Text>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontFamily: "Courier", fontSize: 10 }}>
                    {new Date(l.created_at).toLocaleString()}
                  </Text>
                </View>
              ))
            )
          ) : tab === "customers" ? (
            customers.length === 0 ? (
              <Empty icon="storefront" label="No customers" />
            ) : (
              customers.map((c) => (
                <View key={c.customer_code} style={{ backgroundColor: "#fff", borderWidth: 2, borderColor: "#fff", padding: 12, gap: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={S.label}>{c.customer_code} · {c.sales_rep_code || "—"}</Text>
                      <Text style={S.h3}>{c.customer_name}</Text>
                    </View>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: c.location_locked ? C.green : C.red, borderWidth: 2, borderColor: C.text }}>
                      <Text style={{ fontSize: 10, fontWeight: "900", color: "#fff", letterSpacing: 1 }}>
                        {c.location_locked ? "LOCKED" : "OPEN"}
                      </Text>
                    </View>
                  </View>
                  {c.latitude != null && c.longitude != null && (
                    <Text style={{ fontFamily: "Courier", fontSize: 11, color: C.textSecondary }}>
                      ◎ {c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}
                    </Text>
                  )}
                  {c.location_locked && (
                    <TouchableOpacity
                      testID={`reset-${c.customer_code}`}
                      onPress={() =>
                        Alert.alert("Reset location?", `Unlock ${c.customer_name}?`, [
                          { text: "Cancel", style: "cancel" },
                          { text: "Reset", style: "destructive", onPress: () => resetLocation(c.customer_code) },
                        ])
                      }
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 10, backgroundColor: C.yellow, borderWidth: 2, borderColor: C.text }}
                    >
                      <Ionicons name="refresh" size={16} color={C.text} />
                      <Text style={{ fontWeight: "900", letterSpacing: 1, color: C.text, textTransform: "uppercase", fontSize: 11 }}>
                        Reset Location
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )
          ) : (
            users.map((u) => (
              <View key={u.id} style={{ backgroundColor: "#fff", borderWidth: 2, borderColor: "#fff", padding: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 44, height: 44, backgroundColor: u.role === "admin" ? C.red : C.primary, borderWidth: 2, borderColor: C.text, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>
                    {u.name?.[0]?.toUpperCase() || "U"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.h3}>{u.name}</Text>
                  <Text style={{ fontFamily: "Courier", fontSize: 12, color: C.textSecondary }}>
                    @{u.username} {u.sales_rep_code ? `· ${u.sales_rep_code}` : ""}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 6, paddingVertical: 4, backgroundColor: u.role === "admin" ? C.red : C.yellow, borderWidth: 2, borderColor: C.text }}>
                  <Text style={{ fontSize: 9, fontWeight: "900", color: u.role === "admin" ? "#fff" : C.text, letterSpacing: 1 }}>
                    {u.role.toUpperCase()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Empty({ icon, label, sub }: { icon: any; label: string; sub?: string }) {
  return (
    <View style={{ alignItems: "center", padding: 36, borderWidth: 2, borderColor: "#fff", backgroundColor: "rgba(255,255,255,0.04)" }}>
      <Ionicons name={icon} size={36} color="#fff" />
      <Text style={{ color: "#fff", marginTop: 10, fontSize: 13, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" }}>{label}</Text>
      {sub && <Text style={{ color: "rgba(255,255,255,0.5)", marginTop: 4, fontSize: 11, fontFamily: "Courier" }}>{sub}</Text>}
    </View>
  );
}
