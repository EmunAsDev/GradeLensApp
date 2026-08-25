import QuickCrypto from "react-native-quick-crypto";

import {
    getDeviceUuid,
    getPrivateKey,
    getPublicKey,
    saveDeviceUuid,
    savePrivateKey,
    savePublicKey,
} from "../crypto/deviceKeyStorage";

export type DeviceKeyPair = {
  deviceUuid: string;
  publicKey: string;
  privateKey: string;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToPem(base64: string, label: string): string {
  const lines = base64.match(/.{1,64}/g) ?? [];

  return [`-----BEGIN ${label}-----`, ...lines, `-----END ${label}-----`].join(
    "\n",
  );
}

type RsaKeyPair = {
  publicKey: any;
  privateKey: any;
};

async function generateKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const generatedKey = await QuickCrypto.subtle.generateKey(
    {
      name: "RSA-OAEP",

      modulusLength: 2048,

      publicExponent: new Uint8Array([1, 0, 1]),

      hash: "SHA-1",
    },
    true,
    ["encrypt", "decrypt"],
  );

  const keyPair = generatedKey as RsaKeyPair;

  const publicKeyBuffer = (await QuickCrypto.subtle.exportKey(
    "spki",
    keyPair.publicKey,
  )) as ArrayBuffer;

  const privateKeyBuffer = (await QuickCrypto.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey,
  )) as ArrayBuffer;

  const publicKey = base64ToPem(
    arrayBufferToBase64(publicKeyBuffer),
    "PUBLIC KEY",
  );

  const privateKey = base64ToPem(
    arrayBufferToBase64(privateKeyBuffer),
    "PRIVATE KEY",
  );

  return {
    publicKey,
    privateKey,
  };
}

export async function getOrCreateDeviceKeyPair(): Promise<DeviceKeyPair> {
  const [existingUuid, existingPublicKey, existingPrivateKey] =
    await Promise.all([getDeviceUuid(), getPublicKey(), getPrivateKey()]);

  if (existingUuid && existingPublicKey && existingPrivateKey) {
    return {
      deviceUuid: existingUuid,

      publicKey: existingPublicKey,

      privateKey: existingPrivateKey,
    };
  }

  const deviceUuid = QuickCrypto.randomUUID();

  const { publicKey, privateKey } = await generateKeyPair();

  await Promise.all([
    saveDeviceUuid(deviceUuid),

    savePublicKey(publicKey),

    savePrivateKey(privateKey),
  ]);

  return {
    deviceUuid,
    publicKey,
    privateKey,
  };
}
