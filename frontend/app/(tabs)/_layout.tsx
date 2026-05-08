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
        tabBarActiveTintColor: C.yellow,
        tabBarInactiveTintColor: "#A1A1AA",
        tabBarStyle: {
          backgroundColor: "#0A0A0A",
          borderTopWidth: 2,
          borderTopColor: "#fff",
          height: 68,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5, textTransform: "uppercase" },
      }}
    >
      <Tabs.Screen
        name="customers"
        options={{
          title: "Routes",
          tabBarIcon: ({ color, size }) => <Ionicons name="storefront" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          href: user.role === "admin" ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
