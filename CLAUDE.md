# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build + type check (run before every push)
npm run lint     # ESLint
```

No test suite — verify changes with `npm run build`.

## Architecture

**Stack:** Next.js 14 (App Router) · TypeScript · Supabase (Postgres) · Tailwind · Framer Motion · Recharts

**Single-page app** — `src/app/page.tsx` renders all screens. Navigation state (`activeTab`, `mode`, `selectedId`) lives in that file. Each screen is a component in `src/components/screens/`.

### Navigation model

Two modes: `consultant` (full access) vs `franchisé` (restricted to `journee_grp` + `actions` tab groups). `CONSULTANT_ONLY` list in `page.tsx` gates restricted tabs. Tab groups defined in `src/components/layout/Navigation.tsx`.

### Data flow

All Supabase reads use the singleton client from `src/lib/supabase.ts` (credentials hardcoded as fallback — no `.env` required). Key view: `v_dernieres_valeurs` joins `valeurs` + `indicateurs` and returns the latest value per KPI per store.

**Critical tables:**
- `magasins` — stores, has `phase_vie` (`lancement` | `croissance` | `maturite`) used for adaptive KPI thresholds
- `indicateurs` — KPI definitions with `seuil_ok`, `seuil_vigilance`, `direction` (up/down), `poids`, `action_defaut`
- `valeurs` — time-series KPI values, unique on `(magasin_id, indicateur_id, date_saisie)`
- `plans_action` — PAP actions with `priorite` (P1/P2/P3), `statut` (À faire/En cours/Fait/Abandonné), `kpi_cible`
- `visites` — consultant visits; `plans_action.visite_id` references this table (may be nullable)

### Phase-aware thresholds

`src/lib/phaseThresholds.ts` overrides DB seuils based on `magasin.phase_vie`. Call `applyPhaseThresholds(valeur, phase)` before computing status. Call `getContextualReco(nom, valeur, phase, ca)` to get €-quantified recommendations. Always use these instead of raw DB thresholds in diagnostic screens.

### Scoring

`src/lib/scoring.ts` — `getStatus()` returns `ok|wn|dg|null`, `computeScore()` returns 0-100, `computeCategoryScores()` groups by `categorie`.

### AI (Anthropic)

`src/app/api/assistant/route.ts` — single POST endpoint, modes: `assistant` | `miroir` | `avis` | `synthese_visite`. Falls back to local analysis if `ANTHROPIC_API_KEY` not set. Model: `claude-haiku-4-5-20251001`.

### Seed / Demo data

`src/app/api/seed/route.ts` — POST `{ magasinId }` injects demo KPIs (2M€ CA, 40% marge, phase maturité) and 6 PAP actions. Called from Paramétrage screen via "🗃 Données démo" button. Original seed for Lyon Est: `src/lib/seed.ts`.

### PAP / MaJournée integration

`PAPScreen` writes to Supabase `plans_action`. Extra display fields (`axeId`, `duree`, `avancement`, `impactFinancier`) are stored in localStorage under key `pap_ext_${magasinId}`. `MaJourneeScreen` reads directly from `plans_action` using `action` column as the display title.

### Key patterns

- `(supabase as any).from(...)` — used when TypeScript types don't match the actual DB schema
- `localStorage` keys: `app_mode`, `active_tab`, `journee_streak`, `pap_axes_${id}`, `pap_ext_${id}`, `chvacv_${id}`, `treso_params_${id}`
- Screens receive `magasinId: string` and optionally `magasin: Magasin | null` for phase-aware logic
- Deploy target: Vercel (`cockpit-topaz.vercel.app`)

## Branch

Development branch: `claude/easycash-management-app-rBVQU`. Always push there, never to `main`.
