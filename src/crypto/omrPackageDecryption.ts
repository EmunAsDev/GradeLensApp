import QuickCrypto from "react-native-quick-crypto";

import { File } from "expo-file-system";

import { getPrivateKey } from "@/crypto/deviceKeyStorage";

import { getCourseTest } from "@/database/courseTestRepository";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);

  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function pemToBytes(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  return base64ToBytes(base64);
}

function combineBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const combined = new Uint8Array(first.length + second.length);

  combined.set(first, 0);

  combined.set(second, first.length);

  return combined;
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8) {
    return false;
  }

  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  return signature.every((value, index) => bytes[index] === value);
}

export async function decryptOmrPackage(
  courseTestId: number,
): Promise<Uint8Array> {
  /*
    |--------------------------------------------------------------------------
    | Load OMR Metadata
    |--------------------------------------------------------------------------
    */

  const courseTest = await getCourseTest(courseTestId);

  if (!courseTest) {
    throw new Error("Course test was not found locally.");
  }

  if (
    !courseTest.omr_package_path ||
    !courseTest.omr_iv ||
    !courseTest.omr_tag ||
    !courseTest.omr_wrapped_key
  ) {
    throw new Error("The OMR package is not available offline.");
  }

  if (courseTest.omr_content_algorithm !== "AES-256-GCM") {
    throw new Error("Unsupported OMR content encryption algorithm.");
  }

  if (courseTest.omr_key_algorithm !== "RSA-OAEP") {
    throw new Error("Unsupported OMR key encryption algorithm.");
  }

  /*
    |--------------------------------------------------------------------------
    | Read Encrypted .omr File
    |--------------------------------------------------------------------------
    */

  const omrFile = new File(courseTest.omr_package_path);

  if (!omrFile.exists) {
    throw new Error("The encrypted OMR file is missing.");
  }

  const ciphertext = await omrFile.bytes();

  /*
    |--------------------------------------------------------------------------
    | Load Device RSA Private Key
    |--------------------------------------------------------------------------
    */

  const privateKeyPem = await getPrivateKey();

  if (!privateKeyPem) {
    throw new Error("The device private key is unavailable.");
  }

  /*
    |--------------------------------------------------------------------------
    | Import RSA Private Key
    |--------------------------------------------------------------------------
    |
    | The key was generated using RSA-OAEP + SHA-1.
    | This must match Laravel's RSA OAEP wrapping behavior.
    |
    */

  const privateKeyBytes = pemToBytes(privateKeyPem);

  const privateKey = await QuickCrypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes,
    {
      name: "RSA-OAEP",

      hash: "SHA-1",
    },
    false,
    ["decrypt"],
  );

  /*
    |--------------------------------------------------------------------------
    | Unwrap AES Key
    |--------------------------------------------------------------------------
    */

  const wrappedKey = base64ToBytes(courseTest.omr_wrapped_key);

  const aesKeyBuffer = await QuickCrypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    privateKey,
    wrappedKey,
  );

  const aesKeyBytes = new Uint8Array(aesKeyBuffer as ArrayBuffer);

  if (aesKeyBytes.length !== 32) {
    throw new Error("The decrypted AES key has an invalid length.");
  }

  /*
    |--------------------------------------------------------------------------
    | Import AES-256 Key
    |--------------------------------------------------------------------------
    */

  const aesKey = await QuickCrypto.subtle.importKey(
    "raw",
    aesKeyBytes,
    {
      name: "AES-GCM",
    },
    false,
    ["decrypt"],
  );

  /*
    |--------------------------------------------------------------------------
    | Decode IV + Authentication Tag
    |--------------------------------------------------------------------------
    */

  const iv = base64ToBytes(courseTest.omr_iv);

  const tag = base64ToBytes(courseTest.omr_tag);

  /*
    |--------------------------------------------------------------------------
    | WebCrypto AES-GCM Format
    |--------------------------------------------------------------------------
    |
    | Laravel/OpenSSL returned ciphertext and GCM tag separately.
    |
    | WebCrypto expects:
    |
    | ciphertext || tag
    |
    */

  const ciphertextWithTag = combineBytes(ciphertext, tag);

  /*
    |--------------------------------------------------------------------------
    | AES-256-GCM Decryption
    |--------------------------------------------------------------------------
    */

  const plaintextBuffer = await QuickCrypto.subtle.decrypt(
    {
      name: "AES-GCM",

      iv,

      tagLength: 128,
    },
    aesKey,
    ciphertextWithTag,
  );

  const plaintext = new Uint8Array(plaintextBuffer as ArrayBuffer);

  /*
    |--------------------------------------------------------------------------
    | Sanity Check
    |--------------------------------------------------------------------------
    */

  if (!isPng(plaintext)) {
    throw new Error("The decrypted OMR package is not a valid PNG image.");
  }

  return plaintext;
}
