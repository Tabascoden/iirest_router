import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt);

export function generateRelayToken(): string {
  return `rt_${randomBytes(24).toString("base64url")}`;
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const key = (await scrypt(secret, salt, 32)) as Buffer;
  return `scrypt:${salt}:${key.toString("base64url")}`;
}

export async function verifySecret(secret: string, storedHash: string): Promise<boolean> {
  const [kind, salt, expected] = storedHash.split(":");
  if (kind !== "scrypt" || !salt || !expected) return false;
  const key = (await scrypt(secret, salt, 32)) as Buffer;
  const expectedBuffer = Buffer.from(expected, "base64url");
  return key.length === expectedBuffer.length && timingSafeEqual(key, expectedBuffer);
}

export function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
