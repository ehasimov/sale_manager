import { useCallback, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { api, useAuth } from "../../src/auth";
import { S, C, statusStyle } from "../../src/theme";
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

type Photo = {
  id: string;
  upload_date: string;
  latitude: number;
  longitude: number;
  distance: number;
  photo_base64: string;
  username?: string | null;
};

const RADIUS = 30;

const haversine = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
};

const SCREEN_W = Dimensions.get("window").width;
const PHOTO_W = (SCREEN_W - 16 * 2 - 8) / 2;

function DistanceGauge({ distance }: { distance: number | null }) {
  if (distance == null) {
    return (
      <View style={{ alignItems: "center", padding: 18, borderWidth: 2, borderColor: C.border, backgroundColor: C.bgSubtle }}>
        <Text style={{ fontFamily: "Courier", fontSize: 12, color: C.textSecondary, fontWeight: "700", letterSpacing: 1 }}>
          ⌖ TAP "CHECK MY DISTANCE"
        </Text>
      </View>
    );
  }
  const inRange = distance <= RADIUS;
  const pct = Math.min(100, (distance / RADIUS) * 100);
  return (
    <View style={{ borderWidth: 2, borderColor: C.border, backgroundColor: inRange ? "#003300" : "#330000", padding: 16, gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <View>
          <Text style={{ fontSize: 9, fontWeight: "900", letterSpacing: 2, color: inRange ? C.green : C.red, fontFamily: "Courier" }}>
            {inRange ? "◉ IN RANGE" : "✕ OUT OF RANGE"}
          </Text>
          <Text style={{ fontSize: 56, fontWeight: "900", color: "#fff", letterSpacing: -3, lineHeight: 56 }}>
            {distance.toFixed(0)}
            <Text style={{ fontSize: 20 }}>m</Text>
          </Text>
          <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontFamily: "Courier", marginTop: 2 }}>
            LIMIT · {RADIUS}m
          </Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <View
            style={{
              width: 84,
              height: 84,
              borderWidth: 3,
              borderColor: inRange ? C.green : C.red,
              backgroundColor: inRange ? "rgba(0,195,0,0.15)" : "rgba(255,59,48,0.15)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name={inRange ? "checkmark-sharp" : "warning"} size={44} color={inRange ? C.green : C.red} />
          </View>
        </View>
      </View>
      <View style={{ height: 8, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" }}>
        <View style={{ width: `${pct}%`, height: "100%", backgroundColor: inRange ? C.green : C.red }} />
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
      Alert.alert("Error", e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [code, token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const ensureLocationPerm = async (): Promise<boolean> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Location permission is required to verify your position near the customer.");
      return false;
    }
    return true;
  };

  const getCurrentLocation = async () => {
    return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  };

  const checkDistance = async () => {
    if (!customer?.latitude || !customer?.longitude) return;
    if (!(await ensureLocationPerm())) return;
    setGpsBusy(true);
    try {
      const pos = await getCurrentLocation();
      const d = haversine(
        { lat: customer.latitude, lon: customer.longitude },
        { lat: pos.coords.latitude, lon: pos.coords.longitude }
      );
      setDistance(d);
    } catch (e: any) {
      Alert.alert("GPS error", e?.message || "Could not read location");
    } finally {
      setGpsBusy(false);
    }
  };

  const onConfirmLocation = async () => {
    if (!(await ensureLocationPerm())) return;
    setBusy(true);
    try {
      const pos = await getCurrentLocation();
      if ((pos.coords as any).mocked) {
        Alert.alert("Fake GPS detected", "Mock locations are not allowed.");
        setBusy(false);
        return;
      }
      Alert.alert(
        "Confirm location?",
        `This LOCKS the customer location and CANNOT be changed by the app again.\n\nLat: ${pos.coords.latitude.toFixed(6)}\nLng: ${pos.coords.longitude.toFixed(6)}`,
        [
          { text: "Cancel", style: "cancel", onPress: () => setBusy(false) },
          {
            text: "Lock Location",
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
                Alert.alert("Locked", "Customer location is now locked.");
              } catch (e: any) {
                Alert.alert("Error", e?.message || "Failed to confirm location");
              } finally {
                setBusy(false);
              }
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("GPS error", e?.message || "Could not read location");
      setBusy(false);
    }
  };

  const onTakePhoto = async () => {
    if (!customer?.latitude || !customer?.longitude) {
      Alert.alert("Location not set", "Customer location must be set before taking photos.");
      return;
    }
    if (!(await ensureLocationPerm())) return;
    try {
      const pos = await getCurrentLocation();
      if ((pos.coords as any).mocked) {
        Alert.alert("Fake GPS detected", "Mock locations are not allowed.");
        return;
      }
      const d = haversine(
        { lat: customer.latitude, lon: customer.longitude },
        { lat: pos.coords.latitude, lon: pos.coords.longitude }
      );
      setDistance(d);
      if (d > RADIUS) {
        Alert.alert(
          "Out of range",
          `You are ${d.toFixed(0)} m away.\nThis location is outside allowed customer range. Please move closer (within ${RADIUS} m).`
        );
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
      Alert.alert("GPS error", e?.message || "Could not read location");
    }
  };

  if (loading || !customer) {
    return (
      <SafeAreaView style={S.screen} edges={["top"]}>
        <View style={{ padding: 24, alignItems: "center" }}>
          <ActivityIndicator color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const inRange = distance != null && distance <= RADIUS;
  const outOfRange = distance != null && distance > RADIUS;

  return (
    <SafeAreaView style={[S.screen, { backgroundColor: "#0A0A0A" }]} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Hero */}
        <ImageBackground
          source={{ uri: shelfFor(customer.customer_code) }}
          style={{ height: 230 }}
          imageStyle={{ opacity: 0.55 }}
        >
          <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }} />
          <View style={{ flex: 1, padding: 16, justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <TouchableOpacity onPress={() => router.back()} testID="back-btn" style={{ width: 40, height: 40, backgroundColor: "#fff", borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="arrow-back" size={22} color={C.text} />
              </TouchableOpacity>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <View style={[S.badge, statusStyle(customer.status), { borderColor: "#fff" }]}>
                  <Text style={S.badgeText}>{customer.status.replace("_", " ")}</Text>
                </View>
              </View>
            </View>
            <View style={{ gap: 4 }}>
              <Text style={{ color: C.yellow, fontSize: 11, fontWeight: "900", letterSpacing: 2.5, fontFamily: "Courier" }}>
                {customer.customer_code} · ROUTE {customer.route_code || "—"}
              </Text>
              <Text style={{ color: "#fff", fontSize: 32, fontWeight: "900", letterSpacing: -1, lineHeight: 36 }}>
                {customer.customer_name.toUpperCase()}
              </Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderWidth: 2, borderColor: "#fff", backgroundColor: customer.location_locked ? C.green : C.red }}>
                  <Text style={{ fontSize: 10, fontWeight: "900", letterSpacing: 1, color: "#fff" }}>
                    {customer.location_locked ? "🔒 GPS LOCKED" : "🔓 GPS NOT SET"}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderWidth: 2, borderColor: "#fff", backgroundColor: "rgba(0,0,0,0.6)" }}>
                  <Text style={{ fontSize: 10, fontWeight: "900", letterSpacing: 1, color: "#fff", fontFamily: "Courier" }}>
                    {photos.length} PHOTO{photos.length !== 1 ? "S" : ""}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </ImageBackground>

        <View style={{ padding: 16, gap: 14, backgroundColor: "#0A0A0A" }}>
          {/* Distance gauge */}
          <DistanceGauge distance={distance} />

          {/* GPS info card */}
          <View style={{ borderWidth: 2, borderColor: "#fff", backgroundColor: "#000", padding: 14, gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 2, fontFamily: "Courier" }}>
                ◤ ERP TARGET
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{ width: 8, height: 8, backgroundColor: C.green }} />
                <Text style={{ color: C.green, fontSize: 9, fontWeight: "900", letterSpacing: 1.5, fontFamily: "Courier" }}>
                  TRACKING
                </Text>
              </View>
            </View>
            {customer.latitude != null && customer.longitude != null ? (
              <>
                <Text style={{ color: "#fff", fontFamily: "Courier", fontSize: 18, fontWeight: "700", letterSpacing: 1 }}>
                  {customer.latitude.toFixed(6)}
                </Text>
                <Text style={{ color: "#fff", fontFamily: "Courier", fontSize: 18, fontWeight: "700", letterSpacing: 1 }}>
                  {customer.longitude.toFixed(6)}
                </Text>

                {/* Mini map (radar) */}
                <View
                  style={{
                    marginTop: 6,
                    height: 160,
                    backgroundColor: "#0F1F0F",
                    borderWidth: 2,
                    borderColor: C.green,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {/* Grid lines */}
                  {[...Array(10)].map((_, i) => (
                    <View key={`h${i}`} style={{ position: "absolute", left: 0, right: 0, top: i * 16, height: 1, backgroundColor: "rgba(0,195,0,0.15)" }} />
                  ))}
                  {[...Array(20)].map((_, i) => (
                    <View key={`v${i}`} style={{ position: "absolute", top: 0, bottom: 0, left: i * 32, width: 1, backgroundColor: "rgba(0,195,0,0.15)" }} />
                  ))}
                  {/* Concentric range rings (centered) */}
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
                        borderColor: "rgba(0,195,0,0.5)",
                      }}
                    />
                  ))}
                  {/* Cross hairs */}
                  <View style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, backgroundColor: "rgba(0,195,0,0.4)" }} />
                  <View style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, backgroundColor: "rgba(0,195,0,0.4)" }} />
                  {/* Customer pin */}
                  <View style={{ position: "absolute", left: "50%", top: "50%", marginLeft: -8, marginTop: -8, width: 16, height: 16, backgroundColor: C.red, borderWidth: 2, borderColor: "#fff" }} />
                  <Text style={{ position: "absolute", top: 8, left: 8, color: C.green, fontSize: 9, fontWeight: "900", fontFamily: "Courier", letterSpacing: 1 }}>
                    RADAR · {customer.customer_code}
                  </Text>
                  <Text style={{ position: "absolute", bottom: 8, right: 8, color: C.green, fontSize: 9, fontFamily: "Courier" }}>
                    R={RADIUS}m
                  </Text>
                </View>
              </>
            ) : (
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                Not set. The first sales rep on-site can lock the customer location.
              </Text>
            )}

            <TouchableOpacity
              onPress={checkDistance}
              disabled={gpsBusy || customer.latitude == null}
              style={{
                marginTop: 4,
                padding: 12,
                borderWidth: 2,
                borderColor: "#fff",
                backgroundColor: "#fff",
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                opacity: gpsBusy || customer.latitude == null ? 0.5 : 1,
              }}
              testID="check-distance-btn"
            >
              <Ionicons name="navigate" size={16} color={C.text} />
              <Text style={{ color: C.text, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase", fontSize: 12 }}>
                {gpsBusy ? "Reading GPS..." : "Check My Distance"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Action buttons */}
          {!customer.location_locked && (
            <TouchableOpacity
              onPress={onConfirmLocation}
              disabled={busy}
              testID="confirm-location-btn"
              style={{ borderWidth: 2, borderColor: "#fff", backgroundColor: C.yellow, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, opacity: busy ? 0.6 : 1 }}
            >
              <Ionicons name="lock-closed" size={20} color={C.text} />
              <Text style={{ fontSize: 14, fontWeight: "900", letterSpacing: 1.5, color: C.text, textTransform: "uppercase" }}>
                {busy ? "Locking..." : "Confirm & Lock Location"}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={onTakePhoto}
            disabled={!customer.location_locked || outOfRange === true}
            testID="take-photo-btn"
            style={{
              borderWidth: 2,
              borderColor: "#fff",
              backgroundColor: !customer.location_locked || outOfRange === true ? "#3A3A3A" : C.primary,
              padding: 18,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <Ionicons name="camera" size={22} color="#fff" />
            <Text style={{ fontSize: 16, fontWeight: "900", letterSpacing: 2, color: "#fff", textTransform: "uppercase" }}>
              ◉ Capture Shelf
            </Text>
          </TouchableOpacity>

          {/* Photo grid */}
          <View style={{ marginTop: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 2, fontFamily: "Courier" }}>
                ◢ UPLOADED PHOTOS
              </Text>
              <Text style={{ color: C.yellow, fontSize: 11, fontWeight: "900", letterSpacing: 1, fontFamily: "Courier" }}>
                {photos.length} REC
              </Text>
            </View>
            {photos.length === 0 ? (
              <View style={{ alignItems: "center", padding: 28, borderWidth: 2, borderColor: "#fff", backgroundColor: "rgba(255,255,255,0.04)" }}>
                <Ionicons name="images-outline" size={32} color="#fff" />
                <Text style={{ color: "#fff", marginTop: 8, fontSize: 13, fontFamily: "Courier" }}>NO RECORDS YET</Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {photos.map((p) => (
                  <View key={p.id} testID={`photo-${p.id}`} style={{ width: PHOTO_W, borderWidth: 2, borderColor: "#fff", backgroundColor: "#000" }}>
                    <Image
                      source={{ uri: `data:image/jpeg;base64,${p.photo_base64}` }}
                      style={{ width: "100%", height: PHOTO_W, backgroundColor: "#000" }}
                      resizeMode="cover"
                    />
                    <View style={{ padding: 6, gap: 2 }}>
                      <Text style={{ color: C.green, fontFamily: "Courier", fontSize: 9, fontWeight: "900", letterSpacing: 1 }}>
                        ◉ {p.distance.toFixed(1)}m
                      </Text>
                      <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Courier", fontSize: 9 }}>
                        {new Date(p.upload_date).toLocaleDateString()} {new Date(p.upload_date).toLocaleTimeString().slice(0, 5)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
