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

interface PratiquesState {
  decouverteBesoins: boolean; accessoires: boolean; avisGoogle: boolean; estalyPratique: boolean; caissePics: boolean;
  testProduit: boolean; vpdAppliquee: boolean; negociationRachat: boolean; piceasoft: boolean; deuxAcheteurs: boolean;
  briefingQuotidien: boolean; entretiensMenusuels: boolean; easyTraining: boolean; polyvalence: boolean; coachingVente: boolean;
  top20Hebdo: boolean; accelerationsAnticipees: boolean; inventairesTournants: boolean; rebutsDestock: boolean; rattachementF3: boolean;
  dashboardWeb: boolean; expeditions48h: boolean; moduleAcceleration: boolean;
}
const DEFAULT_PRATIQUES: PratiquesState = {
  decouverteBesoins: false, accessoires: false, avisGoogle: false, estalyPratique: false, caissePics: false,
  testProduit: false, vpdAppliquee: false, negociationRachat: false, piceasoft: false, deuxAcheteurs: false,
  briefingQuotidien: false, entretiensMenusuels: false, easyTraining: false, polyvalence: false, coachingVente: false,
  top20Hebdo: false, accelerationsAnticipees: false, inventairesTournants: false, rebutsDestock: false, rattachementF3: false,
  dashboardWeb: false, expeditions48h: false, moduleAcceleration: false,
};
const PRATIQUES_BLOCS: Array<{ icon: string; title: string; items: Array<{ key: keyof PratiquesState; label: string }> }> = [
  { icon: '🛒', title: 'BLOC 1 — Prise en charge client', items: [
    { key: 'decouverteBesoins', label: 'Découverte des besoins systématique' },
    { key: 'accessoires', label: "Proposition d'accessoires à chaque vente" },
    { key: 'avisGoogle', label: 'Relance avis Google en caisse' },
    { key: 'estalyPratique', label: 'Proposition Estaly systématique' },
    { key: 'caissePics', label: "Organisation caisse adaptée aux pics d'affluence" },
  ]},
  { icon: '🤝', title: 'BLOC 2 — Achat au comptoir', items: [
    { key: 'testProduit', label: 'Test produit approfondi avant rachat' },
    { key: 'vpdAppliquee', label: 'VPD appliquée — les 5 questions' },
    { key: 'negociationRachat', label: 'Négociation au rachat systématique' },
    { key: 'piceasoft', label: 'Piceasoft utilisé sur tous les mobiles' },
    { key: 'deuxAcheteurs', label: 'Au moins 2 acheteurs polyvalents' },
  ]},
  { icon: '👥', title: 'BLOC 3 — Management & équipe', items: [
    { key: 'briefingQuotidien', label: 'Briefing quotidien tenu' },
    { key: 'entretiensMenusuels', label: 'Entretiens individuels mensuels' },
    { key: 'easyTraining', label: "Plan EasyTraining suivi par toute l'équipe" },
    { key: 'polyvalence', label: 'Polyvalence : aucun vendeur seul sur 2 rayons majeurs' },
    { key: 'coachingVente', label: 'Coaching vente en magasin régulier' },
  ]},
  { icon: '📦', title: 'BLOC 4 — Pilotage stock', items: [
    { key: 'top20Hebdo', label: 'Top 20 vieux stock traité chaque semaine' },
    { key: 'accelerationsAnticipees', label: "Accélérations anticipées (sans attendre l'alerte)" },
    { key: 'inventairesTournants', label: 'Inventaires tournants à fréquence préconisée' },
    { key: 'rebutsDestock', label: 'Rebuts destockés via module Démarque' },
    { key: 'rattachementF3', label: 'Produits techniques rattachés via F3' },
  ]},
  { icon: '🌐', title: 'BLOC 5 — Digital & web', items: [
    { key: 'dashboardWeb', label: 'Dashboard web consulté quotidiennement' },
    { key: 'expeditions48h', label: 'Commandes expédiées en moins de 48h' },
    { key: 'moduleAcceleration', label: 'Module Accélération web utilisé' },
  ]},
];

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

// ── KPI row : label | valeur | seuil sur une ligne ─────────────────────────
function KpiRow({ label, field, form, setF, unit, placeholder, seuil, onSeuil }: {
  label: string; field: keyof MagasinData;
  form: MagasinData; setF: (k: keyof MagasinData, v: number) => void;
  unit?: string; placeholder?: string;
  seuil?: number; onSeuil?: (v: number) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 border-b border-[#F0F0F0] last:border-0">
      <span className="flex-1 text-sm text-[#1A1A1A] font-medium">
        {label}
        {unit && <span className="text-[#9CA3AF] ml-1 text-xs font-normal">({unit})</span>}
      </span>
      <input
        type="number"
        className="w-full sm:w-32 bg-white border border-[#E0E0E0] rounded-lg px-2 py-2 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#E30613]"
        value={(form[field] as number) || ''}
        onChange={e => setF(field, parseFloat(e.target.value) || 0)}
        placeholder={placeholder ?? '0'}
      />
      {onSeuil !== undefined && (
        <input
          type="number"
          className="w-full sm:w-28 bg-amber-50 border border-amber-300 rounded-lg px-2 py-2 text-amber-700 text-xs focus:outline-none focus:border-amber-400"
          value={seuil ?? ''}
          onChange={e => { const v = parseFloat(e.target.value); onSeuil(isNaN(v) ? 0 : v); }}
          placeholder="Mon seuil…"
        />
      )}
    </div>
  );
}

// ── Toggle row ─────────────────────────────────────────────────────────────
function ToggleRow({ label, value, onChange, hint }: {
  label: string; value: boolean; onChange: (v: boolean) => void; hint?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[#F0F0F0] last:border-0">
      <span className="flex-1 text-sm text-[#1A1A1A] font-medium">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-green-500' : 'bg-[#D1D5DB]'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
      {hint && <span className="text-[10px] text-[#6B7280] italic max-w-[120px] leading-snug">{hint}</span>}
    </div>
  );
}

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
  const [pratiques, setPratiques] = useState<PratiquesState>(DEFAULT_PRATIQUES);
  const [openBloc, setOpenBloc] = useState<number | null>(0);
  const [vahHeures, setVahHeures] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try { return parseFloat(localStorage.getItem(`vah_heures_${data.nom}`) ?? '0') || 0; }
    catch { return 0; }
  });

  useEffect(() => { setForm({ ...DEFAULT_DATA, ...data }); }, [data]);

  useEffect(() => {
    try { const s = localStorage.getItem(`seuils_${data.nom}`); setCustomSeuils(s ? JSON.parse(s) as Record<string, number> : { ...SEUIL_DEFAULTS }); }
    catch { setCustomSeuils({ ...SEUIL_DEFAULTS }); }
    try {
      const p = localStorage.getItem(`pratiques_${data.nom}`);
      setPratiques(p ? { ...DEFAULT_PRATIQUES, ...JSON.parse(p) as Partial<PratiquesState> } : DEFAULT_PRATIQUES);
    } catch { setPratiques(DEFAULT_PRATIQUES); }
    try {
      const h = localStorage.getItem(`vah_heures_${data.nom}`);
      setVahHeures(h ? parseFloat(h) || 0 : 0);
    } catch { setVahHeures(0); }
  }, [data.nom]);

  function setF(k: keyof MagasinData, v: number) { setForm(f => ({ ...f, [k]: v })); }

  function setCustomSeuil(key: string, v: number) {
    setCustomSeuils(prev => {
      const next = { ...prev };
      if (v === 0) delete next[key]; else next[key] = v;
      return next;
    });
  }

  function togglePratique(key: keyof PratiquesState) {
    const next = { ...pratiques, [key]: !pratiques[key] };
    setPratiques(next);
    if (data.nom) localStorage.setItem(`pratiques_${data.nom}`, JSON.stringify(next));
  }

  function updateVahHeures(h: number) {
    setVahHeures(h);
    if (form.nom) localStorage.setItem(`vah_heures_${form.nom}`, String(h));
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
    if (form.nom) localStorage.setItem(`pratiques_${form.nom}`, JSON.stringify(pratiques));
    if (form.nom) {
      const vahResult = vahHeures > 0 && form.caAnnuel > 0 && form.tauxMargeNette > 0
        ? (form.caAnnuel * form.tauxMargeNette / 100) / vahHeures : 0;
      localStorage.setItem(`vah_ca_${form.nom}`, String(form.caAnnuel));
      localStorage.setItem(`vah_marge_${form.nom}`, String(form.tauxMargeNette));
      localStorage.setItem(`vah_heures_${form.nom}`, String(vahHeures));
      localStorage.setItem(`vah_resultat_${form.nom}`, String(vahResult));
    }
    setShowModal(false);
    setHighlightedFields(new Set());
    setPasteCount(0);
    setImportMsg('');
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

  const KPI_DIR_DASH: Record<string, 'higher' | 'lower'> = {
    tauxMargeNette: 'higher', noteGoogle: 'higher', estalyParSemaine: 'higher',
    tauxTransformation: 'higher', poidsDigital: 'higher', tauxAchatExterne: 'lower',
    stockAge: 'lower', tauxDemarque: 'lower',
  };
  const KPI_ACTION_DASH: Record<string, string> = {
    stockAge: 'Traitez votre TOP 20 valeur cette semaine',
    noteGoogle: 'Relance avis systématique en caisse',
    estalyParSemaine: 'Concours équipe + prime 5€/contrat',
    tauxMargeNette: 'Vérifier mix rayon',
    poidsDigital: 'Push EC.fr et marketplaces',
    tauxDemarque: 'Audit démarque urgent — procédure et inventaire',
    tauxTransformation: 'Brief argumentation — méthode VPD',
    tauxAchatExterne: 'Réduire les achats externes — renforcer la collecte',
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
        topGain = Math.round(data.stockTotal * Math.max(dev, 0) * 1.5 * 0.25);
      } else if (data.caAnnuel) {
        topGain = Math.round(data.caAnnuel * Math.max(dev, 0) * 0.03);
      }
    }
  });

  const hl = (k: string) => highlightedFields.has(k) ? 'ring-2 ring-[#E30613] rounded-lg' : '';

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

      {!data.nom && !showModal && (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">🏪</div>
          <p className="text-[#6B7280]">Configurez votre magasin pour commencer.</p>
          <button onClick={() => setShowModal(true)} className="mt-4 px-5 py-2.5 rounded-xl font-bold text-sm uppercase tracking-wide bg-[#E30613] text-white hover:bg-[#B8050F]">
            Saisir mes données
          </button>
        </div>
      )}

      {data.nom && (
        <>
          {/* Priorité */}
          {topKey && topDev > 0 ? (
            <div className="bg-[#E30613] rounded-xl p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-widest text-white/80 mb-2">Votre priorité cette semaine</p>
              <h2 className="text-xl font-black leading-tight">{topAction}</h2>
              <p className="text-sm text-white/80 mt-1">{topLabel} — écart {Math.round(topDev * 100)}% vs seuil</p>
              {topGain > 0 && <p className="text-3xl font-black mt-3">+{topGain.toLocaleString('fr-FR')} €</p>}
              <button onClick={() => onNavigate('plan')} className="mt-4 px-4 py-2 bg-white text-[#E30613] font-bold text-sm rounded-md uppercase tracking-wide hover:bg-white/90 transition-colors">
                Ajouter au plan d&apos;action
              </button>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-300 rounded-xl p-4 text-center">
              <p className="text-green-700 font-semibold text-sm">✓ Tous vos KPIs sont dans les seuils — continuez comme ça !</p>
              {!topKey && <p className="text-xs text-[#6B7280] mt-1">Saisissez vos données et vos seuils dans le formulaire pour obtenir des recommandations.</p>}
            </div>
          )}

          {/* 3 KPI cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'stockAge',      label: 'Stock âgé',   unit: '%',  dir: 'lower'  as const, defaultSeuil: 30 },
              { key: 'tauxMargeNette', label: 'Marge nette', unit: '%',  dir: 'higher' as const, defaultSeuil: 38 },
              { key: 'noteGoogle',    label: 'Note Google',  unit: '/5', dir: 'higher' as const, defaultSeuil: 4.4 },
            ].map(kpi => {
              const val = data[kpi.key as keyof MagasinData] as number;
              const seuil = customSeuils[kpi.key] || kpi.defaultSeuil;
              const hasData = val > 0;
              const isOk  = hasData && (kpi.dir === 'higher' ? val >= seuil : val <= seuil);
              const isBad = hasData && (kpi.dir === 'higher' ? val < seuil * 0.85 : val > seuil * 1.2);
              return (
                <div key={kpi.key} className={`bg-white rounded-xl p-3 text-center border-l-4 shadow-sm ${
                  !hasData ? 'border-[#E0E0E0]' : isOk ? 'border-green-500' : isBad ? 'border-[#E30613]' : 'border-orange-400'
                }`}>
                  <div className={`text-2xl font-black ${
                    !hasData ? 'text-[#6B7280]' : isOk ? 'text-green-600' : isBad ? 'text-[#E30613]' : 'text-orange-500'
                  }`}>
                    {hasData ? `${val}${kpi.unit}` : '—'}
                  </div>
                  <div className="text-xs text-[#1A1A1A] font-medium mt-0.5">{kpi.label}</div>
                  <div className="text-xs text-[#6B7280]">seuil {seuil}{kpi.unit}</div>
                </div>
              );
            })}
          </div>

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
                      { icon: '💰', label: "Je ne gagne pas assez d'argent", tab: 'diagnostic' },
                      { icon: '📉', label: 'Mes ventes baissent', tab: 'diagnostic' },
                      { icon: '📦', label: 'Mon stock me pose problème', tab: 'diagnostic' },
                      { icon: '👥', label: 'Mon équipe ne performe pas', tab: 'diagnostic' },
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
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center pt-4 pb-8">
          <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 shadow-xl">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#E0E0E0]">
              <div>
                <h2 className="text-lg font-bold text-[#1A1A1A]">Données du magasin</h2>
                <p className="text-[10px] text-amber-600 mt-0.5">Champ doré = votre seuil cible personnalisé</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-[#6B7280] hover:text-[#1A1A1A] text-xl leading-none">✕</button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Import rapide */}
              <div className="flex gap-2 flex-wrap">
                <label className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F5F5F5] border border-[#E0E0E0] text-[#1A1A1A] hover:bg-[#EBEBEB] transition-colors">
                  📂 Importer Excel/CSV
                  <input type="file" accept=".xlsx,.csv" className="hidden" onChange={e => e.target.files?.[0] && handleExcel(e.target.files[0])} />
                </label>
                <button onClick={() => setPasteMode(!pasteMode)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F5F5F5] border border-[#E0E0E0] text-[#1A1A1A] hover:bg-[#EBEBEB]">
                  📋 Coller mes données
                </button>
                {importMsg && <span className="text-xs text-green-600 self-center">{importMsg}</span>}
                {pasteCount > 0 && !importMsg && <span className="text-xs text-green-600 self-center">✓ {pasteCount} valeur(s) détectée(s)</span>}
              </div>

              {pasteMode && (
                <div className="space-y-2">
                  <textarea
                    className="w-full bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-[#1A1A1A] text-sm focus:outline-none resize-none"
                    rows={4}
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    placeholder="Collez vos données ici (ex: marge 38%, stock âgé 25%...)"
                  />
                  <button onClick={handlePaste} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E30613] text-white hover:bg-[#B8050F]">
                    Détecter les valeurs
                  </button>
                </div>
              )}

              {/* Général */}
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

              {/* Section 1 — Indicateurs essentiels */}
              <FormSection title="📊 Mes indicateurs essentiels">
                <div className={hl('caAnnuel')}>
                  <KpiRow label="CA annuel" field="caAnnuel" form={form} setF={setF} unit="€"
                    seuil={customSeuils['caAnnuel']} onSeuil={v => setCustomSeuil('caAnnuel', v)} />
                </div>
                <div className={hl('tauxMargeNette')}>
                  <KpiRow label="Taux de marge nette" field="tauxMargeNette" form={form} setF={setF} unit="%"
                    seuil={customSeuils['tauxMargeNette']} onSeuil={v => setCustomSeuil('tauxMargeNette', v)} />
                </div>
                <div className={hl('tauxDemarque')}>
                  <KpiRow label="Taux de démarque" field="tauxDemarque" form={form} setF={setF} unit="%"
                    seuil={customSeuils['tauxDemarque']} onSeuil={v => setCustomSeuil('tauxDemarque', v)} />
                </div>
                <div className={hl('stockTotal')}>
                  <KpiRow label="Stock total" field="stockTotal" form={form} setF={setF} unit="€"
                    seuil={customSeuils['stockTotal']} onSeuil={v => setCustomSeuil('stockTotal', v)} />
                </div>
                <div className={hl('stockAge')}>
                  <KpiRow label="Stock âgé" field="stockAge" form={form} setF={setF} unit="%"
                    seuil={customSeuils['stockAge']} onSeuil={v => setCustomSeuil('stockAge', v)} />
                </div>
                <ToggleRow
                  label="Top 20 vieux stock traité ?"
                  value={form.top20Traite}
                  onChange={v => setForm(f => ({ ...f, top20Traite: v }))}
                  hint="Intranet › Stats › Stocks › Ventilation"
                />
                <div className={hl('estalyParSemaine')}>
                  <KpiRow label="Estaly / mois" field="estalyParSemaine" form={form} setF={setF}
                    seuil={customSeuils['estalyParSemaine']} onSeuil={v => setCustomSeuil('estalyParSemaine', v)} />
                </div>
                <div className={hl('noteGoogle')}>
                  <KpiRow label="Note Google" field="noteGoogle" form={form} setF={setF} placeholder="4.3"
                    seuil={customSeuils['noteGoogle']} onSeuil={v => setCustomSeuil('noteGoogle', v)} />
                </div>
                <div className={hl('tauxSAV')}>
                  <KpiRow label="Taux SAV" field="tauxSAV" form={form} setF={setF} unit="%"
                    seuil={customSeuils['tauxSAV']} onSeuil={v => setCustomSeuil('tauxSAV', v)} />
                </div>
                <div className={hl('tauxTransformation')}>
                  <KpiRow label="Taux de transformation" field="tauxTransformation" form={form} setF={setF} unit="%"
                    seuil={customSeuils['tauxTransformation']} onSeuil={v => setCustomSeuil('tauxTransformation', v)} />
                </div>
                <KpiRow label="Ventes additionnelles" field="ventesAdditionnelles" form={form} setF={setF} unit="€"
                  seuil={customSeuils['ventesAdditionnelles']} onSeuil={v => setCustomSeuil('ventesAdditionnelles', v)} />
                <div className={hl('tauxAchatExterne')}>
                  <KpiRow label="Achat externe" field="tauxAchatExterne" form={form} setF={setF} unit="%"
                    seuil={customSeuils['tauxAchatExterne']} onSeuil={v => setCustomSeuil('tauxAchatExterne', v)} />
                </div>
              </FormSection>

              {/* Section Web */}
              <FormSection title="🌐 Web">
                <div className={hl('poidsDigital')}>
                  <KpiRow label="Poids digital" field="poidsDigital" form={form} setF={setF} unit="%"
                    seuil={customSeuils['poidsDigital']} onSeuil={v => setCustomSeuil('poidsDigital', v)} />
                </div>
              </FormSection>

              {/* Section VAH */}
              {(() => {
                const vahResult = vahHeures > 0 && form.caAnnuel > 0 && form.tauxMargeNette > 0
                  ? (form.caAnnuel * form.tauxMargeNette / 100) / vahHeures : 0;
                return (
                  <div className="bg-white border border-[#E0E0E0] rounded-lg shadow-sm p-6">
                    <h3 className="font-bold text-sm text-[#1A1A1A] mb-1">⏱ Ma valeur ajoutée horaire</h3>
                    <p className="text-xs text-[#6B7280] italic mb-4">
                      Cet indicateur est inspiré de la CHVACV de la méthodologie ISEOR (Savall &amp; Zardet, 1992). Il permet de chiffrer le coût caché des dysfonctionnements organisationnels.
                    </p>
                    <div className="space-y-3 mb-4">
                      <div className="flex items-center gap-3 py-2 border-b border-[#F0F0F0]">
                        <span className="flex-1 text-sm text-[#1A1A1A] font-medium">CA annuel <span className="text-[#9CA3AF] text-xs font-normal">(€)</span></span>
                        <span className="text-sm font-semibold text-[#6B7280]">
                          {form.caAnnuel > 0 ? form.caAnnuel.toLocaleString('fr-FR') + ' €' : <span className="text-[#9CA3AF] italic">non saisi</span>}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 py-2 border-b border-[#F0F0F0]">
                        <span className="flex-1 text-sm text-[#1A1A1A] font-medium">Taux de marge nette <span className="text-[#9CA3AF] text-xs font-normal">(%)</span></span>
                        <span className="text-sm font-semibold text-[#6B7280]">
                          {form.tauxMargeNette > 0 ? form.tauxMargeNette + ' %' : <span className="text-[#9CA3AF] italic">non saisi</span>}
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-2">
                        <span className="flex-1 text-sm text-[#1A1A1A] font-medium">
                          Heures travaillées/an (total équipe)
                          <span className="text-[#9CA3AF] ml-1 text-xs font-normal">(h)</span>
                        </span>
                        <input
                          type="number"
                          className="w-full sm:w-40 bg-white border border-[#E0E0E0] rounded-lg px-2 py-2 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#E30613]"
                          value={vahHeures || ''}
                          onChange={e => updateVahHeures(parseFloat(e.target.value) || 0)}
                          placeholder="Ex : 8035 (5 ETP × 1607h)"
                        />
                      </div>
                    </div>
                    {vahResult > 0 ? (
                      <div className="bg-[#FFF5F5] border border-[#E30613]/20 rounded-xl p-4">
                        <div className="text-2xl font-black text-[#E30613] mb-1">{vahResult.toFixed(1)} €/h</div>
                        <p className="text-sm text-[#1A1A1A] font-medium">
                          Votre magasin produit en moyenne <strong>{vahResult.toFixed(1)} €</strong> de valeur ajoutée par heure de travail.
                          Chaque heure perdue prive votre magasin de cette valeur.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-[#F5F5F5] rounded-xl p-3 text-xs text-[#6B7280] italic">
                        Renseignez les 3 champs pour obtenir votre valeur ajoutée horaire.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Section 2 — Pratiques magasin */}
              <div className="bg-white border border-[#E0E0E0] rounded-lg shadow-sm p-6">
                <h3 className="font-bold text-sm text-[#1A1A1A] mb-1">🎯 Mes pratiques magasin</h3>
                <p className="text-xs text-[#6B7280] italic mb-4">
                  Cochez les pratiques effectivement appliquées dans votre magasin. Chaque pratique non appliquée représente un coût caché qui sera chiffré dans le Diagnostic.
                </p>
                <div className="space-y-2">
                  {PRATIQUES_BLOCS.map((bloc, idx) => {
                    const checked = bloc.items.filter(it => pratiques[it.key]).length;
                    return (
                      <div key={idx} className="border border-[#E0E0E0] rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setOpenBloc(openBloc === idx ? null : idx)}
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#F5F5F5] transition-colors"
                        >
                          <span className="text-sm font-semibold text-[#1A1A1A]">{bloc.icon} {bloc.title}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${checked === bloc.items.length ? 'bg-green-100 text-green-700' : checked === 0 ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                              {checked}/{bloc.items.length}
                            </span>
                            <span className="text-xs text-[#9CA3AF]">{openBloc === idx ? '▲' : '▼'}</span>
                          </div>
                        </button>
                        {openBloc === idx && (
                          <div className="border-t border-[#E0E0E0] px-4 bg-[#FAFAFA]">
                            {bloc.items.map(item => (
                              <div key={item.key} className="flex items-center gap-3 py-3 border-b border-[#F0F0F0] last:border-0">
                                <span className="flex-1 text-sm text-[#1A1A1A]">{item.label}</span>
                                <button
                                  type="button"
                                  onClick={() => togglePratique(item.key)}
                                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${pratiques[item.key] ? 'bg-green-500' : 'bg-[#D1D5DB]'}`}
                                >
                                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow ${pratiques[item.key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
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

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E0E0E0] rounded-lg shadow-sm p-6">
      <h3 className="font-bold text-sm text-[#1A1A1A] mb-4">{title}</h3>
      <div>{children}</div>
    </div>
  );
}
