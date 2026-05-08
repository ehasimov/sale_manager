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
import * as h from "../src/haptics";

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState("rep01");
  const [password, setPassword] = useState("Rep@2026");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 520, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(slide, { toValue: 0, duration: 600, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start();
  }, [fade, slide]);

  const onSubmit = async () => {
    setError(null);
    if (!username.trim() || !password) {
      setError("Please enter username and password.");
      h.warning();
      return;
    }
    setLoading(true);
    h.light();
    try {
      await login(username.trim(), password);
      h.success();
      router.replace("/(tabs)/customers");
    } catch (e: any) {
      h.error();
      setError(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const fillRep = () => {
    h.tap();
    setUsername("rep01");
    setPassword("Rep@2026");
  };
  const fillAdmin = () => {
    h.tap();
    setUsername("admin");
    setPassword("Admin@2026");
  };

  return (
    <SafeAreaView style={[S.screen, { backgroundColor: C.bgInk }]} edges={["top", "bottom"]}>
      <ImageBackground
        source={{ uri: ASSETS.loginBackground }}
        style={{ flex: 1 }}
        resizeMode="cover"
        imageStyle={{ opacity: 0.18 }}
      >
        <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(10,10,12,0.78)" }} />

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ padding: 22, gap: 22, flexGrow: 1, justifyContent: "space-between" }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Top status bar */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.green }} />
                <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "600", letterSpacing: 0.4 }}>
                  System online
                </Text>
              </View>
              <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: "500" }}>
                v1.0
              </Text>
            </View>

            {/* Hero */}
            <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }], gap: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    backgroundColor: C.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: C.primary,
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.45,
                    shadowRadius: 18,
                  }}
                >
                  <Ionicons name="storefront" size={26} color="#fff" />
                </View>
                <View>
                  <Text style={{ color: C.yellow, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 }}>
                    FIELD OPS
                  </Text>
                  <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.5 }}>
                    Shelf Control
                  </Text>
                </View>
              </View>
              <Text style={{ color: "#fff", fontSize: 34, fontWeight: "800", letterSpacing: -1.2, lineHeight: 38 }}>
                Capture every shelf,{" "}
                <Text style={{ color: C.yellow }}>at the right place</Text>.
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 21 }}>
                GPS-locked photo verification within 30 metres of every customer. Works offline. Anti-spoof built-in.
              </Text>
            </Animated.View>

            {/* Form */}
            <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }], gap: 12 }}>
              <View
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  padding: 16,
                  gap: 12,
                }}
              >
                <View style={{ gap: 6 }}>
                  <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" }}>
                    Username
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 14 }}>
                    <Ionicons name="person-outline" size={18} color={C.textMuted} />
                    <TextInput
                      testID="login-username-input"
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={{ flex: 1, paddingVertical: 14, fontSize: 16, color: C.text, fontWeight: "500" }}
                      placeholder="rep01"
                      placeholderTextColor="#A1A1AA"
                    />
                  </View>
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" }}>
                    Password
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 14 }}>
                    <Ionicons name="lock-closed-outline" size={18} color={C.textMuted} />
                    <TextInput
                      testID="login-password-input"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPw}
                      style={{ flex: 1, paddingVertical: 14, fontSize: 16, color: C.text, fontWeight: "500" }}
                      placeholder="••••••••"
                      placeholderTextColor="#A1A1AA"
                    />
                    <TouchableOpacity onPress={() => { h.tap(); setShowPw((v) => !v); }} hitSlop={10}>
                      <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={20} color={C.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>

                {error && (
                  <View testID="login-error" style={{ backgroundColor: "rgba(255,77,79,0.12)", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,77,79,0.4)", flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="alert-circle" size={18} color={C.red} />
                    <Text style={{ color: "#FFB3B3", fontWeight: "600", flex: 1 }}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  testID="login-submit-btn"
                  onPress={onSubmit}
                  disabled={loading}
                  activeOpacity={0.85}
                  style={{
                    minHeight: 54,
                    borderRadius: 12,
                    backgroundColor: C.yellow,
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 8,
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: C.text, fontWeight: "700", fontSize: 16, letterSpacing: 0.3 }}>
                    {loading ? "Signing in..." : "Sign in"}
                  </Text>
                  {!loading && <Ionicons name="arrow-forward" size={20} color={C.text} />}
                </TouchableOpacity>
              </View>

              {/* Quick fill chips */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity onPress={fillRep} style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" }}>
                  <Text style={{ color: C.yellow, fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>SALES REP</Text>
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600", marginTop: 2 }}>rep01 · Rep@2026</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={fillAdmin} style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" }}>
                  <Text style={{ color: C.red, fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>ADMIN</Text>
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600", marginTop: 2 }}>admin · Admin@2026</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ImageBackground>
    </SafeAreaView>
  );
}
