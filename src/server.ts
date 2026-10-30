import { createServer } from 'node:http';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createPool } from './db/pool.ts';

const config = loadConfig();
const db = createPool(config.databaseUrl);
const app = createApp({ db, encryptionKey: config.encryptionKey, cookieSecure: config.cookieSecure });

const server = createServer((req, res) => void app(req, res));
server.listen(config.port, () => console.log(`Mała Księgowa działa na porcie ${config.port}`));

const shutdown = () => server.close(() => void db.end().then(() => process.exit(0)));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
