'use client';

import { useState, useMemo, useEffect } from 'react';
import type { PAPAction } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type TrancheKey = 'centre_ville'|'0_999'|'1000_1199'|'1200_1399'|'1400_1599'|'1600_1999'|'2000_plus';
type PosteKey =
  'achats_consommables'|'achats_fournitures'|'locations_immo'|'locations_mob'|
  'locations_info'|'charges_locatives'|'entretien'|'prestations'|
  'assurances'|'honoraires'|'frais_actes'|'pub_nationale'|'pub_locale'|'transports';
type MoyennesReseau = Record<PosteKey, Record<TrancheKey, number>>;
type SortKey = 'ecart_euros'|'poste'|'ecart_pct';

interface DiagRow {
  key: PosteKey; label: string;
  montant: number; myPct: number;
  moyennePct: number; attendu: number;
  ecartEuros: number; ecartPct: number;
  status: 'rouge'|'orange'|'neutre'|'vert';
  saisied: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TRANCHES: { key: TrancheKey; label: string }[] = [
  { key: 'centre_ville', label: 'Centre-ville'    },
  { key: '0_999',        label: '0–999 k€'        },
  { key: '1000_1199',    label: '1 000–1 199 k€'  },
  { key: '1200_1399',    label: '1 200–1 399 k€'  },
  { key: '1400_1599',    label: '1 400–1 599 k€'  },
  { key: '1600_1999',    label: '1 600–1 999 k€'  },
  { key: '2000_plus',    label: '≥ 2 000 k€'      },
];

const POSTES: { key: PosteKey; label: string }[] = [
  { key: 'achats_consommables', label: 'Achats consommables (eau, électricité)'       },
  { key: 'achats_fournitures',  label: 'Achats fournitures, équipement, vêtements'    },
  { key: 'locations_immo',      label: 'Locations immobilières'                        },
  { key: 'locations_mob',       label: 'Locations mobilières'                          },
  { key: 'locations_info',      label: 'Locations Parc info'                           },
  { key: 'charges_locatives',   label: 'Charges locatives + taxes foncières'           },
  { key: 'entretien',           label: 'Entretien & maintenance'                       },
  { key: 'prestations',         label: 'Prestations services (gardiennage)'            },
  { key: 'assurances',          label: 'Assurances'                                    },
  { key: 'honoraires',          label: 'Honoraires (comptable, social, juridique)'     },
  { key: 'frais_actes',         label: "Frais d'actes"                                 },
  { key: 'pub_nationale',       label: 'Publicité cotisation nationale'                },
  { key: 'pub_locale',          label: 'Publicité locale'                              },
  { key: 'transports',          label: 'Transports sur achats/ventes'                  },
];

// Default DAF benchmark values (% du CA HT)
// Order: centre_ville / 0_999 / 1000_1199 / 1200_1399 / 1400_1599 / 1600_1999 / 2000_plus
const DEFAULT_MOYENNES: MoyennesReseau = {
  achats_consommables: { centre_ville:0.23, '0_999':0.54, '1000_1199':0.57, '1200_1399':0.56, '1400_1599':0.55, '1600_1999':0.41, '2000_plus':0.45 },
  achats_fournitures:  { centre_ville:0.37, '0_999':0.77, '1000_1199':0.87, '1200_1399':0.64, '1400_1599':0.69, '1600_1999':0.71, '2000_plus':0.59 },
  locations_immo:      { centre_ville:2.53, '0_999':6.70, '1000_1199':5.01, '1200_1399':4.00, '1400_1599':4.24, '1600_1999':3.59, '2000_plus':2.79 },
  locations_mob:       { centre_ville:0.25, '0_999':0.78, '1000_1199':0.77, '1200_1399':0.40, '1400_1599':0.42, '1600_1999':0.35, '2000_plus':0.30 },
  locations_info:      { centre_ville:0.05, '0_999':0.22, '1000_1199':0.11, '1200_1399':0.07, '1400_1599':0.08, '1600_1999':0.09, '2000_plus':0.08 },
  charges_locatives:   { centre_ville:0.35, '0_999':0.76, '1000_1199':0.97, '1200_1399':0.82, '1400_1599':0.61, '1600_1999':0.54, '2000_plus':0.46 },
  entretien:           { centre_ville:0.36, '0_999':1.09, '1000_1199':0.66, '1200_1399':0.67, '1400_1599':0.64, '1600_1999':0.54, '2000_plus':0.44 },
  prestations:         { centre_ville:0.00, '0_999':0.23, '1000_1199':0.00, '1200_1399':0.00, '1400_1599':0.04, '1600_1999':0.01, '2000_plus':0.00 },
  assurances:          { centre_ville:0.18, '0_999':0.45, '1000_1199':0.32, '1200_1399':0.22, '1400_1599':0.19, '1600_1999':0.21, '2000_plus':0.17 },
  honoraires:          { centre_ville:0.84, '0_999':1.49, '1000_1199':1.01, '1200_1399':0.91, '1400_1599':0.97, '1600_1999':0.82, '2000_plus':0.67 },
  frais_actes:         { centre_ville:0.01, '0_999':0.02, '1000_1199':0.05, '1200_1399':0.00, '1400_1599':0.01, '1600_1999':0.00, '2000_plus':0.01 },
  pub_nationale:       { centre_ville:1.11, '0_999':1.10, '1000_1199':1.11, '1200_1399':1.09, '1400_1599':1.15, '1600_1999':1.08, '2000_plus':1.08 },
  pub_locale:          { centre_ville:0.32, '0_999':0.46, '1000_1199':0.30, '1200_1399':0.41, '1400_1599':0.22, '1600_1999':0.33, '2000_plus':0.17 },
  transports:          { centre_ville:0.52, '0_999':0.57, '1000_1199':0.56, '1200_1399':0.37, '1400_1599':0.41, '1600_1999':0.53, '2000_plus':0.55 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string { return Math.round(n).toLocaleString('fr-FR'); }
function fmtPct(n: number, d = 2): string { return n.toFixed(d).replace('.', ',') + ' %'; }
function fmtEcartPct(n: number): string { return (n >= 0 ? '+' : '') + n.toFixed(0).replace('.', ',') + ' %'; }

function detectTranche(caHT: number, centreVille: boolean): TrancheKey {
  if (centreVille) return 'centre_ville';
  if (caHT < 1_000_000) return '0_999';
  if (caHT < 1_200_000) return '1000_1199';
  if (caHT < 1_400_000) return '1200_1399';
  if (caHT < 1_600_000) return '1400_1599';
  if (caHT < 2_000_000) return '1600_1999';
  return '2000_plus';
}

function getTrancheLabel(key: TrancheKey): string {
  return TRANCHES.find(t => t.key === key)?.label ?? key;
}

function statusBadge(s: DiagRow['status']): string {
  if (s === 'rouge')  return '🔴';
  if (s === 'orange') return '🟠';
  if (s === 'vert')   return '🟢';
  return '⚪';
}

function statusColor(s: DiagRow['status']): string {
  if (s === 'rouge')  return 'text-red-700 font-bold';
  if (s === 'orange') return 'text-orange-600 font-semibold';
  if (s === 'vert')   return 'text-green-700 font-semibold';
  return 'text-[#6B7280]';
}

function emptyCharges(): Record<PosteKey, string> {
  const o: Partial<Record<PosteKey, string>> = {};
  POSTES.forEach(p => { o[p.key] = ''; });
  return o as Record<PosteKey, string>;
}

// ── AI context export ─────────────────────────────────────────────────────────

export function getBenchmarkContext(magasinNom: string): string {
  try {
    const raw = localStorage.getItem(`benchmark_franchise_${magasinNom}`);
    if (!raw) return '';
    const d = JSON.parse(raw) as { ca_ht?: number; centre_ville?: boolean; charges?: Record<string, number> };
    if (!d.ca_ht) return '';
    const charges = d.charges ?? {};
    const filledCount = Object.values(charges).filter(v => v > 0).length;
    if (filledCount < 5) return '';

    const moyennesRaw = localStorage.getItem('benchmark_moyennes_reseau');
    const moyennes: MoyennesReseau = moyennesRaw ? { ...DEFAULT_MOYENNES, ...(JSON.parse(moyennesRaw) as Partial<MoyennesReseau>) } : DEFAULT_MOYENNES;

    const tranche = detectTranche(d.ca_ht, !!d.centre_ville);
    const rows = POSTES.map(p => {
      const montant = charges[p.key] ?? 0;
      const moyennePct = moyennes[p.key][tranche];
      const attendu = moyennePct / 100 * d.ca_ht!;
      const ecartEuros = montant - attendu;
      const ecartPct = attendu > 0 ? ((montant - attendu) / attendu * 100) : 0;
      return { label: p.label, ecartEuros, ecartPct };
    }).filter(r => r.ecartEuros > 0).sort((a, b) => b.ecartEuros - a.ecartEuros);

    const top3 = rows.slice(0, 3);
    const potentiel = top3.reduce((s, r) => s + r.ecartEuros, 0);

    let ctx = `\nBenchmark financier :`;
    ctx += `\nCA HT : ${fmt(d.ca_ht)} €`;
    ctx += `\nTranche de référence : ${getTrancheLabel(tranche)}`;
    if (top3.length > 0) {
      ctx += `\n3 plus gros écarts défavorables : `;
      ctx += top3.map(r => `${r.label} +${fmt(r.ecartEuros)} € (${fmtEcartPct(r.ecartPct)})`).join(', ');
      ctx += `\nPotentiel total d'optimisation identifié : ${fmt(potentiel)} €`;
    }
    return ctx;
  } catch { return ''; }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { magasinNom: string; onAddAction?: (action: PAPAction) => void; }

export default function BenchmarkFinancier({ magasinNom, onAddAction }: Props) {
  const [moyennes, setMoyennes]               = useState<MoyennesReseau>(DEFAULT_MOYENNES);
  const [showSection1, setShowSection1]       = useState(false);
  const [caHTStr, setCaHTStr]                 = useState('');
  const [centreVille, setCentreVille]         = useState(false);
  const [charges, setCharges]                 = useState<Record<PosteKey, string>>(emptyCharges);
  const [sortBy, setSortBy]                   = useState<SortKey>('ecart_euros');
  const [papAdded, setPapAdded]               = useState<Set<PosteKey>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [mounted, setMounted]                 = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const mRaw = localStorage.getItem('benchmark_moyennes_reseau');
      if (mRaw) setMoyennes({ ...DEFAULT_MOYENNES, ...(JSON.parse(mRaw) as Partial<MoyennesReseau>) });
    } catch { /* ignore */ }
    try {
      const fRaw = localStorage.getItem(`benchmark_franchise_${magasinNom}`);
      if (fRaw) {
        const d = JSON.parse(fRaw) as { ca_ht?: number; centre_ville?: boolean; charges?: Record<string, number> };
        if (d.ca_ht)            setCaHTStr(String(d.ca_ht));
        if (d.centre_ville)     setCentreVille(!!d.centre_ville);
        if (d.charges) {
          const filled = emptyCharges();
          POSTES.forEach(p => {
            if (p.key in d.charges! && d.charges![p.key] > 0) filled[p.key] = String(d.charges![p.key]);
          });
          setCharges(filled);
        }
      }
    } catch { /* ignore */ }
    setMounted(true);
  }, [magasinNom]);

  // Save franchise data whenever it changes
  useEffect(() => {
    if (!mounted) return;
    const ca = parseFloat(caHTStr) || 0;
    const chargesNum: Record<string, number> = {};
    POSTES.forEach(p => { chargesNum[p.key] = parseFloat(charges[p.key]) || 0; });
    localStorage.setItem(`benchmark_franchise_${magasinNom}`, JSON.stringify({ ca_ht: ca, centre_ville: centreVille, charges: chargesNum }));
  }, [mounted, magasinNom, caHTStr, centreVille, charges]);

  // Save moyennes whenever they change
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('benchmark_moyennes_reseau', JSON.stringify(moyennes));
  }, [mounted, moyennes]);

  const caHT = parseFloat(caHTStr) || 0;
  const trancheKey = useMemo(() => detectTranche(caHT, centreVille), [caHT, centreVille]);
  const trancheLabel = getTrancheLabel(trancheKey);

  const diagnostic = useMemo((): DiagRow[] => {
    if (!caHT) return [];
    return POSTES.map(p => {
      const montant = parseFloat(charges[p.key]) || 0;
      const myPct = caHT > 0 ? (montant / caHT * 100) : 0;
      const moyennePct = moyennes[p.key][trancheKey];
      const attendu = moyennePct / 100 * caHT;
      const ecartEuros = montant - attendu;
      const ecartPct = attendu > 0 ? ((montant - attendu) / attendu * 100) : 0;
      let status: DiagRow['status'];
      if      (ecartPct >  25) status = 'rouge';
      else if (ecartPct >  10) status = 'orange';
      else if (ecartPct < -10) status = 'vert';
      else                     status = 'neutre';
      const saisied = charges[p.key] !== '' && !isNaN(parseFloat(charges[p.key]));
      return { key: p.key, label: p.label, montant, myPct, moyennePct, attendu, ecartEuros, ecartPct, status, saisied };
    });
  }, [caHT, charges, moyennes, trancheKey]);

  const nbSaisied = useMemo(() => diagnostic.filter(r => r.saisied).length, [diagnostic]);

  const sortedDiag = useMemo(() => {
    const d = [...diagnostic];
    if      (sortBy === 'ecart_euros') d.sort((a, b) => b.ecartEuros - a.ecartEuros);
    else if (sortBy === 'ecart_pct')   d.sort((a, b) => b.ecartPct   - a.ecartPct);
    else                               d.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    return d;
  }, [diagnostic, sortBy]);

  const priorities = useMemo(() =>
    diagnostic.filter(r => r.saisied && r.ecartEuros > 0).sort((a, b) => b.ecartEuros - a.ecartEuros).slice(0, 3),
    [diagnostic]);

  const potentielTotal = useMemo(() => priorities.reduce((s, r) => s + r.ecartEuros, 0), [priorities]);

  function updateMoyenne(poste: PosteKey, tranche: TrancheKey, val: string) {
    const n = parseFloat(val.replace(',', '.')) || 0;
    setMoyennes(prev => ({ ...prev, [poste]: { ...prev[poste], [tranche]: n } }));
  }

  function resetMoyennes() { setMoyennes(DEFAULT_MOYENNES); }

  function addToPAP(row: DiagRow) {
    if (!onAddAction) return;
    const today = new Date();
    const echeance = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate())
      .toISOString().split('T')[0];
    const action: PAPAction = {
      id: String(Date.now()),
      titre: `Optimiser ${row.label}`,
      axe: 'Transverse',
      pilote: '',
      copilote: '',
      description: `Écart actuel de ${fmt(row.ecartEuros)} € vs moyenne réseau de ma tranche (${fmtPct(row.myPct)} vs ${fmtPct(row.moyennePct)}). Potentiel d'économie identifié.`,
      echeance,
      priorite: 1,
      gain: Math.round(row.ecartEuros),
      statut: 'À faire',
    };
    onAddAction(action);
    setPapAdded(prev => new Set(prev).add(row.key));
  }

  function clearAll() {
    localStorage.removeItem('benchmark_moyennes_reseau');
    localStorage.removeItem(`benchmark_franchise_${magasinNom}`);
    setMoyennes(DEFAULT_MOYENNES);
    setCaHTStr('');
    setCentreVille(false);
    setCharges(emptyCharges());
    setPapAdded(new Set());
    setShowClearConfirm(false);
  }

  // ── Shared table styles ────────────────────────────────────────────────────
  const TH  = 'px-3 py-2 text-left text-xs font-semibold text-[#6B7280] bg-[#F9FAFB] border-b border-[#E0E0E0]';
  const THR = 'px-3 py-2 text-right text-xs font-semibold text-[#6B7280] bg-[#F9FAFB] border-b border-[#E0E0E0]';
  const TD  = 'px-3 py-2 text-xs text-[#1A1A1A] border-b border-[#F0F0F0]';
  const TDR = 'px-3 py-2 text-xs text-right text-[#1A1A1A] border-b border-[#F0F0F0]';

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-[#1A1A1A]">📊 Benchmark financier</h2>
        <p className="text-sm text-[#6B7280] mt-0.5">Positionnez vos charges vs les moyennes réseau de votre tranche de CA.</p>
      </div>

      {/* Confidentialité bandeau */}
      <div className="flex items-center gap-2 bg-[#F3F4F6] border border-[#E0E0E0] rounded-xl px-4 py-3">
        <span className="text-base">🔒</span>
        <p className="text-xs text-[#6B7280]">
          Toutes vos données financières restent stockées uniquement sur votre appareil. Aucune transmission externe. Vous choisissez si et quand les partager avec votre animateur.
        </p>
      </div>

      {/* ── SECTION 1 : Configuration moyennes réseau ── */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-4 text-left"
          onClick={() => setShowSection1(v => !v)}
        >
          <div>
            <h3 className="text-sm font-bold text-[#1A1A1A]">⚙️ Configuration — Moyennes réseau par tranche de CA</h3>
            <p className="text-xs text-[#6B7280] mt-0.5">À saisir une seule fois à partir du document DAF Easycash. Modifiable à tout moment.</p>
          </div>
          <span className="text-[#6B7280] text-sm ml-4">{showSection1 ? '▲' : '▼'}</span>
        </button>

        {showSection1 && (
          <div className="px-5 pb-5 space-y-3">
            <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
              <table className="text-xs w-full border-collapse min-w-[900px]">
                <thead>
                  <tr>
                    <th className={`${TH} min-w-[220px]`}>Poste de charge</th>
                    {TRANCHES.map(t => (
                      <th key={t.key} className={`${THR} whitespace-nowrap`}>{t.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {POSTES.map((p, i) => (
                    <tr key={p.key} className={i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}>
                      <td className={TD}>{p.label}</td>
                      {TRANCHES.map(t => (
                        <td key={t.key} className="px-2 py-1 border-b border-[#F0F0F0]">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={moyennes[p.key][t.key]}
                            onChange={e => updateMoyenne(p.key, t.key, e.target.value)}
                            className="w-16 text-xs text-right border border-[#E0E0E0] rounded px-1 py-0.5 focus:outline-none focus:border-[#E30613]"
                          />
                          <span className="text-[#9CA3AF] ml-0.5">%</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={resetMoyennes}
              className="text-xs text-[#6B7280] hover:text-[#E30613] border border-[#E0E0E0] rounded-lg px-3 py-1.5 transition-colors"
            >
              ↩ Réinitialiser aux valeurs DAF par défaut
            </button>
          </div>
        )}
      </div>

      {/* ── SECTION 2 : Saisie franchisé ── */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-5 space-y-5">
        <div>
          <h3 className="text-sm font-bold text-[#1A1A1A]">💼 Mes données financières</h3>
          <p className="text-xs text-[#6B7280] mt-0.5">Saisissez votre CA HT annuel et le montant de chaque poste de charge. Les données restent stockées uniquement sur votre appareil.</p>
        </div>

        {/* CA HT + centre-ville */}
        <div className="flex flex-wrap items-end gap-5">
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1">CA HT annuel (€)</label>
            <input
              type="number"
              min="0"
              placeholder="ex : 1505000"
              value={caHTStr}
              onChange={e => setCaHTStr(e.target.value)}
              className="border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:border-[#E30613]"
            />
            {caHT > 0 && (
              <p className="text-xs text-[#6B7280] mt-1">
                Votre tranche de référence : <span className="font-semibold text-[#E30613]">{trancheLabel}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 pb-0.5">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={centreVille}
                onChange={e => setCentreVille(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-[#E0E0E0] peer-checked:bg-[#E30613] rounded-full transition-colors"></div>
              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
            </label>
            <span className="text-xs text-[#374151]">Mon magasin est en centre-ville</span>
          </div>
        </div>
        {centreVille && (
          <p className="text-xs text-[#6B7280] -mt-2 italic">
            Coché : vos ratios de charges sont comparés aux moyennes Centre-ville, qui diffèrent fortement des magasins de zone commerciale.
          </p>
        )}

        {/* Charges table */}
        <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr>
                <th className={`${TH} min-w-[240px]`}>Poste de charge</th>
                <th className={THR}>Montant (€)</th>
                <th className={THR}>% du CA HT</th>
                {caHT > 0 && <th className={THR}>Moy. tranche ({trancheLabel})</th>}
              </tr>
            </thead>
            <tbody>
              {POSTES.map((p, i) => {
                const val = parseFloat(charges[p.key]) || 0;
                const pct = caHT > 0 ? (val / caHT * 100) : 0;
                const moy = moyennes[p.key][trancheKey];
                return (
                  <tr key={p.key} className={i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}>
                    <td className={TD}>{p.label}</td>
                    <td className="px-2 py-1 border-b border-[#F0F0F0]">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={charges[p.key]}
                        onChange={e => setCharges(prev => ({ ...prev, [p.key]: e.target.value }))}
                        className="w-28 text-xs text-right border border-[#E0E0E0] rounded px-2 py-0.5 focus:outline-none focus:border-[#E30613]"
                      />
                      <span className="text-[#9CA3AF] ml-1">€</span>
                    </td>
                    <td className={TDR}>
                      {charges[p.key] && caHT > 0 ? fmtPct(pct) : <span className="text-[#D1D5DB]">—</span>}
                    </td>
                    {caHT > 0 && (
                      <td className={TDR + ' text-[#6B7280]'}>{fmtPct(moy)}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SECTION 3 : Diagnostic comparatif ── */}
      {caHT > 0 && (
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#1A1A1A]">🎯 Mon positionnement vs ma tranche</h3>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Comparaison automatique avec les moyennes de votre tranche ({trancheLabel})
            </p>
          </div>

          {nbSaisied < 14 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              <span className="text-sm">⚠️</span>
              <p className="text-xs text-amber-800">
                Vous n&apos;avez saisi que <span className="font-semibold">{nbSaisied}</span> poste{nbSaisied > 1 ? 's' : ''} sur 14. Le diagnostic sera partiel.
              </p>
            </div>
          )}

          {/* Sort controls */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6B7280]">Trier par :</span>
            {([['ecart_euros','Écart en €'],['ecart_pct','Écart en %'],['poste','Poste']] as [SortKey, string][]).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setSortBy(k)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${sortBy === k ? 'bg-[#E30613] text-white border-[#E30613]' : 'border-[#E0E0E0] text-[#6B7280] hover:border-[#E30613] hover:text-[#E30613]'}`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${TH} min-w-[220px]`}>Poste</th>
                  <th className={THR}>Mon montant (€)</th>
                  <th className={THR}>Mon % du CA</th>
                  <th className={THR}>Moy. tranche (%)</th>
                  <th className={THR}>Montant attendu (€)</th>
                  <th className={THR}>Écart (€)</th>
                  <th className={THR}>Écart (%)</th>
                  <th className={THR}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {sortedDiag.map((r, i) => (
                  <tr key={r.key} className={i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}>
                    <td className={`${TD} ${!r.saisied ? 'text-[#9CA3AF] italic' : ''}`}>{r.label}</td>
                    <td className={TDR}>
                      {r.saisied ? `${fmt(r.montant)} €` : <span className="text-[#D1D5DB]">—</span>}
                    </td>
                    <td className={TDR}>
                      {r.saisied ? fmtPct(r.myPct) : <span className="text-[#D1D5DB]">—</span>}
                    </td>
                    <td className={TDR}>{fmtPct(r.moyennePct)}</td>
                    <td className={TDR}>{fmt(r.attendu)} €</td>
                    <td className={`${TDR} ${r.saisied ? (r.ecartEuros > 0 ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold') : 'text-[#D1D5DB]'}`}>
                      {r.saisied ? `${r.ecartEuros >= 0 ? '+' : ''}${fmt(r.ecartEuros)} €` : '—'}
                    </td>
                    <td className={`${TDR} ${r.saisied ? statusColor(r.status) : 'text-[#D1D5DB]'}`}>
                      {r.saisied ? fmtEcartPct(r.ecartPct) : '—'}
                    </td>
                    <td className={TDR}>
                      {r.saisied ? statusBadge(r.status) : <span className="text-[#D1D5DB]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-[#6B7280]">
            <span>🔴 &gt;+25% vs moy.</span>
            <span>🟠 +10% à +25%</span>
            <span>⚪ ±10%</span>
            <span>🟢 &lt;−10% (bien géré)</span>
          </div>
        </div>
      )}

      {/* ── SECTION 4 : Synthèse priorités ── */}
      {caHT > 0 && nbSaisied >= 3 && (
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#1A1A1A]">🚨 Mes 3 priorités d&apos;optimisation</h3>
            <p className="text-xs text-[#6B7280] mt-0.5">Postes où l&apos;écart avec votre tranche représente le plus de potentiel d&apos;économie</p>
          </div>

          {priorities.length === 0 ? (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <span className="text-xl">🎉</span>
              <p className="text-sm text-green-800 font-medium">Toutes vos charges sont sous la moyenne de votre tranche. Excellente maîtrise.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-[#1A1A1A]">
                  Vos {priorities.length} priorité{priorities.length > 1 ? 's' : ''} d&apos;optimisation pour rejoindre la moyenne de votre tranche :
                </p>
                {priorities.map((r, idx) => (
                  <div key={r.key} className="flex items-center justify-between gap-3">
                    <p className="text-sm text-[#374151]">
                      <span className="font-bold text-[#E30613]">{idx + 1}.</span>{' '}
                      <span className="font-semibold">{r.label}</span>
                      <span className="text-[#6B7280]"> : −{fmt(r.ecartEuros)} € possibles</span>
                    </p>
                    {onAddAction && (
                      papAdded.has(r.key) ? (
                        <span className="text-xs text-green-700 font-semibold bg-green-50 border border-green-200 rounded-full px-3 py-1 whitespace-nowrap">✓ Ajouté au PAP</span>
                      ) : (
                        <button
                          onClick={() => addToPAP(r)}
                          className="text-xs text-white bg-[#E30613] hover:bg-red-700 rounded-full px-3 py-1 whitespace-nowrap transition-colors"
                        >
                          + Ajouter au PAP
                        </button>
                      )
                    )}
                  </div>
                ))}
                <div className="pt-2 border-t border-red-100">
                  <p className="text-sm font-bold text-[#E30613]">
                    Potentiel total identifié : {fmt(potentielTotal)} € de marge récupérable
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Clear data ── */}
      <div className="flex justify-end pt-2">
        {showClearConfirm ? (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <span className="text-xs text-red-700 font-medium">Supprimer toutes les données benchmark ?</span>
            <button onClick={clearAll} className="text-xs font-bold text-white bg-[#E30613] hover:bg-red-700 rounded-lg px-3 py-1.5 transition-colors">Confirmer</button>
            <button onClick={() => setShowClearConfirm(false)} className="text-xs text-[#6B7280] hover:text-[#1A1A1A] border border-[#E0E0E0] rounded-lg px-3 py-1.5 transition-colors">Annuler</button>
          </div>
        ) : (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="text-xs text-[#9CA3AF] hover:text-red-500 border border-[#E0E0E0] rounded-lg px-3 py-1.5 transition-colors"
          >
            🗑️ Effacer toutes mes données benchmark
          </button>
        )}
      </div>
    </div>
  );
}
