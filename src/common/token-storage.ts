import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decryptToken, encryptToken } from "./encryption.js";

const DIR_NAME = ".linearis";
const TOKEN_FILE = "token";

export function getTokenDir(): string {
  return path.join(os.homedir(), DIR_NAME);
}

function getTokenPath(): string {
  return path.join(getTokenDir(), TOKEN_FILE);
}

export function ensureTokenDir(): void {
  const dir = getTokenDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } else {
    fs.chmodSync(dir, 0o700);
  }
}

export function saveToken(token: string): void {
  ensureTokenDir();
  const tokenPath = getTokenPath();
  const encrypted = encryptToken(token);
  fs.writeFileSync(tokenPath, encrypted, "utf8");
  fs.chmodSync(tokenPath, 0o600);
}

export function getStoredToken(): string | null {
  const tokenPath = getTokenPath();
  if (!fs.existsSync(tokenPath)) {
    return null;
  }
  try {
    const encrypted = fs.readFileSync(tokenPath, "utf8").trim();
    return decryptToken(encrypted);
  } catch {
    return null;
  }
}

export function clearToken(): void {
  const tokenPath = getTokenPath();
  if (fs.existsSync(tokenPath)) {
    fs.unlinkSync(tokenPath);
  }
}
