import type { Ai, D1Database } from '@cloudflare/workers-types';
import { classify, summarize } from './ai';
import { fetchFeed, type RawItem } from './feeds';
import { renderHtml, renderSubject, renderText, type DigestItem } from './email';
import { getSeenKeys, getSettings, listFeeds, markSeen, pruneSeen, recordRun, setSetting } from './db';
import { ptParts } from './util';

export interface Env {
  AI: Ai;
  DB: D1Database;
  EMAIL: { send: (msg: unknown) => Promise<unknown> };
}

export interface DigestResult {
  ok: boolean;
  error?: string;
  collected: number;
  sent: number;
  skipped: string;
}

const FROM = 'digest@aadithpm.xyz';
const PRUNE_DAYS = 14;

/** True when the hourly tick should send: PT time has passed send_time today, within the last hour, and nothing sent yet today. */
export async function isDue(env: Env): Promise<boolean> {
  const now = ptParts(new Date());
  const settings = await getSettings(env.DB);
  const [hh, mm] = settings.send_time.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return false;
  const minutesNow = now.hour * 60 + Number(now.hhmm.slice(3));
  const target = hh * 60 + mm;
  if (minutesNow < target || minutesNow - target >= 60) return false;
  const rows = await env.DB.prepare("SELECT started_at FROM runs WHERE status = 'sent' ORDER BY id DESC LIMIT 5")
    .all<{ started_at: string }>();
  return !(rows.results ?? []).some((r) => ptParts(new Date(r.started_at)).date === now.date);
}

/** Full digest pipeline (spec §4). test=true: same pipeline, watermark and seen-set never written. */
export async function runDigest(env: Env, opts: { test: boolean; emptyBody: boolean }): Promise<DigestResult> {
  const started = new Date().toISOString();
  const settings = await getSettings(env.DB);
  const feeds = (await listFeeds(env.DB)).filter((f) => f.enabled === 1);
  const seen = await getSeenKeys(env.DB);
  const watermark = settings.watermark ? new Date(settings.watermark).getTime() : Date.now() - 24 * 3600 * 1000;
  const now = new Date();

  const fetched = await Promise.all(feeds.map((f) => fetchFeed(f.id, f.name, f.url)));
  const failedFeeds = fetched.filter((f) => !f.ok).map((f) => f.feedName);

  interface Candidate { raw: RawItem; feedName: string; feedCategory: string; feedId: number }
  const candidates: Candidate[] = [];
  for (const ff of fetched) {
    if (!ff.ok) continue;
    const feed = feeds.find((f) => f.id === ff.feedId)!;
    for (const raw of ff.items) {
      if (!raw.link || !raw.title || seen.has(raw.key)) continue;
      const valid = raw.pubDate && raw.pubDate.getTime() <= now.getTime();
      if (valid && raw.pubDate!.getTime() <= watermark) continue; // valid pubDate outside window: dropped
      candidates.push({ raw, feedName: feed.name, feedCategory: feed.category, feedId: feed.id });
    }
  }

  let classifyFailed = 0;
  const decided = await Promise.all(candidates.map(async (c): Promise<DigestItem | null> => {
    try {
      const decision = await classify(env.AI, c.feedName, c.feedCategory, c.raw.title, c.raw.description);
      const summary = await summarize(env.AI, c.raw.title, c.raw.description);
      return {
        title: c.raw.title, link: c.raw.link, summary,
        source: c.feedName, category: decision.category, breaking: decision.breaking,
      };
    } catch {
      classifyFailed++;
      return null;
    }
  }));
  const items = decided.filter((i): i is DigestItem => i !== null);

  const skipParts: string[] = [];
  if (failedFeeds.length) skipParts.push(`${failedFeeds.join(', ')} (fetch failed)`);
  if (classifyFailed) skipParts.push(`${classifyFailed} items (classify failed)`);
  const skipped = skipParts.join(', ');

  const model = {
    items: opts.emptyBody ? [] : items,
    skippedNote: skipped,
    sentBecause: opts.test ? 'test run' : `schedule = daily ${settings.send_time} PT`,
  };

  const collected = candidates.length;
  if (!settings.recipients.length) {
    const res = { ok: false, error: 'no recipients configured', collected, sent: 0, skipped };
    await recordRun(env.DB, { started_at: started, finished_at: new Date().toISOString(), status: opts.test ? 'test' : 'failed', items_collected: collected, items_sent: 0, skipped });
    return res;
  }

  try {
    await env.EMAIL.send({
      to: settings.recipients,
      from: FROM,
      subject: renderSubject(model),
      html: renderHtml(model),
      text: renderText(model),
    });
  } catch (e) {
    const res = { ok: false, error: String(e), collected, sent: 0, skipped };
    await recordRun(env.DB, { started_at: started, finished_at: new Date().toISOString(), status: opts.test ? 'test' : 'failed', items_collected: collected, items_sent: 0, skipped });
    return res; // no watermark advance: retry next hour (spec §4)
  }

  if (!opts.test) {
    await markSeen(env.DB, candidates.map((c) => ({ key: c.raw.key, feedId: c.feedId })), now.toISOString());
    await setSetting(env.DB, 'watermark', now.toISOString());
    const cutoff = new Date(now.getTime() - PRUNE_DAYS * 24 * 3600 * 1000).toISOString();
    await pruneSeen(env.DB, cutoff);
  }
  await recordRun(env.DB, {
    started_at: started, finished_at: new Date().toISOString(), status: opts.test ? 'test' : 'sent',
    items_collected: collected, items_sent: items.length, skipped,
  });
  return { ok: true, collected, sent: items.length, skipped };
}
