import { isDue, runDigest, type Env } from './digest';
import { addFeed, feedAction, renderPanelPage, saveSettings } from './panel';

type Ctx = { request: Request; env: Env };

function redirect(path: string, msg?: string): Response {
  const location = msg ? `${path}?msg=${encodeURIComponent(msg)}` : path;
  return new Response(null, { status: 303, headers: { location } });
}

async function handleGet({ request, env }: Ctx): Promise<Response> {
  const url = new URL(request.url);
  const flash = url.searchParams.get('msg');
  return new Response(await renderPanelPage(env, url.pathname, flash), { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function handlePost({ request, env }: Ctx): Promise<Response> {
  const url = new URL(request.url);
  const form = new URLSearchParams(await request.text());

  if (url.pathname === '/feeds/add') {
    return redirect('/feeds', await addFeed(env.DB, form.get('name') ?? '', form.get('url') ?? '', form.get('category') ?? ''));
  }
  if (url.pathname === '/feeds/action') {
    return redirect('/feeds', await feedAction(env.DB, form.get('id') ?? '', form.get('action') ?? ''));
  }
  if (url.pathname === '/settings') {
    return redirect('/settings', await saveSettings(env.DB, form.get('send_time') ?? '', form.get('recipients') ?? ''));
  }
  if (url.pathname === '/test') {
    const mode = form.get('mode') === 'content' ? 'content' : 'empty';
    const result = await runDigest(env, { test: true, emptyBody: mode === 'empty' });
    return redirect('/', result.ok
      ? `Test email sent (${result.sent} items${result.skipped ? `, skipped: ${result.skipped}` : ''})`
      : `Error: test failed (${result.error ?? 'unknown'})`);
  }
  return redirect('/');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const ctx: Ctx = { request, env };
    if (request.method === 'GET') return handleGet(ctx);
    if (request.method === 'POST') return handlePost(ctx);
    return new Response('Method not allowed', { status: 405 });
  },

  async scheduled(_event: unknown, env: Env): Promise<void> {
    if (await isDue(env)) await runDigest(env, { test: false, emptyBody: false });
  },
} satisfies ExportedHandler<Env>;
