import type { MagasinContext } from "./buildContext";

// ─── Core caller ──────────────────────────────────────────────
async function callAI(agent: string, mode: string | undefined, data: Record<string, unknown>): Promise<string> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent, mode, data }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Erreur API");
  return json.response ?? json.text ?? json.content?.[0]?.text ?? "";
}

function kpiData(ctx: MagasinContext) {
  return {
    phase_vie: ctx.phase,
    kpis: ctx.kpis.map(k => ({ nom: k.nom, valeur: k.valeur, unite: k.unite, status: k.status })),
    alertes: ctx.topAlertes,
    pap: ctx.pap,
  };
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
  const text = await callAI("diagnostiqueur", undefined, kpiData(ctx));
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
  const text = await callAI("decideur", undefined, kpiData(ctx));
  try {
    const json = text.match(/\[[\s\S]*\]/)?.[0] ?? "[]";
    return JSON.parse(json) as ActionDecideur[];
  } catch {
    return [];
  }
}

// ─── Agent 3a — Rédacteur synthèse ───────────────────────────
export async function runRedacteurSynthese(ctx: MagasinContext): Promise<string> {
  return callAI("redacteur", "synthese", kpiData(ctx));
}

// ─── Agent 3b — Rédacteur assistant ──────────────────────────
export async function runRedacteurAssistant(ctx: MagasinContext, question: string): Promise<string> {
  return callAI("redacteur", "assistant", { ...kpiData(ctx), question });
}
