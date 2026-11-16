import { XMLParser } from 'fast-xml-parser';
import { normalizeUrl, textOf } from './util';

export interface RawItem {
  key: string;        // guid or normalized URL
  link: string;
  title: string;
  description: string;
  pubDate: Date | null;
}

export interface FetchedFeed {
  feedId: number;
  feedName: string;
  ok: boolean;
  items: RawItem[];
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Parse RSS 2.0 or Atom into RawItems. */
export function parseFeed(xml: string): RawItem[] {
  const doc: any = parser.parse(xml);
  const rssItems = asArray<any>(doc?.rss?.channel?.item);
  if (rssItems.length) {
    return rssItems.map((it) => {
      const link = textOf(it.link) || textOf(it.guid);
      return {
        key: textOf(it.guid) || normalizeUrl(link),
        link, title: textOf(it.title), description: textOf(it.description),
        pubDate: parseDate(textOf(it.pubDate) || textOf(it['dc:date'])),
      };
    });
  }
  const entries = asArray<any>(doc?.feed?.entry);
  return entries.map((it) => {
    const link = textOf(it.link) || textOf(it.link?.['@_href']) || textOf(it.id);
    return {
      key: textOf(it.id) || normalizeUrl(link),
      link, title: textOf(it.title), description: textOf(it.summary) || textOf(it.content),
      pubDate: parseDate(textOf(it.published) || textOf(it.updated)),
    };
  });
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function fetchFeed(feedId: number, feedName: string, url: string, timeoutMs = 15000): Promise<FetchedFeed> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'newsroom-digest/1.0 (+https://aadithpm.xyz)' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) return { feedId, feedName, ok: false, items: [] };
    const xml = await res.text();
    return { feedId, feedName, ok: true, items: parseFeed(xml) };
  } catch {
    return { feedId, feedName, ok: false, items: [] };
  }
}
