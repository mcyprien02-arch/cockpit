'use client';

import { useState, useEffect } from 'react';
import type { PAPAction } from '@/types';
import ZonesModule from './ZonesModule';

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
  msSeuilPct: number;
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
      const rhData = JSON.parse(rh) as { departs: number; effectifMoyen: number | null };
      const eff = rhData.effectifMoyen ?? totalEtp;
      const turnover = eff > 0 ? (rhData.departs / eff) * 100 : 0;
      if (rhData.departs > 0) rhCtx = ` | Turnover: ${turnover.toFixed(0)}% (${rhData.departs} départs / ${eff.toFixed(1)} ETP moy)`;
    }
    if (totalEtp === 0) return '';
    return `[Simulateur RH] CA: ${ca.toLocaleString('fr-FR')} € | Marge brute: ${marge}% | ETP: ${totalEtp.toFixed(1)} | MS: ${msPct.toFixed(1)}% CA | Coût annuel: ${Math.round(totalMS).toLocaleString('fr-FR')} €${rhCtx}`;
  } catch { return ''; }
}

// ── Scénarios RH sub-component ───────────────────────────────────────────────

interface ScenarioRHProps {
  magasinNom: string;
  totalMasseSal: number;
  caAnnuel: number;
  tauxMarge: number;
  onAddAction?: (action: PAPAction) => void;
}

function ScenarioRH({ magasinNom, totalMasseSal, caAnnuel, tauxMarge, onAddAction }: ScenarioRHProps) {
  const [scenContrat, setScenContrat] = useState('CDI 35h');
  const [scenSalaireStr, setScenSalaireStr] = useState('');
  const [scenMois, setScenMois] = useState(12);

  const [benchData, setBenchData] = useState<{ caHT: number; totalCharges: number } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`benchmark_franchise_${magasinNom}`);
      if (!raw) return;
      const d = JSON.parse(raw) as { ca_ht?: number; charges?: Record<string, number> };
      const caHT = d.ca_ht ?? 0;
      const charges = d.charges ?? {};
      const total = Object.values(charges).reduce((s, v) => s + (Number(v) || 0), 0);
      setBenchData({ caHT, totalCharges: total });
    } catch { /* ignore */ }
  }, [magasinNom]);

  const isCDD = scenContrat === 'CDD';
  const scenDef = CONTRAT_DEFS.find(d => d.key === scenContrat);
  const scenHMois = scenDef && scenDef.hSemaine > 0 ? Math.round(scenDef.hSemaine * 52 / 12 * 100) / 100 : 0;
  const scenSalaire = parseFloat(scenSalaireStr) || 0;

  const scenCoutAnnuel = isCDD
    ? scenHMois * scenSalaire * scenMois * 1.42
    : scenHMois * scenSalaire * 12 * 1.42;

  const caRef = (benchData?.caHT && benchData.caHT > 0) ? benchData.caHT : caAnnuel;
  const totalChargesExt = benchData?.totalCharges ?? 0;
  const margeEuros = caRef * (tauxMarge / 100);
  const hasCharges = totalChargesExt > 0;

  const ebeAvant = hasCharges ? margeEuros - totalChargesExt - totalMasseSal : null;
  const ebeApres = hasCharges && scenCoutAnnuel > 0 ? margeEuros - totalChargesExt - (totalMasseSal + scenCoutAnnuel) : null;

  const msPctAvant = caRef > 0 ? (totalMasseSal / caRef) * 100 : 0;
  const msPctApres = caRef > 0 && scenCoutAnnuel > 0 ? ((totalMasseSal + scenCoutAnnuel) / caRef) * 100 : 0;
  const ebePctApres = caRef > 0 && ebeApres !== null ? (ebeApres / caRef) * 100 : null;

  const inputCls = 'bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]';

  return (
    <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-[#1A1A1A]">🧮 Scénario de recrutement</h3>
        <p className="text-xs text-[#6B7280] mt-0.5">Simulez l&apos;impact d&apos;un recrutement sur votre masse salariale et votre EBE.</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="text-xs text-[#6B7280] block mb-1">Type de contrat</label>
          <select
            value={scenContrat}
            onChange={e => setScenContrat(e.target.value)}
            className={`${inputCls} w-44`}
          >
            {CONTRAT_DEFS.filter(d => d.key !== 'Autre' && d.key !== 'Stagiaire').map(d => (
              <option key={d.key} value={d.key}>{d.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[#6B7280] block mb-1">Salaire horaire brut (€/h)</label>
          <input
            type="number"
            min={0}
            step={0.1}
            value={scenSalaireStr}
            onChange={e => setScenSalaireStr(e.target.value)}
            placeholder="ex : 12,50"
            className={`${inputCls} w-32`}
          />
        </div>
        {isCDD && (
          <div>
            <label className="text-xs text-[#6B7280] block mb-1">Durée (mois)</label>
            <input
              type="number"
              min={1}
              max={36}
              value={scenMois}
              onChange={e => setScenMois(parseInt(e.target.value) || 12)}
              className={`${inputCls} w-24`}
            />
          </div>
        )}
      </div>

      {scenSalaire > 0 && scenCoutAnnuel > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#F9FAFB] rounded-xl px-4 py-3 text-center">
              <div className="text-lg font-black text-[#1A1A1A]">{Math.round(scenCoutAnnuel).toLocaleString('fr-FR')} €</div>
              <div className="text-xs text-[#6B7280]">Coût chargé {isCDD ? `(${scenMois} mois)` : 'annuel'}</div>
            </div>
            <div className="bg-[#F9FAFB] rounded-xl px-4 py-3 text-center">
              <div className={`text-lg font-black ${msPctApres > 18 ? 'text-red-600' : msPctApres > 15 ? 'text-orange-500' : 'text-green-600'}`}>
                {caRef > 0 ? `${msPctAvant.toFixed(1)}% → ${msPctApres.toFixed(1)}%` : '—'}
              </div>
              <div className="text-xs text-[#6B7280]">Masse salariale % CA</div>
            </div>
            <div className="bg-[#F9FAFB] rounded-xl px-4 py-3 text-center">
              <div className={`text-lg font-black ${ebePctApres !== null ? (ebePctApres < 4 ? 'text-red-600' : ebePctApres < 6.96 ? 'text-orange-500' : 'text-green-600') : 'text-[#9CA3AF]'}`}>
                {ebePctApres !== null ? `${ebePctApres.toFixed(1)}%` : '—'}
              </div>
              <div className="text-xs text-[#6B7280]">EBE estimé après recrutement</div>
            </div>
          </div>

          <div className={`rounded-xl px-4 py-3 text-sm border ${msPctApres > 15 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
            {caRef > 0 ? (
              <p className={msPctApres > 15 ? 'text-orange-700' : 'text-green-700'}>
                Ce recrutement ferait passer votre masse salariale de <strong>{msPctAvant.toFixed(1)}%</strong> à <strong>{msPctApres.toFixed(1)}%</strong> du CA.
                {ebeAvant !== null && ebeApres !== null ? (
                  <> Votre EBE passerait de <strong>{Math.round(ebeAvant).toLocaleString('fr-FR')} €</strong> à <strong>{Math.round(ebeApres).toLocaleString('fr-FR')} €</strong>
                  {ebePctApres !== null ? ` (${ebePctApres.toFixed(1)}% du CA vs médiane réseau 6,96%)` : ''}.
                  </>
                ) : (
                  <> Saisissez vos charges dans le Benchmark pour calculer l&apos;impact sur l&apos;EBE.</>
                )}
              </p>
            ) : (
              <p className="text-[#6B7280]">Saisissez le CA annuel dans le Simulateur pour calculer l&apos;impact.</p>
            )}
          </div>

          {onAddAction && msPctApres > 15 && caRef > 0 && (
            <button onClick={() => {
              const d = new Date(); d.setDate(d.getDate() + 30);
              onAddAction({ id: String(Date.now()), titre: `Scénario RH — recrutement ${scenContrat} à ${scenSalaire} €/h`, axe: 'Management', pilote: 'Franchisé', copilote: '', description: `Recrutement simulé : ${scenContrat}, ${scenSalaire} €/h, coût chargé ${isCDD ? scenMois + ' mois' : 'annuel'} = ${Math.round(scenCoutAnnuel).toLocaleString('fr-FR')} €. Masse salariale : ${msPctAvant.toFixed(1)}% → ${msPctApres.toFixed(1)}% du CA.${ebeApres !== null ? ` EBE estimé : ${Math.round(ebeApres).toLocaleString('fr-FR')} €.` : ''} Vérifier l'impact sur la rentabilité avant de valider.`, echeance: d.toISOString().slice(0, 10), priorite: 2, gain: 0, statut: 'À faire' });
            }} className="text-xs text-white bg-[#E30613] hover:bg-red-700 rounded-full px-3 py-1 whitespace-nowrap transition-colors">+ Ajouter au PAP</button>
          )}
        </div>
      )}

      {scenSalaire === 0 && (
        <p className="text-xs text-[#9CA3AF] italic">Renseignez un salaire horaire pour voir l&apos;impact simulé.</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Simulateur({ magasinNom, isCriticalSpiral, onAddAction }: Props) {
  const equipeKey = `equipe_${magasinNom}`;

  const [equipeStore, setEquipeStore] = useState<EquipeStore>(() => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem(equipeKey) : null;
      if (s) {
        const p = JSON.parse(s) as unknown;
        if (Array.isArray(p)) return { rows: (p as EquipeRow[]).map(r => ({ ...r, contrat: migrateContrat(r.contrat) })), caAnnuel: 0, tauxMarge: 38, msSeuilPct: 15 };
        const parsed = p as EquipeStore;
        return { ...parsed, tauxMarge: parsed.tauxMarge ?? 38, msSeuilPct: parsed.msSeuilPct ?? 15, rows: parsed.rows.map(r => ({ ...r, contrat: migrateContrat(r.contrat) })) };
      }
      return { rows: [], caAnnuel: 0, tauxMarge: 38, msSeuilPct: 15 };
    } catch { return { rows: [], caAnnuel: 0, tauxMarge: 38, msSeuilPct: 15 }; }
  });

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

  const { rows: equipe, caAnnuel, tauxMarge, msSeuilPct = 15 } = equipeStore;
  const totalMasseSal = equipe.reduce((s, e) => s + (e.heures * e.salaireHoraire * 12 * 1.42), 0);
  const totalHeures = equipe.reduce((s, e) => s + e.heures, 0);
  const totalEtp = totalHeures / 151.67;
  const masseSalPct = caAnnuel > 0 ? (totalMasseSal / caAnnuel) * 100 : 0;
  const msBudgetMax = caAnnuel > 0 ? Math.round(caAnnuel * msSeuilPct / 100) : 0;
  const msEcart = msBudgetMax > 0 ? Math.round(totalMasseSal - msBudgetMax) : 0;

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
            <div className={`text-2xl font-black ${masseSalPct <= msSeuilPct ? 'text-green-600' : masseSalPct <= msSeuilPct + 3 ? 'text-orange-500' : 'text-red-600'}`}>
              {caAnnuel > 0 ? `${masseSalPct.toFixed(1)}%` : '—'}
            </div>
            <div className="text-xs text-[#6B7280]">Masse salariale</div>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <span className="text-[10px] text-[#9CA3AF]">seuil</span>
              <input
                type="number"
                min={5}
                max={40}
                step={0.5}
                value={msSeuilPct}
                onChange={e => saveEquipeStore({ ...equipeStore, msSeuilPct: parseFloat(e.target.value) || 15 })}
                className="w-10 text-[10px] text-center bg-[#F5F5F5] border border-[#E0E0E0] rounded px-1 py-0.5 focus:outline-none focus:border-[#E30613]"
              />
              <span className="text-[10px] text-[#9CA3AF]">%</span>
            </div>
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
        {caAnnuel > 0 && masseSalPct > msSeuilPct && onAddAction && (
          <div className="flex items-center justify-between gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5">
            <p className="text-xs text-orange-700">
              <strong>⚠ Masse salariale à {masseSalPct.toFixed(1)}%</strong> — votre seuil cible est ≤ {msSeuilPct}% du CA
              {msEcart > 0 && <span> — surcoût : <strong>{msEcart.toLocaleString('fr-FR')} €</strong> vs budget max</span>}
            </p>
            <button onClick={() => {
              const e = new Date(); e.setDate(e.getDate() + 14);
              onAddAction({ id: String(Date.now()), titre: `Simulateur — Masse salariale à ${masseSalPct.toFixed(1)}% du CA (cible ≤ ${msSeuilPct}%)`, axe: 'Management', pilote: 'Franchisé', copilote: '', description: `Masse salariale actuelle : ${masseSalPct.toFixed(1)}% du CA (${Math.round(totalMasseSal).toLocaleString('fr-FR')} €). Budget max (${msSeuilPct}%) : ${msBudgetMax.toLocaleString('fr-FR')} €. Surcoût estimé : ${msEcart.toLocaleString('fr-FR')} €. Analyser les plannings et les contrats pour réduire l'écart.`, echeance: e.toISOString().slice(0, 10), priorite: masseSalPct > msSeuilPct + 3 ? 1 : 2, gain: msEcart, statut: 'À faire' });
            }} className="text-xs text-white bg-[#E30613] hover:bg-red-700 rounded-full px-3 py-1 whitespace-nowrap flex-shrink-0 transition-colors">+ PAP</button>
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

      {/* ══ Scénarios RH ══ */}
      <ScenarioRH magasinNom={magasinNom} totalMasseSal={totalMasseSal} caAnnuel={caAnnuel} tauxMarge={tauxMarge} onAddAction={onAddAction} />

      <ZonesModule moduleKey="simulateur" />
    </div>
  );
}
