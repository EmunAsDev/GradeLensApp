import * as SecureStore from "expo-secure-store";

const DEVICE_UUID_KEY = "gradelens_device_uuid";

const PRIVATE_KEY_KEY = "gradelens_device_private_key";

const PUBLIC_KEY_KEY = "gradelens_device_public_key";

export async function getDeviceUuid(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_UUID_KEY);
}

export async function saveDeviceUuid(uuid: string): Promise<void> {
  await SecureStore.setItemAsync(DEVICE_UUID_KEY, uuid);
}

export async function getPrivateKey(): Promise<string | null> {
  return SecureStore.getItemAsync(PRIVATE_KEY_KEY);
}

export async function savePrivateKey(privateKey: string): Promise<void> {
  await SecureStore.setItemAsync(PRIVATE_KEY_KEY, privateKey);
}

export async function getPublicKey(): Promise<string | null> {
  return SecureStore.getItemAsync(PUBLIC_KEY_KEY);
}

export async function savePublicKey(publicKey: string): Promise<void> {
  await SecureStore.setItemAsync(PUBLIC_KEY_KEY, publicKey);
}
