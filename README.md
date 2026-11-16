# newsroom

Daily RSS digest: Cloudflare Worker (TypeScript) collects feeds, classifies with Workers AI `clef-flash`, summarizes with llama, emails one digest a day. Panel behind Cloudflare Access (OTP, `@aadithpm.xyz`). Terraform owns infra; CI deploys. Full rationale: `../wayfinder-specs/spec.md`.

## Layout

- `src/` — worker: panel (`panel.ts`), pipeline (`digest.ts`), AI (`ai.ts`), email render (`email.ts`), feeds parse (`feeds.ts`), D1 (`db.ts`), taxonomy constant (`taxonomy.ts`)
- `terraform/` — all infra (state committed; no secrets in state)
- `migrations/` — D1 schema + seed feeds
- `.github/workflows/deploy.yml` — PR: plan. main: build → apply → D1 migrations → commit state
- `prototype/digest-email.html` — email design reference (Variant A)

## Dev

```
npm install
npm run dev        # wrangler dev — uses DEV-ONLY wrangler.toml; never `wrangler deploy`
npx wrangler d1 migrations apply newsroom --local
```

## First deploy checklist

1. Create GitHub repo, push, add secrets: `CLOUDFLARE_API_TOKEN` (Workers/Zero-Trust/D1 edit), `CLOUDFLARE_ACCOUNT_ID`.
2. Push to main → CI applies everything (worker, cron, custom domain `digest.aadithpm.xyz`, Access OTP + policy, email sending onboarding, D1 + migrations + seed).
3. Open `https://digest.aadithpm.xyz` → OTP login with your `@aadithpm.xyz` address.
4. Settings → add recipients (1–5). Dashboard → send test (empty, then with content).
5. Set send time; first scheduled digest seeds the watermark (defaults to last 24h window).

Deploy contract: applies happen in CI only; locally run `terraform plan` at most. Renaming hostname or from-address means editing `terraform/main.tf` + `src/digest.ts` `FROM` together.
