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

function resolveAgent(agent: string, mode?: string): string {
  if (agent === "redacteur") return mode === "cr" ? "redacteur_cr" : "assistant";
  return agent;
}

function buildUserContent(agentKey: string, data: unknown): string {
  if (agentKey === "assistant" && data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const question = String(d.question ?? "");
    const kpis = d.kpis ? `\n\nKPIs du magasin:\n${JSON.stringify(d.kpis, null, 2)}` : "";
    const alertes = d.alertes ? `\n\nAlertes actives:\n${JSON.stringify(d.alertes, null, 2)}` : "";
    const pap = d.pap ? `\n\nActions en cours:\n${JSON.stringify(d.pap, null, 2)}` : "";
    return question + kpis + alertes + pap;
  }
  return JSON.stringify(data);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Clé API non configurée" }, { status: 503 });
  }

  let agent: string, mode: string | undefined, data: unknown;
  try {
    const body = await req.json();
    agent = body.agent;
    mode = body.mode;
    data = body.data;
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const agentKey = resolveAgent(agent, mode);
  const systemPrompt = PROMPTS[agentKey];
  if (!systemPrompt) {
    return NextResponse.json({ error: `Agent inconnu: ${agent}${mode ? "/" + mode : ""}` }, { status: 400 });
  }

  const isStructured = ["diagnostiqueur", "decideur"].includes(agentKey);

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: isStructured ? 2000 : 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: buildUserContent(agentKey, data) }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Anthropic API error:", resp.status, errText);
      return NextResponse.json({ error: `Erreur API Anthropic (${resp.status})` }, { status: 500 });
    }

    const json = await resp.json();
    const raw: string = json.content?.[0]?.text ?? "";

    if (isStructured) {
      const cleaned = stripFences(raw);
      try {
        return NextResponse.json({ result: JSON.parse(cleaned) });
      } catch {
        return NextResponse.json({ result: raw });
      }
    }

    return NextResponse.json({ result: raw });
  } catch (err) {
    console.error("AI route error:", err);
    return NextResponse.json({ error: "Erreur de connexion IA — réessayez" }, { status: 500 });
  }
}
