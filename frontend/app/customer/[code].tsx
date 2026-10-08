import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Dimensions,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { api, useAuth } from "../../src/auth";
import { S, C, statusStyle, statusTextColor } from "../../src/theme";
import { shelfFor } from "../../src/assets";
import * as h from "../../src/haptics";

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

type Photo = {
  id: string;
  upload_date: string;
  latitude: number;
  longitude: number;
  distance: number;
  photo_base64: string;
  username?: string | null;
  ai_score?: {
    shelf_share_pct?: number;
    quality?: string;
    product_visibility?: string;
    notes?: string;
    error?: string;
  } | null;
  ai_feedback?: { text: string; model?: string } | null;
};

const RADIUS = 30;

const haversine = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
};

const SCREEN_W = Dimensions.get("window").width;
const PHOTO_W = (SCREEN_W - 16 * 2 - 8) / 2;

function DistanceGauge({ distance }: { distance: number | null }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const inRange = distance != null && distance <= RADIUS;

  useEffect(() => {
    if (inRange) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
          Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulse.setValue(0);
    }
  }, [inRange, pulse]);

  if (distance == null) {
    return (
      <View style={{ padding: 18, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderSoft, alignItems: "center", gap: 8 }}>
        <Ionicons name="navigate-circle-outline" size={36} color={C.textMuted} />
        <Text style={{ fontSize: 14, color: C.textSecondary, fontWeight: "600", textAlign: "center" }}>
          Tap “Check distance” to verify your position
        </Text>
      </View>
    );
  }

  const pct = Math.min(100, (distance / RADIUS) * 100);
  const overflow = Math.min(100, ((distance - RADIUS) / RADIUS) * 100);
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <View
      style={{
        borderRadius: 18,
        overflow: "hidden",
        backgroundColor: inRange ? "#062F25" : "#3A0A0F",
        padding: 18,
        gap: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <Text style={{ fontSize: 11, fontWeight: "700", color: inRange ? "#6EE7B7" : "#FCA5A5", letterSpacing: 1 }}>
            {inRange ? "● IN RANGE" : "● OUT OF RANGE"}
          </Text>
          <Text style={{ fontSize: 44, fontWeight: "800", color: "#fff", letterSpacing: -1.5, lineHeight: 46, marginTop: 2 }}>
            {distance.toFixed(0)}
            <Text style={{ fontSize: 16, color: "rgba(255,255,255,0.75)" }}> m</Text>
          </Text>
          <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
            Allowed radius {RADIUS} m
          </Text>
        </View>
        <View style={{ width: 78, height: 78, alignItems: "center", justifyContent: "center" }}>
          {inRange && (
            <Animated.View
              style={{
                position: "absolute",
                width: 78,
                height: 78,
                borderRadius: 39,
                borderWidth: 2,
                borderColor: C.green,
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              }}
            />
          )}
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: inRange ? "rgba(16,185,129,0.25)" : "rgba(255,77,79,0.25)",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 2,
              borderColor: inRange ? C.green : C.red,
            }}
          >
            <Ionicons name={inRange ? "checkmark" : "warning"} size={32} color={inRange ? C.green : C.red} />
          </View>
        </View>
      </View>
      <View style={{ height: 8, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 4, overflow: "hidden" }}>
        <View style={{ width: `${inRange ? pct : 100}%`, height: "100%", backgroundColor: inRange ? C.green : C.red, borderRadius: 4 }} />
      </View>
    </View>
  );
}

export default function CustomerDetail() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token || !code) return;
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        api<Customer>(`/api/customers/${code}`, { token }),
        api<Photo[]>(`/api/photo/by-customer/${code}`, { token }),
      ]);
      setCustomer(c);
      setPhotos(p);
    } catch (e: any) {
      Alert.alert("Couldn't load", e?.message || "Please try again");
    } finally {
      setLoading(false);
    }
  }, [code, token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const ensureLocationPerm = async (): Promise<boolean> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Location required", "Please grant location access so we can verify your position.");
      return false;
    }
    return true;
  };

  const getCurrentLocation = async () => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

  const checkDistance = async () => {
    if (!customer?.latitude || !customer?.longitude) return;
    if (!(await ensureLocationPerm())) return;
    h.tap();
    setGpsBusy(true);
    try {
      const pos = await getCurrentLocation();
      const d = haversine(
        { lat: customer.latitude, lon: customer.longitude },
        { lat: pos.coords.latitude, lon: pos.coords.longitude }
      );
      setDistance(d);
      if (d <= RADIUS) h.success();
      else h.warning();
    } catch (e: any) {
      Alert.alert("GPS error", e?.message || "Couldn't read location");
    } finally {
      setGpsBusy(false);
    }
  };

  const onConfirmLocation = async () => {
    if (!(await ensureLocationPerm())) return;
    h.medium();
    setBusy(true);
    try {
      const pos = await getCurrentLocation();
      if ((pos.coords as any).mocked) {
        h.error();
        Alert.alert("Mock location detected", "Disable mock locations and try again.");
        setBusy(false);
        return;
      }
      Alert.alert(
        "Lock this location?",
        `Once locked, only an admin can change it.\n\nLat: ${pos.coords.latitude.toFixed(6)}\nLng: ${pos.coords.longitude.toFixed(6)}`,
        [
          { text: "Cancel", style: "cancel", onPress: () => setBusy(false) },
          {
            text: "Lock",
            style: "destructive",
            onPress: async () => {
              try {
                const updated = await api<Customer>(`/api/customer/confirm-location`, {
                  method: "POST",
                  token,
                  body: JSON.stringify({
                    customer_code: code,
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                  }),
                });
                setCustomer(updated);
                h.success();
                Alert.alert("Locked ✓", "Customer location is now locked.");
              } catch (e: any) {
                h.error();
                Alert.alert("Couldn't lock", e?.message || "Please try again");
              } finally {
                setBusy(false);
              }
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("GPS error", e?.message || "Couldn't read location");
      setBusy(false);
    }
  };

  const onTakePhoto = async () => {
    if (!customer?.latitude || !customer?.longitude) {
      Alert.alert("Location not set", "Set the customer location before taking photos.");
      return;
    }
    if (!(await ensureLocationPerm())) return;
    h.medium();
    try {
      const pos = await getCurrentLocation();
      if ((pos.coords as any).mocked) {
        h.error();
        Alert.alert("Mock location detected", "Disable mock locations and try again.");
        return;
      }
      const d = haversine(
        { lat: customer.latitude, lon: customer.longitude },
        { lat: pos.coords.latitude, lon: pos.coords.longitude }
      );
      setDistance(d);
      if (d > RADIUS) {
        h.warning();
        Alert.alert("Too far", `You're ${d.toFixed(0)} m away. Please move within ${RADIUS} m of the customer.`);
        return;
      }
      router.push({
        pathname: "/camera",
        params: {
          code: customer.customer_code,
          name: customer.customer_name,
          lat: String(pos.coords.latitude),
          lon: String(pos.coords.longitude),
          dist: String(d),
        },
      });
    } catch (e: any) {
      Alert.alert("GPS error", e?.message || "Couldn't read location");
    }
  };

  if (loading || !customer) {
    return (
      <SafeAreaView style={S.screen} edges={["top"]}>
        <View style={{ padding: 48, alignItems: "center" }}>
          <ActivityIndicator color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const outOfRange = distance != null && distance > RADIUS;
  const canCapture = customer.location_locked && !outOfRange;

  return (
    <SafeAreaView style={[S.screen, { backgroundColor: C.bg }]} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Hero */}
        <ImageBackground
          source={{ uri: shelfFor(customer.customer_code) }}
          style={{ height: 220 }}
          imageStyle={{ opacity: 0.7 }}
        >
          <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.45)" }} />
          <View style={{ flex: 1, padding: 16, justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <TouchableOpacity
                onPress={() => { h.tap(); router.back(); }}
                testID="back-btn"
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="arrow-back" size={22} color={C.text} />
              </TouchableOpacity>
              <View style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 }, statusStyle(customer.status)]}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: statusTextColor(customer.status) }}>
                  {customer.status.replace("_", " ")}
                </Text>
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600", letterSpacing: 0.4 }}>
                {customer.customer_code} · Route {customer.route_code || "—"}
              </Text>
              <Text style={{ color: "#fff", fontSize: 26, fontWeight: "800", letterSpacing: -0.5, lineHeight: 30 }}>
                {customer.customer_name}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: customer.location_locked ? "rgba(16,185,129,0.95)" : "rgba(255,77,79,0.95)",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Ionicons name={customer.location_locked ? "lock-closed" : "lock-open"} size={11} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
                    {customer.location_locked ? "GPS locked" : "GPS not set"}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.55)", flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="images" size={11} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
                    {photos.length} photo{photos.length !== 1 ? "s" : ""}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </ImageBackground>

        <View style={{ padding: 16, gap: 14 }}>
          <DistanceGauge distance={distance} />

          {/* GPS card */}
          <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.borderSoft, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="location" size={18} color={C.primary} />
                </View>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>Customer coordinates</Text>
                  <Text style={{ fontSize: 11, color: C.textMuted }}>
                    {customer.location_locked ? "Locked from ERP / first visit" : "Awaiting first lock"}
                  </Text>
                </View>
              </View>
            </View>

            {customer.latitude != null && customer.longitude != null ? (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1, padding: 10, backgroundColor: C.bgSubtle, borderRadius: 10 }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 0.5 }}>LATITUDE</Text>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: C.text, marginTop: 2 }}>{customer.latitude.toFixed(6)}</Text>
                </View>
                <View style={{ flex: 1, padding: 10, backgroundColor: C.bgSubtle, borderRadius: 10 }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 0.5 }}>LONGITUDE</Text>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: C.text, marginTop: 2 }}>{customer.longitude.toFixed(6)}</Text>
                </View>
              </View>
            ) : (
              <View style={{ padding: 14, backgroundColor: "#FFF7ED", borderRadius: 10, borderWidth: 1, borderColor: "#FED7AA", flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="warning" size={18} color={C.orange} />
                <Text style={{ flex: 1, fontSize: 13, color: "#9A3412", fontWeight: "500" }}>
                  Visit the store and tap “Lock GPS” to set coordinates. This can only be done once.
                </Text>
              </View>
            )}

            {/* Mini map */}
            {customer.latitude != null && customer.longitude != null && (
              <View style={{ height: 140, borderRadius: 12, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: C.borderSoft, position: "relative", overflow: "hidden" }}>
                {[...Array(8)].map((_, i) => (
                  <View key={`h${i}`} style={{ position: "absolute", left: 0, right: 0, top: (i + 1) * 16, height: 1, backgroundColor: "#E5E7EB" }} />
                ))}
                {[...Array(20)].map((_, i) => (
                  <View key={`v${i}`} style={{ position: "absolute", top: 0, bottom: 0, left: i * 32, width: 1, backgroundColor: "#E5E7EB" }} />
                ))}
                {[120, 80, 40].map((s, idx) => (
                  <View
                    key={`ring${idx}`}
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      marginLeft: -s / 2,
                      marginTop: -s / 2,
                      width: s,
                      height: s,
                      borderRadius: s / 2,
                      borderWidth: 1,
                      borderColor: idx === 2 ? "rgba(27,67,255,0.5)" : "rgba(27,67,255,0.2)",
                    }}
                  />
                ))}
                <View style={{ position: "absolute", left: "50%", top: "50%", marginLeft: -10, marginTop: -10, width: 20, height: 20, borderRadius: 10, backgroundColor: C.red, borderWidth: 3, borderColor: "#fff" }} />
                <View style={{ position: "absolute", top: 8, left: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: "#fff", borderWidth: 1, borderColor: C.borderSoft }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: C.text }}>{RADIUS} m radius</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              onPress={checkDistance}
              disabled={gpsBusy || customer.latitude == null}
              testID="check-distance-btn"
              style={{
                paddingVertical: 13,
                borderRadius: 12,
                backgroundColor: C.bgInk,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
                opacity: gpsBusy || customer.latitude == null ? 0.5 : 1,
              }}
            >
              {gpsBusy ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="navigate" size={16} color="#fff" />}
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                {gpsBusy ? "Reading GPS…" : "Check distance"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Photo grid */}
          <View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>Uploaded photos</Text>
              {photos.length > 0 && (
                <Text style={{ fontSize: 11, fontWeight: "600", color: C.textMuted }}>{photos.length} total</Text>
              )}
            </View>
            {photos.length === 0 ? (
              <View style={{ alignItems: "center", padding: 30, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.borderSoft, gap: 10 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.bgSubtle, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="camera-outline" size={28} color={C.textMuted} />
                </View>
                <Text style={{ fontSize: 14, color: C.text, fontWeight: "600" }}>No photos yet</Text>
                <Text style={{ fontSize: 12, color: C.textMuted, textAlign: "center" }}>
                  Get within {RADIUS} m and capture a shelf photo.
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {photos.map((p) => (
                  <View key={p.id} testID={`photo-${p.id}`} style={{ width: PHOTO_W, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderSoft, overflow: "hidden" }}>
                    <View style={{ position: "relative" }}>
                      <Image source={{ uri: `data:image/jpeg;base64,${p.photo_base64}` }} style={{ width: "100%", height: PHOTO_W, backgroundColor: "#000" }} resizeMode="cover" />
                      {p.ai_score && typeof p.ai_score.shelf_share_pct === "number" && (
                        <View style={{ position: "absolute", top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: "rgba(16,185,129,0.95)", flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <Ionicons name="sparkles" size={10} color="#fff" />
                          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{p.ai_score.shelf_share_pct}%</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ padding: 8, gap: 2 }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: C.green }}>● {p.distance.toFixed(1)} m</Text>
                      <Text style={{ fontSize: 10, color: C.textMuted }}>
                        {new Date(p.upload_date).toLocaleDateString()} · {new Date(p.upload_date).toLocaleTimeString().slice(0, 5)}
                      </Text>
                      {p.ai_score?.quality && (
                        <Text style={{ fontSize: 10, color: C.textSecondary, fontWeight: "600" }}>
                          AI: {p.ai_score.quality} · {p.ai_score.product_visibility}
                        </Text>
                      )}
                      {p.ai_feedback?.text && (
                        <TouchableOpacity
                          testID={`feedback-${p.id}`}
                          onPress={() => { h.light(); Alert.alert("Coach tip", p.ai_feedback!.text); }}
                          style={{ marginTop: 4, padding: 6, borderRadius: 8, backgroundColor: C.yellowSoft, flexDirection: "row", gap: 4 }}
                        >
                          <Ionicons name="sparkles" size={10} color="#92670B" style={{ marginTop: 1 }} />
                          <Text style={{ flex: 1, fontSize: 10, lineHeight: 14, color: "#92670B", fontWeight: "600" }} numberOfLines={3}>
                            {p.ai_feedback.text}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Sticky bottom actions */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 14, paddingBottom: 22, backgroundColor: "rgba(250,250,247,0.96)", borderTopWidth: 1, borderTopColor: C.borderSoft }}>
        {!customer.location_locked ? (
          <TouchableOpacity
            onPress={onConfirmLocation}
            disabled={busy}
            testID="confirm-location-btn"
            style={{
              minHeight: 56,
              borderRadius: 14,
              backgroundColor: C.yellow,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 10,
              opacity: busy ? 0.5 : 1,
            }}
          >
            {busy ? <ActivityIndicator color={C.text} /> : <Ionicons name="lock-closed" size={20} color={C.text} />}
            <Text style={{ color: C.text, fontWeight: "700", fontSize: 15 }}>
              {busy ? "Locking…" : "Lock GPS at this spot"}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={onTakePhoto}
            disabled={!canCapture}
            testID="take-photo-btn"
            style={{
              minHeight: 56,
              borderRadius: 14,
              backgroundColor: canCapture ? C.primary : C.bgMuted,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 10,
            }}
          >
            <Ionicons name="camera" size={22} color={canCapture ? "#fff" : C.textMuted} />
            <Text style={{ color: canCapture ? "#fff" : C.textMuted, fontWeight: "700", fontSize: 16, letterSpacing: 0.3 }}>
              {outOfRange ? `Move closer (${distance?.toFixed(0)} m away)` : "Capture shelf photo"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
