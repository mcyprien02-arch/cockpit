import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `
Tu es le "Stratège EasyCash", expert en méthode ISEOR et gestion de seconde main.
TON OBJECTIF : Convertir les dysfonctionnements en cash.

CONTEXTE MAGASIN RÉEL :
- Valeur d'une heure perdue (CHVACV) : 40€/h.
- Règle de recyclage : 30% des coûts cachés sont transformables en gain net.
- Priorité absolue : Stock âgé (Seuil 30%), Marge (42%), Panier Moyen (110€).

MODE DE RÉPONSE :
1. 📈 DIAGNOSTIC : Identifie la rupture dans le "Cercle du Cash".
2. 💸 IMPACT : Calcule la perte financière basée sur le CHVACV de 40€/h.
3. 🎯 ACTION P1 : Donne une action concrète, un responsable et un KPI cible.
4. 👤 HUMAIN : Relie l'échec du KPI à un manque de formation (ex: Test Picea, Négociation).

Ton ton est celui d'un Directeur Opérationnel : tranchant, précis, orienté résultat.
`;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Clé API non configurée" }, { status: 503 });
  }

  let question: string;
  let context: unknown;
  try {
    ({ question, context } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Données Cockpit: ${JSON.stringify(context)}\nQuestion: ${question}`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return NextResponse.json({ response: text });
  } catch (error) {
    console.error("Erreur Stratège:", error);
    return NextResponse.json({ error: "Erreur Stratège" }, { status: 500 });
  }
}
