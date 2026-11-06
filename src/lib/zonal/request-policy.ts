import { ZonalError } from './validation';
export function assertSecureCredentialRequest(origin: string | null, host: string | null, production: boolean) {
  try {
    if (!origin || !host) throw new Error();
    const url = new URL(origin);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.origin !== origin || url.host !== host || url.username || url.password) throw new Error();
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && !production)) throw new Error();
  } catch { throw new ZonalError('Use HTTPS on the same Cocotte domain to manage credentials. Localhost HTTP is allowed only in development.'); }
}
