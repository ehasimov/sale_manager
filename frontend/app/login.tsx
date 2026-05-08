import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Easing,
  ImageBackground,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/auth";
import { S, C } from "../src/theme";
import { ASSETS } from "../src/assets";

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState("rep01");
  const [password, setPassword] = useState("Rep@2026");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(slide, { toValue: 0, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start();
  }, [fade, slide]);

  const onSubmit = async () => {
    setError(null);
    if (!username.trim() || !password) {
      setError("Username and password required");
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
      router.replace("/(tabs)/customers");
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[S.screen, { backgroundColor: "#000" }]} edges={["top", "bottom"]}>
      <ImageBackground
        source={{ uri: ASSETS.loginBackground }}
        style={{ flex: 1 }}
        resizeMode="cover"
        imageStyle={{ opacity: 0.45 }}
      >
        <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.55)" }} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 24, gap: 18, flexGrow: 1, justifyContent: "space-between" }}>
            {/* Top bar */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 10, height: 10, backgroundColor: C.green, borderWidth: 2, borderColor: "#fff" }} />
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1.5, fontFamily: "Courier" }}>
                  SYS · ONLINE
                </Text>
              </View>
              <Text style={{ color: "#fff", fontFamily: "Courier", fontSize: 11, opacity: 0.7 }}>
                v1.0 · BAKU OPS
              </Text>
            </View>

            {/* Hero */}
            <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }], gap: 8 }}>
              <Text style={{ color: C.yellow, fontSize: 11, fontWeight: "900", letterSpacing: 3, fontFamily: "Courier" }}>
                ◢ FIELD MERCHANDISING SUITE
              </Text>
              <Text style={{ color: "#fff", fontSize: 56, fontWeight: "900", letterSpacing: -3, lineHeight: 56 }}>
                SHELF
              </Text>
              <Text style={{ color: "#fff", fontSize: 56, fontWeight: "900", letterSpacing: -3, lineHeight: 56 }}>
                CTRL<Text style={{ color: C.primary }}>.</Text>
              </Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                <View style={{ backgroundColor: C.yellow, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 2, borderColor: "#fff" }}>
                  <Text style={{ fontSize: 10, fontWeight: "900", letterSpacing: 1, color: "#000" }}>30M GPS LOCK</Text>
                </View>
                <View style={{ backgroundColor: C.primary, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 2, borderColor: "#fff" }}>
                  <Text style={{ fontSize: 10, fontWeight: "900", letterSpacing: 1, color: "#fff" }}>OFFLINE READY</Text>
                </View>
                <View style={{ backgroundColor: C.red, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 2, borderColor: "#fff" }}>
                  <Text style={{ fontSize: 10, fontWeight: "900", letterSpacing: 1, color: "#fff" }}>ANTI-SPOOF</Text>
                </View>
              </View>
            </Animated.View>

            {/* Form card */}
            <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }], gap: 12 }}>
              <View style={[S.card, { gap: 14, backgroundColor: "#fff" }]}>
                <View style={{ gap: 6 }}>
                  <Text style={S.label}>Username</Text>
                  <TextInput
                    testID="login-username-input"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={S.input}
                    placeholder="rep01"
                    placeholderTextColor="#A1A1AA"
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={S.label}>Password</Text>
                  <TextInput
                    testID="login-password-input"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    style={S.input}
                    placeholder="••••••••"
                    placeholderTextColor="#A1A1AA"
                  />
                </View>

                {error && (
                  <View testID="login-error" style={{ backgroundColor: C.red, padding: 10, borderWidth: 2, borderColor: C.border }}>
                    <Text style={{ color: "#fff", fontWeight: "800" }}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  testID="login-submit-btn"
                  onPress={onSubmit}
                  disabled={loading}
                  style={[S.btn, S.btnPrimary, loading && S.btnDisabled]}
                  activeOpacity={0.85}
                >
                  <Ionicons name="log-in" size={18} color="#fff" />
                  <Text style={S.btnPrimaryText}>{loading ? "Authenticating..." : "Authenticate"}</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1, padding: 8, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 2, borderColor: "rgba(255,255,255,0.4)" }}>
                  <Text style={{ color: C.yellow, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }}>REP</Text>
                  <Text style={{ color: "#fff", fontFamily: "Courier", fontSize: 12, marginTop: 2 }}>rep01 / Rep@2026</Text>
                </View>
                <View style={{ flex: 1, padding: 8, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 2, borderColor: "rgba(255,255,255,0.4)" }}>
                  <Text style={{ color: C.red, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }}>ADMIN</Text>
                  <Text style={{ color: "#fff", fontFamily: "Courier", fontSize: 12, marginTop: 2 }}>admin / Admin@2026</Text>
                </View>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ImageBackground>
    </SafeAreaView>
  );
}
