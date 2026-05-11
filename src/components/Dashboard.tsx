'use client';

import { useState, useEffect } from 'react';
import type { MagasinData, PAPAction, Phase } from '@/types';
import { DEFAULT_DATA } from '@/types';
import { KPI_DEFS, parsePastedText } from '@/lib/kpis';
import { SEUIL_DEFAULTS } from '@/lib/seuils';

interface Props {
  data: MagasinData;
  onSave: (d: MagasinData) => void;
  actions: PAPAction[];
  onNavigate: (tab: string) => void;
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
  const scoreColor = score >= 65 ? '#22c55e' : score >= 35 ? '#f59e0b' : '#ef4444';

  function c(s: number): string {
    return s >= 65 ? '#22c55e' : s >= 35 ? '#f59e0b' : '#ef4444';
  }

  // 4 arcs, each ~90° with gap. SVG: 0=right, clockwise.
  // ACHETER=top-right(-π/2→0), STOCKER=bottom-right(0→π/2),
  // VENDRE=bottom-left(π/2→π), ENCAISSER=top-left(π→3π/2)
  const steps = [
    { label: 'ACHETER',   score: acheter,   sa: -Math.PI / 2, ea: 0 },
    { label: 'STOCKER',   score: stocker,   sa: 0,            ea: Math.PI / 2 },
    { label: 'VENDRE',    score: vendre,    sa: Math.PI / 2,  ea: Math.PI },
    { label: 'ENCAISSER', score: encaisser, sa: Math.PI,      ea: 3 * Math.PI / 2 },
  ];

  const minScore = Math.min(acheter, stocker, vendre, encaisser);

  function arcPath(sa: number, ea: number): string {
    const s = sa + gap;
    const e = ea - gap;
    const cos1 = Math.cos(s); const sin1 = Math.sin(s);
    const cos2 = Math.cos(e); const sin2 = Math.sin(e);
    const x1o = cx + outerR * cos1; const y1o = cy + outerR * sin1;
    const x2o = cx + outerR * cos2; const y2o = cy + outerR * sin2;
    const x2i = cx + innerR * cos2; const y2i = cy + innerR * sin2;
    const x1i = cx + innerR * cos1; const y1i = cy + innerR * sin1;
    return `M ${x1o} ${y1o} A ${outerR} ${outerR} 0 0 1 ${x2o} ${y2o} L ${x2i} ${y2i} A ${innerR} ${innerR} 0 0 0 ${x1i} ${y1i} Z`;
  }

  function labelXY(midAngle: number): { x: number; y: number } {
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
            <path
              d={arcPath(st.sa, st.ea)}
              fill={c(st.score)}
              stroke={isMin ? '#ef4444' : 'none'}
              strokeWidth={isMin ? 4 : 0}
              opacity={0.85}
              className={isMin ? 'animate-pulse' : ''}
            />
            <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle"
              fill="#e5e7eb" fontSize="10" fontWeight="700" letterSpacing="0.5">
              {st.label}
            </text>
          </g>
        );
      })}
      {/* Arrows */}
      {steps.map((st, i) => {
        const nextAngle = st.ea;
        const arrowX = cx + outerR * 1.02 * Math.cos(nextAngle);
        const arrowY = cy + outerR * 1.02 * Math.sin(nextAngle);
        return (
          <text key={`arr${i}`} x={arrowX} y={arrowY} textAnchor="middle"
            dominantBaseline="middle" fill="#6b7280" fontSize="11">→</text>
        );
      })}
      {/* Center */}
      <text x={cx} y={cy - 10} textAnchor="middle" fill={scoreColor} fontSize="30" fontWeight="800">{score}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#9ca3af" fontSize="10">/100</text>
    </svg>
  );
}

// ── Number input helper ────────────────────────────────────────────────────
function NI({ label, field, form, setF, unit, placeholder, seuil, onSeuil }: {
  label: string; field: keyof MagasinData;
  form: MagasinData; setF: (k: keyof MagasinData, v: number) => void;
  unit?: string; placeholder?: string;
  seuil?: number; onSeuil?: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}{unit ? ` (${unit})` : ''}</label>
      <input type="number"
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
        value={(form[field] as number) || ''}
        onChange={e => setF(field, parseFloat(e.target.value) || 0)}
        placeholder={placeholder ?? '0'}
      />
      {onSeuil !== undefined && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className="text-[10px] text-yellow-500/70 whitespace-nowrap">Mon seuil :</span>
          <input type="number"
            className="flex-1 min-w-0 bg-gray-900/60 border border-yellow-700/40 rounded px-2 py-1 text-yellow-300 text-xs focus:outline-none focus:border-yellow-500"
            value={seuil ?? ''}
            onChange={e => { const v = parseFloat(e.target.value); onSeuil(isNaN(v) ? 0 : v); }}
            placeholder="cible..."
          />
        </div>
      )}
    </div>
  );
}

const CHECKUP_FIELDS: Record<string, Array<{ key: string; label: string; unit: string }>> = {
  Lancement: [
    { key: 'noteGoogle', label: 'Note Google', unit: '' },
    { key: 'estalyParSemaine', label: 'Estaly / semaine', unit: '' },
    { key: 'stockTotal', label: 'Stock total', unit: '€' },
    { key: 'panierMoyen', label: 'Panier moyen', unit: '€' },
    { key: 'nbEtp', label: 'Nb ETP', unit: '' },
  ],
  Croissance: [
    { key: 'stockAge', label: 'Stock âgé', unit: '%' },
    { key: 'gmroi', label: 'GMROI', unit: '' },
    { key: 'masseSalarialePct', label: 'Masse salariale', unit: '%' },
    { key: 'noteGoogle', label: 'Note Google', unit: '' },
    { key: 'ventesAdditionnelles', label: 'Ventes additionnelles', unit: '%' },
  ],
  Maturité: [
    { key: 'gmroi', label: 'GMROI', unit: '' },
    { key: 'masseSalarialePct', label: 'Masse salariale', unit: '%' },
    { key: 'tauxMargeNette', label: 'Marge nette', unit: '%' },
    { key: 'tauxTurnover', label: 'Turnover', unit: '%' },
    { key: 'poidsDigital', label: 'Poids digital', unit: '%' },
  ],
};

const CHECKUP_DIR: Record<string, 'higher' | 'lower'> = {
  noteGoogle: 'higher', estalyParSemaine: 'higher', panierMoyen: 'higher',
  gmroi: 'higher', poidsDigital: 'higher', tauxMargeNette: 'higher',
  ventesAdditionnelles: 'higher',
  stockAge: 'lower', masseSalarialePct: 'lower', tauxTurnover: 'lower',
};

const CHECKUP_ACTION: Record<string, string> = {
  stockAge: 'Traitez votre TOP 20 valeur cette semaine',
  masseSalarialePct: 'Revoyez vos heures sup, gelez les embauches',
  gmroi: "Déstockez avant d'acheter",
  noteGoogle: 'Relance avis systématique en caisse',
  estalyParSemaine: 'Concours équipe + prime 5€/contrat',
  panierMoyen: 'Challenge +1 accessoire par vente',
  ventesAdditionnelles: 'Brief vendeurs sur les périphériques',
  tauxMargeNette: 'Vérifier mix rayon',
  tauxTurnover: 'Entretiens individuels prioritaires',
  poidsDigital: 'Push EC.fr et marketplaces',
};

export default function Dashboard({ data, onSave, actions, onNavigate }: Props) {
  const [showModal, setShowModal] = useState(!data.nom);
  const [form, setForm] = useState<MagasinData>({ ...DEFAULT_DATA, ...data });
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteCount, setPasteCount] = useState(0);
  const [importMsg, setImportMsg] = useState('');
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set());
  const [customSeuils, setCustomSeuils] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return { ...SEUIL_DEFAULTS };
    try { const s = localStorage.getItem(`seuils_${data.nom}`); return s ? JSON.parse(s) as Record<string, number> : { ...SEUIL_DEFAULTS }; }
    catch { return { ...SEUIL_DEFAULTS }; }
  });
  const [showCheckup, setShowCheckup] = useState(false);
  const [checkupValues, setCheckupValues] = useState<Record<string, number>>({});
  const [checkupResult, setCheckupResult] = useState<{ priorityKey: string; priorityLabel: string; action: string } | null>(null);

  useEffect(() => {
    setForm({ ...DEFAULT_DATA, ...data });
  }, [data]);

  useEffect(() => {
    try { const s = localStorage.getItem(`seuils_${data.nom}`); setCustomSeuils(s ? JSON.parse(s) as Record<string, number> : { ...SEUIL_DEFAULTS }); }
    catch { setCustomSeuils({ ...SEUIL_DEFAULTS }); }
  }, [data.nom]);

  function setF(k: keyof MagasinData, v: number) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function setCustomSeuil(key: string, v: number) {
    setCustomSeuils(prev => {
      const next = { ...prev };
      if (v === 0) delete next[key]; else next[key] = v;
      return next;
    });
  }

  function handlePaste() {
    const parsed = parsePastedText(pasteText);
    const keys = Object.keys(parsed);
    setForm(f => ({ ...f, ...parsed }));
    setHighlightedFields(new Set(keys));
    setPasteCount(keys.length);
    setPasteMode(false);
  }

  async function handleExcel(file: File) {
    setImportMsg('Import en cours...');
    try {
      const XLSX = await import('xlsx');
      const data2 = await file.arrayBuffer();
      const wb = XLSX.read(data2, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

      const headers: string[] = [];
      const values: unknown[] = [];
      rows.forEach((row: unknown[]) => {
        if (Array.isArray(row) && row.length >= 2) {
          headers.push(String(row[0]).toLowerCase());
          values.push(row[1]);
        }
      });

      const text = headers.map((h, i) => `${h} ${values[i]}`).join('\n');
      const parsed = parsePastedText(text);
      const keys = Object.keys(parsed);
      setForm(f => ({ ...f, ...parsed }));
      setHighlightedFields(new Set(keys));
      setImportMsg(`✓ ${keys.length} valeur(s) détectée(s) : ${keys.join(', ')}`);
    } catch {
      setImportMsg("Erreur d'import. Vérifiez le format du fichier.");
    }
  }

  function handleSave() {
    if (!form.nom.trim()) return;
    onSave(form);
    localStorage.setItem(`seuils_${form.nom}`, JSON.stringify(customSeuils));
    setShowModal(false);
    setHighlightedFields(new Set());
    setPasteCount(0);
    setImportMsg('');
  }

  function handleCheckup() {
    const fields = CHECKUP_FIELDS[phase] ?? CHECKUP_FIELDS['Maturité'];
    let worstKey = '';
    let worstLabel = '';
    let worstDeviation = -Infinity;
    fields.forEach(f => {
      const value = checkupValues[f.key];
      const seuil = customSeuils[f.key];
      if (!value || !seuil) return;
      const dir = CHECKUP_DIR[f.key] ?? 'higher';
      const deviation = dir === 'higher' ? (seuil - value) / seuil : (value - seuil) / seuil;
      if (deviation > worstDeviation) {
        worstDeviation = deviation;
        worstKey = f.key;
        worstLabel = f.label;
      }
    });
    setCheckupResult({
      priorityKey: worstKey,
      priorityLabel: worstLabel,
      action: worstKey ? (CHECKUP_ACTION[worstKey] ?? '') : '',
    });
  }

  // Phase-aware KPI scoring for Cercle du Cash
  const phase = data.phase ?? 'Maturité';

  function phaseScore(key: keyof MagasinData, value: number): number {
    if (value === 0) return 50;
    if (key === 'stockAge') {
      if (phase === 'Lancement') return value < 25 ? 100 : value <= 35 ? 50 : 0;
      if (phase === 'Croissance') return value < 22 ? 100 : value <= 32 ? 50 : 0;
      return value < 20 ? 100 : value <= 30 ? 50 : 0;
    }
    if (key === 'gmroi') {
      if (phase === 'Lancement') return value >= 2 ? 100 : value >= 1.5 ? 50 : 0;
      if (phase === 'Croissance') return value >= 3 ? 100 : value >= 2 ? 50 : 0;
      return value >= 3.5 ? 100 : value >= 2.5 ? 50 : 0;
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

  // ACHETER: achat externe (inversé), gamme tel, piceasoft
  const acheterScore = avgScores([
    phaseScore('tauxAchatExterne', data.tauxAchatExterne),
    phaseScore('gammeTel', data.gammeTel),
    phaseScore('tauxPiceasoft', data.tauxPiceasoft),
  ]);

  // STOCKER: stock âgé (inversé), GMROI, moyenne délais vente
  const delaiKeys: Array<keyof MagasinData> = ['delaiTel', 'delaiConsole', 'delaiJV', 'delaiTablette', 'delaiPC'];
  const delaiScores = delaiKeys
    .map(k => { const v = data[k] as number; if (v <= 0) return null; const def = KPI_DEFS.find(d => d.key === k); return def ? def.score(v) : null; })
    .filter((v): v is number => v !== null);
  const stockerScore = avgScores([
    phaseScore('stockAge', data.stockAge),
    phaseScore('gmroi', data.gmroi),
    delaiScores.length > 0 ? Math.round(delaiScores.reduce((s, v) => s + v, 0) / delaiScores.length) : 50,
  ]);

  // VENDRE: transformation, panier moyen, estaly, note google
  const vendreScore = avgScores([
    phaseScore('tauxTransformation', data.tauxTransformation),
    phaseScore('panierMoyen', data.panierMoyen),
    phaseScore('estalyParSemaine', data.estalyParSemaine),
    phaseScore('noteGoogle', data.noteGoogle),
  ]);

  // ENCAISSER: marge nette, démarque (inversé)
  const encaisserScore = avgScores([
    phaseScore('tauxMargeNette', data.tauxMargeNette),
    phaseScore('tauxDemarque', data.tauxDemarque),
  ]);

  const today = new Date().toISOString();
  const thisMonth = today.slice(0, 7);
  const monthActions = actions.filter(a => a.echeance.startsWith(thisMonth) && a.statut !== 'Fait').slice(0, 5);

  // ── Priority computation (AXE 1) ───────────────────────────────────────────
  const [bilanOpen, setBilanOpen] = useState(false);

  const KPI_DIR_DASH: Record<string, 'higher' | 'lower'> = {
    tauxMargeNette: 'higher', gmroi: 'higher', noteGoogle: 'higher',
    estalyParSemaine: 'higher', panierMoyen: 'higher', tauxTransformation: 'higher',
    poidsDigital: 'higher', tauxPiceasoft: 'higher', tauxFormation: 'higher',
    stockAge: 'lower', tauxDemarque: 'lower', masseSalarialePct: 'lower',
    tauxTurnover: 'lower', tauxAnnulationWeb: 'lower', tauxAchatExterne: 'lower',
  };
  const KPI_ACTION_DASH: Record<string, string> = {
    stockAge: 'Traitez votre TOP 20 valeur cette semaine',
    masseSalarialePct: 'Revoyez vos heures sup, gelez les embauches',
    gmroi: "Déstockez avant d'acheter",
    noteGoogle: 'Relance avis systématique en caisse',
    estalyParSemaine: 'Concours équipe + prime 5€/contrat',
    panierMoyen: 'Challenge +1 accessoire par vente',
    tauxMargeNette: 'Vérifier mix rayon',
    tauxTurnover: 'Entretiens individuels prioritaires',
    poidsDigital: 'Push EC.fr et marketplaces',
    tauxDemarque: 'Audit démarque urgent — procédure et inventaire',
    tauxTransformation: 'Brief argumentation — méthode VPD',
  };

  let topKey = '', topLabel = '', topAction = '', topGain = 0;
  let topDev = -Infinity;
  Object.entries(KPI_DIR_DASH).forEach(([key, dir]) => {
    const val = data[key as keyof MagasinData] as number;
    const seuil = customSeuils[key];
    if (!val || !seuil) return;
    const dev = dir === 'higher' ? (seuil - val) / seuil : (val - seuil) / seuil;
    if (dev > topDev) {
      topDev = dev;
      topKey = key;
      topLabel = KPI_DEFS.find(d => d.key === key)?.label ?? key;
      topAction = KPI_ACTION_DASH[key] ?? '';
      if (key === 'stockAge' && data.stockTotal) {
        topGain = Math.round(data.stockTotal * Math.max(dev, 0) * (data.gmroi || 1.5) * 0.25);
      } else if (key === 'masseSalarialePct' && data.caAnnuel) {
        topGain = Math.round(data.caAnnuel * Math.max(dev, 0) * 0.05);
      } else if (data.caAnnuel) {
        topGain = Math.round(data.caAnnuel * Math.max(dev, 0) * 0.03);
      }
    }
  });

  const ic = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FF1F2E]';
  const hl = (k: string) => highlightedFields.has(k) ? 'ring-2 ring-[#FF1F2E]' : '';

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">{data.nom || <span className="text-gray-500">Aucun magasin configuré</span>}</h1>
          {data.nom && <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full mt-1 inline-block">{data.phase}</span>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setCheckupValues({}); setCheckupResult(null); setShowCheckup(true); }}
            className="px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wide bg-[#FF1F2E] text-white hover:bg-red-600 transition-colors"
          >
            ⏱ Check-up 15 min
          </button>
          <button
            onClick={() => { setForm({ ...DEFAULT_DATA, ...data }); setShowModal(true); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
          >
            ✏ Modifier mes données
          </button>
        </div>
      </div>

      {!data.nom && !showModal && (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">🏪</div>
          <p className="text-gray-400">Configurez votre magasin pour commencer.</p>
          <button onClick={() => setShowModal(true)} className="mt-4 px-5 py-2.5 rounded-xl font-bold text-sm uppercase tracking-wide bg-[#FF1F2E] text-white">
            Saisir mes données
          </button>
        </div>
      )}

      {data.nom && (
        <>
          {/* Section 1 — Votre priorité cette semaine */}
          {topKey && topDev > 0 ? (
            <div className="bg-[#FF1F2E] rounded-xl p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-widest text-white/80 mb-2">Votre priorité cette semaine</p>
              <h2 className="text-xl font-black leading-tight">{topAction}</h2>
              <p className="text-sm text-white/80 mt-1">{topLabel} — écart {Math.round(topDev * 100)}% vs seuil</p>
              {topGain > 0 && (
                <p className="text-3xl font-black mt-3">+{topGain.toLocaleString('fr-FR')} €</p>
              )}
              <button
                onClick={() => onNavigate('plan')}
                className="mt-4 px-4 py-2 bg-white text-[#FF1F2E] font-bold text-sm rounded-md uppercase tracking-wide hover:bg-white/90 transition-colors"
              >
                Ajouter au plan d&apos;action
              </button>
            </div>
          ) : (
            <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 text-center">
              <p className="text-green-400 font-semibold text-sm">✓ Tous vos KPIs sont dans les seuils — continuez comme ça !</p>
              {!topKey && <p className="text-xs text-gray-500 mt-1">Saisissez vos données et vos seuils dans le formulaire pour obtenir des recommandations.</p>}
            </div>
          )}

          {/* Section 2 — Votre situation (3 KPI critiques) */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'stockAge',        label: 'Stock âgé',    unit: '%',  dir: 'lower'  as const, defaultSeuil: 30 },
              { key: 'gmroi',           label: 'GMROI',        unit: '',   dir: 'higher' as const, defaultSeuil: 3.84 },
              { key: 'masseSalarialePct', label: 'Masse sal.', unit: '% CA', dir: 'lower' as const, defaultSeuil: 15 },
            ].map(kpi => {
              const val = data[kpi.key as keyof MagasinData] as number;
              const seuil = customSeuils[kpi.key] || kpi.defaultSeuil;
              const hasData = val > 0;
              const isOk  = hasData && (kpi.dir === 'higher' ? val >= seuil : val <= seuil);
              const isBad = hasData && (kpi.dir === 'higher' ? val < seuil * 0.85 : val > seuil * 1.2);
              return (
                <div key={kpi.key} className={`bg-gray-800 rounded-xl p-3 text-center border-l-4 ${
                  !hasData ? 'border-gray-600' : isOk ? 'border-green-500' : isBad ? 'border-[#FF1F2E]' : 'border-orange-400'
                }`}>
                  <div className={`text-2xl font-black ${
                    !hasData ? 'text-gray-500' : isOk ? 'text-green-400' : isBad ? 'text-[#FF1F2E]' : 'text-orange-400'
                  }`}>
                    {hasData ? `${kpi.unit === '%' || kpi.unit === '% CA' ? '' : ''}${val}${kpi.unit ? ' '+kpi.unit : ''}` : '—'}
                  </div>
                  <div className="text-xs text-gray-300 font-medium">{kpi.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">seuil {seuil}{kpi.unit ? ' '+kpi.unit : ''}</div>
                </div>
              );
            })}
          </div>

          {/* Section 3 — Bilan complet (accordion) */}
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setBilanOpen(!bilanOpen)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-750 transition-colors"
            >
              <span className="font-semibold text-sm text-gray-200">Bilan complet</span>
              <span className="text-gray-400 text-xs">{bilanOpen ? '▲ Replier' : '▼ Déplier'}</span>
            </button>

            {bilanOpen && (
              <div className="border-t border-gray-700 p-5 space-y-5">
                {/* Cercle du Cash */}
                <div className="flex flex-col items-center">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Cercle du Cash</h3>
                  <CercleDuCash acheter={acheterScore} stocker={stockerScore} vendre={vendreScore} encaisser={encaisserScore} />
                  <p className="text-xs text-gray-500 mt-2">L&apos;étape la plus faible est encadrée en rouge</p>
                </div>

                {/* Problem buttons */}
                <div>
                  <p className="text-sm font-semibold text-gray-300 mb-3">Quel est votre problème aujourd&apos;hui ?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { icon: '💰', label: "Je ne gagne pas assez d'argent", tab: 'diagnostic' },
                      { icon: '📉', label: 'Mes ventes baissent', tab: 'diagnostic' },
                      { icon: '📦', label: 'Mon stock me pose problème', tab: 'diagnostic' },
                      { icon: '👥', label: 'Mon équipe ne performe pas', tab: 'diagnostic' },
                    ].map(b => (
                      <button
                        key={b.label}
                        onClick={() => onNavigate(b.tab)}
                        className="text-left p-3 rounded-xl bg-gray-700 hover:bg-gray-600 transition-colors text-sm"
                      >
                        <span className="mr-1.5">{b.icon}</span>{b.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions du mois */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Actions du mois ({monthActions.length})
                  </h3>
                  {monthActions.length === 0 ? (
                    <p className="text-gray-500 text-sm">Aucune action ce mois-ci.</p>
                  ) : (
                    <div className="space-y-2">
                      {monthActions.map(a => (
                        <div key={a.id} className="flex items-center gap-3 text-sm">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${a.statut === 'En cours' ? 'bg-yellow-400' : 'bg-gray-600'}`} />
                          <span className="flex-1 truncate font-medium">{a.titre}</span>
                          <span className="text-gray-500 text-xs">{a.pilote}</span>
                          {a.gain > 0 && <span className="text-green-400 text-xs font-semibold">+{a.gain.toLocaleString('fr-FR')}€</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-start justify-center pt-4 pb-8">
          <div className="bg-gray-800 rounded-2xl w-full max-w-2xl mx-4 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Données du magasin</h2>
                <p className="text-[10px] text-yellow-600/60 mt-0.5">Champs jaunes = votre seuil cible personnalisé</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            {/* Import buttons */}
            <div className="flex gap-2 flex-wrap">
              <label className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors">
                📂 Importer Excel/CSV
                <input type="file" accept=".xlsx,.csv" className="hidden" onChange={e => e.target.files?.[0] && handleExcel(e.target.files[0])} />
              </label>
              <button onClick={() => setPasteMode(!pasteMode)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700 text-gray-200 hover:bg-gray-600">
                📋 Coller mes données
              </button>
              {importMsg && <span className="text-xs text-green-400 self-center">{importMsg}</span>}
              {pasteCount > 0 && !importMsg && <span className="text-xs text-green-400 self-center">✓ {pasteCount} valeur(s) détectée(s)</span>}
            </div>

            {pasteMode && (
              <div className="space-y-2">
                <textarea
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none resize-none"
                  rows={4}
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  placeholder="Collez vos données ici (ex: marge 38%, stock âgé 25%, GMROI 2.1...)"
                />
                <button onClick={handlePaste} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-black">
                  Détecter les valeurs
                </button>
              </div>
            )}

            {/* General */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nom du magasin *</label>
                <input className={ic} value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="ex: EasyCash Lyon Centre" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Phase de vie</label>
                <select className={ic} value={form.phase} onChange={e => setForm(f => ({ ...f, phase: e.target.value as Phase }))}>
                  <option>Lancement</option><option>Croissance</option><option>Maturité</option>
                </select>
              </div>
            </div>

            {/* Rentabilité */}
            <Section title="💰 Rentabilité">
              <div className={hl('caAnnuel')}><NI label="CA annuel" field="caAnnuel" form={form} setF={setF} unit="€" seuil={customSeuils['caAnnuel']} onSeuil={v => setCustomSeuil('caAnnuel', v)} /></div>
              <div className={hl('tauxMargeNette')}><NI label="Taux de marge nette" field="tauxMargeNette" form={form} setF={setF} unit="%" seuil={customSeuils['tauxMargeNette']} onSeuil={v => setCustomSeuil('tauxMargeNette', v)} /></div>
              <div className={hl('tauxDemarque')}><NI label="Taux de démarque" field="tauxDemarque" form={form} setF={setF} unit="%" seuil={customSeuils['tauxDemarque']} onSeuil={v => setCustomSeuil('tauxDemarque', v)} /></div>
            </Section>

            {/* Stock */}
            <Section title="📦 Stock">
              <div className={hl('stockTotal')}><NI label="Stock total" field="stockTotal" form={form} setF={setF} unit="€" seuil={customSeuils['stockTotal']} onSeuil={v => setCustomSeuil('stockTotal', v)} /></div>
              <div className={hl('stockAge')}><NI label="Stock âgé" field="stockAge" form={form} setF={setF} unit="%" seuil={customSeuils['stockAge']} onSeuil={v => setCustomSeuil('stockAge', v)} /></div>
              <div className={hl('gmroi')}><NI label="GMROI" field="gmroi" form={form} setF={setF} placeholder="3.84" seuil={customSeuils['gmroi']} onSeuil={v => setCustomSeuil('gmroi', v)} /></div>
              <div className="col-span-1">
                <label className="text-xs text-gray-400 block mb-1">Top 20 vieux stock traité ?</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setForm(f => ({ ...f, top20Traite: !f.top20Traite }))}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.top20Traite ? 'bg-green-500' : 'bg-gray-600'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.top20Traite ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 italic mt-0.5 leading-snug">Priorité absolue — Intranet &gt; Stats &gt; Stocks &gt; Ventilation</p>
              </div>
              <NI label="Délai Tel. (j)" field="delaiTel" form={form} setF={setF} seuil={customSeuils['delaiTel']} onSeuil={v => setCustomSeuil('delaiTel', v)} />
              <NI label="Délai Console (j)" field="delaiConsole" form={form} setF={setF} seuil={customSeuils['delaiConsole']} onSeuil={v => setCustomSeuil('delaiConsole', v)} />
              <NI label="Délai JV (j)" field="delaiJV" form={form} setF={setF} seuil={customSeuils['delaiJV']} onSeuil={v => setCustomSeuil('delaiJV', v)} />
              <NI label="Délai Tablette (j)" field="delaiTablette" form={form} setF={setF} seuil={customSeuils['delaiTablette']} onSeuil={v => setCustomSeuil('delaiTablette', v)} />
              <NI label="Délai PC (j)" field="delaiPC" form={form} setF={setF} seuil={customSeuils['delaiPC']} onSeuil={v => setCustomSeuil('delaiPC', v)} />
            </Section>

            {/* Commerce */}
            <Section title="🛒 Commerce">
              <div className={hl('tauxTransformation')}><NI label="Taux transformation" field="tauxTransformation" form={form} setF={setF} unit="%" seuil={customSeuils['tauxTransformation']} onSeuil={v => setCustomSeuil('tauxTransformation', v)} /></div>
              <div className={hl('panierMoyen')}><NI label="Panier moyen" field="panierMoyen" form={form} setF={setF} unit="€" seuil={customSeuils['panierMoyen']} onSeuil={v => setCustomSeuil('panierMoyen', v)} /></div>
              <NI label="Ventes additionnelles" field="ventesAdditionnelles" form={form} setF={setF} unit="€" seuil={customSeuils['ventesAdditionnelles']} onSeuil={v => setCustomSeuil('ventesAdditionnelles', v)} />
              <div className={hl('estalyParSemaine')}><NI label="Estaly/semaine" field="estalyParSemaine" form={form} setF={setF} seuil={customSeuils['estalyParSemaine']} onSeuil={v => setCustomSeuil('estalyParSemaine', v)} /></div>
              <div className={hl('noteGoogle')}><NI label="Note Google" field="noteGoogle" form={form} setF={setF} placeholder="4.3" seuil={customSeuils['noteGoogle']} onSeuil={v => setCustomSeuil('noteGoogle', v)} /></div>
              <div className={hl('poidsDigital')}><NI label="Poids digital" field="poidsDigital" form={form} setF={setF} unit="%" seuil={customSeuils['poidsDigital']} onSeuil={v => setCustomSeuil('poidsDigital', v)} /></div>
              <NI label="Annulation web" field="tauxAnnulationWeb" form={form} setF={setF} unit="%" seuil={customSeuils['tauxAnnulationWeb']} onSeuil={v => setCustomSeuil('tauxAnnulationWeb', v)} />
              <NI label="Taux SAV" field="tauxSAV" form={form} setF={setF} unit="%" seuil={customSeuils['tauxSAV']} onSeuil={v => setCustomSeuil('tauxSAV', v)} />
            </Section>

            {/* Gamme */}
            <Section title="🎯 Gamme">
              <div className={hl('gammeTel')}><NI label="% Téléphonie" field="gammeTel" form={form} setF={setF} unit="%" seuil={customSeuils['gammeTel']} onSeuil={v => setCustomSeuil('gammeTel', v)} /></div>
              <NI label="% Jeux Vidéo" field="gammeJV" form={form} setF={setF} unit="%" seuil={customSeuils['gammeJV']} onSeuil={v => setCustomSeuil('gammeJV', v)} />
              <NI label="% Console" field="gammeConsole" form={form} setF={setF} unit="%" seuil={customSeuils['gammeConsole']} onSeuil={v => setCustomSeuil('gammeConsole', v)} />
              <NI label="% Tablette" field="gammeTablette" form={form} setF={setF} unit="%" seuil={customSeuils['gammeTablette']} onSeuil={v => setCustomSeuil('gammeTablette', v)} />
              <div className={hl('tauxAchatExterne')}><NI label="Achat externe" field="tauxAchatExterne" form={form} setF={setF} unit="%" seuil={customSeuils['tauxAchatExterne']} onSeuil={v => setCustomSeuil('tauxAchatExterne', v)} /></div>
              <div className={hl('tauxPiceasoft')}><NI label="Piceasoft" field="tauxPiceasoft" form={form} setF={setF} unit="%" seuil={customSeuils['tauxPiceasoft']} onSeuil={v => setCustomSeuil('tauxPiceasoft', v)} /></div>
            </Section>

            {/* RH */}
            <Section title="👥 RH">
              <div className={hl('nbEtp')}><NI label="Nb ETP" field="nbEtp" form={form} setF={setF} seuil={customSeuils['nbEtp']} onSeuil={v => setCustomSeuil('nbEtp', v)} /></div>
              <div className={hl('masseSalarialePct')}><NI label="Masse salariale" field="masseSalarialePct" form={form} setF={setF} unit="% CA" seuil={customSeuils['masseSalarialePct']} onSeuil={v => setCustomSeuil('masseSalarialePct', v)} /></div>
              <div className={hl('tauxTurnover')}><NI label="Turnover" field="tauxTurnover" form={form} setF={setF} unit="%" seuil={customSeuils['tauxTurnover']} onSeuil={v => setCustomSeuil('tauxTurnover', v)} /></div>
              <div className={hl('tauxFormation')}><NI label="Formation EasyTraining" field="tauxFormation" form={form} setF={setF} unit="%" seuil={customSeuils['tauxFormation']} onSeuil={v => setCustomSeuil('tauxFormation', v)} /></div>
            </Section>

            <button
              onClick={handleSave}
              disabled={!form.nom.trim()}
              className="w-full py-3 rounded-xl font-bold text-sm bg-green-500 text-black disabled:opacity-40 hover:bg-green-400 transition-colors"
            >
              💾 Sauvegarder
            </button>
          </div>
        </div>
      )}

      {/* Check-up 15 min modal */}
      {showCheckup && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">⏱ Check-up rapide</h2>
                <p className="text-xs text-gray-400 mt-0.5">Phase {phase} — 5 KPIs clés</p>
              </div>
              <button onClick={() => setShowCheckup(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            <div className="space-y-3">
              {(CHECKUP_FIELDS[phase] ?? CHECKUP_FIELDS['Maturité']).map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-gray-400 mb-1">{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
                  <input
                    type="number"
                    value={checkupValues[f.key] ?? ''}
                    onChange={e => setCheckupValues(v => ({ ...v, [f.key]: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>

            <button
              onClick={handleCheckup}
              className="w-full py-2.5 rounded-xl font-bold text-sm bg-green-500 text-black hover:bg-green-400 transition-colors"
            >
              Valider
            </button>

            {checkupResult && (
              <div className="space-y-3 pt-2 border-t border-gray-700">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Récap</p>
                  {(CHECKUP_FIELDS[phase] ?? CHECKUP_FIELDS['Maturité']).map(f => (
                    <div key={f.key} className="flex justify-between text-sm">
                      <span className="text-gray-400">{f.label}</span>
                      <span className="font-semibold text-white">
                        {checkupValues[f.key] !== undefined && checkupValues[f.key] !== 0
                          ? `${checkupValues[f.key]}${f.unit}`
                          : '—'}
                      </span>
                    </div>
                  ))}
                </div>

                {checkupResult.priorityKey ? (
                  <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3">
                    <p className="text-xs font-semibold text-red-300 uppercase tracking-wider mb-1">Priorité n°1 du mois</p>
                    <p className="font-bold text-white text-sm">{checkupResult.priorityLabel}</p>
                    <p className="text-xs text-gray-300 mt-1.5">👉 {checkupResult.action}</p>
                  </div>
                ) : (
                  <div className="bg-green-900/20 border border-green-700 rounded-xl px-4 py-3">
                    <p className="text-sm text-green-300">✓ Tous les KPIs semblent dans les clous — définissez vos seuils dans le Dashboard pour plus de précision.</p>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setShowCheckup(false)}
              className="w-full py-2 rounded-xl text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}
