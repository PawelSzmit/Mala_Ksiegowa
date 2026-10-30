import type { ServerResponse } from 'node:http';

/** Wysyła zapisany plik (PDF/zdjęcie). Piaskownica CSP: nawet spreparowany plik nie uruchomi skryptów w aplikacji. */
export function sendFile(res: ServerResponse, data: Buffer, type: string | null, name: string | null): void {
  const inline = type === 'application/pdf' || type === 'image/jpeg' || type === 'image/png';
  res.writeHead(200, {
    'Content-Type': type ?? 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name ?? 'plik')}`,
    'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  res.end(data);
}
