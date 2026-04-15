'use client';

import { useState } from 'react';
import type { MagasinData } from '@/types';
import { callAI } from '@/lib/ai';

interface Props {
  data: MagasinData;
}

export default function AssistantIA({ data }: Props) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const kpisJSON = JSON.stringify({
    magasin: data.magasin,
    phase: data.phase,
    stockTotal: data.stockTotal,
    stockAge: data.stockAge,
    top20Traite: data.top20Traite,
    rattachementWeb: data.rattachementWeb,
    gmroi: data.gmroi,
    nbEtp: data.nbEtp,
    panierMoyen: data.panierMoyen,
    estalyParSemaine: data.estalyParSemaine,
    noteGoogle: data.noteGoogle,
    tauxAnnulationWeb: data.tauxAnnulationWeb,
    briefingQuotidien: data.briefingQuotidien,
    masseSalarialePct: data.masseSalarialePct,
    nbInventairesTournants: data.nbInventairesTournants,
  });

  const SYSTEM = `Tu es expert franchise EasyCash seconde main. Tu connais les benchmarks réseau (marge nette 38-39%, masse sal ≤15%, EBE ≥8%, GMROI réseau 3.84, stock âgé <30%, productivité 1 ETP/250k€ CA), les Règles d'Or (Vente : priorité client, bon produit bon prix, bonne affaire, outils Aquila/EasyPrice/F3 | Achat : VPD, ne louper aucun produit, polyvalence | Stock : stock sain, démarque, SAV, accélérations, niveau piloté | Web : 2e magasin, rattachement 60%, annulation <20% | Management : exemplarité, bonne personne bon endroit, coaching, pilotage DBP), les côtes d'accélération (JV/Tel/Info 15j→30j→60j, Bij 90j→120j→150j, LS/Livres 30j→60j→90j, Musique 90j→120j→150j), la méthode GPA (Gamme Prix Animation), Estaly (marge pure, primes vendeurs), la VPD (5 questions pour positionner le PV). Voici les données du magasin : ${kpisJSON}. Réponds en 5 phrases max. Direct, chiffré, actionnable. Pas de jargon comptable. Pas de reformulation de la question.`;

  async function send() {
    if (!question.trim()) return;
    setLoading(true);
    setError('');
    setAnswer('');
    try {
      const result = await callAI(SYSTEM, question);
      setAnswer(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      setError(msg.includes('503') || msg.includes('configurée') ? '🔑 Clé API non configurée. Ajoutez ANTHROPIC_API_KEY dans Vercel.' : msg);
    } finally {
      setLoading(false);
    }
  }

  const EXAMPLES = [
    'Mon GMROI est à 2.1, que faire en priorité ?',
    'Comment améliorer ma note Google rapidement ?',
    "J'ai 5 000€ de stock bijouterie âgé, comment le déstocker ?",
    'Mon Estaly est faible, comment motiver mon équipe ?',
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold">Assistant IA</h1>
        <p className="text-gray-400 text-sm mt-1">
          Posez votre question sur votre magasin. L'IA connaît vos KPIs.
          {!data.magasin && <span className="text-yellow-400"> Configurez votre magasin dans Dashboard pour des réponses personnalisées.</span>}
        </p>
      </div>

      {/* Examples */}
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => setQuestion(ex)}
            className="text-xs px-3 py-1.5 rounded-full bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="space-y-3">
        <textarea
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-green-500 resize-none"
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
          }}
          placeholder="Posez votre question... (Ctrl+Entrée pour envoyer)"
        />
        <button
          onClick={send}
          disabled={loading || !question.trim()}
          className="w-full py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ background: '#22c55e', color: '#000' }}
        >
          {loading ? '⏳ Réflexion...' : '📨 Envoyer'}
        </button>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {answer && (
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🤖</span>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Réponse</span>
          </div>
          <p className="text-gray-100 text-sm leading-relaxed whitespace-pre-wrap">{answer}</p>
          <p className="text-xs text-gray-500 pt-2 border-t border-gray-700">
            Basé sur vos KPIs : GMROI {data.gmroi} · Stock âgé {data.stockAge}% · Estaly {data.estalyParSemaine}/sem
          </p>
        </div>
      )}
    </div>
  );
}
