'use client';

import { useState } from 'react';
import type { MagasinData, PAPAction } from '@/types';
import { callAI } from '@/lib/ai';

interface Props {
  data: MagasinData;
  actions: PAPAction[];
}

export default function VisiteCR({ data, actions }: Props) {
  const [consultant, setConsultant] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [constats, setConstats] = useState('');
  const [cr, setCr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const topActions = actions
    .filter((a) => a.statut !== 'Fait')
    .sort((a, b) => a.priorite - b.priorite)
    .slice(0, 5)
    .map((a) => `${a.pilote || 'Resp.'} : ${a.titre} (${a.echeance})`)
    .join(' | ');

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const system = `Tu es consultant franchise EasyCash. Rédige un compte-rendu de visite terrain. 8-10 phrases. Précis, chiffré, factuel. Structure : Contexte → Constats clés → Actions décidées → Prochaine visite. Retourne UNIQUEMENT le texte du CR.`;
      const message = `Consultant : ${consultant || 'Consultant'} | Date : ${date} | Magasin : ${data.magasin || 'NC'} (${data.phase})
KPIs : GMROI ${data.gmroi} | Stock âgé ${data.stockAge}% | Masse sal ${data.masseSalarialePct}% | Estaly ${data.estalyParSemaine}/sem | Note Google ${data.noteGoogle} | Top20 traité : ${data.top20Traite ? 'oui' : 'non'}
Constats terrain : ${constats}
Actions PAP en cours : ${topActions || 'aucune'}`;
      const result = await callAI(system, message);
      setCr(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      setError(msg.includes('503') || msg.includes('configurée') ? '🔑 Clé API non configurée. Ajoutez ANTHROPIC_API_KEY dans Vercel.' : msg);
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(cr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const inputCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500';

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-bold">Visite CR</h1>

      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Consultant</label>
            <input
              className={inputCls}
              value={consultant}
              onChange={(e) => setConsultant(e.target.value)}
              placeholder="Votre nom"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Date de visite</label>
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Magasin</label>
            <input
              className={`${inputCls} text-gray-400`}
              value={data.magasin || ''}
              readOnly
              placeholder="Configurez le magasin dans Dashboard"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Constats terrain</label>
          <textarea
            className={`${inputCls} resize-none`}
            rows={6}
            value={constats}
            onChange={(e) => setConstats(e.target.value)}
            placeholder="Décrivez vos observations : état du stock, comportement équipe, linéaire, accueil client, caisse, avis clients récents..."
          />
        </div>

        <button
          onClick={generate}
          disabled={loading || !constats.trim()}
          className="w-full py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ background: loading || !constats.trim() ? '#374151' : '#22c55e', color: loading || !constats.trim() ? '#9ca3af' : '#000' }}
        >
          {loading ? '⏳ Génération en cours...' : '✍️ Générer synthèse IA'}
        </button>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {cr && (
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Compte-rendu</h2>
            <button
              onClick={copy}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
            >
              {copied ? '✓ Copié !' : '📋 Copier'}
            </button>
          </div>
          <textarea
            className={`${inputCls} font-mono text-sm resize-none`}
            rows={14}
            value={cr}
            onChange={(e) => setCr(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
