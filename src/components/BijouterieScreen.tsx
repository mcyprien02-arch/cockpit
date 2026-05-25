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
  lib: string;            // best libellé
  sf: string;             // sous-famille
  g: string;              // grade A/B/C/D
  pa: number;             // prix achat
  pv: number;             // prix vente
  poids: number|null;     // poids (g), null si non trouvé
  titre: string;          // '18 carats (750)' etc.
  canal: string;          // 'Fonte' | 'Vitrine'
  famCode: 'BOR'|'BOPI';  // détection famille
  acheteur: string;       // collaborateur/acheteur
  dv: number|null;        // délai de vente (jours)
}

// ── Aggregation row ───────────────────────────────────────────────────────────
interface AggRow {
  label: string; qty: number; poidsTotal: number;
  va: number; vv: number; marge: number;
  prixMoyen: number|null; tauxMarge: number;
}

// ── Acheteur performance row ──────────────────────────────────────────────────
interface AcheteurRow {
  nom: string; nbAchats: number; poidsTotal: number;
  va: number; prixMoyenG: number|null; prixMoyenG18k: number|null;
  vv: number; marge: number; tauxMarge: number;
  tag: 'tres_genereux'|'genereux'|'performant'|null;
}

// ── Top rotation row ──────────────────────────────────────────────────────────
interface RotationRow {
  modele: string; typeProduit: string; qty: number;
  delaiMoyen: number; paMoyen: number; pvMoyen: number;
  margeUnitaire: number; tauxMarge: number;
}

// ── Column aliases ────────────────────────────────────────────────────────────
const ALIASES: Record<string, string[]> = {
  typeTransaction:  ['typedetransaction','typetransaction','transaction'],
  famille:          ['sousfamille','sousfamilleproduit','famille','familleproduit'],
  achatLibelle:     ['achatlibellearticle','libellearticle'],
  fichetechLibelle: ['fichetechlibelle','fichetech','modele','libelle'],
  grade:            ['articlegrade','grade','gradearticle'],
  prixAchat:        ['achatprix','prixachat','prixdachat'],
  prixVente:        ['venteprixvendu','prixvente','prixvendu'],
  collaborateur:    ['collaborateur','acheteur','utilisateur'],
  delaiVente:       ['ventedelai','delaivente','delaidevente'],
};

// ── Utility functions ─────────────────────────────────────────────────────────
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
function isBijFamily(sf: string|null|undefined): boolean {
  if (!sf) return false;
  const s=sf.toLowerCase();
  return s.includes('bijouterie or')||s.includes('bopi')||s.includes('pierres')||s.includes('plaqu');
}
function detectFamCode(sf: string): 'BOR'|'BOPI' {
  const s=sf.toLowerCase();
  if (s.includes('bopi')||s.includes('pierres')||s.includes('plaqu')) return 'BOPI';
  return 'BOR';
}
function detectBijouType(lib: string): string {
  const u=lib.toUpperCase();
  if (u.includes('BAGUE')||u.includes('CHEVALIERE')||u.includes('ALLIANCE')||u.includes('SOLITAIRE')) return 'Bague';
  if (u.includes('COLLIER')||u.includes('SAUTOIR')||u.includes('CHAÎNE')||u.includes('CHAINE')) return 'Collier';
  if (u.includes('BRACELET')||u.includes('JONC')) return 'Bracelet';
  if (u.includes('PENDENTIF')||u.includes('MEDAILLE')||u.includes('MÉDAILLE')) return 'Pendentif';
  if (u.includes('BOUCLE')||u.includes('CREOLE')||u.includes('CRÉOLE')) return 'Boucles oreilles';
  if (u.includes('MONTRE')) return 'Montre';
  if (u.includes('PIÈCE')||u.includes('PIECE')||u.includes('NAPOLEON')||u.includes('NAPOLÉON')) return 'Pièce';
  return '—';
}

// Fixed sort order for titres
const TITRE_ORDER=['18 carats (750)','14 carats (585)','9 carats (375)',
  '22 carats pièces (900)','22 carats (916)','24 carats (999)','Titre inconnu'];
const TITRES_WITH_CANAL=['18 carats (750)','14 carats (585)','9 carats (375)'];

// ── Shared table styles ───────────────────────────────────────────────────────
const TH  = 'px-3 py-2.5 text-left   text-xs font-semibold text-[#6B7280] bg-[#F5F5F5] whitespace-nowrap';
const THR = 'px-3 py-2.5 text-right  text-xs font-semibold text-[#6B7280] bg-[#F5F5F5] whitespace-nowrap';
const TD  = 'px-3 py-2   text-xs text-[#1A1A1A] border-t border-[#F0F0F0]';
const TDR = 'px-3 py-2   text-xs text-right text-[#1A1A1A] border-t border-[#F0F0F0]';

// ── Aggregate helper ──────────────────────────────────────────────────────────
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

// ── AI context export ─────────────────────────────────────────────────────────
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
  const fmtK = (n: number) => Math.round(n).toLocaleString('fr-FR');

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
        const acheteur=col.collaborateur?String(row[col.collaborateur]??'').trim():'';
        const dvRaw=col.delaiVente?parseNum(row[col.delaiVente]):null;
        const dv=dvRaw!=null&&dvRaw>0?dvRaw:null;
        result.push({
          lib, sf, g, pa, pv,
          poids: extractPoids(lib),
          titre: detectTitreOr(lib),
          canal: g==='D'?'Fonte':'Vitrine',
          famCode: detectFamCode(sf),
          acheteur,
          dv,
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

  // ── Family counts ─────────────────────────────────────────────────────────
  const borCount  = useMemo(()=>rows.filter(r=>r.famCode==='BOR').length, [rows]);
  const bopiCount = useMemo(()=>rows.filter(r=>r.famCode==='BOPI').length,[rows]);

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
    return ['Fonte','Vitrine'].filter(c=>g.has(c)).map(c=>buildAgg(g.get(c)!,c));
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
    const grouped=new Map<string,BijRow[]>();
    const autresRows: BijRow[]=[];
    for (const r of rows) {
      if (TITRES_WITH_CANAL.includes(r.titre)) {
        const key=`${r.titre}|||${r.canal}`;
        if (!grouped.has(key)) grouped.set(key,[]);
        grouped.get(key)!.push(r);
      } else { autresRows.push(r); }
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
    if (autresRows.length>0)
      result.push({...buildAgg(autresRows,'Autres titres (22k, 24k, inconnus…)'),titre:'',canal:''});
    return result;
  },[rows]);

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

  // ── Prix moyen 18k magasin (pour tag Généreux) ───────────────────────────
  const moyG18kMagasin = useMemo(()=>{
    const r18=rows.filter(r=>r.titre==='18 carats (750)'&&r.poids!=null);
    const pa=r18.reduce((s,r)=>s+r.pa,0);
    const po=r18.reduce((s,r)=>s+(r.poids??0),0);
    return po>0?pa/po:null;
  },[rows]);

  // ── Performance acheteurs ─────────────────────────────────────────────────
  const byAcheteur = useMemo((): AcheteurRow[]=>{
    const grp=new Map<string,BijRow[]>();
    for (const r of rows) {
      const k=r.acheteur||'Inconnu';
      if (!grp.has(k)) grp.set(k,[]);
      grp.get(k)!.push(r);
    }
    const result: AcheteurRow[]=[];
    for (const [nom,rs] of grp.entries()) {
      if (rs.length<5) continue;
      const va=rs.reduce((s,r)=>s+r.pa,0);
      const vv=rs.reduce((s,r)=>s+r.pv,0);
      const marge=vv-va;
      const avecPoids=rs.filter(r=>r.poids!=null);
      const poidsTotal=avecPoids.reduce((s,r)=>s+(r.poids??0),0);
      const prixMoyenG=poidsTotal>0?va/poidsTotal:null;
      // 18k only for tag
      const r18=rs.filter(r=>r.titre==='18 carats (750)'&&r.poids!=null);
      const pa18=r18.reduce((s,r)=>s+r.pa,0);
      const po18=r18.reduce((s,r)=>s+(r.poids??0),0);
      const prixMoyenG18k=po18>0?pa18/po18:null;
      // Tag vs magasin average
      let tag: AcheteurRow['tag']=null;
      if (moyG18kMagasin&&prixMoyenG18k&&r18.length>=3) {
        const ratio=(prixMoyenG18k-moyG18kMagasin)/moyG18kMagasin*100;
        if      (ratio>20)  tag='tres_genereux';
        else if (ratio>10)  tag='genereux';
        else if (ratio<-10) tag='performant';
      }
      result.push({
        nom, nbAchats:rs.length,
        poidsTotal:Math.round(poidsTotal*100)/100,
        va:Math.round(va), vv:Math.round(vv),
        marge:Math.round(marge),
        prixMoyenG:prixMoyenG!=null?Math.round(prixMoyenG*100)/100:null,
        prixMoyenG18k:prixMoyenG18k!=null?Math.round(prixMoyenG18k*100)/100:null,
        tauxMarge:vv>0?Math.round(marge/vv*100):0,
        tag,
      });
    }
    return result.sort((a,b)=>b.tauxMarge-a.tauxMarge);
  },[rows, moyG18kMagasin]);

  // ── Top rotations (<60j, ≥2 ventes, marge positive) ──────────────────────
  const topRotations = useMemo((): RotationRow[]=>{
    const grp=new Map<string,BijRow[]>();
    for (const r of rows) {
      if (!grp.has(r.lib)) grp.set(r.lib,[]);
      grp.get(r.lib)!.push(r);
    }
    const result: RotationRow[]=[];
    for (const [lib,rs] of grp.entries()) {
      if (rs.length<2) continue;
      const withDv=rs.filter(r=>r.dv!=null);
      if (!withDv.length) continue;
      const delaiMoyen=withDv.reduce((s,r)=>s+(r.dv??0),0)/withDv.length;
      if (delaiMoyen>=60) continue;
      const paMoyen=rs.reduce((s,r)=>s+r.pa,0)/rs.length;
      const pvMoyen=rs.reduce((s,r)=>s+r.pv,0)/rs.length;
      const margeUnitaire=pvMoyen-paMoyen;
      if (margeUnitaire<=0) continue;
      result.push({
        modele:lib,
        typeProduit:detectBijouType(lib),
        qty:rs.length,
        delaiMoyen:Math.round(delaiMoyen),
        paMoyen:Math.round(paMoyen),
        pvMoyen:Math.round(pvMoyen),
        margeUnitaire:Math.round(margeUnitaire),
        tauxMarge:pvMoyen>0?Math.round(margeUnitaire/pvMoyen*100):0,
      });
    }
    return result.sort((a,b)=>a.delaiMoyen-b.delaiMoyen).slice(0,20);
  },[rows]);

  // ── Persist AI summary ────────────────────────────────────────────────────
  useEffect(()=>{
    if (!overview||!magasinNom) return;
    const titre18 = byTitre.find(r=>r.label==='18 carats (750)');
    const titre14 = byTitre.find(r=>r.label==='14 carats (585)');
    const titre9  = byTitre.find(r=>r.label==='9 carats (375)');
    const top3ach = byAcheteur.slice(0,3);
    const genereux  = byAcheteur.filter(a=>a.tag==='genereux').map(a=>a.nom);
    const tresGen   = byAcheteur.filter(a=>a.tag==='tres_genereux').map(a=>a.nom);
    const lines=[
      `Analyse Bijouterie spécialisée — ${overview.count} articles (BOR: ${borCount}, BOPI: ${bopiCount}) · poids total ${overview.poidsTotal} g`,
      `Valeur d'achat : ${fmtK(overview.va)} € · Valeur de vente : ${fmtK(overview.vv)} € · Marge : ${fmtK(overview.marge)} € (${overview.tauxMarge}%)`,
      titre18?`18 carats : ${titre18.qty} articles · ${titre18.poidsTotal} g · prix moyen ${titre18.prixMoyen??'—'} €/g`:'',
      titre14?`14 carats : ${titre14.qty} articles · ${titre14.poidsTotal} g · prix moyen ${titre14.prixMoyen??'—'} €/g`:'',
      titre9 ?`9 carats : ${titre9.qty} articles · ${titre9.poidsTotal} g · prix moyen ${titre9.prixMoyen??'—'} €/g`:'',
      tauxFonte!=null?`Taux de fonte : ${tauxFonte}% — ${tauxFonte<30?'orienté vitrine':tauxFonte<=60?'équilibre':'orienté fonte'}`:'',
      fonteRow?.prixMoyen!=null?`Prix moyen 18k Fonte : ${fonteRow.prixMoyen} €/g`:'',
      vitrineRow?.prixMoyen!=null?`Prix moyen 18k Vitrine : ${vitrineRow.prixMoyen} €/g`:'',
      diffPrixVF!=null?`Différentiel Vitrine vs Fonte : ${diffPrixVF>0?'+':''}${diffPrixVF} €/g`:'',
      hasCookson&&ecart18Fonte!=null?`Écart vs cours Cookson (${cooksonNum} €/g) sur 18k Fonte : ${ecart18Fonte>0?'+':''}${ecart18Fonte}%`:'',
      // Acheteurs
      top3ach.length>0
        ?`Performance acheteurs Bijouterie :\nTop 3 acheteurs par taux de marge : ${top3ach.map(a=>`${a.nom} ${a.tauxMarge}%`).join(', ')}`
        :'',
      genereux.length>0?`Acheteurs tagués Généreux : ${genereux.join(', ')}`:'',
      tresGen.length>0 ?`Acheteurs tagués Très généreux : ${tresGen.join(', ')}`:'',
      // Rotations
      topRotations.length>0?`Top rotations Bijouterie : ${topRotations.length} modèle(s) tournent en moins de 60j`:'',
    ].filter(Boolean).join('\n');
    try { localStorage.setItem(`bij_summary_${magasinNom}`,lines); } catch {}
  },[overview,byTitre,tauxFonte,fonteRow,vitrineRow,diffPrixVF,hasCookson,ecart18Fonte,cooksonNum,magasinNom,fmtK,borCount,bopiCount,byAcheteur,topRotations]);

  // ── AggTable shared component ─────────────────────────────────────────────
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

  // ── Tag badge helper ──────────────────────────────────────────────────────
  function TagBadge({ tag }: { tag: AcheteurRow['tag'] }) {
    if (!tag) return null;
    if (tag==='tres_genereux') return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
        🔴 Très généreux
      </span>
    );
    if (tag==='genereux') return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">
        🟠 Généreux
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">
        ✅ Performant
      </span>
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
              <p className="text-xs text-[#9CA3AF]">.csv · .xlsx · .xls — familles BOR et BOPI détectées automatiquement</p>
              {rows.length>0&&(
                <p className="text-xs text-[#6B7280] mt-1">
                  {borCount} lignes BOR + {bopiCount} lignes BOPI = <strong>{rows.length}</strong> lignes Bijouterie analysées
                </p>
              )}
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

          {/* BOR/BOPI count banner */}
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
            <span className="text-sm">💍</span>
            <p className="text-xs text-amber-800">
              <span className="font-semibold">{borCount}</span> lignes BOR{' '}+{' '}
              <span className="font-semibold">{bopiCount}</span> lignes BOPI{' '}={' '}
              <span className="font-bold text-[#E30613]">{rows.length}</span> lignes Bijouterie analysées
            </p>
          </div>

          {/* ── SECTION 1 — Vue d'ensemble ─────────────────────────────── */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#1A1A1A]">📊 Vue d&apos;ensemble</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                {label:'Lignes analysées',      value:overview.count.toLocaleString('fr-FR'),       sub:`(${overview.lignesAvecPoids} avec poids extrait)`},
                {label:'Poids total racheté',   value:`${overview.poidsTotal} g`,                   sub:''},
                {label:"Valeur d'achat",         value:`${fmtK(overview.va)} €`,                    sub:''},
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
            {(tauxFonte!=null||diffPrixVF!=null)&&(
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {tauxFonte!=null&&(
                  <div className="rounded-lg border border-[#E0E0E0] p-3">
                    <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Taux de fonte sur poids racheté</p>
                    <p className="text-2xl font-black text-[#1A1A1A] mb-1">{tauxFonte}%</p>
                    <p className="text-xs text-[#6B7280]">
                      {tauxFonte<30?'🏬 Magasin orienté vitrine':tauxFonte<=60?'⚖️ Équilibre vitrine / fonte':'🔥 Magasin orienté fonte'}
                    </p>
                  </div>
                )}
                {diffPrixVF!=null&&(
                  <div className="rounded-lg border border-[#E0E0E0] p-3">
                    <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Différentiel prix au gramme Vitrine vs Fonte</p>
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
                    const is18=r.titre==='18 carats (750)';
                    const ecart=hasCookson&&is18&&r.prixMoyen!=null
                      ?Math.round((r.prixMoyen-cooksonNum)/cooksonNum*100):null;
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

          {/* ── SECTION 5 — Performance acheteurs ────────────────────────── */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#1A1A1A]">👥 Performance acheteurs Bijouterie</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">Qui rachète généreusement vs qui rachète à la bonne valeur · minimum 5 achats</p>
            </div>

            {byAcheteur.length===0?(
              <p className="text-xs text-[#9CA3AF] italic">
                Aucun acheteur avec au moins 5 achats bijouterie sur la période.
                {!rows.some(r=>r.acheteur) && ' (Colonne "Collaborateur" non détectée dans le fichier.)'}
              </p>
            ):(
              <>
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5">
                  <p className="text-xs text-amber-800">
                    💡 Les tags <span className="font-bold">Généreux</span> identifient les acheteurs qui paient l&apos;or au-dessus de la moyenne magasin.
                    Ce n&apos;est pas forcément une erreur : ils peuvent racheter du 18k de qualité supérieure.
                    À croiser avec leur taux de marge final.
                  </p>
                </div>
                {moyG18kMagasin!=null&&(
                  <p className="text-xs text-[#6B7280]">
                    Prix achat moyen magasin (toutes lignes 18k) :{' '}
                    <span className="font-semibold text-[#1A1A1A]">{Math.round(moyG18kMagasin*100)/100} €/g</span>
                  </p>
                )}
                <div className="overflow-x-auto rounded-lg border border-[#E0E0E0]">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={TH}>Acheteur</th>
                        <th className={THR}>Nb achats</th>
                        <th className={THR}>Poids racheté (g)</th>
                        <th className={THR}>Valeur achat (€)</th>
                        <th className={THR}>PA moyen (€/g)</th>
                        <th className={THR}>PA moyen 18k (€/g)</th>
                        <th className={THR}>Valeur vente (€)</th>
                        <th className={THR}>Marge totale (€)</th>
                        <th className={THR}>Taux marge (%)</th>
                        <th className={THR}>Tag 18k</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byAcheteur.map((a,i)=>(
                        <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                          <td className={TD}><span className="font-medium">{a.nom||'Inconnu'}</span></td>
                          <td className={TDR}>{a.nbAchats}</td>
                          <td className={TDR}>{a.poidsTotal>0?`${a.poidsTotal} g`:'—'}</td>
                          <td className={TDR}>{fmtK(a.va)} €</td>
                          <td className={TDR}>{a.prixMoyenG!=null?`${a.prixMoyenG} €/g`:'—'}</td>
                          <td className={TDR}>{a.prixMoyenG18k!=null?`${a.prixMoyenG18k} €/g`:'—'}</td>
                          <td className={TDR}>{fmtK(a.vv)} €</td>
                          <td className={TDR}><span className={a.marge<0?'text-red-600 font-semibold':''}>{fmtK(a.marge)} €</span></td>
                          <td className={TDR}>
                            <span className={a.tauxMarge<10?'text-red-600 font-bold':a.tauxMarge>=25?'text-green-600 font-bold':''}>
                              {a.tauxMarge}%
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right border-t border-[#F0F0F0]">
                            <TagBadge tag={a.tag} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* ── SECTION 6 — Top rotations ─────────────────────────────────── */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#1A1A1A]">⚡ Top rotations Bijouterie <span className="text-[#9CA3AF] font-normal">(les pépites)</span></h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">Modèles qui se vendent en moins de 60 jours · minimum 2 ventes · marge positive</p>
            </div>

            {topRotations.length===0?(
              <div className="bg-[#F9FAFB] border border-[#E0E0E0] rounded-xl px-4 py-6 text-center">
                <p className="text-sm text-[#6B7280]">Aucun modèle Bijouterie ne tourne en moins de 60 jours sur cette période.</p>
                <p className="text-xs text-[#9CA3AF] mt-1">Stock à challenger.{!rows.some(r=>r.dv!=null)&&' (Colonne délai de vente non détectée.)'}</p>
              </div>
            ):(
              <>
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5">
                  <p className="text-xs text-amber-800">
                    💡 Ces modèles tournent vite et bien. À répliquer dans la gamme : racheter ce type de produit en priorité au comptoir, mettre en avant en vitrine.
                  </p>
                </div>
                {topRotations.length===20&&(
                  <p className="text-xs text-[#9CA3AF] italic">Affichage limité aux 20 premiers modèles.</p>
                )}
                <div className="overflow-x-auto rounded-lg border border-[#E0E0E0]">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={TH}>Modèle</th>
                        <th className={TH}>Type de produit</th>
                        <th className={THR}>Qté vendue</th>
                        <th className={THR}>Délai moy. (j)</th>
                        <th className={THR}>PA moyen (€)</th>
                        <th className={THR}>PV moyen (€)</th>
                        <th className={THR}>Marge unit. (€)</th>
                        <th className={THR}>Taux marge (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topRotations.map((r,i)=>(
                        <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                          <td className={`${TD} max-w-[200px] truncate`} title={r.modele}>{r.modele}</td>
                          <td className={TD}>{r.typeProduit}</td>
                          <td className={TDR}><span className="font-semibold text-green-700">{r.delaiMoyen} j</span></td>
                          <td className={TDR}>{fmtK(r.paMoyen)} €</td>
                          <td className={TDR}>{fmtK(r.pvMoyen)} €</td>
                          <td className={TDR}>{fmtK(r.margeUnitaire)} €</td>
                          <td className={TDR}><span className={r.tauxMarge>=25?'text-green-600 font-bold':''}>{r.tauxMarge}%</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
