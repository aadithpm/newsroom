# newsroom

Daily RSS digest on a Cloudflare Worker with D1, behind Cloudflare Access. It collects RSS feeds, classifies with Workers AI's `clef-flash`, summarizes with Llama and emails at a cadence set up by the user.

![image](system_diag.d2.svg)

## Dev

One-time, manual: dashboard → Compute → Email Service → Email Sending → Onboard Domain → `aadithpm.xyz` (enables `digest@aadithpm.xyz` sending; not Terraform-automated).

CI (`.github/workflows/deploy.yml`) does everything else on push to main: build → `terraform apply` → D1 migrations → commit `terraform.tfstate`.

```sh
npm install
npm run dev
npx wrangler d1 migrations apply newsroom --local
```
