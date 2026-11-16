import type { D1Database } from '@cloudflare/workers-types';

export interface Feed {
  id: number; url: string; name: string; category: string; enabled: number;
}

export interface Settings {
  send_time: string;
  recipients: string[];
  watermark: string;
}

export async function getSettings(db: D1Database): Promise<Settings> {
  const rows = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const map = Object.fromEntries((rows.results ?? []).map((r) => [r.key, r.value]));
  return {
    send_time: map.send_time ?? '08:00',
    recipients: JSON.parse(map.recipients ?? '[]'),
    watermark: map.watermark ?? '',
  };
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, value).run();
}

export async function listFeeds(db: D1Database): Promise<Feed[]> {
  const rows = await db.prepare('SELECT * FROM feeds ORDER BY id').all<Feed>();
  return rows.results ?? [];
}

export async function getSeenKeys(db: D1Database): Promise<Set<string>> {
  const rows = await db.prepare('SELECT item_key FROM seen_items').all<{ item_key: string }>();
  return new Set((rows.results ?? []).map((r) => r.item_key));
}

export async function markSeen(db: D1Database, items: { key: string; feedId: number }[], now: string): Promise<void> {
  const stmt = db.prepare('INSERT OR IGNORE INTO seen_items(item_key, feed_id, first_seen_at) VALUES (?, ?, ?)');
  for (const it of items) await stmt.bind(it.key, it.feedId, now).run();
}

export async function pruneSeen(db: D1Database, cutoffIso: string): Promise<void> {
  await db.prepare('DELETE FROM seen_items WHERE first_seen_at < ?').bind(cutoffIso).run();
}

export async function recordRun(db: D1Database, run: {
  started_at: string; finished_at: string; status: string;
  items_collected: number; items_sent: number; skipped: string;
}): Promise<void> {
  await db.prepare(
    'INSERT INTO runs(started_at, finished_at, status, items_collected, items_sent, skipped) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(run.started_at, run.finished_at, run.status, run.items_collected, run.items_sent, run.skipped).run();
}

export async function lastRuns(db: D1Database, limit = 20): Promise<Record<string, unknown>[]> {
  const rows = await db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT ?').bind(limit)
    .all<Record<string, unknown>>();
  return rows.results ?? [];
}

export async function sentToday(db: D1Database, ptDate: string): Promise<boolean> {
  // status='sent' runs whose started_at (converted to PT in code) equals today; shortcut: store pt_date in skipped? No — scan last runs.
  const rows = await db.prepare("SELECT started_at, status FROM runs WHERE status = 'sent' ORDER BY id DESC LIMIT 5").all<{ started_at: string }>();
  const { ptParts } = await import('./util');
  return (rows.results ?? []).some((r) => ptParts(new Date(r.started_at)).date === ptDate);
}
