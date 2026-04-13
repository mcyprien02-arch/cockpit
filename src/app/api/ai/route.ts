import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-5-20251001";
const API_KEY =
  process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "";

const SYSTEM_PROMPTS: Record<string, string> = {
  diagnostiqueur: `Tu es un expert en diagnostic de magasins EasyCash (rachat-revente téléphones/électronique/bijoux).
Analyse les KPIs fournis et produis un diagnostic structuré.
Réponds UNIQUEMENT en JSON valide : tableau d'objets {"titre","gravite","cause_racine","impact_euros","recommendation"}.
gravite: "critique"|"vigilance"|"bon". impact_euros = estimation annuelle en €. Trie par impact_euros décroissant.`,

  redacteur_assistant: `Tu es l'assistant consultant EasyCash d'un franchisé retail.
Réponds en français, de façon concise et directe. Maximum 5 phrases.
Donne des actions concrètes avec des chiffres. Pas de discours général.
Tu as accès aux données KPIs du magasin pour contextualiser.`,

  redacteur_synthese: `Tu es un consultant EasyCash rédigeant une synthèse de visite professionnelle.
Rédige en français, paragraphes courts, ton direct, chiffres précis. Max 400 mots.
Structure : 1) Contexte & phase 2) Points forts 3) Axes d'amélioration 4) Priorités immédiates.`,

  decideur: `Tu es le consultant EasyCash qui priorise les actions pour un franchisé.
Génère 3 à 5 actions concrètes, prioritaires, réalisables.
Réponds UNIQUEMENT en JSON : tableau de {"priorite","action","pourquoi","echeance_jours","kpi_cible"}.
priorite: "P1"|"P2"|"P3". action: phrase courte et précise.`,
};

function buildMessages(agent: string, mode: string | undefined, data: Record<string, unknown>): { system: string; userContent: string } {
  const agentKey = mode ? `${agent}_${mode}` : agent;
  const system = SYSTEM_PROMPTS[agentKey] ?? SYSTEM_PROMPTS[agent] ?? SYSTEM_PROMPTS["redacteur_assistant"];

  let userContent = "";
  if (agent === "diagnostiqueur") {
    const kpis = (data.kpis as any[]) ?? [];
    userContent = `Phase vie: ${data.phase_vie ?? "maturite"}\n\nKPIs (${kpis.length}):\n` +
      kpis.map((k: any) => `- ${k.nom}: ${k.valeur}${k.unite ?? ""} [${k.status ?? "?"}]`).join("\n");
  } else if (agent === "decideur") {
    const alertes = (data.alertes as any[]) ?? [];
    const pap = (data.pap as any[]) ?? [];
    userContent = `Alertes:\n${alertes.map((a: any) => `- ${a.nom}: ${a.valeur}`).join("\n")}\nPAP:\n${pap.map((a: any) => `- [${a.priorite}] ${a.action}`).join("\n")}`;
  } else {
    const question = String(data.question ?? "");
    const kpis = (data.kpis as any[]) ?? [];
    const alertes = (data.alertes as any[]) ?? [];
    userContent = `Question: ${question}\n\nKPIs alertes:\n${alertes.map((a: any) => `- ${a.nom}: ${a.valeur}`).join("\n") || "aucune"}\n\nDonnées:\n${JSON.stringify({ kpis: kpis.slice(0, 10), pap: data.pap })}`;
  }

  return { system, userContent };
}

export async function POST(req: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ error: "Clé API non configurée — ajoutez ANTHROPIC_API_KEY dans les variables d'environnement Vercel." }, { status: 500 });
  }

  const body = await req.json();

  // New agent format: { agent, mode?, data }
  // Legacy format: { system, messages, ... } — forward directly
  let requestBody: Record<string, unknown>;

  if (body.agent) {
    const { system, userContent } = buildMessages(body.agent, body.mode, body.data ?? {});
    requestBody = {
      model: MODEL,
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: userContent }],
    };
  } else {
    // Legacy: { system, messages, ... }
    requestBody = { model: MODEL, max_tokens: 1000, ...body };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: data?.error?.message ?? "Erreur API Anthropic" }, { status: res.status });
  }

  const text = data.content?.[0]?.text ?? "";
  // Return both formats for compatibility
  return NextResponse.json({ response: text, content: data.content, text });
}
