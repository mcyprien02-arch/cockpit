'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { detectTypeBijou, extractPoidsFromLib } from '@/lib/bijouUtils';
import type { PAPAction } from '@/types';

interface Props { magasinNom: string; onNavigateToJournal?: () => void; onAddAction?: (action: PAPAction) => void; }

type Periode = 'all'|'3m'|'6m'|'12m';
type GradeFilter = 'all'|'A'|'B'|'C';
type BijInnerTab = 'analyse'|'gamme-reseau';

interface FonteConfig {
  useGradeD: boolean;
  useKeywords: boolean;
  keywords: string[];
}

interface BijRow {
  lib: string; sf: string; g: string;
  pa: number; pv: number; ep: number|null;
  poids: number|null; titre: string;
  type: string;
  famCode: 'BOR'|'BOPI';
  acheteur: string;
  clientNom: string;
  dv: number|null;
  d: string|null;
}

interface AggRow {
  label: string; qty: number; poidsTotal: number;
  va: number; vv: number; marge: number;
  prixMoyen: number|null; tauxMarge: number;
}

interface AcheteurRow {
  nom: string; nbAchats: number; poidsTotal: number;
  va: number; prixMoyenG: number|null;
  vv: number; marge: number; tauxMarge: number;
  delaiMoyen: number|null;
  tag: 'tres_genereux'|'genereux'|'performant'|'opportuniste'|null;
}

interface AcheteurTitreGroup {
  titreKey: string;
  titreLabel: string;
  acheteurs: AcheteurRow[];
  medianeG: number|null;
  insuffisant: boolean;
}

const ALIASES: Record<string, string[]> = {
  typeTransaction:    ['typedetransaction','typetransaction','transaction'],
  famille:            ['sousfamille','sousfamilleproduit','famille','familleproduit'],
  achatLibelle:       ['achatlibellearticle','libellearticle'],
  fichetechLibelle:   ['fichetechlibelle','fichetech','modele','libelle'],
  grade:              ['articlegrade','grade','gradearticle'],
  prixAchat:          ['achatprix','prixachat','prixdachat'],
  prixVente:          ['venteprixvendu','prixvente','prixvendu'],
  easypricePrixVente: ['easypriceprixventegradeb','easypriceprixvente','coteep'],
  collaborateur:      ['collaborateur','acheteur','utilisateur'],
  clientNom:          ['clientacheteurnom','clientnom','nomclient','clientacheteurnomprenom'],
  delaiVente:         ['ventedelai','delaivente','delaidevente'],
  dateVente:          ['ventedate','datevente'],
};

const TITRE_ORDER = ['18 carats (750)','14 carats (585)','9 carats (375)','22 carats pièces (900)','22 carats (916)','24 carats (999)','Titre inconnu'];
const TITRES_WITH_CANAL = ['18 carats (750)','14 carats (585)','9 carats (375)'];
const TRANCHES_PRIX = [{label:'< 50 €',min:0,max:50},{label:'50-150 €',min:50,max:150},{label:'150-300 €',min:150,max:300},{label:'> 300 €',min:300,max:Infinity}];
const TRANCHES_POIDS = [{label:'< 1 g',minG:0,maxG:1},{label:'1-3 g',minG:1,maxG:3},{label:'3-5 g',minG:3,maxG:5},{label:'5-10 g',minG:5,maxG:10},{label:'> 10 g',minG:10,maxG:Infinity}];
const TYPES_BIJOU = ['Bague','Collier','Pendentif',"Boucles d'oreille",'Bracelet','Autre','Fonte/Or brut'];
const TITRES_PRINCIPAUX = ['18 carats (750)','14 carats (585)','9 carats (375)','24 carats (999)'];
const TITRE_GROUPS: {key:string;label:string}[] = [
  {key:'18 carats (750)', label:'🥇 18 carats (750/1000)'},
  {key:'14 carats (585)', label:'🥈 14 carats (585/1000)'},
  {key:'9 carats (375)',  label:'🥉 9 carats (375/1000)'},
  {key:'24 carats (999)', label:'🏷️ 24 carats (999/1000)'},
  {key:'Autres',          label:'🏷️ Autres titres'},
];


const BENCHMARKS_GAMME: {fc:'BOR'|'BOPI';label:string;tranches:{label:string;min:number;max:number;bench:number}[]}[] = [
  {fc:'BOR',  label:'💍 BOR — Bijouterie Or',  tranches:[{label:'0 – 100 €',min:0,max:100,bench:48},{label:'100 – 300 €',min:100,max:300,bench:31},{label:'> 300 €',min:300,max:Infinity,bench:21}]},
  {fc:'BOPI', label:'✨ BOPI — Or empierré',   tranches:[{label:'0 – 100 €',min:0,max:100,bench:44},{label:'100 – 300 €',min:100,max:300,bench:36},{label:'> 300 €',min:300,max:Infinity,bench:20}]},
];

const BENCH_TYPES: {type:string;bench:number}[] = [
  {type:'Bague',bench:35},
  {type:"Boucles d'oreille",bench:25},
  {type:'Collier',bench:15},
  {type:'Bracelet',bench:13},
  {type:'Pendentif',bench:8},
  {type:'Autre',bench:6},
];


const TH  = 'px-3 py-2.5 text-left   text-xs font-semibold text-[#6B7280] bg-[#F5F5F5] whitespace-nowrap';
const THR = 'px-3 py-2.5 text-right  text-xs font-semibold text-[#6B7280] bg-[#F5F5F5] whitespace-nowrap';
const TD  = 'px-3 py-2   text-xs text-[#1A1A1A] border-t border-[#F0F0F0]';
const TDR = 'px-3 py-2   text-xs text-right text-[#1A1A1A] border-t border-[#F0F0F0]';

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
function parseDateVal(v: unknown): Date|null {
  if (v instanceof Date) return isNaN(v.getTime())?null:v;
  if (typeof v==='string') {
    const s=v.trim();
    const m1=s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
    if (m1) return new Date(+m1[3],+m1[2]-1,+m1[1]);
    const m2=s.match(/^(\d{4})[/\-](\d{2})[/\-](\d{2})/);
    if (m2) return new Date(+m2[1],+m2[2]-1,+m2[3]);
  }
  return null;
}
function getBestLibelle(achat: string, fichetech: string): string {
  const a=achat.trim(), f=fichetech.trim();
  if (!a||a.length<10||/^\d+$/.test(a)) return f||a;
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
function isBijFamily(sf: string): boolean {
  if (!sf) return false;
  const n=sf.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  return n.includes('bijouterie or')||n.includes('bijou or')||n.includes('bopi')||n.includes('pierres')||n.includes('plaqu');
}

function detectFamCode(sf: string): 'BOR'|'BOPI' {
  const n=sf.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  if (n.includes('empierre')||n.includes('bopi')||n.includes('pierres')||n.includes('plaqu')) return 'BOPI';
  return 'BOR';
}
function getTitreGroupKey(titre: string): string {
  return TITRES_PRINCIPAUX.includes(titre)?titre:'Autres';
}
function median(arr: number[]): number|null {
  if (!arr.length) return null;
  const s=[...arr].sort((a,b)=>a-b);
  const m=Math.floor(s.length/2);
  return s.length%2?s[m]:(s[m-1]+s[m])/2;
}
function isLigneFonte(row: BijRow, config: FonteConfig): boolean {
  if (config.useGradeD && row.g==='D') return true;
  if (config.useKeywords && config.keywords.length>0) {
    const uLib    = row.lib.toUpperCase().trim();
    const uClient = row.clientNom.toUpperCase().trim();
    if (config.keywords.some(k => uLib.includes(k) || uClient.includes(k))) return true;
  }
  return false;
}
function fonteConfigRecap(config: FonteConfig): string {
  const parts: string[]=[];
  if (config.useGradeD) parts.push('Grade D');
  if (config.useKeywords&&config.keywords.length>0) parts.push(`mots-clés ${config.keywords.join(', ')}`);
  return parts.length?parts.join(' + '):'aucune détection configurée';
}
const fmtK=(n:number)=>Math.round(n).toLocaleString('fr-FR');
const fmtG=(n:number)=>Math.round(n*100)/100;

function buildAgg(rows: BijRow[], label: string): AggRow {
  const va=Math.round(rows.reduce((s,r)=>s+r.pa,0));
  const vv=Math.round(rows.reduce((s,r)=>s+r.pv,0));
  const marge=vv-va;
  const poidsArr=rows.flatMap(r=>r.poids!=null?[r.poids]:[]);
  const poidsTotal=Math.round(poidsArr.reduce((s,v)=>s+v,0)*100)/100;
  return { label, qty:rows.length, poidsTotal, va, vv, marge,
    prixMoyen: poidsTotal>0?Math.round(va/poidsTotal*100)/100:null,
    tauxMarge: vv>0?Math.round(marge/vv*100):0,
  };
}

export function getBijouterieContext(magasinNom: string): string {
  try { const raw=localStorage.getItem(`bij_summary_${magasinNom}`); return raw??''; } catch { return ''; }
}

export default function BijouterieScreen({ magasinNom, onNavigateToJournal, onAddAction }: Props) {
  const [allRows,        setAllRows]        = useState<BijRow[]>([]);
  const [periode,        setPeriode]        = useState<Periode>('all');
  const [grade,          setGrade]          = useState<GradeFilter>('all');
  const [cookson,        setCookson]        = useState('');
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string|null>(null);
  const [dragOver,       setDragOver]       = useState(false);
  const [fonteConfig,    setFonteConfig]    = useState<FonteConfig>({useGradeD:true,useKeywords:false,keywords:[]});
  const [fonteConfigOpen,setFonteConfigOpen]= useState(false);
  const [keywordsInput,  setKeywordsInput]  = useState('');
  const [papAdded,       setPapAdded]       = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const [bijTab,       setBijTab]       = useState<BijInnerTab>('analyse');

  function addToPAP(key: string, titre: string, description: string) {
    if (!onAddAction) return;
    const today = new Date();
    const echeance = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate()).toISOString().split('T')[0];
    const action: PAPAction = {
      id: String(Date.now()), titre, axe: 'Transverse', pilote: '', copilote: '',
      description, echeance, priorite: 1, gain: 0, statut: 'À faire',
    };
    onAddAction(action);
    setPapAdded(prev => new Set(prev).add(key));
  }

  useEffect(()=>{
    try {
      const v=localStorage.getItem('cookson_cours_jour'); if(v) setCookson(v);
      const fc=localStorage.getItem('bijouterie-config-fonte');
      if(fc){ const cfg=JSON.parse(fc) as FonteConfig; setFonteConfig(cfg); setKeywordsInput(cfg.keywords.join(', ')); }
    } catch {}
  },[]);

  useEffect(()=>{
    try { if(cookson) localStorage.setItem('cookson_cours_jour',cookson); else localStorage.removeItem('cookson_cours_jour'); } catch {}
  },[cookson]);


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
        const achatLib =col.achatLibelle    ?String(row[col.achatLibelle]??'').trim():'';
        const fichLib  =col.fichetechLibelle?String(row[col.fichetechLibelle]??'').trim():'';
        const lib=getBestLibelle(achatLib,fichLib);
        const g=col.grade?String(row[col.grade]??'').trim().toUpperCase():'';
        const pa=col.prixAchat?parseNum(row[col.prixAchat]):0;
        const ep=col.easypricePrixVente?(parseNum(row[col.easypricePrixVente])||null):null;
        const acheteur=col.collaborateur?String(row[col.collaborateur]??'').trim():'';
        const clientNom=col.clientNom?String(row[col.clientNom]??'').trim():'';
        const dvRaw=col.delaiVente?parseNum(row[col.delaiVente]):null;
        const dv=dvRaw!=null&&dvRaw>0?dvRaw:null;
        const dateV=col.dateVente?parseDateVal(row[col.dateVente]):null;
        result.push({
          lib, sf, g, pa, pv, ep,
          poids: extractPoidsFromLib(lib),
          titre: detectTitreOr(lib),
          type:  detectTypeBijou(lib),
          famCode: detectFamCode(sf),
          acheteur, clientNom, dv,
          d: dateV?.toISOString()??null,
        });
      }
      if (!result.length) throw new Error('Aucune ligne bijouterie détectée. Ce module ne traite que les familles BOR et BOPI.');
      const borC=result.filter(r=>r.famCode==='BOR').length;
      const bopiC=result.filter(r=>r.famCode==='BOPI').length;
      if (borC===0&&bopiC===0) throw new Error('⚠️ Ce module est réservé aux familles BOR (Or) et BOPI (Or empierré). Pour BMON / BMAR / autres, utilisez le module Journal.');
      setAllRows(result);
    } catch(e){ setError(e instanceof Error?e.message:'Erreur inattendue.'); }
    finally { setLoading(false); }
  },[]);

  function handleFile(f: File|null|undefined) {
    if (!f) return;
    if (!['csv','xlsx','xls'].includes(f.name.split('.').pop()?.toLowerCase()??'')) { setError('Format non supporté. Utilisez .csv, .xlsx ou .xls.'); return; }
    processFile(f);
  }

  function saveConfig() {
    const kws=keywordsInput.split(',').map(k=>k.trim().toUpperCase()).filter(k=>k.length>0);
    const newCfg: FonteConfig={...fonteConfig,keywords:kws};
    setFonteConfig(newCfg);
    try { localStorage.setItem('bijouterie-config-fonte',JSON.stringify(newCfg)); } catch {}
    setFonteConfigOpen(false);
  }

const fonteRows = useMemo(()=>allRows.filter(r=>isLigneFonte(r,fonteConfig)),[allRows,fonteConfig]);

  const filteredRows = useMemo(()=>{
    let r=allRows.filter(row=>!isLigneFonte(row,fonteConfig));
    if (grade!=='all') r=r.filter(row=>row.g===grade);
    if (periode!=='all') {
      const cutoff=new Date();
      cutoff.setMonth(cutoff.getMonth()-(periode==='3m'?3:periode==='6m'?6:12));
      r=r.filter(row=>row.d?new Date(row.d)>=cutoff:true);
    }
    return r;
  },[allRows,periode,grade,fonteConfig]);

  const borCount  = useMemo(()=>allRows.filter(r=>r.famCode==='BOR').length, [allRows]);
  const bopiCount = useMemo(()=>allRows.filter(r=>r.famCode==='BOPI').length,[allRows]);

  const overview = useMemo(()=>{
    if (!filteredRows.length) return null;
    const poidsArr=filteredRows.flatMap(r=>r.poids!=null?[r.poids]:[]);
    const va=Math.round(filteredRows.reduce((s,r)=>s+r.pa,0));
    const vv=Math.round(filteredRows.reduce((s,r)=>s+r.pv,0));
    const marge=vv-va;
    const fonteLignes=fonteRows.length;
    const totalLignes=filteredRows.length+fonteLignes;
    return {
      count:filteredRows.length, poidsTotal:Math.round(poidsArr.reduce((s,v)=>s+v,0)*100)/100,
      lignesAvecPoids:poidsArr.length, va, vv, marge, tauxMarge:vv>0?Math.round(marge/vv*100):0,
      pctFonte:totalLignes>0?Math.round(fonteLignes/totalLignes*100):null,
      pctVitrine:totalLignes>0?Math.round(filteredRows.length/totalLignes*100):null,
    };
  },[filteredRows,fonteRows]);

  const byTitre = useMemo(()=>{
    const g=new Map<string,BijRow[]>();
    for (const r of filteredRows) { if (!g.has(r.titre)) g.set(r.titre,[]); g.get(r.titre)!.push(r); }
    return Array.from(g.entries()).map(([t,rs])=>buildAgg(rs,t))
      .sort((a,b)=>(TITRE_ORDER.indexOf(a.label)<0?99:TITRE_ORDER.indexOf(a.label))-(TITRE_ORDER.indexOf(b.label)<0?99:TITRE_ORDER.indexOf(b.label)));
  },[filteredRows]);

  const byCanal = useMemo(()=>{
    const g=new Map<string,BijRow[]>();
    for (const r of filteredRows) { if (!g.has('Vitrine')) g.set('Vitrine',[]); g.get('Vitrine')!.push(r); }
    for (const r of fonteRows)    { if (!g.has('Fonte'))   g.set('Fonte',[]); g.get('Fonte')!.push(r); }
    return ['Fonte','Vitrine'].filter(c=>g.has(c)).map(c=>buildAgg(g.get(c)!,c));
  },[filteredRows,fonteRows]);

  const fonteRow   = byCanal.find(r=>r.label==='Fonte');
  const vitrineRow = byCanal.find(r=>r.label==='Vitrine');
  const poidsGrandTotal=(fonteRow?.poidsTotal??0)+(vitrineRow?.poidsTotal??0);
  const tauxFonte=poidsGrandTotal>0?Math.round((fonteRow?.poidsTotal??0)/poidsGrandTotal*100):null;
  const diffPrixVF=vitrineRow?.prixMoyen!=null&&fonteRow?.prixMoyen!=null?Math.round((vitrineRow.prixMoyen-fonteRow.prixMoyen)*100)/100:null;

  const cooksonNum=parseFloat(cookson.replace(',','.'));
  const hasCookson=!isNaN(cooksonNum)&&cooksonNum>0;

  const allRowsForCanal=useMemo(()=>[...filteredRows,...fonteRows],[filteredRows,fonteRows]);
  const byTitreCanal = useMemo(()=>{
    const grouped=new Map<string,BijRow[]>(), autresRows: BijRow[]=[];
    for (const r of allRowsForCanal) {
      if (TITRES_WITH_CANAL.includes(r.titre)) {
        const key=`${r.titre}|||${isLigneFonte(r,fonteConfig)?'Fonte':'Vitrine'}`;
        if (!grouped.has(key)) grouped.set(key,[]);
        grouped.get(key)!.push(r);
      } else autresRows.push(r);
    }
    const result: (AggRow&{titre:string;canal:string})[]=[];
    for (const [key,rs] of grouped.entries()) {
      const [titre,canal]=key.split('|||');
      result.push({...buildAgg(rs,`${titre} — ${canal}`),titre,canal});
    }
    result.sort((a,b)=>{
      const ti=(TITRE_ORDER.indexOf(a.titre)<0?99:TITRE_ORDER.indexOf(a.titre))-(TITRE_ORDER.indexOf(b.titre)<0?99:TITRE_ORDER.indexOf(b.titre));
      if (ti!==0) return ti;
      return (a.canal==='Fonte'?0:1)-(b.canal==='Fonte'?0:1);
    });
    if (autresRows.length>0) result.push({...buildAgg(autresRows,'Autres titres (22k, 24k, inconnus…)'),titre:'',canal:''});
    return result;
  },[allRowsForCanal,fonteConfig]);

  const byTypeBijou = useMemo(()=>{
    const g=new Map<string,{rows:BijRow[];dvs:number[]}>();
    const totalCA=filteredRows.reduce((s,r)=>s+r.pv,0);
    for (const r of filteredRows) {
      if (!g.has(r.type)) g.set(r.type,{rows:[],dvs:[]});
      const e=g.get(r.type)!;
      e.rows.push(r);
      if (r.dv&&r.dv>0) e.dvs.push(r.dv);
    }
    return TYPES_BIJOU.filter(t=>g.has(t)).map(t=>{
      const {rows:rs,dvs}=g.get(t)!;
      const va=rs.reduce((s,r)=>s+r.pa,0);
      const vv=rs.reduce((s,r)=>s+r.pv,0);
      const marge=vv-va;
      const poidsArr=rs.flatMap(r=>r.poids!=null?[r.poids]:[]);
      const poidsTotal=poidsArr.reduce((s,v)=>s+v,0);
      return {
        type:t, nbVentes:rs.length,
        caTotal:Math.round(vv),
        pctCA:totalCA>0?Math.round(vv/totalCA*100):0,
        margeTotal:Math.round(marge),
        tauxMarge:vv>0?Math.round(marge/vv*100):0,
        delaiMoyen:dvs.length>0?Math.round(dvs.reduce((s,v)=>s+v,0)/dvs.length):null,
        pvMoyen:rs.length>0?Math.round(vv/rs.length):0,
        prixMoyenGramme:poidsTotal>0?Math.round(va/poidsTotal*100)/100:null,
      };
    }).sort((a,b)=>b.margeTotal-a.margeTotal);
  },[filteredRows]);

  const sweetSpotType = useMemo(()=>{
    const candidates=byTypeBijou.filter(t=>t.type!=='Fonte/Or brut'&&t.nbVentes>=3&&t.delaiMoyen!=null);
    if (!candidates.length) return null;
    return candidates.reduce((best,t)=>{
      const score=t.tauxMarge/(t.delaiMoyen??999);
      const bestScore=best.tauxMarge/(best.delaiMoyen??999);
      return score>bestScore?t:best;
    });
  },[byTypeBijou]);

  const byTranchePrix = useMemo(()=>{
    const totalCA=filteredRows.reduce((s,r)=>s+r.pv,0);
    return TRANCHES_PRIX.map(tr=>{
      const rs=filteredRows.filter(r=>r.pv>=tr.min&&r.pv<tr.max);
      const va=rs.reduce((s,r)=>s+r.pa,0);
      const vv=rs.reduce((s,r)=>s+r.pv,0);
      const marge=vv-va;
      const dvs=rs.flatMap(r=>r.dv!=null&&r.dv>0?[r.dv]:[]);
      return {
        label:tr.label, nbVentes:rs.length,
        caTotal:Math.round(vv), pctCA:totalCA>0?Math.round(vv/totalCA*100):0,
        margeTotal:Math.round(marge), tauxMarge:vv>0?Math.round(marge/vv*100):0,
        delaiMoyen:dvs.length?Math.round(dvs.reduce((s,v)=>s+v,0)/dvs.length):null,
        margeUnitaire:rs.length?Math.round(marge/rs.length):0,
      };
    });
  },[filteredRows]);

  const rowsForPoids = useMemo(()=>filteredRows.filter(r=>r.type!=='Fonte/Or brut'&&r.poids!=null),[filteredRows]);
  const byTranchePoids = useMemo(()=>{
    const total=rowsForPoids.length;
    return TRANCHES_POIDS.map(tr=>{
      const rs=rowsForPoids.filter(r=>r.poids!=null&&r.poids>=tr.minG&&r.poids<tr.maxG);
      const poidsTotal=rs.reduce((s,r)=>s+(r.poids??0),0);
      const va=rs.reduce((s,r)=>s+r.pa,0);
      const vv=rs.reduce((s,r)=>s+r.pv,0);
      const dvs=rs.flatMap(r=>r.dv!=null&&r.dv>0?[r.dv]:[]);
      return {
        label:tr.label, nbVentes:rs.length,
        pctVolume:total>0?Math.round(rs.length/total*100):0,
        poidsTotal:Math.round(poidsTotal*100)/100,
        paMoyenG:poidsTotal>0?Math.round(va/poidsTotal*100)/100:null,
        pvMoyenG:poidsTotal>0?Math.round(vv/poidsTotal*100)/100:null,
        margeUnitaire:rs.length?Math.round((vv-va)/rs.length):0,
        delaiMoyen:dvs.length?Math.round(dvs.reduce((s,v)=>s+v,0)/dvs.length):null,
      };
    });
  },[rowsForPoids]);

  // Section E — acheteurs par titre, médiane par titre
  const byAcheteurParTitre = useMemo((): AcheteurTitreGroup[]=>{
    const byGroup=new Map<string,BijRow[]>();
    for (const r of filteredRows) {
      const key=getTitreGroupKey(r.titre);
      if (!byGroup.has(key)) byGroup.set(key,[]);
      byGroup.get(key)!.push(r);
    }
    return TITRE_GROUPS
      .filter(tg=>byGroup.has(tg.key))
      .map(tg=>{
        const rowsForTitre=byGroup.get(tg.key)!;
        const paGVals=rowsForTitre.flatMap(r=>r.poids&&r.poids>0?[r.pa/r.poids]:[]);
        const medianeG=median(paGVals);
        const grp=new Map<string,BijRow[]>();
        for (const r of rowsForTitre) {
          const k=r.acheteur||'Inconnu';
          if (!grp.has(k)) grp.set(k,[]);
          grp.get(k)!.push(r);
        }
        const acheteurs: AcheteurRow[]=Array.from(grp.entries())
          .filter(([,rs])=>rs.length>=5)
          .map(([nom,rs])=>{
            const va=rs.reduce((s,r)=>s+r.pa,0);
            const vv=rs.reduce((s,r)=>s+r.pv,0);
            const poidsTotal=rs.filter(r=>r.poids!=null).reduce((s,r)=>s+(r.poids??0),0);
            const prixMoyenG=poidsTotal>0?va/poidsTotal:null;
            const dvs=rs.flatMap(r=>r.dv!=null?[r.dv]:[]);
            let tag: AcheteurRow['tag']=null;
            if (medianeG&&prixMoyenG) {
              const ratio=(prixMoyenG-medianeG)/medianeG*100;
              if      (ratio>15)  tag='tres_genereux';
              else if (ratio>5)   tag='genereux';
              else if (ratio>=-5) tag='performant';
              else                tag='opportuniste';
            }
            return {
              nom, nbAchats:rs.length,
              poidsTotal:Math.round(poidsTotal*100)/100,
              va:Math.round(va), vv:Math.round(vv),
              marge:Math.round(vv-va),
              prixMoyenG:prixMoyenG!=null?Math.round(prixMoyenG*100)/100:null,
              tauxMarge:vv>0?Math.round((vv-va)/vv*100):0,
              delaiMoyen:dvs.length?Math.round(dvs.reduce((s,v)=>s+v,0)/dvs.length):null,
              tag,
            };
          })
          .sort((a,b)=>(b.prixMoyenG??0)-(a.prixMoyenG??0));
        return {titreKey:tg.key,titreLabel:tg.label,acheteurs,medianeG,insuffisant:acheteurs.length<3};
      });
  },[filteredRows]);

  const fonteStats = useMemo(()=>{
    if (!fonteRows.length) return null;
    const poidsArr=fonteRows.flatMap(r=>r.poids!=null?[r.poids]:[]);
    const poidsTotal=poidsArr.reduce((s,v)=>s+v,0);
    const va=fonteRows.reduce((s,r)=>s+r.pa,0);
    const byGradeD=fonteRows.filter(r=>r.g==='D');
    const byKw=fonteConfig.useKeywords&&fonteConfig.keywords.length>0
      ?fonteRows.filter(r=>{
        const uLib=r.lib.toUpperCase().trim();
        const uClient=r.clientNom.toUpperCase().trim();
        return fonteConfig.keywords.some(k=>uLib.includes(k)||uClient.includes(k));
      })
      :[];
    return {
      nbLignes:fonteRows.length,
      poidsTotal:Math.round(poidsTotal*100)/100,
      vaTotal:Math.round(va),
      paMoyenG:poidsTotal>0?Math.round(va/poidsTotal*100)/100:null,
      breakdown:fonteConfig.useKeywords?{
        byGradeD:{n:byGradeD.length,poids:Math.round(byGradeD.reduce((s,r)=>s+(r.poids??0),0)*100)/100},
        byKw:{n:byKw.length,poids:Math.round(byKw.reduce((s,r)=>s+(r.poids??0),0)*100)/100},
      }:null,
    };
  },[fonteRows,fonteConfig]);

  const margePotentielFonte = useMemo(()=>{
    if (!hasCookson||!fonteStats?.paMoyenG||!fonteStats.poidsTotal) return null;
    return Math.round(fonteStats.poidsTotal*(cooksonNum-fonteStats.paMoyenG));
  },[fonteStats,hasCookson,cooksonNum]);

  const flops = useMemo(()=>{
    return filteredRows
      .filter(r=>r.dv!=null&&r.dv>90&&r.ep!=null&&r.ep>0&&Math.abs(r.pv-r.ep)/r.ep>0.20)
      .map(r=>({lib:r.lib,type:r.type,poids:r.poids,pa:r.pa,pv:r.pv,dv:r.dv!,ep:r.ep!,ecartEP:Math.round((r.pv-r.ep!)/r.ep!*100)}))
      .sort((a,b)=>b.dv-a.dv);
  },[filteredRows]);

  useEffect(()=>{
    if (!overview||!magasinNom) return;
    const tresGenereux18k=byAcheteurParTitre.find(g=>g.titreKey==='18 carats (750)')?.acheteurs.filter(a=>a.tag==='tres_genereux')||[];
    const lines=[
      `Analyse Bijouterie — ${allRows.length} articles (BOR:${borCount}, BOPI:${bopiCount}) · ${filteredRows.length} ventes A/B/C · ${fonteRows.length} fonte`,
      `Valeur achat:${fmtK(overview.va)}€ · Vente:${fmtK(overview.vv)}€ · Marge:${fmtK(overview.marge)}€ (${overview.tauxMarge}%)`,
      sweetSpotType?`Sweet spot type: ${sweetSpotType.type} (taux marge ${sweetSpotType.tauxMarge}%, délai ${sweetSpotType.delaiMoyen}j)`:'',
      tresGenereux18k.length>0?`Acheteurs très généreux (18k): ${tresGenereux18k.map(a=>a.nom).join(', ')}`:'',
      fonteStats?`Fonte: ${fonteStats.nbLignes} lignes · ${fonteStats.poidsTotal}g · PA moy ${fonteStats.paMoyenG??'—'}€/g`:'',
    ].filter(Boolean).join('\n');
    try { localStorage.setItem(`bij_summary_${magasinNom}`,lines); } catch {}
  },[overview,allRows,borCount,bopiCount,filteredRows,fonteRows,sweetSpotType,byAcheteurParTitre,fonteStats,magasinNom]);

  function TagBadge({ tag }: { tag: AcheteurRow['tag'] }) {
    if (!tag) return null;
    const MAP={
      tres_genereux:{bg:'bg-red-100',text:'text-red-700',border:'border-red-200',label:'🔴 Très généreux'},
      genereux:     {bg:'bg-orange-100',text:'text-orange-700',border:'border-orange-200',label:'🟠 Généreux'},
      performant:   {bg:'bg-green-100',text:'text-green-700',border:'border-green-200',label:'✅ Performant'},
      opportuniste: {bg:'bg-emerald-100',text:'text-emerald-700',border:'border-emerald-200',label:'🟢 Opportuniste'},
    };
    const s=MAP[tag];
    return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${s.bg} ${s.text} border ${s.border}`}>{s.label}</span>;
  }

  function btnPeriode(p: Periode) {
    return `text-xs font-semibold rounded-lg px-3 py-1.5 border transition-colors ${periode===p?'bg-[#E30613] text-white border-[#E30613]':'border-[#E0E0E0] text-[#6B7280] hover:border-[#E30613] hover:text-[#E30613]'}`;
  }
  function btnGrade(g: GradeFilter) {
    return `text-xs font-semibold rounded-lg px-3 py-1.5 border transition-colors ${grade===g?'bg-[#1A1A1A] text-white border-[#1A1A1A]':'border-[#E0E0E0] text-[#6B7280] hover:border-[#1A1A1A] hover:text-[#1A1A1A]'}`;
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-[#1A1A1A]">💍 Bijouterie · {magasinNom||'Magasin'}</h2>
          <p className="text-xs text-[#9CA3AF] mt-0.5">Analyse spécialisée BOR/BOPI — types de bijoux, tranches de poids, prix au gramme, acheteurs</p>
        </div>
        {onNavigateToJournal&&(
          <button onClick={onNavigateToJournal} className="text-xs text-[#E30613] border border-[#E30613] rounded-lg px-3 py-1.5 hover:bg-[#FFF5F5] transition-colors">
            ← Journal achat-vente
          </button>
        )}
      </div>

      {/* Inner tab navigation */}
      <div className="flex border-b border-[#E0E0E0] overflow-x-auto">
        {([
          {id:'analyse',     label:'📊 Analyse'},
          {id:'gamme-reseau',label:'📈 Gamme vs réseau'},
        ] as {id:BijInnerTab;label:string}[]).map(t=>(
          <button key={t.id} onClick={()=>setBijTab(t.id)}
            className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
              bijTab===t.id?'border-[#E30613] text-[#E30613]':'border-transparent text-[#6B7280] hover:text-[#1A1A1A]'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {bijTab==='analyse'&&<>

      {/* Drop zone */}
      <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}
        onClick={()=>fileRef.current?.click()}
        className={`cursor-pointer border-2 border-dashed rounded-xl px-6 py-8 text-center transition-all ${dragOver?'border-[#E30613] bg-[#FFF5F5]':'border-[#E0E0E0] bg-white hover:border-[#E30613] hover:bg-[#FFF5F5]'}`}>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e=>handleFile(e.target.files?.[0])} />
        {loading
          ? <div className="space-y-2"><div className="text-2xl animate-pulse">⏳</div><p className="text-sm text-[#6B7280]">Analyse en cours…</p></div>
          : <div className="space-y-2">
              <div className="text-3xl">💍</div>
              <p className="text-sm font-semibold text-[#1A1A1A]">Glissez votre journal Athéna ici ou cliquez pour importer</p>
              <p className="text-xs text-[#9CA3AF]">.csv · .xlsx · .xls — familles BOR et BOPI uniquement</p>
              {allRows.length>0&&<p className="text-xs text-[#6B7280] mt-1">{borCount} BOR + {bopiCount} BOPI = <strong>{allRows.length}</strong> lignes</p>}
            </div>
        }
      </div>

      {error&&<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex gap-2"><span>⚠️</span><span>{error}</span></div>}
      {!allRows.length&&!loading&&!error&&(
        <div className="bg-white border border-[#E0E0E0] rounded-xl px-6 py-12 text-center">
          <div className="text-4xl mb-3">💍</div>
          <p className="text-sm font-semibold text-[#1A1A1A]">Aucune analyse encore</p>
          <p className="text-xs text-[#6B7280] mt-1">Importez un journal Athéna contenant des familles BOR ou BOPI.</p>
          <p className="text-xs text-amber-600 mt-2 italic">⚠️ Ce module est réservé aux familles BOR (Or) et BOPI (Or empierré). Pour BMON / BMAR / autres, utilisez le module Journal.</p>
        </div>
      )}

      {allRows.length>0&&overview&&(
        <div className="space-y-8">

          {/* ── Config fonte (collapsible) ─────────────────────────────── */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
            <button onClick={()=>setFonteConfigOpen(v=>!v)}
              className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-[#FAFAFA] transition-colors">
              <span className="text-sm font-bold text-[#1A1A1A]">⚙️ Configuration de la détection fonte</span>
              <span className="text-xs text-[#9CA3AF]">{fonteConfigOpen?'▲':'▼'} <em>{fonteConfigRecap(fonteConfig)}</em></span>
            </button>
            {fonteConfigOpen&&(
              <div className="px-5 pb-5 space-y-4 border-t border-[#E0E0E0]">
                <p className="text-xs text-[#6B7280] pt-3">Comment votre magasin identifie-t-il les achats destinés à la fonte ?</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={fonteConfig.useGradeD}
                      onChange={e=>setFonteConfig(c=>({...c,useGradeD:e.target.checked}))}
                      className="rounded" />
                    <span className="text-xs text-[#1A1A1A] font-medium">Par le grade D</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={fonteConfig.useKeywords}
                      onChange={e=>setFonteConfig(c=>({...c,useKeywords:e.target.checked}))}
                      className="rounded" />
                    <span className="text-xs text-[#1A1A1A] font-medium">Par mots-clés dans le libellé</span>
                  </label>
                </div>
                {fonteConfig.useKeywords&&(
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#1A1A1A]">Mots-clés à détecter (séparés par virgule) :</label>
                    <input type="text" value={keywordsInput} onChange={e=>setKeywordsInput(e.target.value)}
                      placeholder="ex : FONTE, DEBRIS, DENTAIRE, BROUTILLE, OR BRUT"
                      className="w-full bg-white border border-[#E0E0E0] rounded-md px-3 py-2 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#E30613]" />
                    <p className="text-[11px] text-[#9CA3AF]">ex : FONTE, DEBRIS, DENTAIRE, BROUTILLE, OR BRUT, [nom fondeur]</p>
                  </div>
                )}
                <button onClick={saveConfig}
                  className="bg-[#E30613] text-white text-xs font-semibold rounded-lg px-4 py-2 hover:bg-[#C8000F] transition-colors">
                  Enregistrer
                </button>
              </div>
            )}
          </div>

          {/* Bandeau famille + filtres */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              <span className="text-sm">💍</span>
              <p className="text-xs text-amber-800">
                <span className="font-semibold">{borCount}</span> BOR + <span className="font-semibold">{bopiCount}</span> BOPI · <span className="font-bold text-[#E30613]">{filteredRows.length}</span> ventes A/B/C analysées
                {overview.pctFonte!=null&&<> · {overview.pctFonte}% part en fonte / {overview.pctVitrine}% en vitrine</>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-[#6B7280] font-semibold">Période :</span>
              {(['all','3m','6m','12m'] as Periode[]).map(p=>(
                <button key={p} onClick={()=>setPeriode(p)} className={btnPeriode(p)}>{p==='all'?'Tout':p}</button>
              ))}
              <span className="text-xs text-[#6B7280] font-semibold ml-2">Grade :</span>
              {(['all','A','B','C'] as GradeFilter[]).map(g=>(
                <button key={g} onClick={()=>setGrade(g)} className={btnGrade(g)}>{g==='all'?'A+B+C':g}</button>
              ))}
            </div>
          </div>

          {/* A.1 — Vue d'ensemble */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#1A1A1A]">📊 Vue d&apos;ensemble</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                {label:'Lignes analysées',  value:overview.count.toLocaleString('fr-FR'), sub:`(${overview.lignesAvecPoids} avec poids)`},
                {label:'Poids racheté',     value:`${overview.poidsTotal} g`, sub:''},
                {label:"Val. d'achat",      value:`${fmtK(overview.va)} €`, sub:''},
                {label:'Val. de vente',     value:`${fmtK(overview.vv)} €`, sub:''},
                {label:'Marge totale',      value:`${fmtK(overview.marge)} €`, sub:'', color:overview.marge<0?'text-red-600':'text-green-600'},
                {label:'Taux de marge',     value:`${overview.tauxMarge}%`, sub:'', color:overview.tauxMarge<10?'text-red-600':overview.tauxMarge>=25?'text-green-600':'text-[#1A1A1A]'},
              ].map((kpi,i)=>(
                <div key={i} className="rounded-lg border border-[#E0E0E0] p-3">
                  <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">{kpi.label}</p>
                  <p className={`text-lg font-black leading-tight ${kpi.color??'text-[#1A1A1A]'}`}>{kpi.value}</p>
                  {kpi.sub&&<p className="text-[10px] text-[#9CA3AF] mt-0.5">{kpi.sub}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* A.2 — Par titre d'or */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-[#1A1A1A]">🏷️ Répartition par titre d&apos;or</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">Détection via &quot;XXX/1000&quot; dans le libellé</p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-[#E0E0E0]">
              <table className="text-xs w-full border-collapse">
                <thead><tr><th className={TH}>Titre</th><th className={THR}>Qté</th><th className={THR}>Poids (g)</th><th className={THR}>Val. achat (€)</th><th className={THR}>Prix moy. (€/g)</th><th className={THR}>Val. vente (€)</th><th className={THR}>Marge (€)</th><th className={THR}>Taux marge</th></tr></thead>
                <tbody>{byTitre.map((r,i)=>(
                  <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                    <td className={TD}><span className="font-medium">{r.label}</span></td>
                    <td className={TDR}>{r.qty}</td>
                    <td className={TDR}>{r.poidsTotal>0?`${r.poidsTotal} g`:'—'}</td>
                    <td className={TDR}>{fmtK(r.va)} €</td>
                    <td className={TDR}>{r.prixMoyen!=null?`${fmtG(r.prixMoyen)} €/g`:'—'}</td>
                    <td className={TDR}>{fmtK(r.vv)} €</td>
                    <td className={TDR}><span className={r.marge<0?'text-red-600 font-semibold':''}>{fmtK(r.marge)} €</span></td>
                    <td className={TDR}><span className={r.tauxMarge<10?'text-red-600':r.tauxMarge>=25?'text-green-600':''}>{r.tauxMarge}%</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {byTitre.find(r=>r.label==='Titre inconnu')&&(
              <p className="text-xs text-orange-600 italic">⚠️ {byTitre.find(r=>r.label==='Titre inconnu')!.qty} ligne(s) sans titre détecté — vérifiez que le libellé contient bien &quot;750/1000&quot;, &quot;585/1000&quot;, etc.</p>
            )}
          </div>

          {/* A.3 — Canal Fonte vs Vitrine */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-[#1A1A1A]">🏪 Canal Fonte vs Vitrine</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">Détection fonte : <em>{fonteConfigRecap(fonteConfig)}</em></p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-[#E0E0E0]">
              <table className="text-xs w-full border-collapse">
                <thead><tr><th className={TH}>Canal</th><th className={THR}>Qté</th><th className={THR}>Poids (g)</th><th className={THR}>Val. achat (€)</th><th className={THR}>Prix moy. (€/g)</th><th className={THR}>Val. vente (€)</th><th className={THR}>Marge (€)</th><th className={THR}>Taux marge</th></tr></thead>
                <tbody>{byCanal.map((r,i)=>(
                  <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                    <td className={TD}><span className="font-medium">{r.label}</span></td>
                    <td className={TDR}>{r.qty}</td>
                    <td className={TDR}>{r.poidsTotal>0?`${r.poidsTotal} g`:'—'}</td>
                    <td className={TDR}>{fmtK(r.va)} €</td>
                    <td className={TDR}>{r.prixMoyen!=null?`${fmtG(r.prixMoyen)} €/g`:'—'}</td>
                    <td className={TDR}>{fmtK(r.vv)} €</td>
                    <td className={TDR}><span className={r.marge<0?'text-red-600 font-semibold':''}>{fmtK(r.marge)} €</span></td>
                    <td className={TDR}><span className={r.tauxMarge<10?'text-red-600':r.tauxMarge>=25?'text-green-600':''}>{r.tauxMarge}%</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {(tauxFonte!=null||diffPrixVF!=null)&&(
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {tauxFonte!=null&&<div className="rounded-lg border border-[#E0E0E0] p-3">
                  <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Taux de fonte sur poids racheté</p>
                  <p className="text-2xl font-black text-[#1A1A1A] mb-1">{tauxFonte}%</p>
                  <p className="text-xs text-[#6B7280]">{tauxFonte<30?'🏬 Orienté vitrine':tauxFonte<=60?'⚖️ Équilibre':'🔥 Orienté fonte'}</p>
                </div>}
                {diffPrixVF!=null&&<div className="rounded-lg border border-[#E0E0E0] p-3">
                  <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Différentiel Vitrine vs Fonte (€/g)</p>
                  <p className={`text-2xl font-black mb-1 ${diffPrixVF>0?'text-green-600':diffPrixVF<0?'text-orange-600':'text-[#1A1A1A]'}`}>{diffPrixVF>0?'+':''}{diffPrixVF} €/g</p>
                  <p className="text-xs text-[#6B7280]">{diffPrixVF>0?'✅ Vitrine rapporte plus que la fonte':'⚠️ Fonte rapporte plus — vérifier politique achat'}</p>
                </div>}
              </div>
            )}
          </div>

          {/* A.4 — Titre × Canal + Cookson */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-[#1A1A1A]">💰 Prix au gramme par titre et canal</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">18k, 14k, 9k séparés Fonte/Vitrine · autres titres regroupés</p>
            </div>
            <div className="bg-[#FFF5F5] border border-[#FECACA] rounded-lg p-3 flex flex-wrap items-center gap-3">
              <label className="text-xs font-semibold text-[#1A1A1A] whitespace-nowrap">💰 Cours de l&apos;or 18 carats aujourd&apos;hui (€/g)</label>
              <input type="number" value={cookson} onChange={e=>setCookson(e.target.value)} placeholder="ex : 42.50"
                className="w-28 bg-white border border-[#E0E0E0] rounded-md px-2 py-1 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]" />
              <span className="text-xs text-[#6B7280] italic">Optionnel — affiche l&apos;écart vs cours pour les lignes 18k</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-[#E0E0E0]">
              <table className="text-xs w-full border-collapse">
                <thead><tr>
                  <th className={TH}>Titre</th><th className={TH}>Canal</th><th className={THR}>Qté</th>
                  <th className={THR}>Poids (g)</th><th className={THR}>Val. achat (€)</th><th className={THR}>PA moy. (€/g)</th>
                  <th className={THR}>Val. vente (€)</th><th className={THR}>Marge (€)</th><th className={THR}>Taux marge</th>
                  {hasCookson&&<th className={THR}>Écart vs cours</th>}
                </tr></thead>
                <tbody>{byTitreCanal.map((r,i)=>{
                  const is18=r.titre==='18 carats (750)';
                  const ecart=hasCookson&&is18&&r.prixMoyen!=null?Math.round((r.prixMoyen-cooksonNum)/cooksonNum*100):null;
                  return (
                    <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                      <td className={TD}><span className="font-medium">{r.titre||r.label.split(' — ')[0]}</span></td>
                      <td className={TD}>{r.canal||'—'}</td>
                      <td className={TDR}>{r.qty}</td>
                      <td className={TDR}>{r.poidsTotal>0?`${r.poidsTotal} g`:'—'}</td>
                      <td className={TDR}>{fmtK(r.va)} €</td>
                      <td className={TDR}>{r.prixMoyen!=null?`${fmtG(r.prixMoyen)} €/g`:'—'}</td>
                      <td className={TDR}>{fmtK(r.vv)} €</td>
                      <td className={TDR}><span className={r.marge<0?'text-red-600 font-semibold':''}>{fmtK(r.marge)} €</span></td>
                      <td className={TDR}><span className={r.tauxMarge<10?'text-red-600':r.tauxMarge>=25?'text-green-600':''}>{r.tauxMarge}%</span></td>
                      {hasCookson&&<td className={TDR}>{ecart!=null?<span className={`font-semibold ${ecart>0?'text-orange-600':ecart<0?'text-green-600':''}`}>{ecart>0?'+':''}{ecart}%</span>:'—'}</td>}
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>

          {/* B — Performance par type de bijou */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#1A1A1A]">💍 Performance par type de bijou</h3>
            {byTypeBijou.length===0?<p className="text-xs text-[#9CA3AF] italic">Aucune donnée.</p>:(
              <div className="overflow-x-auto rounded-lg border border-[#E0E0E0]">
                <table className="text-xs w-full border-collapse">
                  <thead><tr>
                    <th className={TH}>Type</th><th className={THR}>Nb ventes</th><th className={THR}>% du CA</th>
                    <th className={THR}>Marge totale (€)</th><th className={THR}>Taux marge (%)</th>
                    <th className={THR}>Délai moyen (j)</th><th className={THR}>PV moyen (€)</th><th className={THR}>PA moy./g (€/g)</th>
                  </tr></thead>
                  <tbody>{byTypeBijou.map((t,i)=>{
                    const isSS=sweetSpotType?.type===t.type;
                    return (
                      <tr key={i} className={isSS?'bg-green-50':i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                        <td className={TD}><span className="font-medium">{t.type}</span>{isSS&&<span className="ml-1.5 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">⭐ Sweet spot</span>}</td>
                        <td className={TDR}>{t.nbVentes}</td><td className={TDR}>{t.pctCA}%</td>
                        <td className={TDR}><span className={t.margeTotal<0?'text-red-600 font-semibold':''}>{fmtK(t.margeTotal)} €</span></td>
                        <td className={TDR}><span className={t.tauxMarge>=30?'text-green-600 font-semibold':t.tauxMarge<15?'text-red-600':''}>{t.tauxMarge}%</span></td>
                        <td className={TDR}>{t.delaiMoyen!=null?`${t.delaiMoyen} j`:'—'}</td>
                        <td className={TDR}>{fmtK(t.pvMoyen)} €</td>
                        <td className={TDR}>{t.prixMoyenGramme!=null?`${fmtG(t.prixMoyenGramme)} €/g`:'—'}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </div>

          {/* C — Performance par tranche de prix */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#1A1A1A]">💰 Performance par tranche de prix</h3>
            <div className="overflow-x-auto rounded-lg border border-[#E0E0E0]">
              <table className="text-xs w-full border-collapse">
                <thead><tr>
                  <th className={TH}>Tranche prix</th><th className={THR}>Nb ventes</th><th className={THR}>% du CA</th>
                  <th className={THR}>Marge totale (€)</th><th className={THR}>Taux marge (%)</th>
                  <th className={THR}>Délai moyen (j)</th><th className={THR}>Marge unit. moy. (€)</th>
                </tr></thead>
                <tbody>{byTranchePrix.map((t,i)=>{
                  return (
                    <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                      <td className={TD}><span className="font-medium">{t.label}</span></td>
                      <td className={TDR}>{t.nbVentes>0?t.nbVentes:'—'}</td>
                      <td className={TDR}>{t.nbVentes>0?`${t.pctCA}%`:'—'}</td>
                      <td className={TDR}>{t.nbVentes>0?<span className={t.margeTotal<0?'text-red-600 font-semibold':''}>{fmtK(t.margeTotal)} €</span>:'—'}</td>
                      <td className={TDR}>{t.nbVentes>0?<span className={t.tauxMarge>=30?'text-green-600 font-semibold':t.tauxMarge<15?'text-red-600':''}>{t.tauxMarge}%</span>:'—'}</td>
                      <td className={TDR}>{t.nbVentes>0&&t.delaiMoyen!=null?`${t.delaiMoyen} j`:'—'}</td>
                      <td className={TDR}>{t.nbVentes>0?`${fmtK(t.margeUnitaire)} €`:'—'}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>

          {/* D — Performance par tranche de poids */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-[#1A1A1A]">⚖️ Performance par tranche de poids</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">Hors Fonte/Or brut · uniquement les lignes avec poids extrait ({rowsForPoids.length} lignes)</p>
            </div>
            {rowsForPoids.length===0?<p className="text-xs text-[#9CA3AF] italic">Aucune ligne avec poids extrait. Vérifiez que les libellés contiennent le poids au format &quot;X,XX G&quot;.</p>:(
              <div className="overflow-x-auto rounded-lg border border-[#E0E0E0]">
                <table className="text-xs w-full border-collapse">
                  <thead><tr>
                    <th className={TH}>Tranche poids</th><th className={THR}>Nb ventes</th><th className={THR}>% volume</th>
                    <th className={THR}>Poids total (g)</th><th className={THR}>PA moy. (€/g)</th>
                    <th className={THR}>PV moy. (€/g)</th><th className={THR}>Marge unit. moy. (€)</th><th className={THR}>Délai moyen (j)</th>
                  </tr></thead>
                  <tbody>{byTranchePoids.map((t,i)=>(
                    <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                      <td className={TD}><span className="font-medium">{t.label}</span></td>
                      <td className={TDR}>{t.nbVentes>0?t.nbVentes:'—'}</td>
                      <td className={TDR}>{t.nbVentes>0?`${t.pctVolume}%`:'—'}</td>
                      <td className={TDR}>{t.nbVentes>0?`${t.poidsTotal} g`:'—'}</td>
                      <td className={TDR}>{t.paMoyenG!=null?<span className={hasCookson&&t.paMoyenG>cooksonNum?'text-orange-600 font-semibold':''}>{fmtG(t.paMoyenG)} €/g</span>:'—'}</td>
                      <td className={TDR}>{t.pvMoyenG!=null?`${fmtG(t.pvMoyenG)} €/g`:'—'}</td>
                      <td className={TDR}>{t.nbVentes>0?`${fmtK(t.margeUnitaire)} €`:'—'}</td>
                      <td className={TDR}>{t.delaiMoyen!=null?`${t.delaiMoyen} j`:'—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>

          {/* E — Performance acheteurs par titre */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#1A1A1A]">👥 Performance acheteurs — générosité au gramme par titre</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">Comparaison à la médiane magasin du même titre · auto-référencée, sans dépendance au cours du jour</p>
              <p className="text-[11px] text-[#6B7280] mt-1 italic">Note : un acheteur dont les achats sont répartis sur plusieurs titres apparaîtra dans chaque sous-tableau où il atteint 5 achats minimum.</p>
            </div>
            {byAcheteurParTitre.length===0?(
              <p className="text-xs text-[#9CA3AF] italic">Aucun acheteur avec au moins 5 achats.{!allRows.some(r=>r.acheteur)&&' (Colonne Collaborateur non détectée.)'}</p>
            ):(
              <div className="space-y-6">
                {byAcheteurParTitre.map(grp=>(
                  <div key={grp.titreKey} className="space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h4 className="text-xs font-bold text-[#1A1A1A]">{grp.titreLabel}</h4>
                      {grp.medianeG!=null&&(
                        <span className="text-[11px] text-[#6B7280]">
                          Médiane PA/g magasin ({grp.titreKey==='Autres'?'ce groupe':grp.titreKey+' uniquement'}) : <strong className="text-[#1A1A1A]">{fmtG(grp.medianeG)} €/g</strong>
                        </span>
                      )}
                    </div>
                    {grp.insuffisant?(
                      <p className="text-xs text-[#9CA3AF] italic bg-[#FAFAFA] border border-[#E0E0E0] rounded-lg px-4 py-2.5">
                        {grp.titreLabel} : volume insuffisant pour analyser la performance acheteurs (moins de 3 acheteurs avec ≥5 achats)
                      </p>
                    ):(
                      <>
                        <div className="bg-[#F5F5F5] rounded-lg px-3 py-2">
                          <p className="text-[11px] text-[#9CA3AF]">🔴 Très généreux &gt;+15% · 🟠 Généreux +5 à +15% · ✅ Performant ±5% · 🟢 Opportuniste &lt;-5%</p>
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-[#E0E0E0]">
                          <table className="text-xs w-full border-collapse">
                            <thead><tr>
                              <th className={TH}>Acheteur</th><th className={THR}>Nb achats</th>
                              <th className={THR}>Poids racheté (g)</th><th className={THR}>Val. achat (€)</th>
                              <th className={THR}>PA moy. au gramme (€/g)</th><th className={THR}>Marge totale (€)</th>
                              <th className={THR}>Taux marge (%)</th><th className={THR}>Délai moyen (j)</th><th className={TH}>Tag</th><th className={TH}>Action</th>
                            </tr></thead>
                            <tbody>{grp.acheteurs.map((a,i)=>(
                              <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                                <td className={TD}><span className="font-medium">{a.nom||'Inconnu'}</span></td>
                                <td className={TDR}>{a.nbAchats}</td>
                                <td className={TDR}>{a.poidsTotal>0?`${a.poidsTotal} g`:'—'}</td>
                                <td className={TDR}>{fmtK(a.va)} €</td>
                                <td className={TDR}><span className={a.tag==='tres_genereux'?'text-red-600 font-bold':a.tag==='genereux'?'text-orange-600 font-bold':a.tag==='opportuniste'?'text-emerald-600':''}>{a.prixMoyenG!=null?`${fmtG(a.prixMoyenG)} €/g`:'—'}</span></td>
                                <td className={TDR}><span className={a.marge<0?'text-red-600 font-semibold':''}>{fmtK(a.marge)} €</span></td>
                                <td className={TDR}><span className={a.tauxMarge<10?'text-red-600':a.tauxMarge>=25?'text-green-600':''}>{a.tauxMarge}%</span></td>
                                <td className={TDR}>{a.delaiMoyen!=null?`${a.delaiMoyen} j`:'—'}</td>
                                <td className="px-3 py-2 border-t border-[#F0F0F0]"><TagBadge tag={a.tag} /></td>
                                <td className="px-3 py-2 border-t border-[#F0F0F0]">{a.tag==='tres_genereux'&&onAddAction&&(
                                  <button onClick={()=>addToPAP(`acheteur_${grp.titreKey}_${a.nom}`,`Bijouterie — Briefer l'acheteur ${a.nom||'Inconnu'} sur la marge ${grp.titreLabel}`,`Acheteur très généreux sur ${grp.titreLabel} (PA moy. ${a.prixMoyenG!=null?fmtG(a.prixMoyenG):'-'}€/g). Recadrer sur la médiane magasin (${grp.medianeG!=null?fmtG(grp.medianeG):'-'}€/g).`)} className="text-xs text-white bg-[#E30613] hover:bg-red-700 rounded-full px-2 py-0.5 whitespace-nowrap transition-colors">+ PAP</button>
                                )}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* F — Fonte / Or brut */}
          {fonteStats&&(
            <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-[#1A1A1A]">🔥 Or destiné à la fonte</h3>
                <p className="text-xs text-[#9CA3AF] mt-0.5">Détection basée sur votre configuration : <em>{fonteConfigRecap(fonteConfig)}</em></p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {label:'Nb lignes fonte',     value:fonteStats.nbLignes.toString()},
                  {label:'Poids total (g)',      value:fonteStats.poidsTotal>0?`${fonteStats.poidsTotal} g`:'—'},
                  {label:'Val. achat total (€)', value:`${fmtK(fonteStats.vaTotal)} €`},
                  {label:'PA moyen (€/g)',       value:fonteStats.paMoyenG!=null?`${fmtG(fonteStats.paMoyenG)} €/g`:'—'},
                ].map((kpi,i)=>(
                  <div key={i} className="rounded-lg border border-[#E0E0E0] p-3">
                    <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">{kpi.label}</p>
                    <p className="text-lg font-black text-[#1A1A1A]">{kpi.value}</p>
                  </div>
                ))}
              </div>
              {fonteStats.breakdown&&(
                <div className="bg-[#F5F5F5] rounded-lg px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-[#1A1A1A]">Répartition de la détection :</p>
                  <p className="text-xs text-[#6B7280]">Par Grade D : <strong>{fonteStats.breakdown.byGradeD.n}</strong> lignes ({fonteStats.breakdown.byGradeD.poids} g)</p>
                  <p className="text-xs text-[#6B7280]">Par mots-clés : <strong>{fonteStats.breakdown.byKw.n}</strong> lignes ({fonteStats.breakdown.byKw.poids} g)</p>
                  <p className="text-xs text-[#6B7280]">Total unique : <strong>{fonteStats.nbLignes}</strong> lignes ({fonteStats.poidsTotal} g)</p>
                </div>
              )}
              <div className="bg-[#FFF5F5] border border-[#FECACA] rounded-lg p-3 flex flex-wrap items-center gap-3">
                <label className="text-xs font-semibold text-[#1A1A1A] whitespace-nowrap">
                  💰 Cours de l&apos;or 18k aujourd&apos;hui (€/g) <span className="font-normal text-[#9CA3AF]">(optionnel)</span>
                </label>
                <input type="number" value={cookson} onChange={e=>setCookson(e.target.value)} placeholder="ex : 42.50"
                  className="w-28 bg-white border border-[#E0E0E0] rounded-md px-2 py-1 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]" />
              </div>
              {hasCookson&&fonteStats.paMoyenG!=null&&(
                <div className="bg-[#F5F5F5] rounded-lg px-4 py-3 space-y-1">
                  <p className="text-xs text-[#1A1A1A]">
                    Cours saisi : <strong>{cooksonNum} €/g</strong> · PA moyen fonte : <strong>{fonteStats.paMoyenG} €/g</strong>
                  </p>
                  <p className="text-xs text-[#1A1A1A]">
                    Écart : <strong className={fonteStats.paMoyenG>cooksonNum?'text-red-600':fonteStats.paMoyenG<cooksonNum*0.9?'text-green-600':''}>
                      {Math.round((fonteStats.paMoyenG-cooksonNum)/cooksonNum*100)}%
                    </strong> vs cours
                    {fonteStats.paMoyenG>cooksonNum?" ⚠️ Vous rachetez au-dessus du cours de l'or":" ✅ Marge de sécurité vs cours"}
                  </p>
                  {margePotentielFonte!=null&&fonteStats.poidsTotal>0&&(
                    <p className="text-xs text-[#1A1A1A]">
                      Marge potentielle si refonte au cours : <strong className={margePotentielFonte>=0?'text-green-700':'text-red-600'}>{fmtK(margePotentielFonte)} €</strong>
                      <span className="text-[#9CA3AF] ml-1">({fonteStats.poidsTotal} g × ({cooksonNum} - {fonteStats.paMoyenG}) €/g)</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* G — Pièces lentes */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-[#1A1A1A]">🔴 Pièces lentes — produits unitaires</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">Délai &gt; 90j ET écart PV vs cote EP &gt; ±20% · triés par délai décroissant</p>
            </div>
            {!filteredRows.some(r=>r.ep!=null)?(
              <p className="text-xs text-[#9CA3AF] italic">Colonne EasyPrice (cote EP vente) non détectée dans le fichier — cette section nécessite la colonne EasyPrice dans le journal Athéna.</p>
            ):flops.length===0?(
              <p className="text-xs text-[#9CA3AF] italic">Aucune pièce détectée avec délai &gt; 90j et écart PV/EP &gt; ±20% sur cette période. ✅</p>
            ):(
              <div className="overflow-x-auto rounded-lg border border-[#E0E0E0]">
                <table className="text-xs w-full border-collapse">
                  <thead><tr>
                    <th className={TH}>Libellé produit</th><th className={TH}>Type</th>
                    <th className={THR}>Poids (g)</th><th className={THR}>PA (€)</th><th className={THR}>PV (€)</th>
                    <th className={THR}>Délai (j)</th><th className={THR}>Cote EP (€)</th><th className={THR}>Écart %</th><th className={TH}>Action</th>
                  </tr></thead>
                  <tbody>{flops.map((f,i)=>(
                    <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                      <td className={`${TD} max-w-[180px] truncate`} title={f.lib}>{f.lib}</td>
                      <td className={TD}>{f.type}</td>
                      <td className={TDR}>{f.poids!=null?`${fmtG(f.poids)} g`:'—'}</td>
                      <td className={TDR}>{fmtK(f.pa)} €</td>
                      <td className={TDR}>{fmtK(f.pv)} €</td>
                      <td className={TDR}><span className="text-red-600 font-semibold">{f.dv} j</span></td>
                      <td className={TDR}>{fmtK(f.ep)} €</td>
                      <td className={TDR}><span className={`font-semibold ${Math.abs(f.ecartEP)>30?'text-red-600':'text-orange-600'}`}>{f.ecartEP>0?'+':''}{f.ecartEP}%</span></td>
                      <td className={TD}>{onAddAction&&(
                        <button onClick={()=>addToPAP(`pieceLente_${f.lib}`,`Bijouterie — Animer ${f.lib.slice(0,40)}`,`Pièce lente (${f.dv}j, écart EP ${f.ecartEP>0?'+':''}${f.ecartEP}%). Animer en vitrine ou ajuster le prix de vente.`)} className="text-xs text-white bg-[#E30613] hover:bg-red-700 rounded-full px-2 py-0.5 whitespace-nowrap transition-colors">+ PAP</button>
                      )}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>

          {/* H — Recommandations stratégiques */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#1A1A1A]">🎯 Recommandations stratégiques</h3>
            <div className="space-y-2">
              {sweetSpotType&&(
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
                  <p className="text-xs text-green-800">
                    <strong>⭐ Sweet spot identifié :</strong> le type <strong>{sweetSpotType.type}</strong>
                    {byTranchePoids.filter(t=>t.nbVentes>0).sort((a,b)=>(b.pctVolume??0)-(a.pctVolume??0))[0]&&<> pour la tranche de poids <strong>{byTranchePoids.filter(t=>t.nbVentes>0).sort((a,b)=>(b.pctVolume??0)-(a.pctVolume??0))[0].label}</strong></>}
                    {' '}— taux de marge {sweetSpotType.tauxMarge}%, délai {sweetSpotType.delaiMoyen!=null?`${sweetSpotType.delaiMoyen}j`:'—'}. À prioriser au sourcing comptoir.
                  </p>
                  {onAddAction&&(papAdded.has('sweetspot')
                    ?<span className="text-xs text-green-700 font-semibold bg-green-100 border border-green-300 rounded-full px-3 py-1 whitespace-nowrap">✓ Ajouté</span>
                    :<button onClick={()=>addToPAP('sweetspot',`Prioriser les achats de type ${sweetSpotType.type}`,`Sweet spot identifié : type ${sweetSpotType.type}, taux marge ${sweetSpotType.tauxMarge}%, délai ${sweetSpotType.delaiMoyen??'—'}j. À prioriser au sourcing comptoir.`)} className="text-xs text-white bg-[#E30613] hover:bg-red-700 rounded-full px-3 py-1 whitespace-nowrap transition-colors">+ PAP</button>
                  )}
                </div>
              )}
              {(()=>{
                const g18=byAcheteurParTitre.find(g=>g.titreKey==='18 carats (750)');
                const genereux=g18?.acheteurs.filter(a=>a.tag==='tres_genereux'||a.tag==='genereux')??[];
                if (!genereux.length) return null;
                return (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
                    <p className="text-xs text-orange-800">
                      <strong>👥 Acheteurs à briefer en priorité (18k) :</strong>{' '}
                      {genereux.slice(0,3).map(a=>`${a.nom} (${a.prixMoyenG} €/g)`).join(', ')}.{' '}
                      Ces acheteurs paient l&apos;or 18k au-dessus de la médiane magasin — à recadrer sur les objectifs de marge.
                    </p>
                    {onAddAction&&(papAdded.has('acheteurs18k')
                      ?<span className="text-xs text-orange-700 font-semibold bg-orange-100 border border-orange-300 rounded-full px-3 py-1 whitespace-nowrap">✓ Ajouté</span>
                      :<button onClick={()=>addToPAP('acheteurs18k','Briefer les acheteurs sur la marge 18k',`Acheteurs généreux identifiés : ${genereux.slice(0,3).map(a=>a.nom).join(', ')}. Recadrage sur les objectifs de marge 18k (médiane magasin).`)} className="text-xs text-white bg-[#E30613] hover:bg-red-700 rounded-full px-3 py-1 whitespace-nowrap transition-colors">+ PAP</button>
                    )}
                  </div>
                );
              })()}
              {fonteStats&&fonteStats.poidsTotal>0&&(
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
                  <p className="text-xs text-amber-800">
                    <strong>🔥 Fonte :</strong> {fonteStats.poidsTotal} g à valoriser
                    {margePotentielFonte!=null?<>, marge potentielle <strong>{fmtK(margePotentielFonte)} €</strong> au cours actuel ({cooksonNum} €/g).</>:' — saisissez le cours du jour ci-dessus pour calculer la marge potentielle.'}
                  </p>
                  {onAddAction&&(papAdded.has('fonte')
                    ?<span className="text-xs text-amber-700 font-semibold bg-amber-100 border border-amber-300 rounded-full px-3 py-1 whitespace-nowrap">✓ Ajouté</span>
                    :<button onClick={()=>addToPAP('fonte','Valoriser la fonte — déclencher le passage en fonderie',`${fonteStats.poidsTotal}g à valoriser${margePotentielFonte!=null?`, marge potentielle ${fmtK(margePotentielFonte)}€`:''}.`)} className="text-xs text-white bg-[#E30613] hover:bg-red-700 rounded-full px-3 py-1 whitespace-nowrap transition-colors">+ PAP</button>
                  )}
                </div>
              )}
              {!sweetSpotType&&byAcheteurParTitre.every(g=>g.insuffisant)&&!fonteStats&&(
                <p className="text-xs text-[#9CA3AF] italic">Données insuffisantes pour générer des recommandations automatiques.</p>
              )}
            </div>
          </div>

        </div>
      )}

      </>}


      {bijTab==='gamme-reseau'&&(
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-[#1A1A1A]">📈 Gamme vs réseau — Benchmarks par famille</h3>
            <p className="text-xs text-[#9CA3AF] mt-0.5">Répartition réelle des ventes (données importées dans l&apos;onglet Analyse) comparée aux benchmarks réseau EasyCash. Données basées sur le prix EP.</p>
          </div>
          {allRows.length===0&&(
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-xs text-amber-800">
              <strong>Aucune donnée disponible.</strong> Importez votre export Athéna dans l&apos;onglet Analyse ci-dessus — les données seront automatiquement disponibles ici.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {BENCHMARKS_GAMME.map(def=>{
              const rows=allRows.filter(r=>r.famCode===def.fc&&r.ep!=null&&(r.ep as number)>0);
              const total=rows.length;
              const trancheData=def.tranches.map(tr=>{
                const n=rows.filter(r=>(r.ep as number)>=tr.min&&(r.ep as number)<tr.max).length;
                const real=total>0?Math.round(n/total*100):null;
                const ecart=real!=null?real-tr.bench:null;
                const badge=ecart==null?null:Math.abs(ecart)<=5?'vert':Math.abs(ecart)<=15?'orange':'rouge';
                return {label:tr.label,bench:tr.bench,real,ecart,badge};
              });
              return (
                <div key={def.fc} className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[#1A1A1A]">{def.label}</h4>
                    <span className="text-[10px] text-[#9CA3AF]">{total>0?`${total} ventes`:'Aucune donnée'}</span>
                  </div>
                  <div className="space-y-4">
                    {trancheData.map((t,i)=>(
                      <div key={i} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-[#1A1A1A]">{t.label}</span>
                          {t.badge&&t.ecart!=null&&(
                            <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
                              t.badge==='vert'?'bg-green-100 text-green-700':
                              t.badge==='orange'?'bg-orange-100 text-orange-700':
                              'bg-red-100 text-red-700'
                            }`}>{t.ecart>0?'+':''}{t.ecart} pt</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#E30613] font-semibold w-14">Réseau</span>
                          <div className="flex-1 bg-[#F0F0F0] rounded-full h-2">
                            <div className="bg-[#E30613] rounded-full h-2" style={{width:`${t.bench}%`}}/>
                          </div>
                          <span className="text-[10px] font-bold text-[#E30613] w-6 text-right">{t.bench}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#6B7280] font-semibold w-14">Magasin</span>
                          <div className="flex-1 bg-[#F0F0F0] rounded-full h-2">
                            {t.real!=null
                              ?<div className="bg-[#6B7280] rounded-full h-2 transition-all" style={{width:`${t.real}%`}}/>
                              :<div className="bg-[#E0E0E0] rounded-full h-2 w-full"/>
                            }
                          </div>
                          <span className="text-[10px] font-bold text-[#6B7280] w-6 text-right">{t.real!=null?`${t.real}%`:'—'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Product-type axis */}
          {(()=>{
            const typeRows=allRows.filter(r=>r.famCode==='BOR'||r.famCode==='BOPI');
            const total=typeRows.length;
            const typeData=BENCH_TYPES.map(bt=>{
              const n=typeRows.filter(r=>detectTypeBijou(r.lib)===bt.type).length;
              const real=total>0?Math.round(n/total*100):null;
              const ecart=real!=null?real-bt.bench:null;
              const badge=ecart==null?null:Math.abs(ecart)<=5?'vert':Math.abs(ecart)<=15?'orange':'rouge';
              return {...bt,real,ecart,badge};
            });
            return (
              <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#1A1A1A]">💍 Répartition par type de produit (BOR + BOPI)</h4>
                  <span className="text-[10px] text-[#9CA3AF]">{total>0?`${total} ventes`:'Aucune donnée'}</span>
                </div>
                <div className="space-y-4">
                  {typeData.map((t,i)=>(
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[#1A1A1A]">{t.type}</span>
                        {t.badge&&t.ecart!=null&&(
                          <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
                            t.badge==='vert'?'bg-green-100 text-green-700':
                            t.badge==='orange'?'bg-orange-100 text-orange-700':
                            'bg-red-100 text-red-700'
                          }`}>{t.ecart>0?'+':''}{t.ecart} pt</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#E30613] font-semibold w-14">Réseau</span>
                        <div className="flex-1 bg-[#F0F0F0] rounded-full h-2">
                          <div className="bg-[#E30613] rounded-full h-2" style={{width:`${t.bench}%`}}/>
                        </div>
                        <span className="text-[10px] font-bold text-[#E30613] w-6 text-right">{t.bench}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#6B7280] font-semibold w-14">Magasin</span>
                        <div className="flex-1 bg-[#F0F0F0] rounded-full h-2">
                          {t.real!=null
                            ?<div className="bg-[#6B7280] rounded-full h-2 transition-all" style={{width:`${t.real}%`}}/>
                            :<div className="bg-[#E0E0E0] rounded-full h-2 w-full"/>
                          }
                        </div>
                        <span className="text-[10px] font-bold text-[#6B7280] w-6 text-right">{t.real!=null?`${t.real}%`:'—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-[#9CA3AF]">Benchmark réseau : Bague 35% · BO 25% · Collier 15% · Bracelet 13% · Pendentif 8% · Autre 6% — détection par libellé article.</p>
              </div>
            );
          })()}
          <p className="text-[11px] text-[#9CA3AF] italic">Sources : fiche pratique EasyCash bijouterie. Écart ≤ 5 pt → vert · 6-15 pt → orange · &gt; 15 pt → rouge.</p>
        </div>
      )}

    </div>
  );
}
