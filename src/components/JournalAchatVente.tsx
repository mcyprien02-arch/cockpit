'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import * as XLSX from 'xlsx';
import type { PAPAction } from '@/types';

interface Props {
  magasinNom: string;
  onAddAction?: (action: PAPAction) => void;
}
type Periode = 'all' | '3m' | '6m' | '12m';

// ── compact row (short keys to save localStorage space) ───────────────────────
interface CRow {
  m:    string;         // modele
  f:    string;         // famille
  g:    string;         // grade (uppercased, D excluded at import)
  d:    string | null;  // dateVente ISO
  pa:   number;         // prixAchat
  pv:   number;         // prixVente
  dv:   number | null;  // delaiVente
  ep?:  number | null;  // easyprice prixVente grade B
  epa?: number | null;  // easyprice prixAchat grade B
  cv?:  string;         // typeClientVendeur: "P"=Particulier, "F"=Fournisseur, ""=unknown
  fn?:  string;         // client vendeur nom
  fp?:  string;         // client vendeur prénom
  co?:  string;         // collaborateur (acheteur)
}

interface StoredImport {
  importedAt: string;
  rows: CRow[];
  dateMin: string | null;
  dateMax: string | null;
}

export interface ModelStats {
  modele:        string;
  famille:       string;
  qteVendue:     number;
  delaiMoyen:    number | null;
  margeUnitaire: number;
  margeTotal:    number;
  caTotal:       number;
  paMoyen:       number;
  pvMoyen:       number;
  tauxMarge:     number;
  epMoyen:       number | null;
  epaMoyen:      number | null;
  ecartEP:       number | null;
}

interface SourcingStats {
  canal: string;
  nbAchats: number;
  valeurAchats: number;
  valeurVentes: number;
  margeTotal: number;
  tauxMarge: number;
  delaiMoyen: number | null;
}

interface FournisseurStats {
  nom: string;
  nbProduits: number;
  valeurAchats: number;
  margeTotal: number;
  tauxMarge: number;
  delaiMoyen: number | null;
}

interface AcheteurStats {
  nom: string;
  nbAchats: number;
  valeurAchats: number;
  margeTotal: number;
  tauxMarge: number;
  ecartEPAchat: number | null;
  delaiMoyen: number | null;
}

// ── column aliases ────────────────────────────────────────────────────────────
const COL_ALIASES: Record<string, string[]> = {
  typeTransaction:     ['typedetransaction', 'typetransaction', 'transaction'],
  famille:             ['famille', 'familleproduit'],
  modele:              ['fichetechlibelle', 'fichetech', 'modele', 'libellearticle', 'achatlibellearticle', 'libelle'],
  grade:               ['articlegrade', 'grade', 'gradearticle'],
  prixAchat:           ['achatprix', 'prixachat', 'prixdachat'],
  prixVente:           ['venteprixvendu', 'prixvente', 'prixvendu'],
  delaiVente:          ['ventedelai', 'delaivente', 'delaideVente'],
  dateVente:           ['ventedate', 'datevente'],
  easypricePrixVente:  ['easypriceprixventegradeb', 'easypriceprixvente', 'coteep'],
  easypricePrixAchat:  ['easypriceprixachatgradeb', 'easypriceprixachat'],
  typeClientVendeur:   ['typeclientvendeur', 'typeclient', 'typevendeur'],
  clientVendeurNom:    ['clientvendeurnom', 'clientnom', 'nomclient', 'nomvendeur'],
  clientVendeurPrenom: ['clientvendeurprenom', 'prenomclient', 'clientprenom'],
  collaborateur:       ['collaborateur', 'acheteur', 'utilisateur'],
};

function norm(s: string): string {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_\-'"]/g, '');
}
function mapColumns(headers: string[]): Record<string, string> {
  const r: Record<string, string> = {};
  for (const h of headers) {
    const n = norm(h);
    for (const [field, aliases] of Object.entries(COL_ALIASES)) {
      if (!r[field] && aliases.includes(n)) r[field] = h;
    }
  }
  return r;
}
function parseNum(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function parseDateVal(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string') {
    const s = v.trim();
    const m1 = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
    if (m1) return new Date(+m1[3], +m1[2]-1, +m1[1]);
    const m2 = s.match(/^(\d{4})[/\-](\d{2})[/\-](\d{2})/);
    if (m2) return new Date(+m2[1], +m2[2]-1, +m2[3]);
  }
  return null;
}
function supplierName(fn: string, fp: string): string {
  const n = fn.trim(), p = fp.trim();
  if (!n) return '(Inconnu)';
  if (!p || norm(p) === norm(n)) return n;
  return `${n} ${p}`;
}

// ── filter + compute model stats ──────────────────────────────────────────────
function filterRows(rows: CRow[], periode: Periode, grade: string): CRow[] {
  let cutoff: Date | null = null;
  if (periode !== 'all') { cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - (periode === '3m' ? 3 : periode === '6m' ? 6 : 12)); }
  return rows.filter(r => {
    if (grade !== 'all' && r.g !== grade) return false;
    if (cutoff && r.d && new Date(r.d) < cutoff) return false;
    return true;
  });
}

function computeStats(rows: CRow[]): ModelStats[] {
  const groups = new Map<string, { modele: string; famille: string; pas: number[]; pvs: number[]; dvs: number[]; eps: number[]; epas: number[] }>();
  for (const r of rows) {
    const key = r.m.toLowerCase();
    if (!groups.has(key)) groups.set(key, { modele: r.m, famille: r.f, pas: [], pvs: [], dvs: [], eps: [], epas: [] });
    const g = groups.get(key)!;
    g.pas.push(r.pa); g.pvs.push(r.pv);
    if (r.dv && r.dv > 0) g.dvs.push(r.dv);
    if (r.ep  && r.ep  > 0) g.eps.push(r.ep);
    if (r.epa && r.epa > 0) g.epas.push(r.epa);
  }
  return Array.from(groups.values()).map(g => {
    const qte = g.pvs.length;
    const mt  = Math.round(g.pvs.reduce((s,v,i) => s+v-g.pas[i], 0));
    const ca  = Math.round(g.pvs.reduce((s,v) => s+v, 0));
    const pa  = qte > 0 ? Math.round(g.pas.reduce((s,v) => s+v,0) / qte) : 0;
    const pv  = qte > 0 ? Math.round(ca / qte) : 0;
    const ep  = g.eps.length  > 0 ? Math.round(g.eps.reduce((s,v)=>s+v,0)  / g.eps.length)  : null;
    const epa = g.epas.length > 0 ? Math.round(g.epas.reduce((s,v)=>s+v,0) / g.epas.length) : null;
    return {
      modele: g.modele, famille: g.famille, qteVendue: qte,
      delaiMoyen: g.dvs.length > 0 ? Math.round(g.dvs.reduce((s,v)=>s+v,0) / g.dvs.length) : null,
      margeUnitaire: qte > 0 ? Math.round(mt/qte) : 0, margeTotal: mt, caTotal: ca, paMoyen: pa, pvMoyen: pv,
      tauxMarge: ca > 0 ? Math.round(mt/ca*100) : 0,
      epMoyen: ep, epaMoyen: epa,
      ecartEP: ep && pv > 0 ? Math.round((pv-ep)/ep*100) : null,
    };
  });
}

// ── sourcing, fournisseurs, acheteurs ─────────────────────────────────────────
function computeSourcing(rows: CRow[]): SourcingStats[] {
  const g = new Map<string, { pas: number[]; pvs: number[]; dvs: number[] }>();
  for (const r of rows) {
    const k = r.cv === 'P' ? 'Particulier (achat comptoir)' : r.cv === 'F' ? 'Fournisseur (achat externe)' : 'Non renseigné';
    if (!g.has(k)) g.set(k, { pas: [], pvs: [], dvs: [] });
    const gr = g.get(k)!;
    gr.pas.push(r.pa); gr.pvs.push(r.pv);
    if (r.dv && r.dv > 0) gr.dvs.push(r.dv);
  }
  return Array.from(g.entries()).map(([canal, gr]) => {
    const nb = gr.pvs.length;
    const va = Math.round(gr.pas.reduce((s,v)=>s+v,0));
    const vv = Math.round(gr.pvs.reduce((s,v)=>s+v,0));
    const mt = Math.round(gr.pvs.reduce((s,v,i)=>s+v-gr.pas[i],0));
    return { canal, nbAchats: nb, valeurAchats: va, valeurVentes: vv, margeTotal: mt,
      tauxMarge: vv > 0 ? Math.round(mt/vv*100) : 0,
      delaiMoyen: gr.dvs.length > 0 ? Math.round(gr.dvs.reduce((s,v)=>s+v,0)/gr.dvs.length) : null };
  }).sort((a,b) => b.nbAchats - a.nbAchats);
}

function computeFournisseurs(rows: CRow[]): FournisseurStats[] {
  const g = new Map<string, { nom: string; pas: number[]; pvs: number[]; dvs: number[] }>();
  for (const r of rows.filter(r => r.cv === 'F')) {
    const nom = supplierName(r.fn ?? '', r.fp ?? '');
    const key = nom.toLowerCase();
    if (!g.has(key)) g.set(key, { nom, pas: [], pvs: [], dvs: [] });
    const gr = g.get(key)!;
    gr.pas.push(r.pa); gr.pvs.push(r.pv);
    if (r.dv && r.dv > 0) gr.dvs.push(r.dv);
  }
  return Array.from(g.values())
    .filter(gr => gr.pvs.length >= 3)
    .map(gr => {
      const nb = gr.pvs.length, va = Math.round(gr.pas.reduce((s,v)=>s+v,0));
      const vv = Math.round(gr.pvs.reduce((s,v)=>s+v,0));
      const mt = Math.round(gr.pvs.reduce((s,v,i)=>s+v-gr.pas[i],0));
      return { nom: gr.nom, nbProduits: nb, valeurAchats: va, margeTotal: mt,
        tauxMarge: vv > 0 ? Math.round(mt/vv*100) : 0,
        delaiMoyen: gr.dvs.length > 0 ? Math.round(gr.dvs.reduce((s,v)=>s+v,0)/gr.dvs.length) : null };
    })
    .sort((a,b) => b.margeTotal - a.margeTotal).slice(0, 10);
}

function computeAcheteurs(rows: CRow[]): AcheteurStats[] {
  const g = new Map<string, { nom: string; pas: number[]; pvs: number[]; dvs: number[]; ecarts: number[] }>();
  for (const r of rows.filter(r => r.cv === 'P')) {
    const nom = (r.co ?? '').trim() || '(Inconnu)';
    const key = nom.toLowerCase();
    if (!g.has(key)) g.set(key, { nom, pas: [], pvs: [], dvs: [], ecarts: [] });
    const gr = g.get(key)!;
    gr.pas.push(r.pa); gr.pvs.push(r.pv);
    if (r.dv && r.dv > 0) gr.dvs.push(r.dv);
    if (r.epa && r.epa > 0 && r.pa > 0) gr.ecarts.push((r.pa - r.epa) / r.epa * 100);
  }
  return Array.from(g.values())
    .filter(gr => gr.pvs.length >= 5)
    .map(gr => {
      const nb = gr.pvs.length, va = Math.round(gr.pas.reduce((s,v)=>s+v,0));
      const vv = Math.round(gr.pvs.reduce((s,v)=>s+v,0));
      const mt = Math.round(gr.pvs.reduce((s,v,i)=>s+v-gr.pas[i],0));
      const ecartEPAchat = gr.ecarts.length > 0 ? Math.round(gr.ecarts.reduce((s,v)=>s+v,0)/gr.ecarts.length*10)/10 : null;
      return { nom: gr.nom, nbAchats: nb, valeurAchats: va, margeTotal: mt,
        tauxMarge: vv > 0 ? Math.round(mt/vv*100) : 0, ecartEPAchat,
        delaiMoyen: gr.dvs.length > 0 ? Math.round(gr.dvs.reduce((s,v)=>s+v,0)/gr.dvs.length) : null };
    })
    .sort((a,b) => b.tauxMarge - a.tauxMarge);
}

// ── exported helper for AssistantIA ──────────────────────────────────────────
export function getJournalContext(magasinNom: string): string {
  try {
    const s = localStorage.getItem(`journal_analyse_${magasinNom}`);
    if (!s) return '';
    const stored = JSON.parse(s) as StoredImport;
    if (!Array.isArray(stored.rows) || !stored.rows.length) return '';
    const stats = computeStats(stored.rows);
    const fmtD = (d: string | null) => d ? new Date(d).toLocaleDateString('fr-FR') : '?';
    const fmtE = (v: number) => `${v > 0 ? '+' : ''}${v}%`;
    const period = stored.dateMin && stored.dateMax ? `du ${fmtD(stored.dateMin)} au ${fmtD(stored.dateMax)}` : 'période inconnue';

    const MIN3 = (s: ModelStats) => s.qteVendue >= 3;
    const rotSet = new Set(stats.filter(s => MIN3(s) && s.delaiMoyen !== null && s.delaiMoyen < 30).map(s => s.modele.toLowerCase()));
    const topRot   = stats.filter(s => MIN3(s) && s.delaiMoyen !== null && s.delaiMoyen < 30).sort((a,b)=>(a.delaiMoyen??999)-(b.delaiMoyen??999)).slice(0,5).map(r=>`${r.modele} (${r.delaiMoyen}j)`).join(', ');
    const topMarge = [...stats].filter(MIN3).sort((a,b)=>b.margeTotal-a.margeTotal).slice(0,5).map(m=>`${m.modele} (${m.margeTotal.toLocaleString('fr-FR')}€)`).join(', ');
    const pepites  = [...stats].filter(MIN3).sort((a,b)=>b.margeTotal-a.margeTotal).filter(s=>rotSet.has(s.modele.toLowerCase())).slice(0,3).map(p=>p.modele).join(', ');
    const perte    = stats.filter(s=>MIN3(s)&&s.margeTotal<0).sort((a,b)=>a.margeTotal-b.margeTotal).slice(0,3).map(t=>t.modele).join(', ');
    const faible   = stats.filter(s=>MIN3(s)&&s.margeUnitaire<30&&s.delaiMoyen!==null&&s.delaiMoyen>90&&s.margeTotal>=0).slice(0,3).map(t=>t.modele).join(', ');

    // Global EP vente
    const epMs = stats.filter(s=>s.epMoyen!=null&&s.epMoyen>0);
    const tqEP = epMs.reduce((s,m)=>s+m.qteVendue,0);
    const epVG = tqEP > 0 ? Math.round(epMs.reduce((s,m)=>s+((m.pvMoyen-m.epMoyen!)/m.epMoyen!*100)*m.qteVendue,0)/tqEP*10)/10 : null;

    // Global EP achat
    const epaMs = stats.filter(s=>s.epaMoyen!=null&&s.epaMoyen>0);
    const tqEPA = epaMs.reduce((s,m)=>s+m.qteVendue,0);
    const epAG  = tqEPA > 0 ? Math.round(epaMs.reduce((s,m)=>s+((m.paMoyen-m.epaMoyen!)/m.epaMoyen!*100)*m.qteVendue,0)/tqEPA*10)/10 : null;

    // Top brands
    const brands = new Map<string,number>();
    for (const r of stored.rows) { const b=(r.m.trim().split(/\s+/)[0]||'—').toUpperCase(); brands.set(b,(brands.get(b)??0)+1); }
    const total = stored.rows.length;
    const topBrands = Array.from(brands.entries()).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([b,c])=>`${b} ${Math.round(c/total*100)}%`).join(', ');

    // Sourcing
    const src = computeSourcing(stored.rows);
    const srcPart = src.find(s=>s.canal.includes('Particulier'));
    const srcFour = src.find(s=>s.canal.includes('Fournisseur'));
    const srcTotal = src.reduce((s,r)=>s+r.nbAchats,0);
    const srcTotalMarge = src.reduce((s,r)=>s+r.margeTotal,0);
    const srcLine = srcTotal > 0 ? `Sourcing : ${srcPart ? Math.round(srcPart.nbAchats/srcTotal*100) : 0}% comptoir (marge ${srcPart?.tauxMarge??0}%) / ${srcFour ? Math.round(srcFour.nbAchats/srcTotal*100) : 0}% fournisseurs (marge ${srcFour?.tauxMarge??0}%). Total marge ${srcTotalMarge.toLocaleString('fr-FR')}€.` : '';

    // Top fournisseurs
    const fours = computeFournisseurs(stored.rows);
    const foursLine = fours.length > 0 ? `Top 3 fournisseurs en marge : ${fours.slice(0,3).map(f=>`${f.nom} (${f.margeTotal.toLocaleString('fr-FR')}€)`).join(', ')}.` : '';

    // Acheteurs
    const achs = computeAcheteurs(stored.rows);
    const achLine = achs.length > 0 ? `Acheteur meilleur taux marge : ${achs[0].nom} (${achs[0].tauxMarge}%). ${achs.filter(a=>a.ecartEPAchat!==null).sort((a,b)=>Math.abs(a.ecartEPAchat!)-Math.abs(b.ecartEPAchat!))[0] ? `Plus aligné cote : ${achs.filter(a=>a.ecartEPAchat!==null).sort((a,b)=>Math.abs(a.ecartEPAchat!)-Math.abs(b.ecartEPAchat!))[0].nom} (écart ${fmtE(achs.filter(a=>a.ecartEPAchat!==null).sort((a,b)=>Math.abs(a.ecartEPAchat!)-Math.abs(b.ecartEPAchat!))[0].ecartEPAchat!)}).` : ''}` : '';

    return [
      `\nAnalyse journal ${magasinNom} · ${stored.rows.length.toLocaleString('fr-FR')} ventes (grades A/B/C) · ${period}.`,
      `Top rotations (<30j, min 3 ventes) : ${topRot||'aucun'}.`,
      `Top marges : ${topMarge||'aucun'}. Pépites locales : ${pepites||'aucune'}.`,
      epVG  != null ? `Politique vente vs cote EP : écart ${fmtE(epVG)}.` : '',
      epAG  != null ? `Politique achat vs cote EP : écart ${fmtE(epAG)}.` : '',
      topBrands ? `Marques dominantes : ${topBrands}.` : '',
      srcLine,
      foursLine,
      achLine,
      perte  ? `Modèles en perte sèche : ${perte}.` : '',
      faible ? `Modèles à faible rendement : ${faible}.` : '',
    ].filter(Boolean).join('\n');
  } catch { return ''; }
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function Badge({ qty }: { qty: number }) {
  if (qty >= 10) return <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 ml-1.5 whitespace-nowrap font-medium">✅ Très fiable</span>;
  if (qty >= 5)  return <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 ml-1.5 whitespace-nowrap font-medium">🟢 Fiable</span>;
  if (qty >= 3)  return <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 ml-1.5 whitespace-nowrap font-medium">🟡 Tendance</span>;
  return           <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 ml-1.5 whitespace-nowrap font-medium">🔴 Faible</span>;
}

const TH  = 'px-3 py-2.5 text-left  text-xs font-semibold text-[#6B7280] bg-[#F5F5F5] whitespace-nowrap';
const THR = 'px-3 py-2.5 text-right text-xs font-semibold text-[#6B7280] bg-[#F5F5F5] whitespace-nowrap';
const TD  = 'px-3 py-2 text-xs text-[#1A1A1A] border-t border-[#F0F0F0]';
const TDR = 'px-3 py-2 text-xs text-right text-[#1A1A1A] border-t border-[#F0F0F0]';

interface ColDef { label: string; right?: boolean; render: (s: ModelStats) => ReactNode; }

function SectionTable({ title, cnt, alert, rows, cols, emptyMsg, extra }: {
  title: string; cnt?: string; alert?: string;
  rows: ModelStats[]; cols: ColDef[]; emptyMsg?: string; extra?: ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-[#1A1A1A]">{title}</h3>
        {cnt && <span className="text-xs text-[#9CA3AF]">{cnt}</span>}
      </div>
      {alert && <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">{alert}</div>}
      {rows.length === 0 ? (
        <p className="text-xs text-[#9CA3AF] italic px-1">{emptyMsg ?? 'Aucun résultat.'}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
          <table className="text-xs w-full border-collapse">
            <thead><tr>{cols.map((c,i) => <th key={i} className={c.right?THR:TH}>{c.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((s,i) => (
                <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                  {cols.map((c,j) => <td key={j} className={c.right?TDR:TD}>{c.render(s)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {extra}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function JournalAchatVente({ magasinNom, onAddAction }: Props) {
  const [stored,   setStored]   = useState<StoredImport | null>(null);
  const [periode,  setPeriode]  = useState<Periode>('all');
  const [grade,    setGrade]    = useState('all');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [toast,    setToast]    = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem(`journal_analyse_${magasinNom}`);
      if (!s) { setStored(null); return; }
      const p = JSON.parse(s) as StoredImport;
      if (!Array.isArray(p.rows)) { localStorage.removeItem(`journal_analyse_${magasinNom}`); setStored(null); return; }
      setStored(p);
    } catch { setStored(null); }
  }, [magasinNom]);

  const processFile = useCallback(async (file: File) => {
    setLoading(true); setError(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
      if (!raw.length) throw new Error('Le fichier semble vide.');
      const colMap = mapColumns(Object.keys(raw[0]));
      if (!colMap.modele && !colMap.prixVente) throw new Error("Colonnes non reconnues. Vérifiez que c'est bien un export Athéna.");

      const rows: CRow[] = [];
      let dateMin: Date | null = null, dateMax: Date | null = null;

      for (const row of raw) {
        if (colMap.typeTransaction && !norm(String(row[colMap.typeTransaction]??'')).includes('vente')) continue;
        const pv = colMap.prixVente ? parseNum(row[colMap.prixVente]) : 0;
        if (pv <= 0) continue;
        const modele = colMap.modele ? String(row[colMap.modele]??'').trim() : '';
        if (!modele) continue;
        const g = colMap.grade ? String(row[colMap.grade]??'').trim().toUpperCase() : '';
        if (g === 'D') continue;

        const pa    = colMap.prixAchat ? parseNum(row[colMap.prixAchat]) : 0;
        const dvRaw = colMap.delaiVente ? row[colMap.delaiVente] : null;
        const dv    = dvRaw !== '' && dvRaw != null ? (parseNum(dvRaw) || null) : null;
        const dv2   = dv && dv > 0 ? dv : null;
        const dateV = colMap.dateVente ? parseDateVal(row[colMap.dateVente]) : null;
        const ep    = colMap.easypricePrixVente  ? (parseNum(row[colMap.easypricePrixVente])  || null) : null;
        const epa   = colMap.easypricePrixAchat  ? (parseNum(row[colMap.easypricePrixAchat])  || null) : null;
        const cvRaw = colMap.typeClientVendeur ? norm(String(row[colMap.typeClientVendeur]??'')) : '';
        const cv    = cvRaw.includes('particulier') ? 'P' : cvRaw.includes('fournisseur') ? 'F' : '';
        const fn    = colMap.clientVendeurNom    ? String(row[colMap.clientVendeurNom]   ??'').trim() : '';
        const fp    = colMap.clientVendeurPrenom ? String(row[colMap.clientVendeurPrenom]??'').trim() : '';
        const co    = colMap.collaborateur       ? String(row[colMap.collaborateur]      ??'').trim() : '';

        if (dateV) { if (!dateMin || dateV < dateMin) dateMin = dateV; if (!dateMax || dateV > dateMax) dateMax = dateV; }

        const r: CRow = { m: modele, f: colMap.famille ? String(row[colMap.famille]??'').trim() : '', g, d: dateV?.toISOString()??null, pa, pv, dv: dv2 };
        if (ep)  r.ep  = ep;
        if (epa) r.epa = epa;
        if (cv)  r.cv  = cv;
        if (fn)  r.fn  = fn;
        if (fp)  r.fp  = fp;
        if (co)  r.co  = co;
        rows.push(r);
      }

      if (!rows.length) throw new Error('Aucune vente valide (grades A/B/C) trouvée. Vérifiez la colonne "Type de transaction".');
      const result: StoredImport = { importedAt: new Date().toISOString(), rows, dateMin: dateMin?.toISOString()??null, dateMax: dateMax?.toISOString()??null };
      setStored(result);
      try { localStorage.setItem(`journal_analyse_${magasinNom}`, JSON.stringify(result)); } catch { /* quota */ }
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur inattendue.'); }
    finally { setLoading(false); }
  }, [magasinNom]);

  function handleFile(f: File | null | undefined) {
    if (!f) return;
    if (!['csv','xlsx','xls'].includes(f.name.split('.').pop()?.toLowerCase()??'')) { setError('Format non supporté. Utilisez .csv, .xlsx ou .xls.'); return; }
    processFile(f);
  }

  // ── computed ──────────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => stored ? filterRows(stored.rows, periode, grade) : [], [stored, periode, grade]);
  const stats        = useMemo(() => computeStats(filteredRows), [filteredRows]);

  // PARTIE A — 3 ventes min partout
  const MIN3 = (s: ModelStats) => s.qteVendue >= 3;

  const topRotations = useMemo(() => stats.filter(s => MIN3(s) && s.delaiMoyen !== null && s.delaiMoyen < 30).sort((a,b) => (a.delaiMoyen??999)-(b.delaiMoyen??999)), [stats]);
  const topMarge     = useMemo(() => [...stats].filter(MIN3).sort((a,b) => b.margeTotal-a.margeTotal).slice(0,20), [stats]);
  const topVolume    = useMemo(() => [...stats].filter(MIN3).sort((a,b) => b.qteVendue-a.qteVendue).slice(0,15), [stats]);
  const coherenceEP  = useMemo(() => stats.filter(s => MIN3(s) && s.ecartEP !== null && Math.abs(s.ecartEP) > 10).sort((a,b) => Math.abs(b.ecartEP!)-Math.abs(a.ecartEP!)), [stats]);
  // PARTIE F — two sub-categories
  const perteSeche      = useMemo(() => stats.filter(s => MIN3(s) && s.margeTotal < 0).sort((a,b) => a.margeTotal-b.margeTotal), [stats]);
  const faibleRendement = useMemo(() => stats.filter(s => MIN3(s) && s.margeUnitaire < 30 && s.delaiMoyen !== null && s.delaiMoyen > 90 && s.margeTotal >= 0).sort((a,b) => a.margeUnitaire-b.margeUnitaire), [stats]);

  const pepites = useMemo(() => {
    const rotSet = new Set(topRotations.filter(r => r.qteVendue >= 5).map(r => r.modele.toLowerCase()));
    return topMarge.filter(m => rotSet.has(m.modele.toLowerCase())).slice(0, 5);
  }, [topRotations, topMarge]);

  // PARTIE C, D, E — sourcing sections
  const hasSourcingData      = useMemo(() => filteredRows.some(r => r.cv === 'P' || r.cv === 'F'), [filteredRows]);
  const hasFournisseurData   = useMemo(() => filteredRows.some(r => r.cv === 'F' && r.fn), [filteredRows]);
  const hasCollaborateurData = useMemo(() => filteredRows.some(r => r.cv === 'P' && r.co), [filteredRows]);

  const sourcing     = useMemo(() => computeSourcing(filteredRows),    [filteredRows]);
  const fournisseurs = useMemo(() => computeFournisseurs(filteredRows), [filteredRows]);
  const acheteurs    = useMemo(() => computeAcheteurs(filteredRows),    [filteredRows]);

  // PARTIE B — global indicators
  const hasEPVente  = useMemo(() => stats.some(s => s.epMoyen  != null), [stats]);
  const hasEPAchat  = useMemo(() => stats.some(s => s.epaMoyen != null), [stats]);

  const globalEPVente = useMemo((): number | null => {
    const ms = stats.filter(s => s.epMoyen != null && s.epMoyen > 0);
    const tq = ms.reduce((s,m) => s+m.qteVendue, 0);
    return tq > 0 ? Math.round(ms.reduce((s,m) => s+((m.pvMoyen-m.epMoyen!)/m.epMoyen!*100)*m.qteVendue,0)/tq*10)/10 : null;
  }, [stats]);

  const globalEPAchat = useMemo((): number | null => {
    const ms = stats.filter(s => s.epaMoyen != null && s.epaMoyen > 0);
    const tq = ms.reduce((s,m) => s+m.qteVendue, 0);
    return tq > 0 ? Math.round(ms.reduce((s,m) => s+((m.paMoyen-m.epaMoyen!)/m.epaMoyen!*100)*m.qteVendue,0)/tq*10)/10 : null;
  }, [stats]);

  const topBrands = useMemo(() => {
    const brands = new Map<string, number>();
    for (const r of filteredRows) { const b = (r.m.trim().split(/\s+/)[0]||'—').toUpperCase(); brands.set(b,(brands.get(b)??0)+1); }
    const total = filteredRows.length;
    return total > 0 ? Array.from(brands.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([brand,count]) => ({ brand, count, pct: Math.round(count/total*100) })) : [];
  }, [filteredRows]);

  // PARTIE D — invest recap
  const investTotal = useMemo(() => topRotations.reduce((s,r) => s+r.paMoyen, 0), [topRotations]);

  // PAP action
  function addToPAP() {
    if (!onAddAction) return;
    const refs = [...topRotations.filter(r => r.qteVendue >= 5).slice(0,5), ...pepites.filter(p => !topRotations.filter(r=>r.qteVendue>=5).slice(0,5).some(r=>r.modele===p.modele)).slice(0,3)].map(r=>r.modele).join(', ') || '(voir module Journal achat-vente)';
    const ech = new Date(); ech.setDate(ech.getDate()+7);
    onAddAction({ id: Math.random().toString(36).slice(2), titre: 'Commander les références prioritaires', axe: 'Stock', pilote: 'Acheteur principal', copilote: '', description: `Commander cette semaine les références suivantes (issues de l'analyse Journal) : ${refs}`, echeance: ech.toISOString().slice(0,10), priorite: 1, gain: 0, statut: 'À faire' });
    setToast("✓ Action ajoutée au Plan d'Action. Échéance : dans 7 jours.");
    setTimeout(() => setToast(null), 4000);
  }

  const fmtD = (s: string | null) => s ? new Date(s).toLocaleDateString('fr-FR') : '?';
  const fmtE = (v: number) => `${v > 0 ? '+' : ''}${v}%`;
  const fmtK = (n: number) => n.toLocaleString('fr-FR');

  const modeleCol = (s: ModelStats) => (
    <span className="flex items-center flex-wrap max-w-[220px]">
      <span className="truncate font-medium">{s.modele}</span><Badge qty={s.qteVendue} />
    </span>
  );

  const showGlobal = stored && stats.length > 0 && (hasEPVente || hasEPAchat || topBrands.length > 0);

  // sourcing totals
  const srcTotal      = sourcing.reduce((s,r) => s+r.nbAchats, 0);
  const srcTotalMarge = sourcing.reduce((s,r) => s+r.margeTotal, 0);
  const srcPart       = sourcing.find(s => s.canal.includes('Particulier'));
  const srcFour       = sourcing.find(s => s.canal.includes('Fournisseur'));

  return (
    <div className="space-y-5">
      {toast && <div className="fixed top-4 right-4 z-[100] bg-green-600 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl">{toast}</div>}

      <h2 className="text-lg font-bold text-[#1A1A1A]">Journal achat-vente · {magasinNom || 'Magasin'}</h2>

      {/* Intro */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl px-4 py-3 space-y-1.5">
        <p className="text-sm text-[#6B7280]">Importez votre export Athéna du journal achat-vente (CSV ou Excel) pour identifier les modèles qui tournent vite, qui génèrent de la marge, et les écarts avec la cote réseau. La période couverte dépend de l&apos;export fourni.</p>
        <p className="text-xs text-[#9CA3AF] italic">L&apos;outil exclut systématiquement le grade D, les retours SAV (prix négatifs) et les données incomplètes. Seuls les modèles avec au minimum 3 ventes apparaissent dans les tableaux d&apos;analyse.</p>
      </div>

      {/* PARTIE B — Global indicators (neutral tone) */}
      {showGlobal && (
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">📈 Lecture globale magasin</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Bloc 1 — Politique vente */}
            {hasEPVente && globalEPVente != null && (
              <div className="rounded-lg p-3 border border-[#E0E0E0]">
                <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">💰 Politique vente vs cote EP</p>
                <p className={`text-xl font-black mb-1 ${globalEPVente < -5 ? 'text-red-600' : globalEPVente > 5 ? 'text-orange-500' : 'text-green-600'}`}>{fmtE(globalEPVente)}</p>
                <p className="text-xs text-[#6B7280]">
                  {globalEPVente < -5
                    ? `Vos prix de vente sont en moyenne ${Math.abs(globalEPVente)}% sous la cote réseau.`
                    : globalEPVente > 5
                      ? `Vos prix de vente sont en moyenne ${globalEPVente}% au-dessus de la cote réseau.`
                      : `Vos prix de vente sont alignés sur la cote réseau (écart ${fmtE(globalEPVente)}).`}
                </p>
              </div>
            )}

            {/* Bloc 2 — Politique achat */}
            {hasEPAchat && globalEPAchat != null && (
              <div className="rounded-lg p-3 border border-[#E0E0E0]">
                <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">🛒 Politique achat vs cote EP</p>
                <p className={`text-xl font-black mb-1 ${globalEPAchat > 5 ? 'text-orange-500' : globalEPAchat < -5 ? 'text-blue-600' : 'text-green-600'}`}>{fmtE(globalEPAchat)}</p>
                <p className="text-xs text-[#6B7280]">
                  {globalEPAchat > 5
                    ? `Vos prix d'achat sont en moyenne ${globalEPAchat}% au-dessus de la cote réseau.`
                    : globalEPAchat < -5
                      ? `Vos prix d'achat sont en moyenne ${Math.abs(globalEPAchat)}% sous la cote réseau.`
                      : `Vos prix d'achat sont alignés sur la cote réseau (écart ${fmtE(globalEPAchat)}).`}
                </p>
              </div>
            )}

            {/* Bloc 3 — Marques */}
            {topBrands.length > 0 && (
              <div className="rounded-lg p-3 border border-[#E0E0E0]">
                <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">🏷️ Répartition marques (top 5)</p>
                <div className="space-y-1.5">
                  {topBrands.map(b => (
                    <div key={b.brand} className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[#1A1A1A] w-14 truncate">{b.brand}</span>
                      <div className="flex-1 bg-[#F5F5F5] rounded-full h-1.5"><div className="bg-[#E30613] h-1.5 rounded-full" style={{ width: `${b.pct}%` }} /></div>
                      <span className="text-xs text-[#6B7280] w-8 text-right">{b.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-5">
        <div>
          <p className="text-xs text-[#6B7280] mb-1.5 font-medium">Période d&apos;analyse</p>
          <div className="flex gap-1.5 flex-wrap">
            {([['all','Toute la période'],['3m','3 mois'],['6m','6 mois'],['12m','12 mois']] as [Periode,string][]).map(([v,l]) => (
              <button key={v} onClick={()=>setPeriode(v)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${periode===v?'bg-[#E30613] text-white':'bg-white border border-[#E0E0E0] text-[#6B7280] hover:border-[#E30613] hover:text-[#E30613]'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-[#6B7280] mb-1.5 font-medium">Grade</p>
          <div className="flex gap-1.5">
            {[['all','Tous (A,B,C)'],['A','A'],['B','B'],['C','C']].map(([g,l]) => (
              <button key={g} onClick={()=>setGrade(g)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${grade===g?'bg-[#E30613] text-white':'bg-white border border-[#E0E0E0] text-[#6B7280] hover:border-[#E30613] hover:text-[#E30613]'}`}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}
        onClick={()=>fileRef.current?.click()}
        className={`cursor-pointer border-2 border-dashed rounded-xl px-6 py-8 text-center transition-all ${dragOver?'border-[#E30613] bg-[#FFF5F5]':'border-[#E0E0E0] bg-white hover:border-[#E30613] hover:bg-[#FFF5F5]'}`}>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e=>handleFile(e.target.files?.[0])} />
        {loading ? <div className="space-y-2"><div className="text-2xl animate-pulse">⏳</div><p className="text-sm text-[#6B7280]">Analyse en cours…</p></div>
          : <div className="space-y-2">
              <div className="text-3xl">📂</div>
              <p className="text-sm font-semibold text-[#1A1A1A]">Glissez votre fichier ici ou cliquez pour importer</p>
              <p className="text-xs text-[#9CA3AF]">.csv · .xlsx · .xls — Export Athéna journal achat-vente</p>
              {stored && <p className="text-xs text-[#6B7280] mt-1">Dernier import : {new Date(stored.importedAt).toLocaleDateString('fr-FR')} · {stored.rows.length.toLocaleString('fr-FR')} ventes (A/B/C)</p>}
            </div>}
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex gap-2"><span>⚠️</span><span>{error}</span></div>}
      {!stored && !loading && !error && <div className="bg-white border border-[#E0E0E0] rounded-xl px-6 py-12 text-center"><div className="text-4xl mb-3">📊</div><p className="text-sm font-semibold text-[#1A1A1A]">Aucune analyse encore</p><p className="text-xs text-[#6B7280] mt-1">Importez votre journal Athéna pour démarrer.</p></div>}
      {stored && !loading && stats.length === 0 && <div className="bg-white border border-[#E0E0E0] rounded-xl px-6 py-8 text-center"><p className="text-sm font-semibold text-[#1A1A1A]">Aucune donnée pour ces filtres</p><p className="text-xs text-[#6B7280] mt-1">Essayez une autre période ou un autre grade.</p></div>}

      {/* ── Results ── */}
      {stored && !loading && stats.length > 0 && (
        <div className="space-y-7">

          {/* Header */}
          <div className="bg-[#F5F5F5] rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center justify-between text-xs">
            <span className="text-[#6B7280]">
              Analyse : <strong className="text-[#1A1A1A]">{filteredRows.length.toLocaleString('fr-FR')} ventes</strong>
              {stored.dateMin && stored.dateMax && <> · {fmtD(stored.dateMin)} → {fmtD(stored.dateMax)}</>}
              {grade !== 'all' && <> · Grade {grade}</>}
            </span>
            <button onClick={()=>{localStorage.removeItem(`journal_analyse_${magasinNom}`);setStored(null);}} className="text-[#9CA3AF] hover:text-red-500 transition-colors">🗑 Effacer</button>
          </div>

          <p className="text-xs text-[#9CA3AF] italic">Seuls les modèles avec ≥ 3 ventes sont affichés dans les sections ci-dessous. La fiabilité est indiquée par un badge coloré.</p>

          {/* ── PARTIE C — Sourcing ── */}
          {hasSourcingData && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[#1A1A1A]">🛒 Sourcing : Particulier vs Fournisseur</h3>
              <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr>
                      {['Canal','Nb achats','Val. achats (€)','Val. ventes (€)','Marge totale (€)','Taux marge (%)','Délai moyen (j)'].map((l,i) => (
                        <th key={i} className={i===0?TH:THR}>{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sourcing.map((s, i) => (
                      <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                        <td className={TD}><span className="font-medium">{s.canal}</span></td>
                        <td className={TDR}>{fmtK(s.nbAchats)}</td>
                        <td className={TDR}>{fmtK(s.valeurAchats)} €</td>
                        <td className={TDR}>{fmtK(s.valeurVentes)} €</td>
                        <td className={TDR}><span className={s.margeTotal < 0 ? 'text-red-600 font-semibold' : ''}>{fmtK(s.margeTotal)} €</span></td>
                        <td className={TDR}>{s.tauxMarge} %</td>
                        <td className={TDR}>{s.delaiMoyen !== null ? `${s.delaiMoyen} j` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {srcTotal > 0 && (
                <div className="flex flex-wrap gap-4 text-xs text-[#6B7280]">
                  <span>Part sourcing comptoir : <strong className="text-[#1A1A1A]">{srcPart ? Math.round(srcPart.nbAchats/srcTotal*100) : 0}% des achats</strong> / <strong className="text-[#1A1A1A]">{srcTotalMarge > 0 && srcPart ? Math.round(srcPart.margeTotal/srcTotalMarge*100) : 0}% de la marge</strong></span>
                  <span>Part sourcing externe : <strong className="text-[#1A1A1A]">{srcFour ? Math.round(srcFour.nbAchats/srcTotal*100) : 0}% des achats</strong> / <strong className="text-[#1A1A1A]">{srcTotalMarge > 0 && srcFour ? Math.round(srcFour.margeTotal/srcTotalMarge*100) : 0}% de la marge</strong></span>
                </div>
              )}
            </div>
          )}

          {/* ── Section 1 — Top Rotations ── */}
          <SectionTable
            title="⚡ TOP ROTATIONS (délai moyen < 30 jours)"
            cnt={`${topRotations.length} modèle${topRotations.length!==1?'s':''} · min 3 ventes`}
            rows={topRotations}
            cols={[
              { label: 'Modèle',               render: modeleCol },
              { label: 'Famille',              render: s => s.famille||'—' },
              { label: 'Qté',    right: true,  render: s => s.qteVendue },
              { label: 'Délai',  right: true,  render: s => s.delaiMoyen!==null?`${s.delaiMoyen} j`:'—' },
              { label: 'Marge unit.', right: true, render: s => `${fmtK(s.margeUnitaire)} €` },
              { label: 'Marge totale', right: true, render: s => `${fmtK(s.margeTotal)} €` },
              { label: 'Investissement type', right: true, render: s => s.paMoyen>0?<span className="text-[#E30613] font-semibold">{fmtK(s.paMoyen)} € / u</span>:'—' },
            ]}
            emptyMsg="Aucun modèle (≥ 3 ventes) avec délai moyen < 30 jours sur cette période."
            extra={topRotations.length > 0 && investTotal > 0 ? (
              <div className="bg-[#FFF5F5] border border-[#FECACA] rounded-lg px-4 py-2.5 text-sm">
                <span className="font-semibold text-[#E30613]">💡 Investissement total pour 1 unité de chaque top rotation :</span>
                <span className="font-black text-[#1A1A1A] ml-2">{fmtK(investTotal)} €</span>
              </div>
            ) : null}
          />

          {/* ── Section 2 — Top Marge ── */}
          <SectionTable title="💰 TOP VENTES EN MARGE" cnt={`Top ${topMarge.length} · min 3 ventes`}
            rows={topMarge}
            cols={[
              { label: 'Modèle',        render: modeleCol },
              { label: 'Famille',       render: s => s.famille||'—' },
              { label: 'Qté', right: true, render: s => s.qteVendue },
              { label: 'Marge totale',  right: true, render: s => `${fmtK(s.margeTotal)} €` },
              { label: 'Marge unit.',   right: true, render: s => `${fmtK(s.margeUnitaire)} €` },
              { label: 'Délai moyen',   right: true, render: s => s.delaiMoyen!==null?`${s.delaiMoyen} j`:'—' },
            ]}
          />

          {/* ── Section 3 — Top Volume ── */}
          <SectionTable title="📦 TOP VENTES EN VOLUME" cnt={`Top ${topVolume.length} · min 3 ventes`}
            rows={topVolume}
            cols={[
              { label: 'Modèle',        render: modeleCol },
              { label: 'Famille',       render: s => s.famille||'—' },
              { label: 'Qté', right: true, render: s => s.qteVendue },
              { label: 'Délai moyen',   right: true, render: s => s.delaiMoyen!==null?`${s.delaiMoyen} j`:'—' },
              { label: 'Marge totale',  right: true, render: s => `${fmtK(s.margeTotal)} €` },
              { label: 'Marge unit.',   right: true, render: s => `${fmtK(s.margeUnitaire)} €` },
            ]}
          />

          {/* ── PARTIE D — Top Fournisseurs ── */}
          {hasFournisseurData && fournisseurs.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-sm font-bold text-[#1A1A1A]">🏪 Top fournisseurs externes <span className="text-xs font-normal text-[#9CA3AF]">min 3 produits</span></h3>
              <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr>{['Fournisseur','Nb produits','Val. achats (€)','Marge totale (€)','Taux marge (%)','Délai moyen (j)'].map((l,i)=>(
                      <th key={i} className={i===0?TH:THR}>{l}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {fournisseurs.map((f,i) => (
                      <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                        <td className={TD}><span className="font-medium">{f.nom}</span></td>
                        <td className={TDR}>{f.nbProduits}</td>
                        <td className={TDR}>{fmtK(f.valeurAchats)} €</td>
                        <td className={TDR}><span className={f.margeTotal>0?'text-green-700 font-semibold':'text-red-600 font-semibold'}>{fmtK(f.margeTotal)} €</span></td>
                        <td className={TDR}>{f.tauxMarge} %</td>
                        <td className={TDR}>{f.delaiMoyen!==null?`${f.delaiMoyen} j`:'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-[#9CA3AF] italic px-1">Ces fournisseurs sont classés par marge totale générée sur la période. Le taux de marge est calculé sur les ventes réalisées des produits issus de ce fournisseur.</p>
            </div>
          )}

          {/* ── PARTIE E — Performance acheteurs ── */}
          {hasCollaborateurData && acheteurs.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-sm font-bold text-[#1A1A1A]">👥 Performance acheteurs magasin <span className="text-xs font-normal text-[#9CA3AF]">achats comptoir · min 5 achats</span></h3>
              <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr>{['Acheteur','Nb achats','Val. achats (€)','Marge totale (€)','Taux marge (%)','Écart EP achat (%)','Délai moyen (j)'].map((l,i)=>(
                      <th key={i} className={i===0?TH:THR}>{l}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {acheteurs.map((a,i) => (
                      <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                        <td className={TD}><span className="font-medium">{a.nom}</span></td>
                        <td className={TDR}>{a.nbAchats}</td>
                        <td className={TDR}>{fmtK(a.valeurAchats)} €</td>
                        <td className={TDR}>{fmtK(a.margeTotal)} €</td>
                        <td className={TDR}><span className={a.tauxMarge>=40?'text-green-600 font-semibold':a.tauxMarge>=30?'':'text-orange-500'}>{a.tauxMarge} %</span></td>
                        <td className={TDR}>{a.ecartEPAchat!==null?<span className={Math.abs(a.ecartEPAchat)<=5?'text-green-600':`text-orange-500`}>{fmtE(a.ecartEPAchat)}</span>:'—'}</td>
                        <td className={TDR}>{a.delaiMoyen!==null?`${a.delaiMoyen} j`:'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-[#6B7280]">
                <span>🏆 Meilleur taux de marge : <strong className="text-[#1A1A1A]">{acheteurs[0].nom}</strong> avec <strong>{acheteurs[0].tauxMarge}%</strong></span>
                {acheteurs.filter(a=>a.ecartEPAchat!==null).sort((a,b)=>Math.abs(a.ecartEPAchat!)-Math.abs(b.ecartEPAchat!))[0] && (() => {
                  const best = acheteurs.filter(a=>a.ecartEPAchat!==null).sort((a,b)=>Math.abs(a.ecartEPAchat!)-Math.abs(b.ecartEPAchat!))[0];
                  return <span>🎯 Plus aligné sur la cote réseau : <strong className="text-[#1A1A1A]">{best.nom}</strong> avec un écart moyen de <strong>{fmtE(best.ecartEPAchat!)}</strong></span>;
                })()}
              </div>
              <p className="text-xs text-[#9CA3AF] italic px-1">Ces données aident à identifier les acheteurs qui appliquent le mieux la VPD et qui maîtrisent la cote EasyPrice. À mobiliser pour le coaching et la formation interne.</p>
            </div>
          )}

          {/* ── PARTIE F — Perte sèche ── */}
          {perteSeche.length > 0 && (
            <SectionTable
              title="🔴 Perte sèche"
              cnt={`${perteSeche.length} modèle${perteSeche.length!==1?'s':''} · min 3 ventes`}
              alert="Ces modèles vous font perdre de l'argent sur la période. À investiguer en priorité : prix d'achat trop élevé, prix de vente cassé, ou problème de grading."
              rows={perteSeche}
              cols={[
                { label: 'Modèle',      render: modeleCol },
                { label: 'Qté', right: true, render: s => s.qteVendue },
                { label: 'PA moy.', right: true, render: s => `${fmtK(s.paMoyen)} €` },
                { label: 'PV moy.', right: true, render: s => `${fmtK(s.pvMoyen)} €` },
                { label: 'Marge unit.', right: true, render: s => <span className="text-red-600 font-semibold">{fmtK(s.margeUnitaire)} €</span> },
                { label: 'Marge totale', right: true, render: s => <span className="text-red-600 font-semibold">{fmtK(s.margeTotal)} €</span> },
              ]}
            />
          )}

          {/* ── PARTIE F — Faible rendement ── */}
          {faibleRendement.length > 0 && (
            <SectionTable
              title="🟡 Faible rendement"
              cnt={`${faibleRendement.length} modèle${faibleRendement.length!==1?'s':''} · min 3 ventes`}
              alert="Ces modèles rapportent peu de marge unitaire (< 30 €) et mobilisent du cash longtemps (délai > 90j). Combo perdant : à arbitrer — augmenter la marge ou éviter d'en acheter au comptoir."
              rows={faibleRendement}
              cols={[
                { label: 'Modèle',      render: modeleCol },
                { label: 'Qté', right: true, render: s => s.qteVendue },
                { label: 'Délai moyen', right: true, render: s => s.delaiMoyen!==null?<span className="text-orange-500">{s.delaiMoyen} j</span>:'—' },
                { label: 'Marge unit.', right: true, render: s => <span className="text-orange-500">{fmtK(s.margeUnitaire)} €</span> },
                { label: 'Marge totale', right: true, render: s => `${fmtK(s.margeTotal)} €` },
              ]}
            />
          )}

          {/* ── Section 5 — Cohérence EP ── */}
          {hasEPVente && (
            <SectionTable
              title="💡 Cohérence prix EasyPrice"
              cnt={coherenceEP.length > 0 ? `${coherenceEP.length} modèle${coherenceEP.length!==1?'s':''} avec écart > 10% · min 3 ventes` : undefined}
              alert="Seuls les modèles avec un écart absolu > 10% vs la cote réseau sont affichés."
              rows={coherenceEP}
              cols={[
                { label: 'Modèle',      render: modeleCol },
                { label: 'Qté', right: true, render: s => s.qteVendue },
                { label: 'PV moyen',    right: true, render: s => `${fmtK(s.pvMoyen)} €` },
                { label: 'Cote EP (B)', right: true, render: s => s.epMoyen!=null?`${fmtK(s.epMoyen)} €`:'—' },
                { label: 'Écart %',     right: true, render: s => s.ecartEP===null?'—':<span className={s.ecartEP<0?'text-red-600 font-semibold':'text-orange-500 font-semibold'}>{fmtE(s.ecartEP)}</span> },
                { label: 'Statut',      render: s => s.ecartEP===null?'—':s.ecartEP<0?<span className="text-red-600 font-semibold">🔴 Sous-évalué</span>:<span className="text-orange-500 font-semibold">🟠 Sur-évalué</span> },
              ]}
              emptyMsg="✓ Aucun écart significatif (> 10%) vs cote EasyPrice sur cette période."
            />
          )}

          {/* ── Synthesis ── */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#1A1A1A]">🎯 Recommandations stratégiques</h3>
            <ul className="space-y-2.5 text-sm">
              <li><span className="font-semibold text-[#1A1A1A]">⚡ Rotation rapide (&lt; 30j, 🟢 ou ✅) :</span>{' '}<span className="text-[#6B7280]">{topRotations.filter(r=>r.qteVendue>=5).slice(0,5).map(r=>`${r.modele} (${r.delaiMoyen}j)`).join(', ')||'Aucun modèle fiable sur cette période.'}</span></li>
              <li><span className="font-semibold text-[#1A1A1A]">💰 Plus forte marge cumulée :</span>{' '}<span className="text-[#6B7280]">{topMarge.slice(0,5).map(m=>`${m.modele} (${fmtK(m.margeTotal)} €)`).join(', ')||'Aucune donnée.'}</span></li>
              <li><span className="font-semibold text-[#E30613]">💎 Pépites locales :</span>{' '}<span className="text-[#6B7280]">{pepites.length>0?pepites.map(p=>p.modele).join(', '):'Aucune pépite détectée — élargissez la période.'}</span></li>
              {perteSeche.length>0 && <li><span className="font-semibold text-red-600">🔴 Perte sèche :</span>{' '}<span className="text-[#6B7280]">{perteSeche.slice(0,3).map(t=>t.modele).join(', ')}</span></li>}
              {faibleRendement.length>0 && <li><span className="font-semibold text-yellow-600">🟡 Faible rendement :</span>{' '}<span className="text-[#6B7280]">{faibleRendement.slice(0,3).map(t=>t.modele).join(', ')}</span></li>}
              {coherenceEP.length>0 && <li><span className="font-semibold text-[#1A1A1A]">💡 Écarts prix EP (&gt; 10%) :</span>{' '}<span className="text-[#6B7280]">{coherenceEP.slice(0,3).map(e=>`${e.modele} (${fmtE(e.ecartEP!)})`).join(', ')}</span></li>}
            </ul>
            <div className="bg-[#FFF5F5] border border-[#FECACA] rounded-lg px-4 py-3 text-xs text-[#1A1A1A]">
              <strong>Action prioritaire :</strong> intégrer les pépites locales fiables dans votre gamme prioritaire. Croisez avec le module <strong>Couverture de gamme</strong>.
            </div>
            {onAddAction && (
              <button onClick={addToPAP} className="w-full bg-[#E30613] hover:bg-[#B8050F] text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors">
                📋 Ajouter au Plan d&apos;Action
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
