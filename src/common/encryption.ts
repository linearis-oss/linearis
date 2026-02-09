import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGORITHM = "aes-256-cbc";

// Hardcoded key material — provides obfuscation-level protection against
// accidental token exposure (browsing files, git commits).
// Does NOT protect against determined attackers with access to the binary.
const KEY_MATERIAL = "linearis-v1-token-encryption-key";

function deriveKey(): Buffer {
  return createHash("sha256").update(KEY_MATERIAL).digest();
}

export function encryptToken(token: string): string {
  const key = deriveKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  // Store as iv:ciphertext, both hex-encoded
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptToken(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid encrypted token format");
  }
  const key = deriveKey();
  const iv = Buffer.from(parts[0], "hex");
  if (iv.length !== 16) {
    throw new Error("Invalid encrypted token: corrupted IV");
  }
  const ciphertext = Buffer.from(parts[1], "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
