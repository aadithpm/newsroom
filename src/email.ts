import { digestDateHeader, esc } from './util';
import { SECTION_ORDER } from './taxonomy';

export interface DigestItem {
  title: string;
  link: string;
  summary: string;
  source: string;
  category: string;
  breaking: boolean;
}

export interface DigestModel {
  items: DigestItem[];
  skippedNote: string;
  sentBecause: string;
}

const CAP_PER_CATEGORY = 10;
const CAP_BREAKING = 5;

interface Section { name: string; items: DigestItem[]; overflow: number }

/** Cap sections per spec §4 (20/category, 10 breaking, +N more). */
export function buildSections(items: DigestItem[]): Section[] {
  const sections: Section[] = [];
  for (const name of SECTION_ORDER) {
    const pool = name === 'Breaking'
      ? items.filter((i) => i.breaking)
      : items.filter((i) => i.category === name);
    if (!pool.length) continue;
    const cap = name === 'Breaking' ? CAP_BREAKING : CAP_PER_CATEGORY;
    sections.push({ name, items: pool.slice(0, cap), overflow: Math.max(0, pool.length - cap) });
  }
  return sections;
}

export function renderSubject(model: DigestModel): string {
  return `Daily Digest — ${digestDateHeader()} (${model.items.length} items)`;
}

export function renderHtml(model: DigestModel): string {
  const sections = buildSections(model.items);
  const rows = sections.map((s, idx) => {
    const headerColor = s.name === 'Breaking' ? '#b02a2a' : s.name === 'Other' ? '#888' : '#333';
    const borderColor = s.name === 'Breaking' ? '#b02a2a' : s.name === 'Other' ? '#ccc' : '#999';
    const items = s.items.map((i) => {
      const catTag = i.breaking && s.name === 'Breaking'
        ? ` <i style="color:#b02a2a;font-style:normal;font-size:12px;">[${esc(i.category.toUpperCase())}]</i>`
        : '';
      const summary = i.summary ? ` — ${esc(i.summary)}` : '';
      return `<tr><td style="padding:7px 0;font-size:14px;border-bottom:1px solid #eee;">
        <a href="${esc(i.link)}" style="color:#111;text-decoration:underline;">${esc(i.title)}</a>
        <span style="color:#888;">${summary}${catTag} <span style="color:#aaa;font-size:11px;">${esc(i.source)}</span></span>
      </td></tr>`;
    }).join('');
    const overflow = s.overflow > 0 ? `<tr><td style="padding:4px 0;font-size:12px;color:#999;">+${s.overflow} more not shown</td></tr>` : '';
    return `<div style="font-size:15px;color:${headerColor};font-weight:bold;letter-spacing:1px;border-bottom:1px solid ${borderColor};padding:${idx === 0 ? 8 : 14}px 0 4px;">${s.name.toUpperCase()} <span style="color:#999;font-weight:normal;">(${s.items.length + s.overflow})</span></div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}${overflow}</table>`;
  }).join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:16px;font-family:Georgia,serif;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #ddd;">
  <tr><td style="padding:20px 24px 6px;border-bottom:3px solid #b02a2a;">
    <div style="font-size:26px;font-weight:bold;">The Daily Digest</div>
    <div style="font-size:13px;color:#666;">${esc(digestDateHeader())} · ${esc(model.sentBecause)} · ${model.items.length} items</div>
  </td></tr>
  <tr><td style="padding:12px 24px;">
    ${rows || '<div style="padding:16px 0;font-size:14px;color:#888;">No items in this window.</div>'}
    <div style="padding:16px 0 8px;font-size:11px;color:#999;border-top:1px solid #ddd;margin-top:16px;">
      Sent because ${esc(model.sentBecause)}${model.skippedNote ? ` · ${esc(model.skippedNote)}` : ''}
    </div>
  </td></tr>
</table>
</td></tr>
</table>`;
}

export function renderText(model: DigestModel): string {
  const sections = buildSections(model.items);
  const body = sections.map((s) => {
    const lines = s.items.map((i) => `  ${i.title} — ${i.summary} (${i.source})\n  ${i.link}`);
    const overflow = s.overflow > 0 ? `  +${s.overflow} more not shown` : '';
    return `${s.name.toUpperCase()} (${s.items.length + s.overflow})\n${[...lines, overflow].filter(Boolean).join('\n')}`;
  }).join('\n\n');
  return `DAILY DIGEST — ${digestDateHeader()}\n\n${body || 'No items in this window.'}\n\nSkipped: ${model.skippedNote || 'none'}`;
}
