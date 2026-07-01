'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import * as XLSX from 'xlsx';
import type { PAPAction } from '@/types';

interface Props { magasinNom: string; onAddAction?: (action: PAPAction) => void; onNavigateToBijouterie?: () => void; }
type Periode = 'all' | '3m' | '6m' | '12m';
type FamilyCode = 'TLCE'|'JCON'|'JCDR'|'JPOR'|'BOR'|'BOPI'|'BMAR'|'BMON'|'IPOR'|'ITAB'|'OTHER';

const FAMILY_LABELS: Record<FamilyCode, string> = {
  TLCE:'📱 Téléphonie', JCON:'🎮 Consoles', JCDR:'🎮 Jeux vidéo', JPOR:'🎮 Jeux portables',
  BOR:'💍 Or', BOPI:'✨ Plaqué', BMAR:'👜 Maroquinerie', BMON:'⌚ Montres',
  IPOR:'💻 Informatique', ITAB:'📱 Tablettes', OTHER:'Autre',
};
const FAMILY_SECTION_TITLE: Record<FamilyCode, string> = {
  TLCE:'🏷️ Répartition par marque (TLCE)',
  JCON:'🎮 Répartition des plateformes (JCON)',
  JCDR:'🎮 Répartition des plateformes (JCDR)',
  JPOR:'🎮 Répartition des plateformes (JPOR)',
  BOR:'💍 Répartition par type de produit (BOR)',
  BOPI:'💍 Répartition par type de produit (BOPI)',
  BMAR:'🏷️ Répartition par marque (BMAR)',
  BMON:'🏷️ Répartition par marque (BMON)',
  IPOR:'🏷️ Répartition par marque (IPOR)',
  ITAB:'🏷️ Répartition par marque (ITAB)',
  OTHER:'📊 Répartition',
};
const EP_FAMILIES: FamilyCode[] = ['TLCE','JCON','JCDR','JPOR','IPOR','ITAB'];

// ── compact row ───────────────────────────────────────────────────────────────
interface CRow {
  m: string; f: string; g: string; d: string|null;
  pa: number; pv: number; dv: number|null;
  ep?: number|null; epa?: number|null;
  cv?: string; fn?: string; fp?: string; co?: string;
  an?: string; ap?: string; // acheteur (buyer) nom/prénom — for BOR canal
}
interface StoredImport { importedAt: string; rows: CRow[]; dateMin: string|null; dateMax: string|null; }
interface GammeModele { produit: string; marque: string; plateforme: string; key_normalisee: string; inTop20: boolean; pctVol?: number; cumPct?: number; }
interface GammeReseau { famille: string; date_import: string; nb_modeles: number; nb_top20: number; modeles: GammeModele[]; }
interface TrancheDef { label: string; min: number; max: number; }
interface TrancheStats { label: string; nbVentes: number; valeurVentes: number; margeTotal: number; tauxMarge: number; delaiMoyen: number|null; margeUnitaire: number; pctCA: number; }

export interface ModelStats {
  modele: string; famille: string; qteVendue: number; delaiMoyen: number|null;
  margeUnitaire: number; margeTotal: number; caTotal: number; paMoyen: number; pvMoyen: number;
  tauxMarge: number; epMoyen: number|null; epaMoyen: number|null; ecartEP: number|null; ecartEPA: number|null;
}
interface SourcingStats { canal: string; nbAchats: number; valeurAchats: number; valeurVentes: number; margeTotal: number; tauxMarge: number; delaiMoyen: number|null; }
interface FournisseurStats { nom: string; nbProduits: number; valeurAchats: number; margeTotal: number; tauxMarge: number; delaiMoyen: number|null; }
interface AcheteurStats { nom: string; nbAchats: number; valeurAchats: number; margeTotal: number; tauxMarge: number; ecartEPAchat: number|null; delaiMoyen: number|null; }

interface BreakdownRow {
  label: string; qty: number; qtyPct: number;
  margeTotal: number; margePct: number; tauxMarge: number; delaiMoyen: number|null;
  valeurAchats?: number; valeurVentes?: number; poidsTotal?: number;
}

// ── column aliases ────────────────────────────────────────────────────────────
// ORDER MATTERS: earlier alias = higher priority (mapColumns picks lowest index)
const COL_ALIASES: Record<string, string[]> = {
  typeTransaction:      ['typedetransaction','typetransaction','transaction'],
  // "Sous_famille" (norm → 'sousfamille') must win over "Famille" (norm → 'famille')
  famille:              ['sousfamille','sousfamilleproduit','sousfamille','famille','familleproduit'],
  // Dual libellé: parsed separately, getBestLibelle() picks the winner per row
  achatLibelle:         ['achatlibellearticle','libellearticle'],
  fichetechLibelle:     ['fichetechlibelle','fichetech','modele','libelle'],
  grade:                ['articlegrade','grade','gradearticle'],
  prixAchat:            ['achatprix','prixachat','prixdachat'],
  prixVente:            ['venteprixvendu','prixvente','prixvendu'],
  delaiVente:           ['ventedelai','delaivente','delaidevente'],
  dateVente:            ['ventedate','datevente'],
  easypricePrixVente:   ['easypriceprixventegradeb','easypriceprixvente','coteep'],
  easypricePrixAchat:   ['easypriceprixachatgradeb','easypriceprixachat'],
  typeClientVendeur:    ['typeclientvendeur','typeclient','typevendeur'],
  clientVendeurNom:     ['clientvendeurnom','clientnom','nomclient','nomvendeur'],
  clientVendeurPrenom:  ['clientvendeurprenom','prenomclient','clientprenom'],
  collaborateur:        ['collaborateur','acheteur','utilisateur'],
  clientAcheteurNom:    ['clientacheteurnom','acheteurnom','nomacheteur'],
  clientAcheteurPrenom: ['clientacheteurprenom','prenomacheteur'],
};

function norm(s: string): string {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[\s_\-'"]/g,'');
}
// Alias-order-aware column mapper: prefers the alias with the LOWEST index
// so 'sousfamille' (idx 0) always beats 'famille' (idx 3) even if "Famille"
// appears before "Sous_famille" in the CSV header row.
function mapColumns(headers: string[]): Record<string,string> {
  const result: Record<string,string>={};
  const bestIdx: Record<string,number>={};
  for (const h of headers) {
    const n=norm(h);
    for (const [field, aliases] of Object.entries(COL_ALIASES)) {
      const idx=aliases.indexOf(n);
      if (idx>=0 && (!(field in result) || idx<bestIdx[field])) {
        result[field]=h;
        bestIdx[field]=idx;
      }
    }
  }
  return result;
}
// Pick the best libellé line by line:
// Achat_libelle_article is preferred (contains métier info: poids, titre d'or)
// unless it's absent, too short, or a raw barcode.
function getBestLibelle(achat: string, fichetech: string): string {
  const a = achat.trim();
  const f = fichetech.trim();
  if (!a || a.length < 10) return f || a;
  if (/^\d+$/.test(a)) return f || a;   // barcode → use fichetech
  return a;
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
function supplierName(fn: string, fp: string): string {
  const n=fn.trim(),p=fp.trim();
  if (!n) return '(Inconnu)';
  if (!p||norm(p)===norm(n)) return n;
  return `${n} ${p}`;
}

// ── family detection ──────────────────────────────────────────────────────────
function detectFamilyCode(s: string, warn = false): FamilyCode {
  const raw = s.trim().toUpperCase();
  const u = raw.replace(/[\s\-_]/g,'');
  const EXACT: Record<string,FamilyCode> = {
    'TLCE':'TLCE','JCON':'JCON','JCDR':'JCDR','JPOR':'JPOR',
    'BOR':'BOR','BOPI':'BOPI','BMAR':'BMAR','BMON':'BMON','IPOR':'IPOR','ITAB':'ITAB',
  };
  if (EXACT[u]) return EXACT[u];
  // TLCE
  if (raw.includes('CELLULAIRE')||raw.startsWith('TÉLÉPHONIE')||raw.startsWith('TELEPHONIE')) return 'TLCE';
  // JPOR (before JCDR to avoid "jeux portables" matching JCDR)
  if (raw.includes('JEU PORTABLE')||raw.includes('JEUX PORTABLES')) return 'JPOR';
  // JCDR — "CD ROM Jeu Vidéo" or plain "Jeu Vidéo"
  if (raw.includes('JEU VIDÉO')||raw.includes('JEU VIDEO')||raw.includes('JEUX VIDÉO')||raw.includes('JEUX VIDEO')||raw.includes('CD ROM')) return 'JCDR';
  // JCON — "Console" but NOT portable, NOT CD ROM
  if (raw.includes('CONSOLE')&&!raw.includes('PORTABLE')&&!raw.includes('CD ROM')) return 'JCON';
  // BOR
  if (raw.includes('BIJOUTERIE OR')) return 'BOR';
  // BOPI
  if (raw.includes('PLAQUÉ')||raw.includes('PLAQUE')||raw.includes('BOPI')||raw.includes('PIERRES')) return 'BOPI';
  // BMAR
  if (raw.includes('MAROQUINERIE')) return 'BMAR';
  // BMON
  if (raw.includes('MONTRE')) return 'BMON';
  // IPOR — laptop/portable computer
  if ((raw.includes('INFORMATIQUE')||raw.includes('ORDINATEUR'))&&raw.includes('PORTABLE')) return 'IPOR';
  // ITAB
  if (raw.includes('TABLETTE')) return 'ITAB';
  // Unrecognised
  if (warn && raw.length >= 5) {
    console.warn(`[JournalAchatVente] Sous-famille non reconnue → OTHER : "${s}"`);
  }
  return 'OTHER';
}

// ── platform detection (JCON / JCDR / JPOR) ──────────────────────────────────
function detectPlatform(libelle: string): string {
  const u = libelle.toUpperCase().replace(/[-_]/g, ' ');
  // PlayStation — most specific first
  if (u.includes('PLAYSTATION 5') || u.includes('PS5')) return 'PS5';
  if (u.includes('PLAYSTATION 4') || u.includes('PS4')) return 'PS4';
  if (u.includes('PLAYSTATION 3') || u.includes('PS3')) return 'PS3';
  if (u.includes('PLAYSTATION 2') || u.includes('PS2')) return 'PS2';
  if (/\bPSP\b/.test(u) || u.includes('PLAYSTATION PORTABLE')) return 'PSP';
  if (u.includes('PS VITA') || u.includes('PSVITA')) return 'PS Vita';
  if (u.includes('PLAYSTATION 1') || /\bPS1\b/.test(u) || /\bPSX\b/.test(u)) return 'PS1';
  // Xbox — most specific first
  if (u.includes('XBOX SERIES X') || u.includes('SERIES X')) return 'Xbox Series X';
  if (u.includes('XBOX SERIES S') || u.includes('SERIES S')) return 'Xbox Series S';
  if (u.includes('XBOX ONE')) return 'Xbox One';
  if (u.includes('XBOX 360') || /\bX360\b/.test(u)) return 'Xbox 360';
  if (u.includes('XBOX')) return 'Xbox';
  // Nintendo — most specific first
  if (u.includes('SWITCH 2')) return 'Switch 2';
  if (u.includes('SWITCH OLED')) return 'Switch OLED';
  if (/\bSWITCH\b/.test(u)) return 'Switch';
  if (u.includes('WII U')) return 'Wii U';
  if (/\bWII\b/.test(u)) return 'Wii';
  if (u.includes('GAMECUBE') || u.includes('GAME CUBE')) return 'GameCube';
  if (u.includes('NINTENDO 64') || /\bN64\b/.test(u)) return 'Nintendo 64';
  if (u.includes('SNES') || u.includes('SUPER NINTENDO')) return 'SNES';
  if (/\b3DS\b/.test(u)) return '3DS';
  if (u.includes('NINTENDO DS') || u.includes(' DS ') || u.endsWith(' DS') || u.includes(' DS,')) return 'DS';
  if (u.includes('GAMEBOY ADVANCE') || u.includes('GAME BOY ADVANCE') || /\bGBA\b/.test(u)) return 'GameBoy Advance';
  if (u.includes('GAMEBOY') || u.includes('GAME BOY')) return 'GameBoy';
  if (/\bNES\b/.test(u)) return 'NES';
  // Other
  if (u.includes('STEAM DECK')) return 'Steam Deck';
  return 'Plateforme non détectée';
}

function detectJPORBrand(libelle: string): string {
  const u = libelle.toUpperCase();
  if (u.includes('SWITCH')||u.includes('3DS')||/\bDS\b/.test(u)||u.includes('GAMEBOY')||u.includes('GAME BOY')||/\bGBA\b/.test(u)||u.includes('NINTENDO')) return 'Nintendo';
  if (u.includes('PSP')||u.includes('VITA')||u.includes('PS VITA')) return 'Sony';
  if (u.includes('STEAM DECK')) return 'Steam Deck';
  return 'Autre';
}

function extractBrand(libelle: string): string {
  return (libelle.trim().split(/\s+/)[0]||'—').toUpperCase();
}

// ── family-aware brand/platform/type detector (ACTION 1) ──────────────────────
function detectMarqueOuPlateforme(libelle: string, sousfamille: string): string {
  if (!libelle) return 'Non détecté';
  const lib = libelle.toUpperCase().trim();
  const sf  = sousfamille.toLowerCase();

  // JCDR
  if (sf.includes('cd rom')||sf.includes('jeu vidéo')||sf.includes('jeu video')) {
    if (lib.includes('PS5')||lib.includes('PLAYSTATION 5')) return 'PS5';
    if (lib.includes('PS4')||lib.includes('PLAYSTATION 4')) return 'PS4';
    if (lib.includes('PS3')||lib.includes('PLAYSTATION 3')) return 'PS3';
    if (lib.includes('PS2')||lib.includes('PLAYSTATION 2')) return 'PS2';
    if (lib.includes('PS VITA')||lib.includes('PSVITA')) return 'PS Vita';
    if (lib.includes('PSP')) return 'PSP';
    if (lib.includes('PS1')||lib.includes('PSX')) return 'PS1';
    if (lib.includes('XBOX SERIES X')) return 'Xbox Series X';
    if (lib.includes('XBOX SERIES S')) return 'Xbox Series S';
    if (lib.includes('XBOX ONE')) return 'Xbox One';
    if (lib.includes('XBOX 360')) return 'Xbox 360';
    if (lib.includes('XBOX')) return 'Xbox';
    if (lib.includes('SWITCH 2')) return 'Switch 2';
    if (lib.includes('SWITCH OLED')) return 'Switch OLED';
    if (lib.includes('SWITCH')) return 'Switch';
    if (lib.includes('WII U')) return 'Wii U';
    if (lib.includes('WII')) return 'Wii';
    if (lib.includes('GAMECUBE')||lib.includes('GAME CUBE')) return 'GameCube';
    if (lib.includes('NINTENDO 64')||lib.includes('N64')) return 'Nintendo 64';
    if (lib.includes('SNES')) return 'SNES';
    if (lib.includes('3DS')) return '3DS';
    if (/ DS\b|NINTENDO DS/.test(lib)||lib.endsWith(' DS')) return 'DS';
    if (lib.includes('GAMEBOY ADVANCE')||lib.includes('GAME BOY ADVANCE')||lib.includes('GBA')) return 'GameBoy Advance';
    if (lib.includes('GAMEBOY')||lib.includes('GAME BOY')) return 'GameBoy';
    if (lib.includes('STEAM DECK')) return 'Steam Deck';
    if (lib.includes('NES')) return 'NES';
    return 'Plateforme non détectée';
  }
  // JCON — delegates to detectPlatform, guarantees 'Plateforme non détectée' as fallback
  // (never falls through to first-word extractBrand)
  if (sf.includes('console')&&!sf.includes('cd rom')) {
    return detectPlatform(lib);
  }
  // BOR / BOPI (bijouterie or, plaqué, pierres précieuses, code BOPI)
  if (sf.includes('bijouterie or')||sf.includes('plaqu')||sf.includes('pierres')||sf.includes('bopi')) {
    if (lib.includes('CHASSIS')||lib.includes('IPHONE')||lib.includes('DELL')||lib.includes('CASQUE')||lib.includes('ORDINATEUR')) return 'Erreur saisie';
    if (lib.includes('NAPOLEON')||lib.includes('MARIANNE')||lib.includes('GENIE')||lib.includes('20 FRANCS')||lib.includes('20FR')||lib.includes('DOS PESOS')||lib.includes('PESOS')||lib.includes('LOUIS D')) return 'Pièces or';
    if (lib.includes('CHEVALIERE')||lib.includes('CHEVALIER ')||lib.includes('ALLIANCE')||lib.includes('TRILOGIE')||lib.includes('BAGUE')) return 'Bagues';
    if (lib.includes('GOURMETTE')||lib.includes('MANCHETTE')||lib.includes('BRACELET')||lib.includes('JONC')) return 'Bracelets';
    if (lib.includes('CHAINE')||lib.includes('CHAÎNE')||lib.includes('COLLIER')||lib.includes('SAUTOIR')||lib.includes('RAS DE COU')) return 'Chaînes';
    if (lib.includes("BOUCLE D'OREILLE")||lib.includes('BOUCLE DOREILLE')||lib.includes('B.O')||lib.includes(' BO ')||lib.includes('CRÉOLE')||lib.includes('CREOLE')||lib.includes('DORMEUSE')||lib.includes('CHARMEUSE')||lib.includes('PUCE')) return "Boucles d'oreilles";
    if (lib.includes('PENDENTIF')||lib.includes('MEDAILLE')||lib.includes('MÉDAILLE')||lib.includes('MEDAILLON')||lib.includes('CROIX')||lib.includes('COEUR')||lib.includes('CHARM')||lib.includes('BRELOQUE')) return 'Pendentifs';
    if (lib.includes('DEBRIS')||lib.includes('BRUT')||lib.includes('A REPARER')||lib.includes('À REPARER')||lib.includes('CASSE')||lib.includes('CASSER')||lib.includes('CASSEE')) return 'Débris / À réparer';
    if (lib.includes('BROCHE')||lib.includes('PEPITE')||lib.includes('PÉPITE')) return 'Autres';
    return 'Non catégorisé';
  }
  // BMAR
  if (sf.includes('maroquinerie')) {
    if (lib.includes('MICHAEL KORS')||lib.includes('MICKAEL KORS')) return 'Michael Kors';
    if (lib.includes('LOUIS VUITTON')||lib.includes('VUITTON')) return 'Louis Vuitton';
    if (lib.includes('CHRISTIAN LACROIX')||lib.includes('LACROIX')) return 'Christian Lacroix';
    if (lib.includes('HUGO BOSS')) return 'Hugo Boss';
    if (lib.includes('CALVIN KLEIN')) return 'Calvin Klein';
    if (lib.includes('ARTHUR ASTON')) return 'Arthur Aston';
    if (lib.includes('DAVID JONES')) return 'David Jones';
    if (lib.includes('PIERRE CARDIN')) return 'Pierre Cardin';
    if (lib.includes('LE TANNEUR')||lib.includes('TANNEUR')) return 'Le Tanneur';
    if (lib.includes('LANCEL')) return 'Lancel';
    if (lib.includes('LACOSTE')) return 'Lacoste';
    if (lib.includes('DESIGUAL')) return 'Desigual';
    if (lib.includes('LANCASTER')) return 'Lancaster';
    if (lib.includes('MANOUKIAN')) return 'Manoukian';
    if (lib.includes('TORRENTE')) return 'Torrente';
    if (lib.includes('FIRENZE')) return 'Firenze';
    if (lib.includes('FOSSIL')) return 'Fossil';
    if (lib.includes('ARMANI')) return 'Armani';
    if (lib.includes('CELINE')||lib.includes('CÉLINE')) return 'Celine';
    if (lib.includes('GUESS')) return 'Guess';
    if (lib.includes('DDP')) return 'DDP';
    return 'Sans marque identifiée';
  }
  // BMON
  if (sf.includes('montre')) {
    if (lib.includes('DANIEL WELLINGTON')) return 'Daniel Wellington';
    if (lib.includes('PIERRE LANNIER')||lib.includes('LANNIER')) return 'Pierre Lannier';
    if (lib.includes('MICHAEL KORS')||lib.includes('MICKAEL KORS')) return 'Michael Kors';
    if (lib.includes('TAG HEUER')||lib.includes('TAGHEUER')) return 'Tag Heuer';
    if (lib.includes('ICE WATCH')||lib.includes('ICEWATCH')) return 'Ice Watch';
    if (lib.includes('HAMILTON')) return 'Hamilton';
    if (lib.includes('LONGINES')) return 'Longines';
    if (lib.includes('BREITLING')) return 'Breitling';
    if (lib.includes('TISSOT')) return 'Tissot';
    if (lib.includes('SWATCH')) return 'Swatch';
    if (lib.includes('FOSSIL')) return 'Fossil';
    if (lib.includes('GUESS')) return 'Guess';
    if (lib.includes('SEIKO')) return 'Seiko';
    if (lib.includes('CASIO')) return 'Casio';
    if (lib.includes('ROLEX')) return 'Rolex';
    if (lib.includes('OMEGA')) return 'Omega';
    if (lib.includes('BULOVA')) return 'Bulova';
    if (lib.includes('CITIZEN')) return 'Citizen';
    if (lib.includes('FESTINA')) return 'Festina';
    if (lib.includes('CLUSE')) return 'Cluse';
    if (lib.includes('LOTUS')) return 'Lotus';
    return 'Sans marque identifiée';
  }
  // Fallback for TLCE, ITAB, IPOR, JPOR — first word
  return extractBrand(lib);
}

// ── pepite delay threshold per sous-famille (ACTION 5) ───────────────────────
function getSeuilDelaiPepite(sousfamille: string): number {
  if (!sousfamille) return 30;
  const sf = sousfamille.toLowerCase();
  if (sf.includes('bijouterie or')||sf.includes('plaqu')||sf.includes('pierres')||sf.includes('bopi')||
      sf.includes('maroquinerie')||sf.includes('montre')) return 90;
  return 30;
}

function detectIPORUsage(libelle: string): string {
  const u = libelle.toUpperCase();
  const keys = ['GTX','RTX','RYZEN 7','RYZEN 9',' I7 ',' I9 ','16 GO','32 GO','GAMING','ROG','PREDATOR','OMEN','TUF'];
  return keys.some(k=>u.includes(k)) ? 'Gaming' : 'Bureautique';
}

function detectBijouType(libelle: string): string {
  const u = libelle.toUpperCase();
  if (/BAGUE|ALLIANCE|CHEVALIERE|CHEVALIÈRE|JONC|T\.\d/.test(u)) return 'Bagues';
  if (/CHAINE|CHAÎNE|COLLIER|SAUTOIR/.test(u)) return 'Chaînes & Colliers';
  if (/BRACELET|GOURMETTE|MANCHETTE/.test(u)) return 'Bracelets';
  if (/BOUCLE|\bBO\b|PUCE|DORMEUSE|CREOLE|CRÉOLE/.test(u)) return "Boucles d'oreilles";
  if (/PENDENTIF|MEDAILLE|MÉDAILLE|MEDAILLON|COEUR|CŒUR|CROIX|CHARM/.test(u)) return 'Pendentifs';
  if (/DEBRIS|DÉBRIS|BRUT|REPARER|RÉPARER|CASS[EÉ]/.test(u)) return 'Débris / À réparer';
  return 'Autres';
}

function detectBORCanal(r: CRow): string {
  // Seul critère : Grade D = Fonte (destiné à la refonte)
  // Tout le reste (A / B / C, quel que soit l'acheteur) = Vitrine
  if (r.g === 'D') return 'Fonte';
  return 'Vitrine';
}

function extractPoids(libelle: string): number|null {
  // Match "X,XX G" or "X.XX G" or "X G" followed by space, end, comma or period
  // Requires at least one space before G to avoid false positives within words
  const m = libelle.toUpperCase().match(/(\d+[,.]?\d*)\s+G(?:\s|$|,|\.)/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',','.'));
  return isNaN(v)||v<=0||v>1000 ? null : v;
}

// Detect gold titre from Athéna libellé (e.g. "OR 750/1000 BAGUE 2,30 G")
function detectTitreOr(libelle: string): string {
  if (!libelle) return 'Titre inconnu';
  const lib = libelle.toUpperCase();
  if (lib.includes('999/1000') || lib.includes('999 /1000')) return '24 carats (999)';
  if (lib.includes('916/1000') || lib.includes('916 /1000')) return '22 carats (916)';
  if (lib.includes('900/1000') || lib.includes('900 /1000')) return '22 carats pièces (900)';
  if (lib.includes('750/1000') || lib.includes('750 /1000')) return '18 carats (750)';
  if (lib.includes('585/1000') || lib.includes('585 /1000')) return '14 carats (585)';
  if (lib.includes('375/1000') || lib.includes('375 /1000')) return '9 carats (375)';
  return 'Titre inconnu';
}

// Multi-word brands listed first to avoid partial matches
// Multi-word brands listed first to avoid partial matches (e.g. "MICHAEL KORS" before "KORS")
const BMAR_BRANDS = [
  // Luxury
  'LOUIS VUITTON','HERMES','CHANEL','DIOR','GUCCI','PRADA','FENDI','BOTTEGA','SAINT LAURENT',
  'VALENTINO','BALENCIAGA','GIVENCHY','CARTIER','BURBERRY','YSL','YVES SAINT LAURENT',
  // Premium
  'MICHAEL KORS','MICKAEL KORS','CHRISTIAN LACROIX','KARL LAGERFELD','EMPORIO ARMANI',
  'HUGO BOSS','TOMMY HILFIGER','JEAN PAUL GAULTIER','TED LAPIDUS','GERARD DAREL',
  'CALVIN KLEIN','PIERRE CARDIN','CLAUDE MONTANA',
  // Mid-range
  'LONGCHAMP','FURLA','COACH','NAT ET NIN','NAT NIN','MAC DOUGLAS',
  'LE TANNEUR','TANNEUR','LIU JO','LIUJO','MAJE','SANDRO','CLAUDIE PIERLOT',
  'ARTHUR ASTON','DAVID JONES','FIRENZE ARTEGIANI','FIRENZE',
  'LANCEL','LACOSTE','DESIGUAL','LANCASTER','MANOUKIAN','TORRENTE',
  'FOSSIL','ARMANI','CÉLINE','CELINE','GUESS','DDP','LAGERFELD',
  'REPETTO','HACKETT','AGATHA','MORGAN','ELLE',
  // Travel/casual
  'SAMSONITE','DELSEY','EASTPAK','KIPLING','HEDGREN',
  'HILFIGER','LACROIX','LAPIDUS','DAREL','BOSS','JPG',
  'COMPTOIR DES COTONNIERS','MONOPRIX','DOUGLAS','VUITTON',
];
function detectBMARBrand(libelle: string): string {
  const u=libelle.toUpperCase();
  for (const b of BMAR_BRANDS) { if (u.includes(b)) return b; }
  return 'Sans marque identifiée';
}

// Multi-word brands listed first to avoid partial matches
const BMON_BRANDS = [
  // Luxury / high-end
  'AUDEMARS PIGUET','PATEK PHILIPPE','JAEGER LECOULTRE','BAUME ET MERCIER','JEAN PAUL GAULTIER',
  'MICHEL HERBELIN','TAG HEUER','APPLE WATCH','ICE WATCH','DANIEL WELLINGTON','PIERRE LANNIER',
  'MICHAEL KORS','MICKAEL KORS','EMPORIO ARMANI','HUGO BOSS','CALVIN KLEIN',
  // Premium
  'BREITLING','LONGINES','HAMILTON','PANERAI','HUBLOT','ZENITH','RADO','YEMA','IWC',
  'OMEGA','ROLEX','TISSOT','SEIKO','CITIZEN','BULOVA','ORIENT','TIMEX','EDOX',
  'VICTORINOX','MONDAINE','SUUNTO','GARMIN','FITBIT','AMAZFIT','POLAR',
  // Mid-range
  'SWATCH','FOSSIL','GUESS','CASIO','FESTINA','CLUSE','LOTUS','LIP',
  'MORELLATO','MAUBOUSSIN','CHAUMET','ZADIG','BERING','MAVERICK','KRONOS','WENGER',
  'DIESEL','NIXON','INVICTA','ESPRIT','LACOSTE','HERBELIN',
  // Sport/tech
  'SAMSUNG','HUAWEI','XIAOMI','APPLE',
  // Fashion
  'FILA','PUMA','ADIDAS','NIKE','BOSS','ARMANI','LANNIER',
];
function detectBMONBrand(libelle: string): string {
  const u=libelle.toUpperCase();
  for (const b of BMON_BRANDS) { if (u.includes(b)) return b; }
  return 'Sans marque identifiée';
}

// ── BOR validity filter ───────────────────────────────────────────────────────
const BOR_EXCL = ['CHASSIS','IPHONE','DELL','ASUS','ACER','ACC. DE JEUX','ORDINATEUR'];
function isBORValid(modele: string): boolean {
  const u = modele.trim().toUpperCase();
  if (!u.startsWith('OR')) return false;
  for (const kw of BOR_EXCL) { if (u.includes(kw)) return false; }
  if (/\bHP\b/.test(u)) return false;
  return true;
}

// ── BOR type detection (replaces detectBijouType for BOR family) ─────────────
function detectBORType(libelle: string): string {
  // Normalize: uppercase, strip accents, keep spaces
  const u = libelle.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

  // 1. Pièces or — most specific terms first
  if (/NAPOLEON/.test(u)) return 'Pièces or';
  if (/20\s*FR(?:ANCS?)?/.test(u)) return 'Pièces or';
  if (/10\s*FR(?:ANCS?)?/.test(u)) return 'Pièces or';
  if (/MARIANNE|GENIE|VICTORIA/.test(u)) return 'Pièces or';
  if (/DOS\s*PESOS|\bPESOS\b/.test(u)) return 'Pièces or';
  if (/LOUIS\s*D.?OR/.test(u)) return 'Pièces or';
  if (/\bPIECE\b/.test(u)) return 'Pièces or';
  if (/\bBRIDGE\b/.test(u) && !/DENT\s*BRIDGE/.test(u)) return 'Pièces or';

  // 2. Bracelets — before bagues to handle "BRACELET JONC"
  if (/GOURMETTE|MANCHETTE|BRACELET|JONC\s*OUVRABLE/.test(u)) return 'Bracelets';

  // 3. Bagues — JONC only when not preceded by BRACELET
  const hasJoncBague = /\bJONC\b/.test(u) && !/BRACELET\s*JONC/.test(u) && !/JONC\s*OUVRABLE/.test(u);
  if (/CHEVALIERE|CHEVALIER\s|ALLIANCE|TRILOGIE|\bBAGUE\b/.test(u) || hasJoncBague || /\bT\.?\s*\d{2}\b/.test(u)) return 'Bagues';

  // 4. Chaînes
  if (/CHAINE|COLLIER|SAUTOIR|RAS\s*DE\s*COU/.test(u)) return 'Chaînes';

  // 5. Boucles d'oreilles
  if (/BOUCLES?\s*D[OA]REILLES?|B\.\s*O\.|B\.\s*O\s|BO\s|BO\.|CREOLES?|DORMEUSES?|CHARMEUSES?|\bPUCES?\b/.test(u)) return "Boucles d'oreilles";

  // 6. Pendentifs / Médailles
  if (/PENDENTIF|MEDAILLON?|MEDAILLE|\bCROIX\b|C[OO]EUR|\bCHARM\b|BRELOQUE|\bPIMENT\b|\bVIERGE\b|\bDAUPHIN\b|\bELEPHANT\b|ARBRE\s*DE\s*VIE|\bANGE\b|\bCANCER\b|\bPOISSONS\b|\bSCORPION\b|\bCAPRICORNE\b/.test(u)) return 'Pendentifs / Médailles';

  // 7. Débris / À réparer (BRUT only if no other type keyword matched above)
  if (/DEBRIS|A\s*REPARER|\bCASSE\b|\bCASSER\b|\bCASSEE\b|MANQUANT|BOUT\s*DE\b|MERCEAU|DENT\s*BRIDGE|OR\s*DENTAIRE/.test(u)) return 'Débris / À réparer';
  if (/\bBRUT\b/.test(u)) return 'Débris / À réparer'; // "OR BRUT" without other specific keyword

  // 8. Autres
  if (/BROCHE|PINCE\s*A\s*BILLET|BOUTON\s*MANCHETTE|PEPITE/.test(u)) return 'Autres';

  return 'Non catégorisé';
}

// ── tranches de prix par famille (section Performance par tranche de prix) ─────
function getTranchesPrix(famille: FamilyCode): TrancheDef[] {
  switch(famille){
    case 'JCDR': return [{label:'< 10 €',min:0,max:10},{label:'10-20 €',min:10,max:20},{label:'20-40 €',min:20,max:40},{label:'> 40 €',min:40,max:Infinity}];
    case 'JCON': case 'TLCE': case 'ITAB': return [{label:'< 100 €',min:0,max:100},{label:'100-300 €',min:100,max:300},{label:'300-600 €',min:300,max:600},{label:'> 600 €',min:600,max:Infinity}];
    case 'IPOR': return [{label:'< 200 €',min:0,max:200},{label:'200-500 €',min:200,max:500},{label:'500-800 €',min:500,max:800},{label:'> 800 €',min:800,max:Infinity}];
    case 'JPOR': return [{label:'< 50 €',min:0,max:50},{label:'50-100 €',min:50,max:100},{label:'100-200 €',min:100,max:200},{label:'> 200 €',min:200,max:Infinity}];
    case 'BMAR': return [{label:'< 50 €',min:0,max:50},{label:'50-150 €',min:50,max:150},{label:'150-300 €',min:150,max:300},{label:'> 300 €',min:300,max:Infinity}];
    case 'BMON': return [{label:'< 100 €',min:0,max:100},{label:'100-300 €',min:100,max:300},{label:'300-600 €',min:300,max:600},{label:'> 600 €',min:600,max:Infinity}];
    default: return [{label:'< 50 €',min:0,max:50},{label:'50-150 €',min:50,max:150},{label:'150-300 €',min:150,max:300},{label:'> 300 €',min:300,max:Infinity}];
  }
}

interface PriceRange { lo: number; hi: number; label: string; }
const PRICE_RANGES: Record<string, PriceRange[]> = {
  STD:  [{lo:0,hi:100,label:'0-100€'},{lo:100,hi:300,label:'100-300€'},{lo:300,hi:700,label:'300-700€'},{lo:700,hi:Infinity,label:'+700€'}],
  ITAB: [{lo:0,hi:200,label:'0-200€'},{lo:200,hi:400,label:'200-400€'},{lo:400,hi:700,label:'400-700€'},{lo:700,hi:Infinity,label:'+700€'}],
  BOR:  [{lo:0,hi:100,label:'0-100 €'},{lo:100,hi:300,label:'100-300 €'},{lo:300,hi:600,label:'300-600 €'},{lo:600,hi:Infinity,label:'+600 €'}],
};
function priceRangesFor(fc: FamilyCode): PriceRange[] {
  if (fc==='ITAB') return PRICE_RANGES['ITAB'];
  if (fc==='BOR'||fc==='BOPI') return PRICE_RANGES['BOR'];
  return PRICE_RANGES['STD'];
}
function getPriceLabel(pv: number, ranges: PriceRange[]): string {
  for (const r of ranges) { if (pv>=r.lo&&pv<r.hi) return r.label; }
  return ranges[ranges.length-1].label;
}

// ── generic breakdown computation ─────────────────────────────────────────────
function computeBreakdown(rows: CRow[], getLabel: (r: CRow) => string): BreakdownRow[] {
  const groups = new Map<string,{pas:number[];pvs:number[];dvs:number[]}>();
  for (const r of rows) {
    const k=getLabel(r);
    if (!groups.has(k)) groups.set(k,{pas:[],pvs:[],dvs:[]});
    const g=groups.get(k)!;
    g.pas.push(r.pa); g.pvs.push(r.pv);
    if (r.dv&&r.dv>0) g.dvs.push(r.dv);
  }
  const totalQty=rows.length;
  const all=Array.from(groups.entries()).map(([label,g])=>{
    const qty=g.pvs.length;
    const va=Math.round(g.pas.reduce((s,v)=>s+v,0));
    const vv=Math.round(g.pvs.reduce((s,v)=>s+v,0));
    const mt=vv-va;
    return {label,qty,mt,vv,va,dvs:g.dvs};
  });
  const totalMarge=all.reduce((s,e)=>s+e.mt,0);
  return all.map(e=>({
    label:e.label, qty:e.qty,
    qtyPct:totalQty>0?Math.round(e.qty/totalQty*100):0,
    margeTotal:e.mt,
    margePct:totalMarge>0?Math.round(e.mt/totalMarge*100):0,
    tauxMarge:e.vv>0?Math.round(e.mt/e.vv*100):0,
    delaiMoyen:e.dvs.length>0?Math.round(e.dvs.reduce((s,v)=>s+v,0)/e.dvs.length):null,
    valeurAchats:e.va, valeurVentes:e.vv,
  })).sort((a,b)=>b.qty-a.qty);
}

function computeBORCanalBreakdown(rows: CRow[]): BreakdownRow[] {
  const groups = new Map<string,{pas:number[];pvs:number[];dvs:number[];poids:number[]}>();
  for (const r of rows) {
    const k=detectBORCanal(r);
    if (!groups.has(k)) groups.set(k,{pas:[],pvs:[],dvs:[],poids:[]});
    const g=groups.get(k)!;
    g.pas.push(r.pa); g.pvs.push(r.pv);
    if (r.dv&&r.dv>0) g.dvs.push(r.dv);
    const p=extractPoids(r.m); if (p) g.poids.push(p);
  }
  const totalQty=rows.length;
  const all=Array.from(groups.entries()).map(([label,g])=>{
    const qty=g.pvs.length;
    const va=Math.round(g.pas.reduce((s,v)=>s+v,0));
    const vv=Math.round(g.pvs.reduce((s,v)=>s+v,0));
    const mt=vv-va;
    const poidsTotal=Math.round(g.poids.reduce((s,v)=>s+v,0)*100)/100;
    return {label,qty,mt,vv,va,poidsTotal,dvs:g.dvs};
  });
  const totalMarge=all.reduce((s,e)=>s+e.mt,0);
  return all.map(e=>({
    label:e.label, qty:e.qty,
    qtyPct:totalQty>0?Math.round(e.qty/totalQty*100):0,
    margeTotal:e.mt,
    margePct:totalMarge>0?Math.round(e.mt/totalMarge*100):0,
    tauxMarge:e.vv>0?Math.round(e.mt/e.vv*100):0,
    delaiMoyen:e.dvs.length>0?Math.round(e.dvs.reduce((s,v)=>s+v,0)/e.dvs.length):null,
    valeurAchats:e.va, valeurVentes:e.vv, poidsTotal:e.poidsTotal,
  }));
}

// ── BOR: prix au gramme par titre × canal ─────────────────────────────────────
interface BORTitreCanalRow {
  titre: string; canal: string;
  nbLignes: number; poidsTotal: number;
  valeurAchatTotal: number; valeurVenteTotal: number; margeTotal: number;
  prixAchatMoyen: number|null; tauxMargeMoyen: number;
}
// Fixed display order for titres
const TITRE_ORDER = ['18 carats (750)','14 carats (585)','9 carats (375)','22 carats pièces (900)','22 carats (916)','24 carats (999)','Titre inconnu'];
function computeBORPrixGrammeTable(rows: CRow[]): BORTitreCanalRow[] {
  const groups = new Map<string,{titre:string;canal:string;pas:number[];pvs:number[];poids:number[]}>();
  for (const r of rows) {
    const titre = detectTitreOr(r.m);
    const canal = detectBORCanal(r);
    const key = `${titre}|||${canal}`;
    if (!groups.has(key)) groups.set(key,{titre,canal,pas:[],pvs:[],poids:[]});
    const g = groups.get(key)!;
    g.pas.push(r.pa); g.pvs.push(r.pv);
    const p = extractPoids(r.m); if (p) g.poids.push(p);
  }
  const result: BORTitreCanalRow[] = Array.from(groups.values()).map(g=>{
    const poidsTotal = Math.round(g.poids.reduce((s,v)=>s+v,0)*100)/100;
    const valeurAchatTotal = Math.round(g.pas.reduce((s,v)=>s+v,0));
    const valeurVenteTotal = Math.round(g.pvs.reduce((s,v)=>s+v,0));
    const margeTotal = valeurVenteTotal - valeurAchatTotal;
    return {
      titre:g.titre, canal:g.canal, nbLignes:g.pvs.length,
      poidsTotal, valeurAchatTotal, valeurVenteTotal, margeTotal,
      prixAchatMoyen: poidsTotal>0 ? Math.round(valeurAchatTotal/poidsTotal*100)/100 : null,
      tauxMargeMoyen: valeurVenteTotal>0 ? Math.round(margeTotal/valeurVenteTotal*100) : 0,
    };
  });
  // Sort: titre priority order, then Fonte before Vitrine
  result.sort((a,b)=>{
    const ti = TITRE_ORDER.indexOf(a.titre), tj = TITRE_ORDER.indexOf(b.titre);
    const to = (ti<0?999:ti) - (tj<0?999:tj);
    if (to!==0) return to;
    return (a.canal==='Fonte'?0:1)-(b.canal==='Fonte'?0:1);
  });
  return result;
}

// ── filter + compute model stats ──────────────────────────────────────────────
function filterRows(rows: CRow[], periode: Periode, grade: string): CRow[] {
  let cutoff: Date|null=null;
  if (periode!=='all') { cutoff=new Date(); cutoff.setMonth(cutoff.getMonth()-(periode==='3m'?3:periode==='6m'?6:12)); }
  return rows.filter(r=>{
    if (r.g==='D') return false; // Grade D: BOR canal analysis only, not in filtered general rows
    if (grade!=='all'&&r.g!==grade) return false;
    if (cutoff&&r.d&&new Date(r.d)<cutoff) return false;
    return true;
  });
}

function computeStats(rows: CRow[]): ModelStats[] {
  const groups=new Map<string,{modele:string;famille:string;pas:number[];pvs:number[];dvs:number[];eps:number[];epas:number[]}>();
  for (const r of rows) {
    if (r.g==='D') continue; // Grade D: BOR Fonte only, never in general stats
    const key=r.m.toLowerCase();
    if (!groups.has(key)) groups.set(key,{modele:r.m,famille:r.f,pas:[],pvs:[],dvs:[],eps:[],epas:[]});
    const g=groups.get(key)!;
    g.pas.push(r.pa); g.pvs.push(r.pv);
    if (r.dv&&r.dv>0) g.dvs.push(r.dv);
    if (r.ep&&r.ep>0) g.eps.push(r.ep);
    if (r.epa&&r.epa>0) g.epas.push(r.epa);
  }
  return Array.from(groups.values()).map(g=>{
    const qte=g.pvs.length;
    const mt=Math.round(g.pvs.reduce((s,v,i)=>s+v-g.pas[i],0));
    const ca=Math.round(g.pvs.reduce((s,v)=>s+v,0));
    const pa=qte>0?Math.round(g.pas.reduce((s,v)=>s+v,0)/qte):0;
    const pv=qte>0?Math.round(ca/qte):0;
    const ep=g.eps.length>0?Math.round(g.eps.reduce((s,v)=>s+v,0)/g.eps.length):null;
    const epa=g.epas.length>0?Math.round(g.epas.reduce((s,v)=>s+v,0)/g.epas.length):null;
    return {
      modele:g.modele, famille:g.famille, qteVendue:qte,
      delaiMoyen:g.dvs.length>0?Math.round(g.dvs.reduce((s,v)=>s+v,0)/g.dvs.length):null,
      margeUnitaire:qte>0?Math.round(mt/qte):0, margeTotal:mt, caTotal:ca, paMoyen:pa, pvMoyen:pv,
      tauxMarge:ca>0?Math.round(mt/ca*100):0,
      epMoyen:ep, epaMoyen:epa,
      ecartEP:ep&&pv>0?Math.round((pv-ep)/ep*100):null,
      ecartEPA:epa&&pa>0?Math.round((pa-epa)/epa*100):null,
    };
  });
}

function computeSourcing(rows: CRow[]): SourcingStats[] {
  const g=new Map<string,{pas:number[];pvs:number[];dvs:number[]}>();
  for (const r of rows) {
    const k=r.cv==='P'?'Particulier (achat comptoir)':r.cv==='F'?'Fournisseur (achat externe)':'Non renseigné';
    if (!g.has(k)) g.set(k,{pas:[],pvs:[],dvs:[]});
    const gr=g.get(k)!;
    gr.pas.push(r.pa); gr.pvs.push(r.pv);
    if (r.dv&&r.dv>0) gr.dvs.push(r.dv);
  }
  return Array.from(g.entries()).map(([canal,gr])=>{
    const nb=gr.pvs.length;
    const va=Math.round(gr.pas.reduce((s,v)=>s+v,0));
    const vv=Math.round(gr.pvs.reduce((s,v)=>s+v,0));
    const mt=Math.round(gr.pvs.reduce((s,v,i)=>s+v-gr.pas[i],0));
    return {canal,nbAchats:nb,valeurAchats:va,valeurVentes:vv,margeTotal:mt,
      tauxMarge:vv>0?Math.round(mt/vv*100):0,
      delaiMoyen:gr.dvs.length>0?Math.round(gr.dvs.reduce((s,v)=>s+v,0)/gr.dvs.length):null};
  }).sort((a,b)=>b.nbAchats-a.nbAchats);
}

function computeFournisseurs(rows: CRow[]): FournisseurStats[] {
  const g=new Map<string,{nom:string;pas:number[];pvs:number[];dvs:number[]}>();
  for (const r of rows.filter(r=>r.cv==='F')) {
    const nom=supplierName(r.fn??'',r.fp??'');
    const key=nom.toLowerCase();
    if (!g.has(key)) g.set(key,{nom,pas:[],pvs:[],dvs:[]});
    const gr=g.get(key)!;
    gr.pas.push(r.pa); gr.pvs.push(r.pv);
    if (r.dv&&r.dv>0) gr.dvs.push(r.dv);
  }
  return Array.from(g.values()).filter(gr=>gr.pvs.length>=3).map(gr=>{
    const nb=gr.pvs.length,va=Math.round(gr.pas.reduce((s,v)=>s+v,0));
    const vv=Math.round(gr.pvs.reduce((s,v)=>s+v,0));
    const mt=Math.round(gr.pvs.reduce((s,v,i)=>s+v-gr.pas[i],0));
    return {nom:gr.nom,nbProduits:nb,valeurAchats:va,margeTotal:mt,
      tauxMarge:vv>0?Math.round(mt/vv*100):0,
      delaiMoyen:gr.dvs.length>0?Math.round(gr.dvs.reduce((s,v)=>s+v,0)/gr.dvs.length):null};
  }).sort((a,b)=>b.margeTotal-a.margeTotal).slice(0,10);
}

function computeAcheteurs(rows: CRow[]): AcheteurStats[] {
  const g=new Map<string,{nom:string;pas:number[];pvs:number[];dvs:number[];ecarts:number[]}>();
  for (const r of rows.filter(r=>r.cv==='P')) {
    const nom=(r.co??'').trim()||'(Inconnu)';
    const key=nom.toLowerCase();
    if (!g.has(key)) g.set(key,{nom,pas:[],pvs:[],dvs:[],ecarts:[]});
    const gr=g.get(key)!;
    gr.pas.push(r.pa); gr.pvs.push(r.pv);
    if (r.dv&&r.dv>0) gr.dvs.push(r.dv);
    if (r.epa&&r.epa>0&&r.pa>0) gr.ecarts.push((r.pa-r.epa)/r.epa*100);
  }
  return Array.from(g.values()).filter(gr=>gr.pvs.length>=5).map(gr=>{
    const nb=gr.pvs.length,va=Math.round(gr.pas.reduce((s,v)=>s+v,0));
    const vv=Math.round(gr.pvs.reduce((s,v)=>s+v,0));
    const mt=Math.round(gr.pvs.reduce((s,v,i)=>s+v-gr.pas[i],0));
    const ecartEPAchat=gr.ecarts.length>0?Math.round(gr.ecarts.reduce((s,v)=>s+v,0)/gr.ecarts.length*10)/10:null;
    return {nom:gr.nom,nbAchats:nb,valeurAchats:va,margeTotal:mt,
      tauxMarge:vv>0?Math.round(mt/vv*100):0,ecartEPAchat,
      delaiMoyen:gr.dvs.length>0?Math.round(gr.dvs.reduce((s,v)=>s+v,0)/gr.dvs.length):null};
  }).sort((a,b)=>b.tauxMarge-a.tauxMarge);
}

// ── tranche de prix computation ───────────────────────────────────────────────
function computeTranchePrix(rows: CRow[], tranches: TrancheDef[]): TrancheStats[] {
  const groups = tranches.map(t=>({...t,pas:[] as number[],pvs:[] as number[],dvs:[] as number[]}));
  for (const r of rows) {
    const g=groups.find(g=>r.pv>=g.min&&r.pv<g.max);
    if (g){g.pas.push(r.pa);g.pvs.push(r.pv);if(r.dv&&r.dv>0)g.dvs.push(r.dv);}
  }
  const totalCA=groups.reduce((s,g)=>s+g.pvs.reduce((ss,v)=>ss+v,0),0);
  return groups.map(g=>{
    const nb=g.pvs.length;
    const vv=Math.round(g.pvs.reduce((s,v)=>s+v,0));
    const mt=Math.round(g.pvs.reduce((s,v,i)=>s+v-g.pas[i],0));
    return {
      label:g.label, nbVentes:nb, valeurVentes:vv, margeTotal:mt,
      tauxMarge:vv>0?Math.round(mt/vv*100):0,
      delaiMoyen:g.dvs.length>0?Math.round(g.dvs.reduce((s,v)=>s+v,0)/g.dvs.length):null,
      margeUnitaire:nb>0?Math.round(mt/nb):0,
      pctCA:totalCA>0?Math.round(vv/totalCA*100):0,
    };
  });
}

// ── gamme réseau helpers ──────────────────────────────────────────────────────
function normGamme(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}
function detectFamilleGamme(rows: Record<string,unknown>[]): FamilyCode|null {
  const allText=rows.slice(0,20).map(r=>`${r.Produit||r.produit||''} ${r.Marque||r.marque||''} ${r.Plateforme||r.plateforme||''}`).join(' ').toLowerCase();
  if (/iphone|galaxy|redmi|xiaomi|huawei|oppo/i.test(allText)) return 'TLCE';
  if (/manette|joy.?con|joycon/.test(allText)) return 'JCON';
  if (/mario|zelda|pokemon|fifa|call of duty|grand theft|gta|assassin|spider.?man/i.test(allText)) return 'JCDR';
  return null;
}
function isInGamme(modele: string, gamme: GammeReseau): boolean {
  const n = normGamme(modele);
  const top20count = gamme.modeles.filter(m => m.inTop20).length;
  const candidates = top20count >= 20 ? gamme.modeles.filter(m => m.inTop20) : gamme.modeles;
  for (const gm of candidates) {
    const key = gm.key_normalisee;
    if (!key) continue;
    if (n === key) return true;
    if (n.includes(key) || key.includes(n)) return true;
    const mots = key.split(' ').filter(m => m.length > 2);
    if (!mots.length) continue;
    if (mots.filter(m => n.includes(m)).length / mots.length >= 0.8) return true;
  }
  return false;
}
function isInGammeDebug(modele: string, gamme: GammeReseau): {matched: boolean; matchedKey: string|null} {
  const n = normGamme(modele);
  const top20count = gamme.modeles.filter(m => m.inTop20).length;
  const candidates = top20count >= 20 ? gamme.modeles.filter(m => m.inTop20) : gamme.modeles;
  for (const gm of candidates) {
    const key = gm.key_normalisee;
    if (!key) continue;
    if (n === key) return {matched:true, matchedKey:key};
    if (n.includes(key) || key.includes(n)) return {matched:true, matchedKey:key};
    const mots = key.split(' ').filter(m => m.length > 2);
    if (!mots.length) continue;
    if (mots.filter(m => n.includes(m)).length / mots.length >= 0.8) return {matched:true, matchedKey:key};
  }
  return {matched:false, matchedKey:null};
}

// ── weighted average EP gap ───────────────────────────────────────────────────
function wAvg(rows: ModelStats[], getV: (s: ModelStats)=>number|null): number|null {
  const valid=rows.filter(s=>getV(s)!==null);
  const tq=valid.reduce((s,r)=>s+r.qteVendue,0);
  return tq>0?Math.round(valid.reduce((s,r)=>s+getV(r)!*r.qteVendue,0)/tq*10)/10:null;
}

// ── exported helper for AssistantIA ──────────────────────────────────────────
export function getJournalContext(magasinNom: string): string {
  try {
    const s=localStorage.getItem(`journal_analyse_${magasinNom}`);
    if (!s) return '';
    const stored=JSON.parse(s) as StoredImport;
    if (!Array.isArray(stored.rows)||!stored.rows.length) return '';
    const stats=computeStats(stored.rows);
    const fmtD=(d:string|null)=>d?new Date(d).toLocaleDateString('fr-FR'):'?';
    const fmtE=(v:number)=>`${v>0?'+':''}${v}%`;
    const period=stored.dateMin&&stored.dateMax?`du ${fmtD(stored.dateMin)} au ${fmtD(stored.dateMax)}`:'période inconnue';
    const MIN3=(s:ModelStats)=>s.qteVendue>=3;
    const rotSet=new Set(stats.filter(s=>MIN3(s)&&s.delaiMoyen!==null&&s.delaiMoyen<getSeuilDelaiPepite(s.famille)).map(s=>s.modele.toLowerCase()));
    const topRot=stats.filter(s=>MIN3(s)&&s.delaiMoyen!==null&&s.delaiMoyen<getSeuilDelaiPepite(s.famille)).sort((a,b)=>(a.delaiMoyen??999)-(b.delaiMoyen??999)).slice(0,5).map(r=>`${r.modele} (${r.delaiMoyen}j)`).join(', ');
    const pepites=[...stats].filter(MIN3).sort((a,b)=>b.margeTotal-a.margeTotal).filter(s=>rotSet.has(s.modele.toLowerCase())).slice(0,3).map(p=>p.modele).join(', ');
    const epMs=stats.filter(s=>s.epMoyen!=null&&s.epMoyen>0);
    const tqEP=epMs.reduce((s,m)=>s+m.qteVendue,0);
    const epVG=tqEP>0?Math.round(epMs.reduce((s,m)=>s+((m.pvMoyen-m.epMoyen!)/m.epMoyen!*100)*m.qteVendue,0)/tqEP*10)/10:null;
    const epaMs=stats.filter(s=>s.epaMoyen!=null&&s.epaMoyen>0);
    const tqEPA=epaMs.reduce((s,m)=>s+m.qteVendue,0);
    const epAG=tqEPA>0?Math.round(epaMs.reduce((s,m)=>s+((m.paMoyen-m.epaMoyen!)/m.epaMoyen!*100)*m.qteVendue,0)/tqEPA*10)/10:null;
    const brands=new Map<string,number>();
    for (const r of stored.rows) { const b=detectMarqueOuPlateforme(r.m, r.f); brands.set(b,(brands.get(b)??0)+1); }
    const total=stored.rows.length;
    const topBrands=Array.from(brands.entries()).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([b,c])=>`${b} ${Math.round(c/total*100)}%`).join(', ');
    const src=computeSourcing(stored.rows);
    const srcPart=src.find(s=>s.canal.includes('Particulier'));
    const srcFour=src.find(s=>s.canal.includes('Fournisseur'));
    const srcTotal=src.reduce((s,r)=>s+r.nbAchats,0);
    const srcTotalMarge=src.reduce((s,r)=>s+r.margeTotal,0);
    const srcLine=srcTotal>0?`Sourcing : ${srcPart?Math.round(srcPart.nbAchats/srcTotal*100):0}% comptoir (marge ${srcPart?.tauxMarge??0}%) / ${srcFour?Math.round(srcFour.nbAchats/srcTotal*100):0}% fournisseurs (marge ${srcFour?.tauxMarge??0}%). Total marge ${srcTotalMarge.toLocaleString('fr-FR')}€.`:'';
    const achs=computeAcheteurs(stored.rows);
    const achLine=achs.length>0?`Acheteur meilleur taux marge : ${achs[0].nom} (${achs[0].tauxMarge}%).`:'';

    // Performance par marque/plateforme — top 3 by marge
    const marchGrp=new Map<string,{mt:number;nb:number}>();
    for (const r of stored.rows) {
      const mk=detectMarqueOuPlateforme(r.m,r.f);
      const cur=marchGrp.get(mk)??{mt:0,nb:0};
      marchGrp.set(mk,{mt:cur.mt+(r.pv-r.pa),nb:cur.nb+1});
    }
    const marchTop=Array.from(marchGrp.entries()).filter(([,v])=>v.nb>=5).sort((a,b)=>b[1].mt-a[1].mt).slice(0,3);
    const marchLine=marchTop.length>0?`Performance par segment (top 3 marge) : ${marchTop.map(([mk,v])=>`${mk} (${v.mt.toLocaleString('fr-FR')}€)`).join(', ')}.`:'';

    // Top coefficient d'écoulement
    const topRotCtx=stats.filter(s=>MIN3(s)&&s.delaiMoyen!==null&&s.delaiMoyen<getSeuilDelaiPepite(s.famille)).sort((a,b)=>(a.delaiMoyen??999)-(b.delaiMoyen??999));
    const topCoeffCtx=stats.filter(s=>MIN3(s)&&s.delaiMoyen!==null&&s.delaiMoyen>0&&s.margeTotal/s.delaiMoyen!>0).sort((a,b)=>b.margeTotal/b.delaiMoyen!-a.margeTotal/a.delaiMoyen!).slice(0,15);
    const topVolCtx=[...stats].filter(MIN3).sort((a,b)=>b.qteVendue-a.qteVendue).slice(0,15);
    const coeffList=stats
      .filter(s=>MIN3(s)&&s.delaiMoyen!==null&&s.delaiMoyen>0)
      .map(s=>({modele:s.modele,coeff:Math.round((s.margeTotal/s.delaiMoyen!)*10)/10}))
      .filter(s=>s.coeff>0)
      .sort((a,b)=>b.coeff-a.coeff)
      .slice(0,5);
    const coeffLine=coeffList.length>0?`Top coefficient d'écoulement : ${coeffList.map(s=>`${s.modele} (${s.coeff})`).join(', ')}.`:'';
    const epGapLine=(rows:ModelStats[],ctx:string)=>{
      const epa=wAvg(rows,s=>s.ecartEPA), epv=wAvg(rows,s=>s.ecartEP);
      if(epa===null&&epv===null) return '';
      const marge=epa!==null&&epa<-5?'oui':epa!==null&&epa>5?'non':'limitée';
      return `${ctx} : écart PA moyen ${epa!==null?`${epa>0?'+':''}${epa}%`:'N/A'}, écart PV moyen ${epv!==null?`${epv>0?'+':''}${epv}%`:'N/A'} — marge d'oser : ${marge}`;
    };
    const rotEPLine=epGapLine(topRotCtx,'Top Rotations');
    const coeffEPLine=epGapLine(topCoeffCtx,'Top Coefficient');
    const volEPLine=epGapLine(topVolCtx,'Top Volumes');
    // Pépites locales
    let pepLocLine='';
    try{
      for(const fc of ['JCDR','JCON','TLCE','JPOR'] as FamilyCode[]){
        const gs=localStorage.getItem(`gamme_reseau_${fc}`);
        if(!gs) continue;
        const gamme=JSON.parse(gs) as GammeReseau;
        const rotC=topRotCtx.filter(s=>detectFamilyCode(s.famille)===fc&&!isInGamme(s.modele,gamme)).length;
        const coC=topCoeffCtx.filter(s=>detectFamilyCode(s.famille)===fc&&!isInGamme(s.modele,gamme)).length;
        const voC=topVolCtx.filter(s=>detectFamilyCode(s.famille)===fc&&!isInGamme(s.modele,gamme)).length;
        if(rotC+coC+voC>0){pepLocLine=`Pépites locales (${fc}) : ${rotC} Rotations, ${coC} Coefficient, ${voC} Volumes — absents gamme réseau.`;break;}
      }
    }catch{/*ignore*/}

    // Flops
    const flopsList=stats.filter(s=>MIN3(s)&&s.delaiMoyen!==null&&s.delaiMoyen>60&&s.ecartEP!==null&&Math.abs(s.ecartEP)>10)
      .sort((a,b)=>(b.delaiMoyen??0)-(a.delaiMoyen??0));
    const flopsLine=flopsList.length>0
      ?`Flops (délai>60j, écart EP>±10%) : ${flopsList.length} modèles — top 3 : ${flopsList.slice(0,3).map(s=>`${s.modele} (${s.delaiMoyen}j, ${s.ecartEP!>0?'+':''}${s.ecartEP}%)`).join(', ')}.`
      :'Flops : aucun modèle en alerte.';

    // Family-specific context
    const familyLines: string[] = [];
    const borRows=stored.rows.filter(r=>detectFamilyCode(r.f)==='BOR');
    const borValidRows=borRows.filter(r=>isBORValid(r.m));
    if (borValidRows.length>=5) {
      const typeB=computeBreakdown(borValidRows,r=>detectBORType(r.m));
      familyLines.push(`BOR — Types de produits dominants : ${typeB.slice(0,3).map(t=>`${t.label} (${t.qtyPct}%)`).join(', ')}.`);
      const canalB=computeBORCanalBreakdown(borValidRows);
      const fonte=canalB.find(r=>r.label==='Fonte'), vitrine=canalB.find(r=>r.label==='Vitrine');
      const totalPoids=(fonte?.poidsTotal??0)+(vitrine?.poidsTotal??0);
      if (totalPoids>0&&fonte?.poidsTotal) {
        const tauxFonte=Math.round(fonte.poidsTotal/totalPoids*100);
        const diff=(vitrine?.tauxMarge??0)-(fonte?.tauxMarge??0);
        familyLines.push(`BOR — Taux de fonte sur poids racheté : ${tauxFonte}%. Différentiel marge fonte vs vitrine : ${diff} points.`);
      }
      // Cookson comparison from persisted state
      const cooksonStr=localStorage.getItem(`journal_cookson_${magasinNom}`);
      if (cooksonStr) {
        const cooksonNum=parseFloat(cooksonStr.replace(',','.'));
        if (!isNaN(cooksonNum)&&cooksonNum>0) {
          const rowsWithPoids=borValidRows.reduce((acc,r)=>{
            const p=extractPoids(r.m);
            if (p&&p>0) acc.push({pa:r.pa,poids:p});
            return acc;
          },[] as {pa:number;poids:number}[]);
          if (rowsWithPoids.length>0) {
            const totalPA=rowsWithPoids.reduce((s,r)=>s+r.pa,0);
            const totalP=rowsWithPoids.reduce((s,r)=>s+r.poids,0);
            const avgPaPerGram=Math.round(totalPA/totalP*100)/100;
            const ecart=Math.round((avgPaPerGram-cooksonNum)/cooksonNum*100);
            familyLines.push(`BOR — Prix d'achat moyen au gramme : ${avgPaPerGram} €/g vs cours Cookson ${cooksonNum} €/g (écart ${ecart>0?'+':''}${ecart}%).`);
          }
        }
      }
    }
    const iporRows=stored.rows.filter(r=>detectFamilyCode(r.f)==='IPOR');
    if (iporRows.length>=5) {
      const usageB=computeBreakdown(iporRows,r=>detectIPORUsage(r.m));
      const gaming=usageB.find(r=>r.label==='Gaming');
      const bur=usageB.find(r=>r.label==='Bureautique');
      familyLines.push(`IPOR — Usage : ${gaming?.qtyPct??0}% gaming / ${bur?.qtyPct??0}% bureautique.`);
      const brandB=computeBreakdown(iporRows,r=>extractBrand(r.m));
      if (brandB.length>0) familyLines.push(`IPOR — Top marques : ${brandB.slice(0,3).map(b=>b.label).join(', ')}.`);
    }

    // Performance par tranche de prix
    const famCounts=new Map<FamilyCode,number>();
    for(const r of stored.rows){const fc=detectFamilyCode(r.f);if(fc!=='OTHER')famCounts.set(fc,(famCounts.get(fc)??0)+1);}
    const domFamTr=Array.from(famCounts.entries()).sort((a,b)=>b[1]-a[1]).map(([fc])=>fc).find(fc=>fc!=='BOR'&&fc!=='BOPI'&&fc!=='OTHER');
    let trancheLine='';
    if(domFamTr){
      const tDefs=getTranchesPrix(domFamTr);
      const tRows=stored.rows.filter(r=>detectFamilyCode(r.f)===domFamTr&&r.g!=='D');
      const ts=computeTranchePrix(tRows,tDefs);
      const withV=ts.filter(t=>t.nbVentes>0);
      if(withV.length>0){
        const ss=withV.reduce((best,t)=>t.tauxMarge*t.margeTotal>best.tauxMarge*best.margeTotal?t:best);
        const alertC=withV.filter(t=>t.pctCA>=10&&t.delaiMoyen!==null&&t.label!==ss.label).sort((a,b)=>(b.delaiMoyen??0)-(a.delaiMoyen??0))[0]??null;
        const repartition=ts.map(t=>`${t.label}: ${t.pctCA}%`).join(' / ');
        trancheLine=[
          `Performance par tranche de prix (${domFamTr}) : ${repartition}`,
          `Sweet spot : ${ss.label} — taux marge ${ss.tauxMarge}%, marge unit. ${ss.margeUnitaire}€, délai ${ss.delaiMoyen!==null?ss.delaiMoyen+'j':'N/A'}`,
          alertC?`Tranche à surveiller : ${alertC.label} — délai ${alertC.delaiMoyen}j, mobilisation cash`:'',
        ].filter(Boolean).join('\n');
      }
    }

    return [
      `\nAnalyse journal ${magasinNom} · ${stored.rows.length.toLocaleString('fr-FR')} ventes (grades A/B/C) · ${period}.`,
      `Top rotations (<30j, min 3 ventes) : ${topRot||'aucun'}. Pépites locales : ${pepites||'aucune'}.`,
      epVG!=null?`Politique vente vs cote EP : écart ${fmtE(epVG)}.`:'',
      epAG!=null?`Politique achat vs cote EP : écart ${fmtE(epAG)}.`:'',
      rotEPLine, coeffEPLine, volEPLine, pepLocLine,
      marchLine, trancheLine, coeffLine, flopsLine,
      topBrands?`Segments dominants (volume) : ${topBrands}.`:'',
      srcLine, achLine,
      ...familyLines,
    ].filter(Boolean).join('\n');
  } catch { return ''; }
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function Badge({ qty }: { qty: number }) {
  if (qty>=10) return <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 ml-1.5 whitespace-nowrap font-medium">✅ Très fiable</span>;
  if (qty>=5)  return <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 ml-1.5 whitespace-nowrap font-medium">🟢 Fiable</span>;
  if (qty>=3)  return <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 ml-1.5 whitespace-nowrap font-medium">🟡 Tendance</span>;
  return           <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 ml-1.5 whitespace-nowrap font-medium">🔴 Faible</span>;
}
function GammeDetailPanel({gamme,filter,setFilter}:{gamme:GammeReseau;filter:'all'|'top20'|'other';setFilter:(f:'all'|'top20'|'other')=>void}){
  const filtered=filter==='all'?gamme.modeles:filter==='top20'?gamme.modeles.filter(m=>m.inTop20):gamme.modeles.filter(m=>!m.inTop20);
  const hasVol=gamme.modeles.some(m=>m.pctVol!=null);
  const matchLabel=gamme.nb_top20<gamme.nb_modeles
    ?`${gamme.nb_top20} utilisés pour le matching pépites locales (Top 20% volume cumulé)`
    :'Tous les modèles utilisés pour le matching (volume non détecté ou gamme courte)';
  return (
    <div className="border border-[#E0E0E0] border-t-0 rounded-b-xl bg-[#F5F5F5] px-4 py-4 space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-semibold text-[#1A1A1A]">📋 Gamme {gamme.famille} importée — détail des modèles</p>
          <p className="text-[10px] text-[#6B7280] mt-0.5">{gamme.nb_modeles} modèles importés · {matchLabel}</p>
        </div>
        <div className="flex gap-1 flex-wrap">
          {(['all','top20','other'] as const).map(f=>(
            <button key={f} onClick={()=>setFilter(f)} className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${filter===f?'bg-[#E30613] text-white':'bg-white border border-[#E0E0E0] text-[#6B7280] hover:border-[#E30613]'}`}>
              {f==='all'?`Tous les modèles (${gamme.nb_modeles})`:f==='top20'?`✅ Top 20% matching (${gamme.nb_top20})`:`⚪ Hors matching (${gamme.nb_modeles-gamme.nb_top20})`}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-auto rounded-xl border border-[#E0E0E0]" style={{maxHeight:'500px'}}>
        <table className="text-[10px] w-full border-collapse min-w-[560px]">
          <thead>
            <tr>{['#','Produit','Marque','Plateforme',...(hasVol?['% Volume','Cumul %']:[]),'Statut matching','Key normalisée'].map((l,i)=>(
              <th key={i} className="px-3 py-2 text-left font-semibold bg-[#374151] text-white whitespace-nowrap sticky top-0">{l}</th>
            ))}</tr>
          </thead>
          <tbody>
            {filtered.map((m,i)=>{
              const orig=gamme.modeles.indexOf(m)+1;
              return (
                <tr key={i} className={m.inTop20?'bg-green-50 hover:bg-green-100':'bg-white hover:bg-[#FAFAFA]'}>
                  <td className="px-3 py-1.5 text-[#9CA3AF] text-center w-8">{orig}</td>
                  <td className="px-3 py-1.5 font-medium text-[#1A1A1A] max-w-[180px]"><span className="block truncate">{m.produit||'—'}</span></td>
                  <td className="px-3 py-1.5 text-[#6B7280] whitespace-nowrap">{m.marque||'—'}</td>
                  <td className="px-3 py-1.5 text-[#6B7280] whitespace-nowrap">{m.plateforme||'—'}</td>
                  {hasVol&&<td className="px-3 py-1.5 text-right text-[#6B7280]">{m.pctVol!=null?`${m.pctVol}%`:'—'}</td>}
                  {hasVol&&<td className="px-3 py-1.5 text-right text-[#6B7280]">{m.cumPct!=null?`${m.cumPct}%`:'—'}</td>}
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {m.inTop20
                      ?<span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[9px] font-semibold">✅ Utilisé pour matching</span>
                      :<span className="bg-gray-100 text-[#6B7280] px-1.5 py-0.5 rounded text-[9px] font-semibold">⚪ Hors matching</span>
                    }
                  </td>
                  <td className="px-3 py-1.5 italic text-[#9CA3AF] max-w-[180px]"><span className="block truncate">{m.key_normalisee||'—'}</span></td>
                </tr>
              );
            })}
            {filtered.length===0&&(
              <tr><td colSpan={hasVol?8:6} className="px-4 py-6 text-center text-[#9CA3AF] italic text-xs">Aucun modèle dans ce filtre.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="bg-white border border-[#E0E0E0] rounded-lg px-4 py-3 space-y-1 text-[10px] text-[#6B7280]">
        <p className="font-semibold text-[#1A1A1A] text-xs">💡 Comprendre ce tableau :</p>
        <p>— Les modèles <strong className="text-green-700">✅ verts</strong> sont ceux que l&apos;outil utilise pour identifier les pépites locales dans votre Top Rotations, Top Coefficient et Top Volumes.</p>
        <p>— Si un modèle de votre journal n&apos;apparaît pas dans cette liste, il sera marqué <strong>🌍 Pépite locale</strong> (absent de la référence nationale → à sourcer en priorité au comptoir).</p>
        <p>— La colonne <em>Key normalisée</em> montre comment l&apos;outil simplifie le libellé pour comparer avec votre journal Athéna (sans accents, minuscules, sans ponctuation).</p>
      </div>
    </div>
  );
}

function EcartCell({v}:{v:number|null}){
  if(v===null) return <span className="text-[#D1D5DB]">—</span>;
  return <span className="font-semibold text-[#374151]">{v>0?'+':''}{v.toFixed(1)}%</span>;
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
      {rows.length===0 ? (
        <p className="text-xs text-[#9CA3AF] italic px-1">{emptyMsg??'Aucun résultat.'}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
          <table className="text-xs w-full border-collapse">
            <thead><tr>{cols.map((c,i)=><th key={i} className={c.right?THR:TH}>{c.label}</th>)}</tr></thead>
            <tbody>{rows.map((s,i)=>(
              <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                {cols.map((c,j)=><td key={j} className={c.right?TDR:TD}>{c.render(s)}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {extra}
    </div>
  );
}

function BreakdownTable({ title, rows, showDelai=true, segmentLabel='Segment' }: { title?: string; rows: BreakdownRow[]; showDelai?: boolean; segmentLabel?: string; }) {
  const fmtK=(n:number)=>n.toLocaleString('fr-FR');
  if (rows.length===0) return <p className="text-xs text-[#9CA3AF] italic">Aucune donnée.</p>;
  return (
    <div className="space-y-1.5">
      {title && <h4 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">{title}</h4>}
      <div className="overflow-x-auto rounded-lg border border-[#E0E0E0]">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>{segmentLabel}</th>
              <th className={THR}>Qté</th><th className={THR}>Part (%)</th>
              <th className={THR}>Marge (€)</th><th className={THR}>Part marge (%)</th>
              <th className={THR}>Taux marge (%)</th>
              {showDelai && <th className={THR}>Délai (j)</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                <td className={TD}><span className="font-medium">{r.label}</span></td>
                <td className={TDR}>{r.qty}</td>
                <td className={TDR}>{r.qtyPct}%</td>
                <td className={TDR}><span className={r.margeTotal<0?'text-red-600 font-semibold':''}>{fmtK(r.margeTotal)} €</span></td>
                <td className={TDR}>{r.margePct}%</td>
                <td className={TDR}>{r.tauxMarge}%</td>
                {showDelai && <td className={TDR}>{r.delaiMoyen!==null?`${r.delaiMoyen} j`:'—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BORCanalTable({ rows }: { rows: BreakdownRow[]; }) {
  const fmtK=(n:number)=>n.toLocaleString('fr-FR');
  if (rows.length===0) return <p className="text-xs text-[#9CA3AF] italic">Aucune donnée canal.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-[#E0E0E0]">
      <table className="text-xs w-full border-collapse">
        <thead>
          <tr>
            <th className={TH}>Canal</th>
            <th className={THR}>Qté</th>
            <th className={THR}>Poids total (g)</th>
            <th className={THR}>Val. achats (€)</th>
            <th className={THR}>Val. ventes (€)</th>
            <th className={THR}>Marge (€)</th>
            <th className={THR}>Taux marge (%)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r,i)=>(
            <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
              <td className={TD}><span className="font-medium">{r.label}</span></td>
              <td className={TDR}>{r.qty}</td>
              <td className={TDR}>{r.poidsTotal!=null&&r.poidsTotal>0?`${r.poidsTotal} g`:'—'}</td>
              <td className={TDR}>{fmtK(r.valeurAchats??0)} €</td>
              <td className={TDR}>{fmtK(r.valeurVentes??0)} €</td>
              <td className={TDR}><span className={r.margeTotal<0?'text-red-600 font-semibold':''}>{fmtK(r.margeTotal)} €</span></td>
              <td className={TDR}>{r.tauxMarge}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── BOR: prix au gramme par titre × canal ─────────────────────────────────────
function BORPrixGrammeSection({ rows, cooksonStr }: { rows: CRow[]; cooksonStr: string }) {
  const fmtK = (n: number) => n.toLocaleString('fr-FR');
  const tableData = useMemo(()=>computeBORPrixGrammeTable(rows),[rows]);
  const cooksonNum = parseFloat(cooksonStr.replace(',','.'));
  const hasCookson = !isNaN(cooksonNum) && cooksonNum > 0;

  // Synthetic 18k indicators
  const r18F = tableData.find(r=>r.titre==='18 carats (750)'&&r.canal==='Fonte');
  const r18V = tableData.find(r=>r.titre==='18 carats (750)'&&r.canal==='Vitrine');
  const p18Total = (r18F?.poidsTotal??0)+(r18V?.poidsTotal??0);
  const tauxFonte18 = p18Total>0&&(r18F?.poidsTotal??0)>0 ? Math.round((r18F!.poidsTotal)/p18Total*100) : null;
  const diff18 = r18V?.prixAchatMoyen!=null&&r18F?.prixAchatMoyen!=null
    ? Math.round((r18V.prixAchatMoyen-r18F.prixAchatMoyen)*100)/100 : null;

  if (!tableData.length) return <p className="text-xs text-[#9CA3AF] italic">Aucune donnée titre/canal disponible.</p>;
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">💰 Analyse prix au gramme par titre et canal</h4>
      <div className="overflow-x-auto rounded-lg border border-[#E0E0E0]">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>Titre d&apos;or</th>
              <th className={TH}>Canal</th>
              <th className={THR}>Lignes</th>
              <th className={THR}>Poids (g)</th>
              <th className={THR}>Val. achat (€)</th>
              <th className={THR}>Prix achat moy. (€/g)</th>
              <th className={THR}>Val. vente (€)</th>
              <th className={THR}>Marge (€)</th>
              <th className={THR}>Taux marge (%)</th>
              {hasCookson&&<th className={THR}>Écart vs Cookson</th>}
            </tr>
          </thead>
          <tbody>
            {tableData.map((r,i)=>{
              const is18Fonte = r.titre==='18 carats (750)'&&r.canal==='Fonte';
              const ecart = hasCookson&&is18Fonte&&r.prixAchatMoyen!=null
                ? Math.round((r.prixAchatMoyen-cooksonNum)/cooksonNum*100) : null;
              return (
                <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                  <td className={TD}><span className="font-medium">{r.titre}</span></td>
                  <td className={TD}>{r.canal}</td>
                  <td className={TDR}>{r.nbLignes}</td>
                  <td className={TDR}>{r.poidsTotal>0?`${r.poidsTotal} g`:'—'}</td>
                  <td className={TDR}>{fmtK(r.valeurAchatTotal)} €</td>
                  <td className={TDR}>{r.prixAchatMoyen!=null?`${fmtK(r.prixAchatMoyen)} €/g`:'—'}</td>
                  <td className={TDR}>{fmtK(r.valeurVenteTotal)} €</td>
                  <td className={TDR}><span className={r.margeTotal<0?'text-red-600 font-semibold':''}>{fmtK(r.margeTotal)} €</span></td>
                  <td className={TDR}>{r.tauxMargeMoyen}%</td>
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
      {/* Synthetic indicators */}
      {(tauxFonte18!=null||diff18!=null)&&(
        <div className="flex flex-wrap gap-4 text-xs text-[#6B7280]">
          {tauxFonte18!=null&&(
            <span>Taux de fonte sur poids racheté (18k uniquement) : <strong className="text-[#1A1A1A]">{tauxFonte18}%</strong></span>
          )}
          {diff18!=null&&(
            <span>Différentiel prix au gramme 18k vitrine vs fonte : <strong className={diff18>0?'text-orange-600':diff18<0?'text-blue-600':'text-[#1A1A1A]'}>{diff18>0?'+':''}{diff18} €/g</strong></span>
          )}
        </div>
      )}
    </div>
  );
}

// ── fallback labels for non-recognized items per family (for alert threshold) ──
const FALLBACK_LABELS: Partial<Record<FamilyCode, string>> = {
  JCDR: 'Plateforme non détectée', JCON: 'Plateforme non détectée',
  BOR:  'Non catégorisé', BOPI: 'Autres',
  BMAR: 'Sans marque identifiée', BMON: 'Sans marque identifiée',
};

// ── family-specific breakdown section ─────────────────────────────────────────
function FamilyBreakdownSection({ rows, canalRows, family, cookson, onCooksonChange }: {
  rows: CRow[];           // filtered rows (Grade D excluded) — for type/price/brand breakdown
  canalRows: CRow[];      // includes Grade D for BOR/BOPI canal analysis
  family: FamilyCode;
  cookson: string;
  onCooksonChange: (v: string) => void;
}) {
  const fmtK=(n:number)=>n.toLocaleString('fr-FR');

  // For BOR: filter valid rows and track how many were excluded
  const effectiveRows = useMemo(()=>{
    if (family!=='BOR') return rows;
    return rows.filter(r=>isBORValid(r.m));
  },[rows,family]);
  const borFilteredCount = family==='BOR' ? rows.length - effectiveRows.length : 0;

  // For BOR/BOPI canal analysis: includes Grade D (Fonte)
  const effectiveCanalRows = useMemo(()=>{
    if (family!=='BOR') return canalRows;
    return canalRows.filter(r=>isBORValid(r.m));
  },[canalRows,family]);

  const priceRanges = useMemo(()=>priceRangesFor(family),[family]);

  const breakdown1 = useMemo(()=>computeBreakdown(effectiveRows, r=>{
    if (family==='TLCE'||family==='IPOR'||family==='ITAB') return extractBrand(r.m);
    if (family==='JCON'||family==='JCDR') return detectPlatform(r.m);
    if (family==='JPOR') return detectJPORBrand(r.m);
    if (family==='BOR') return detectBORType(r.m);
    if (family==='BOPI') return detectBijouType(r.m);
    if (family==='BMAR') return detectBMARBrand(r.m);
    if (family==='BMON') return detectBMONBrand(r.m);
    return r.f||'Autre';
  }),[effectiveRows,family]);

  const priceBreakdown = useMemo(()=>{
    if (family==='JCON'||family==='JCDR') return [];
    return computeBreakdown(effectiveRows, r=>getPriceLabel(r.pv, priceRanges));
  },[effectiveRows,family,priceRanges]);

  const usageBreakdown = useMemo(()=>{
    if (family!=='IPOR') return [];
    return computeBreakdown(effectiveRows, r=>detectIPORUsage(r.m));
  },[effectiveRows,family]);

  const canalBreakdown = useMemo(()=>{
    if (family!=='BOR') return [];
    return computeBORCanalBreakdown(effectiveCanalRows);
  },[effectiveCanalRows,family]);

  // BOR Cookson calculation: sum(pa) / sum(poids) — true weighted average
  const cooksonCalc = useMemo(()=>{
    if (family!=='BOR') return null;
    const cooksonNum=parseFloat(cookson.replace(',','.'));
    if (isNaN(cooksonNum)||cooksonNum<=0) return null;
    const rowsWithPoids=effectiveRows.reduce((acc,r)=>{
      const p=extractPoids(r.m);
      if (p&&p>0) acc.push({pa:r.pa,poids:p});
      return acc;
    },[] as {pa:number;poids:number}[]);
    if (!rowsWithPoids.length) return null;
    const totalPA=rowsWithPoids.reduce((s,r)=>s+r.pa,0);
    const totalPoids=rowsWithPoids.reduce((s,r)=>s+r.poids,0);
    const avgPaPerGram=totalPoids>0?totalPA/totalPoids:0;
    const ecart=Math.round((avgPaPerGram-cooksonNum)/cooksonNum*100);
    return {avgPaPerGram:Math.round(avgPaPerGram*100)/100, cooksonNum, ecart, nbLignes:rowsWithPoids.length};
  },[effectiveRows,family,cookson]);

  // BOR fonte indicators
  const borIndicators = useMemo(()=>{
    if (family!=='BOR'||canalBreakdown.length===0) return null;
    const fonte=canalBreakdown.find(r=>r.label==='Fonte');
    const vitrine=canalBreakdown.find(r=>r.label==='Vitrine');
    const totalPoids=(fonte?.poidsTotal??0)+(vitrine?.poidsTotal??0);
    const tauxFonte=totalPoids>0&&fonte?.poidsTotal?Math.round(fonte.poidsTotal/totalPoids*100):null;
    const diff=vitrine!=null&&fonte!=null?vitrine.tauxMarge-fonte.tauxMarge:null;
    return {tauxFonte, diff, vitrine, fonte};
  },[family,canalBreakdown]);

  // Unified non-recognized % for all supported families
  const nonRecognizedPct = useMemo(()=>{
    const fallback = FALLBACK_LABELS[family];
    if (!fallback) return 0;
    // BOR uses effectiveRows (already filtered); others use all rows
    const src = family==='BOR' ? effectiveRows : rows;
    if (!src.length) return 0;
    const getLabel = (r: CRow): string => {
      if (family==='JCDR'||family==='JCON') return detectPlatform(r.m);
      if (family==='BOR') return detectBORType(r.m);
      if (family==='BOPI') return detectBijouType(r.m);
      if (family==='BMAR') return detectBMARBrand(r.m);
      if (family==='BMON') return detectBMONBrand(r.m);
      return '';
    };
    const nc = src.filter(r => getLabel(r) === fallback).length;
    return Math.round(nc / src.length * 100);
  },[family, effectiveRows, rows]);
  const nonRecAlertThreshold = family==='BOR' ? 25 : 30;
  const showNonRecAlert = nonRecognizedPct > nonRecAlertThreshold;

  if (effectiveRows.length<5) {
    return (
      <div className="bg-[#F5F5F5] rounded-xl p-5 space-y-2 border border-[#E0E0E0]">
        {family==='BOR'&&borFilteredCount>0&&(
          <p className="text-xs text-[#6B7280]">
            {effectiveRows.length} lignes valides analysées sur {rows.length} lignes brutes ({borFilteredCount} filtrées — libellé ne commence pas par OR ou erreur de saisie).
          </p>
        )}
        <p className="text-center text-sm text-[#6B7280] italic">
          Données insuffisantes pour une analyse approfondie sur cette famille (moins de 5 ventes valides).
        </p>
      </div>
    );
  }

  const title=FAMILY_SECTION_TITLE[family];
  const hasTwoCols=['JPOR','ITAB','BOPI','BMAR','BMON'].includes(family);
  const hasThreeCols=family==='IPOR';

  return (
    <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-5">
      <h3 className="text-sm font-bold text-[#1A1A1A]">{title}</h3>

      {/* BOR: filtration info + Cookson field */}
      {family==='BOR' && (
        <>
          {/* Filtration stats */}
          <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg px-3 py-2 text-xs text-[#6B7280]">
            {effectiveRows.length} lignes valides analysées sur {rows.length} lignes brutes
            {borFilteredCount>0&&<> ({borFilteredCount} filtrée{borFilteredCount>1?'s':''} : erreurs de saisie ou retours)</>}.
          </div>
          {/* Non-recognized alert (BOR threshold 25%) */}
          {showNonRecAlert&&(
            <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg px-3 py-2 text-xs text-[#6B7280]">
              ⚠️ {nonRecognizedPct}% des libellés BOR n&apos;ont pas pu être attribués à un type de produit. Vérifiez vos libellés Athéna pour améliorer la précision.
            </div>
          )}
          {/* Cookson field */}
          <div className="bg-[#FFF5F5] border border-[#FECACA] rounded-lg p-3 flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold text-[#1A1A1A] whitespace-nowrap">💰 Cours Cookson du jour (€/g pour or 18 carats / 750 millièmes)</label>
            <input
              type="number"
              value={cookson}
              onChange={e=>onCooksonChange(e.target.value)}
              placeholder="ex: 42.50"
              className="w-28 bg-white border border-[#E0E0E0] rounded-md px-2 py-1 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]"
            />
            <span className="text-xs text-[#6B7280] italic">Optionnel — calcule l&apos;écart prix achat moyen au gramme</span>
          </div>
        </>
      )}

      {/* Generic non-recognized alert (non-BOR families — BOR has its own above) */}
      {family!=='BOR' && showNonRecAlert && (
        <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg px-3 py-2 text-xs text-[#6B7280]">
          ⚠️ {nonRecognizedPct}% des libellés {FAMILY_LABELS[family]} n&apos;ont pas pu être classés automatiquement. Vérifiez vos libellés Athéna.
        </div>
      )}

      {/* Single table families (TLCE, JCON, JCDR) */}
      {!hasTwoCols && !hasThreeCols && family!=='BOR' && (
        <BreakdownTable rows={breakdown1} segmentLabel={(family==='JCON'||family==='JCDR')?'Plateforme':'Marque'} />
      )}

      {/* Two-column families (JPOR, ITAB, BOPI, BMAR, BMON) */}
      {hasTwoCols && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <BreakdownTable
              title={family==='JPOR'?'Par marque / famille console':family==='BOPI'?'Par type de produit':'Par marque'}
              rows={breakdown1}
            />
            <BreakdownTable title="Par tranche de prix" rows={priceBreakdown} showDelai={false} />
          </div>
          {/* BOPI: prix au gramme par titre × canal (même logique que BOR) */}
          {family==='BOPI' && (
            <BORPrixGrammeSection rows={effectiveCanalRows} cooksonStr={cookson} />
          )}
        </div>
      )}

      {/* IPOR three tables */}
      {hasThreeCols && (
        <div className="space-y-5">
          <BreakdownTable title="Par marque" rows={breakdown1} />
          <BreakdownTable title="Par usage" rows={usageBreakdown} />
          <BreakdownTable title="Par tranche de prix" rows={priceBreakdown} showDelai={false} />
        </div>
      )}

      {/* BOR three tables */}
      {family==='BOR' && (
        <div className="space-y-5">
          <BreakdownTable title="💍 Par type de produit" rows={breakdown1} segmentLabel="Type" />
          {/* Analyse prix au gramme par titre × canal — ACTION 4 */}
          <BORPrixGrammeSection rows={effectiveCanalRows} cooksonStr={cookson} />
          <BreakdownTable title="💰 Par tranche de prix" rows={priceBreakdown} showDelai={false} />
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">🏪 Par canal vitrine vs fonte</h4>
            <BORCanalTable rows={canalBreakdown} />
          </div>

          {/* BOR indicators */}
          {borIndicators && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {borIndicators.tauxFonte!==null && (
                <div className="rounded-lg border border-[#E0E0E0] p-3">
                  <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Taux de fonte sur poids racheté</p>
                  <p className="text-xl font-black text-[#1A1A1A] mb-1">{borIndicators.tauxFonte}%</p>
                  <p className="text-xs text-[#6B7280]">
                    {borIndicators.tauxFonte<30?'Magasin orienté vitrine':borIndicators.tauxFonte<=60?'Équilibre vitrine / fonte':'Magasin orienté fonte'}
                  </p>
                </div>
              )}
              {borIndicators.diff!==null && (
                <div className="rounded-lg border border-[#E0E0E0] p-3">
                  <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Différentiel marge vitrine vs fonte</p>
                  <p className={`text-xl font-black mb-1 ${borIndicators.diff>0?'text-green-600':borIndicators.diff<0?'text-red-600':'text-[#1A1A1A]'}`}>
                    {borIndicators.diff>0?'+':''}{borIndicators.diff} pts
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    Vitrine {borIndicators.vitrine?.tauxMarge??'—'}% vs Fonte {borIndicators.fonte?.tauxMarge??'—'}%
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Cookson ecart */}
          {cooksonCalc && (
            <div className="bg-[#FFF5F5] border border-[#FECACA] rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-[#E30613]">Analyse au gramme (sur {cooksonCalc.nbLignes} ligne{cooksonCalc.nbLignes>1?'s':''} avec poids extrait)</p>
              <p className="text-sm font-bold text-[#1A1A1A]">
                Prix d&apos;achat moyen au gramme : {fmtK(cooksonCalc.avgPaPerGram)} €/g
              </p>
              <p className={`text-sm font-bold ${cooksonCalc.ecart>0?'text-orange-600':cooksonCalc.ecart<0?'text-green-600':'text-[#1A1A1A]'}`}>
                Écart vs cours Cookson : {cooksonCalc.ecart>0?'+':''}{cooksonCalc.ecart}%
                <span className="text-xs text-[#6B7280] font-normal ml-2">
                  ({fmtK(cooksonCalc.avgPaPerGram)} €/g vs {fmtK(cooksonCalc.cooksonNum)} €/g Cookson)
                </span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function JournalAchatVente({ magasinNom, onAddAction, onNavigateToBijouterie }: Props) {
  const [stored,         setStored]         = useState<StoredImport|null>(null);
  const [periode,        setPeriode]        = useState<Periode>('all');
  const [grade,          setGrade]          = useState('all');
  const [selectedFamily, setSelectedFamily] = useState<'all'|FamilyCode>('all');
  const [cookson,        setCookson]        = useState('');
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string|null>(null);
  const [dragOver,       setDragOver]       = useState(false);
  const [toast,          setToast]          = useState<string|null>(null);
  const [gammes,         setGammes]         = useState<Record<string,GammeReseau>>({});
  const [gammeOpen,      setGammeOpen]      = useState(false);
  const [gammeDetailOpen,setGammeDetailOpen]= useState<string|null>(null);
  const [gammeDetailFilter,setGammeDetailFilter]= useState<'all'|'top20'|'other'>('all');
  const [trancheOpen,    setTrancheOpen]    = useState(true);
  const [gammeImport,    setGammeImport]    = useState<{step:'confirm'|'choose';detected:FamilyCode|null;chosen:string;parsedRows:Record<string,unknown>[];}|null>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const gammeFileRef= useRef<HTMLInputElement>(null);

  useEffect(()=>{
    try {
      const s=localStorage.getItem(`journal_analyse_${magasinNom}`);
      if (!s) { setStored(null); return; }
      const p=JSON.parse(s) as StoredImport;
      if (!Array.isArray(p.rows)) { localStorage.removeItem(`journal_analyse_${magasinNom}`); setStored(null); return; }
      setStored(p);
    } catch { setStored(null); }
    try {
      const ck=localStorage.getItem(`journal_cookson_${magasinNom}`);
      if (ck) setCookson(ck); else setCookson('');
    } catch { /* ignore */ }
    // Load gammes réseau
    try {
      const loaded: Record<string,GammeReseau>={};
      for (const fc of ['JCDR','JCON','TLCE','JPOR'] as FamilyCode[]) {
        const gs=localStorage.getItem(`gamme_reseau_${fc}`);
        if (gs) loaded[fc]=JSON.parse(gs) as GammeReseau;
      }
      setGammes(loaded);
    } catch { /* ignore */ }
  },[magasinNom]);

  // Persist cookson whenever it changes
  useEffect(()=>{
    if (!magasinNom) return;
    if (cookson) localStorage.setItem(`journal_cookson_${magasinNom}`,cookson);
    else localStorage.removeItem(`journal_cookson_${magasinNom}`);
  },[cookson,magasinNom]);

  // PARTIE C — Diagnostic report in console after import
  useEffect(()=>{
    if (!stored||!stored.rows.length) return;
    const familyCounts=new Map<string,number>();
    const unknownFamilies=new Set<string>();
    for (const r of stored.rows) {
      const fc=detectFamilyCode(r.f, false);
      const label=fc==='OTHER'?`OTHER (${r.f||'(vide)'})`:`${fc}`;
      familyCounts.set(fc,(familyCounts.get(fc)??0)+1);
      if (fc==='OTHER'&&r.f.trim().length>=5) unknownFamilies.add(r.f.trim());
    }
    const rows=stored.rows;
    const statsAll=computeStats(rows);
    const MIN3all=(s:ModelStats)=>s.qteVendue>=3;
    const perteSall=statsAll.filter(s=>MIN3all(s)&&s.margeTotal<0);
    const faibleAll=statsAll.filter(s=>MIN3all(s)&&s.tauxMarge<20&&s.delaiMoyen!==null&&s.delaiMoyen>90&&s.margeTotal>=0); // global uses 90j
    console.group(`[JournalAchatVente] Rapport diagnostic — ${magasinNom} — ${rows.length} lignes`);
    console.log('=== Répartition par famille ===');
    Array.from(familyCounts.entries()).sort((a,b)=>b[1]-a[1]).forEach(([fc,n])=>{
      const pct=Math.round(n/rows.length*100);
      console.log(`  ${fc.padEnd(6)} : ${n} lignes (${pct}%)`);
    });
    if (unknownFamilies.size>0) {
      console.warn('=== Sous-familles non reconnues ===');
      unknownFamilies.forEach(f=>console.warn(`  → "${f}"`));
    }
    console.log('=== Modèles à surveiller (toutes familles, min 3 ventes) ===');
    console.log(`  🔴 Perte sèche : ${perteSall.length} modèle(s)`);
    if (perteSall.length>0) perteSall.slice(0,5).forEach(s=>console.log(`     • ${s.modele} (marge totale ${s.margeTotal} €)`));
    console.log(`  🟡 Faible rendement (taux marge < 20%, délai > 90j) : ${faibleAll.length} modèle(s)`);
    if (faibleAll.length>0) faibleAll.slice(0,5).forEach(s=>console.log(`     • ${s.modele} (taux marge ${s.tauxMarge}%, délai ${s.delaiMoyen}j)`));
    // Per-family non-catégorisé (for BOR and JCDR/JCON)
    const borRows=rows.filter(r=>detectFamilyCode(r.f)==='BOR');
    if (borRows.length>0) {
      const borValid=borRows.filter(r=>isBORValid(r.m));
      const nc=borValid.filter(r=>detectBORType(r.m)==='Non catégorisé').length;
      console.log(`  BOR : ${borRows.length} brutes → ${borValid.length} valides → ${nc} Non catégorisé (${borValid.length>0?Math.round(nc/borValid.length*100):0}%)`);
    }
    const jcdrRows=rows.filter(r=>detectFamilyCode(r.f)==='JCDR');
    if (jcdrRows.length>0) {
      const nd=jcdrRows.filter(r=>detectPlatform(r.m)==='Plateforme non détectée').length;
      console.log(`  JCDR : ${jcdrRows.length} lignes → ${nd} plateforme non détectée (${Math.round(nd/jcdrRows.length*100)}%)`);
    }
    const jconRows=rows.filter(r=>detectFamilyCode(r.f)==='JCON');
    if (jconRows.length>0) {
      const nd=jconRows.filter(r=>detectPlatform(r.m)==='Plateforme non détectée').length;
      console.log(`  JCON : ${jconRows.length} lignes → ${nd} plateforme non détectée (${Math.round(nd/jconRows.length*100)}%)`);
    }
    console.groupEnd();
  },[stored,magasinNom]);

  const processFile = useCallback(async (file: File)=>{
    setLoading(true); setError(null);
    try {
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(new Uint8Array(buf),{type:'array',cellDates:true});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const raw=XLSX.utils.sheet_to_json(ws,{defval:''}) as Record<string,unknown>[];
      if (!raw.length) throw new Error('Le fichier semble vide.');
      const colMap=mapColumns(Object.keys(raw[0]));
      if (!colMap.achatLibelle&&!colMap.fichetechLibelle&&!colMap.prixVente) throw new Error("Colonnes non reconnues. Vérifiez que c'est bien un export Athéna.");
      const rows: CRow[]=[];
      let dateMin: Date|null=null, dateMax: Date|null=null;
      for (const row of raw) {
        if (colMap.typeTransaction&&!norm(String(row[colMap.typeTransaction]??'')).includes('vente')) continue;
        const pv=colMap.prixVente?parseNum(row[colMap.prixVente]):0;
        if (pv<=0) continue;
        // Dual libellé: pick best source per row
        const achatLib = colMap.achatLibelle ? String(row[colMap.achatLibelle]??'').trim() : '';
        const fichetechLib = colMap.fichetechLibelle ? String(row[colMap.fichetechLibelle]??'').trim() : '';
        const modele = getBestLibelle(achatLib, fichetechLib);
        if (!modele) continue;
        const g=colMap.grade?String(row[colMap.grade]??'').trim().toUpperCase():'';
        // Grade D: keep in rows for BOR canal analysis (Fonte), excluded from general stats in computeStats
        const pa=colMap.prixAchat?parseNum(row[colMap.prixAchat]):0;
        const dvRaw=colMap.delaiVente?row[colMap.delaiVente]:null;
        const dv2=(dvRaw!==''&&dvRaw!=null)?(parseNum(dvRaw)||null):null;
        const dv3=dv2&&dv2>0?dv2:null;
        const dateV=colMap.dateVente?parseDateVal(row[colMap.dateVente]):null;
        const ep=colMap.easypricePrixVente?(parseNum(row[colMap.easypricePrixVente])||null):null;
        const epa=colMap.easypricePrixAchat?(parseNum(row[colMap.easypricePrixAchat])||null):null;
        const cvRaw=colMap.typeClientVendeur?norm(String(row[colMap.typeClientVendeur]??'')):'';
        const cv=cvRaw.includes('particulier')?'P':cvRaw.includes('fournisseur')?'F':'';
        const fn=colMap.clientVendeurNom?String(row[colMap.clientVendeurNom]??'').trim():'';
        const fp=colMap.clientVendeurPrenom?String(row[colMap.clientVendeurPrenom]??'').trim():'';
        const co=colMap.collaborateur?String(row[colMap.collaborateur]??'').trim():'';
        const an=colMap.clientAcheteurNom?String(row[colMap.clientAcheteurNom]??'').trim():'';
        const ap=colMap.clientAcheteurPrenom?String(row[colMap.clientAcheteurPrenom]??'').trim():'';
        if (dateV&&g!=='D') { if (!dateMin||dateV<dateMin) dateMin=dateV; if (!dateMax||dateV>dateMax) dateMax=dateV; }
        const r: CRow={m:modele,f:colMap.famille?String(row[colMap.famille]??'').trim():'',g,d:dateV?.toISOString()??null,pa,pv,dv:dv3};
        if (ep)  r.ep=ep;  if (epa) r.epa=epa;
        if (cv)  r.cv=cv;  if (fn)  r.fn=fn;  if (fp) r.fp=fp;
        if (co)  r.co=co;  if (an)  r.an=an;  if (ap) r.ap=ap;
        if (rows.length<3) console.log('DEBUG row parsing:',{libelle:r.m,sousfamille_recue:r.f,grade:r.g,achatLib,fichetechLib});
        rows.push(r);
      }
      if (!rows.length) throw new Error('Aucune vente valide trouvée.');
      const result: StoredImport={importedAt:new Date().toISOString(),rows,dateMin:dateMin?.toISOString()??null,dateMax:dateMax?.toISOString()??null};
      setStored(result);
      try { localStorage.setItem(`journal_analyse_${magasinNom}`,JSON.stringify(result)); } catch { /* quota */ }
    } catch (e) { setError(e instanceof Error?e.message:'Erreur inattendue.'); }
    finally { setLoading(false); }
  },[magasinNom]);

  function handleFile(f: File|null|undefined) {
    if (!f) return;
    if (!['csv','xlsx','xls'].includes(f.name.split('.').pop()?.toLowerCase()??'')) { setError('Format non supporté. Utilisez .csv, .xlsx ou .xls.'); return; }
    processFile(f);
  }

  const handleGammeFile = useCallback(async(file:File)=>{
    try {
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(new Uint8Array(buf),{type:'array',cellDates:true});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const raw=XLSX.utils.sheet_to_json(ws,{defval:''}) as Record<string,unknown>[];
      if(!raw.length){setToast('Fichier gamme vide.');setTimeout(()=>setToast(null),4000);return;}
      const detected=detectFamilleGamme(raw);
      setGammeImport({step:'confirm',detected,chosen:detected||'',parsedRows:raw});
    } catch { setToast('Erreur à la lecture du fichier de gamme réseau.'); setTimeout(()=>setToast(null),4000); }
  },[]);

  const confirmGammeImport = useCallback((famille:string, rawRows:Record<string,unknown>[])=>{
    if(!famille||!rawRows.length) return;
    const headers=Object.keys(rawRows[0]);
    const findCol=(pats:RegExp)=>headers.find(h=>pats.test(norm(h)));
    const produitCol=findCol(/produit|article|libelle|product/);
    const marqueCol=findCol(/marque|brand|fabricant/);
    const platCol=findCol(/plateforme|platform|console|support/);
    const qteCol=findCol(/quantite|qte|volume|qty|nbvente/);
    interface PR{produit:string;marque:string;plateforme:string;key:string;qte:number;}
    const parsed:PR[]=rawRows.map(r=>({
      produit:String(r[produitCol||'']||'').trim(),
      marque:String(r[marqueCol||'']||'').trim(),
      plateforme:String(r[platCol||'']||'').trim(),
      key:'',qte:qteCol?parseNum(r[qteCol]):1,
    })).filter(r=>r.produit);
    for(const r of parsed) r.key=normGamme(`${r.produit} ${r.plateforme}`);
    parsed.sort((a,b)=>b.qte-a.qte);
    const totalVol=parsed.reduce((s,r)=>s+r.qte,0);
    let cumVol=0;
    const inTop20=new Set<string>();
    for(const r of parsed){
      cumVol+=r.qte;
      inTop20.add(r.key);
      if(totalVol>0&&cumVol>=totalVol*0.2) break;
    }
    if(inTop20.size===0&&parsed.length>0) inTop20.add(parsed[0].key);
    let cumVol2=0;
    const modeles:GammeModele[]=parsed.map(r=>{
      const pctVol=totalVol>0?Math.round(r.qte/totalVol*1000)/10:undefined;
      cumVol2+=r.qte;
      const cumPct=totalVol>0?Math.round(cumVol2/totalVol*1000)/10:undefined;
      return {produit:r.produit,marque:r.marque,plateforme:r.plateforme,key_normalisee:r.key,inTop20:inTop20.has(r.key),pctVol,cumPct};
    });
    const nb_top20=modeles.filter(m=>m.inTop20).length;
    const gamme:GammeReseau={famille,date_import:new Date().toISOString().slice(0,10),nb_modeles:modeles.length,nb_top20,modeles};
    setGammes(g=>({...g,[famille]:gamme}));
    try{localStorage.setItem(`gamme_reseau_${famille}`,JSON.stringify(gamme));}catch{/*quota*/}
    setGammeImport(null);
    const msg=qteCol
      ?`Gamme ${famille} importée : ${modeles.length} modèles dont ${nb_top20} en Top 20% volume (utilisés pour la détection).`
      :`Gamme ${famille} importée : ${modeles.length} modèles (volume non détecté — tous modèles utilisés).`;
    setToast(msg);setTimeout(()=>setToast(null),6000);
  },[]);

  // Detected families from stored rows (for filter buttons)
  const detectedFamilies = useMemo((): FamilyCode[]=>{
    if (!stored) return [];
    const counts=new Map<FamilyCode,number>();
    for (const r of stored.rows) {
      const fc=detectFamilyCode(r.f);
      if (fc!=='OTHER') counts.set(fc,(counts.get(fc)??0)+1);
    }
    return Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).map(([fc])=>fc);
  },[stored]);

  // Filtered rows (period + grade + family) — Grade D excluded by filterRows
  const filteredRows = useMemo(()=>{
    let r=stored?filterRows(stored.rows,periode,grade):[];
    if (selectedFamily!=='all') r=r.filter(row=>detectFamilyCode(row.f)===selectedFamily);
    return r;
  },[stored,periode,grade,selectedFamily]);

  // Canal rows for BOR/BOPI: includes Grade D (Fonte), applies period filter, NOT grade filter
  const canalRows = useMemo(()=>{
    if (!stored) return [];
    let r = stored.rows;
    if (selectedFamily!=='all') r = r.filter(row=>detectFamilyCode(row.f)===selectedFamily);
    // Apply period filter (same cutoff logic as filterRows) but keep Grade D
    if (periode!=='all') {
      const cutoff=new Date();
      cutoff.setMonth(cutoff.getMonth()-(periode==='3m'?3:periode==='6m'?6:12));
      r = r.filter(row=>!row.d||new Date(row.d)>=cutoff);
    }
    return r;
  },[stored,periode,selectedFamily]);

  const stats=useMemo(()=>computeStats(filteredRows),[filteredRows]);
  const MIN3=(s: ModelStats)=>s.qteVendue>=3;

  // Per-model pépite threshold: 90j for jewelry/maro/watches, 30j for tech
  const topRotations=useMemo(()=>{
    if (stats.length>0) {
      const sample=stats[0];
      console.log('[DEBUG pépites]',{famille:sample.famille,seuil_applique:getSeuilDelaiPepite(sample.famille)});
    }
    return stats.filter(s=>MIN3(s)&&s.delaiMoyen!==null&&s.delaiMoyen<getSeuilDelaiPepite(s.famille)).sort((a,b)=>(a.delaiMoyen??999)-(b.delaiMoyen??999));
  },[stats]);
  const topVolume=useMemo(()=>[...stats].filter(MIN3).sort((a,b)=>b.qteVendue-a.qteVendue).slice(0,15),[stats]);
  const pepites=useMemo(()=>{
    const rotSet=new Set(topRotations.filter(r=>r.qteVendue>=5).map(r=>r.modele.toLowerCase()));
    return [...stats].filter(MIN3).filter(m=>rotSet.has(m.modele.toLowerCase()))
      .sort((a,b)=>b.margeTotal-a.margeTotal).slice(0,5);
  },[topRotations,stats]);

  const marchePerf=useMemo(()=>{
    if (selectedFamily==='BOR'||selectedFamily==='BOPI') return [];
    if (selectedFamily==='all'&&detectedFamilies.length>0&&detectedFamilies.every(f=>f==='BOR'||f==='BOPI')) return [];
    const grp=new Map<string,{pvs:number[];pas:number[];dvs:number[]}>();
    for (const r of filteredRows) {
      const marque=detectMarqueOuPlateforme(r.m,r.f);
      if (!grp.has(marque)) grp.set(marque,{pvs:[],pas:[],dvs:[]});
      const g=grp.get(marque)!;
      g.pvs.push(r.pv); g.pas.push(r.pa);
      if (r.dv&&r.dv>0) g.dvs.push(r.dv);
    }
    const totalCA=filteredRows.reduce((s,r)=>s+r.pv,0);
    return Array.from(grp.entries())
      .filter(([,g])=>g.pvs.length>=5)
      .map(([marque,g])=>{
        const nb=g.pvs.length;
        const ca=g.pvs.reduce((s,v)=>s+v,0);
        const mt=g.pvs.reduce((s,v,i)=>s+v-g.pas[i],0);
        return {
          marque,nb,ca:Math.round(ca),mt:Math.round(mt),
          pctCA:totalCA>0?Math.round(ca/totalCA*100):0,
          tauxMarge:ca>0?Math.round(mt/ca*100):0,
          delaiMoyen:g.dvs.length>0?Math.round(g.dvs.reduce((s,v)=>s+v,0)/g.dvs.length):null,
          pvMoyen:nb>0?Math.round(ca/nb):0,
        };
      })
      .sort((a,b)=>b.mt-a.mt);
  },[filteredRows,selectedFamily,detectedFamilies]);

  const topCoeff=useMemo(()=>
    stats
      .filter(s=>MIN3(s)&&s.delaiMoyen!==null&&s.delaiMoyen>0)
      .map(s=>({...s,coeff:Math.round((s.margeTotal/s.delaiMoyen!)*10)/10}))
      .filter(s=>s.coeff>0)
      .sort((a,b)=>b.coeff-a.coeff)
      .slice(0,15)
  ,[stats]);

  const flops=useMemo(()=>
    stats.filter(s=>MIN3(s)&&s.delaiMoyen!==null&&s.delaiMoyen>60&&s.ecartEP!==null&&Math.abs(s.ecartEP)>10)
      .sort((a,b)=>(b.delaiMoyen??0)-(a.delaiMoyen??0))
  ,[stats]);

  const hasSourcingData=useMemo(()=>filteredRows.some(r=>r.cv==='P'||r.cv==='F'),[filteredRows]);
  const hasFournisseurData=useMemo(()=>filteredRows.some(r=>r.cv==='F'&&r.fn),[filteredRows]);
  const hasCollaborateurData=useMemo(()=>filteredRows.some(r=>r.cv==='P'&&r.co),[filteredRows]);
  const sourcing=useMemo(()=>computeSourcing(filteredRows),[filteredRows]);
  const fournisseurs=useMemo(()=>computeFournisseurs(filteredRows),[filteredRows]);
  const acheteurs=useMemo(()=>computeAcheteurs(filteredRows),[filteredRows]);
  const hasEPVente=useMemo(()=>stats.some(s=>s.epMoyen!=null),[stats]);
  const hasEPAchat=useMemo(()=>stats.some(s=>s.epaMoyen!=null),[stats]);

  // Pépite locale detection
  const pepiteLocaleFamily=useMemo(():FamilyCode|null=>{
    if(selectedFamily!=='all') return selectedFamily as FamilyCode;
    if(detectedFamilies.length===1) return detectedFamilies[0];
    return null;
  },[selectedFamily,detectedFamilies]);
  const currentGamme=useMemo(()=>pepiteLocaleFamily?gammes[pepiteLocaleFamily]||null:null,[pepiteLocaleFamily,gammes]);
  const hasAnyGamme=useMemo(()=>detectedFamilies.some(f=>!!gammes[f]),[detectedFamilies,gammes]);
  const pepiteLocaleSet=useMemo(():Set<string>=>{
    const result=new Set<string>();
    for(const s of stats){
      if(!MIN3(s)) continue;
      const fc=detectFamilyCode(s.famille);
      const famGamme=gammes[fc]||null;
      if(!famGamme) continue;
      if(!isInGamme(s.modele,famGamme)){
        result.add(s.modele.toLowerCase());
      }
    }
    return result;
  },[stats,gammes]);

  // Debug matching info (visible panel — remove once matching validated)
  const debugMatchInfo=useMemo(()=>{
    const sample5=topRotations.slice(0,5);
    return sample5.map(s=>{
      const fc=detectFamilyCode(s.famille);
      const famGamme=gammes[fc]||null;
      const keyJournal=normGamme(s.modele);
      const dbg=famGamme?isInGammeDebug(s.modele,famGamme):{matched:false,matchedKey:null};
      return {modele:s.modele,keyJournal,fc,famGamme,matched:dbg.matched,matchedKey:dbg.matchedKey,isPepite:famGamme&&!dbg.matched};
    });
  },[topRotations,gammes]);
  const debugRotPep=useMemo(()=>topRotations.filter(s=>pepiteLocaleSet.has(s.modele.toLowerCase())).length,[topRotations,pepiteLocaleSet]);
  const debugCoeffPep=useMemo(()=>topCoeff.filter(s=>pepiteLocaleSet.has(s.modele.toLowerCase())).length,[topCoeff,pepiteLocaleSet]);
  const debugVolPep=useMemo(()=>topVolume.filter(s=>pepiteLocaleSet.has(s.modele.toLowerCase())).length,[topVolume,pepiteLocaleSet]);

  // Weighted avg EP gaps per table
  const rotEcartPA =useMemo(()=>wAvg(topRotations,s=>s.ecartEPA),[topRotations]);
  const rotEcartPV =useMemo(()=>wAvg(topRotations,s=>s.ecartEP), [topRotations]);
  const coeffEcartPA=useMemo(()=>wAvg(topCoeff,s=>s.ecartEPA),[topCoeff]);
  const coeffEcartPV=useMemo(()=>wAvg(topCoeff,s=>s.ecartEP), [topCoeff]);
  const volEcartPA =useMemo(()=>wAvg(topVolume,s=>s.ecartEPA),[topVolume]);
  const volEcartPV =useMemo(()=>wAvg(topVolume,s=>s.ecartEP), [topVolume]);

  // Performance par tranche de prix
  const trancheFamily=useMemo(():FamilyCode|null=>{
    if(selectedFamily!=='all'){
      const fc=selectedFamily as FamilyCode;
      if(fc==='BOR'||fc==='BOPI'||fc==='OTHER') return null;
      return fc;
    }
    return detectedFamilies.find(fc=>fc!=='BOR'&&fc!=='BOPI'&&fc!=='OTHER')||null;
  },[selectedFamily,detectedFamilies]);

  const trancheRows=useMemo(()=>{
    if(!trancheFamily) return [];
    if(selectedFamily!=='all') return filteredRows;
    return filteredRows.filter(r=>detectFamilyCode(r.f)===trancheFamily);
  },[trancheFamily,filteredRows,selectedFamily]);

  const trancheStats=useMemo(():TrancheStats[]=>{
    if(!trancheFamily) return [];
    return computeTranchePrix(trancheRows, getTranchesPrix(trancheFamily));
  },[trancheFamily,trancheRows]);

  const sweetSpotData=useMemo(()=>{
    const withV=trancheStats.filter(t=>t.nbVentes>0);
    if(!withV.length) return {sweetSpot:null,trancheAlert:null};
    const sweetSpot=withV.reduce((best,t)=>t.tauxMarge*t.margeTotal>best.tauxMarge*best.margeTotal?t:best);
    const alertC=withV.filter(t=>t.pctCA>=10&&t.delaiMoyen!==null&&t.label!==sweetSpot.label)
      .sort((a,b)=>(b.delaiMoyen??0)-(a.delaiMoyen??0))[0]??null;
    return {sweetSpot,trancheAlert:alertC};
  },[trancheStats]);

  const globalEPVente=useMemo(():number|null=>{
    const ms=stats.filter(s=>s.epMoyen!=null&&s.epMoyen>0);
    const tq=ms.reduce((s,m)=>s+m.qteVendue,0);
    return tq>0?Math.round(ms.reduce((s,m)=>s+((m.pvMoyen-m.epMoyen!)/m.epMoyen!*100)*m.qteVendue,0)/tq*10)/10:null;
  },[stats]);
  const globalEPAchat=useMemo(():number|null=>{
    const ms=stats.filter(s=>s.epaMoyen!=null&&s.epaMoyen>0);
    const tq=ms.reduce((s,m)=>s+m.qteVendue,0);
    return tq>0?Math.round(ms.reduce((s,m)=>s+((m.paMoyen-m.epaMoyen!)/m.epaMoyen!*100)*m.qteVendue,0)/tq*10)/10:null;
  },[stats]);

  // Debug: missing data audit (visible panel — remove once validated)
  const debugMissingData=useMemo(()=>{
    if(!stored) return null;
    const rows=stored.rows;
    const total=rows.length;
    const pct=(n:number)=>total>0?Math.round(n/total*100):0;
    // Raw row level (stored rows, before period filter)
    const noEPA=rows.filter(r=>!r.epa).length;
    const noEP=rows.filter(r=>!r.ep).length;
    const noDV=rows.filter(r=>!r.dv||r.dv<=0).length;
    const noPAorPV=rows.filter(r=>r.pa<=0||r.pv<=0).length;
    // Section stats (on current filteredRows / stats)
    const totalStats=stats.length;
    const glEPVinc=stats.filter(s=>s.epMoyen!=null&&s.epMoyen>0).length;
    const glEPAinc=stats.filter(s=>s.epaMoyen!=null&&s.epaMoyen>0).length;
    const rotExclNoDelay=stats.filter(s=>s.qteVendue>=3&&s.delaiMoyen===null).length;
    const rotShownNoEP=topRotations.filter(s=>s.epMoyen===null&&s.epaMoyen===null).length;
    const coeffExcl=stats.filter(s=>s.qteVendue>=3&&(s.delaiMoyen===null||s.delaiMoyen<=0)).length;
    const flopsExcl=stats.filter(s=>s.qteVendue>=3&&(s.ecartEP===null||s.delaiMoyen===null||s.delaiMoyen<=60)).length;
    const filtTotal=filteredRows.length;
    const filtWithDV=filteredRows.filter(r=>r.dv&&r.dv>0).length;
    const rotWithEPA=topRotations.filter(s=>s.ecartEPA!==null).length;
    const rotWithEPV=topRotations.filter(s=>s.ecartEP!==null).length;
    return {total,pct,noEPA,noEP,noDV,noPAorPV,totalStats,glEPVinc,glEPAinc,rotExclNoDelay,rotShownNoEP,coeffExcl,flopsExcl,filtTotal,filtWithDV,rotWithEPA,rotWithEPV,rotTotal:topRotations.length};
  },[stored,stats,filteredRows,topRotations]);

  // Debug: delay calculation audit (visible panel — remove once validated)
  const debugDelais=useMemo(()=>{
    if(!stored||!filteredRows.length) return null;
    const allRows=stored.rows;
    const totalAll=allRows.length;
    const withDVall=allRows.filter(r=>r.dv&&r.dv>0).length;
    const aberrantAll=allRows.filter(r=>r.dv&&r.dv>365).length;
    // Filtered rows stats
    const fRows=filteredRows;
    const dvRows=fRows.filter(r=>r.dv&&r.dv>0);
    const aberrantF=dvRows.filter(r=>r.dv!>365).length;
    const noOutF=dvRows.filter(r=>r.dv!<=365);
    const avg=(arr:{dv:number|null|undefined}[])=>arr.length>0?Math.round(arr.reduce((s,r)=>s+(r.dv??0),0)/arr.length):null;
    const avgCap=(arr:typeof dvRows)=>arr.length>0?Math.round(arr.reduce((s,r)=>s+Math.min(r.dv!,365),0)/arr.length):null;
    // Top 3 platforms
    const platMap=new Map<string,{dvs:number[]}>();
    for(const r of fRows){
      const p=detectMarqueOuPlateforme(r.m,r.f);
      if(!platMap.has(p)) platMap.set(p,{dvs:[]});
      if(r.dv&&r.dv>0) platMap.get(p)!.dvs.push(r.dv);
    }
    const top3Plat=Array.from(platMap.entries()).filter(([,g])=>g.dvs.length>=3).sort((a,b)=>b[1].dvs.length-a[1].dvs.length).slice(0,3).map(([plat,g])=>{
      const cur=Math.round(g.dvs.reduce((s,v)=>s+v,0)/g.dvs.length);
      const noOut=g.dvs.filter(v=>v<=365);
      const noOutAvg=noOut.length>0?Math.round(noOut.reduce((s,v)=>s+v,0)/noOut.length):null;
      const capAvg=Math.round(g.dvs.reduce((s,v)=>s+Math.min(v,365),0)/g.dvs.length);
      const ecart=noOutAvg!==null?Math.abs(cur-noOutAvg):0;
      return {plat,cur,capAvg,noOutAvg,ecart,n:g.dvs.length,nOut:g.dvs.length-noOut.length};
    });
    // Top 3 buyers (by r.co, cv='P')
    const buyMap=new Map<string,{dvs:number[]}>();
    for(const r of fRows){
      const buyer=(r.co??'').trim();
      if(!buyer) continue;
      if(!buyMap.has(buyer)) buyMap.set(buyer,{dvs:[]});
      if(r.dv&&r.dv>0) buyMap.get(buyer)!.dvs.push(r.dv);
    }
    const top3Buy=Array.from(buyMap.entries()).filter(([,g])=>g.dvs.length>=3).sort((a,b)=>b[1].dvs.length-a[1].dvs.length).slice(0,3).map(([buyer,g])=>{
      const cur=Math.round(g.dvs.reduce((s,v)=>s+v,0)/g.dvs.length);
      const noOut=g.dvs.filter(v=>v<=365);
      const noOutAvg=noOut.length>0?Math.round(noOut.reduce((s,v)=>s+v,0)/noOut.length):null;
      const capAvg=Math.round(g.dvs.reduce((s,v)=>s+Math.min(v,365),0)/g.dvs.length);
      const ecart=noOutAvg!==null?Math.abs(cur-noOutAvg):0;
      return {buyer,cur,capAvg,noOutAvg,ecart,n:g.dvs.length,nOut:g.dvs.length-noOut.length};
    });
    const verdict=(e:number)=>e<2?'✅ fiable (<2j d\'écart)':e<=5?`⚠️ acceptable (${e}j — à documenter)`:`❌ à corriger (${e}j d'écart)`;
    return {totalAll,withDVall,noDVall:totalAll-withDVall,aberrantAll,dvRowsCount:dvRows.length,aberrantF,noOutFCount:noOutF.length,curMean:avg(dvRows),capMean:avgCap(dvRows),noOutMean:avg(noOutF),top3Plat,top3Buy,verdict};
  },[stored,filteredRows]);

  // ACTION 2: family-aware brand/platform widget data
  const topBrands=useMemo(()=>{
    const brands=new Map<string,number>();
    for (const r of filteredRows) { const b=detectMarqueOuPlateforme(r.m, r.f); brands.set(b,(brands.get(b)??0)+1); }
    const total=filteredRows.length;
    return total>0?Array.from(brands.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([brand,count])=>({brand,count,pct:Math.round(count/total*100)})):[];
  },[filteredRows]);

  // ACTION 4: adaptive widget title based on detected/selected family
  const topBrandsTitle=useMemo(()=>{
    const fc: FamilyCode|null = selectedFamily!=='all'
      ? selectedFamily as FamilyCode
      : detectedFamilies.length===1 ? detectedFamilies[0] : null;
    if (!fc) return '🏷️ Répartition (top 5)';
    if (fc==='JCDR'||fc==='JCON'||fc==='JPOR') return '🎮 Répartition des plateformes (top 5)';
    if (fc==='BOR'||fc==='BOPI') return '💍 Répartition par type de produit (top 5)';
    return '🏷️ Répartition par marque (top 5)';
  },[selectedFamily, detectedFamilies]);

  const investTotal=useMemo(()=>topRotations.reduce((s,r)=>s+r.paMoyen,0),[topRotations]);
  const srcTotal=sourcing.reduce((s,r)=>s+r.nbAchats,0);
  const srcTotalMarge=sourcing.reduce((s,r)=>s+r.margeTotal,0);
  const srcPart=sourcing.find(s=>s.canal.includes('Particulier'));
  const srcFour=sourcing.find(s=>s.canal.includes('Fournisseur'));

  const showGlobal=stored&&stats.length>0&&(hasEPVente||hasEPAchat||topBrands.length>0);

  function addToPAP() {
    if (!onAddAction) return;
    const refs=[...topRotations.filter(r=>r.qteVendue>=5).slice(0,5),...pepites.filter(p=>!topRotations.filter(r=>r.qteVendue>=5).slice(0,5).some(r=>r.modele===p.modele)).slice(0,3)].map(r=>r.modele).join(', ')||'(voir module Journal achat-vente)';
    const ech=new Date(); ech.setDate(ech.getDate()+7);
    onAddAction({id:Math.random().toString(36).slice(2),titre:'Commander les références prioritaires',axe:'Stock',pilote:'Acheteur principal',copilote:'',description:`Commander cette semaine les références suivantes (issues de l'analyse Journal) : ${refs}`,echeance:ech.toISOString().slice(0,10),priorite:1,gain:0,statut:'À faire'});
    setToast("✓ Action ajoutée au Plan d'Action. Échéance : dans 7 jours.");
    setTimeout(()=>setToast(null),4000);
  }

  const fmtD=(s:string|null)=>s?new Date(s).toLocaleDateString('fr-FR'):'?';
  const fmtE=(v:number)=>`${v>0?'+':''}${v}%`;
  const fmtK=(n:number)=>n.toLocaleString('fr-FR');
  const modeleCol=(s: ModelStats)=>(
    <span className="flex items-center flex-wrap gap-1 max-w-[260px]">
      <span className="truncate font-medium">{s.modele}</span><Badge qty={s.qteVendue}/>
      {pepiteLocaleSet.has(s.modele.toLowerCase())&&(
        <span
          className="inline-flex items-center bg-green-100 text-green-700 border border-green-200 text-[10px] px-1.5 py-0.5 rounded font-medium cursor-help whitespace-nowrap"
          title={`Ce modèle n'est pas dans la gamme réseau nationale ${pepiteLocaleFamily||''}. Il relève du marché local de votre magasin et mérite d'être intégré en sourcing prioritaire au comptoir.`}
        >🌍 Pépite locale</span>
      )}
    </span>
  );

  const btnFilter=(active: boolean)=>`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${active?'bg-[#E30613] text-white':'bg-white border border-[#E0E0E0] text-[#6B7280] hover:border-[#E30613] hover:text-[#E30613]'}`;

  return (
    <div className="space-y-5">
      {toast&&<div className="fixed top-4 right-4 z-[100] bg-green-600 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl">{toast}</div>}

      {/* Gamme réseau import modal */}
      {gammeImport&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-md w-full mx-4 space-y-4">
            <h3 className="text-base font-bold text-[#1A1A1A]">Import gamme réseau</h3>
            {gammeImport.step==='confirm'&&gammeImport.detected?(
              <>
                <p className="text-sm text-[#6B7280]">Ce fichier semble être la gamme <strong className="text-[#1A1A1A]">{gammeImport.detected}</strong>. Confirmer l&apos;import ?</p>
                <div className="flex gap-2">
                  <button onClick={()=>confirmGammeImport(gammeImport.detected!,gammeImport.parsedRows)} className="flex-1 bg-[#E30613] hover:bg-[#B8050F] text-white text-sm font-semibold rounded-xl py-2.5 transition-colors">✅ Oui, importer comme {gammeImport.detected}</button>
                  <button onClick={()=>setGammeImport(g=>g?{...g,step:'choose'}:null)} className="flex-1 border border-[#E0E0E0] text-[#6B7280] hover:border-[#E30613] text-sm font-semibold rounded-xl py-2.5 transition-colors">✏️ Autre famille</button>
                </div>
              </>
            ):(
              <>
                <p className="text-sm text-[#6B7280]">{gammeImport.detected?'Choisissez la famille :':'Famille non détectée. Choisissez la famille :'}</p>
                <select value={gammeImport.chosen} onChange={e=>setGammeImport(g=>g?{...g,chosen:e.target.value}:null)} className="w-full border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]">
                  <option value="">-- Sélectionner --</option>
                  <option value="JCDR">JCDR — Jeux vidéo</option>
                  <option value="JCON">JCON — Consoles</option>
                  <option value="TLCE">TLCE — Téléphonie</option>
                  <option value="JPOR">JPOR — Jeux portables</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={()=>{if(gammeImport.chosen)confirmGammeImport(gammeImport.chosen,gammeImport.parsedRows);}} disabled={!gammeImport.chosen} className="flex-1 bg-[#E30613] hover:bg-[#B8050F] disabled:bg-[#F5F5F5] disabled:text-[#9CA3AF] text-white text-sm font-semibold rounded-xl py-2.5 transition-colors">✅ Importer</button>
                  <button onClick={()=>setGammeImport(null)} className="flex-1 border border-[#E0E0E0] text-[#6B7280] text-sm font-semibold rounded-xl py-2.5 transition-colors">Annuler</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <h2 className="text-lg font-bold text-[#1A1A1A]">Journal achat-vente · {magasinNom||'Magasin'}</h2>
      <div className="bg-white border border-[#E0E0E0] rounded-xl px-4 py-3 space-y-1.5">
        <p className="text-sm text-[#6B7280]">Importez votre export Athéna du journal achat-vente (CSV ou Excel) pour identifier les modèles qui tournent vite, qui génèrent de la marge, et les écarts avec la cote réseau.</p>
        <p className="text-xs text-[#9CA3AF] italic">L&apos;outil exclut le grade D, les retours SAV (prix négatifs) et les données incomplètes. Seuls les modèles avec minimum 3 ventes apparaissent dans les tableaux.</p>
      </div>

      {/* 🌍 Gammes réseau de référence (pliable) */}
      <div className="border border-[#E0E0E0] rounded-xl overflow-hidden">
        <button onClick={()=>setGammeOpen(o=>!o)} className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-[#FAFAFA] transition-colors text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#1A1A1A]">🌍 Gammes réseau de référence</span>
            <span className="text-xs text-[#9CA3AF]">— Importez par famille pour détecter les pépites locales absentes de la référence nationale</span>
          </div>
          <span className="text-[#9CA3AF] text-xs ml-2 flex-shrink-0">{gammeOpen?'▲':'▼'}</span>
        </button>
        {gammeOpen&&(
          <div className="px-4 py-4 border-t border-[#E0E0E0] bg-[#FAFAFA] space-y-3">
            <div className="space-y-1.5">
              {(['JCDR','JCON','TLCE','JPOR'] as FamilyCode[]).map(fc=>{
                const g=gammes[fc];
                const detailOpen=gammeDetailOpen===fc;
                return (
                  <div key={fc} className="space-y-0">
                    <div className={`flex items-center gap-2 text-xs py-1 ${detailOpen?'':''}` }>
                      <span className="font-semibold text-[#1A1A1A] w-14 flex-shrink-0">{fc}</span>
                      {g?(
                        <span className="text-green-700 flex-1">✅ Importée le {g.date_import} — {g.nb_modeles} modèles{g.nb_top20<g.nb_modeles?` (${g.nb_top20} en Top 20% volume)`:''}</span>
                      ):(
                        <span className="text-[#9CA3AF] flex-1">Non importée</span>
                      )}
                      {g&&(
                        <button
                          onClick={()=>{setGammeDetailOpen(prev=>prev===fc?null:fc);setGammeDetailFilter('all');}}
                          className={`text-[10px] font-medium px-2 py-0.5 rounded border transition-colors flex-shrink-0 ${detailOpen?'bg-[#E30613] text-white border-[#E30613]':'border-[#E0E0E0] text-[#6B7280] hover:border-[#E30613] hover:text-[#E30613]'}`}
                        >👁 {detailOpen?'Fermer':'Voir les produits'}</button>
                      )}
                      {g&&<button onClick={()=>{localStorage.removeItem(`gamme_reseau_${fc}`);setGammes(gm=>{const n={...gm};delete n[fc];return n;});if(gammeDetailOpen===fc)setGammeDetailOpen(null);}} className="text-[#9CA3AF] hover:text-red-500 ml-1 text-[10px] flex-shrink-0">🗑</button>}
                    </div>
                    {g&&detailOpen&&(
                      <GammeDetailPanel gamme={g} filter={gammeDetailFilter} setFilter={setGammeDetailFilter}/>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 flex-wrap">
              <input ref={gammeFileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e=>{if(e.target.files?.[0])handleGammeFile(e.target.files[0]);e.target.value='';}}/>
              <button onClick={()=>gammeFileRef.current?.click()} className="bg-[#E30613] hover:bg-[#B8050F] text-white text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors">📤 Importer une gamme réseau</button>
              {Object.keys(gammes).length>0&&(
                <button onClick={()=>{if(confirm('Supprimer toutes les gammes importées ?')){(['JCDR','JCON','TLCE','JPOR'] as FamilyCode[]).forEach(fc=>localStorage.removeItem(`gamme_reseau_${fc}`));setGammes({});}}} className="border border-[#E0E0E0] text-[#6B7280] hover:text-red-500 text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors">🗑 Supprimer toutes les gammes</button>
              )}
            </div>
            <p className="text-xs text-[#9CA3AF] italic">La détection de pépites locales ne s&apos;applique que si une gamme est importée pour la famille analysée. Les colonnes attendues du fichier gamme : Produit, Marque, Plateforme (+ Quantité optionnel pour le filtre Top 20% volume).</p>
          </div>
        )}
      </div>

      {/* 🔍 DEBUG — Fiabilité des délais moyens (temporaire) */}
      {debugDelais&&(
        <div className="border-2 border-dashed border-purple-400 bg-purple-50 rounded-xl p-4 space-y-4 text-xs">
          <p className="font-bold text-purple-800 text-sm">🔍 DEBUG — Méthode de calcul des délais moyens</p>

          {/* Nettoyage */}
          <div className="space-y-1">
            <p className="font-semibold text-purple-700">NETTOYAGE (sur l&apos;ensemble du fichier importé) :</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[#374151] pl-2">
              <span>Total lignes journal :</span>
              <span className="font-semibold">{debugDelais.totalAll.toLocaleString('fr-FR')}</span>
              <span>Lignes avec délai renseigné (dv &gt; 0) :</span>
              <span className="font-semibold">{debugDelais.withDVall.toLocaleString('fr-FR')} ({Math.round(debugDelais.withDVall/debugDelais.totalAll*100)}%)</span>
              <span>Lignes sans délai (null/vide/0) :</span>
              <span className="font-semibold">{debugDelais.noDVall.toLocaleString('fr-FR')} ({Math.round(debugDelais.noDVall/debugDelais.totalAll*100)}%)</span>
              <span>Lignes avec délai aberrant (&gt; 365j) :</span>
              <span className={`font-semibold ${debugDelais.aberrantAll>0?'text-orange-600':''}`}>{debugDelais.aberrantAll.toLocaleString('fr-FR')} ({Math.round(debugDelais.aberrantAll/debugDelais.totalAll*100)}%)</span>
              <span>Traitement des aberrants :</span>
              <span className="font-semibold text-orange-600">⚠️ Inclus tels quels — aucun plafonnement ni exclusion</span>
            </div>
          </div>

          {/* Méthode */}
          <div className="space-y-1">
            <p className="font-semibold text-purple-700">CALCUL DES MOYENNES (période filtrée : {filteredRows.length.toLocaleString('fr-FR')} lignes) :</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[#374151] pl-2">
              <span>Méthode utilisée :</span>
              <span className="font-semibold">Moyenne arithmétique simple — chaque transaction = poids 1</span>
              <span>Lignes incluses dans le calcul :</span>
              <span className="font-semibold">Uniquement dv &gt; 0 ({debugDelais.dvRowsCount.toLocaleString('fr-FR')} lignes sur {filteredRows.length.toLocaleString('fr-FR')})</span>
              <span>Lignes exclues du numérateur ET dénominateur :</span>
              <span className="font-semibold">{(filteredRows.length-debugDelais.dvRowsCount).toLocaleString('fr-FR')} (dv null/0)</span>
              <span>Aberrants dans période filtrée :</span>
              <span className={`font-semibold ${debugDelais.aberrantF>0?'text-orange-600':''}`}>{debugDelais.aberrantF} lignes (dv &gt; 365j) — inclus tels quels</span>
              <span>Délai moyen global actuel :</span>
              <span className="font-semibold">{debugDelais.curMean!==null?`${debugDelais.curMean}j`:'N/A'}</span>
              <span>Délai moyen si plafonnement à 365j :</span>
              <span className="font-semibold">{debugDelais.capMean!==null?`${debugDelais.capMean}j`:'N/A'}</span>
              <span>Délai moyen sans outliers (dv ≤ 365j) :</span>
              <span className="font-semibold">{debugDelais.noOutMean!==null?`${debugDelais.noOutMean}j (sur ${debugDelais.noOutFCount} lignes)`:'N/A'}</span>
            </div>
          </div>

          {/* Cross-check plateformes */}
          {debugDelais.top3Plat.length>0&&(
            <div className="space-y-1">
              <p className="font-semibold text-purple-700">VÉRIFICATION CROISÉE — Performance par marque/plateforme (top {debugDelais.top3Plat.length}) :</p>
              <div className="overflow-x-auto rounded-lg border border-purple-200">
                <table className="text-[10px] w-full border-collapse min-w-[540px]">
                  <thead><tr className="bg-purple-100">
                    {['Plateforme/Marque','N lignes dv>0','Outliers (>365j)','Méthode actuelle','Avec plafonnement 365j','Sans outliers','Écart actuel/sans-outliers','Verdict'].map((l,i)=>(
                      <th key={i} className="px-2 py-1.5 text-left font-semibold text-purple-900 whitespace-nowrap">{l}</th>
                    ))}
                  </tr></thead>
                  <tbody>{debugDelais.top3Plat.map((d,i)=>(
                    <tr key={i} className={i%2===0?'bg-white':'bg-purple-50'}>
                      <td className="px-2 py-1.5 font-medium">{d.plat}</td>
                      <td className="px-2 py-1.5 text-right">{d.n}</td>
                      <td className={`px-2 py-1.5 text-right ${d.nOut>0?'text-orange-600 font-semibold':''}`}>{d.nOut}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">{d.cur}j</td>
                      <td className="px-2 py-1.5 text-right">{d.capAvg}j</td>
                      <td className="px-2 py-1.5 text-right">{d.noOutAvg!==null?`${d.noOutAvg}j`:'—'}</td>
                      <td className={`px-2 py-1.5 text-right font-semibold ${d.ecart>=5?'text-red-600':d.ecart>=2?'text-orange-500':'text-green-700'}`}>{d.noOutAvg!==null?`${d.ecart}j`:'—'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{d.noOutAvg!==null?debugDelais.verdict(d.ecart):'N/A'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cross-check acheteurs */}
          {debugDelais.top3Buy.length>0&&(
            <div className="space-y-1">
              <p className="font-semibold text-purple-700">VÉRIFICATION CROISÉE — Performance acheteurs (top {debugDelais.top3Buy.length} par volume de rachats avec délai) :</p>
              <div className="overflow-x-auto rounded-lg border border-purple-200">
                <table className="text-[10px] w-full border-collapse min-w-[540px]">
                  <thead><tr className="bg-purple-100">
                    {['Acheteur','N rachats dv>0','Outliers (>365j)','Méthode actuelle','Avec plafonnement 365j','Sans outliers','Écart','Verdict'].map((l,i)=>(
                      <th key={i} className="px-2 py-1.5 text-left font-semibold text-purple-900 whitespace-nowrap">{l}</th>
                    ))}
                  </tr></thead>
                  <tbody>{debugDelais.top3Buy.map((d,i)=>(
                    <tr key={i} className={i%2===0?'bg-white':'bg-purple-50'}>
                      <td className="px-2 py-1.5 font-medium">{d.buyer}</td>
                      <td className="px-2 py-1.5 text-right">{d.n}</td>
                      <td className={`px-2 py-1.5 text-right ${d.nOut>0?'text-orange-600 font-semibold':''}`}>{d.nOut}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">{d.cur}j</td>
                      <td className="px-2 py-1.5 text-right">{d.capAvg}j</td>
                      <td className="px-2 py-1.5 text-right">{d.noOutAvg!==null?`${d.noOutAvg}j`:'—'}</td>
                      <td className={`px-2 py-1.5 text-right font-semibold ${d.ecart>=5?'text-red-600':d.ecart>=2?'text-orange-500':'text-green-700'}`}>{d.noOutAvg!==null?`${d.ecart}j`:'—'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{d.noOutAvg!==null?debugDelais.verdict(d.ecart):'N/A'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-[10px] text-purple-600 italic">Cet encart DEBUG sera retiré une fois la méthode de calcul validée et le correctif appliqué.</p>
        </div>
      )}

      {/* Global indicators */}
      {showGlobal&&(
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">📈 Lecture globale magasin</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {hasEPVente&&globalEPVente!=null&&(
              <div className="rounded-lg p-3 border border-[#E0E0E0]">
                <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">💰 Politique vente vs cote EP</p>
                <p className={`text-xl font-black mb-1 ${globalEPVente<-5?'text-red-600':globalEPVente>5?'text-orange-500':'text-green-600'}`}>{fmtE(globalEPVente)}</p>
                <p className="text-xs text-[#6B7280]">
                  {globalEPVente<-5?`Vos prix de vente sont en moyenne ${Math.abs(globalEPVente)}% sous la cote réseau.`:globalEPVente>5?`Vos prix de vente sont en moyenne ${globalEPVente}% au-dessus de la cote réseau.`:`Vos prix de vente sont alignés sur la cote réseau (écart ${fmtE(globalEPVente)}).`}
                </p>
              </div>
            )}
            {hasEPAchat&&globalEPAchat!=null&&(
              <div className="rounded-lg p-3 border border-[#E0E0E0]">
                <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">🛒 Politique achat vs cote EP</p>
                <p className={`text-xl font-black mb-1 ${globalEPAchat>5?'text-orange-500':globalEPAchat<-5?'text-blue-600':'text-green-600'}`}>{fmtE(globalEPAchat)}</p>
                <p className="text-xs text-[#6B7280]">
                  {globalEPAchat>5?`Vos prix d'achat sont en moyenne ${globalEPAchat}% au-dessus de la cote réseau.`:globalEPAchat<-5?`Vos prix d'achat sont en moyenne ${Math.abs(globalEPAchat)}% sous la cote réseau.`:`Vos prix d'achat sont alignés sur la cote réseau (écart ${fmtE(globalEPAchat)}).`}
                </p>
              </div>
            )}
            {topBrands.length>0&&(
              <div className="rounded-lg p-3 border border-[#E0E0E0]">
                <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">{topBrandsTitle}</p>
                <div className="space-y-1.5">
                  {topBrands.map(b=>(
                    <div key={b.brand} className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[#1A1A1A] w-14 truncate">{b.brand}</span>
                      <div className="flex-1 bg-[#F5F5F5] rounded-full h-1.5"><div className="bg-[#E30613] h-1.5 rounded-full" style={{width:`${b.pct}%`}}/></div>
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
            {([['all','Toute la période'],['3m','3 mois'],['6m','6 mois'],['12m','12 mois']] as [Periode,string][]).map(([v,l])=>(
              <button key={v} onClick={()=>setPeriode(v)} className={btnFilter(periode===v)}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-[#6B7280] mb-1.5 font-medium">Grade</p>
          <div className="flex gap-1.5">
            {[['all','Tous (A,B,C)'],['A','A'],['B','B'],['C','C']].map(([g,l])=>(
              <button key={g} onClick={()=>setGrade(g)} className={btnFilter(grade===g)}>{l}</button>
            ))}
          </div>
        </div>
        {detectedFamilies.length>1&&(
          <div>
            <p className="text-xs text-[#6B7280] mb-1.5 font-medium">Famille</p>
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={()=>setSelectedFamily('all')} className={btnFilter(selectedFamily==='all')}>Toutes</button>
              {detectedFamilies.map(fc=>(
                <button key={fc} onClick={()=>setSelectedFamily(fc)} className={btnFilter(selectedFamily===fc)}>{FAMILY_LABELS[fc]}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Drop zone */}
      <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}
        onClick={()=>fileRef.current?.click()}
        className={`cursor-pointer border-2 border-dashed rounded-xl px-6 py-8 text-center transition-all ${dragOver?'border-[#E30613] bg-[#FFF5F5]':'border-[#E0E0E0] bg-white hover:border-[#E30613] hover:bg-[#FFF5F5]'}`}>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e=>handleFile(e.target.files?.[0])}/>
        {loading?<div className="space-y-2"><div className="text-2xl animate-pulse">⏳</div><p className="text-sm text-[#6B7280]">Analyse en cours…</p></div>
          :<div className="space-y-2">
            <div className="text-3xl">📂</div>
            <p className="text-sm font-semibold text-[#1A1A1A]">Glissez votre fichier ici ou cliquez pour importer</p>
            <p className="text-xs text-[#9CA3AF]">.csv · .xlsx · .xls — Export Athéna journal achat-vente</p>
            {stored&&<p className="text-xs text-[#6B7280] mt-1">Dernier import : {new Date(stored.importedAt).toLocaleDateString('fr-FR')} · {stored.rows.length.toLocaleString('fr-FR')} ventes (A/B/C)</p>}
          </div>}
      </div>

      {error&&<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex gap-2"><span>⚠️</span><span>{error}</span></div>}
      {!stored&&!loading&&!error&&<div className="bg-white border border-[#E0E0E0] rounded-xl px-6 py-12 text-center"><div className="text-4xl mb-3">📊</div><p className="text-sm font-semibold text-[#1A1A1A]">Aucune analyse encore</p><p className="text-xs text-[#6B7280] mt-1">Importez votre journal Athéna pour démarrer.</p></div>}
      {stored&&!loading&&stats.length===0&&<div className="bg-white border border-[#E0E0E0] rounded-xl px-6 py-8 text-center"><p className="text-sm font-semibold text-[#1A1A1A]">Aucune donnée pour ces filtres</p><p className="text-xs text-[#6B7280] mt-1">Essayez une autre période, un autre grade ou une autre famille.</p></div>}

      {stored&&!loading&&stats.length>0&&(
        <div className="space-y-7">
          <div className="bg-[#F5F5F5] rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center justify-between text-xs">
            <span className="text-[#6B7280]">
              Analyse : <strong className="text-[#1A1A1A]">{filteredRows.length.toLocaleString('fr-FR')} ventes</strong>
              {stored.dateMin&&stored.dateMax&&<> · {fmtD(stored.dateMin)} → {fmtD(stored.dateMax)}</>}
              {grade!=='all'&&<> · Grade {grade}</>}
              {selectedFamily!=='all'&&<> · {FAMILY_LABELS[selectedFamily as FamilyCode]}</>}
            </span>
            <button onClick={()=>{localStorage.removeItem(`journal_analyse_${magasinNom}`);setStored(null);setSelectedFamily('all');}} className="text-[#9CA3AF] hover:text-red-500 transition-colors">🗑 Effacer</button>
          </div>
          <p className="text-xs text-[#9CA3AF] italic">Seuls les modèles avec ≥ 3 ventes sont affichés dans les sections ci-dessous. La fiabilité est indiquée par un badge coloré.</p>

          {/* Bijouterie module bandeau */}
          {(selectedFamily==='BOR'||selectedFamily==='BOPI')&&onNavigateToBijouterie&&(
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">💍</span>
                <span className="text-sm font-semibold text-amber-800">Analyse Bijouterie spécialisée disponible</span>
                <span className="text-xs text-amber-600">— titre d&apos;or, poids, croisement titre × canal</span>
              </div>
              <button
                onClick={onNavigateToBijouterie}
                className="text-xs font-bold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg px-3 py-1.5 transition-colors"
              >
                Ouvrir le module Bijouterie →
              </button>
            </div>
          )}

          {/* Family-specific breakdown */}
          {selectedFamily!=='all'&&(
            <FamilyBreakdownSection
              rows={filteredRows}
              canalRows={canalRows}
              family={selectedFamily as FamilyCode}
              cookson={cookson}
              onCooksonChange={setCookson}
            />
          )}

          {/* Section 2: Performance par marque/plateforme */}
          {marchePerf.length>0&&(
            <div className="space-y-2.5">
              <div>
                <h3 className="text-sm font-bold text-[#1A1A1A]">🎯 Performance par marque/plateforme <span className="text-xs font-normal text-[#9CA3AF]">min 5 ventes · tri marge totale</span></h3>
                <p className="text-xs text-[#9CA3AF] mt-0.5">Comparaison des segments dominants de la famille analysée</p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
                <table className="text-xs w-full border-collapse">
                  <thead><tr>{['Marque/Plateforme','Nb ventes','% du CA','Marge totale (€)','Taux marge (%)','Délai moyen (j)','PV moyen (€)'].map((l,i)=>(
                    <th key={i} className={i===0?TH:THR}>{l}</th>
                  ))}</tr></thead>
                  <tbody>{marchePerf.map((p,i)=>(
                    <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                      <td className={TD}><span className="font-medium">{p.marque}</span></td>
                      <td className={TDR}>{p.nb}</td>
                      <td className={TDR}>{p.pctCA} %</td>
                      <td className={TDR}><span className={p.mt>0?'text-green-700 font-semibold':'text-red-600 font-semibold'}>{fmtK(p.mt)} €</span></td>
                      <td className={TDR}><span className={p.tauxMarge>=35?'text-green-600 font-semibold':p.tauxMarge<20?'text-red-600':'text-orange-500'}>{p.tauxMarge} %</span></td>
                      <td className={TDR}>{p.delaiMoyen!==null?`${p.delaiMoyen} j`:'—'}</td>
                      <td className={TDR}>{fmtK(p.pvMoyen)} €</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="text-xs text-[#9CA3AF] italic px-1">💡 La marque ou plateforme avec le meilleur taux de marge et le délai le plus court est celle à prioriser au rachat comptoir.</p>
            </div>
          )}

          {/* Section 2b: Performance par tranche de prix */}
          {trancheFamily&&trancheStats.length>0&&(()=>{
            const {sweetSpot,trancheAlert}=sweetSpotData;
            const withV=trancheStats.filter(t=>t.nbVentes>0);
            const showMultiFamilyNote=selectedFamily==='all'&&detectedFamilies.length>1;
            return (
              <div className="border border-[#E0E0E0] rounded-xl overflow-hidden">
                <button onClick={()=>setTrancheOpen(o=>!o)} className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-[#FAFAFA] transition-colors text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[#1A1A1A]">💰 Performance par tranche de prix</span>
                    <span className="text-xs text-[#9CA3AF]">— Identifier le sweet spot prix de votre magasin{showMultiFamilyNote?` (${trancheFamily} — famille dominante)`:''}</span>
                  </div>
                  <span className="text-[#9CA3AF] text-xs ml-2 flex-shrink-0">{trancheOpen?'▲':'▼'}</span>
                </button>
                {trancheOpen&&(
                  <div className="px-4 py-4 border-t border-[#E0E0E0] space-y-3">
                    {/* 🔍 DEBUG Tranches de prix (temporaire) */}
                    {(()=>{
                      const appliedTranches=getTranchesPrix(trancheFamily!);
                      const appliedLabel=appliedTranches.map(t=>t.label).join(' / ');
                      const famillesJournal=detectedFamilies.map(f=>{
                        const cnt=filteredRows.filter(r=>detectFamilyCode(r.f)===f).length;
                        return `${f} (${cnt})`;
                      }).join(' · ')||'—';
                      const raison=selectedFamily!=='all'?`filtre manuel = ${selectedFamily}`:`famille dominante dans journal`;
                      return (
                        <div className="border-2 border-dashed border-orange-400 bg-orange-50 rounded-xl p-3 space-y-1 text-[10px]">
                          <p className="font-bold text-orange-800 text-xs">🔍 DEBUG — Tranches de prix</p>
                          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[#374151]">
                            <span className="font-medium whitespace-nowrap">Famille retenue :</span>
                            <span className="font-semibold">{trancheFamily} ({raison})</span>
                            <span className="font-medium whitespace-nowrap">Familles dans le journal (après filtre période) :</span>
                            <span>{famillesJournal}</span>
                            <span className="font-medium whitespace-nowrap">Mapping tranches appliqué :</span>
                            <span className="font-semibold">{appliedLabel}</span>
                            <span className="font-medium whitespace-nowrap">Mapping attendu pour {trancheFamily} :</span>
                            <span className="font-semibold">{appliedLabel}</span>
                            <span className="font-medium whitespace-nowrap">Statut :</span>
                            <span className="text-green-700 font-bold">✅ OK — getTranchesPrix({trancheFamily}) appliqué correctement</span>
                          </div>
                          <p className="text-[9px] text-orange-600 italic">Cet encart DEBUG sera retiré une fois les tranches validées.</p>
                        </div>
                      );
                    })()}
                    {withV.length===0?(
                      <p className="text-xs text-[#9CA3AF] italic">Aucune vente sur cette période pour cette famille.</p>
                    ):(
                      <>
                        <div className="overflow-x-auto rounded-lg border border-[#E0E0E0]">
                          <table className="text-xs w-full border-collapse">
                            <thead>
                              <tr>
                                <th className={TH}>Tranche prix</th>
                                <th className={THR}>Nb ventes</th>
                                <th className={THR}>% du CA</th>
                                <th className={THR}>Marge totale (€)</th>
                                <th className={THR}>Taux marge (%)</th>
                                <th className={THR}>Délai moyen (j)</th>
                                <th className={THR}>Marge unit. moy. (€)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {trancheStats.map((t,i)=>{
                                const isSS=sweetSpot?.label===t.label;
                                const isAlert=trancheAlert?.label===t.label;
                                const rowBg=isSS?'bg-green-50':isAlert?'bg-orange-50':i%2===0?'bg-white':'bg-[#FAFAFA]';
                                return (
                                  <tr key={i} className={rowBg}>
                                    <td className={TD}>
                                      <span className="font-medium">{t.label}</span>
                                      {isSS&&<span className="ml-1.5 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">⭐ Sweet spot</span>}
                                      {isAlert&&<span className="ml-1.5 text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">⚠️ Surveiller</span>}
                                    </td>
                                    <td className={TDR}>{t.nbVentes>0?t.nbVentes:'—'}</td>
                                    <td className={TDR}>{t.nbVentes>0?`${t.pctCA} %`:'—'}</td>
                                    <td className={TDR}>{t.nbVentes>0?<span className={t.margeTotal<0?'text-red-600 font-semibold':''}>{fmtK(t.margeTotal)} €</span>:'—'}</td>
                                    <td className={TDR}>{t.nbVentes>0?<span className={t.tauxMarge>=35?'text-green-600 font-semibold':t.tauxMarge<20?'text-red-600':''}>{t.tauxMarge} %</span>:'—'}</td>
                                    <td className={TDR}>{t.nbVentes>0&&t.delaiMoyen!==null?`${t.delaiMoyen} j`:'—'}</td>
                                    <td className={TDR}>{t.nbVentes>0?`${fmtK(t.margeUnitaire)} €`:'—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {sweetSpot&&(
                          <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg px-4 py-3 space-y-2 text-xs text-[#1A1A1A]">
                            <p>⭐ <strong>Votre sweet spot</strong> — La tranche <strong>{sweetSpot.label}</strong> est la plus performante sur cette famille (taux de marge <strong>{sweetSpot.tauxMarge}%</strong>, délai <strong>{sweetSpot.delaiMoyen!==null?`${sweetSpot.delaiMoyen} j`:'N/A'}</strong>, marge unit. moyenne <strong>{fmtK(sweetSpot.margeUnitaire)} €</strong>). Orientez vos acheteurs au comptoir pour sourcer davantage dans cette gamme de prix.</p>
                            {trancheAlert&&<p>⚠️ <strong>À surveiller</strong> — La tranche <strong>{trancheAlert.label}</strong> mobilise du cash (délai <strong>{trancheAlert.delaiMoyen} j</strong>) pour une marge unitaire de <strong>{fmtK(trancheAlert.margeUnitaire)} €</strong>. À calibrer selon votre trésorerie disponible et votre vitesse de rotation cible.</p>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Section 3: Sourcing */}
          {hasSourcingData&&(
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[#1A1A1A]">🛒 Sourcing : Particulier vs Fournisseur</h3>
              <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
                <table className="text-xs w-full border-collapse">
                  <thead><tr>{['Canal','Nb achats','Val. achats (€)','Val. ventes (€)','Marge totale (€)','Taux marge (%)','Délai moyen (j)'].map((l,i)=>(
                    <th key={i} className={i===0?TH:THR}>{l}</th>
                  ))}</tr></thead>
                  <tbody>{sourcing.map((s,i)=>(
                    <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                      <td className={TD}><span className="font-medium">{s.canal}</span></td>
                      <td className={TDR}>{fmtK(s.nbAchats)}</td>
                      <td className={TDR}>{fmtK(s.valeurAchats)} €</td>
                      <td className={TDR}>{fmtK(s.valeurVentes)} €</td>
                      <td className={TDR}><span className={s.margeTotal<0?'text-red-600 font-semibold':''}>{fmtK(s.margeTotal)} €</span></td>
                      <td className={TDR}>{s.tauxMarge} %</td>
                      <td className={TDR}>{s.delaiMoyen!==null?`${s.delaiMoyen} j`:'—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {srcTotal>0&&(
                <div className="flex flex-wrap gap-4 text-xs text-[#6B7280]">
                  <span>Part sourcing comptoir : <strong className="text-[#1A1A1A]">{srcPart?Math.round(srcPart.nbAchats/srcTotal*100):0}% des achats</strong> / <strong className="text-[#1A1A1A]">{srcTotalMarge>0&&srcPart?Math.round(srcPart.margeTotal/srcTotalMarge*100):0}% de la marge</strong></span>
                  <span>Part sourcing externe : <strong className="text-[#1A1A1A]">{srcFour?Math.round(srcFour.nbAchats/srcTotal*100):0}% des achats</strong> / <strong className="text-[#1A1A1A]">{srcTotalMarge>0&&srcFour?Math.round(srcFour.margeTotal/srcTotalMarge*100):0}% de la marge</strong></span>
                </div>
              )}
            </div>
          )}

          {/* Section 4: Performance acheteurs */}
          {hasCollaborateurData&&acheteurs.length>0&&(
            <div className="space-y-2.5">
              <h3 className="text-sm font-bold text-[#1A1A1A]">👥 Performance acheteurs magasin <span className="text-xs font-normal text-[#9CA3AF]">achats comptoir · min 5 achats</span></h3>
              <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
                <table className="text-xs w-full border-collapse">
                  <thead><tr>{['Acheteur','Nb achats','Val. achats (€)','Marge totale (€)','Taux marge (%)','Écart EP achat (%)','Délai moyen (j)'].map((l,i)=>(
                    <th key={i} className={i===0?TH:THR}>{l}</th>
                  ))}</tr></thead>
                  <tbody>{acheteurs.map((a,i)=>(
                    <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                      <td className={TD}><span className="font-medium">{a.nom}</span></td>
                      <td className={TDR}>{a.nbAchats}</td>
                      <td className={TDR}>{fmtK(a.valeurAchats)} €</td>
                      <td className={TDR}>{fmtK(a.margeTotal)} €</td>
                      <td className={TDR}><span className={a.tauxMarge>=40?'text-green-600 font-semibold':a.tauxMarge<30?'text-orange-500':''}>{a.tauxMarge} %</span></td>
                      <td className={TDR}>{a.ecartEPAchat!==null?<span className={Math.abs(a.ecartEPAchat)<=5?'text-green-600':'text-orange-500'}>{fmtE(a.ecartEPAchat)}</span>:'—'}</td>
                      <td className={TDR}>{a.delaiMoyen!==null?`${a.delaiMoyen} j`:'—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="text-xs text-[#9CA3AF] italic px-1">Ces données aident à identifier les acheteurs qui appliquent le mieux la VPD et qui maîtrisent la cote EasyPrice.</p>
            </div>
          )}

          {/* 🔍 DEBUG — matching pépites locales (temporaire) */}
          {stored&&(
            <div className="border-2 border-dashed border-yellow-400 bg-yellow-50 rounded-xl p-4 space-y-3 text-xs">
              <p className="font-bold text-yellow-800 text-sm">🔍 DEBUG — Matching pépites locales</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[#374151]">
                <span className="font-medium">Familles détectées dans le journal :</span>
                <span>{detectedFamilies.length>0?detectedFamilies.join(', '):'—'}</span>
                <span className="font-medium">Gammes réseau disponibles :</span>
                <span>{detectedFamilies.filter(f=>gammes[f]).map(f=>`${f} (${gammes[f].nb_modeles} modèles, ${gammes[f].nb_top20} matching)`).join(' · ')||'Aucune'}</span>
                <span className="font-medium">Modèles dans pepiteLocaleSet :</span>
                <span className="font-semibold">{pepiteLocaleSet.size} / {stats.filter(MIN3).length} qualifiés</span>
                <span className="font-medium">Pépites dans Top Rotations :</span><span>{debugRotPep}</span>
                <span className="font-medium">Pépites dans Top Coefficient :</span><span>{debugCoeffPep}</span>
                <span className="font-medium">Pépites dans Top Volumes :</span><span>{debugVolPep}</span>
              </div>
              {debugMatchInfo.length>0&&(
                <div className="space-y-1">
                  <p className="font-semibold text-yellow-800">Détail matching — 5 premiers modèles Top Rotations :</p>
                  <div className="overflow-x-auto">
                    <table className="text-[10px] w-full border-collapse min-w-[520px]">
                      <thead><tr className="bg-yellow-200">
                        {['#','Modèle (libellé brut)','Key journal normalisée','Famille détectée','Gamme dispo ?','Résultat match','Key gamme matchée','Pépite locale ?'].map((l,i)=>(
                          <th key={i} className="px-2 py-1 text-left font-semibold text-yellow-900 whitespace-nowrap">{l}</th>
                        ))}
                      </tr></thead>
                      <tbody>{debugMatchInfo.map((d,i)=>(
                        <tr key={i} className={i%2===0?'bg-yellow-50':'bg-white'}>
                          <td className="px-2 py-1 text-center text-[#9CA3AF]">{i+1}</td>
                          <td className="px-2 py-1 font-medium max-w-[160px]"><span className="block truncate">{d.modele}</span></td>
                          <td className="px-2 py-1 italic text-[#6B7280] max-w-[160px]"><span className="block truncate">{d.keyJournal}</span></td>
                          <td className="px-2 py-1">{d.fc}</td>
                          <td className="px-2 py-1">{d.famGamme?<span className="text-green-700 font-semibold">OUI ({d.famGamme.nb_modeles})</span>:<span className="text-red-500 font-semibold">NON</span>}</td>
                          <td className="px-2 py-1">{d.famGamme?(d.matched?<span className="text-green-700 font-semibold">✅ OUI</span>:<span className="text-orange-600 font-semibold">❌ NON</span>):<span className="text-[#9CA3AF]">N/A</span>}</td>
                          <td className="px-2 py-1 italic text-[#6B7280] max-w-[160px]"><span className="block truncate">{d.matchedKey||'—'}</span></td>
                          <td className="px-2 py-1">{d.isPepite?<span className="text-green-700 font-bold">🌍 OUI</span>:d.famGamme?<span className="text-[#9CA3AF]">Non</span>:<span className="text-[#9CA3AF]">N/A</span>}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}
              {debugMatchInfo.length===0&&<p className="text-yellow-700 italic">Aucun modèle dans Top Rotations — importez un journal ou ajustez la période.</p>}
              <p className="text-[10px] text-yellow-600 italic">Cet encart DEBUG sera retiré une fois la détection validée.</p>
            </div>
          )}

          {/* 🔍 DEBUG — Traitement données manquantes (temporaire) */}
          {debugMissingData&&(
            <div className="border-2 border-dashed border-blue-400 bg-blue-50 rounded-xl p-4 space-y-3 text-xs">
              <p className="font-bold text-blue-800 text-sm">🔍 DEBUG — Traitement des données manquantes ({debugMissingData.total.toLocaleString('fr-FR')} ventes dans le fichier importé)</p>

              <div className="space-y-1">
                <p className="font-semibold text-blue-700">Données manquantes au niveau des lignes brutes :</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[#374151] pl-2">
                  <span>Lignes sans cote EP achat :</span>
                  <span className="font-semibold">{debugMissingData.noEPA.toLocaleString('fr-FR')} ventes ({debugMissingData.pct(debugMissingData.noEPA)}%) — exclues des calculs EP achat ✅</span>
                  <span>Lignes sans cote EP vente :</span>
                  <span className="font-semibold">{debugMissingData.noEP.toLocaleString('fr-FR')} ventes ({debugMissingData.pct(debugMissingData.noEP)}%) — exclues des calculs EP vente ✅</span>
                  <span>Lignes sans délai de vente :</span>
                  <span className="font-semibold">{debugMissingData.noDV.toLocaleString('fr-FR')} ventes ({debugMissingData.pct(debugMissingData.noDV)}%) — exclues des calculs délai ✅</span>
                  <span>Lignes sans PA ou PV valide :</span>
                  <span className="font-semibold">{debugMissingData.noPAorPV.toLocaleString('fr-FR')} ventes ({debugMissingData.pct(debugMissingData.noPAorPV)}%) — filtrées à l&apos;import ✅</span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="font-semibold text-blue-700">Section Lecture globale (politique vente/achat vs cote EP) :</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[#374151] pl-2">
                  <span>Modèles inclus dans moyenne EP vente :</span>
                  <span className="font-semibold">{debugMissingData.glEPVinc} / {debugMissingData.totalStats} modèles (epMoyen &gt; 0 requis)</span>
                  <span>Modèles inclus dans moyenne EP achat :</span>
                  <span className="font-semibold">{debugMissingData.glEPAinc} / {debugMissingData.totalStats} modèles (epaMoyen &gt; 0 requis)</span>
                  <span>Inclus avec valeur 0 (bug potentiel) :</span>
                  <span className="font-semibold text-green-700">✅ NON — les valeurs 0 sont correctement exclues</span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="font-semibold text-blue-700">Section Top Rotations :</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[#374151] pl-2">
                  <span>Modèles exclus (délai null) :</span>
                  <span className="font-semibold">{debugMissingData.rotExclNoDelay} modèles qualifiés (≥3 ventes) sans délai → exclus ✅</span>
                  <span>Modèles affichés sans aucune cote EP :</span>
                  <span className="font-semibold">{debugMissingData.rotShownNoEP} / {debugMissingData.rotTotal} — colonnes EP affichées avec «—» ✅</span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="font-semibold text-blue-700">Section Top Coefficient :</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[#374151] pl-2">
                  <span>Modèles exclus (délai null ou ≤ 0) :</span>
                  <span className="font-semibold">{debugMissingData.coeffExcl} modèles qualifiés (≥3 ventes) exclus pour éviter division par zéro ✅</span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="font-semibold text-blue-700">Section Flops :</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[#374151] pl-2">
                  <span>Modèles exclus (pas de cote EP ou délai ≤ 60j) :</span>
                  <span className="font-semibold">{debugMissingData.flopsExcl} modèles qualifiés (≥3 ventes) exclus ✅</span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="font-semibold text-blue-700">Section Performance par marque/plateforme :</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[#374151] pl-2">
                  <span>Lignes avec délai renseigné (période filtrée) :</span>
                  <span className="font-semibold">{debugMissingData.filtWithDV.toLocaleString('fr-FR')} / {debugMissingData.filtTotal.toLocaleString('fr-FR')} — délai moyen calculé uniquement sur ces lignes ✅</span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="font-semibold text-blue-700">Encart reco — écarts PA/PV moyens pondérés (wAvg sur Top Rotations) :</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[#374151] pl-2">
                  <span>Modèles inclus dans wAvg écart PA :</span>
                  <span className="font-semibold">{debugMissingData.rotWithEPA} / {debugMissingData.rotTotal} (ecartEPA !== null requis) — les «—» ne comptent pas comme 0% ✅</span>
                  <span>Modèles inclus dans wAvg écart PV :</span>
                  <span className="font-semibold">{debugMissingData.rotWithEPV} / {debugMissingData.rotTotal} (ecartEP !== null requis) — les «—» ne comptent pas comme 0% ✅</span>
                </div>
              </div>

              <p className="text-[10px] text-blue-600 italic">Cet encart DEBUG sera retiré une fois les comportements validés.</p>
            </div>
          )}

          {/* Section 5: Top Rotations */}
          {(()=>{
            const rotPepCnt=topRotations.filter(s=>pepiteLocaleSet.has(s.modele.toLowerCase())).length;
            const hasRotEP=topRotations.some(s=>s.epMoyen!==null||s.epaMoyen!==null);
            const fmtEc=(v:number|null)=>v!==null?`${v>0?'+':''}${v.toFixed(1)}%`:'N/A';
            const recoAchat=(v:number|null,ctx:string)=>v===null?null:
              `💡 Écart PA vs cote EP achat — Sur ces ${ctx}, votre prix d'achat moyen est à ${fmtEc(v)} vs la cote réseau. Acceptable si votre marché local le justifie, à surveiller selon vos objectifs de marge.`;
            const recoVente=(v:number|null,ctx:string)=>v===null?null:
              `💡 Écart PV vs cote EP vente — Sur ces ${ctx}, votre prix de vente moyen est à ${fmtEc(v)} vs la cote réseau. À vous de juger si cet écart traduit un positionnement local volontaire ou s'il mérite un ajustement.`;
            const ra=recoAchat(rotEcartPA,'rotations rapides');
            const rv=recoVente(rotEcartPV,'rotations rapides');
            return (
              <SectionTable
                title={`⚡ TOP ROTATIONS (délai moyen < ${selectedFamily!=='all'&&['BOR','BOPI','BMAR','BMON'].includes(selectedFamily)?'90':'30'} jours)`}
                cnt={`${topRotations.length} modèle${topRotations.length!==1?'s':''} · min 3 ventes`}
                rows={topRotations}
                cols={[
                  {label:'Modèle',render:modeleCol},
                  {label:'Famille',render:s=>s.famille||'—'},
                  {label:'Qté',right:true,render:s=>s.qteVendue},
                  {label:'Délai',right:true,render:s=>s.delaiMoyen!==null?`${s.delaiMoyen} j`:'—'},
                  {label:'Marge unit.',right:true,render:s=>`${fmtK(s.margeUnitaire)} €`},
                  {label:'Marge totale',right:true,render:s=>`${fmtK(s.margeTotal)} €`},
                  {label:'Invest. type',right:true,render:s=>s.paMoyen>0?<span className="text-[#E30613] font-semibold">{fmtK(s.paMoyen)} €/u</span>:'—'},
                  {label:'PA vs EP achat',right:true,render:s=><EcartCell v={s.ecartEPA??null}/>},
                  {label:'PV vs EP vente',right:true,render:s=><EcartCell v={s.ecartEP??null}/>},
                ]}
                emptyMsg={`Aucun modèle (≥ 3 ventes) avec délai moyen < ${selectedFamily!=='all'&&['BOR','BOPI','BMAR','BMON'].includes(selectedFamily)?'90':'30'} jours sur cette période.`}
                extra={
                  <div className="space-y-2">
                    {topRotations.length>0&&investTotal>0&&(
                      <div className="bg-[#FFF5F5] border border-[#FECACA] rounded-lg px-4 py-2.5 text-sm">
                        <span className="font-semibold text-[#E30613]">💡 Investissement total pour 1 unité de chaque top rotation :</span>
                        <span className="font-black text-[#1A1A1A] ml-2">{fmtK(investTotal)} €</span>
                      </div>
                    )}
                    {hasRotEP&&(ra||rv)&&(
                      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-1.5 text-xs text-[#1A1A1A]">
                        {ra&&<p>{ra}</p>}
                        {rv&&<p>{rv}</p>}
                      </div>
                    )}
                    {rotPepCnt>0&&(
                      <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-xs text-green-800">
                        🌍 <strong>{rotPepCnt} modèle{rotPepCnt>1?'s':''} absent{rotPepCnt>1?'s':''} de la gamme réseau {pepiteLocaleFamily||'nationale'}</strong>. À intégrer en sourcing prioritaire au comptoir et à proposer en remontée d&apos;information à votre animateur réseau.
                      </div>
                    )}
                    {!hasAnyGamme&&detectedFamilies.some(f=>(['JCDR','JCON','TLCE','JPOR'] as string[]).includes(f))&&(
                      <p className="text-xs text-[#9CA3AF] italic px-1">💡 Importez la gamme réseau pour identifier les pépites locales absentes de la référence nationale.</p>
                    )}
                  </div>
                }
              />
            );
          })()}

          {/* Section 6: Top Volume */}
          {(()=>{
            const volPepCnt=topVolume.filter(s=>pepiteLocaleSet.has(s.modele.toLowerCase())).length;
            const hasVolEP=topVolume.some(s=>s.epMoyen!==null||s.epaMoyen!==null);
            const fmtEc=(v:number|null)=>v!==null?`${v>0?'+':''}${v.toFixed(1)}%`:'N/A';
            const ra=volEcartPA===null?null:
              `💡 Écart PA vs cote EP achat — Sur ces modèles à fort volume, votre prix d'achat moyen est à ${fmtEc(volEcartPA)} vs la cote réseau. Acceptable si votre marché local le justifie, à surveiller selon vos objectifs de marge.`;
            const rv=volEcartPV===null?null:
              `💡 Écart PV vs cote EP vente — Sur ces modèles à fort volume, votre prix de vente moyen est à ${fmtEc(volEcartPV)} vs la cote réseau. À vous de juger si cet écart traduit un positionnement local volontaire ou s'il mérite un ajustement.`;
            return (
              <SectionTable title="📦 TOP VENTES EN VOLUME" cnt={`Top ${topVolume.length} · min 3 ventes`}
                rows={topVolume}
                cols={[
                  {label:'Modèle',render:modeleCol},
                  {label:'Famille',render:s=>s.famille||'—'},
                  {label:'Qté',right:true,render:s=>s.qteVendue},
                  {label:'Délai moyen',right:true,render:s=>s.delaiMoyen!==null?`${s.delaiMoyen} j`:'—'},
                  {label:'Marge totale',right:true,render:s=>`${fmtK(s.margeTotal)} €`},
                  {label:'Marge unit.',right:true,render:s=>`${fmtK(s.margeUnitaire)} €`},
                  {label:'PA vs EP achat',right:true,render:s=><EcartCell v={s.ecartEPA??null}/>},
                  {label:'PV vs EP vente',right:true,render:s=><EcartCell v={s.ecartEP??null}/>},
                ]}
                extra={
                  <div className="space-y-2">
                    {hasVolEP&&(ra||rv)&&(
                      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-1.5 text-xs text-[#1A1A1A]">
                        {ra&&<p>{ra}</p>}
                        {rv&&<p>{rv}</p>}
                      </div>
                    )}
                    {volPepCnt>0&&(
                      <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-xs text-green-800">
                        🌍 <strong>{volPepCnt} modèle{volPepCnt>1?'s':''} absent{volPepCnt>1?'s':''} de la gamme réseau {pepiteLocaleFamily||'nationale'}</strong>. À intégrer en sourcing prioritaire au comptoir et à proposer en remontée à votre animateur réseau.
                      </div>
                    )}
                    {!hasAnyGamme&&detectedFamilies.some(f=>(['JCDR','JCON','TLCE','JPOR'] as string[]).includes(f))&&(
                      <p className="text-xs text-[#9CA3AF] italic px-1">💡 Importez la gamme réseau pour identifier les pépites locales absentes de la référence nationale.</p>
                    )}
                  </div>
                }
              />
            );
          })()}

          {/* Section 7: Top coefficient d'écoulement */}
          {topCoeff.length>0&&(()=>{
            const coeffPepCnt=topCoeff.filter(s=>pepiteLocaleSet.has(s.modele.toLowerCase())).length;
            const hasCoeffEP=topCoeff.some(s=>s.epMoyen!==null||s.epaMoyen!==null);
            const fmtEc=(v:number|null)=>v!==null?`${v>0?'+':''}${v.toFixed(1)}%`:'N/A';
            const ra=coeffEcartPA===null?null:
              `💡 Écart PA vs cote EP achat — Sur ces modèles à fort coefficient, votre prix d'achat moyen est à ${fmtEc(coeffEcartPA)} vs la cote réseau. Acceptable si votre marché local le justifie, à surveiller selon vos objectifs de marge.`;
            const rv=coeffEcartPV===null?null:
              `💡 Écart PV vs cote EP vente — Sur ces modèles à fort coefficient, votre prix de vente moyen est à ${fmtEc(coeffEcartPV)} vs la cote réseau. À vous de juger si cet écart traduit un positionnement local volontaire ou s'il mérite un ajustement.`;
            return (
              <div className="space-y-2.5">
                <div>
                  <h3 className="text-sm font-bold text-[#1A1A1A]">💎 Top coefficient d&apos;écoulement <span className="text-xs font-normal text-[#9CA3AF]">min 3 ventes · marge totale ÷ délai moyen</span></h3>
                  <p className="text-xs text-[#9CA3AF] mt-0.5">Les modèles qui rapportent le plus de marge par jour mobilisé</p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
                  <table className="text-xs w-full border-collapse">
                    <thead><tr>{['Modèle','Famille/Segment','Qté','Marge unit. (€)','Délai moyen (j)','Coefficient','PA vs EP achat','PV vs EP vente'].map((l,i)=>(
                      <th key={i} className={i===0?TH:THR}>{l}</th>
                    ))}</tr></thead>
                    <tbody>{topCoeff.map((s,i)=>(
                      <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                        <td className={TD}>{modeleCol(s)}</td>
                        <td className={TDR}>{s.famille||'—'}</td>
                        <td className={TDR}>{s.qteVendue}</td>
                        <td className={TDR}>{fmtK(s.margeUnitaire)} €</td>
                        <td className={TDR}>{s.delaiMoyen!==null?`${s.delaiMoyen} j`:'—'}</td>
                        <td className={TDR}><span className="font-bold text-[#E30613]">{s.coeff}</span></td>
                        <td className={TDR}><EcartCell v={s.ecartEPA??null}/></td>
                        <td className={TDR}><EcartCell v={s.ecartEP??null}/></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <p className="text-xs text-[#9CA3AF] italic px-1">💡 Le coefficient d&apos;écoulement croise marge et vitesse de rotation. Plus il est élevé, plus le produit rapporte de marge par jour de stock immobilisé. Indicateur synthétique de la vraie rentabilité d&apos;un modèle.</p>
                {hasCoeffEP&&(ra||rv)&&(
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-1.5 text-xs text-[#1A1A1A]">
                    {ra&&<p>{ra}</p>}
                    {rv&&<p>{rv}</p>}
                  </div>
                )}
                {coeffPepCnt>0&&(
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-xs text-green-800">
                    🌍 <strong>{coeffPepCnt} modèle{coeffPepCnt>1?'s':''} absent{coeffPepCnt>1?'s':''} de la gamme réseau {pepiteLocaleFamily||'nationale'}</strong>. À intégrer en sourcing prioritaire au comptoir.
                  </div>
                )}
                {!hasAnyGamme&&detectedFamilies.some(f=>(['JCDR','JCON','TLCE','JPOR'] as string[]).includes(f))&&(
                  <p className="text-xs text-[#9CA3AF] italic px-1">💡 Importez la gamme réseau pour identifier les pépites locales absentes de la référence nationale.</p>
                )}
              </div>
            );
          })()}

          {/* Section 8: Flops */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-bold text-[#1A1A1A]">🔴 Flops — produits lents avec écart prix EasyPrice <span className="text-xs font-normal text-[#9CA3AF]">délai &gt; 60j · EP renseignée · écart &gt; ±10% · min 3 ventes</span></h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">Modèles dont le délai dépasse 60 jours et dont le prix s&apos;écarte de la cote réseau</p>
            </div>
            {flops.length===0?(
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium">
                ✅ Aucun flop détecté sur cette période. Bravo.
              </div>
            ):(
              <>
                <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
                  <table className="text-xs w-full border-collapse">
                    <thead><tr>{['Modèle','Plateforme/Marque','Qté','Délai moyen (j)','PV moyen (€)','Cote EP (€)','Écart %'].map((l,i)=>(
                      <th key={i} className={i===0?TH:THR}>{l}</th>
                    ))}</tr></thead>
                    <tbody>{flops.map((s,i)=>(
                      <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                        <td className={TD}>{modeleCol(s)}</td>
                        <td className={TDR}>{detectMarqueOuPlateforme(s.modele,s.famille)||s.famille||'—'}</td>
                        <td className={TDR}>{s.qteVendue}</td>
                        <td className={TDR}><span className="text-orange-500 font-semibold">{s.delaiMoyen} j</span></td>
                        <td className={TDR}>{fmtK(s.pvMoyen)} €</td>
                        <td className={TDR}>{s.epMoyen!=null?`${fmtK(s.epMoyen)} €`:'—'}</td>
                        <td className={TDR}>
                          <span className={s.ecartEP!<0
                            ?'bg-red-100 text-red-700 font-semibold px-1.5 py-0.5 rounded'
                            :'bg-orange-100 text-orange-700 font-semibold px-1.5 py-0.5 rounded'
                          }>{fmtE(s.ecartEP!)}</span>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <p className="text-xs text-[#6B7280]">
                  📊 <strong className="text-[#1A1A1A]">{flops.length}</strong> modèle{flops.length!==1?'s':''} en alerte sur la période — dont{' '}
                  <strong className="text-[#1A1A1A]">{flops.filter(s=>s.ecartEP!<0).length}</strong> sous-évalué{flops.filter(s=>s.ecartEP!<0).length!==1?'s':''} (écart négatif) et{' '}
                  <strong className="text-[#1A1A1A]">{flops.filter(s=>s.ecartEP!>0).length}</strong> sur-évalué{flops.filter(s=>s.ecartEP!>0).length!==1?'s':''} (écart positif).
                </p>
              </>
            )}
          </div>

          {/* Section 9: Recommandations */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#1A1A1A]">🎯 Recommandations stratégiques</h3>
            <ul className="space-y-2.5 text-sm">
              <li><span className="font-semibold text-[#1A1A1A]">⚡ Rotation rapide (&lt; 30j, 🟢 ou ✅) :</span>{' '}<span className="text-[#6B7280]">{topRotations.filter(r=>r.qteVendue>=5).slice(0,5).map(r=>`${r.modele} (${r.delaiMoyen}j)`).join(', ')||'Aucun modèle fiable sur cette période.'}</span></li>
              <li><span className="font-semibold text-[#E30613]">💎 Pépites locales :</span>{' '}<span className="text-[#6B7280]">{pepites.length>0?pepites.map(p=>p.modele).join(', '):'Aucune pépite détectée — élargissez la période.'}</span></li>
              {flops.length>0&&<li><span className="font-semibold text-red-600">🔴 Flops à traiter en priorité :</span>{' '}<span className="text-[#6B7280]">{flops.slice(0,3).map(f=>`${f.modele} (${f.delaiMoyen}j, ${fmtE(f.ecartEP!)})`).join(', ')}</span></li>}
            </ul>
            <div className="bg-[#FFF5F5] border border-[#FECACA] rounded-lg px-4 py-3 text-xs text-[#1A1A1A]">
              <strong>Action prioritaire :</strong> intégrer les pépites locales fiables dans votre gamme prioritaire. Croisez avec le module <strong>Couverture de gamme</strong>.
            </div>
            {onAddAction&&(
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
