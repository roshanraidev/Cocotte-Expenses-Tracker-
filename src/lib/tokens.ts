import { createHash, randomBytes } from 'node:crypto';
export function hashToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
export function createToken() { const token = randomBytes(32).toString('hex'); return { token, tokenHash: hashToken(token) }; }
