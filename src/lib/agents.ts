import type { MagasinContext } from "./buildContext";

// ─── Core caller ──────────────────────────────────────────────
async function callAI(system: string, user: string): Promise<string> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Erreur API");
  return data.content?.[0]?.text ?? "";
}

function kpiSummary(ctx: MagasinContext): string {
  const alerts = ctx.topAlertes.map((k) => `- ${k.nom}: ${k.valeur}${k.unite ?? ""} [ALERTE]`).join("\n");
  const pap = ctx.pap.map((a) => `- [${a.priorite}] ${a.action} (${a.statut})`).join("\n");
  return `Magasin: ${ctx.magasinNom}\nPhase: ${ctx.phase}\n\nAlertes KPI:\n${alerts || "Aucune"}\n\nPlan d'action en cours:\n${pap || "Aucun"}`;
}

// ─── Agent 1 — Diagnostiqueur ─────────────────────────────────
export interface DiagnosticResult {
  titre: string;
  gravite: "critique" | "vigilance" | "bon";
  cause_racine: string;
  impact_euros?: number;
  recommendation: string;
}

export async function runDiagnostic(ctx: MagasinContext): Promise<DiagnosticResult[]> {
  const system = `Tu es un expert retail EasyCash (rachat-revente téléphones/électronique).
Tu analyses les KPIs d'un magasin franchisé et produis un diagnostic structuré.
Réponds UNIQUEMENT en JSON valide : tableau d'objets {titre,gravite,cause_racine,impact_euros,recommendation}.
Gravite: "critique" | "vigilance" | "bon". impact_euros = estimation annuelle si possible.`;

  const text = await callAI(system, kpiSummary(ctx));
  try {
    const json = text.match(/\[[\s\S]*\]/)?.[0] ?? "[]";
    return JSON.parse(json) as DiagnosticResult[];
  } catch {
    return [{ titre: "Analyse IA", gravite: "vigilance", cause_racine: text.slice(0, 200), recommendation: "" }];
  }
}

// ─── Agent 2 — Décideur ───────────────────────────────────────
export interface ActionDecideur {
  priorite: "P1" | "P2" | "P3";
  action: string;
  pourquoi: string;
  echeance_jours: number;
  kpi_cible: string;
}

export async function runDecideur(ctx: MagasinContext): Promise<ActionDecideur[]> {
  const system = `Tu es le consultant EasyCash qui priorise les actions pour un franchisé.
Analyse les données et génère 3 à 5 actions concrètes, prioritaires, réalisables.
Réponds UNIQUEMENT en JSON valide : tableau d'objets {priorite,action,pourquoi,echeance_jours,kpi_cible}.
priorite: "P1"|"P2"|"P3". action: phrase d'action précise et courte.`;

  const text = await callAI(system, kpiSummary(ctx));
  try {
    const json = text.match(/\[[\s\S]*\]/)?.[0] ?? "[]";
    return JSON.parse(json) as ActionDecideur[];
  } catch {
    return [];
  }
}

// ─── Agent 3a — Rédacteur CR ──────────────────────────────────
export async function runRedacteurSynthese(ctx: MagasinContext): Promise<string> {
  const system = `Tu es un consultant EasyCash. Rédige une synthèse de visite professionnelle en français.
Format : paragraphes courts, ton direct, chiffres précis. Max 400 mots.
Structure : 1) Contexte, 2) Points forts, 3) Axes d'amélioration, 4) Priorités immédiates.`;

  return callAI(system, kpiSummary(ctx));
}

// ─── Agent 3b — Rédacteur Assistant ──────────────────────────
export async function runRedacteurAssistant(ctx: MagasinContext, question: string): Promise<string> {
  const system = `Tu es l'assistant EasyCash d'un franchisé retail (rachat-revente).
Réponds en français, de façon concise et pratique. Max 200 mots.
Tu as accès aux données du magasin pour contextualiser ta réponse.`;

  const userMsg = `Données magasin:\n${kpiSummary(ctx)}\n\nQuestion: ${question}`;
  return callAI(system, userMsg);
}
