/** Shared helpers. */

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function textOf(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)['#text'] ?? '');
  }
  return '';
}

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_cid|mc_eid|ref$|source$)/i;

/** Dedupe key component: strip tracking, lowercase host, strip trailing slash. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const params = [...u.searchParams.keys()].filter((k) => !TRACKING_PARAMS.test(k));
    const qs = params.sort().map((k) => `${k}=${u.searchParams.get(k)}`).join('&');
    u.search = qs ? `?${qs}` : '';
    let path = u.pathname.replace(/\/+$/, '');
    return `${u.host.toLowerCase()}${path}${qs ? `?${qs}` : ''}`;
  } catch {
    return raw;
  }
}

export function ptParts(d: Date): { date: string; hhmm: string; hour: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour === '24' ? '00' : parts.hour);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${String(hour).padStart(2, '0')}:${parts.minute}`, hour };
}

export function digestDateHeader(d = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric',
  }).format(d);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run fn over items with at most `limit` in flight, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
