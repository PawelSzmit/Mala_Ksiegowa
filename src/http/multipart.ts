// Formularz z plikiem (multipart/form-data) – PDF faktury spoza KSeF, zdjęcie raportu z kasy.
import type { IncomingMessage } from 'node:http';
import { HttpError } from './http.ts';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export interface UploadedFile {
  filename: string;
  data: Buffer;
}

export interface MultipartForm {
  fields: Map<string, string>;
  files: Map<string, UploadedFile>;
}

export async function readMultipart(req: IncomingMessage, maxBytes = MAX_UPLOAD_BYTES): Promise<MultipartForm> {
  const type = req.headers['content-type'] ?? '';
  const boundary = /^multipart\/form-data;.*\bboundary=(?:"([^"]+)"|([^;\s]+))/i.exec(type);
  if (!boundary) throw new HttpError(415, 'Nieobsługiwany format formularza');
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > maxBytes) throw new HttpError(413, `Plik jest za duży (najwięcej ${maxBytes / 1024 / 1024} MB).`);

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new HttpError(413, `Plik jest za duży (najwięcej ${maxBytes / 1024 / 1024} MB).`);
    chunks.push(chunk as Buffer);
  }
  return parseMultipart(Buffer.concat(chunks), boundary[1] ?? boundary[2]!);
}

export function parseMultipart(body: Buffer, boundary: string): MultipartForm {
  const form: MultipartForm = { fields: new Map(), files: new Map() };
  const delimiter = Buffer.from(`--${boundary}`);
  let position = body.indexOf(delimiter);
  if (position < 0) throw new HttpError(400, 'Uszkodzony formularz');
  while (true) {
    position += delimiter.length;
    if (body.subarray(position, position + 2).toString() === '--') return form; // koniec
    position += 2; // CRLF po separatorze
    const headerEnd = body.indexOf('\r\n\r\n', position);
    const next = body.indexOf(delimiter, position);
    if (headerEnd < 0 || next < 0 || headerEnd > next) throw new HttpError(400, 'Uszkodzony formularz');
    const headers = body.subarray(position, headerEnd).toString('utf8');
    const content = body.subarray(headerEnd + 4, next - 2); // bez CRLF przed separatorem
    const disposition = /content-disposition:\s*form-data;([^\r\n]*)/i.exec(headers)?.[1] ?? '';
    const name = /\bname="([^"]*)"/.exec(disposition)?.[1];
    const filename = /\bfilename="([^"]*)"/.exec(disposition)?.[1];
    if (name !== undefined) {
      if (filename !== undefined) {
        if (content.length > 0) form.files.set(name, { filename, data: Buffer.from(content) });
      } else {
        form.fields.set(name, content.toString('utf8'));
      }
    }
    position = next;
  }
}
