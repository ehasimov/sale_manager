import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, useAuth } from "../../src/auth";
import { S, C } from "../../src/theme";
import * as h from "../../src/haptics";

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
  ai_score?: {
    shelf_share_pct?: number;
    quality?: string;
    product_visibility?: string;
    notes?: string;
  } | null;
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
        } catch {}
      }
      setCustomers(cs);
    } catch (e: any) {
      Alert.alert("Couldn't load", e?.message || "Please try again");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const resetLocation = async (code: string) => {
    if (!token) return;
    try {
      await api(`/api/admin/customer/${code}/reset-location`, { method: "POST", token });
      h.success();
      Alert.alert("Reset done", `Location unlocked for ${code}`);
      loadAll();
    } catch (e: any) {
      h.error();
      Alert.alert("Couldn't reset", e?.message || "Please try again");
    }
  };

  const stats = {
    photos: photos.length,
    fakeGps: logs.length,
    locked: customers.filter((c) => c.location_locked).length,
    users: users.length,
  };

  const tabConfig: Record<Tab, { label: string; icon: any }> = {
    photos: { label: "Photos", icon: "images" },
    fakegps: { label: "Alerts", icon: "shield" },
    customers: { label: "Stores", icon: "storefront" },
    users: { label: "Team", icon: "people" },
  };

  return (
    <SafeAreaView style={S.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Header */}
        <View style={{ padding: 16, gap: 14 }}>
          <View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: C.textMuted, letterSpacing: 1.2, textTransform: "uppercase" }}>
              Control center
            </Text>
            <Text style={{ fontSize: 28, fontWeight: "800", color: C.text, letterSpacing: -0.8, marginTop: 2 }}>
              Operations
            </Text>
          </View>

          {/* KPI tiles */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[
              { v: stats.photos, label: "Photos", icon: "images" as const, accent: C.primary, bg: "#EEF2FF" },
              { v: stats.fakeGps, label: "Alerts", icon: "shield" as const, accent: C.red, bg: C.redSoft },
              { v: stats.locked, label: "Locked", icon: "lock-closed" as const, accent: C.green, bg: C.greenSoft },
              { v: stats.users, label: "Team", icon: "people" as const, accent: C.text, bg: C.surface },
            ].map((s, i) => (
              <View key={i} style={{ flex: 1, padding: 12, backgroundColor: s.bg, borderRadius: 14, borderWidth: 1, borderColor: C.borderSoft }}>
                <Ionicons name={s.icon} size={14} color={s.accent} />
                <Text style={{ fontSize: 22, fontWeight: "800", color: C.text, letterSpacing: -0.5, marginTop: 4 }}>{s.v}</Text>
                <Text style={{ fontSize: 11, fontWeight: "600", color: C.textSecondary }}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Tabs */}
          <View style={{ flexDirection: "row", gap: 6, padding: 4, backgroundColor: C.bgSubtle, borderRadius: 12 }}>
            {(Object.keys(tabConfig) as Tab[]).map((t) => {
              const cfg = tabConfig[t];
              const active = tab === t;
              return (
                <TouchableOpacity
                  key={t}
                  testID={`admin-tab-${t}`}
                  onPress={() => { h.tap(); setTab(t); }}
                  style={{
                    flex: 1,
                    paddingVertical: 9,
                    paddingHorizontal: 6,
                    borderRadius: 9,
                    backgroundColor: active ? C.surface : "transparent",
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 6,
                    shadowColor: active ? C.border : "transparent",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: active ? 0.1 : 0,
                    shadowRadius: 2,
                  }}
                >
                  <Ionicons name={cfg.icon} size={14} color={active ? C.text : C.textMuted} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: active ? C.text : C.textMuted }}>
                    {cfg.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {loading ? (
            <View style={{ padding: 36, alignItems: "center" }}>
              <ActivityIndicator color={C.primary} />
            </View>
          ) : tab === "photos" ? (
            photos.length === 0 ? (
              <Empty icon="images" label="No photos yet" sub="Reps will start showing up here." />
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {photos.map((p) => (
                  <View key={p.id} testID={`admin-photo-${p.id}`} style={{ width: PHOTO_W, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.borderSoft, overflow: "hidden" }}>
                    <View style={{ position: "relative" }}>
                      <Image source={{ uri: `data:image/jpeg;base64,${p.photo_base64}` }} style={{ width: "100%", height: PHOTO_W }} resizeMode="cover" />
                      {p.ai_score && typeof p.ai_score.shelf_share_pct === "number" && (
                        <View style={{ position: "absolute", top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: "rgba(16,185,129,0.95)", flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <Ionicons name="sparkles" size={11} color="#fff" />
                          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{p.ai_score.shelf_share_pct}%</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ padding: 10, gap: 3 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }} numberOfLines={1}>
                        {p.customer_name || p.customer_code}
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: "600", color: C.green }}>● {p.distance.toFixed(1)} m · {p.username}</Text>
                      {p.ai_score?.notes && (
                        <Text style={{ fontSize: 10, color: C.textSecondary, fontStyle: "italic" }} numberOfLines={2}>
                          “{p.ai_score.notes}”
                        </Text>
                      )}
                      <Text style={{ fontSize: 10, color: C.textMuted }}>
                        {new Date(p.upload_date).toLocaleDateString()} · {new Date(p.upload_date).toLocaleTimeString().slice(0, 5)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )
          ) : tab === "fakegps" ? (
            logs.length === 0 ? (
              <Empty icon="shield-checkmark" label="No alerts" sub="System integrity nominal." accent={C.green} />
            ) : (
              logs.map((l) => (
                <View key={l.id} style={{ borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: "#FECDD3", padding: 14, gap: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: C.redSoft, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="warning" size={16} color={C.red} />
                      </View>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: C.text }}>{l.username || l.user_code}</Text>
                    </View>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: C.red, borderRadius: 999 }}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: "#fff" }}>BLOCKED</Text>
                    </View>
                  </View>
                  <Text style={{ color: C.text, fontSize: 13 }}>{l.reason}</Text>
                  <Text style={{ color: C.textMuted, fontSize: 11 }}>
                    {l.customer_code || "—"} · {l.latitude.toFixed(5)}, {l.longitude.toFixed(5)} · {new Date(l.created_at).toLocaleString()}
                  </Text>
                </View>
              ))
            )
          ) : tab === "customers" ? (
            customers.length === 0 ? (
              <Empty icon="storefront" label="No stores" />
            ) : (
              customers.map((c) => (
                <View key={c.customer_code} style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.borderSoft, padding: 14, gap: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: "600", color: C.textMuted }}>
                        {c.customer_code} · {c.sales_rep_code || "—"}
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: C.text, marginTop: 2 }}>{c.customer_name}</Text>
                    </View>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: c.location_locked ? C.greenSoft : C.redSoft, borderWidth: 1, borderColor: c.location_locked ? "#A7F3D0" : "#FECDD3" }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: c.location_locked ? "#065F46" : "#9F1239" }}>
                        {c.location_locked ? "Locked" : "Open"}
                      </Text>
                    </View>
                  </View>
                  {c.latitude != null && c.longitude != null && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="location-outline" size={13} color={C.textMuted} />
                      <Text style={{ fontSize: 12, color: C.textSecondary }}>
                        {c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}
                      </Text>
                    </View>
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
                      style={{ paddingVertical: 11, borderRadius: 10, backgroundColor: C.bgSubtle, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}
                    >
                      <Ionicons name="refresh" size={15} color={C.text} />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }}>Reset location</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )
          ) : (
            users.map((u) => (
              <View key={u.id} style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.borderSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: u.role === "admin" ? C.red : C.primary, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 18 }}>
                    {u.name?.[0]?.toUpperCase() || "U"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: C.text }}>{u.name}</Text>
                  <Text style={{ fontSize: 12, color: C.textMuted }}>
                    @{u.username} {u.sales_rep_code ? `· ${u.sales_rep_code}` : ""}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: u.role === "admin" ? C.redSoft : C.yellowSoft }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: u.role === "admin" ? "#9F1239" : "#92670B" }}>
                    {u.role}
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

function Empty({ icon, label, sub, accent }: { icon: any; label: string; sub?: string; accent?: string }) {
  return (
    <View style={{ alignItems: "center", padding: 36, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.borderSoft, gap: 8 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.bgSubtle, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={28} color={accent || C.textMuted} />
      </View>
      <Text style={{ fontSize: 14, color: C.text, fontWeight: "700" }}>{label}</Text>
      {sub && <Text style={{ fontSize: 12, color: C.textMuted }}>{sub}</Text>}
    </View>
  );
}
