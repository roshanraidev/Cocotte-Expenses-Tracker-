import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ZonalError } from './validation';
const credentialsSchema = z.object({ username: z.string().min(1).max(254), password: z.string().min(1).max(1024) }).strict();
export type ZonalCredentials = z.infer<typeof credentialsSchema>;
function encryptionKey() {
  const value = process.env.ZONAL_CREDENTIALS_KEY;
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new ZonalError('Credential saving is disabled. A server administrator must configure ZONAL_CREDENTIALS_KEY as a base64-encoded 32-byte secret.');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) throw new ZonalError('The server credential encryption key is invalid.');
  return key;
}
export function encryptionReady() { try { encryptionKey(); return true; } catch { return false; } }
const aad = (restaurantId: string) => Buffer.from(`cocotte:zonal:v1:${restaurantId}`, 'utf8');
export function encryptCredentials(restaurantId: string, input: ZonalCredentials) {
  const key = encryptionKey();
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) throw new ZonalError('Enter a valid Zonal username and password.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(restaurantId));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(parsed.data), 'utf8'), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
}
export function decryptCredentials(restaurantId: string, envelope: string): ZonalCredentials {
  const key = encryptionKey();
  try {
    const data = z.object({ v: z.literal(1), iv: z.string(), tag: z.string(), ciphertext: z.string() }).strict().parse(JSON.parse(envelope));
    const iv = Buffer.from(data.iv, 'base64'), tag = Buffer.from(data.tag, 'base64');
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad(restaurantId)); decipher.setAuthTag(tag);
    const clear = Buffer.concat([decipher.update(Buffer.from(data.ciphertext, 'base64')), decipher.final()]);
    try { return credentialsSchema.parse(JSON.parse(clear.toString('utf8'))); } finally { clear.fill(0); }
  } catch { throw new ZonalError('Stored credentials could not be decrypted. Ask a server administrator to check the encryption key, or update the connection credentials.'); }
}
