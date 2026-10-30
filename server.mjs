// Punkt startowy dla cPanelu („Setup Node.js App” → Application startup file: server.mjs).
// Node 24 uruchamia pliki .ts bezpośrednio (usuwa same typy), więc nie ma kroku budowania.
await import('./src/server.ts');
