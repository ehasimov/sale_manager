import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { C } from "./theme";
import * as h from "./haptics";
import { CLAUDE_MODELS, ModelKey } from "./ai";

type Props = { value: ModelKey; onChange: (m: ModelKey) => void; disabled?: boolean; dark?: boolean };

export function ModelPicker({ value, onChange, disabled, dark }: Props) {
  return (
    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
      {CLAUDE_MODELS.map((m) => {
        const active = value === m.key;
        const bg = active ? (dark ? C.surface : C.text) : dark ? "rgba(255,255,255,0.08)" : C.surface;
        const fg = active ? (dark ? C.text : C.textInverse) : dark ? C.textInverse : C.text;
        return (
          <TouchableOpacity
            key={m.key}
            testID={`model-${m.key}`}
            disabled={disabled}
            onPress={() => {
              h.tap();
              onChange(m.key);
            }}
            style={{
              paddingHorizontal: 11,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: bg,
              borderWidth: 1,
              borderColor: active ? (dark ? C.surface : C.text) : dark ? "rgba(255,255,255,0.18)" : C.borderSoft,
              opacity: disabled ? 0.6 : 1,
              minHeight: 32,
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: fg }}>
              {m.label}
              <Text style={{ fontSize: 10, fontWeight: "600", color: active ? fg : dark ? C.textOnDarkMuted : C.textMuted }}>  {m.hint}</Text>
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
