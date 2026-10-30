// Jednorazowe założenie konta (jak w aplikacji gabinetu). Pyta o hasło, tworzy sekret do aplikacji
// z kodami w telefonie i zapisuje konto dopiero po wpisaniu poprawnego kodu.
// Użycie: DATABASE_URL=... APP_ENCRYPTION_KEY=... node scripts/create-user.ts <login>
import { createInterface } from 'node:readline';
import { parseEncryptionKey } from '../src/config.ts';
import { encryptSecret } from '../src/crypto/secret-box.ts';
import { createPool } from '../src/db/pool.ts';
import { hashPassword, passwordProblem } from '../src/auth/password.ts';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../src/auth/totp.ts';

const username = process.argv[2];
if (!username) throw new Error('Podaj login: node scripts/create-user.ts <login>');
if (!process.env.DATABASE_URL || !process.env.APP_ENCRYPTION_KEY) throw new Error('Ustaw DATABASE_URL i APP_ENCRYPTION_KEY');
const key = parseEncryptionKey(process.env.APP_ENCRYPTION_KEY);

// Jeden czytnik na cały skrypt: przy wpisywaniu z potoku kolejne linie nie giną między pytaniami.
const tty = Boolean(process.stdin.isTTY);
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: tty });
let muted = false;
(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
  if (!muted) process.stdout.write(s);
};
const lines = rl[Symbol.asyncIterator]();

/** Pytanie z ukrytym wpisywaniem (hasło nie pojawia się na ekranie ani w historii poleceń). */
async function ask(question: string, hidden = false): Promise<string> {
  process.stdout.write(question);
  muted = hidden && tty;
  const next = await lines.next();
  muted = false;
  if (hidden && tty) process.stdout.write('\n');
  if (next.done) throw new Error('Brak odpowiedzi (koniec wejścia).');
  return next.value;
}

const db = createPool(process.env.DATABASE_URL);
try {
  const existing = await db.query('SELECT count(*)::int AS n FROM users');
  if (existing.rows[0].n > 0) throw new Error('Konto już istnieje. Ten skrypt zakłada tylko pierwsze konto.');

  const password = await ask('Hasło (min. 12 znaków): ', true);
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  if ((await ask('Powtórz hasło: ', true)) !== password) throw new Error('Hasła się różnią.');

  const secret = generateTotpSecret();
  console.log('\nDodaj konto w aplikacji z kodami w telefonie (np. Google Authenticator, Aegis):');
  console.log(`  klucz do wpisania ręcznie: ${secret.match(/.{1,4}/g)!.join(' ')}`);
  console.log(`  albo link: ${otpauthUri(secret, username)}\n`);

  for (let attempt = 1; ; attempt++) {
    const code = (await ask('Wpisz 6-cyfrowy kod z telefonu: ')).trim();
    const step = verifyTotp(secret, code, 0);
    if (step !== null) {
      await db.query(
        'INSERT INTO users (username, password_hash, totp_secret_enc, totp_last_step) VALUES ($1, $2, $3, $4)',
        [username, await hashPassword(password), encryptSecret(secret, key), step],
      );
      console.log(`Konto „${username}” założone. Możesz się zalogować.`);
      break;
    }
    if (attempt >= 3) throw new Error('Kod się nie zgadza. Sprawdź godzinę w telefonie i uruchom skrypt ponownie.');
    console.log('Kod się nie zgadza, spróbuj jeszcze raz.');
  }
} finally {
  rl.close();
  await db.end();
}
