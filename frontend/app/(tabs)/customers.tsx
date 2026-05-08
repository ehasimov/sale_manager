import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  ImageBackground,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, useAuth } from "../../src/auth";
import { S, C, statusStyle } from "../../src/theme";
import { readQueue, syncQueue } from "../../src/offlineQueue";
import { shelfFor } from "../../src/assets";

type Customer = {
  id: string;
  customer_code: string;
  customer_name: string;
  latitude: number | null;
  longitude: number | null;
  location_locked: boolean;
  route_code?: string | null;
  sales_rep_code?: string | null;
  status: "not_visited" | "uploaded" | "delayed";
  last_upload_at?: string | null;
};

const STATUS_LABEL = {
  not_visited: "Not Visited",
  uploaded: "Uploaded",
  delayed: "Delayed",
} as const;

export default function Customers() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "not_visited" | "uploaded" | "delayed">("all");
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !token) return;
    setError(null);
    try {
      const data = await api<Customer[]>(`/api/customers/by-user/${user.id}`, { token });
      setItems(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load customers");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, token]);

  const checkQueue = useCallback(async () => {
    const q = await readQueue();
    setPendingCount(q.length);
    if (q.length > 0 && token) {
      const backend = process.env.EXPO_PUBLIC_BACKEND_URL || "";
      const res = await syncQueue(token, backend);
      if (res.synced > 0) {
        setSyncMsg(`Synced ${res.synced} pending photo${res.synced > 1 ? "s" : ""}`);
        setTimeout(() => setSyncMsg(null), 3500);
        load();
      }
      const q2 = await readQueue();
      setPendingCount(q2.length);
    }
  }, [token, load]);

  useFocusEffect(
    useCallback(() => {
      load();
      checkQueue();
    }, [load, checkQueue])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
    checkQueue();
  };

  const filtered = items
    .filter((c) => filter === "all" ? true : c.status === filter)
    .filter(
      (c) =>
        c.customer_name.toLowerCase().includes(query.toLowerCase()) ||
        c.customer_code.toLowerCase().includes(query.toLowerCase())
    );

  const counts = {
    total: items.length,
    uploaded: items.filter((i) => i.status === "uploaded").length,
    delayed: items.filter((i) => i.status === "delayed").length,
    pending: items.filter((i) => i.status === "not_visited").length,
  };
  const completion = items.length > 0 ? Math.round((counts.uploaded / items.length) * 100) : 0;

  return (
    <SafeAreaView style={S.screen} edges={["top"]}>
      {pendingCount > 0 && (
        <View testID="offline-banner" style={{ backgroundColor: C.yellow, padding: 8, borderBottomWidth: 2, borderBottomColor: C.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Ionicons name="cloud-offline" size={14} color={C.text} />
          <Text style={{ fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 }}>
            {pendingCount} pending upload{pendingCount > 1 ? "s" : ""}
          </Text>
        </View>
      )}
      {syncMsg && (
        <View style={{ backgroundColor: C.green, padding: 8, alignItems: "center", borderBottomWidth: 2, borderBottomColor: C.border }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff", textTransform: "uppercase", letterSpacing: 1 }}>{syncMsg}</Text>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            {/* Hero */}
            <View style={{ borderWidth: 2, borderColor: C.border, backgroundColor: "#000", overflow: "hidden", shadowColor: C.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0 }}>
              <ImageBackground
                source={{ uri: shelfFor(user?.username || "x") }}
                style={{ padding: 16, minHeight: 160 }}
                imageStyle={{ opacity: 0.35 }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ gap: 4 }}>
                    <Text style={{ color: C.yellow, fontSize: 10, fontWeight: "900", letterSpacing: 2, fontFamily: "Courier" }}>
                      ROUTE · {user?.sales_rep_code || "—"}
                    </Text>
                    <Text style={{ color: "#fff", fontSize: 32, fontWeight: "900", letterSpacing: -1, lineHeight: 36 }}>
                      {user?.name?.split(" ")[0]?.toUpperCase() || "FIELD"}
                    </Text>
                    <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Courier" }}>
                      {new Date().toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" }).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: "#fff", fontSize: 44, fontWeight: "900", letterSpacing: -2, lineHeight: 44 }}>{completion}<Text style={{ fontSize: 18 }}>%</Text></Text>
                    <Text style={{ color: C.yellow, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 }}>COMPLETION</Text>
                  </View>
                </View>
                {/* Progress bar */}
                <View style={{ marginTop: 16, height: 12, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 2, borderColor: "#fff" }}>
                  <View style={{ width: `${completion}%`, height: "100%", backgroundColor: C.yellow }} />
                </View>
              </ImageBackground>
            </View>

            {/* Stat tiles */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[
                { v: counts.total, label: "TOTAL", bg: "#fff", fg: C.text },
                { v: counts.uploaded, label: "DONE", bg: C.green, fg: "#fff" },
                { v: counts.delayed, label: "LATE", bg: C.yellow, fg: C.text },
                { v: counts.pending, label: "OPEN", bg: C.text, fg: "#fff" },
              ].map((s, i) => (
                <View key={i} style={{ flex: 1, padding: 10, backgroundColor: s.bg, borderWidth: 2, borderColor: C.border, shadowColor: C.border, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0 }}>
                  <Text style={{ fontSize: 24, fontWeight: "900", color: s.fg, letterSpacing: -1 }}>{s.v}</Text>
                  <Text style={{ fontSize: 9, fontWeight: "900", color: s.fg, letterSpacing: 1.5 }}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Search */}
            <View style={[S.row, { borderWidth: 2, borderColor: C.border, paddingHorizontal: 10, backgroundColor: "#fff" }]}>
              <Ionicons name="search" size={18} color={C.text} />
              <TextInput
                testID="customer-search-input"
                value={query}
                onChangeText={setQuery}
                placeholder="Search customer or code"
                placeholderTextColor="#A1A1AA"
                style={{ flex: 1, paddingVertical: 12, fontSize: 15, color: C.text }}
              />
            </View>

            {/* Filter chips */}
            <View style={{ flexDirection: "row", gap: 6 }}>
              {(["all", "not_visited", "uploaded", "delayed"] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  testID={`filter-${f}`}
                  onPress={() => setFilter(f)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderWidth: 2,
                    borderColor: C.border,
                    backgroundColor: filter === f ? C.text : "#fff",
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "900", letterSpacing: 1, color: filter === f ? "#fff" : C.text, textTransform: "uppercase" }}>
                    {f.replace("_", " ")}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ padding: 24, alignItems: "center" }}>
              <ActivityIndicator color={C.primary} />
            </View>
          ) : (
            <View style={[S.card, { alignItems: "center", padding: 28 }]}>
              <Ionicons name="map-outline" size={32} color={C.text} />
              <Text style={[S.body, { marginTop: 8 }]}>No customers found.</Text>
              {error && <Text style={{ color: C.red, marginTop: 6 }}>{error}</Text>}
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`customer-card-${item.customer_code}`}
            activeOpacity={0.85}
            onPress={() => router.push(`/customer/${item.customer_code}`)}
            style={{ borderWidth: 2, borderColor: C.border, backgroundColor: "#fff", shadowColor: C.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0 }}
          >
            <View style={{ flexDirection: "row" }}>
              <ImageBackground
                source={{ uri: shelfFor(item.customer_code) }}
                style={{ width: 92 }}
                imageStyle={{ opacity: 0.85 }}
              >
                <View style={{ flex: 1, justifyContent: "space-between", padding: 6, backgroundColor: "rgba(0,0,0,0.25)", borderRightWidth: 2, borderRightColor: C.border }}>
                  <Text style={{ color: "#fff", fontFamily: "Courier", fontSize: 10, fontWeight: "900" }}>
                    {item.customer_code}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons
                      name={item.location_locked ? "lock-closed" : "lock-open"}
                      size={12}
                      color={item.location_locked ? C.green : C.red}
                    />
                    <Text style={{ color: "#fff", fontFamily: "Courier", fontSize: 10 }}>
                      {item.location_locked ? "LOCKED" : "OPEN"}
                    </Text>
                  </View>
                </View>
              </ImageBackground>

              <View style={{ flex: 1, padding: 12, gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, paddingRight: 6 }}>
                    <Text style={S.label}>Route {item.route_code || "—"}</Text>
                    <Text style={[S.h3, { marginTop: 2 }]} numberOfLines={2}>{item.customer_name}</Text>
                  </View>
                  <View style={[S.badge, statusStyle(item.status)]}>
                    <Text style={S.badgeText}>{STATUS_LABEL[item.status]}</Text>
                  </View>
                </View>
                {item.latitude != null && item.longitude != null ? (
                  <Text style={{ fontFamily: "Courier", fontSize: 11, color: C.textSecondary }}>
                    ◎ {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                  </Text>
                ) : (
                  <Text style={{ fontFamily: "Courier", fontSize: 11, color: C.red, fontWeight: "700" }}>
                    ⚑ LOCATION NOT SET — VISIT TO LOCK
                  </Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}
