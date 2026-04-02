import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { magasinNom, date, score, previousScore, kpisEnAlerte, kpisAmelibres, actionsPrioritaires } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const narrative = generateFallbackNarrative({ magasinNom, date, score, previousScore, kpisEnAlerte, actionsP1: actionsPrioritaires });
    return NextResponse.json({ narrative });
  }

  const prompt = `Tu es consultant franchise EasyCash. Rédige une synthèse de visite en 4-5 phrases (maximum 150 mots).
Magasin : ${magasinNom}
Date : ${date}
Score santé : ${score}/100 (précédent : ${previousScore ?? "N/A"}/100)
KPIs en alerte : ${kpisEnAlerte?.join(", ") || "aucun"}
KPIs améliorés depuis dernière visite : ${kpisAmelibres?.join(", ") || "aucun"}
Actions prioritaires PAP : ${actionsPrioritaires?.join(", ") || "aucune"}
Ton : professionnel, factuel, encourageant sur les progrès, ferme sur les urgences. Commence directement par la synthèse, sans formule d'introduction.`;

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
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    const narrative = data.content?.[0]?.text ?? generateFallbackNarrative({ magasinNom, date, score, previousScore, kpisEnAlerte, actionsP1: actionsPrioritaires });
    return NextResponse.json({ narrative });
  } catch {
    return NextResponse.json({ narrative: generateFallbackNarrative({ magasinNom, date, score, previousScore, kpisEnAlerte, actionsP1: actionsPrioritaires }) });
  }
}

function generateFallbackNarrative({ magasinNom, date, score, previousScore, kpisEnAlerte, actionsP1 }: {
  magasinNom: string; date: string; score: number; previousScore: number | null;
  kpisEnAlerte: string[]; actionsP1: string[];
}): string {
  const trend = previousScore !== null
    ? score > previousScore ? `en progression de ${score - previousScore} points` : score < previousScore ? `en recul de ${previousScore - score} points` : "stable"
    : "";
  const alertPart = kpisEnAlerte.length > 0 ? `Points de vigilance : ${kpisEnAlerte.slice(0, 3).join(", ")}.` : "Aucun indicateur critique ce mois.";
  const actionPart = actionsP1.length > 0 ? `Actions prioritaires identifiées : ${actionsP1.slice(0, 2).join(", ")}.` : "";
  return `Visite du ${date} — ${magasinNom}. Score santé global : ${score}/100${trend ? `, ${trend}` : ""}. ${alertPart} ${actionPart}`.trim();
}
