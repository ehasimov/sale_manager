import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "merch.offline_queue.v1";

export type QueuedUpload = {
  id: string;
  customer_code: string;
  latitude: number;
  longitude: number;
  device_id: string;
  photo_base64: string;
  is_mocked: boolean;
  created_at: string;
};

export async function readQueue(): Promise<QueuedUpload[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function enqueue(item: QueuedUpload) {
  const q = await readQueue();
  q.push(item);
  await AsyncStorage.setItem(KEY, JSON.stringify(q));
}

export async function removeFromQueue(id: string) {
  const q = await readQueue();
  const next = q.filter((x) => x.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function syncQueue(token: string, backendUrl: string): Promise<{ synced: number; remaining: number }> {
  const q = await readQueue();
  let synced = 0;
  for (const item of q) {
    try {
      const res = await fetch(`${backendUrl}/api/photo/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customer_code: item.customer_code,
          latitude: item.latitude,
          longitude: item.longitude,
          device_id: item.device_id,
          photo_base64: item.photo_base64,
          is_mocked: item.is_mocked,
        }),
      });
      if (res.ok) {
        await removeFromQueue(item.id);
        synced += 1;
      } else if (res.status === 400) {
        // Server rejected (out-of-range or fake gps); drop to avoid permanent loop
        await removeFromQueue(item.id);
      }
    } catch {
      // network still down, stop trying
      break;
    }
  }
  const remaining = (await readQueue()).length;
  return { synced, remaining };
}
