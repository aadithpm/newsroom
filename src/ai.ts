import { CLEF_CRITERIA, CLEF_TO_CATEGORY, type Category } from './taxonomy';
import { sleep, textOf } from './util';
import type { Ai } from '@cloudflare/workers-types';

const CONFIDENCE_FLOOR = 0.35;
const BREAKING_THRESHOLD = 0.75;

/** Retry on transient Workers AI capacity errors (3040) with backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let a = 0; ; a++) {
    try {
      return await fn();
    } catch (e) {
      if (a === attempts - 1 || !String(e).includes('3040')) throw e;
      await sleep(1000 * 2 ** a);
    }
  }
}

export interface ItemDecision {
  category: Category;
  breaking: boolean;
}

/** Classify one item with clef-flash (spec §3). Defensive parse: clef answer shape may be {chosen, probabilities} or {probabilities}. */
export async function classify(ai: Ai, feedName: string, feedCategory: string, title: string, excerpt: string): Promise<ItemDecision> {
  const res: any = await withRetry(() => ai.run('@cf/cloudflare/clef-flash', {
    model: 'clef-flash',
    state: `Source: ${feedName} | Feed category: ${feedCategory} | Title: ${title} | Excerpt: ${excerpt.slice(0, 300)}`,
    questions: {
      category: { type: 'choice', instructions: 'Categorize this news item.', criteria: CLEF_CRITERIA },
      breaking: { type: 'noul', instructions: 'Is this major breaking news of urgent public importance?' },
    },
  }));
  const a = res?.answers ?? {};
  const probs: Record<string, number> = a.category?.probabilities ?? {};
  let best = a.category?.chosen ?? '';
  let bestProb = Number(probs[best] ?? 0);
  for (const [k, v] of Object.entries(probs)) {
    if (Number(v) > bestProb) { best = k; bestProb = Number(v); }
  }
  const category = bestProb >= CONFIDENCE_FLOOR ? (CLEF_TO_CATEGORY[best] ?? 'Other') : 'Other';
  const breakingProb = Number(a.breaking?.probability ?? a.breaking?.true ?? 0);
  return { category, breaking: breakingProb >= BREAKING_THRESHOLD };
}

/** One-line summary via llama (spec §3). */
export async function summarize(ai: Ai, title: string, excerpt: string): Promise<string> {
  const res: any = await withRetry(() => ai.run('@cf/meta/llama-3.1-8b-instruct-fp8-fast', {
    messages: [{
      role: 'user',
      content: `Summarize this news item in one line of at most 15 words. No preamble, no quotes.\nTitle: ${title}\nExcerpt: ${excerpt.slice(0, 500)}`,
    }],
  }));
  const raw = textOf(res?.response ?? '');
  const line = raw.replace(/^["'\s]+|["'\s.]+$/g, '').split('\n')[0] ?? '';
  return line.slice(0, 160);
}
