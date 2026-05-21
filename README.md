# care-home-hq

HQ admin dashboard for the **케어닥 (Care Doc)** franchise SaaS — Nuxt 4 + TypeScript + Tailwind.

Talks to [`care-home-server`](https://github.com/rowlow0gold-ops/care-home-server) over HTTPS.
The JWT lives in an httpOnly cookie set by Nuxt server routes; the browser never sees it.

## Local dev

```bash
pnpm install
cp .env.example .env
# point .env at your local care-home-server (default: http://localhost:8080)
pnpm dev
```

Open http://localhost:3000 → login with `manager@demo.com` / `admin1234` (the seeded demo branch manager).

## Deploy (Cloudflare Pages)

Repo is configured for the `cloudflare-pages` Nitro preset. In the Pages dashboard:

| Setting | Value |
|---|---|
| Build command | `pnpm build` |
| Output directory | `dist` |
| Environment variables | `NUXT_API_BASE=https://care.minhojan-world.site`, `NUXT_COOKIE_SECURE=true` |

Bind a custom domain like `hq.care.minhojan-world.site` once the first deploy is green.

## Audience

| Role | Sees |
|---|---|
| `caregiver` (요양보호사) | Should use the **tablet app**, not this dashboard. |
| `nurse` (간호사) | Residents, care logs, medications. |
| `branch_manager` (지점장) | Above + schedule, staff (own branch only). |
| `hq` (본부) | All branches, reports, settings. |
| `super_admin` | Everything + tenant management. |

Role-gating happens both server-side (Postgres RLS) and client-side (route meta + sidebar filtering).

## Stack

- Nuxt 4 (compatibility version 4)
- TypeScript strict mode
- Tailwind CSS 3.4 + custom care-green theme + Pretendard font
- shadcn-vue conventions (manually-written minimal components to keep bundle small)
- Pinia for client state, VueUse for utilities
- vee-validate + zod for forms
- chart.js + vue-chartjs for vitals timelines
- @nuxtjs/i18n with Korean default + English fallback
