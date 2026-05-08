import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth";
import { View, ActivityIndicator } from "react-native";
import { C } from "../../src/theme";

export default function TabsLayout() {
  const { user } = useAuth();
  if (user === undefined) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.textMuted,
        tabBarStyle: {
          backgroundColor: "rgba(255,255,255,0.96)",
          borderTopWidth: 1,
          borderTopColor: C.borderSoft,
          height: 74,
          paddingBottom: 14,
          paddingTop: 10,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
      }}
    >
      <Tabs.Screen
        name="customers"
        options={{
          title: "Routes",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "storefront" : "storefront-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "stats-chart" : "stats-chart-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          href: user.role === "admin" ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "shield-checkmark" : "shield-checkmark-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
