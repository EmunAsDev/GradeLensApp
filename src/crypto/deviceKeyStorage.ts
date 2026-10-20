import * as SecureStore from "expo-secure-store";

import { getActiveDatabaseEmployeeId } from "../database/database";

const DEVICE_UUID_KEY = "gradelens_device_uuid";
const PRIVATE_KEY_KEY = "gradelens_device_private_key";
const PUBLIC_KEY_KEY = "gradelens_device_public_key";

function getEmployeeScopedKey(baseKey: string): string {
  const employeeId = getActiveDatabaseEmployeeId();

  if (
    employeeId === null ||
    !Number.isSafeInteger(employeeId) ||
    employeeId <= 0
  ) {
    throw new Error(
      "Cannot access device credentials without an active faculty database.",
    );
  }

  return `${baseKey}_emp_${employeeId}`;
}

export async function getDeviceUuid(): Promise<string | null> {
  return SecureStore.getItemAsync(getEmployeeScopedKey(DEVICE_UUID_KEY));
}

export async function saveDeviceUuid(uuid: string): Promise<void> {
  await SecureStore.setItemAsync(getEmployeeScopedKey(DEVICE_UUID_KEY), uuid);
}

export async function getPrivateKey(): Promise<string | null> {
  return SecureStore.getItemAsync(getEmployeeScopedKey(PRIVATE_KEY_KEY));
}

export async function savePrivateKey(privateKey: string): Promise<void> {
  await SecureStore.setItemAsync(
    getEmployeeScopedKey(PRIVATE_KEY_KEY),
    privateKey,
  );
}

export async function getPublicKey(): Promise<string | null> {
  return SecureStore.getItemAsync(getEmployeeScopedKey(PUBLIC_KEY_KEY));
}

export async function savePublicKey(publicKey: string): Promise<void> {
  await SecureStore.setItemAsync(
    getEmployeeScopedKey(PUBLIC_KEY_KEY),
    publicKey,
  );
}
