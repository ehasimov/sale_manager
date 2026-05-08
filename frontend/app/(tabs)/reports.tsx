import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, useAuth } from "../../src/auth";
import { S, C, statusStyle, statusTextColor } from "../../src/theme";
import * as h from "../../src/haptics";

type WeeklyRow = {
  customer_code: string;
  customer_name: string;
  sales_rep_code?: string | null;
  route_code?: string | null;
  visits_per_week: number;
  visits_this_week: number;
  last_upload_at?: string | null;
  status: "not_visited" | "uploaded" | "delayed";
};

type WeeklyReport = {
  total: number;
  on_track: number;
  overdue: number;
  not_visited: number;
  completion_pct: number;
  items: WeeklyRow[];
};

type Analytics = {
  week_uploads: { date: string; count: number }[];
  by_rep: { user_code: string; username: string; count: number }[];
  total_uploads: number;
  fake_gps_count: number;
  locked_customers: number;
  total_customers: number;
};

const STATUS_LABELS: Record<string, string> = {
  uploaded: "On track",
  delayed: "Late",
  not_visited: "Not visited",
};

const dayShort = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3);
};

export default function Reports() {
  const { user, token } = useAuth();
  const isAdmin = user?.role === "admin";
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "uploaded" | "delayed" | "not_visited">("all");
  const [editing, setEditing] = useState<WeeklyRow | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await api<WeeklyReport>("/api/reports/weekly", { token });
      setReport(r);
      if (isAdmin) {
        const a = await api<Analytics>("/api/admin/analytics", { token });
        setAnalytics(a);
      }
    } catch (e: any) {
      Alert.alert("Couldn't load", e?.message || "Please try again");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, isAdmin]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => {
    h.tap();
    setRefreshing(true);
    load();
  };

  const setSchedule = async (code: string, vpw: number) => {
    if (!token) return;
    setSavingSchedule(true);
    try {
      await api(`/api/admin/customer/${code}/schedule`, {
        method: "POST",
        token,
        body: JSON.stringify({ visits_per_week: vpw }),
      });
      h.success();
      setEditing(null);
      load();
    } catch (e: any) {
      h.error();
      Alert.alert("Couldn't save", e?.message || "Please try again");
    } finally {
      setSavingSchedule(false);
    }
  };

  const filtered = report?.items.filter((it) => filter === "all" ? true : it.status === filter) || [];
  const maxBar = analytics ? Math.max(1, ...analytics.week_uploads.map((d) => d.count)) : 1;

  return (
    <SafeAreaView style={S.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        <View>
          <Text style={{ fontSize: 12, fontWeight: "700", color: C.textMuted, letterSpacing: 1.2, textTransform: "uppercase" }}>
            This week
          </Text>
          <Text style={{ fontSize: 28, fontWeight: "800", color: C.text, letterSpacing: -0.8, marginTop: 2 }}>
            Visit reports
          </Text>
        </View>

        {loading ? (
          <View style={{ padding: 36, alignItems: "center" }}>
            <ActivityIndicator color={C.primary} />
          </View>
        ) : !report ? null : (
          <>
            {/* Completion ring + summary */}
            <View style={{ backgroundColor: C.bgInk, borderRadius: 18, padding: 18, flexDirection: "row", alignItems: "center", gap: 18 }}>
              <CompletionRing pct={report.completion_pct} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>
                  Weekly completion
                </Text>
                <Text style={{ color: "#fff", fontSize: 26, fontWeight: "800", letterSpacing: -0.5 }}>
                  {report.on_track} / {report.total} on track
                </Text>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  <Tag color={C.green} text={`${report.on_track} done`} />
                  <Tag color={C.orange} text={`${report.overdue} late`} />
                  <Tag color="#A1A1AA" text={`${report.not_visited} open`} />
                </View>
              </View>
            </View>

            {/* Weekly bar chart (admin) */}
            {isAdmin && analytics && (
              <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.borderSoft, padding: 16, gap: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>Uploads · 7 days</Text>
                    <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>Total {analytics.total_uploads}</Text>
                  </View>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: C.greenSoft, borderRadius: 999 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#065F46" }}>● live</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 130, paddingTop: 8 }}>
                  {analytics.week_uploads.map((d, i) => {
                    const ratio = d.count / maxBar;
                    const today = i === analytics.week_uploads.length - 1;
                    return (
                      <View key={d.date} style={{ flex: 1, alignItems: "center", gap: 6 }}>
                        <Text style={{ fontSize: 10, fontWeight: "700", color: C.textMuted }}>{d.count || ""}</Text>
                        <View style={{ width: "100%", height: 90, justifyContent: "flex-end" }}>
                          <View
                            style={{
                              width: "100%",
                              height: Math.max(6, ratio * 90),
                              backgroundColor: today ? C.primary : "#C7D2FE",
                              borderRadius: 6,
                            }}
                          />
                        </View>
                        <Text style={{ fontSize: 10, fontWeight: today ? "800" : "600", color: today ? C.primary : C.textSecondary }}>
                          {dayShort(d.date)}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {analytics.by_rep.length > 0 && (
                  <View style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: C.borderSoft, gap: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: C.textSecondary, letterSpacing: 0.4 }}>By rep this week</Text>
                    {analytics.by_rep.slice(0, 5).map((r, idx) => (
                      <View key={idx} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>
                            {r.username?.[0]?.toUpperCase() || "?"}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }}>{r.username || r.user_code}</Text>
                          <View style={{ height: 4, backgroundColor: C.bgSubtle, borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                            <View style={{ width: `${(r.count / Math.max(1, analytics.by_rep[0].count)) * 100}%`, height: "100%", backgroundColor: C.green, borderRadius: 2 }} />
                          </View>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: "800", color: C.text }}>{r.count}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Filter chips */}
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {(["all", "uploaded", "delayed", "not_visited"] as const).map((f) => {
                const active = filter === f;
                const labels: Record<string, string> = {
                  all: `All (${report.total})`,
                  uploaded: `Done (${report.on_track})`,
                  delayed: `Late (${report.overdue})`,
                  not_visited: `Open (${report.not_visited})`,
                };
                return (
                  <TouchableOpacity
                    key={f}
                    onPress={() => { h.tap(); setFilter(f); }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor: active ? C.text : C.surface,
                      borderWidth: 1,
                      borderColor: active ? C.text : C.borderSoft,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: active ? "#fff" : C.text }}>{labels[f]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Customer list */}
            <View style={{ gap: 10 }}>
              {filtered.map((it) => {
                const ratio = it.visits_per_week > 0 ? Math.min(1, it.visits_this_week / it.visits_per_week) : 0;
                return (
                  <View key={it.customer_code} style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.borderSoft, padding: 14, gap: 10 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, fontWeight: "600", color: C.textMuted }}>
                          {it.customer_code} · {it.sales_rep_code || "—"} · Route {it.route_code || "—"}
                        </Text>
                        <Text style={{ fontSize: 16, fontWeight: "700", color: C.text, marginTop: 2 }}>{it.customer_name}</Text>
                      </View>
                      <View style={[{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 }, statusStyle(it.status)]}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: statusTextColor(it.status) }}>
                          {STATUS_LABELS[it.status]}
                        </Text>
                      </View>
                    </View>

                    {/* Schedule progress */}
                    <View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: C.textSecondary }}>
                          {it.visits_this_week} / {it.visits_per_week || 0} visits this week
                        </Text>
                        <Text style={{ fontSize: 11, color: C.textMuted }}>
                          {it.last_upload_at ? `Last: ${new Date(it.last_upload_at).toLocaleDateString()}` : "Never"}
                        </Text>
                      </View>
                      <View style={{ height: 6, backgroundColor: C.bgSubtle, borderRadius: 3, overflow: "hidden" }}>
                        <View
                          style={{
                            width: `${ratio * 100}%`,
                            height: "100%",
                            backgroundColor: ratio >= 1 ? C.green : it.status === "delayed" ? C.orange : C.primary,
                            borderRadius: 3,
                          }}
                        />
                      </View>
                    </View>

                    {/* Schedule chip + edit */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: C.bgSubtle, flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Ionicons name="calendar" size={12} color={C.textSecondary} />
                        <Text style={{ fontSize: 11, fontWeight: "700", color: C.textSecondary }}>
                          {it.visits_per_week === 0 ? "No schedule" : `${it.visits_per_week}× / week`}
                        </Text>
                      </View>
                      {isAdmin && (
                        <TouchableOpacity
                          onPress={() => { h.tap(); setEditing(it); }}
                          testID={`edit-schedule-${it.customer_code}`}
                          style={{ marginLeft: "auto", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: C.yellowSoft, borderWidth: 1, borderColor: "#F5C842", flexDirection: "row", alignItems: "center", gap: 4 }}
                        >
                          <Ionicons name="settings" size={12} color="#92670B" />
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#92670B" }}>Edit</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
              {filtered.length === 0 && (
                <View style={{ alignItems: "center", padding: 36, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.borderSoft, gap: 8 }}>
                  <Ionicons name="checkmark-done" size={28} color={C.green} />
                  <Text style={{ fontSize: 13, color: C.text, fontWeight: "600" }}>Nothing to show.</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Schedule editor modal */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 36, gap: 16 }}>
            <View style={{ alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: C.bgMuted }} />
            <View>
              <Text style={{ fontSize: 12, fontWeight: "700", color: C.textMuted, letterSpacing: 1, textTransform: "uppercase" }}>
                Schedule
              </Text>
              <Text style={{ fontSize: 22, fontWeight: "800", color: C.text, letterSpacing: -0.5, marginTop: 2 }}>
                {editing?.customer_name}
              </Text>
              <Text style={{ fontSize: 13, color: C.textSecondary, marginTop: 4 }}>
                How many times per week should this customer be visited?
              </Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => {
                const active = editing?.visits_per_week === n;
                return (
                  <TouchableOpacity
                    key={n}
                    testID={`schedule-option-${n}`}
                    onPress={() => editing && setSchedule(editing.customer_code, n)}
                    disabled={savingSchedule}
                    style={{
                      flexBasis: "23%",
                      paddingVertical: 14,
                      borderRadius: 12,
                      backgroundColor: active ? C.primary : C.surface,
                      borderWidth: 1.5,
                      borderColor: active ? C.primary : C.borderSoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 22, fontWeight: "800", color: active ? "#fff" : C.text }}>{n}</Text>
                    <Text style={{ fontSize: 9, fontWeight: "700", color: active ? "rgba(255,255,255,0.85)" : C.textMuted, marginTop: 2 }}>
                      {n === 0 ? "OFF" : n === 1 ? "/ WEEK" : "/ WEEK"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              onPress={() => setEditing(null)}
              style={{ paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: C.bgSubtle, marginTop: 4 }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function CompletionRing({ pct }: { pct: number }) {
  // Simple bar-style ring substitute — clamped 0–100. Visual gauge with ticks.
  const size = 84;
  const total = 24;
  const filled = Math.round((pct / 100) * total);
  const ticks = [...Array(total)].map((_, i) => {
    const angle = (i / total) * 360 - 90;
    const rad = (angle * Math.PI) / 180;
    const r = size / 2 - 6;
    const x = size / 2 + Math.cos(rad) * r - 1.5;
    const y = size / 2 + Math.sin(rad) * r - 5;
    const on = i < filled;
    return (
      <View
        key={i}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: 3,
          height: 10,
          borderRadius: 1.5,
          backgroundColor: on ? C.green : "rgba(255,255,255,0.18)",
          transform: [{ rotate: `${angle + 90}deg` }],
        }}
      />
    );
  });
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {ticks}
      <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.5 }}>{pct}<Text style={{ fontSize: 12, fontWeight: "700" }}>%</Text></Text>
    </View>
  );
}

function Tag({ color, text }: { color: string; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 11, fontWeight: "700", color: "#fff" }}>{text}</Text>
    </View>
  );
}
