'use client';

import { useState, useEffect } from 'react';
import type { MagasinData, PAPAction, Phase } from '@/types';
import { DEFAULT_DATA } from '@/types';
import { KPI_DEFS } from '@/lib/kpis';

interface Props {
  data: MagasinData;
  onSave: (d: MagasinData) => void;
  actions: PAPAction[];
  onNavigate: (tab: string) => void;
  onAddAction?: (action: PAPAction) => void;
}

interface HistoireStore {
  typePdV: string;
  anneeOuverture: string;
  effectif: string;
  specificites: string;
  defis: string;
  objectifsPerso: string;
  descriptionLibre: string;
}
const HISTOIRE_EMPTY: HistoireStore = { typePdV: '', anneeOuverture: '', effectif: '', specificites: '', defis: '', objectifsPerso: '', descriptionLibre: '' };

interface SimuSummary { ca: number; etp: number; msPct: number; masseSal: number; turnover: number | null }

export function getHistoireContext(nom: string): string {
  try {
    const s = localStorage.getItem(`histoire_${nom}`);
    if (!s) return '';
    const h = JSON.parse(s) as HistoireStore;
    const parts = [
      h.typePdV && `Type PdV: ${h.typePdV}`,
      h.anneeOuverture && `Ouverture: ${h.anneeOuverture}`,
      h.effectif && `Effectif: ${h.effectif}`,
      h.specificites && `Spécificités locales: ${h.specificites}`,
      h.defis && `Défis actuels: ${h.defis}`,
      h.objectifsPerso && `Objectifs personnels: ${h.objectifsPerso}`,
      h.descriptionLibre && `Description libre: ${h.descriptionLibre}`,
    ].filter(Boolean);
    return parts.length ? parts.join(' | ') : '';
  } catch { return ''; }
}

function readSimuSummary(nom: string): SimuSummary | null {
  try {
    const s = localStorage.getItem(`equipe_${nom}`);
    if (!s) return null;
    const p = JSON.parse(s) as unknown;
    const rows = Array.isArray(p) ? p as {heures:number;salaireHoraire:number}[] : ((p as {rows:typeof p[]}).rows ?? []) as {heures:number;salaireHoraire:number}[];
    if (!rows.length) return null;
    const ca: number = Array.isArray(p) ? 0 : ((p as {caAnnuel:number}).caAnnuel ?? 0);
    const totalH = rows.reduce((a, r) => a + r.heures, 0);
    const etp = totalH / 151.67;
    const masseSal = rows.reduce((a, r) => a + r.heures * r.salaireHoraire * 12 * 1.42, 0);
    const msPct = ca > 0 ? (masseSal / ca) * 100 : 0;
    let turnover: number | null = null;
    const rh = localStorage.getItem(`rh_${nom}`);
    if (rh) {
      const rhD = JSON.parse(rh) as { departs: number; effectifMoyen: number | null };
      const eff = rhD.effectifMoyen ?? etp;
      if (rhD.departs > 0 && eff > 0) turnover = (rhD.departs / eff) * 100;
    }
    return { ca, etp, msPct, masseSal, turnover };
  } catch { return null; }
}

function readRoutinesScore(nom: string): number | null {
  try {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const weekKey = monday.toISOString().slice(0, 10);
    const s = localStorage.getItem(`routines_${nom}_${weekKey}`);
    if (!s) return null;
    const weekData = JSON.parse(s) as Record<string, boolean[]>;
    const all = Object.values(weekData).flat();
    if (!all.length) return null;
    return Math.round(all.filter(Boolean).length / all.length * 100);
  } catch { return null; }
}

// ── Cercle du Cash SVG ─────────────────────────────────────────────────────
function CercleDuCash({ acheter, stocker, vendre, encaisser }: {
  acheter: number; stocker: number; vendre: number; encaisser: number;
}) {
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 95;
  const innerR = 58;
  const gap = 0.07;

  const score = Math.round((acheter + stocker + vendre + encaisser) / 4);
  const scoreColor = score >= 65 ? '#16a34a' : score >= 35 ? '#d97706' : '#dc2626';

  function c(s: number): string {
    return s >= 65 ? '#22c55e' : s >= 35 ? '#f59e0b' : '#ef4444';
  }

  const steps = [
    { label: 'ACHETER',   score: acheter,   sa: -Math.PI / 2, ea: 0 },
    { label: 'STOCKER',   score: stocker,   sa: 0,            ea: Math.PI / 2 },
    { label: 'VENDRE',    score: vendre,    sa: Math.PI / 2,  ea: Math.PI },
    { label: 'ENCAISSER', score: encaisser, sa: Math.PI,      ea: 3 * Math.PI / 2 },
  ];

  const minScore = Math.min(acheter, stocker, vendre, encaisser);

  function arcPath(sa: number, ea: number): string {
    const s = sa + gap; const e = ea - gap;
    const cos1 = Math.cos(s); const sin1 = Math.sin(s);
    const cos2 = Math.cos(e); const sin2 = Math.sin(e);
    const x1o = cx + outerR * cos1; const y1o = cy + outerR * sin1;
    const x2o = cx + outerR * cos2; const y2o = cy + outerR * sin2;
    const x2i = cx + innerR * cos2; const y2i = cy + innerR * sin2;
    const x1i = cx + innerR * cos1; const y1i = cy + innerR * sin1;
    return `M ${x1o} ${y1o} A ${outerR} ${outerR} 0 0 1 ${x2o} ${y2o} L ${x2i} ${y2i} A ${innerR} ${innerR} 0 0 0 ${x1i} ${y1i} Z`;
  }

  function labelXY(midAngle: number) {
    const r = outerR + 26;
    return { x: cx + r * Math.cos(midAngle), y: cy + r * Math.sin(midAngle) };
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {steps.map((st, i) => {
        const mid = (st.sa + st.ea) / 2;
        const lp = labelXY(mid);
        const isMin = st.score === minScore && minScore < 65;
        return (
          <g key={i}>
            <path d={arcPath(st.sa, st.ea)} fill={c(st.score)}
              stroke={isMin ? '#dc2626' : 'none'} strokeWidth={isMin ? 4 : 0}
              opacity={0.85} className={isMin ? 'animate-pulse' : ''} />
            <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle"
              fill="#1A1A1A" fontSize="10" fontWeight="700" letterSpacing="0.5">
              {st.label}
            </text>
          </g>
        );
      })}
      {steps.map((st, i) => {
        const arrowX = cx + outerR * 1.02 * Math.cos(st.ea);
        const arrowY = cy + outerR * 1.02 * Math.sin(st.ea);
        return <text key={`arr${i}`} x={arrowX} y={arrowY} textAnchor="middle"
          dominantBaseline="middle" fill="#9CA3AF" fontSize="11">→</text>;
      })}
      <text x={cx} y={cy - 10} textAnchor="middle" fill={scoreColor} fontSize="30" fontWeight="800">{score}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#6B7280" fontSize="10">/100</text>
    </svg>
  );
}


export default function Dashboard({ data, onSave, actions, onNavigate, onAddAction }: Props) {
  const [showModal, setShowModal] = useState(!data.nom);
  const [form, setForm] = useState<MagasinData>({ ...DEFAULT_DATA, ...data });
  const [vision, setVision] = useState<{ vision3ans: string; valeur1: string; valeur2: string; valeur3: string } | null>(() => {
    if (typeof window === 'undefined') return null;
    try { const s = localStorage.getItem(`vision_${data.nom}`); return s ? JSON.parse(s) : null; }
    catch { return null; }
  });
  const [histoire, setHistoire] = useState<HistoireStore>(() => {
    if (typeof window === 'undefined') return HISTOIRE_EMPTY;
    try { const s = localStorage.getItem(`histoire_${data.nom}`); return s ? JSON.parse(s) as HistoireStore : HISTOIRE_EMPTY; }
    catch { return HISTOIRE_EMPTY; }
  });
  const [showHistoire, setShowHistoire] = useState(true);

  useEffect(() => { setForm({ ...DEFAULT_DATA, ...data }); }, [data]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(`vision_${data.nom}`);
      setVision(v ? JSON.parse(v) : null);
    } catch { setVision(null); }
    try {
      const h = localStorage.getItem(`histoire_${data.nom}`);
      setHistoire(h ? JSON.parse(h) as HistoireStore : HISTOIRE_EMPTY);
    } catch { setHistoire(HISTOIRE_EMPTY); }
  }, [data.nom]);

  function handleSave() {
    if (!form.nom.trim()) return;
    onSave({ ...data, nom: form.nom, phase: form.phase });
    setShowModal(false);
  }

  const phase = data.phase ?? 'Maturité';

  function phaseScore(key: keyof MagasinData, value: number): number {
    if (value === 0) return 50;
    if (key === 'stockAge') {
      if (phase === 'Lancement') return value < 25 ? 100 : value <= 35 ? 50 : 0;
      if (phase === 'Croissance') return value < 22 ? 100 : value <= 32 ? 50 : 0;
      return value < 20 ? 100 : value <= 30 ? 50 : 0;
    }
    if (key === 'tauxMargeNette') {
      if (phase === 'Lancement') return value >= 35 ? 100 : value >= 30 ? 50 : 0;
      if (phase === 'Croissance') return value >= 36 ? 100 : value >= 33 ? 50 : 0;
      return value >= 38 ? 100 : value >= 35 ? 50 : 0;
    }
    if (key === 'noteGoogle') {
      if (phase === 'Lancement') return value > 4.0 ? 100 : value >= 3.5 ? 50 : 0;
      if (phase === 'Croissance') return value > 4.2 ? 100 : value >= 3.8 ? 50 : 0;
      return value > 4.4 ? 100 : value >= 4.0 ? 50 : 0;
    }
    const def = KPI_DEFS.find(d => d.key === key);
    return def ? def.score(value) : 50;
  }

  function avgScores(vals: number[]): number {
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  }

  const acheterScore = phaseScore('tauxAchatExterne', data.tauxAchatExterne);
  const stockerScore = phaseScore('stockAge', data.stockAge);
  const vendreScore  = avgScores([
    phaseScore('tauxTransformation', data.tauxTransformation),
    phaseScore('estalyParSemaine', data.estalyParSemaine),
    phaseScore('noteGoogle', data.noteGoogle),
  ]);
  const encaisserScore = avgScores([
    phaseScore('tauxMargeNette', data.tauxMargeNette),
    phaseScore('tauxDemarque', data.tauxDemarque),
  ]);

  const today = new Date().toISOString();
  const thisMonth = today.slice(0, 7);
  const monthActions = actions.filter(a => a.echeance.startsWith(thisMonth) && a.statut !== 'Fait').slice(0, 5);
  const [bilanOpen, setBilanOpen] = useState(false);

  function saveHistoire(h: HistoireStore) {
    setHistoire(h);
    if (data.nom) localStorage.setItem(`histoire_${data.nom}`, JSON.stringify(h));
  }

  const simuSummary = data.nom ? readSimuSummary(data.nom) : null;
  const routinesScore = data.nom ? readRoutinesScore(data.nom) : null;
  const hasBenchmark = data.nom ? !!localStorage.getItem(`benchmark_franchise_${data.nom}`) : false;
  const hasObjectifs = data.nom ? !!localStorage.getItem(`objectifs_${data.nom}_${new Date().toISOString().slice(0, 7)}`) : false;
  const hasCompetences = data.nom ? !!localStorage.getItem(`competences_${data.nom}`) : false;
  const hasCouverture = data.nom ? !!localStorage.getItem(`couverture_${data.nom}`) : false;
  const hasJournal = data.nom ? !!localStorage.getItem(`journal_achats_${data.nom}`) : false;

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#1A1A1A]">{data.nom || <span className="text-[#6B7280]">Aucun magasin configuré</span>}</h1>
          {data.nom && <span className="text-xs text-[#6B7280] bg-[#F5F5F5] border border-[#E0E0E0] px-2 py-0.5 rounded-full mt-1 inline-block">{data.phase}</span>}
        </div>
        <button
          onClick={() => { setForm({ ...DEFAULT_DATA, ...data }); setShowModal(true); }}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-[#E0E0E0] text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors"
        >
          ✏ Modifier mes données
        </button>
      </div>

      {data.nom && (
        <button onClick={() => onNavigate('objectifs')} className="w-full bg-white border border-[#E0E0E0] rounded-xl px-4 py-3 text-left hover:bg-[#FAFAFA] transition-colors group">
          {vision?.vision3ans ? (
            <>
              <p className="text-sm text-[#1A1A1A] font-medium truncate">🌟 {vision.vision3ans}</p>
              {(vision.valeur1 || vision.valeur2 || vision.valeur3) && (
                <p className="text-xs text-[#6B7280] mt-0.5">💎 {[vision.valeur1, vision.valeur2, vision.valeur3].filter(Boolean).join(' · ')}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-[#6B7280] italic group-hover:text-[#E30613]">Définissez votre vision pour personnaliser votre outil. →</p>
          )}
        </button>
      )}

      {/* Histoire du magasin */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
          <button
            onClick={() => setShowHistoire(!showHistoire)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F5F5F5] transition-colors"
          >
            <span className="text-sm font-semibold text-[#1A1A1A]">
              📖 Histoire du magasin
              {(histoire.typePdV || histoire.anneeOuverture) && (
                <span className="ml-2 text-xs font-normal text-[#6B7280]">
                  {[histoire.typePdV, histoire.anneeOuverture && `depuis ${histoire.anneeOuverture}`, histoire.effectif && `${histoire.effectif} pers.`].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
            <span className="text-xs text-[#6B7280]">{showHistoire ? '▲' : '▼'}</span>
          </button>
          {showHistoire && (
            <div className="border-t border-[#E0E0E0] px-4 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#6B7280] block mb-1">Type de point de vente</label>
                  <select
                    className="w-full bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg px-2 py-1.5 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]"
                    value={histoire.typePdV}
                    onChange={e => saveHistoire({ ...histoire, typePdV: e.target.value })}
                  >
                    <option value="">— Choisir —</option>
                    <option value="Centre-ville">Centre-ville</option>
                    <option value="Périphérie / Zone commerciale">Périphérie / Zone commerciale</option>
                    <option value="Centre commercial">Centre commercial</option>
                    <option value="Retail park">Retail park</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#6B7280] block mb-1">Année d&apos;ouverture</label>
                  <input
                    className="w-full bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg px-2 py-1.5 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]"
                    value={histoire.anneeOuverture}
                    onChange={e => saveHistoire({ ...histoire, anneeOuverture: e.target.value })}
                    placeholder="ex: 2018"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#6B7280] block mb-1">Effectif</label>
                  <input
                    className="w-full bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg px-2 py-1.5 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]"
                    value={histoire.effectif}
                    onChange={e => saveHistoire({ ...histoire, effectif: e.target.value })}
                    placeholder="ex: 4 CDI + 1 alternant"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#6B7280] block mb-1">Objectifs personnels</label>
                  <input
                    className="w-full bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg px-2 py-1.5 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]"
                    value={histoire.objectifsPerso}
                    onChange={e => saveHistoire({ ...histoire, objectifsPerso: e.target.value })}
                    placeholder="ex: Atteindre 2M€ en 2026"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-[#6B7280] block mb-1">Spécificités locales</label>
                <textarea
                  className="w-full bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg px-2 py-1.5 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613] resize-none"
                  rows={2}
                  value={histoire.specificites}
                  onChange={e => saveHistoire({ ...histoire, specificites: e.target.value })}
                  placeholder="ex: Fort flux touristique en été, concurrence discount à 500m…"
                />
              </div>
              <div>
                <label className="text-xs text-[#6B7280] block mb-1">Défis actuels</label>
                <textarea
                  className="w-full bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg px-2 py-1.5 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613] resize-none"
                  rows={2}
                  value={histoire.defis}
                  onChange={e => saveHistoire({ ...histoire, defis: e.target.value })}
                  placeholder="ex: Stock âgé élevé sur téléphones, turnover équipe important…"
                />
              </div>
              <div>
                <label className="text-xs text-[#6B7280] block mb-1">Comment décririez-vous votre activité avec vos mots ?</label>
                <textarea
                  className="w-full bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg px-2 py-1.5 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613] resize-none"
                  rows={4}
                  value={histoire.descriptionLibre}
                  onChange={e => saveHistoire({ ...histoire, descriptionLibre: e.target.value })}
                  placeholder="Décrivez librement votre magasin, votre équipe, votre clientèle, ce qui rend votre point de vente unique…"
                />
              </div>
            </div>
          )}
        </div>

      {data.nom && (
        <>
          {/* Bilan accordion */}
          <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
            <button onClick={() => setBilanOpen(!bilanOpen)} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#F5F5F5] transition-colors">
              <span className="font-semibold text-sm text-[#1A1A1A]">Bilan complet</span>
              <span className="text-[#6B7280] text-xs">{bilanOpen ? '▲ Replier' : '▼ Déplier'}</span>
            </button>
            {bilanOpen && (
              <div className="border-t border-[#E0E0E0] p-5 space-y-5">
                <div className="flex flex-col items-center">
                  <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-4">Cercle du Cash</h3>
                  <CercleDuCash acheter={acheterScore} stocker={stockerScore} vendre={vendreScore} encaisser={encaisserScore} />
                  <p className="text-xs text-[#6B7280] mt-2">L&apos;étape la plus faible est encadrée en rouge</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1A1A1A] mb-3">Quel est votre problème aujourd&apos;hui ?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { icon: '💰', label: "Je ne gagne pas assez d'argent", tab: 'assistant' },
                      { icon: '📉', label: 'Mes ventes baissent', tab: 'assistant' },
                      { icon: '📦', label: 'Mon stock me pose problème', tab: 'assistant' },
                      { icon: '👥', label: 'Mon équipe ne performe pas', tab: 'assistant' },
                    ].map(b => (
                      <button key={b.label} onClick={() => onNavigate(b.tab)} className="text-left p-3 rounded-xl bg-[#F5F5F5] border border-[#E0E0E0] hover:bg-[#EBEBEB] transition-colors text-sm text-[#1A1A1A]">
                        <span className="mr-1.5">{b.icon}</span>{b.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-3">Actions du mois ({monthActions.length})</h3>
                  {monthActions.length === 0 ? (
                    <p className="text-[#6B7280] text-sm">Aucune action ce mois-ci.</p>
                  ) : (
                    <div className="space-y-2">
                      {monthActions.map(a => (
                        <div key={a.id} className="flex items-center gap-3 text-sm">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${a.statut === 'En cours' ? 'bg-yellow-400' : 'bg-[#D1D5DB]'}`} />
                          <span className="flex-1 truncate font-medium text-[#1A1A1A]">{a.titre}</span>
                          <span className="text-[#6B7280] text-xs">{a.pilote}</span>
                          {a.gain > 0 && <span className="text-green-600 text-xs font-semibold">+{a.gain.toLocaleString('fr-FR')}€</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Modules actifs */}
          {(simuSummary || routinesScore !== null || hasBenchmark || hasObjectifs || hasCompetences || hasCouverture || hasJournal) && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Synthèse modules</h3>

              {/* Simulateur */}
              {simuSummary && (
                <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#1A1A1A]">💰 Équipe & RH</span>
                    <button onClick={() => onNavigate('simulateur')} className="text-[10px] text-[#E30613] hover:underline">Voir →</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <div className="text-lg font-black text-[#1A1A1A]">{simuSummary.ca > 0 ? `${(simuSummary.ca/1000).toFixed(0)}k€` : '—'}</div>
                      <div className="text-[10px] text-[#6B7280]">CA annuel</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-lg font-black ${simuSummary.msPct === 0 ? 'text-[#6B7280]' : simuSummary.msPct <= 15 ? 'text-green-600' : simuSummary.msPct <= 18 ? 'text-orange-500' : 'text-red-600'}`}>
                        {simuSummary.ca > 0 ? `${simuSummary.msPct.toFixed(1)}%` : '—'}
                      </div>
                      <div className="text-[10px] text-[#6B7280]">Masse sal.</div>
                    </div>
                    <div className="text-center">
                      {simuSummary.turnover !== null ? (
                        <>
                          <div className={`text-lg font-black ${simuSummary.turnover <= 15 ? 'text-green-600' : simuSummary.turnover <= 30 ? 'text-orange-500' : 'text-red-600'}`}>
                            {simuSummary.turnover.toFixed(0)}%
                          </div>
                          <div className="text-[10px] text-[#6B7280]">Turnover</div>
                        </>
                      ) : (
                        <>
                          <div className="text-lg font-black text-[#1A1A1A]">{simuSummary.etp.toFixed(1)}</div>
                          <div className="text-[10px] text-[#6B7280]">ETP</div>
                        </>
                      )}
                    </div>
                  </div>
                  {onAddAction && simuSummary.ca > 0 && simuSummary.msPct > 18 && (
                    <button onClick={() => {
                      const d = new Date(); d.setDate(d.getDate() + 14);
                      onAddAction({ id: String(Date.now()), titre: `Masse salariale critique à ${simuSummary!.msPct.toFixed(1)}% du CA`, axe: 'Management', pilote: 'Franchisé', copilote: '', description: `Masse salariale à ${simuSummary!.msPct.toFixed(1)}% du CA (seuil ≤15%). Coût annuel : ${Math.round(simuSummary!.masseSal).toLocaleString('fr-FR')} €.`, echeance: d.toISOString().slice(0, 10), priorite: 1, gain: 0, statut: 'À faire' });
                    }} className="mt-2 text-[10px] text-white bg-[#E30613] hover:bg-red-700 rounded-full px-2 py-0.5 transition-colors">+ PAP</button>
                  )}
                </div>
              )}

              {/* Other module badges */}
              <div className="flex flex-wrap gap-2">
                {routinesScore !== null && (
                  <button onClick={() => onNavigate('routines')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    routinesScore >= 80 ? 'bg-green-50 border-green-300 text-green-700' : routinesScore >= 50 ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-red-50 border-red-300 text-red-700'
                  }`}>
                    🔁 Routines {routinesScore}%
                  </button>
                )}
                {hasBenchmark && (
                  <button onClick={() => onNavigate('benchmark')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-[#F5F5F5] border-[#E0E0E0] text-[#1A1A1A] hover:bg-[#EBEBEB] transition-colors">
                    📊 Benchmark ✓
                  </button>
                )}
                {hasObjectifs && (
                  <button onClick={() => onNavigate('objectifs')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-[#F5F5F5] border-[#E0E0E0] text-[#1A1A1A] hover:bg-[#EBEBEB] transition-colors">
                    🎯 Objectifs ✓
                  </button>
                )}
                {hasCompetences && (
                  <button onClick={() => onNavigate('competences')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-[#F5F5F5] border-[#E0E0E0] text-[#1A1A1A] hover:bg-[#EBEBEB] transition-colors">
                    🎓 Compétences ✓
                  </button>
                )}
                {hasCouverture && (
                  <button onClick={() => onNavigate('couverture')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-[#F5F5F5] border-[#E0E0E0] text-[#1A1A1A] hover:bg-[#EBEBEB] transition-colors">
                    🗂 Gamme ✓
                  </button>
                )}
                {hasJournal && (
                  <button onClick={() => onNavigate('journal')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-[#F5F5F5] border-[#E0E0E0] text-[#1A1A1A] hover:bg-[#EBEBEB] transition-colors">
                    📊 Journal ✓
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal — qualitative config only */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center pt-4 pb-8">
          <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 shadow-xl">

            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#E0E0E0]">
              <h2 className="text-lg font-bold text-[#1A1A1A]">Données du magasin</h2>
              <button onClick={() => setShowModal(false)} className="text-[#6B7280] hover:text-[#1A1A1A] text-xl leading-none">✕</button>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* Nom + Phase */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#6B7280] mb-1">Nom du magasin *</label>
                  <input
                    className="w-full bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#E30613]"
                    value={form.nom}
                    onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                    placeholder="ex: EasyCash Lyon Centre"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#6B7280] mb-1">Phase de vie</label>
                  <select
                    className="w-full bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#E30613]"
                    value={form.phase}
                    onChange={e => setForm(f => ({ ...f, phase: e.target.value as Phase }))}
                  >
                    <option>Lancement</option><option>Croissance</option><option>Maturité</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={!form.nom.trim()}
                className="w-full py-3 rounded-xl font-bold text-sm bg-[#E30613] text-white disabled:opacity-40 hover:bg-[#B8050F] transition-colors"
              >
                💾 Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
