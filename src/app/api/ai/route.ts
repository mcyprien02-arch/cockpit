import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DIAGNOSTIQUEUR = `
Tu es un expert franchise EasyCash seconde main. Tu connais le Manifeste Opérationnel :
- Marge Net TTC cible : 38-39%
- Masse Salariale : ≤15% du CA
- EBE minimum : 8%
- Résultat Courant : minimum 5%
- Productivité : 1 ETP / 250k€ CA
- Stock âgé > 30% = danger vital
- GMROI réseau : 3.84 (annualisé)
- Note Google cible : > 4.4

Analyse les KPIs du magasin. Pour chaque alerte, calcule le coût caché annuel avec la formule explicite.
Adapte tes recommandations à la phase de vie : Lancement (<2 ans), Croissance (2-5 ans), Maturité (>5 ans).

Retourne UNIQUEMENT ce JSON (aucun markdown, aucun texte avant ou après) :
{"score":0,"alertes":[{"kpi":"","valeur":0,"seuil":0,"statut":"danger","cout_cache_annuel":0,"formule":"","famille":""}],"recommandations":[{"priorite":1,"action":"","gain_estime":0,"delai":"","adapte_phase":""}],"non_negociables":{"top20_vs_traite":false,"masse_sal_ok":false,"mix_rayon_ok":false,"estaly_actif":false,"merch_ok":false},"narratif":""}
`;

const DECIDEUR = `
Tu es consultant terrain EasyCash. Tu génères le plan d'action du magasin.
Règle d'or J1 : chaque action = QUI / QUOI / QUAND / COMBIEN (jamais POURQUOI).
Priorise par gain financier décroissant.

Retourne UNIQUEMENT ce JSON (aucun markdown, aucun texte avant ou après) :
{"nouvelles_actions":[{"titre":"","qui":"","quoi":"","quand":"2026-04-01","combien":"0 €","kpi_cible":"","famille":""}],"missions_mois":[{"action":"","deadline":"","statut":"à faire"}],"actions_obsoletes":[],"timeline":[{"mois":"2026-04","actions":[],"gain_cumule":0}]}
`;

const REDACTEUR_CR = `
Tu es consultant franchise EasyCash. Rédige un compte-rendu de visite terrain.
Structure : Contexte (2 phrases) → Constats clés (3-4 phrases chiffrées) → Actions décidées (liste QUI/QUOI/QUAND) → Prochaine visite.
Total : 8-10 phrases. Précis, factuel, chiffré. Pas de blabla.
Retourne UNIQUEMENT le texte du CR. Pas de JSON. Pas de markdown.
`;

const ASSISTANT = `
Tu es un expert franchise EasyCash seconde main. Tu connais le Manifeste Opérationnel par cœur.
Le franchisé te pose une question sur SON magasin. Tu as ses KPIs en contexte.
Réponds en 5 phrases max. Sois direct, chiffré, actionnable.
Pas de reformulation de la question. Pas d'effet miroir. Va droit à la recommandation.
Si la question concerne le stock : précise la famille concernée et le délai de réaction (Tech 15j, LS 30j, Bijouterie 90j).
Si la question concerne la rentabilité : donne le levier n°1 avec le gain estimé.
Si tu ne sais pas : dis-le en 1 phrase.
`;

const PROMPTS: Record<string, string> = {
  diagnostiqueur: DIAGNOSTIQUEUR,
  decideur: DECIDEUR,
  redacteur_cr: REDACTEUR_CR,
  assistant: ASSISTANT,
};

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Clé API non configurée" }, { status: 503 });
  }
  let agent: string, data: unknown;
  try {
    ({ agent, data } = await req.json());
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const systemPrompt = PROMPTS[agent];
  if (!systemPrompt) {
    return NextResponse.json({ error: `Agent inconnu: ${agent}` }, { status: 400 });
  }
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: JSON.stringify(data) }],
    });
    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = stripFences(raw);
    try {
      return NextResponse.json({ result: JSON.parse(cleaned) });
    } catch {
      return NextResponse.json({ result: cleaned });
    }
  } catch (err) {
    console.error("AI route error:", err);
    return NextResponse.json({ error: "Erreur IA — réessayez" }, { status: 500 });
  }
}
