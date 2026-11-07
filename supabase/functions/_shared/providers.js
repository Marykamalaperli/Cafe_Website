// Original portable helpers shared by the Edge handler and isolated tests.
const utf8 = new TextEncoder();
export async function hmac(secret, message) {
 const key = await crypto.subtle.importKey('raw', utf8.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
 const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8.encode(message)));
 return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function equalSignature(actual, expected) {
 if (typeof actual !== 'string' || actual.length !== expected.length) return false;
 let mismatch = 0; for (let i = 0; i < expected.length; i++) mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
 return mismatch === 0;
}
export class ProviderError extends Error { constructor(message, status = 502) { super(message); this.status = status; } }
