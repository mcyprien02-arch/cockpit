'use client';

import { useState } from 'react';
import type { MagasinData, Phase, PAPAction } from '@/types';
import { DEFAULT_DATA } from '@/types';
import { callAI, parseJSON } from '@/lib/ai';

interface Props {
  data: MagasinData;
  onSave: (d: MagasinData) => void;
  actions: PAPAction[];
}

interface DiagAlert {
  kpi: string;
  valeur: string;
  statut: string;
  action: string;
}

interface DiagReco {
  priorite: number;
  action: string;
  gain: number;
}

interface DiagResult {
  alertes: DiagAlert[];
  recommandations: DiagReco[];
  narratif: string;
}

type TrafficStatus = 'ok' | 'warn' | 'danger';

function getStockAgeStatus(v: number): TrafficStatus {
  return v < 20 ? 'ok' : v <= 30 ? 'warn' : 'danger';
}
function getMasseSalStatus(v: number): TrafficStatus {
  return v <= 15 ? 'ok' : v <= 18 ? 'warn' : 'danger';
}
function getGoogleStatus(v: number): TrafficStatus {
  return v > 4.4 ? 'ok' : v >= 4.0 ? 'warn' : 'danger';
}
function getEstalyStatus(v: number): TrafficStatus {
  return v > 5 ? 'ok' : v >= 3 ? 'warn' : 'danger';
}

const STATUS_STYLES: Record<TrafficStatus, { dot: string; bg: string; border: string; text: string }> = {
  ok:     { dot: 'bg-green-400',  bg: 'bg-green-950',  border: 'border-green-800',  text: 'text-green-300' },
  warn:   { dot: 'bg-yellow-400', bg: 'bg-yellow-950', border: 'border-yellow-800', text: 'text-yellow-300' },
  danger: { dot: 'bg-red-400',    bg: 'bg-red-950',    border: 'border-red-800',    text: 'text-red-300' },
};

function TrafficLight({
  label,
  value,
  seuils,
  status,
  actionText,
}: {
  label: string;
  value: string;
  seuils: string;
  status: TrafficStatus;
  actionText?: string;
}) {
  const s = STATUS_STYLES[status];
  return (
    <div className={`${s.bg} border ${s.border} rounded-xl p-4 space-y-1.5`}>
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.dot}`} />
        <span className="font-semibold text-sm text-white">{label}</span>
        <span className={`ml-auto text-sm font-bold ${s.text}`}>{value}</span>
      </div>
      <p className="text-xs text-gray-400 pl-4">{seuils}</p>
      {actionText && status !== 'ok' && (
        <p className="text-xs text-gray-300 pl-4 pt-1 border-t border-gray-700">{actionText}</p>
      )}
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-300">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-green-500' : 'bg-gray-600'}`}
      >
        <span
          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
  unit,
  placeholder,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">
        {label}{unit ? ` (${unit})` : ''}
      </label>
      <input
        type="number"
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
        value={value || ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder={placeholder ?? '0'}
      />
    </div>
  );
}

export default function Dashboard({ data, onSave, actions }: Props) {
  const [showEdit, setShowEdit] = useState(!data.magasin);
  const [form, setForm] = useState<MagasinData>({ ...DEFAULT_DATA, ...data });
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult, setDiagResult] = useState<DiagResult | null>(null);
  const [diagError, setDiagError] = useState('');

  function setF<K extends keyof MagasinData>(k: K, v: MagasinData[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleSave() {
    onSave(form);
    setShowEdit(false);
  }

  // Actions du mois
  const today = new Date().toISOString();
  const thisMonth = today.slice(0, 7);
  const monthActions = actions
    .filter((a) => a.echeance.startsWith(thisMonth) && a.statut !== 'Fait')
    .slice(0, 5);

  // Traffic light statuses
  const stockAgeStatus = getStockAgeStatus(data.stockAge);
  const masseSalStatus = getMasseSalStatus(data.masseSalarialePct);
  const top20Status: TrafficStatus = data.top20Traite ? 'ok' : 'danger';
  const googleStatus = getGoogleStatus(data.noteGoogle);
  const estalyStatus = getEstalyStatus(data.estalyParSemaine);

  async function runDiag() {
    setDiagLoading(true);
    setDiagError('');
    setDiagResult(null);
    try {
      const system = `Tu es expert franchise EasyCash. Analyse les KPIs et retourne UNIQUEMENT ce JSON (sans markdown) :
{"alertes":[{"kpi":"","valeur":"","statut":"danger","action":""}],"recommandations":[{"priorite":1,"action":"","gain":0}],"narratif":""}
Benchmarks : stock âgé <20%, masse sal ≤15%, GMROI >3.84, note Google >4.4, Estaly >5/sem, rattachement web >60%, annulation web <20%`;
      const message = `Magasin: ${data.magasin} (${data.phase})
Stock total: ${data.stockTotal}€ | Stock âgé: ${data.stockAge}% | Top20 traité: ${data.top20Traite ? 'oui' : 'non'} | Rattachement web: ${data.rattachementWeb}% | GMROI: ${data.gmroi}
Nb ETP: ${data.nbEtp} | Panier moyen: ${data.panierMoyen}€ | Estaly/sem: ${data.estalyParSemaine} | Note Google: ${data.noteGoogle} | Taux annulation web: ${data.tauxAnnulationWeb}%
Briefing quotidien: ${data.briefingQuotidien ? 'oui' : 'non'} | Entretiens mensuels: ${data.entretiensMenusuels ? 'oui' : 'non'} | Vendeurs formés achats: ${data.nbVendeursFormes} | Masse sal: ${data.masseSalarialePct}% | Inventaires tournants: ${data.nbInventairesTournants}`;
      const raw = await callAI(system, message);
      const parsed = parseJSON<DiagResult>(raw);
      if (parsed) setDiagResult(parsed);
      else setDiagError('Réponse IA invalide. Réessayez.');
    } catch (e: unknown) {
      setDiagError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setDiagLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {data.magasin || <span className="text-gray-500">Magasin non configuré</span>}
          </h1>
          {data.magasin && (
            <span className="inline-block mt-1 px-3 py-0.5 rounded-full text-xs font-semibold bg-gray-700 text-gray-300">
              {data.phase}
            </span>
          )}
        </div>
        <button
          onClick={() => { setForm({ ...DEFAULT_DATA, ...data }); setShowEdit(!showEdit); }}
          className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
        >
          {showEdit ? '✕ Fermer' : '✏ Modifier mes données'}
        </button>
      </div>

      {/* Edit Form */}
      {showEdit && (
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nom du magasin</label>
              <input
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                value={form.magasin}
                onChange={(e) => setF('magasin', e.target.value)}
                placeholder="ex: EasyCash Lyon Centre"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Phase de vie</label>
              <select
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                value={form.phase}
                onChange={(e) => setF('phase', e.target.value as Phase)}
              >
                <option>Lancement</option>
                <option>Croissance</option>
                <option>Maturité</option>
              </select>
            </div>
          </div>

          {/* Stock */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">📦 Stock</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <NumInput label="Stock total" unit="€" value={form.stockTotal} onChange={(v) => setF('stockTotal', v)} />
              <NumInput label="Stock âgé" unit="%" value={form.stockAge} onChange={(v) => setF('stockAge', v)} />
              <NumInput label="Rattachement web" unit="%" value={form.rattachementWeb} onChange={(v) => setF('rattachementWeb', v)} />
              <NumInput label="GMROI" value={form.gmroi} onChange={(v) => setF('gmroi', v)} placeholder="ex: 3.84" />
              <div className="flex items-center col-span-2">
                <ToggleField label="Top 20 vieux stock traité ?" value={form.top20Traite} onChange={(v) => setF('top20Traite', v)} />
              </div>
            </div>
          </div>

          {/* Commerce */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">🛒 Commerce</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <NumInput label="Nb ETP" value={form.nbEtp} onChange={(v) => setF('nbEtp', v)} />
              <NumInput label="Panier moyen" unit="€" value={form.panierMoyen} onChange={(v) => setF('panierMoyen', v)} />
              <NumInput label="Contrats Estaly / semaine" value={form.estalyParSemaine} onChange={(v) => setF('estalyParSemaine', v)} />
              <NumInput label="Note Google" value={form.noteGoogle} onChange={(v) => setF('noteGoogle', v)} placeholder="ex: 4.3" />
              <NumInput label="Taux annulation web" unit="%" value={form.tauxAnnulationWeb} onChange={(v) => setF('tauxAnnulationWeb', v)} />
            </div>
          </div>

          {/* Management */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">👥 Management</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <NumInput label="Vendeurs formés aux achats" value={form.nbVendeursFormes} onChange={(v) => setF('nbVendeursFormes', v)} />
              <NumInput label="Masse salariale" unit="% du CA" value={form.masseSalarialePct} onChange={(v) => setF('masseSalarialePct', v)} />
              <NumInput label="Inventaires tournants ce mois" value={form.nbInventairesTournants} onChange={(v) => setF('nbInventairesTournants', v)} />
              <div className="col-span-2 space-y-3">
                <ToggleField label="Briefing quotidien" value={form.briefingQuotidien} onChange={(v) => setF('briefingQuotidien', v)} />
                <ToggleField label="Entretiens mensuels" value={form.entretiensMenusuels} onChange={(v) => setF('entretiensMenusuels', v)} />
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            className="w-full py-2.5 rounded-xl font-bold text-sm bg-green-500 text-black hover:bg-green-400 transition-colors"
          >
            💾 Sauvegarder
          </button>
        </div>
      )}

      {/* GMROI Big */}
      {data.magasin && (
        <div className="bg-gray-800 rounded-2xl p-6 flex flex-col items-center justify-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">GMROI</p>
          <div
            className="text-7xl font-black tabular-nums"
            style={{
              color: data.gmroi >= 3.84 ? '#22c55e' : data.gmroi >= 2.5 ? '#f59e0b' : data.gmroi > 0 ? '#ef4444' : '#6b7280',
            }}
          >
            {data.gmroi > 0 ? data.gmroi.toFixed(2) : '—'}
          </div>
          <p className="text-xs text-gray-500 mt-2">Réseau : 3.84 · Seuil minimum : 2.5</p>
        </div>
      )}

      {/* 5 Traffic Lights */}
      {data.magasin && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <TrafficLight
            label="Stock âgé"
            value={`${data.stockAge}%`}
            seuils="Vert <20% · Orange 20-30% · Rouge >30%"
            status={stockAgeStatus}
            actionText="Traitez votre TOP 20 en valeur — Intranet > Stats > Stocks > Réseau > Ventilation"
          />
          <TrafficLight
            label="Masse salariale"
            value={`${data.masseSalarialePct}%`}
            seuils="Vert ≤15% · Orange 15-18% · Rouge >18%"
            status={masseSalStatus}
            actionText="Ratio cible : 1 ETP / 250k€ CA. Pensez au contrat 39H pour vos piliers."
          />
          <TrafficLight
            label="Top 20 VS traité"
            value={data.top20Traite ? 'OUI ✓' : 'NON ✗'}
            seuils="Vert = traité · Rouge = non traité"
            status={top20Status}
            actionText="Priorité absolue : TOP 20 valeur, baissez de 10% cette semaine."
          />
          <TrafficLight
            label="Note Google"
            value={data.noteGoogle > 0 ? `${data.noteGoogle}/5` : '—'}
            seuils="Vert >4.4 · Orange 4.0-4.4 · Rouge <4.0"
            status={googleStatus}
            actionText="Répondez aux avis négatifs. Demandez un avis à chaque client satisfait."
          />
          <TrafficLight
            label="Estaly"
            value={`${data.estalyParSemaine}/sem`}
            seuils="Vert >5 · Orange 3-5 · Rouge <3"
            status={estalyStatus}
            actionText="Briefez vos vendeurs : 1 contrat/jour = +1 114€/an net pour eux."
          />
        </div>
      )}

      {/* Actions du mois */}
      {data.magasin && (
        <div className="bg-gray-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Actions du mois ({monthActions.length})
          </h2>
          {monthActions.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucune action ce mois-ci. Ajoutez-en dans Plan d'Action.</p>
          ) : (
            <div className="space-y-2">
              {monthActions.map((a) => (
                <div key={a.id} className="flex items-center gap-3 text-sm">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: a.statut === 'En cours' ? '#f59e0b' : '#6b7280' }}
                  />
                  <span className="font-medium flex-1 truncate">{a.titre}</span>
                  <span className="text-gray-500 text-xs">{a.pilote}</span>
                  {a.gain > 0 && (
                    <span className="text-green-400 font-semibold text-xs whitespace-nowrap">
                      +{a.gain.toLocaleString('fr-FR')} €
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Diagnostic IA */}
      {data.magasin && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={runDiag}
              disabled={diagLoading}
              className="px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ background: '#22c55e', color: '#000' }}
            >
              {diagLoading ? '⏳ Analyse en cours...' : '🔬 Diagnostic IA'}
            </button>
            {diagLoading && <span className="text-gray-400 text-sm">Analyse des 15 KPIs...</span>}
          </div>

          {diagError && (
            <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
              {diagError.includes('503') || diagError.includes('configurée')
                ? '🔑 Clé API non configurée. Ajoutez ANTHROPIC_API_KEY dans Vercel.'
                : diagError}
            </div>
          )}

          {diagResult && (
            <div className="space-y-4">
              {diagResult.narratif && (
                <div className="bg-gray-800 rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Synthèse</h3>
                  <p className="text-gray-200 text-sm leading-relaxed">{diagResult.narratif}</p>
                </div>
              )}

              {diagResult.alertes?.length > 0 && (
                <div className="bg-gray-800 rounded-2xl p-5 space-y-3">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Alertes</h3>
                  {diagResult.alertes.map((al, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 rounded-xl"
                      style={{ background: al.statut === 'danger' ? '#450a0a' : '#451a03' }}
                    >
                      <span className="text-lg flex-shrink-0">{al.statut === 'danger' ? '🔴' : '🟡'}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">{al.kpi} : {al.valeur}</p>
                        <p className="text-xs text-gray-300 mt-0.5">{al.action}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {diagResult.recommandations?.length > 0 && (
                <div className="bg-gray-800 rounded-2xl p-5 space-y-3">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recommandations</h3>
                  {diagResult.recommandations.map((r, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-green-900 text-green-300 text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {r.priorite}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm text-white">{r.action}</p>
                        {r.gain > 0 && (
                          <p className="text-xs text-green-400 mt-0.5">
                            Gain estimé : +{r.gain.toLocaleString('fr-FR')} €/an
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!data.magasin && !showEdit && (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🏪</div>
          <p className="text-gray-400 text-lg">Configurez votre magasin pour commencer</p>
          <button
            onClick={() => setShowEdit(true)}
            className="mt-4 px-5 py-2.5 rounded-xl font-bold text-sm bg-green-500 text-black hover:bg-green-400"
          >
            Saisir mes données
          </button>
        </div>
      )}
    </div>
  );
}
