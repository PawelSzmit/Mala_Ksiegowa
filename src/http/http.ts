import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_FORM_BYTES = 16 * 1024;

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // Uszkodzone ciasteczko (np. z innej strony w tej samej domenie) pomijamy, zamiast wywracać stronę.
    }
  }
  return out;
}

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Formularz HTML (application/x-www-form-urlencoded) z limitem rozmiaru. */
export async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const type = req.headers['content-type'] ?? '';
  if (!type.startsWith('application/x-www-form-urlencoded')) throw new HttpError(415, 'Nieobsługiwany format formularza');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_FORM_BYTES) throw new HttpError(413, 'Formularz jest za duży');
    chunks.push(chunk as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

export function send(res: ServerResponse, status: number, body: string, contentType = 'text/html; charset=utf-8', headers: Record<string, string | string[]> = {}): void {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': contentType, ...headers });
  res.end(body);
}

export function redirect(res: ServerResponse, location: string, headers: Record<string, string | string[]> = {}): void {
  res.writeHead(303, { ...SECURITY_HEADERS, Location: location, ...headers });
  res.end();
}

/**
 * Ochrona przed wysłaniem formularza z obcej strony: ciasteczko ma SameSite=Strict,
 * a dodatkowo POST z nagłówkiem Origin innym niż nasz adres jest odrzucany.
 */
export function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function sessionCookie(name: string, value: string, opts: { secure: boolean; maxAgeSeconds: number }): string {
  return [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${opts.maxAgeSeconds}`,
    ...(opts.secure ? ['Secure'] : []),
  ].join('; ');
}
