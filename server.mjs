// Punkt startowy dla cPanelu („Setup Node.js App” → Application startup file: server.mjs).
// Node 24 uruchamia pliki .ts bezpośrednio (usuwa same typy), więc nie ma kroku budowania.
// Sekrety (DATABASE_URL, APP_ENCRYPTION_KEY) są w pliku .env obok tego pliku (prawa 600) – ten sam plik czyta
// zadanie cron. Zmienne wpisane w formularzu cPanelu mają pierwszeństwo przed plikiem.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
await import('./src/server.ts');
