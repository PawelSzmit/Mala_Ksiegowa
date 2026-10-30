import { html, type Html } from './html.ts';

export const STYLES = `
:root { --bg: #f6f5f2; --card: #fff; --text: #1d1d1b; --muted: #6b6a66; --accent: #2f5d50; --danger: #a33a2b; --line: #e2e0da; }
@media (prefers-color-scheme: dark) { :root { --bg: #171716; --card: #222220; --text: #ecebe7; --muted: #a3a29c; --accent: #7fb8a6; --danger: #e48a7c; --line: #34332f; } }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--line); background: var(--card); }
header strong { font-size: 18px; }
main { max-width: 720px; margin: 24px auto; padding: 0 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 20px; margin-bottom: 16px; }
h1 { font-size: 24px; margin: 0 0 4px; }
.muted { color: var(--muted); }
label { display: block; margin: 12px 0 4px; font-weight: 600; }
input { width: 100%; padding: 10px; font-size: 16px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--text); }
button { margin-top: 16px; padding: 10px 16px; font-size: 16px; border: 0; border-radius: 6px; background: var(--accent); color: #fff; cursor: pointer; }
button[disabled] { opacity: .5; cursor: not-allowed; }
button.link { background: none; color: var(--accent); padding: 0; margin: 0; }
.error { color: var(--danger); font-weight: 600; }
.row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--line); }
.row:last-child { border-bottom: 0; }
nav.months { display: flex; justify-content: space-between; margin-bottom: 16px; }
a { color: var(--accent); }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 13px; background: var(--line); }
`;

export function layout(title: string, body: Html, user?: { username: string }): Html {
  return html`<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} – Mała Księgowa</title>
<link rel="stylesheet" href="/static/app.css">
</head>
<body>
<header>
  <strong>Mała Księgowa</strong>
  ${user ? html`<form method="post" action="/wyloguj"><span class="muted">${user.username}</span> · <button class="link" type="submit">Wyloguj</button></form>` : ''}
</header>
<main>${body}</main>
</body>
</html>`;
}
