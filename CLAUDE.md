# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
node_modules/.bin/next.cmd build   # build (use this, not npm run build — PATH issue on Windows)
node_modules/.bin/next.cmd dev     # dev server
```

Always run the build before pushing. The build must pass with zero TypeScript errors.

## Architecture

**Stack**: Next.js 16 (App Router) · TypeScript · Tailwind CSS · Framer Motion · Supabase · Recharts · docx

**Data source**: Supabase. Key tables/views:
- `magasins` — store list
- `indicateurs` — KPI definitions (nom, direction up/down, seuil_ok, seuil_vigilance, poids, categorie)
- `valeurs` — raw KPI entries (magasin_id, indicateur_id, valeur, date_saisie)
- `v_dernieres_valeurs` — view: latest value per KPI per store, joined with indicator metadata
- `plans_action` — action plan rows (priorite P1/P2/P3, statut, echeance, action, responsable)
- `visites` — store visit records (consultant, constats, score_global)
- `v_actions_ouvertes` — view: open actions joined with store name

**Scoring** (`src/lib/scoring.ts`): `getStatus(valeur, direction, seuil_ok, seuil_vigilance)` → "ok" | "wn" | "dg" | null. `computeScore(valeurs)` → 0-100. `computeCategoryScores(valeurs)` → sorted array by score.

**Hidden costs** (`src/lib/hiddenCosts.ts`): `computeHiddenCosts(valeurs)` maps KPI alerts to ISEOR cost categories with annual € estimates.

## AI Agents

All Claude API calls go through **`/api/ai`** (server-side only). Never call Anthropic from client code.

```
POST /api/ai
Body: { agent: "diagnostiqueur" | "decideur" | "redacteur_cr" | "assistant", data: {...} }
Response: { result: <parsed JSON or string> }
```

Agent client helpers in `src/lib/agents/`:
- `diagnostiqueur.ts` → `callDiagnostiqueur(valeurs, phase)` → `DiagResult`
- `decideur.ts` → `callDecideur({ alertes, actions_existantes })` → `DecideurResult`
- `redacteur.ts` → `callRedacteurCR(data)` → string CR, `callAssistant(data)` → string

**Manifeste Opérationnel** (hardcoded in the agent prompts):
- Marge Net TTC cible : 38-39% · Masse Sal. : ≤15% · EBE : ≥8% · RC : ≥5%
- Productivité : 1 ETP / 250k€ CA · Stock âgé > 30% = danger vital
- GMROI réseau : 3.84 · Note Google cible : > 4.4

## Navigation (7 tabs)

`cockpit` | `diagnostic` | `kpis` | `plan` | `visite` | `simulateur` | `assistant` + `config` (gear icon)

Defined in `src/components/layout/Navigation.tsx`. TabId type exported from there.

## Screen map

| Tab | Component | Key data |
|-----|-----------|----------|
| cockpit | HomeScreen | score gauge, GMROI, 5 non-negotiables, missions du mois, "Lancer diagnostic IA" |
| diagnostic | DiagnosticScreen | radar chart, KPI cards, AI diagnostic panel (callDiagnostiqueur) |
| kpis | SaisieScreen | manual KPI entry |
| plan | PlanActionScreen | missions du mois, late actions, CRUD, "Générer actions IA" (callDecideur) |
| visite | VisiteScreen | CR form, AI narrative (callRedacteurCR), Word export (docx) |
| simulateur | SimulateurScreen | 4 slider sections, 100% local JS, no API calls |
| assistant | AssistantScreen | simple Q&A, callAssistant |
| config | ParametrageScreen | store/indicator management |

## Simulateur — local formulas

```
GMROI = (CA annuel × tauxMarge%) / stockMoyen
MasseSal% = (nbEtp × 28000) / CA annuel × 100
EBE = CA × tauxMarge% - CA × 0.13 - nbEtp × 28000
TrésorerieLibérée = stockActuel - stockSimulé
```

Family margins: Téléphonie 34% · JV 47% · LS 76% · Bijouterie 65% · Informatique 28% · Autre 35%

## Rules

1. `scoring.ts`, `hiddenCosts.ts`, supabase client — never break these
2. All Claude calls via `/api/ai` only, never from client components
3. Simulateur = 100% local JS, zero API calls
4. Model used: `claude-sonnet-4-6`
5. Env var: `ANTHROPIC_API_KEY` (server-side only, never exposed to client)
