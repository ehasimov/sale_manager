import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Image, Animated, Easing } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import * as Device from "expo-device";
import * as ImageManipulator from "expo-image-manipulator";
import { captureRef } from "react-native-view-shot";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, useAuth } from "../src/auth";
import { S, C } from "../src/theme";
import { enqueue, type QueuedUpload } from "../src/offlineQueue";

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

const DEVICE_ID_KEY = "merch.device_id";

async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    const base = `${Device.osName || "x"}-${Device.modelName || "x"}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    id = base.replace(/\s+/g, "_");
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export default function CameraScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code: string; name: string; lat: string; lon: string; dist: string }>();
  const { user, token } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const previewRef = useRef<View>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [livePos, setLivePos] = useState<{ lat: number; lon: number; mocked: boolean } | null>(null);
  const scan = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(scan, { toValue: 1, duration: 2200, useNativeDriver: true, easing: Easing.linear })
    ).start();
  }, [scan]);

  useEffect(() => {
    let mounted = true;
    let watcher: Location.LocationSubscription | null = null;
    (async () => {
      if (!permission?.granted) {
        const r = await requestPermission();
        if (!r.granted) {
          Alert.alert("Camera permission required", "Please grant camera access.");
          router.back();
          return;
        }
      }
      try {
        watcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 1, timeInterval: 1500 },
          (pos) => {
            if (mounted) setLivePos({ lat: pos.coords.latitude, lon: pos.coords.longitude, mocked: !!(pos.coords as any).mocked });
          }
        );
      } catch {}
    })();
    return () => {
      mounted = false;
      watcher?.remove();
    };
  }, []);

  const liveDistance = livePos ? haversine({ lat: Number(params.lat), lon: Number(params.lon) }, { lat: livePos.lat, lon: livePos.lon }) : null;
  const inRange = liveDistance != null && liveDistance <= RADIUS;

  const watermarkText = () => {
    const now = new Date();
    const lat = livePos?.lat ?? Number(params.lat);
    const lon = livePos?.lon ?? Number(params.lon);
    return {
      l1: now.toLocaleString(),
      l2: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
      l3: `${user?.username || ""} · ${params.code}`,
    };
  };

  const capture = async () => {
    if (!cameraRef.current) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: false });
      if (photo?.uri) {
        const resized = await ImageManipulator.manipulateAsync(photo.uri, [{ resize: { width: 1080 } }], {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        setCapturedUri(resized.uri);
      }
    } catch (e: any) {
      Alert.alert("Capture error", e?.message || "Could not capture photo");
    } finally {
      setBusy(false);
    }
  };

  const retake = () => setCapturedUri(null);

  const upload = async () => {
    if (!capturedUri || !previewRef.current) return;
    setBusy(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const isMocked = !!(pos.coords as any).mocked;
      const d = haversine(
        { lat: Number(params.lat), lon: Number(params.lon) },
        { lat: pos.coords.latitude, lon: pos.coords.longitude }
      );
      const base64 = await captureRef(previewRef as any, {
        format: "jpg",
        quality: 0.7,
        result: "base64",
      });
      const deviceId = await getDeviceId();

      if (d > RADIUS) {
        Alert.alert("Out of range", `You moved away (${d.toFixed(0)} m). Upload blocked.`);
        setBusy(false);
        return;
      }

      try {
        await api(`/api/photo/upload`, {
          method: "POST",
          token,
          body: JSON.stringify({
            customer_code: params.code,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            device_id: deviceId,
            photo_base64: base64,
            is_mocked: isMocked,
          }),
        });
        Alert.alert("Uploaded", "Photo uploaded successfully.");
        router.back();
      } catch (e: any) {
        if (e?.status === 400) {
          Alert.alert("Rejected", e.message || "Upload rejected by server.");
        } else {
          const item: QueuedUpload = {
            id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
            customer_code: String(params.code),
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            device_id: deviceId,
            photo_base64: base64,
            is_mocked: isMocked,
            created_at: new Date().toISOString(),
          };
          await enqueue(item);
          Alert.alert("Saved offline", "No internet. Photo queued and will auto-sync.");
          router.back();
        }
      }
    } catch (e: any) {
      Alert.alert("Upload error", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <SafeAreaView style={S.screen}>
        <View style={{ padding: 24, gap: 12 }}>
          <Text style={S.h2}>Camera Access</Text>
          <TouchableOpacity onPress={requestPermission} style={[S.btn, S.btnPrimary]}>
            <Text style={S.btnPrimaryText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const wm = watermarkText();
  const scanY = scan.interpolate({ inputRange: [0, 1], outputRange: [0, 600] });

  return (
    <SafeAreaView style={[S.screen, { backgroundColor: "#000" }]} edges={["top", "bottom"]}>
      <View style={{ flex: 1 }}>
        {/* Top HUD */}
        <View style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.2)" }}>
          <TouchableOpacity onPress={() => router.back()} testID="camera-close-btn" style={{ width: 36, height: 36, borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ alignItems: "center" }}>
            <Text style={{ color: C.yellow, fontSize: 9, fontWeight: "900", letterSpacing: 2, fontFamily: "Courier" }}>
              ◢ CAPTURE MODE
            </Text>
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "900", letterSpacing: 0.5 }} numberOfLines={1}>
              {params.name}
            </Text>
          </View>
          <View style={{ paddingHorizontal: 6, paddingVertical: 4, backgroundColor: inRange ? C.green : C.red, borderWidth: 2, borderColor: "#fff" }}>
            <Text style={{ fontSize: 10, fontWeight: "900", color: "#fff", letterSpacing: 1, fontFamily: "Courier" }}>
              {liveDistance != null ? `${liveDistance.toFixed(0)}M` : "---"}
            </Text>
          </View>
        </View>

        <View ref={previewRef} collapsable={false} style={{ flex: 1, backgroundColor: "#000" }}>
          {capturedUri ? (
            <Image source={{ uri: capturedUri }} style={{ flex: 1 }} resizeMode="cover" />
          ) : (
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
          )}

          {/* Corner brackets */}
          {!capturedUri && (
            <>
              {[
                { top: 16, left: 16, borderTopWidth: 3, borderLeftWidth: 3 },
                { top: 16, right: 16, borderTopWidth: 3, borderRightWidth: 3 },
                { bottom: 90, left: 16, borderBottomWidth: 3, borderLeftWidth: 3 },
                { bottom: 90, right: 16, borderBottomWidth: 3, borderRightWidth: 3 },
              ].map((s, i) => (
                <View
                  key={i}
                  pointerEvents="none"
                  style={{ position: "absolute", width: 28, height: 28, borderColor: C.yellow, ...s }}
                />
              ))}
              {/* Scanning line */}
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 16,
                  right: 16,
                  height: 2,
                  backgroundColor: "rgba(0,195,0,0.8)",
                  shadowColor: C.green,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 1,
                  shadowRadius: 6,
                  transform: [{ translateY: scanY }],
                }}
              />
              {/* Center crosshair */}
              <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 24, height: 24, borderWidth: 2, borderColor: "#fff", opacity: 0.9 }} />
                <View style={{ position: "absolute", width: 1, height: 60, backgroundColor: "rgba(255,255,255,0.4)" }} />
                <View style={{ position: "absolute", width: 60, height: 1, backgroundColor: "rgba(255,255,255,0.4)" }} />
              </View>
            </>
          )}

          {/* Watermark */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: 12,
              backgroundColor: "rgba(0,0,0,0.78)",
              borderWidth: 2,
              borderColor: C.yellow,
              padding: 10,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Text style={{ color: C.yellow, fontFamily: "Courier", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }}>
                ◢ SHELF CTRL · WATERMARK
              </Text>
              <View style={{ width: 6, height: 6, backgroundColor: livePos?.mocked ? C.red : C.green }} />
            </View>
            <Text style={{ color: "#fff", fontFamily: "Courier", fontSize: 12 }}>{wm.l1}</Text>
            <Text style={{ color: "#fff", fontFamily: "Courier", fontSize: 12 }}>◎ {wm.l2}</Text>
            <Text style={{ color: "#fff", fontFamily: "Courier", fontSize: 12 }}>◉ {wm.l3}</Text>
          </View>
        </View>

        <View style={{ padding: 14, gap: 10, backgroundColor: "#0A0A0A" }}>
          {!capturedUri ? (
            <TouchableOpacity
              testID="capture-btn"
              onPress={capture}
              disabled={busy}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 18, backgroundColor: C.primary, borderWidth: 2, borderColor: "#fff", opacity: busy ? 0.6 : 1 }}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="aperture" size={22} color="#fff" />}
              <Text style={{ color: "#fff", fontWeight: "900", letterSpacing: 2, textTransform: "uppercase", fontSize: 16 }}>
                CAPTURE
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                testID="retake-btn"
                onPress={retake}
                disabled={busy}
                style={{ flex: 1, padding: 16, backgroundColor: "#fff", borderWidth: 2, borderColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.6 : 1 }}
              >
                <Ionicons name="refresh" size={18} color={C.text} />
                <Text style={{ color: C.text, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" }}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="upload-btn"
                onPress={upload}
                disabled={busy}
                style={{ flex: 1, padding: 16, backgroundColor: C.green, borderWidth: 2, borderColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.6 : 1 }}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="cloud-upload" size={18} color="#fff" />}
                <Text style={{ color: "#fff", fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" }}>Upload</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={{ color: "#A1A1AA", textAlign: "center", fontSize: 10, fontFamily: "Courier", letterSpacing: 1 }}>
            ERP {Number(params.lat).toFixed(5)}, {Number(params.lon).toFixed(5)} · LIMIT {RADIUS}m
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
