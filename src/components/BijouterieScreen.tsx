'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  magasinNom: string;
  onNavigateToJournal?: () => void;
}

// ── Compact row after parsing ─────────────────────────────────────────────────
interface BijRow {
  lib: string;        // best libellé (achat ou fichetech)
  sf: string;         // sous-famille
  g: string;          // grade A/B/C/D
  pa: number;         // prix achat
  pv: number;         // prix vente
  poids: number|null; // poids extrait (g), null si non trouvé
  titre: string;      // ex. '18 carats (750)' ou 'Titre inconnu'
  canal: string;      // 'Fonte' (grade D) ou 'Vitrine'
}

// ── Computed aggregation row ──────────────────────────────────────────────────
interface AggRow {
  label: string;
  qty: number;
  poidsTotal: number;
  va: number; vv: number; marge: number;
  prixMoyen: number|null;
  tauxMarge: number;
}

// ── Column aliases (alias-priority aware) ─────────────────────────────────────
const ALIASES: Record<string, string[]> = {
  typeTransaction:  ['typedetransaction','typetransaction','transaction'],
  famille:          ['sousfamille','sousfamilleproduit','famille','familleproduit'],
  achatLibelle:     ['achatlibellearticle','libellearticle'],
  fichetechLibelle: ['fichetechlibelle','fichetech','modele','libelle'],
  grade:            ['articlegrade','grade','gradearticle'],
  prixAchat:        ['achatprix','prixachat','prixdachat'],
  prixVente:        ['venteprixvendu','prixvente','prixvendu'],
};

function norm(s: string): string {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[\s_\-'"]/g,'');
}
function mapCols(headers: string[]): Record<string,string> {
  const res: Record<string,string>={}, best: Record<string,number>={};
  for (const h of headers) {
    const n=norm(h);
    for (const [field,aliases] of Object.entries(ALIASES)) {
      const idx=aliases.indexOf(n);
      if (idx>=0&&(!(field in res)||idx<best[field])) { res[field]=h; best[field]=idx; }
    }
  }
  return res;
}
function parseNum(v: unknown): number {
  if (typeof v==='number') return v;
  const n=parseFloat(String(v??'').replace(',','.').replace(/[^\d.\-]/g,''));
  return isNaN(n)?0:n;
}
function getBestLibelle(achat: string, fichetech: string): string {
  const a=achat.trim(), f=fichetech.trim();
  if (!a||a.length<10) return f||a;
  if (/^\d+$/.test(a)) return f||a;
  return a;
}
function detectTitreOr(lib: string): string {
  if (!lib) return 'Titre inconnu';
  const u=lib.toUpperCase();
  if (u.includes('999/1000')||u.includes('999 /1000')) return '24 carats (999)';
  if (u.includes('916/1000')||u.includes('916 /1000')) return '22 carats (916)';
  if (u.includes('900/1000')||u.includes('900 /1000')) return '22 carats pièces (900)';
  if (u.includes('750/1000')||u.includes('750 /1000')) return '18 carats (750)';
  if (u.includes('585/1000')||u.includes('585 /1000')) return '14 carats (585)';
  if (u.includes('375/1000')||u.includes('375 /1000')) return '9 carats (375)';
  return 'Titre inconnu';
}
function extractPoids(lib: string): number|null {
  if (!lib) return null;
  const m=lib.toUpperCase().match(/(\d+[,.]?\d*)\s+G(?:\s|$|,|\.)/);
  if (!m) return null;
  const v=parseFloat(m[1].replace(',','.'));
  return isNaN(v)||v<=0||v>1000?null:v;
}
function isBijFamily(sf: string): boolean {
  const s=sf.toLowerCase();
  return s.includes('bijouterie or')||s.includes('plaqu')||s.includes('pierres')||s.includes('bopi');
}

// Fixed sort order for titres
const TITRE_ORDER=['18 carats (750)','14 carats (585)','9 carats (375)',
  '22 carats pièces (900)','22 carats (916)','24 carats (999)','Titre inconnu'];

// Titres for which we split by canal in section 4
const TITRES_WITH_CANAL=['18 carats (750)','14 carats (585)','9 carats (375)'];

// ── Shared table styles ───────────────────────────────────────────────────────
const TH  = 'px-3 py-2.5 text-left   text-xs font-semibold text-[#6B7280] bg-[#F5F5F5] whitespace-nowrap';
const THR = 'px-3 py-2.5 text-right  text-xs font-semibold text-[#6B7280] bg-[#F5F5F5] whitespace-nowrap';
const TD  = 'px-3 py-2   text-xs text-[#1A1A1A] border-t border-[#F0F0F0]';
const TDR = 'px-3 py-2   text-xs text-right text-[#1A1A1A] border-t border-[#F0F0F0]';

// ── aggregate helper ──────────────────────────────────────────────────────────
function buildAgg(rows: BijRow[], label: string): AggRow {
  const va=Math.round(rows.reduce((s,r)=>s+r.pa,0));
  const vv=Math.round(rows.reduce((s,r)=>s+r.pv,0));
  const marge=vv-va;
  const poidsArr=rows.flatMap(r=>r.poids!=null?[r.poids]:[]);
  const poidsTotal=Math.round(poidsArr.reduce((s,v)=>s+v,0)*100)/100;
  return {
    label, qty:rows.length, poidsTotal, va, vv, marge,
    prixMoyen: poidsTotal>0?Math.round(va/poidsTotal*100)/100:null,
    tauxMarge: vv>0?Math.round(marge/vv*100):0,
  };
}

// ── Context for AI (exported) ─────────────────────────────────────────────────
export function getBijouterieContext(magasinNom: string): string {
  try {
    const raw=localStorage.getItem(`bij_summary_${magasinNom}`);
    if (!raw) return '';
    return raw;
  } catch { return ''; }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BijouterieScreen({ magasinNom, onNavigateToJournal }: Props) {
  const [rows,     setRows]     = useState<BijRow[]>([]);
  const [cookson,  setCookson]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string|null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fmtK = (n: number) => n.toLocaleString('fr-FR');

  // Persist Cookson
  useEffect(()=>{
    try { const v=localStorage.getItem('cookson_cours_jour'); if(v) setCookson(v); } catch {}
  },[]);
  useEffect(()=>{
    try {
      if (cookson) localStorage.setItem('cookson_cours_jour',cookson);
      else localStorage.removeItem('cookson_cours_jour');
    } catch {}
  },[cookson]);

  // Parse file
  const processFile = useCallback(async (file: File)=>{
    setLoading(true); setError(null);
    try {
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(new Uint8Array(buf),{type:'array',cellDates:true});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const raw=XLSX.utils.sheet_to_json(ws,{defval:''}) as Record<string,unknown>[];
      if (!raw.length) throw new Error('Le fichier semble vide.');
      const col=mapCols(Object.keys(raw[0]));
      const result: BijRow[]=[];
      for (const row of raw) {
        if (col.typeTransaction&&!norm(String(row[col.typeTransaction]??'')).includes('vente')) continue;
        const pv=col.prixVente?parseNum(row[col.prixVente]):0;
        if (pv<=0) continue;
        const sf=col.famille?String(row[col.famille]??'').trim():'';
        if (!isBijFamily(sf)) continue;
        const achatLib =col.achatLibelle    ?String(row[col.achatLibelle]    ??'').trim():'';
        const fichLib  =col.fichetechLibelle?String(row[col.fichetechLibelle]??'').trim():'';
        const lib=getBestLibelle(achatLib,fichLib);
        const g=col.grade?String(row[col.grade]??'').trim().toUpperCase():'';
        const pa=col.prixAchat?parseNum(row[col.prixAchat]):0;
        result.push({
          lib, sf, g, pa, pv,
          poids: extractPoids(lib),
          titre: detectTitreOr(lib),
          canal: g==='D'?'Fonte':'Vitrine',
        });
      }
      if (!result.length) throw new Error('Aucune ligne bijouterie détectée dans le journal importé. Importez un journal contenant des familles BOR ou BOPI.');
      setRows(result);
    } catch(e){ setError(e instanceof Error?e.message:'Erreur inattendue.'); }
    finally { setLoading(false); }
  },[]);

  function handleFile(f: File|null|undefined) {
    if (!f) return;
    if (!['csv','xlsx','xls'].includes(f.name.split('.').pop()?.toLowerCase()??'')) {
      setError('Format non supporté. Utilisez .csv, .xlsx ou .xls.'); return;
    }
    processFile(f);
  }

  // ── Cookson ───────────────────────────────────────────────────────────────
  const cooksonNum=parseFloat(cookson.replace(',','.'));
  const hasCookson=!isNaN(cooksonNum)&&cooksonNum>0;

  // ── Overview ──────────────────────────────────────────────────────────────
  const overview = useMemo(()=>{
    if (!rows.length) return null;
    const poidsArr=rows.flatMap(r=>r.poids!=null?[r.poids]:[]);
    const va=Math.round(rows.reduce((s,r)=>s+r.pa,0));
    const vv=Math.round(rows.reduce((s,r)=>s+r.pv,0));
    const marge=vv-va;
    return {
      count:rows.length,
      poidsTotal:Math.round(poidsArr.reduce((s,v)=>s+v,0)*100)/100,
      lignesAvecPoids:poidsArr.length,
      va, vv, marge,
      tauxMarge:vv>0?Math.round(marge/vv*100):0,
    };
  },[rows]);

  // ── By titre ──────────────────────────────────────────────────────────────
  const byTitre = useMemo(()=>{
    const g=new Map<string,BijRow[]>();
    for (const r of rows) { if (!g.has(r.titre)) g.set(r.titre,[]); g.get(r.titre)!.push(r); }
    return Array.from(g.entries())
      .map(([titre,rs])=>buildAgg(rs,titre))
      .sort((a,b)=>{
        const ai=TITRE_ORDER.indexOf(a.label), bi=TITRE_ORDER.indexOf(b.label);
        return (ai<0?99:ai)-(bi<0?99:bi);
      });
  },[rows]);

  // ── By canal ─────────────────────────────────────────────────────────────
  const byCanal = useMemo(()=>{
    const g=new Map<string,BijRow[]>();
    for (const r of rows) { if (!g.has(r.canal)) g.set(r.canal,[]); g.get(r.canal)!.push(r); }
    return ['Fonte','Vitrine']
      .filter(c=>g.has(c))
      .map(c=>buildAgg(g.get(c)!,c));
  },[rows]);

  const fonteRow   = byCanal.find(r=>r.label==='Fonte');
  const vitrineRow = byCanal.find(r=>r.label==='Vitrine');
  const poidsFonteTotal   = fonteRow?.poidsTotal??0;
  const poidsVitrineTotal = vitrineRow?.poidsTotal??0;
  const poidsGrandTotal   = poidsFonteTotal+poidsVitrineTotal;
  const tauxFonte = poidsGrandTotal>0?Math.round(poidsFonteTotal/poidsGrandTotal*100):null;
  const diffPrixVF = vitrineRow?.prixMoyen!=null&&fonteRow?.prixMoyen!=null
    ? Math.round((vitrineRow.prixMoyen-fonteRow.prixMoyen)*100)/100 : null;

  // ── Croisement titre × canal ──────────────────────────────────────────────
  const byTitreCanal = useMemo(()=>{
    // Main titres split by canal
    const grouped=new Map<string,BijRow[]>();
    const autresRows: BijRow[]=[];
    for (const r of rows) {
      if (TITRES_WITH_CANAL.includes(r.titre)) {
        const key=`${r.titre}|||${r.canal}`;
        if (!grouped.has(key)) grouped.set(key,[]);
        grouped.get(key)!.push(r);
      } else {
        autresRows.push(r);
      }
    }
    const result: (AggRow&{titre:string;canal:string})[]=[];
    for (const [key,rs] of grouped.entries()) {
      const [titre,canal]=key.split('|||');
      result.push({...buildAgg(rs,`${titre} — ${canal}`),titre,canal});
    }
    result.sort((a,b)=>{
      const ai=TITRE_ORDER.indexOf(a.titre), bi=TITRE_ORDER.indexOf(b.titre);
      const ti=(ai<0?99:ai)-(bi<0?99:bi);
      if (ti!==0) return ti;
      return (a.canal==='Fonte'?0:1)-(b.canal==='Fonte'?0:1);
    });
    if (autresRows.length>0) {
      result.push({...buildAgg(autresRows,'Autres titres (22k, 24k, inconnus…)'),titre:'',canal:''});
    }
    return result;
  },[rows]);

  // Cookson écart for 18k Fonte
  const ecart18Fonte = useMemo(()=>{
    if (!hasCookson) return null;
    const r=byTitreCanal.find(r=>r.titre==='18 carats (750)'&&r.canal==='Fonte');
    if (!r?.prixMoyen) return null;
    return Math.round((r.prixMoyen-cooksonNum)/cooksonNum*100);
  },[byTitreCanal,hasCookson,cooksonNum]);
  const ecart18Vitrine = useMemo(()=>{
    if (!hasCookson) return null;
    const r=byTitreCanal.find(r=>r.titre==='18 carats (750)'&&r.canal==='Vitrine');
    if (!r?.prixMoyen) return null;
    return Math.round((r.prixMoyen-cooksonNum)/cooksonNum*100);
  },[byTitreCanal,hasCookson,cooksonNum]);

  // ── Persist AI summary ────────────────────────────────────────────────────
  useEffect(()=>{
    if (!overview||!magasinNom) return;
    const titre18 = byTitre.find(r=>r.label==='18 carats (750)');
    const titre14 = byTitre.find(r=>r.label==='14 carats (585)');
    const titre9  = byTitre.find(r=>r.label==='9 carats (375)');
    const lines=[
      `Analyse Bijouterie spécialisée — ${overview.count} articles · poids total ${overview.poidsTotal} g`,
      `Valeur d'achat : ${fmtK(overview.va)} € · Valeur de vente : ${fmtK(overview.vv)} € · Marge : ${fmtK(overview.marge)} € (${overview.tauxMarge}%)`,
      titre18?`18 carats : ${titre18.qty} articles · ${titre18.poidsTotal} g · prix moyen ${titre18.prixMoyen??'—'} €/g`:'',
      titre14?`14 carats : ${titre14.qty} articles · ${titre14.poidsTotal} g · prix moyen ${titre14.prixMoyen??'—'} €/g`:'',
      titre9 ?`9 carats : ${titre9.qty} articles · ${titre9.poidsTotal} g · prix moyen ${titre9.prixMoyen??'—'} €/g`:'',
      tauxFonte!=null?`Taux de fonte : ${tauxFonte}% — ${tauxFonte<30?'orienté vitrine':tauxFonte<=60?'équilibre':'orienté fonte'}`:'',
      fonteRow?.prixMoyen!=null?`Prix moyen 18k Fonte : ${fonteRow.prixMoyen} €/g`:'',
      vitrineRow?.prixMoyen!=null?`Prix moyen 18k Vitrine : ${vitrineRow.prixMoyen} €/g`:'',
      diffPrixVF!=null?`Différentiel Vitrine vs Fonte : ${diffPrixVF>0?'+':''}${diffPrixVF} €/g`:'',
      hasCookson&&ecart18Fonte!=null?`Écart vs cours Cookson (${cooksonNum} €/g) sur 18k Fonte : ${ecart18Fonte>0?'+':''}${ecart18Fonte}%`:'',
    ].filter(Boolean).join('\n');
    try { localStorage.setItem(`bij_summary_${magasinNom}`,lines); } catch {}
  },[overview,byTitre,tauxFonte,fonteRow,vitrineRow,diffPrixVF,hasCookson,ecart18Fonte,cooksonNum,magasinNom,fmtK]);

  // ── Shared components ─────────────────────────────────────────────────────
  function AggTable({ rows: aggRows, extraHeader, extraCell }: {
    rows: AggRow[];
    extraHeader?: string;
    extraCell?: (r: AggRow) => React.ReactNode;
  }) {
    if (!aggRows.length) return <p className="text-xs text-[#9CA3AF] italic">Aucune donnée.</p>;
    return (
      <div className="overflow-x-auto rounded-lg border border-[#E0E0E0]">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>Segment</th>
              <th className={THR}>Qté</th>
              <th className={THR}>Poids (g)</th>
              <th className={THR}>Val. achat (€)</th>
              <th className={THR}>Prix moy. (€/g)</th>
              <th className={THR}>Val. vente (€)</th>
              <th className={THR}>Marge (€)</th>
              <th className={THR}>Taux marge</th>
              {extraHeader&&<th className={THR}>{extraHeader}</th>}
            </tr>
          </thead>
          <tbody>
            {aggRows.map((r,i)=>(
              <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                <td className={TD}><span className="font-medium">{r.label}</span></td>
                <td className={TDR}>{r.qty}</td>
                <td className={TDR}>{r.poidsTotal>0?`${r.poidsTotal} g`:'—'}</td>
                <td className={TDR}>{fmtK(r.va)} €</td>
                <td className={TDR}>{r.prixMoyen!=null?`${fmtK(r.prixMoyen)} €/g`:'—'}</td>
                <td className={TDR}>{fmtK(r.vv)} €</td>
                <td className={TDR}><span className={r.marge<0?'text-red-600 font-semibold':''}>{fmtK(r.marge)} €</span></td>
                <td className={TDR}><span className={r.tauxMarge<10?'text-red-600':r.tauxMarge>=25?'text-green-600':''}>{r.tauxMarge}%</span></td>
                {extraHeader&&<td className={TDR}>{extraCell?.(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-[#1A1A1A]">💍 Bijouterie · {magasinNom||'Magasin'}</h2>
          <p className="text-xs text-[#9CA3AF] mt-0.5">Analyse spécialisée BOR/BOPI — titres carats, canal Fonte vs Vitrine, prix au gramme</p>
        </div>
        {onNavigateToJournal&&(
          <button onClick={onNavigateToJournal}
            className="text-xs text-[#E30613] border border-[#E30613] rounded-lg px-3 py-1.5 hover:bg-[#FFF5F5] transition-colors">
            ← Journal achat-vente
          </button>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e=>{e.preventDefault();setDragOver(true);}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}
        onClick={()=>fileRef.current?.click()}
        className={`cursor-pointer border-2 border-dashed rounded-xl px-6 py-8 text-center transition-all
          ${dragOver?'border-[#E30613] bg-[#FFF5F5]':'border-[#E0E0E0] bg-white hover:border-[#E30613] hover:bg-[#FFF5F5]'}`}
      >
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
          onChange={e=>handleFile(e.target.files?.[0])} />
        {loading
          ? <div className="space-y-2"><div className="text-2xl animate-pulse">⏳</div><p className="text-sm text-[#6B7280]">Analyse en cours…</p></div>
          : <div className="space-y-2">
              <div className="text-3xl">💍</div>
              <p className="text-sm font-semibold text-[#1A1A1A]">Glissez votre journal Athéna ici ou cliquez pour importer</p>
              <p className="text-xs text-[#9CA3AF]">.csv · .xlsx · .xls — seules les familles BOR/BOPI sont analysées</p>
              {rows.length>0&&<p className="text-xs text-[#6B7280] mt-1">{rows.length} lignes bijouterie en mémoire</p>}
            </div>
        }
      </div>

      {error&&(
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex gap-2">
          <span>⚠️</span><span>{error}</span>
        </div>
      )}

      {!rows.length&&!loading&&!error&&(
        <div className="bg-white border border-[#E0E0E0] rounded-xl px-6 py-12 text-center">
          <div className="text-4xl mb-3">💍</div>
          <p className="text-sm font-semibold text-[#1A1A1A]">Aucune analyse encore</p>
          <p className="text-xs text-[#6B7280] mt-1">Importez un journal Athéna contenant des familles BOR ou BOPI.</p>
        </div>
      )}

      {rows.length>0&&overview&&(
        <div className="space-y-8">

          {/* ── SECTION 1 — Vue d'ensemble ─────────────────────────────── */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#1A1A1A]">📊 Vue d'ensemble</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                {label:'Lignes analysées',      value:overview.count.toLocaleString('fr-FR'),       sub:`(${overview.lignesAvecPoids} avec poids extrait)`},
                {label:'Poids total racheté',   value:`${overview.poidsTotal} g`,                   sub:''},
                {label:'Valeur d\'achat',        value:`${fmtK(overview.va)} €`,                    sub:''},
                {label:'Valeur de vente',        value:`${fmtK(overview.vv)} €`,                    sub:''},
                {label:'Marge totale',           value:`${fmtK(overview.marge)} €`,                 sub:'',
                  color:overview.marge<0?'text-red-600':'text-green-600'},
                {label:'Taux de marge moyen',   value:`${overview.tauxMarge}%`,                     sub:'',
                  color:overview.tauxMarge<10?'text-red-600':overview.tauxMarge>=25?'text-green-600':'text-[#1A1A1A]'},
              ].map((kpi,i)=>(
                <div key={i} className="rounded-lg border border-[#E0E0E0] p-3">
                  <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">{kpi.label}</p>
                  <p className={`text-lg font-black leading-tight ${kpi.color??'text-[#1A1A1A]'}`}>{kpi.value}</p>
                  {kpi.sub&&<p className="text-[10px] text-[#9CA3AF] mt-0.5">{kpi.sub}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* ── SECTION 2 — Répartition par titre d'or ──────────────────── */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#1A1A1A]">🏷️ Répartition par titre d&apos;or</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">Détection via &quot;XXX/1000&quot; dans le libellé</p>
            </div>
            <AggTable rows={byTitre} />
            {byTitre.find(r=>r.label==='Titre inconnu')&&(
              <p className="text-xs text-orange-600 italic">
                ⚠️ {byTitre.find(r=>r.label==='Titre inconnu')!.qty} ligne(s) sans titre détecté —
                vérifiez que le libellé contient bien &quot;750/1000&quot;, &quot;585/1000&quot;, etc.
              </p>
            )}
          </div>

          {/* ── SECTION 3 — Canal Fonte vs Vitrine ──────────────────────── */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#1A1A1A]">🏪 Canal Fonte vs Vitrine</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">Grade D = Fonte · Grade A/B/C = Vitrine</p>
            </div>
            <AggTable rows={byCanal} />
            {/* Synthetic indicators */}
            {(tauxFonte!=null||diffPrixVF!=null)&&(
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {tauxFonte!=null&&(
                  <div className="rounded-lg border border-[#E0E0E0] p-3">
                    <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">
                      Taux de fonte sur poids racheté
                    </p>
                    <p className="text-2xl font-black text-[#1A1A1A] mb-1">{tauxFonte}%</p>
                    <p className="text-xs text-[#6B7280]">
                      {tauxFonte<30?'🏬 Magasin orienté vitrine':tauxFonte<=60?'⚖️ Équilibre vitrine / fonte':'🔥 Magasin orienté fonte'}
                    </p>
                  </div>
                )}
                {diffPrixVF!=null&&(
                  <div className="rounded-lg border border-[#E0E0E0] p-3">
                    <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">
                      Différentiel prix au gramme Vitrine vs Fonte
                    </p>
                    <p className={`text-2xl font-black mb-1 ${diffPrixVF>0?'text-green-600':diffPrixVF<0?'text-orange-600':'text-[#1A1A1A]'}`}>
                      {diffPrixVF>0?'+':''}{diffPrixVF} €/g
                    </p>
                    <p className="text-xs text-[#6B7280]">
                      {diffPrixVF>0?'✅ La vitrine rapporte plus au gramme que la fonte':'⚠️ La fonte rapporte plus que la vitrine — vérifiez la politique d\'achat'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── SECTION 4 — Croisement titre × canal ────────────────────── */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#1A1A1A]">💰 Analyse prix au gramme par titre et canal</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">18k, 14k, 9k : séparés Fonte/Vitrine · autres titres regroupés</p>
            </div>

            {/* Cookson input */}
            <div className="bg-[#FFF5F5] border border-[#FECACA] rounded-lg p-3 flex flex-wrap items-center gap-3">
              <label className="text-xs font-semibold text-[#1A1A1A] whitespace-nowrap">
                💰 Cours Cookson du jour — or 18 carats (€/g)
              </label>
              <input
                type="number"
                value={cookson}
                onChange={e=>setCookson(e.target.value)}
                placeholder="ex : 42.50"
                className="w-28 bg-white border border-[#E0E0E0] rounded-md px-2 py-1 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]"
              />
              <span className="text-xs text-[#6B7280] italic">
                Optionnel — affiche l&apos;écart vs cours pour les lignes 18 carats
              </span>
            </div>

            {/* Titre × Canal table */}
            <div className="overflow-x-auto rounded-lg border border-[#E0E0E0]">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr>
                    <th className={TH}>Titre d&apos;or</th>
                    <th className={TH}>Canal</th>
                    <th className={THR}>Qté</th>
                    <th className={THR}>Poids (g)</th>
                    <th className={THR}>Val. achat (€)</th>
                    <th className={THR}>Prix achat moy. (€/g)</th>
                    <th className={THR}>Val. vente (€)</th>
                    <th className={THR}>Marge (€)</th>
                    <th className={THR}>Taux marge</th>
                    {hasCookson&&<th className={THR}>Écart vs Cookson</th>}
                  </tr>
                </thead>
                <tbody>
                  {byTitreCanal.map((r,i)=>{
                    const is18 = r.titre==='18 carats (750)';
                    const ecart = hasCookson&&is18&&r.prixMoyen!=null
                      ? Math.round((r.prixMoyen-cooksonNum)/cooksonNum*100) : null;
                    return (
                      <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                        <td className={TD}><span className="font-medium">{r.titre||r.label.split(' — ')[0]}</span></td>
                        <td className={TD}>{r.canal||'—'}</td>
                        <td className={TDR}>{r.qty}</td>
                        <td className={TDR}>{r.poidsTotal>0?`${r.poidsTotal} g`:'—'}</td>
                        <td className={TDR}>{fmtK(r.va)} €</td>
                        <td className={TDR}>{r.prixMoyen!=null?`${fmtK(r.prixMoyen)} €/g`:'—'}</td>
                        <td className={TDR}>{fmtK(r.vv)} €</td>
                        <td className={TDR}><span className={r.marge<0?'text-red-600 font-semibold':''}>{fmtK(r.marge)} €</span></td>
                        <td className={TDR}><span className={r.tauxMarge<10?'text-red-600':r.tauxMarge>=25?'text-green-600':''}>{r.tauxMarge}%</span></td>
                        {hasCookson&&(
                          <td className={TDR}>
                            {ecart!=null?(
                              <span className={`font-semibold ${ecart>0?'text-orange-600':ecart<0?'text-green-600':'text-[#1A1A1A]'}`}>
                                {ecart>0?'+':''}{ecart}%
                              </span>
                            ):'—'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 18k synthetic recap */}
            {(ecart18Fonte!=null||ecart18Vitrine!=null)&&(
              <div className="bg-[#FFF5F5] border border-[#FECACA] rounded-lg p-3 space-y-1">
                <p className="text-xs font-semibold text-[#E30613]">Analyse 18 carats vs cours Cookson ({cooksonNum} €/g)</p>
                {ecart18Fonte!=null&&(
                  <p className={`text-sm font-bold ${ecart18Fonte>0?'text-orange-600':ecart18Fonte<0?'text-green-600':'text-[#1A1A1A]'}`}>
                    Fonte : {ecart18Fonte>0?'+':''}{ecart18Fonte}%
                    <span className="text-xs font-normal text-[#6B7280] ml-2">
                      ({ecart18Fonte<0?'vous rachetez en dessous du cours — bien négocié':'vous rachetez au-dessus du cours — surveiller'})
                    </span>
                  </p>
                )}
                {ecart18Vitrine!=null&&(
                  <p className={`text-sm font-bold ${ecart18Vitrine>0?'text-orange-600':ecart18Vitrine<0?'text-green-600':'text-[#1A1A1A]'}`}>
                    Vitrine : {ecart18Vitrine>0?'+':''}{ecart18Vitrine}%
                  </p>
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
