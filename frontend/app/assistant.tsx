import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, useAuth } from "../src/auth";
import { C } from "../src/theme";
import * as h from "../src/haptics";
import { cleanAiText, streamSSE, useAiModel } from "../src/ai";
import { ModelPicker } from "../src/ModelPicker";

type Msg = { id: string; role: "user" | "assistant"; content: string; model?: string | null; created_at: string; streaming?: boolean };

const SUGGESTIONS_REP = [
  "Bu həftə hansı müştərilərim gecikib?",
  "Bu gün hansı ziyarətləri planlaşdırım?",
  "Rəf payım ən aşağı olan mağazalar hansılardır?",
];
const SUGGESTIONS_ADMIN = [
  "Bu həftə komandanın vəziyyəti necədir?",
  "Hansı nümayəndə geridə qalır?",
  "Saxta GPS və kilidlənməmiş lokasiya riskləri varmı?",
];

const shortModel = (m?: string | null) => (m ? m.replace("claude-", "").replace(/-\d{8}$/, "").replace(/-/g, " ") : "");

export default function Assistant() {
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const isAdmin = user?.role === "admin";
  const [model, setModel] = useAiModel();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const hist = await api<Msg[]>("/api/ai/chat/history", { token });
      setMessages(hist);
    } catch (e: any) {
      Alert.alert("Couldn't load chat", e?.message || "Please try again");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const scrollToEnd = () => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || !token || sending) return;
    h.tap();
    setInput("");
    setSending(true);
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: msg, created_at: new Date().toISOString() };
    const draftId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, userMsg, { id: draftId, role: "assistant", content: "", created_at: new Date().toISOString(), streaming: true }]);
    scrollToEnd();
    try {
      await streamSSE(
        "/api/ai/chat",
        token,
        { message: msg, model },
        {
          onDelta: (t) => {
            setMessages((prev) => prev.map((m) => (m.id === draftId ? { ...m, content: m.content + t } : m)));
            scrollToEnd();
          },
          onDone: (d) => {
            setMessages((prev) => prev.map((m) => (m.id === draftId ? { ...m, id: d.id || m.id, model: d.model, streaming: false } : m)));
          },
        }
      );
      h.success();
    } catch (e: any) {
      h.error();
      setMessages((prev) => prev.filter((m) => m.id !== draftId));
      Alert.alert("AI error", e?.message || "Please try again");
    } finally {
      setSending(false);
      scrollToEnd();
    }
  };

  const clear = () => {
    Alert.alert("Clear conversation?", "Your chat history with the assistant will be deleted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          try {
            await api("/api/ai/chat/history", { method: "DELETE", token });
            setMessages([]);
            h.success();
          } catch (e: any) {
            Alert.alert("Couldn't clear", e?.message || "Please try again");
          }
        },
      },
    ]);
  };

  const suggestions = isAdmin ? SUGGESTIONS_ADMIN : SUGGESTIONS_REP;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={["top"]}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: C.borderSoft, backgroundColor: C.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity
            onPress={() => {
              h.light();
              router.back();
            }}
            testID="assistant-back"
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderSoft, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: C.text, letterSpacing: -0.4 }}>AI Assistant</Text>
            <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: "600" }}>Claude · knows this week&apos;s visits & shelf scores</Text>
          </View>
          {messages.length > 0 && (
            <TouchableOpacity
              onPress={clear}
              testID="assistant-clear"
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="trash-outline" size={19} color={C.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <ModelPicker value={model} onChange={setModel} disabled={sending} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="translate-with-padding"
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {loading ? (
            <View style={{ padding: 36, alignItems: "center" }}>
              <ActivityIndicator color={C.primary} />
            </View>
          ) : messages.length === 0 ? (
            <View style={{ gap: 14, paddingTop: 10 }}>
              <View style={{ backgroundColor: C.bgInk, borderRadius: 18, padding: 18, gap: 8 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="sparkles" size={20} color={C.yellow} />
                </View>
                <Text style={{ color: C.textInverse, fontSize: 18, fontWeight: "800", letterSpacing: -0.4 }}>Ask about your week</Text>
                <Text style={{ color: C.textOnDarkMuted, fontSize: 13, lineHeight: 19 }}>
                  I can see your customers, visit plan, overdue stores and the AI shelf scores from your photos. Ask in any language.
                </Text>
              </View>
              <Text style={{ fontSize: 11, fontWeight: "700", color: C.textMuted, letterSpacing: 1, textTransform: "uppercase" }}>Try asking</Text>
              {suggestions.map((s) => (
                <TouchableOpacity
                  key={s}
                  testID="assistant-suggestion"
                  onPress={() => send(s)}
                  style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.borderSoft, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={C.primary} />
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: C.text }}>{s}</Text>
                  <Ionicons name="arrow-forward" size={14} color={C.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            messages.map((m) => <Bubble key={m.id} msg={m} />)
          )}
        </ScrollView>

        {/* Input bar */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 8,
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: C.bg,
            borderTopWidth: 1,
            borderTopColor: C.borderSoft,
          }}
        >
          <TextInput
            testID="assistant-input"
            value={input}
            onChangeText={setInput}
            placeholder="Ask the assistant…"
            placeholderTextColor={C.textMuted}
            multiline
            maxLength={2000}
            editable={!sending}
            style={{
              flex: 1,
              minHeight: 46,
              maxHeight: 120,
              backgroundColor: C.surface,
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: C.border,
              paddingHorizontal: 14,
              paddingVertical: Platform.OS === "ios" ? 12 : 8,
              fontSize: 15,
              color: C.text,
            }}
          />
          <TouchableOpacity
            testID="assistant-send"
            onPress={() => send(input)}
            disabled={sending || !input.trim()}
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: sending || !input.trim() ? C.bgMuted : C.primary,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1.5,
              borderColor: sending || !input.trim() ? C.borderSoft : C.border,
            }}
          >
            {sending ? <ActivityIndicator color={C.textSecondary} size="small" /> : <Ionicons name="arrow-up" size={20} color={C.textInverse} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const mine = msg.role === "user";
  return (
    <View testID={`msg-${msg.role}`} style={{ flexDirection: "row", justifyContent: mine ? "flex-end" : "flex-start", gap: 8 }}>
      {!mine && (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.bgInk, alignItems: "center", justifyContent: "center", marginTop: 2 }}>
          <Ionicons name="sparkles" size={13} color={C.yellow} />
        </View>
      )}
      <View
        style={{
          maxWidth: "82%",
          backgroundColor: mine ? C.primary : C.surface,
          borderRadius: 18,
          borderBottomRightRadius: mine ? 6 : 18,
          borderBottomLeftRadius: mine ? 18 : 6,
          borderWidth: mine ? 0 : 1,
          borderColor: C.borderSoft,
          paddingHorizontal: 14,
          paddingVertical: 10,
          gap: 4,
        }}
      >
        {msg.streaming && !msg.content ? (
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center", paddingVertical: 4 }}>
            <ActivityIndicator size="small" color={C.primary} />
            <Text style={{ fontSize: 12, color: C.textMuted, fontWeight: "600" }}>Thinking…</Text>
          </View>
        ) : (
          <Text style={{ fontSize: 15, lineHeight: 21, color: mine ? C.textInverse : C.text, fontWeight: mine ? "600" : "500" }}>
            {cleanAiText(msg.content)}
          </Text>
        )}
        {!mine && !msg.streaming && msg.model ? (
          <Text style={{ fontSize: 10, color: C.textMuted, fontWeight: "600" }}>{shortModel(msg.model)}</Text>
        ) : null}
      </View>
    </View>
  );
}
