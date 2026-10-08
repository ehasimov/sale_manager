import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch as expoFetch } from "expo/fetch";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";

export const CLAUDE_MODELS = [
  { key: "sonnet-5.5", label: "Sonnet 5.5", hint: "Best quality" },
  { key: "sonnet-5", label: "Sonnet 5", hint: "Balanced" },
  { key: "haiku-4.5", label: "Haiku 4.5", hint: "Fastest" },
] as const;

export type ModelKey = (typeof CLAUDE_MODELS)[number]["key"];

const MODEL_KEY = "merch.aiModel";

/** Persisted Claude model preference shared by the assistant chat and report summary. */
export function useAiModel(): [ModelKey, (m: ModelKey) => void] {
  const [model, setModelState] = useState<ModelKey>("sonnet-5.5");
  useEffect(() => {
    AsyncStorage.getItem(MODEL_KEY).then((v) => {
      if (v && CLAUDE_MODELS.some((m) => m.key === v)) setModelState(v as ModelKey);
    });
  }, []);
  const setModel = useCallback((m: ModelKey) => {
    setModelState(m);
    AsyncStorage.setItem(MODEL_KEY, m);
  }, []);
  return [model, setModel];
}

type SseHandlers = {
  onDelta: (text: string) => void;
  onMeta?: (data: any) => void;
  onDone?: (data: any) => void;
};

/** POST + consume a server-sent-events stream from the backend. Resolves when the stream ends; throws on HTTP/stream errors. */
export async function streamSSE(path: string, token: string, body: object, handlers: SseHandlers, signal?: AbortSignal) {
  const res = await expoFetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text();
    let msg = `Request failed (${res.status})`;
    try {
      const d = JSON.parse(txt);
      if (typeof d?.detail === "string") msg = d.detail;
    } catch {}
    throw new Error(msg);
  }
  if (!res.body) throw new Error("Streaming is not supported here");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const handleBlock = (block: string) => {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data) return;
    let parsed: any = {};
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (event === "delta") handlers.onDelta(parsed.text || "");
    else if (event === "meta") handlers.onMeta?.(parsed);
    else if (event === "done") handlers.onDone?.(parsed);
    else if (event === "error") throw new Error(parsed.message || "AI error");
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      handleBlock(block);
    }
  }
  if (buf.trim()) handleBlock(buf);
}

/** Claude is asked for plain text, but strip stray markdown bold/italics just in case. */
export const cleanAiText = (t: string) => t.replace(/\*\*(.*?)\*\*/g, "$1").replace(/^#+\s*/gm, "");
