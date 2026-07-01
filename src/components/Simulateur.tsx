'use client';

import { useState } from 'react';
import type { PAPAction } from '@/types';

interface Props { magasinNom: string; isCriticalSpiral?: boolean; onAddAction?: (action: PAPAction) => void; }

interface EquipeRow {
  id: string;
  prenom: string;
  contrat: string;
  heures: number;
  salaireHoraire: number;
}

interface EquipeStore {
  rows: EquipeRow[];
  caAnnuel: number;
  tauxMarge: number;
}

interface RhStore {
  departs: number;
  effectifMoyen: number | null;
}

function uid() { return Math.random().toString(36).slice(2); }

const CONTRAT_DEFS: {key:string;label:string;hSemaine:number;note:string}[] = [
  {key:'CDI 35h',   label:'CDI 35h',              hSemaine:35, note:''},
  {key:'CDI 37h',   label:'CDI 37h',              hSemaine:37, note:''},
  {key:'CDI 39h',   label:'CDI 39h',              hSemaine:39, note:''},
  {key:'CDI 20h',   label:'CDI 20h (mi-temps)',   hSemaine:20, note:''},
  {key:'CDI 24h',   label:'CDI 24h',              hSemaine:24, note:''},
  {key:'Alternant', label:'Alternant / Apprenti', hSemaine:35, note:'Gratification minimum applicable selon convention'},
  {key:'Stagiaire', label:'Stagiaire',            hSemaine:35, note:'Gratification minimum applicable selon convention'},
  {key:'CDD',       label:'CDD',                  hSemaine:35, note:''},
  {key:'Autre',     label:'Autre (saisie libre)', hSemaine:0,  note:''},
];

function migrateContrat(old: string): string {
  const MAP: Record<string,string> = {'CDI 35H':'CDI 35h','CDI 39H':'CDI 39h','Apprenti':'Alternant','Stage':'Stagiaire'};
  return MAP[old] ?? old;
}

function caColor(v: number) {
  if (v >= 200000 && v <= 300000) return 'text-green-600';
  if ((v >= 150000 && v < 200000) || (v > 300000 && v <= 400000)) return 'text-orange-500';
  return 'text-red-600';
}

function margeColor(v: number) {
  if (v > 90000) return 'text-green-600';
  if (v >= 60000) return 'text-orange-500';
  return 'text-red-600';
}

export function getSimulateurContext(magasinNom: string): string {
  try {
    const equipeKey = `equipe_${magasinNom}`;
    const rhKey = `rh_${magasinNom}`;
    const eq = localStorage.getItem(equipeKey);
    const rh = localStorage.getItem(rhKey);
    if (!eq) return '';
    const store = JSON.parse(eq) as EquipeStore;
    const rows = Array.isArray(store) ? store as EquipeRow[] : store.rows;
    const ca = Array.isArray(store) ? 0 : store.caAnnuel;
    const marge = Array.isArray(store) ? 38 : (store.tauxMarge ?? 38);
    const totalH = rows.reduce((s, r) => s + r.heures, 0);
    const totalEtp = totalH / 151.67;
    const totalMS = rows.reduce((s, r) => s + r.heures * r.salaireHoraire * 12 * 1.42, 0);
    const msPct = ca > 0 ? (totalMS / ca) * 100 : 0;
    let rhCtx = '';
    if (rh) {
      const rhData = JSON.parse(rh) as RhStore;
      const eff = rhData.effectifMoyen ?? totalEtp;
      const turnover = eff > 0 ? (rhData.departs / eff) * 100 : 0;
      if (rhData.departs > 0) rhCtx = ` | Turnover: ${turnover.toFixed(0)}% (${rhData.departs} départs / ${eff.toFixed(1)} ETP moy)`;
    }
    if (totalEtp === 0) return '';
    return `[Simulateur RH] CA: ${ca.toLocaleString('fr-FR')} € | Marge brute: ${marge}% | ETP: ${totalEtp.toFixed(1)} | MS: ${msPct.toFixed(1)}% CA | Coût annuel: ${Math.round(totalMS).toLocaleString('fr-FR')} €${rhCtx}`;
  } catch { return ''; }
}

export default function Simulateur({ magasinNom, isCriticalSpiral, onAddAction }: Props) {
  const equipeKey = `equipe_${magasinNom}`;
  const rhKey = `rh_${magasinNom}`;

  const [equipeStore, setEquipeStore] = useState<EquipeStore>(() => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem(equipeKey) : null;
      if (s) {
        const p = JSON.parse(s) as unknown;
        if (Array.isArray(p)) return { rows: (p as EquipeRow[]).map(r => ({ ...r, contrat: migrateContrat(r.contrat) })), caAnnuel: 0, tauxMarge: 38 };
        const parsed = p as EquipeStore;
        return { ...parsed, tauxMarge: parsed.tauxMarge ?? 38, rows: parsed.rows.map(r => ({ ...r, contrat: migrateContrat(r.contrat) })) };
      }
      return { rows: [], caAnnuel: 0, tauxMarge: 38 };
    } catch { return { rows: [], caAnnuel: 0, tauxMarge: 38 }; }
  });

  const [rhStore, setRhStore] = useState<RhStore>(() => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem(rhKey) : null;
      return s ? JSON.parse(s) as RhStore : { departs: 0, effectifMoyen: null };
    } catch { return { departs: 0, effectifMoyen: null }; }
  });

  const [showExplain, setShowExplain] = useState(false);

  function saveRhStore(rh: RhStore) {
    setRhStore(rh);
    localStorage.setItem(rhKey, JSON.stringify(rh));
  }

  function saveEquipeStore(store: EquipeStore) {
    setEquipeStore(store);
    localStorage.setItem(equipeKey, JSON.stringify(store));
  }

  function addEquipe() {
    const defaultDef = CONTRAT_DEFS[0];
    const autoH = Math.round(defaultDef.hSemaine * 52 / 12 * 100) / 100;
    saveEquipeStore({ ...equipeStore, rows: [...equipeStore.rows, { id: uid(), prenom: '', contrat: defaultDef.key, heures: autoH, salaireHoraire: 12 }] });
  }

  function updateEquipe(id: string, field: keyof EquipeRow, value: string | number) {
    saveEquipeStore({ ...equipeStore, rows: equipeStore.rows.map(e => e.id === id ? { ...e, [field]: value } : e) });
  }

  function updateContrat(id: string, key: string) {
    const def = CONTRAT_DEFS.find(d => d.key === key);
    const autoH = def && def.hSemaine > 0 ? Math.round(def.hSemaine * 52 / 12 * 100) / 100 : undefined;
    saveEquipeStore({ ...equipeStore, rows: equipeStore.rows.map(e =>
      e.id === id ? { ...e, contrat: key, ...(autoH !== undefined ? { heures: autoH } : {}) } : e
    )});
  }

  function delEquipe(id: string) {
    saveEquipeStore({ ...equipeStore, rows: equipeStore.rows.filter(e => e.id !== id) });
  }

  const { rows: equipe, caAnnuel, tauxMarge } = equipeStore;
  const totalMasseSal = equipe.reduce((s, e) => s + (e.heures * e.salaireHoraire * 12 * 1.42), 0);
  const totalHeures = equipe.reduce((s, e) => s + e.heures, 0);
  const totalEtp = totalHeures / 151.67;
  const masseSalPct = caAnnuel > 0 ? (totalMasseSal / caAnnuel) * 100 : 0;
  const ratioCAEtp = totalEtp > 0 && caAnnuel > 0 ? caAnnuel / totalEtp : 0;
  const caParEtp = totalEtp > 0 && caAnnuel > 0 ? caAnnuel / totalEtp : 0;
  const margeParEtp = totalEtp > 0 && caAnnuel > 0 ? (caAnnuel * tauxMarge / 100) / totalEtp : 0;

  // Référence réseau : 1 ETP / 250k€ CA
  const etpOptimal = caAnnuel > 0 ? Math.round(caAnnuel / 250000) : 0;
  const msBudgetMax = caAnnuel > 0 ? Math.round(caAnnuel * 0.15) : 0;
  const msEcart = msBudgetMax > 0 ? Math.round(totalMasseSal - msBudgetMax) : 0;

  const effectifMoyenDisplay = rhStore.effectifMoyen !== null ? rhStore.effectifMoyen : totalEtp;
  const turnover = effectifMoyenDisplay > 0 ? (rhStore.departs / effectifMoyenDisplay) * 100 : 0;
  const turnoverColor = turnover <= 15 ? 'text-green-600' : turnover <= 30 ? 'text-orange-500' : 'text-red-600';

  const inputCls = 'bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]';

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-[#1A1A1A]">Simulateur — {magasinNom || 'Magasin'}</h2>

      <div className="space-y-4">
        {/* CA + taux marge */}
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4 flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-[#6B7280] block mb-1">CA annuel du magasin (€)</label>
            <input
              type="number"
              value={caAnnuel || ''}
              onChange={e => saveEquipeStore({ ...equipeStore, caAnnuel: parseFloat(e.target.value) || 0 })}
              placeholder="Ex : 2000000"
              className={`${inputCls} w-52`}
            />
          </div>
          <div>
            <label className="text-xs text-[#6B7280] block mb-1">Taux de marge brute (%)</label>
            <input
              type="number"
              value={tauxMarge || ''}
              onChange={e => saveEquipeStore({ ...equipeStore, tauxMarge: parseFloat(e.target.value) || 38 })}
              placeholder="38"
              className={`${inputCls} w-28`}
            />
          </div>
        </div>

        {/* KPIs équipe — row 1 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
            <div className={`text-2xl font-black ${masseSalPct <= 15 ? 'text-green-600' : masseSalPct <= 18 ? 'text-orange-500' : 'text-red-600'}`}>
              {caAnnuel > 0 ? `${masseSalPct.toFixed(1)}%` : '—'}
            </div>
            <div className="text-xs text-[#6B7280]">Masse salariale</div>
            <div className="text-xs text-[#9CA3AF]">cible ≤15% réseau</div>
            {msBudgetMax > 0 && (
              <div className="text-[10px] text-[#9CA3AF] mt-0.5">max {msBudgetMax.toLocaleString('fr-FR')} €</div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
            <div className="text-2xl font-black text-[#1A1A1A]">{(totalMasseSal / 1000).toFixed(0)}k€</div>
            <div className="text-xs text-[#6B7280]">Coût annuel total</div>
          </div>
          <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
            <div className="text-2xl font-black text-[#1A1A1A]">{totalEtp.toFixed(1)}</div>
            <div className="text-xs text-[#6B7280]">ETP total</div>
          </div>
        </div>

        {/* Alert: masse salariale > 15% */}
        {caAnnuel > 0 && masseSalPct > 15 && onAddAction && (
          <div className="flex items-center justify-between gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5">
            <p className="text-xs text-orange-700">
              <strong>⚠ Masse salariale à {masseSalPct.toFixed(1)}%</strong> — cible réseau ≤ 15% du CA
              {msEcart > 0 && <span> — surcoût : <strong>{msEcart.toLocaleString('fr-FR')} €</strong> vs budget max</span>}
            </p>
            <button onClick={() => {
              const e = new Date(); e.setDate(e.getDate() + 14);
              onAddAction({ id: String(Date.now()), titre: `Simulateur — Masse salariale à ${masseSalPct.toFixed(1)}% du CA (cible ≤ 15%)`, axe: 'Management', pilote: 'Franchisé', copilote: '', description: `Masse salariale actuelle : ${masseSalPct.toFixed(1)}% du CA (${Math.round(totalMasseSal).toLocaleString('fr-FR')} €). Budget max réseau (15%) : ${msBudgetMax.toLocaleString('fr-FR')} €. Surcoût estimé : ${msEcart.toLocaleString('fr-FR')} €. Analyser les plannings et les contrats pour réduire l'écart.`, echeance: e.toISOString().slice(0, 10), priorite: masseSalPct > 18 ? 1 : 2, gain: msEcart, statut: 'À faire' });
            }} className="text-xs text-white bg-[#E30613] hover:bg-red-700 rounded-full px-3 py-1 whitespace-nowrap flex-shrink-0 transition-colors">+ PAP</button>
          </div>
        )}

        {/* KPIs équipe — row 2 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
            <div className={`text-2xl font-black ${caParEtp > 0 ? caColor(caParEtp) : 'text-[#6B7280]'}`}>
              {caParEtp > 0 ? `${(caParEtp / 1000).toFixed(0)}k€` : '—'}
            </div>
            <div className="text-xs text-[#6B7280]">CA par ETP</div>
            <div className="text-xs text-[#9CA3AF]">benchmark 250k€ · vert 200-300k</div>
          </div>
          <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
            <div className={`text-2xl font-black ${margeParEtp > 0 ? margeColor(margeParEtp) : 'text-[#6B7280]'}`}>
              {margeParEtp > 0 ? `${(margeParEtp / 1000).toFixed(0)}k€` : '—'}
            </div>
            <div className="text-xs text-[#6B7280]">Marge brute par ETP</div>
            <div className="text-xs text-[#9CA3AF]">vert &gt;90k · orange 60-90k · rouge &lt;60k</div>
          </div>
          <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
            <div className={`text-2xl font-black ${
              etpOptimal === 0 ? 'text-[#6B7280]'
              : Math.abs(totalEtp - etpOptimal) <= 0.5 ? 'text-green-600'
              : totalEtp < etpOptimal - 0.5 ? 'text-orange-500'
              : 'text-orange-500'
            }`}>
              {etpOptimal > 0 ? etpOptimal : '—'}
            </div>
            <div className="text-xs text-[#6B7280]">ETP cible réseau</div>
            <div className="text-xs text-[#9CA3AF]">
              {etpOptimal > 0 && totalEtp > 0
                ? totalEtp < etpOptimal - 0.5 ? `actuel ${totalEtp.toFixed(1)} — sous-dim.`
                  : totalEtp > etpOptimal + 0.5 ? `actuel ${totalEtp.toFixed(1)} — sur-dim.`
                  : `actuel ${totalEtp.toFixed(1)} — OK`
                : '1 ETP / 250k€ CA'}
            </div>
          </div>
        </div>

        {/* Alerte dimensionnement */}
        {caAnnuel > 0 && totalEtp > 0 && (
          <div className={`rounded-xl px-4 py-3 text-sm border ${
            ratioCAEtp > 400000 ? 'bg-orange-50 border-orange-200' :
            ratioCAEtp < 180000 ? 'bg-orange-50 border-orange-200' :
            'bg-green-50 border-green-300'
          }`}>
            {ratioCAEtp > 400000 ? (
              <p className="text-orange-700">
                <span className="font-semibold">⚠ Équipe probablement sous-dimensionnée</span><br />
                Vous avez {totalEtp.toFixed(1)} ETP pour {caAnnuel.toLocaleString('fr-FR')} € de CA, soit 1 ETP pour {Math.round(ratioCAEtp).toLocaleString('fr-FR')} €.<br />
                Benchmark réseau : 1 ETP pour 250 000 €.<br />
                Pour votre CA, il faudrait environ <strong>{Math.round(caAnnuel / 250000)}</strong> ETP.
              </p>
            ) : ratioCAEtp < 180000 ? (
              <p className="text-orange-700">
                <span className="font-semibold">⚠ Équipe probablement sur-dimensionnée</span><br />
                Vous avez {totalEtp.toFixed(1)} ETP pour {caAnnuel.toLocaleString('fr-FR')} € de CA, soit 1 ETP pour {Math.round(ratioCAEtp).toLocaleString('fr-FR')} €.<br />
                Benchmark réseau : 1 ETP pour 250 000 €.<br />
                Pour votre CA, <strong>{Math.round(caAnnuel / 250000)}</strong> ETP suffiraient théoriquement.
              </p>
            ) : (
              <p className="text-green-700">✓ Dimensionnement équipe cohérent avec le CA</p>
            )}
            <p className="text-xs text-[#6B7280] mt-2">Note : ces seuils sont indicatifs. Un magasin centre-ville avec forte saisonnalité peut justifier plus d&apos;ETP qu&apos;un magasin périphérique.</p>
            {onAddAction && (ratioCAEtp > 400000 || ratioCAEtp < 180000) && (
              <button onClick={() => {
                const e = new Date(); e.setDate(e.getDate() + 14);
                const titre = ratioCAEtp > 400000
                  ? `Simulateur — Dimensionnement équipe insuffisant (${totalEtp.toFixed(1)} ETP pour ${caAnnuel.toLocaleString('fr-FR')} €)`
                  : `Simulateur — Masse salariale sur-dimensionnée (${masseSalPct.toFixed(1)}% du CA)`;
                const description = ratioCAEtp > 400000
                  ? `CA/ETP = ${Math.round(ratioCAEtp).toLocaleString('fr-FR')} € vs benchmark 250 000 €. Envisager un recrutement pour absorber la charge.`
                  : `${totalEtp.toFixed(1)} ETP pour ${caAnnuel.toLocaleString('fr-FR')} € CA. CA/ETP = ${Math.round(ratioCAEtp).toLocaleString('fr-FR')} € vs benchmark 250 000 €. Analyser les contrats à faible charge.`;
                onAddAction({ id: String(Date.now()), titre, axe: 'Management', pilote: 'Franchisé', copilote: '', description, echeance: e.toISOString().slice(0, 10), priorite: 1, gain: 0, statut: 'À faire' });
              }} className="mt-2 text-xs text-white bg-[#E30613] hover:bg-red-700 rounded-full px-3 py-1 whitespace-nowrap transition-colors">+ PAP</button>
            )}
          </div>
        )}

        {/* Table équipe */}
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E0E0E0] bg-[#F5F5F5] text-[#6B7280]">
                  <th className="text-left px-3 py-2 font-semibold">Prénom</th>
                  <th className="text-left px-3 py-2 font-semibold">Contrat</th>
                  <th className="text-right px-3 py-2 font-semibold">H/mois <span className="font-normal text-[#9CA3AF]">(auto)</span></th>
                  <th className="text-right px-3 py-2 font-semibold">€/h brut</th>
                  <th className="text-right px-3 py-2 font-semibold">Coût annuel</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E0E0]">
                {equipe.map(e => {
                  const def = CONTRAT_DEFS.find(d => d.key === e.contrat);
                  const isAutre = e.contrat === 'Autre';
                  const cout = e.heures * e.salaireHoraire * 12 * 1.42;
                  return (
                    <>
                      <tr key={e.id}>
                        <td className="px-3 py-2">
                          <input
                            value={e.prenom}
                            onChange={ev => updateEquipe(e.id, 'prenom', ev.target.value)}
                            className="bg-transparent text-[#1A1A1A] w-24 border-b border-[#E0E0E0] focus:outline-none focus:border-[#E30613]"
                            placeholder="Prénom"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={e.contrat}
                            onChange={ev => updateContrat(e.id, ev.target.value)}
                            className="bg-white text-[#1A1A1A] text-xs rounded border border-[#E0E0E0] px-1 py-0.5"
                          >
                            {CONTRAT_DEFS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isAutre ? (
                            <input
                              type="number"
                              value={e.heures || ''}
                              onChange={ev => updateEquipe(e.id, 'heures', parseFloat(ev.target.value) || 0)}
                              className="bg-transparent text-[#1A1A1A] w-16 text-right border-b border-[#E0E0E0] focus:outline-none focus:border-[#E30613]"
                              placeholder="h/mois"
                            />
                          ) : (
                            <span className="text-[#1A1A1A] text-xs font-medium">{e.heures.toFixed(2)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={e.salaireHoraire || ''}
                            onChange={ev => updateEquipe(e.id, 'salaireHoraire', parseFloat(ev.target.value) || 0)}
                            className="bg-transparent text-[#1A1A1A] w-12 text-right border-b border-[#E0E0E0] focus:outline-none focus:border-[#E30613]"
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-[#1A1A1A] font-medium">{cout.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</td>
                        <td className="px-2 py-2">
                          <button onClick={() => delEquipe(e.id)} className="text-[#6B7280] hover:text-red-600 text-xs">✕</button>
                        </td>
                      </tr>
                      {def?.note && (
                        <tr key={`${e.id}-note`}>
                          <td colSpan={6} className="px-3 pb-2 text-[10px] text-amber-600 italic">{def.note}</td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-[#E0E0E0]">
            <button onClick={addEquipe} className="text-xs text-[#E30613] hover:text-[#B8050F] font-medium">+ Ajouter un collaborateur</button>
          </div>
        </div>
        <p className="text-xs text-[#6B7280]">Coût chargé = salaire brut × heures × 12 × 1.42 (charges patronales estimées France)</p>
      </div>

      {/* Indicateurs RH — Turnover */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-bold text-[#1A1A1A]">📊 Indicateurs RH</h3>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-[#6B7280] block mb-1">Départs sur 12 mois</label>
            <input
              type="number"
              min={0}
              value={rhStore.departs || ''}
              onChange={e => saveRhStore({ ...rhStore, departs: parseInt(e.target.value) || 0 })}
              placeholder="0"
              className={`${inputCls} w-28`}
            />
          </div>
          <div>
            <label className="text-xs text-[#6B7280] block mb-1">Effectif moyen (ETP) <span className="text-[#9CA3AF]">— auto si vide</span></label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={rhStore.effectifMoyen !== null ? rhStore.effectifMoyen : ''}
              onChange={e => {
                const v = e.target.value;
                saveRhStore({ ...rhStore, effectifMoyen: v === '' ? null : parseFloat(v) || null });
              }}
              placeholder={totalEtp > 0 ? totalEtp.toFixed(1) : '—'}
              className={`${inputCls} w-28`}
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-[#F5F5F5] rounded-xl px-4 py-3 text-center min-w-[100px]">
            <div className={`text-2xl font-black ${rhStore.departs > 0 ? turnoverColor : 'text-[#6B7280]'}`}>
              {rhStore.departs > 0 ? `${turnover.toFixed(0)}%` : '—'}
            </div>
            <div className="text-xs text-[#6B7280]">Turnover</div>
            <div className="text-xs text-[#9CA3AF]">vert &lt;15 · orange 15-30 · rouge &gt;30</div>
          </div>
          {rhStore.departs > 0 && (
            <p className="text-xs text-[#6B7280] leading-relaxed">
              {turnover <= 15
                ? '✓ Turnover maîtrisé — stabilité de l\'équipe satisfaisante.'
                : turnover <= 30
                ? '⚠ Turnover élevé — attention à la fidélisation et aux coûts de recrutement.'
                : '⚠ Turnover critique — fort impact sur la qualité de service et les coûts RH.'}
            </p>
          )}
        </div>
        {onAddAction && rhStore.departs > 0 && turnover > 30 && (
          <button onClick={() => {
            const d = new Date(); d.setDate(d.getDate() + 14);
            onAddAction({ id: String(Date.now()), titre: `RH — Turnover critique à ${turnover.toFixed(0)}% (${rhStore.departs} départs)`, axe: 'Management', pilote: 'Franchisé', copilote: '', description: `Turnover sur 12 mois : ${turnover.toFixed(0)}% (${rhStore.departs} départs pour ${effectifMoyenDisplay.toFixed(1)} ETP moyen). Analyser les causes de départ et mettre en place un plan de fidélisation.`, echeance: d.toISOString().slice(0, 10), priorite: 1, gain: 0, statut: 'À faire' });
          }} className="text-xs text-white bg-[#E30613] hover:bg-red-700 rounded-full px-3 py-1 whitespace-nowrap transition-colors">+ PAP</button>
        )}
      </div>

      {/* Explanations */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
        <button
          onClick={() => setShowExplain(!showExplain)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-[#6B7280] hover:text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors"
        >
          <span className="font-medium">Comment sont calculés les chiffres ?</span>
          <span className="text-xs">{showExplain ? '▲' : '▼'}</span>
        </button>
        {showExplain && (
          <div className="border-t border-[#E0E0E0] px-4 py-4 text-xs text-[#6B7280] space-y-2 leading-relaxed">
            <p><strong className="text-[#1A1A1A]">Masse salariale %</strong> = Coût salarial chargé annuel / CA annuel. Cible réseau : ≤15% (moyenne DAF toutes tranches confondues). Les magasins de moins de 800k€ CA affichent structurellement des ratios plus élevés en raison des charges fixes incompressibles.</p>
            <p><strong className="text-[#1A1A1A]">Coût chargé</strong> = salaire brut × heures × 12 × 1.42 (charges patronales estimées France).</p>
            <p><strong className="text-[#1A1A1A]">CA par ETP</strong> = CA annuel / nb ETP. Benchmark réseau : 250 000 €. Vert : 200-300k, orange : 150-200k ou 300-400k, rouge sinon.</p>
            <p><strong className="text-[#1A1A1A]">Marge brute par ETP</strong> = (CA × taux de marge brute) / nb ETP. Vert : &gt;90k€, orange : 60-90k€, rouge : &lt;60k€.</p>
            <p><strong className="text-[#1A1A1A]">Ratio CA/ETP</strong> = CA annuel / Nb ETP. Cible réseau : 250 000 € par ETP.</p>
            <p><strong className="text-[#1A1A1A]">Exemple :</strong> pour un CA de 3 M€, il faut environ 12 ETP (fourchette 11-14 selon profil magasin).</p>
          </div>
        )}
      </div>
    </div>
  );
}
