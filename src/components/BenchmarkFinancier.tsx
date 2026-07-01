'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { PAPAction } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type TrancheKey = 'centre_ville'|'0_999'|'1000_1199'|'1200_1399'|'1400_1599'|'1600_1999'|'2000_plus';
type PosteKey =
  'achats_consommables'|'achats_fournitures'|'locations_immo'|'locations_mob'|
  'locations_info'|'charges_locatives'|'entretien'|'prestations'|
  'assurances'|'honoraires'|'frais_actes'|'pub_nationale'|'pub_locale'|'transports';
type MoyennesReseau = Record<PosteKey, Record<TrancheKey, number>>;

type SanteKey = 'taux_marge_net'|'charges_externes'|'masse_salariale'|'ebe'|'rcai';
type SanteStatus = 'vert'|'orange'|'rouge';
interface SanteIndicateur {
  key: SanteKey;
  label: string;
  cible: string;
  evaluate(v: number): SanteStatus;
  papDesc(v: number): string;
}

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

// ── Santé financière globale — 5 indicateurs DAF 2022 ─────────────────────────

const SANTE_INDICATEURS: SanteIndicateur[] = [
  {
    key: 'taux_marge_net',
    label: 'Taux de marge net TTC',
    cible: '38–39 %',
    evaluate(v) { return v >= 38 ? 'vert' : v >= 36 ? 'orange' : 'rouge'; },
    papDesc(v) { return `Ma valeur actuelle : ${v} % vs cible DAF 38-39 %. Pistes : vérifier mix rayon, EasyPrice, gestion stock, ventes complémentaires, démarque.`; },
  },
  {
    key: 'charges_externes',
    label: 'Charges externes (loyer inclus) — % du CA HT',
    cible: '12–13 %',
    evaluate(v) { return v <= 13 ? 'vert' : v <= 14.9 ? 'orange' : 'rouge'; },
    papDesc(v) { return `Ma valeur actuelle : ${v} % vs cible DAF 12-13 %. Voir la section Détail charges externes ci-dessous pour identifier les postes en écart.`; },
  },
  {
    key: 'masse_salariale',
    label: 'Masse salariale (rémunération franchisé incluse) — % du CA HT',
    cible: '≤ 15 %',
    evaluate(v) { return v <= 15 ? 'vert' : v <= 17 ? 'orange' : 'rouge'; },
    papDesc(v) { return `Ma valeur actuelle : ${v} % vs cible DAF ≤15 %. Référence : 1 salarié par tranche de 250 K€ de CA. Voir le module Simulateur équipe pour la modélisation.`; },
  },
  {
    key: 'ebe',
    label: 'EBE — % du CA HT',
    cible: '≥ 8 %',
    evaluate(v) { return v >= 8 ? 'vert' : v >= 5 ? 'orange' : 'rouge'; },
    papDesc(v) { return `Ma valeur actuelle : ${v} % vs cible DAF ≥8 %. L'EBE dépend directement du taux de marge net, des charges externes et de la masse salariale. Identifier le levier prioritaire.`; },
  },
  {
    key: 'rcai',
    label: 'Résultat courant avant impôts (RCAI) — % du CA HT',
    cible: '≥ 5 %',
    evaluate(v) { return v >= 5 ? 'vert' : v >= 3 ? 'orange' : 'rouge'; },
    papDesc(v) { return `Ma valeur actuelle : ${v} % vs cible DAF ≥5 %. Le RCAI intègre charges financières et amortissements. Vérifier l'endettement et le niveau d'amortissement.`; },
  },
];

const EMPTY_SANTE: Record<SanteKey, string> = {
  taux_marge_net: '', charges_externes: '', masse_salariale: '', ebe: '', rcai: '',
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

function santeBg(s: SanteStatus|undefined): string {
  if (s === 'rouge')  return 'bg-red-50';
  if (s === 'orange') return 'bg-orange-50';
  if (s === 'vert')   return 'bg-green-50';
  return 'bg-white';
}

function santeEmoji(s: SanteStatus|undefined): string {
  if (s === 'rouge')  return '🔴';
  if (s === 'orange') return '🟠';
  if (s === 'vert')   return '✅';
  return '—';
}

function emptyCharges(): Record<PosteKey, string> {
  const o: Partial<Record<PosteKey, string>> = {};
  POSTES.forEach(p => { o[p.key] = ''; });
  return o as Record<PosteKey, string>;
}

// ── Import compte de résultat ─────────────────────────────────────────────────

type ImportRow = { lib: string; montant: number; poste: PosteKey | null; ignored: boolean };

function norm2(s: string) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function mapComptableToDAF(libelle: string): PosteKey | null {
  const l = norm2(libelle);
  if (/loyer|bail|location.*immo|immeuble|local comm/.test(l)) return 'locations_immo';
  if (/credit.*bail.*vehi|loa.*vehi|location.*vehicule|location.*voiture|location.*camion/.test(l)) return 'locations_mob';
  if (/logiciel|saas|location.*info|location.*materiel.*info/.test(l)) return 'locations_info';
  if (/charge.*locative|copropri|assurance.*loyer|taxe.*fonci|charge.*commun/.test(l)) return 'charges_locatives';
  if (/entretien|reparation|nettoyage|maintenance/.test(l)) return 'entretien';
  if (/presta|sous.traitance|externalisation|gardiennage/.test(l)) return 'prestations';
  if (/assurance/.test(l)) return 'assurances';
  if (/honoraire|expert.*compt|avocat|conseil/.test(l)) return 'honoraires';
  if (/frais.*acte|notaire|juridique|enregistrement/.test(l)) return 'frais_actes';
  if (/pub.*nat|redev.*nat|communication.*nat|royalt/.test(l)) return 'pub_nationale';
  if (/pub.*loc|publicit|marketing|flyer|affiche|google|facebook/.test(l)) return 'pub_locale';
  if (/transport|livraison|messagerie|courrier|fret|postal/.test(l)) return 'transports';
  if (/fourniture.*bureau|papeterie|bureautique|petite.*fourni/.test(l)) return 'achats_fournitures';
  if (/emballage|sac|consommable|produit.*nettoyage/.test(l)) return 'achats_consommables';
  return null;
}

function parseMontant(s: string): number | null {
  const cleaned = s.replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isFinite(n) ? Math.abs(n) : null;
}

function isCALine(lib: string): boolean {
  const l = norm2(lib);
  return /chiffre.*affaire|ca\b|vente.*marchandise|produit.*vente/.test(l);
}

function parseComptableText(text: string): { rows: ImportRow[]; detectedCA: number | null } {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const rows: ImportRow[] = [];
  let detectedCA: number | null = null;
  for (const line of lines) {
    // Try split on tab, semicolon, or multiple spaces
    const parts = line.split(/\t|;|  +/);
    if (parts.length < 2) continue;
    const lib = parts[0].trim();
    const last = parts[parts.length - 1].trim();
    const montant = parseMontant(last);
    if (!montant || montant <= 0 || !lib) continue;
    if (isCALine(lib)) { detectedCA = montant; continue; }
    const poste = mapComptableToDAF(lib);
    rows.push({ lib, montant, poste, ignored: poste === null });
  }
  return { rows, detectedCA };
}

// ── AI context export ─────────────────────────────────────────────────────────

export function getBenchmarkContext(magasinNom: string): string {
  try {
    let ctx = '';

    // Santé globale context
    const santeRaw = localStorage.getItem(`benchmark_sante_globale_${magasinNom}`);
    if (santeRaw) {
      const sd = JSON.parse(santeRaw) as Record<SanteKey, number>;
      const filled = SANTE_INDICATEURS.filter(ind => sd[ind.key] != null && sd[ind.key] > 0);
      if (filled.length > 0) {
        let nbVert = 0, nbOrange = 0, nbRouge = 0;
        ctx += '\nSanté financière globale du magasin :';
        filled.forEach(ind => {
          const v = sd[ind.key];
          const st = ind.evaluate(v);
          if (st === 'vert')   nbVert++;
          if (st === 'orange') nbOrange++;
          if (st === 'rouge')  nbRouge++;
          ctx += `\n${ind.label} : ${v} % (cible DAF ${ind.cible}, statut ${st})`;
        });
        ctx += `\nSynthèse : ${nbVert} vert${nbVert > 1 ? 's' : ''}, ${nbOrange} orange${nbOrange > 1 ? 's' : ''}, ${nbRouge} rouge${nbRouge > 1 ? 's' : ''}`;
      }
    }

    // Charges benchmark context
    const raw = localStorage.getItem(`benchmark_franchise_${magasinNom}`);
    if (!raw) return ctx;
    const d = JSON.parse(raw) as { ca_ht?: number; centre_ville?: boolean; charges?: Record<string, number> };
    if (!d.ca_ht) return ctx;
    const charges = d.charges ?? {};
    const filledCount = Object.values(charges).filter(v => v > 0).length;
    if (filledCount < 5) return ctx;

    const moyennesRaw = localStorage.getItem('benchmark_moyennes_reseau');
    const moyennes: MoyennesReseau = moyennesRaw
      ? { ...DEFAULT_MOYENNES, ...(JSON.parse(moyennesRaw) as Partial<MoyennesReseau>) }
      : DEFAULT_MOYENNES;

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

    ctx += `\nBenchmark financier :`;
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
  // ── Santé globale state
  const [sante, setSante]             = useState<Record<SanteKey, string>>(EMPTY_SANTE);
  const [showSante, setShowSante]     = useState(true);
  const [santeAdded, setSanteAdded]   = useState<Set<SanteKey>>(new Set());
  const [toastMsg, setToastMsg]       = useState('');

  // ── Charges benchmark state
  const [moyennes, setMoyennes]               = useState<MoyennesReseau>(DEFAULT_MOYENNES);
  const [showSection1, setShowSection1]       = useState(false);
  const [caHTStr, setCaHTStr]                 = useState('');
  const [centreVille, setCentreVille]         = useState(false);
  const [charges, setCharges]                 = useState<Record<PosteKey, string>>(emptyCharges);
  const [papAdded, setPapAdded]               = useState<Set<PosteKey>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [mounted, setMounted]                 = useState(false);

  // ── Import compte de résultat state ────────────────────────────────────────
  const [importOpen, setImportOpen]           = useState(false);
  const [importMode, setImportMode]           = useState<'file'|'paste'>('paste');
  const [importText, setImportText]           = useState('');
  const [importRows, setImportRows]           = useState<ImportRow[]>([]);
  const [importDetectedCA, setImportDetectedCA] = useState<number | null>(null);
  const [importStep, setImportStep]           = useState<'idle'|'preview'>('idle');
  const [importLoading, setImportLoading]     = useState(false);
  const importFileRef                         = useRef<HTMLInputElement>(null);

  // ── Load from localStorage on mount ────────────────────────────────────────
  useEffect(() => {
    try {
      const sRaw = localStorage.getItem(`benchmark_sante_globale_${magasinNom}`);
      if (sRaw) {
        const sd = JSON.parse(sRaw) as Record<SanteKey, number>;
        const filled = { ...EMPTY_SANTE };
        (Object.keys(sd) as SanteKey[]).forEach(k => {
          if (sd[k] != null && sd[k] > 0) filled[k] = String(sd[k]);
        });
        setSante(filled);
      }
    } catch { /* ignore */ }
    try {
      const mRaw = localStorage.getItem('benchmark_moyennes_reseau');
      if (mRaw) setMoyennes({ ...DEFAULT_MOYENNES, ...(JSON.parse(mRaw) as Partial<MoyennesReseau>) });
    } catch { /* ignore */ }
    try {
      const fRaw = localStorage.getItem(`benchmark_franchise_${magasinNom}`);
      if (fRaw) {
        const d = JSON.parse(fRaw) as { ca_ht?: number; centre_ville?: boolean; charges?: Record<string, number> };
        if (d.ca_ht)        setCaHTStr(String(d.ca_ht));
        if (d.centre_ville) setCentreVille(!!d.centre_ville);
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

  // ── Save sante whenever it changes ─────────────────────────────────────────
  useEffect(() => {
    if (!mounted) return;
    const num: Record<string, number> = {};
    (Object.keys(sante) as SanteKey[]).forEach(k => { num[k] = parseFloat(sante[k].replace(',', '.')) || 0; });
    localStorage.setItem(`benchmark_sante_globale_${magasinNom}`, JSON.stringify(num));
  }, [mounted, magasinNom, sante]);

  // ── Save franchise data whenever it changes ─────────────────────────────────
  useEffect(() => {
    if (!mounted) return;
    const ca = parseFloat(caHTStr) || 0;
    const chargesNum: Record<string, number> = {};
    POSTES.forEach(p => { chargesNum[p.key] = parseFloat(charges[p.key]) || 0; });
    localStorage.setItem(`benchmark_franchise_${magasinNom}`, JSON.stringify({ ca_ht: ca, centre_ville: centreVille, charges: chargesNum }));
  }, [mounted, magasinNom, caHTStr, centreVille, charges]);

  // ── Save moyennes whenever they change ──────────────────────────────────────
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('benchmark_moyennes_reseau', JSON.stringify(moyennes));
  }, [mounted, moyennes]);

  // ── Computed ────────────────────────────────────────────────────────────────

  const santeStatuses = useMemo((): Partial<Record<SanteKey, SanteStatus>> => {
    const result: Partial<Record<SanteKey, SanteStatus>> = {};
    SANTE_INDICATEURS.forEach(ind => {
      const v = parseFloat(sante[ind.key].replace(',', '.'));
      if (!isNaN(v)) result[ind.key] = ind.evaluate(v);
    });
    return result;
  }, [sante]);

  const santeSummary = useMemo(() => {
    const statuses = Object.values(santeStatuses);
    return {
      nbVert:   statuses.filter(s => s === 'vert').length,
      nbOrange: statuses.filter(s => s === 'orange').length,
      nbRouge:  statuses.filter(s => s === 'rouge').length,
      nbSaisied: statuses.length,
    };
  }, [santeStatuses]);

  const caHT = parseFloat(caHTStr) || 0;
  const trancheKey  = useMemo(() => detectTranche(caHT, centreVille), [caHT, centreVille]);
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

  const sortedDiag = useMemo(() => [...diagnostic].sort((a, b) => b.ecartEuros - a.ecartEuros), [diagnostic]);

  const priorities = useMemo(() =>
    diagnostic.filter(r => r.saisied && r.ecartEuros > 0).sort((a, b) => b.ecartEuros - a.ecartEuros).slice(0, 3),
    [diagnostic]);

  const potentielTotal = useMemo(() => priorities.reduce((s, r) => s + r.ecartEuros, 0), [priorities]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  }

  function updateSante(key: SanteKey, val: string) {
    setSante(prev => ({ ...prev, [key]: val }));
  }

  function santeAddToPAP(ind: SanteIndicateur) {
    if (!onAddAction) return;
    const v = parseFloat(sante[ind.key].replace(',', '.')) || 0;
    const today = new Date();
    const echeance = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate())
      .toISOString().split('T')[0];
    const action: PAPAction = {
      id: String(Date.now()),
      titre: `Améliorer ${ind.label}`,
      axe: 'Transverse',
      pilote: '',
      copilote: '',
      description: ind.papDesc(v),
      echeance,
      priorite: 1,
      gain: 0,
      statut: 'À faire',
    };
    onAddAction(action);
    setSanteAdded(prev => new Set(prev).add(ind.key));
    showToast('✅ Action ajoutée au Plan d\'Action');
  }

  function updateMoyenne(poste: PosteKey, tranche: TrancheKey, val: string) {
    const n = parseFloat(val.replace(',', '.')) || 0;
    setMoyennes(prev => ({ ...prev, [poste]: { ...prev[poste], [tranche]: n } }));
  }

  function resetMoyennes() { setMoyennes(DEFAULT_MOYENNES); }

  async function handleImportFile(file: File | null | undefined) {
    if (!file) return;
    setImportLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_csv(ws);
      parseAndPreview(raw);
    } catch { /* ignore parse errors */ }
    finally { setImportLoading(false); }
  }

  function parseAndPreview(text: string) {
    const { rows, detectedCA } = parseComptableText(text);
    setImportRows(rows);
    setImportDetectedCA(detectedCA);
    setImportStep('preview');
  }

  function applyImport() {
    const newCharges = { ...charges };
    for (const r of importRows) {
      if (!r.ignored && r.poste) newCharges[r.poste] = String(Math.round(r.montant));
    }
    setCharges(newCharges);
    if (importDetectedCA && !caHTStr) setCaHTStr(String(Math.round(importDetectedCA)));
    setImportStep('idle');
    setImportRows([]);
    setImportText('');
    setImportOpen(false);
  }

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

  function sendToAssistant() {
    try {
      const context = {
        top3: priorities.slice(0, 3).map(r => ({ label: r.label, ecartEuros: Math.round(r.ecartEuros), ecartPct: Math.round(r.ecartPct), status: r.status })),
        caHT, trancheLabel, potentielTotal: Math.round(potentielTotal), ts: Date.now(),
      };
      localStorage.setItem(`benchmark_ai_prompt_${magasinNom}`, JSON.stringify(context));
      showToast("✅ Contexte transmis à l'Assistant IA — basculez sur l'onglet Assistant");
    } catch { /* ignore */ }
  }

  function clearAll() {
    localStorage.removeItem(`benchmark_sante_globale_${magasinNom}`);
    localStorage.removeItem('benchmark_moyennes_reseau');
    localStorage.removeItem(`benchmark_franchise_${magasinNom}`);
    setSante({ ...EMPTY_SANTE });
    setSanteAdded(new Set());
    setMoyennes(DEFAULT_MOYENNES);
    setCaHTStr('');
    setCentreVille(false);
    setCharges(emptyCharges());
    setPapAdded(new Set());
    setShowClearConfirm(false);
  }

  // ── Shared table styles ──────────────────────────────────────────────────────
  const TH  = 'px-3 py-2 text-left text-xs font-semibold text-[#6B7280] bg-[#F9FAFB] border-b border-[#E0E0E0]';
  const THR = 'px-3 py-2 text-right text-xs font-semibold text-[#6B7280] bg-[#F9FAFB] border-b border-[#E0E0E0]';
  const TD  = 'px-3 py-2 text-xs text-[#1A1A1A] border-b border-[#F0F0F0]';
  const TDR = 'px-3 py-2 text-xs text-right text-[#1A1A1A] border-b border-[#F0F0F0]';

  return (
    <div className="space-y-5">

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1A1A1A] text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg pointer-events-none">
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-[#1A1A1A]">📊 Benchmark financier</h2>
        <p className="text-sm text-[#6B7280] mt-0.5">Positionnez vos indicateurs financiers et vos charges vs les références DAF Easycash.</p>
      </div>

      {/* Confidentialité bandeau */}
      <div className="flex items-center gap-2 bg-[#F3F4F6] border border-[#E0E0E0] rounded-xl px-4 py-3">
        <span className="text-base">🔒</span>
        <p className="text-xs text-[#6B7280]">
          Toutes vos données financières restent stockées uniquement sur votre appareil. Aucune transmission externe. Vous choisissez si et quand les partager avec votre animateur.
        </p>
      </div>

      {/* ══ SECTION 0 : Santé financière globale ══ */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-4 text-left"
          onClick={() => setShowSante(v => !v)}
        >
          <div>
            <h3 className="text-sm font-bold text-[#1A1A1A]">🎯 Santé financière globale</h3>
            <p className="text-xs text-[#6B7280] mt-0.5">Les 5 indicateurs cibles de la DAF Easycash 2022 — votre tableau de bord macro</p>
          </div>
          <div className="flex items-center gap-3 ml-4 shrink-0">
            {santeSummary.nbSaisied > 0 && (
              <span className="text-xs text-[#6B7280]">
                {santeSummary.nbVert > 0 && <span className="mr-1">✅ {santeSummary.nbVert}</span>}
                {santeSummary.nbOrange > 0 && <span className="mr-1">🟠 {santeSummary.nbOrange}</span>}
                {santeSummary.nbRouge > 0 && <span className="mr-1">🔴 {santeSummary.nbRouge}</span>}
              </span>
            )}
            <span className="text-[#6B7280] text-sm">{showSante ? '▲' : '▼'}</span>
          </div>
        </button>

        {showSante && (
          <div className="px-5 pb-5 space-y-4">

            {/* Saisie table */}
            <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr>
                    <th className={`${TH} min-w-[280px]`}>Indicateur</th>
                    <th className={THR}>Ma valeur (%)</th>
                    <th className={THR}>Cible DAF Easycash</th>
                    <th className={THR}>Statut</th>
                    {onAddAction && <th className={THR}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {SANTE_INDICATEURS.map((ind, i) => {
                    const st = santeStatuses[ind.key];
                    const rowBg = st ? santeBg(st) : (i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]');
                    const alreadyAdded = santeAdded.has(ind.key);
                    return (
                      <tr key={ind.key} className={rowBg}>
                        <td className={TD}>{ind.label}</td>
                        <td className="px-2 py-1.5 border-b border-[#F0F0F0]">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              step="0.1"
                              placeholder="ex : 37,5"
                              value={sante[ind.key]}
                              onChange={e => updateSante(ind.key, e.target.value)}
                              className="w-20 text-xs text-right border border-[#E0E0E0] rounded px-2 py-0.5 focus:outline-none focus:border-[#E30613]"
                            />
                            <span className="text-[#9CA3AF]">%</span>
                          </div>
                        </td>
                        <td className={TDR + ' font-medium text-[#374151]'}>{ind.cible}</td>
                        <td className={TDR}>
                          {st ? (
                            <span className="text-base">{santeEmoji(st)}</span>
                          ) : (
                            <span className="text-[#D1D5DB]">—</span>
                          )}
                        </td>
                        {onAddAction && (
                          <td className={TDR}>
                            {st === 'rouge' || st === 'orange' ? (
                              alreadyAdded ? (
                                <span className="text-xs text-green-700 font-semibold">✓ Ajouté</span>
                              ) : (
                                <button
                                  onClick={() => santeAddToPAP(ind)}
                                  className={`text-xs font-semibold rounded-full px-2.5 py-1 transition-colors whitespace-nowrap ${st === 'rouge' ? 'text-white bg-[#E30613] hover:bg-red-700' : 'text-orange-700 bg-orange-100 hover:bg-orange-200 border border-orange-300'}`}
                                >
                                  + PAP
                                </button>
                              )
                            ) : null}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Synthèse automatique */}
            {santeSummary.nbSaisied > 0 && (
              <div className={`rounded-xl border px-4 py-3 space-y-2 ${santeSummary.nbRouge > 0 ? 'bg-red-50 border-red-200' : santeSummary.nbOrange > 0 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
                <p className="text-sm font-semibold text-[#1A1A1A]">📊 Synthèse de ma santé financière :</p>
                <p className="text-sm text-[#374151]">
                  Sur <strong>{santeSummary.nbSaisied}</strong> indicateur{santeSummary.nbSaisied > 1 ? 's' : ''} cible{santeSummary.nbSaisied > 1 ? 's' : ''}, vous êtes :
                </p>
                <div className="flex flex-wrap gap-3 text-sm">
                  {santeSummary.nbVert > 0   && <span className="font-semibold text-green-700">✅ Au vert sur {santeSummary.nbVert} indicateur{santeSummary.nbVert > 1 ? 's' : ''}</span>}
                  {santeSummary.nbOrange > 0 && <span className="font-semibold text-orange-600">🟠 En alerte orange sur {santeSummary.nbOrange} indicateur{santeSummary.nbOrange > 1 ? 's' : ''}</span>}
                  {santeSummary.nbRouge > 0  && <span className="font-semibold text-red-700">🔴 En alerte rouge sur {santeSummary.nbRouge} indicateur{santeSummary.nbRouge > 1 ? 's' : ''}</span>}
                </div>
                {santeSummary.nbRouge > 0 && (
                  <p className="text-xs text-red-700 font-medium pt-1">
                    ⚠️ Les indicateurs en rouge sont critiques pour la rentabilité de votre magasin. Travaillez-les en priorité avec votre animateur.
                  </p>
                )}
                {santeSummary.nbRouge === 0 && santeSummary.nbOrange === 0 && santeSummary.nbVert === santeSummary.nbSaisied && santeSummary.nbSaisied === 5 && (
                  <p className="text-sm text-green-800 font-semibold">🎉 Excellente maîtrise. Tous vos indicateurs sont alignés avec les cibles DAF Easycash.</p>
                )}
              </div>
            )}

            {/* Références DAF 2022 */}
            <div className="bg-[#F9FAFB] border border-[#E0E0E0] rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-[#374151]">📋 Références DAF Easycash 2022 (à titre indicatif) :</p>
              <ul className="text-xs text-[#6B7280] space-y-0.5 list-none">
                <li>• 1 salarié par tranche de 250 K€ de CA annuel (référence ETP)</li>
                <li>• Stock total recommandé : &lt; 250 K€ pour la plupart des magasins</li>
                <li>• Stock âgé : &lt; 30 % du stock total (seuil d&apos;alerte)</li>
                <li>• Démarque (connue + inconnue) : &lt; 3 % du CA annuel</li>
                <li>• CA TTC moyen réseau 2022 : 2 077 349 € — Médiane : 1 921 295 €</li>
                <li>• Marge brute HT moyenne : 34,3 % — Médiane : 33,5 %</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* ══ SECTION 1 : Configuration moyennes réseau ══ */}
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

      {/* ══ IMPORT compte de résultat ══ */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
        <button className="w-full flex items-center justify-between px-5 py-4 text-left" onClick={() => setImportOpen(v => !v)}>
          <div>
            <h3 className="text-sm font-bold text-[#1A1A1A]">📂 Importer mon compte de résultat</h3>
            <p className="text-xs text-[#6B7280] mt-0.5">Importez votre CR pour alimenter automatiquement les 14 postes de charges DAF.</p>
          </div>
          <span className="text-[#6B7280] text-sm ml-4">{importOpen ? '▲' : '▼'}</span>
        </button>
        {importOpen && (
          <div className="px-5 pb-5 space-y-4">
            {importStep === 'idle' && (
              <>
                {/* Mode tabs */}
                <div className="flex gap-2">
                  {(['paste','file'] as const).map(m => (
                    <button key={m} onClick={() => setImportMode(m)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${importMode === m ? 'bg-[#E30613] text-white border-[#E30613]' : 'border-[#E0E0E0] text-[#6B7280] hover:border-[#E30613]'}`}>
                      {m === 'paste' ? '📋 Coller le texte' : '📁 Importer un fichier'}
                    </button>
                  ))}
                </div>

                {importMode === 'paste' ? (
                  <div className="space-y-2">
                    <p className="text-xs text-[#6B7280]">Copiez-collez les lignes de votre compte de résultat (format : libellé [tab ou espace] montant). Une ligne = un poste.</p>
                    <textarea
                      value={importText}
                      onChange={e => setImportText(e.target.value)}
                      placeholder={'Exemple :\nLoyer local commercial\t18000\nAssurances\t2400\nHonoraires expert-comptable\t3200'}
                      rows={8}
                      className="w-full text-xs border border-[#E0E0E0] rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-[#E30613] resize-y"
                    />
                    <button
                      disabled={!importText.trim()}
                      onClick={() => parseAndPreview(importText)}
                      className="px-4 py-2 bg-[#E30613] disabled:bg-[#F5F5F5] disabled:text-[#9CA3AF] text-white text-sm font-semibold rounded-xl transition-colors"
                    >Analyser →</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-[#6B7280]">Fichier .xlsx, .xls ou .csv exporté depuis votre logiciel comptable.</p>
                    <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => handleImportFile(e.target.files?.[0])} />
                    <button onClick={() => importFileRef.current?.click()} disabled={importLoading} className="px-4 py-2 border border-[#E30613] text-[#E30613] text-sm font-semibold rounded-xl hover:bg-[#FFF5F5] disabled:opacity-50 transition-colors">
                      {importLoading ? 'Lecture…' : '📁 Choisir un fichier'}
                    </button>
                  </div>
                )}
              </>
            )}

            {importStep === 'preview' && (
              <div className="space-y-3">
                {importDetectedCA && (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-xs text-green-800">
                    ✅ CA HT détecté automatiquement : <strong>{importDetectedCA.toLocaleString('fr-FR')} €</strong>
                    {caHTStr ? ' (non appliqué — CA déjà renseigné)' : ' — sera appliqué à la validation'}
                  </div>
                )}
                <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
                  <table className="text-xs w-full border-collapse">
                    <thead><tr>
                      <th className={TH}>Libellé comptable</th>
                      <th className={THR}>Montant (€)</th>
                      <th className={TH}>Poste DAF mappé</th>
                      <th className={TH}>Action</th>
                    </tr></thead>
                    <tbody>{importRows.map((r, i) => (
                      <tr key={i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'} ${r.ignored ? 'opacity-50' : ''}`}>
                        <td className={TD}><span className="font-medium">{r.lib}</span></td>
                        <td className={TDR}>{r.montant.toLocaleString('fr-FR')} €</td>
                        <td className={TD}>
                          <select
                            value={r.poste ?? ''}
                            onChange={e => setImportRows(prev => prev.map((row, j) => j === i ? { ...row, poste: (e.target.value || null) as PosteKey | null, ignored: !e.target.value } : row))}
                            className="text-xs border border-[#E0E0E0] rounded px-1 py-0.5 focus:outline-none focus:border-[#E30613] w-full max-w-[220px]"
                          >
                            <option value="">— Ignorer —</option>
                            {POSTES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                          </select>
                        </td>
                        <td className={TD}>
                          <button onClick={() => setImportRows(prev => prev.map((row, j) => j === i ? { ...row, ignored: !row.ignored } : row))} className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${r.ignored ? 'border-green-400 text-green-700 hover:bg-green-50' : 'border-[#9CA3AF] text-[#9CA3AF] hover:text-red-600 hover:border-red-300'}`}>
                            {r.ignored ? '↩ Inclure' : '✕ Ignorer'}
                          </button>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <p className="text-xs text-[#9CA3AF] italic">{importRows.filter(r => !r.ignored && r.poste).length} poste{importRows.filter(r => !r.ignored && r.poste).length > 1 ? 's' : ''} seront transférés sur les {importRows.length} lignes importées.</p>
                <div className="flex gap-2">
                  <button onClick={applyImport} className="flex-1 bg-[#E30613] hover:bg-[#B8050F] text-white text-sm font-semibold rounded-xl py-2.5 transition-colors">
                    ✅ Valider et alimenter le Benchmark
                  </button>
                  <button onClick={() => { setImportStep('idle'); setImportRows([]); }} className="px-4 py-2.5 border border-[#E0E0E0] text-[#6B7280] text-sm font-semibold rounded-xl transition-colors">
                    ← Recommencer
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ SECTION 2 : Saisie franchisé ══ */}
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

      {/* ══ SECTION 3 : Diagnostic comparatif ══ */}
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

          {/* Top-3 écarts hero */}
          {priorities.length > 0 && (
            <div className="bg-[#FFF5F5] border border-red-200 rounded-xl p-4 space-y-2">
              <p className="text-sm font-bold text-[#1A1A1A]">💡 Vos {priorities.length} plus grand{priorities.length > 1 ? 's' : ''} écart{priorities.length > 1 ? 's' : ''} vs votre tranche réseau</p>
              {priorities.map(r => (
                <div key={r.key} className="flex items-center justify-between gap-3">
                  <p className="text-sm text-[#374151]">
                    {statusBadge(r.status)} <span className="font-semibold">{r.label}</span>
                    <span className="text-[#6B7280]"> : +{fmt(r.ecartEuros)} € vs moyenne</span>
                  </p>
                  {onAddAction && (
                    papAdded.has(r.key) ? (
                      <span className="text-xs text-green-700 font-semibold bg-green-50 border border-green-200 rounded-full px-3 py-1 whitespace-nowrap">✓ Ajouté</span>
                    ) : (
                      <button onClick={() => addToPAP(r)} className="text-xs text-white bg-[#E30613] hover:bg-red-700 rounded-full px-3 py-1 whitespace-nowrap transition-colors">+ PAP</button>
                    )
                  )}
                </div>
              ))}
              <div className="pt-2 border-t border-red-200">
                <button onClick={sendToAssistant} className="text-xs font-semibold text-[#E30613] border border-[#E30613] rounded-lg px-4 py-2 hover:bg-[#FFF5F5] transition-colors">
                  💬 Discuter de mes charges avec l&apos;Assistant IA
                </button>
              </div>
            </div>
          )}

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
                  <th className={TH}>Action</th>
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
                    <td className="px-3 py-2 border-t border-[#F0F0F0]">
                      {r.saisied && (r.status === 'rouge' || r.status === 'orange') && onAddAction && (
                        papAdded.has(r.key) ? (
                          <span className="text-[10px] text-green-700 font-semibold">✓</span>
                        ) : (
                          <button onClick={() => addToPAP(r)} className="text-[10px] text-white bg-[#E30613] hover:bg-red-700 rounded-full px-2 py-0.5 whitespace-nowrap transition-colors">+ PAP</button>
                        )
                      )}
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

      {/* ══ SECTION 4 : Synthèse priorités ══ */}
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
