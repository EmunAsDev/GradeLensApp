import { registerDevice } from "@/api/deviceApi";

import { getOrCreateDeviceKeyPair } from "@/crypto/deviceKeyService";

export async function ensureDeviceRegistered(token: string): Promise<void> {
  const keyPair = await getOrCreateDeviceKeyPair();

  await registerDevice(token, keyPair.deviceUuid, keyPair.publicKey);
}
