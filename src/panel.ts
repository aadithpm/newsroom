import type { D1Database } from '@cloudflare/workers-types';
import { CATEGORIES } from './taxonomy';
import { esc } from './util';
import { getSettings, lastRuns, listFeeds, type Feed, type Settings } from './db';
import type { Env } from './digest';

const STYLE = `<style>
  body{font-family:system-ui,sans-serif;margin:0;background:#f6f6f6;color:#222}
  main{max-width:720px;margin:24px auto;padding:0 16px}
  table{border-collapse:collapse;width:100%;margin:12px 0;background:#fff}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #eee;font-size:14px;vertical-align:top}
  th{background:#f0f0f0;font-size:12px;text-transform:uppercase;letter-spacing:1px}
  .flash{padding:10px 14px;background:#e6f4e6;border:1px solid #b7dfb7;border-radius:4px;margin:12px 0}
  .flash.err{background:#fde8e8;border-color:#f3bcbc}
  input,select,button{font:inherit;padding:5px 8px}
  button{cursor:pointer}
  form.inline{display:inline}
  h1 a{color:#222;text-decoration:none} h2{margin-top:28px;font-size:16px}
  .muted{color:#888;font-size:12px}
</style>`;

function layout(title: string, body: string, flash: string | null): string {
  const f = flash
    ? `<div class="flash${flash.startsWith('Error') ? ' err' : ''}">${esc(flash)}</div>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · newsroom</title>${STYLE}</head>
<body><main><h1><a href="/">📰 newsroom</a></h1><nav class="muted">
<a href="/">Dashboard</a> · <a href="/feeds">Feeds</a> · <a href="/settings">Settings</a></nav>
${f}${body}</main></body></html>`;
}

export function dashboardPage(runs: Record<string, unknown>[], flash: string | null): string {
  const rows = runs.map((r) => `<tr><td>${esc(String(r.started_at ?? ''))}</td><td>${esc(String(r.status ?? ''))}</td>
    <td>${String(r.items_collected ?? 0)}</td><td>${String(r.items_sent ?? 0)}</td><td>${esc(String(r.skipped ?? ''))}</td></tr>`).join('');
  const body = `<h2>Run history (last 20)</h2>
<table><tr><th>Started (UTC)</th><th>Status</th><th>Collected</th><th>Sent</th><th>Skipped</th></tr>${rows}</table>
<h2>Test email</h2>
<form method="POST" action="/test"><input type="hidden" name="mode" value="empty">
  <button>Send test (empty)</button></form>
<form method="POST" action="/test"><input type="hidden" name="mode" value="content">
  <button>Send test (with content — does not advance window)</button></form>`;
  return layout('Dashboard', body, flash);
}

export function feedsPage(feeds: Feed[], flash: string | null): string {
  const options = CATEGORIES.map((c) => `<option>${c}</option>`).join('');
  const rows = feeds.map((f) => `<tr><td>${esc(f.name)}</td><td><a href="${esc(f.url)}">${esc(f.url)}</a></td>
<td>${esc(f.category)}</td><td>${f.enabled ? '✅' : '⛔'}</td>
<td>
  <form class="inline" method="POST" action="/feeds/action"><input type="hidden" name="id" value="${f.id}">
    <input type="hidden" name="action" value="${f.enabled ? 'disable' : 'enable'}"><button>${f.enabled ? 'Disable' : 'Enable'}</button></form>
  <form class="inline" method="POST" action="/feeds/action"><input type="hidden" name="id" value="${f.id}">
    <input type="hidden" name="action" value="delete"><button>Delete</button></form>
</td></tr>`).join('');
  const body = `<h2>Add feed</h2>
<form method="POST" action="/feeds/add">
  <p><input name="name" placeholder="Name (e.g. Guardian World)" size="30" required></p>
  <p><input name="url" placeholder="https://… (RSS/Atom URL)" size="50" required></p>
  <p><select name="category">${options}</select> <button>Add</button></p>
</form>
<h2>Feeds (${feeds.length})</h2>
<table><tr><th>Name</th><th>URL</th><th>Category</th><th>On</th><th></th></tr>${rows}</table>`;
  return layout('Feeds', body, flash);
}

export function settingsPage(settings: Settings, flash: string | null): string {
  const body = `<h2>Schedule &amp; recipients</h2>
<form method="POST" action="/settings">
  <p>Send time (PT, 24h): <input name="send_time" value="${esc(settings.send_time)}" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" required></p>
  <p>Recipients (1–5, one per line):<br>
  <textarea name="recipients" rows="5" cols="40" required>${esc(settings.recipients.join('\n'))}</textarea></p>
  <p><button>Save</button></p>
</form>`;
  return layout('Settings', body, flash);
}

// --- validation (spec §6): invalid → no write ---

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function addFeed(db: D1Database, name: string, url: string, category: string): Promise<string> {
  if (!name.trim() || name.length > 100) return 'Error: name required, ≤100 chars';
  let u: URL;
  try { u = new URL(url); } catch { return 'Error: invalid URL'; }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || url.length > 2048) return 'Error: URL must be http(s), ≤2048 chars';
  if (!(CATEGORIES as readonly string[]).includes(category)) return 'Error: bad category';
  const dup = await db.prepare('SELECT id FROM feeds WHERE url = ?').bind(url).first();
  if (dup) return 'Error: feed URL already exists';
  await db.prepare('INSERT INTO feeds(url, name, category, enabled, created_at) VALUES (?, ?, ?, 1, ?)')
    .bind(url, name.trim(), category, new Date().toISOString()).run();
  return 'Added feed';
}

export async function feedAction(db: D1Database, idRaw: string, action: string): Promise<string> {
  const id = Number(idRaw);
  if (!Number.isInteger(id)) return 'Error: bad id';
  if (action === 'delete') await db.prepare('DELETE FROM feeds WHERE id = ?').bind(id).run();
  else if (action === 'enable' || action === 'disable')
    await db.prepare('UPDATE feeds SET enabled = ? WHERE id = ?').bind(action === 'enable' ? 1 : 0, id).run();
  else return 'Error: bad action';
  return 'Updated';
}

export async function saveSettings(db: D1Database, sendTime: string, recipientsRaw: string): Promise<string> {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(sendTime)) return 'Error: send time must be HH:MM (24h)';
  const emails = [...new Set(recipientsRaw.split('\n').map((s) => s.trim()).filter(Boolean))];
  if (emails.length < 1 || emails.length > 5) return 'Error: 1–5 recipients required';
  if (emails.some((e) => !EMAIL_RE.test(e) || e.length > 254)) return 'Error: invalid recipient email';
  await db.prepare("INSERT INTO settings(key, value) VALUES ('send_time', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(sendTime).run();
  await db.prepare("INSERT INTO settings(key, value) VALUES ('recipients', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(emails)).run();
  return 'Saved settings';
}

export async function renderPanelPage(env: Env, path: string, flash: string | null): Promise<string> {
  if (path === '/feeds') return feedsPage(await listFeeds(env.DB), flash);
  if (path === '/settings') return settingsPage(await getSettings(env.DB), flash);
  return dashboardPage(await lastRuns(env.DB), flash);
}
