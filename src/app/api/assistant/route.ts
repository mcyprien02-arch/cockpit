import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { question, mode, context } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const contextStr = context ? `
Données magasin :
- Score santé : ${context.score ?? "N/A"}/100
- GMROI : ${context.gmroi ?? "N/A"}
- KPIs en alerte : ${context.kpisAlerte?.join(", ") || "aucun"}
- KPIs OK : ${context.kpisOk?.join(", ") || "-"}
- Actions PAP en cours : ${context.actions?.join(", ") || "aucune"}
- CA mensuel estimé : ${context.caMensuel ? `${context.caMensuel.toLocaleString("fr-FR")}€` : "N/A"}
- Stock âgé : ${context.stockAge ?? "N/A"}%
- TLAC : ${context.tlac ?? "N/A"}
` : "";

  const systemPrompts: Record<string, string> = {
    assistant: `Tu es le consultant franchise de ce magasin EasyCash. Tu connais tous ses chiffres.
Tu réponds en 3 phrases maximum. Tu donnes toujours une action concrète.
Tu ne dis jamais "il faudrait", tu dis "faites ceci".
Tu chiffres tout en euros quand c'est possible.
${contextStr}`,
    miroir: `Tu es un observateur neutre. Tu restitues les faits du magasin sans jugement ni solution.
Tu relies les données entre elles quand la causalité est probable.
Tu parles des processus, jamais des personnes.
Tu utilises "les données montrent que" et non "vous devriez".
Maximum 8 phrases. Commence par "Voici ce que les chiffres disent de votre magasin :"
${contextStr}`,
    avis: `Tu analyses des avis Google pour un magasin EasyCash.
Identifie les thèmes positifs et négatifs, quantifie leur fréquence, et relie chaque thème négatif à un KPI ou dysfonctionnement probable.
Formule en JSON structuré : { "positifs": [{"theme":string,"nb":number}], "negatifs": [{"theme":string,"nb":number,"lien_kpi":string}], "action_prioritaire": string }`,
  };

  const prompt = mode === "miroir"
    ? `Génère l'effet miroir pour ce magasin.`
    : mode === "avis"
      ? `Analyse ces avis Google :\n${question}`
      : question;

  const systemPrompt = systemPrompts[mode ?? "assistant"] ?? systemPrompts.assistant;

  if (!apiKey) {
    return NextResponse.json({
      response: fallback(mode, question, context),
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: mode === "miroir" ? 400 : mode === "avis" ? 600 : 200,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    const text = data.content?.[0]?.text ?? fallback(mode, question, context);
    return NextResponse.json({ response: text });
  } catch {
    return NextResponse.json({ response: fallback(mode, question, context) });
  }
}

// ─── Local text analysis for avis ────────────────────────────
function analyzeAvisLocally(text: string): string {
  const t = text.toLowerCase();
  const lines = t.split(/[\n.!?]+/).map(l => l.trim()).filter(Boolean);

  const THEMES_POS: { theme: string; keywords: string[] }[] = [
    { theme: "Accueil chaleureux",       keywords: ["accueil", "sympa", "sympathique", "gentil", "souriant", "aimable"] },
    { theme: "Rapport qualité/prix",     keywords: ["prix", "pas cher", "abordable", "rapport qualité", "bonne affaire"] },
    { theme: "Rapidité du service",      keywords: ["rapide", "vite", "efficace", "sans attente", "réactif"] },
    { theme: "Qualité des produits",     keywords: ["qualité", "bon état", "propre", "beau", "excellent produit"] },
    { theme: "Conseil professionnel",    keywords: ["conseil", "bien expliqué", "compétent", "professionnel", "expert"] },
    { theme: "Choix & disponibilité",    keywords: ["choix", "disponible", "vaste", "large sélection", "bien fourni"] },
    { theme: "Recommande le magasin",    keywords: ["recommande", "je conseille", "à conseiller", "bravo", "top", "super", "excellent", "parfait", "génial"] },
  ];

  const THEMES_NEG: { theme: string; keywords: string[]; lien_kpi: string }[] = [
    { theme: "Temps d'attente",          keywords: ["attente", "longtemps", "attendre", "file", "queue", "lent"],           lien_kpi: "Effectif insuffisant" },
    { theme: "Prix trop élevés",         keywords: ["cher", "trop cher", "prix élevé", "coûteux", "hors de prix"],          lien_kpi: "Marge brute — prix d'achat à revoir" },
    { theme: "Manque de stock",          keywords: ["pas en stock", "rupture", "pas disponible", "vide", "pas trouvé"],     lien_kpi: "GMROI — rotation du stock insuffisante" },
    { theme: "Accueil décevant",         keywords: ["indifférent", "pas aimable", "mal accueil", "désagréable", "froid"],   lien_kpi: "Score client — satisfaction à la baisse" },
    { theme: "Produits défectueux",      keywords: ["défaut", "cassé", "ne fonctionne pas", "panne", "abîmé", "défectueux"], lien_kpi: "SAV — taux de retour produit" },
    { theme: "Manque de conseil",        keywords: ["pas conseillé", "seul", "ignoré", "aucune aide", "personne"],          lien_kpi: "TLAC — manque de vente additionnelle" },
    { theme: "Propreté / organisation",  keywords: ["sale", "désorganisé", "bazar", "en désordre", "propre"],               lien_kpi: "Merchandising — présentation magasin" },
  ];

  const positifs = THEMES_POS.map(tp => ({
    theme: tp.theme,
    nb: lines.filter(l => tp.keywords.some(k => l.includes(k))).length,
  })).filter(t => t.nb > 0).sort((a, b) => b.nb - a.nb);

  const negatifs = THEMES_NEG.map(tn => ({
    theme: tn.theme,
    nb: lines.filter(l => tn.keywords.some(k => l.includes(k))).length,
    lien_kpi: tn.lien_kpi,
  })).filter(t => t.nb > 0).sort((a, b) => b.nb - a.nb);

  const topNeg = negatifs[0];
  const action_prioritaire = topNeg
    ? `Traitez en priorité "${topNeg.theme}" (${topNeg.nb} mention${topNeg.nb > 1 ? "s" : ""}) — impact direct sur ${topNeg.lien_kpi}.`
    : positifs.length > 0
      ? `Capitalisez sur vos points forts : ${positifs[0].theme} est votre meilleur atout client.`
      : "Analysez les avis manuellement pour identifier les axes d'amélioration prioritaires.";

  return JSON.stringify({ positifs, negatifs, action_prioritaire });
}

function fallback(mode: string, question: string, ctx: any): string {
  if (mode === "miroir") {
    return `Voici ce que les chiffres disent de votre magasin : Le score santé est de ${ctx?.score ?? "—"}/100. ${
      ctx?.kpisAlerte?.length > 0 ? `Les indicateurs suivants méritent attention : ${ctx.kpisAlerte.slice(0, 3).join(", ")}.` : ""
    } ${ctx?.tlac ? `Le TLAC est à ${ctx.tlac}, ce qui signifie moins d'un accessoire vendu par achat principal.` : ""}`;
  }
  if (mode === "avis") {
    return analyzeAvisLocally(question ?? "");
  }
  // assistant fallback
  const q = question?.toLowerCase() ?? "";
  if (q.includes("marge")) return "Votre marge est sous la moyenne réseau (38-39%). Vérifiez les prix d'achat vs cote EasyPrice et réduisez le stock âgé qui force les accélérations.";
  if (q.includes("stock")) return "Votre stock âgé immobilise du cash. Identifiez les 10 produits les plus anciens et lancez des accélérations cette semaine.";
  if (q.includes("embauche") || q.includes("salarié")) return "Utilisez le simulateur 'Et si...' pour calculer l'impact exact. Règle générale : 1 ETP pour 250k€ de CA.";
  return "Bonne question. Vérifiez les KPIs en alerte dans l'onglet Diagnostic pour une réponse précise basée sur vos données réelles.";
}
