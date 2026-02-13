import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "../../../src/common/encryption.js";

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

  it("includes v1 version prefix", () => {
    const encrypted = encryptToken("lin_api_abc123def456");
    expect(encrypted).toMatch(/^v1:/);
  });
});

describe("decryptToken", () => {
  it("round-trips: decrypt(encrypt(token)) === token", () => {
    const token = "lin_api_abc123def456";
    const encrypted = encryptToken(token);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(token);
  });

  it("decrypts legacy unversioned format (iv:ciphertext)", () => {
    // Encrypt with current function, then strip the v1: prefix to simulate legacy
    const token = "lin_api_legacy_test";
    const encrypted = encryptToken(token);
    const legacy = encrypted.replace(/^v1:/, "");
    expect(decryptToken(legacy)).toBe(token);
  });

  it("throws on malformed input", () => {
    expect(() => decryptToken("not-valid-encrypted-data")).toThrow();
  });

  it("throws on empty string", () => {
    expect(() => decryptToken("")).toThrow();
  });

  it("throws on corrupted IV (wrong length)", () => {
    // Valid legacy format (hex:hex) but IV is only 4 bytes instead of 16
    expect(() => decryptToken("aabbccdd:aabbccdd")).toThrow("corrupted IV");
  });

  it("throws on unsupported version prefix", () => {
    const encrypted = encryptToken("lin_api_test");
    const v99 = encrypted.replace(/^v1:/, "v99:");
    expect(() => decryptToken(v99)).toThrow(
      "Unsupported token encryption version: v99",
    );
  });
});
