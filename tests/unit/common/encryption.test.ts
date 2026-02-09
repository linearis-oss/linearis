import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken } from "../../../src/common/encryption.js";

describe("encryptToken", () => {
  it("returns a string different from the input", () => {
    const token = "lin_api_abc123def456";
    const encrypted = encryptToken(token);
    expect(encrypted).not.toBe(token);
    expect(typeof encrypted).toBe("string");
  });

  it("produces different ciphertext each call (random IV)", () => {
    const token = "lin_api_abc123def456";
    const a = encryptToken(token);
    const b = encryptToken(token);
    expect(a).not.toBe(b);
  });
});

describe("decryptToken", () => {
  it("round-trips: decrypt(encrypt(token)) === token", () => {
    const token = "lin_api_abc123def456";
    const encrypted = encryptToken(token);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(token);
  });

  it("throws on malformed input", () => {
    expect(() => decryptToken("not-valid-encrypted-data")).toThrow();
  });

  it("throws on empty string", () => {
    expect(() => decryptToken("")).toThrow();
  });

  it("throws on corrupted IV (wrong length)", () => {
    // Valid format (hex:hex) but IV is only 4 bytes instead of 16
    expect(() => decryptToken("aabbccdd:aabbccdd")).toThrow("corrupted IV");
  });
});
