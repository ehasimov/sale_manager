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
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, useAuth } from "../../src/auth";
import { S, C, statusStyle, statusTextColor } from "../../src/theme";
import { readQueue, syncQueue } from "../../src/offlineQueue";
import { shelfFor } from "../../src/assets";
import * as h from "../../src/haptics";
import { scheduleVisitReminders } from "../../src/notifications";

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
  not_visited: "Not visited",
  uploaded: "Uploaded",
  delayed: "Delayed",
} as const;

const greeting = () => {
  const h2 = new Date().getHours();
  if (h2 < 12) return "Good morning";
  if (h2 < 18) return "Good afternoon";
  return "Good evening";
};

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
      // Schedule local reminders for pending / late visits (no-op on web; throttled)
      scheduleVisitReminders(data as any);
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
        h.success();
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
    h.tap();
    setRefreshing(true);
    load();
    checkQueue();
  };

  const filtered = items
    .filter((c) => (filter === "all" ? true : c.status === filter))
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
        <View testID="offline-banner" style={{ backgroundColor: C.yellowSoft, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.borderSoft, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="cloud-offline" size={14} color={C.text} />
          <Text style={{ fontSize: 12, fontWeight: "600", color: C.text, flex: 1 }}>
            {pendingCount} photo{pendingCount > 1 ? "s" : ""} waiting to sync
          </Text>
          <Text style={{ fontSize: 11, color: C.textSecondary }}>auto-retry</Text>
        </View>
      )}
      {syncMsg && (
        <View style={{ backgroundColor: C.greenSoft, paddingHorizontal: 14, paddingVertical: 8, alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#A7F3D0" }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#065F46" }}>{syncMsg}</Text>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 84 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 4 }}>
            {/* Hero */}
            <View style={{ borderRadius: 18, overflow: "hidden", backgroundColor: C.bgInk, borderWidth: 1, borderColor: C.border }}>
              <ImageBackground
                source={{ uri: shelfFor(user?.username || "x") }}
                style={{ minHeight: 180 }}
                imageStyle={{ opacity: 0.45 }}
              >
                <View style={{ flex: 1, padding: 18, justifyContent: "space-between", backgroundColor: "rgba(0,0,0,0.35)" }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View>
                      <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "600" }}>
                        {greeting()},
                      </Text>
                      <Text style={{ color: "#fff", fontSize: 26, fontWeight: "800", letterSpacing: -0.5, marginTop: 2 }}>
                        {user?.name?.split(" ")[0] || "Field rep"}
                      </Text>
                      <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 4 }}>
                        Route {user?.sales_rep_code || "—"} ·{" "}
                        {new Date().toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" })}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: "#fff", fontSize: 38, fontWeight: "800", letterSpacing: -1.5, lineHeight: 40 }}>
                        {completion}
                        <Text style={{ fontSize: 16, fontWeight: "700" }}>%</Text>
                      </Text>
                      <Text style={{ color: C.yellow, fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>
                        DAILY PROGRESS
                      </Text>
                    </View>
                  </View>
                  <View style={{ marginTop: 16, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden" }}>
                    <View style={{ width: `${completion}%`, height: "100%", backgroundColor: C.yellow, borderRadius: 4 }} />
                  </View>
                </View>
              </ImageBackground>
            </View>

            {/* Stat tiles */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[
                { v: counts.total, label: "Total", icon: "list" as const, accent: C.text, bg: C.surface },
                { v: counts.uploaded, label: "Done", icon: "checkmark-circle" as const, accent: C.green, bg: C.greenSoft },
                { v: counts.delayed, label: "Late", icon: "time" as const, accent: "#92670B", bg: C.yellowSoft },
                { v: counts.pending, label: "Open", icon: "ellipse-outline" as const, accent: C.primary, bg: "#EEF2FF" },
              ].map((s, i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    paddingHorizontal: 10,
                    backgroundColor: s.bg,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: C.borderSoft,
                  }}
                >
                  <Ionicons name={s.icon} size={14} color={s.accent} />
                  <Text style={{ fontSize: 22, fontWeight: "800", color: C.text, letterSpacing: -0.5, marginTop: 4 }}>{s.v}</Text>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: C.textSecondary }}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Search */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.borderSoft, paddingHorizontal: 12 }}>
              <Ionicons name="search" size={18} color={C.textMuted} />
              <TextInput
                testID="customer-search-input"
                value={query}
                onChangeText={setQuery}
                placeholder="Search customer or code"
                placeholderTextColor={C.textMuted}
                style={{ flex: 1, paddingVertical: 12, fontSize: 15, color: C.text }}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => { h.tap(); setQuery(""); }} hitSlop={10}>
                  <Ionicons name="close-circle" size={18} color={C.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter chips */}
            <View style={{ flexDirection: "row", gap: 6 }}>
              {(["all", "not_visited", "uploaded", "delayed"] as const).map((f) => {
                const active = filter === f;
                const labels: Record<string, string> = { all: "All", not_visited: "Open", uploaded: "Done", delayed: "Late" };
                return (
                  <TouchableOpacity
                    key={f}
                    testID={`filter-${f}`}
                    onPress={() => { h.tap(); setFilter(f); }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: active ? C.text : C.surface,
                      borderWidth: 1,
                      borderColor: active ? C.text : C.borderSoft,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: active ? "#fff" : C.text, letterSpacing: 0.3 }}>
                      {labels[f]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ padding: 48, alignItems: "center" }}>
              <ActivityIndicator color={C.primary} />
            </View>
          ) : (
            <View style={{ alignItems: "center", padding: 32, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.borderSoft }}>
              <Ionicons name="search-outline" size={32} color={C.textMuted} />
              <Text style={{ marginTop: 10, fontSize: 14, fontWeight: "600", color: C.text }}>No customers match</Text>
              {error && <Text style={{ color: C.red, marginTop: 6, fontSize: 12 }}>{error}</Text>}
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <CustomerCard item={item} index={index} onPress={() => { h.light(); router.push(`/customer/${item.customer_code}`); }} />
        )}
      />

      {/* AI assistant FAB */}
      <TouchableOpacity
        testID="ask-ai-fab"
        onPress={() => { h.light(); router.push("/assistant"); }}
        style={{
          position: "absolute",
          right: 16,
          bottom: 18,
          minHeight: 50,
          paddingHorizontal: 16,
          borderRadius: 25,
          backgroundColor: C.bgInk,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Ionicons name="sparkles" size={16} color={C.yellow} />
        <Text style={{ color: C.textInverse, fontWeight: "800", fontSize: 14 }}>Ask AI</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function CustomerCard({ item, index, onPress }: { item: Customer; index: number; onPress: () => void }) {
  const fade = useState(() => new Animated.Value(0))[0];
  const slide = useState(() => new Animated.Value(12))[0];
  if ((fade as any).__started !== true) {
    (fade as any).__started = true;
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 350, delay: index * 60, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 380, delay: index * 60, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start();
  }

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
      <TouchableOpacity
        testID={`customer-card-${item.customer_code}`}
        activeOpacity={0.9}
        onPress={onPress}
        style={{
          backgroundColor: C.surface,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: C.borderSoft,
          flexDirection: "row",
          overflow: "hidden",
        }}
      >
        <ImageBackground source={{ uri: shelfFor(item.customer_code) }} style={{ width: 96 }} imageStyle={{ opacity: 0.95 }}>
          <View style={{ flex: 1, justifyContent: "space-between", padding: 8, backgroundColor: "rgba(0,0,0,0.18)" }}>
            <View
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 6,
                paddingVertical: 2,
                backgroundColor: "rgba(0,0,0,0.6)",
                borderRadius: 4,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", letterSpacing: 0.4 }}>
                {item.customer_code}
              </Text>
            </View>
            <View
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 6,
                paddingVertical: 3,
                borderRadius: 4,
                backgroundColor: item.location_locked ? "rgba(16,185,129,0.95)" : "rgba(255,77,79,0.95)",
                flexDirection: "row",
                alignItems: "center",
                gap: 3,
              }}
            >
              <Ionicons name={item.location_locked ? "lock-closed" : "lock-open"} size={10} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>
                {item.location_locked ? "Locked" : "Set GPS"}
              </Text>
            </View>
          </View>
        </ImageBackground>

        <View style={{ flex: 1, padding: 14, gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: C.textMuted }}>
                Route {item.route_code || "—"}
              </Text>
              <Text style={{ fontSize: 16, fontWeight: "700", color: C.text, marginTop: 2 }} numberOfLines={2}>
                {item.customer_name}
              </Text>
            </View>
            <View style={[{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 }, statusStyle(item.status)]}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: statusTextColor(item.status) }}>
                {STATUS_LABEL[item.status]}
              </Text>
            </View>
          </View>
          {item.latitude != null && item.longitude != null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="location-outline" size={13} color={C.textMuted} />
              <Text style={{ fontSize: 12, color: C.textSecondary, fontWeight: "500" }} numberOfLines={1}>
                {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="warning" size={13} color={C.orange} />
              <Text style={{ fontSize: 12, color: C.orange, fontWeight: "600" }}>Visit to lock GPS</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
