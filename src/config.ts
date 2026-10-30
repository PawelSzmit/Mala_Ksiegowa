// Ustawienia aplikacji ze zmiennych środowiskowych (w cPanelu: formularz „Setup Node.js App”).
export interface AppConfig {
  databaseUrl: string;
  /** 32 bajty w Base64 – szyfruje token KSeF i sekret TOTP. Utrata klucza = trzeba wpisać je od nowa. */
  encryptionKey: Buffer;
  /** Ciasteczko tylko przez HTTPS. Wyłączać wyłącznie lokalnie. */
  cookieSecure: boolean;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const missing = ['DATABASE_URL', 'APP_ENCRYPTION_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Brak zmiennych środowiskowych: ${missing.join(', ')}`);
  return {
    databaseUrl: env.DATABASE_URL!,
    encryptionKey: parseEncryptionKey(env.APP_ENCRYPTION_KEY!),
    cookieSecure: env.COOKIE_SECURE !== 'false',
    port: Number(env.PORT ?? 3000),
  };
}

export function parseEncryptionKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY musi mieć 32 bajty w Base64 (np. `openssl rand -base64 32`)');
  return key;
}
