const { webcrypto } = require("node:crypto");
const { AppError } = require("../lib/AppError");

const { subtle } = webcrypto;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const IV_LENGTH = 12;
const FALLBACK_SECRET = "development-only-fallback-secret-change-me";

let cryptoKeyPromise = null;

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
    cryptoKeyPromise = (async () => {
      const rawSecret = getSecretMaterial();
      const digest = await subtle.digest("SHA-256", rawSecret);

      return subtle.importKey(
        "raw",
        digest,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
      );
    })();
  }

  return cryptoKeyPromise;
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

async function decryptText(payload) {
  if (!payload) return "";

  try {
    const { iv, data } = typeof payload === "string" ? JSON.parse(payload) : payload;
    const key = await getCryptoKey();
    const decryptedBuffer = await subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Buffer.from(iv, "base64")
      },
      key,
      Buffer.from(data, "base64")
    );

    return textDecoder.decode(decryptedBuffer);
  } catch {
    return String(payload || "");
  }
}

module.exports = {
  decryptText,
  encryptText
};
