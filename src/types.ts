export type Phase = 'Lancement' | 'Croissance' | 'Maturité';
export type ActionAxe = 'Stock' | 'Commerce' | 'Management' | 'Web' | 'Transverse';
export type StoredStatut = 'À faire' | 'En cours' | 'Fait';
export type DisplayStatut = StoredStatut | 'Retard';

export interface MagasinData {
  nom: string;
  phase: Phase;
  // Rentabilité
  caAnnuel: number;
  tauxMargeNette: number;
  tauxDemarque: number;
  chvacv: number;
  // Stock
  stockTotal: number;
  stockAge: number;
  gmroi: number;
  top20Traite: boolean;
  delaiTel: number;
  delaiConsole: number;
  delaiJV: number;
  delaiTablette: number;
  delaiPC: number;
  // Commerce
  tauxTransformation: number;
  panierMoyen: number;
  ventesAdditionnelles: number;
  estalyParSemaine: number;
  noteGoogle: number;
  poidsDigital: number;
  tauxAnnulationWeb: number;
  tauxSAV: number;
  // Gamme
  gammeTel: number;
  gammeJV: number;
  gammeConsole: number;
  gammeTablette: number;
  tauxAchatExterne: number;
  tauxPiceasoft: number;
  // RH
  nbEtp: number;
  masseSalarialePct: number;
  tauxTurnover: number;
  tauxFormation: number;
}

export const DEFAULT_DATA: MagasinData = {
  nom: '', phase: 'Croissance',
  caAnnuel: 0, tauxMargeNette: 0, tauxDemarque: 0, chvacv: 0,
  stockTotal: 0, stockAge: 0, gmroi: 0, top20Traite: false,
  delaiTel: 0, delaiConsole: 0, delaiJV: 0, delaiTablette: 0, delaiPC: 0,
  tauxTransformation: 0, panierMoyen: 0, ventesAdditionnelles: 0, estalyParSemaine: 0,
  noteGoogle: 0, poidsDigital: 0, tauxAnnulationWeb: 0, tauxSAV: 0,
  gammeTel: 0, gammeJV: 0, gammeConsole: 0, gammeTablette: 0, tauxAchatExterne: 0, tauxPiceasoft: 0,
  nbEtp: 0, masseSalarialePct: 0, tauxTurnover: 0, tauxFormation: 0,
};

export interface PAPAction {
  id: string;
  titre: string;
  axe: ActionAxe;
  pilote: string;
  copilote: string;
  description: string;
  echeance: string;
  priorite: 1 | 2 | 3;
  gain: number;
  statut: StoredStatut;
}
