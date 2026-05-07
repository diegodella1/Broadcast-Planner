import crypto from "node:crypto"

const ALGORITHM = "aes-256-gcm"

export function encryptSecret(value: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".")
}

export function decryptSecret(payload: string): string {
  const key = getEncryptionKey()
  const [ivRaw, tagRaw, encryptedRaw] = payload.split(".")
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Invalid encrypted payload")
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivRaw, "base64"))
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64")), decipher.final()]).toString("utf8")
}

export function maskSecret(value?: string | null): string {
  if (!value) return ""
  if (value.length <= 8) return "****"
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

function getEncryptionKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is required")
  const base64 = Buffer.from(raw, "base64")
  if (base64.length === 32) return base64
  const utf8 = Buffer.from(raw, "utf8")
  if (utf8.length === 32) return utf8
  throw new Error("APP_ENCRYPTION_KEY must be 32 bytes or base64-encoded 32 bytes")
}
