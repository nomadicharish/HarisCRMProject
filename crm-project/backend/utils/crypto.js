const { webcrypto } = require("node:crypto");
const { AppError } = require("../lib/AppError");

const { subtle } = webcrypto;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const IV_LENGTH = 12;
const FALLBACK_SECRET = "development-only-fallback-secret-change-me";

let cryptoKeyPromise = null;
const legacyCryptoKeyPromises = new Map();

function getSecretMaterial() {
  const configuredSecret = process.env.DATA_ENCRYPTION_KEY_BASE64;

  if (configuredSecret) {
    return Buffer.from(configuredSecret, "base64");
  }

  if (process.env.NODE_ENV === "production") {
    throw new AppError("Server encryption key is not configured", 500);
  }

  return Buffer.from(FALLBACK_SECRET, "utf8");
}

async function getCryptoKey() {
  if (!cryptoKeyPromise) {
    cryptoKeyPromise = importAesKey(getSecretMaterial());
  }

  return cryptoKeyPromise;
}

async function importAesKey(rawSecret) {
  const digest = await subtle.digest("SHA-256", rawSecret);

  return subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

function getLegacySecretMaterials() {
  const configuredLegacyKeys = String(process.env.DATA_ENCRYPTION_LEGACY_KEYS_BASE64 || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)
    .map((key) => Buffer.from(key, "base64"));

  return [
    ...configuredLegacyKeys,
    Buffer.from(FALLBACK_SECRET, "utf8"),
    Buffer.alloc(0)
  ];
}

function getLegacyCryptoKey(rawSecret) {
  const cacheKey = rawSecret.toString("base64");
  if (!legacyCryptoKeyPromises.has(cacheKey)) {
    legacyCryptoKeyPromises.set(cacheKey, importAesKey(rawSecret));
  }
  return legacyCryptoKeyPromises.get(cacheKey);
}

async function encryptText(value) {
  const plaintext = String(value || "");
  if (!plaintext) return "";

  const key = await getCryptoKey();
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encryptedBuffer = await subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(plaintext)
  );

  return JSON.stringify({
    iv: Buffer.from(iv).toString("base64"),
    data: Buffer.from(encryptedBuffer).toString("base64")
  });
}

async function decryptWithKey({ iv, data }, key) {
  const decryptedBuffer = await subtle.decrypt(
    {
      name: "AES-GCM",
      iv: Buffer.from(iv, "base64")
    },
    key,
    Buffer.from(data, "base64")
  );

  return textDecoder.decode(decryptedBuffer);
}

async function decryptText(payload) {
  if (!payload) return "";

  let encryptedPayload;
  try {
    encryptedPayload = typeof payload === "string" ? JSON.parse(payload) : payload;
  } catch {
    return String(payload || "");
  }

  if (!encryptedPayload?.iv || !encryptedPayload?.data) {
    return String(payload || "");
  }

  const keys = [
    await getCryptoKey(),
    ...(await Promise.all(getLegacySecretMaterials().map(getLegacyCryptoKey)))
  ];

  for (const key of keys) {
    try {
      return await decryptWithKey(encryptedPayload, key);
    } catch {
      // Try the next key. Some production data was encrypted before the current key was configured.
    }
  }

  return "";
}

module.exports = {
  decryptText,
  encryptText
};
