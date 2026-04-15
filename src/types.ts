export type Phase = 'Lancement' | 'Croissance' | 'Maturité';
export type ActionAxe = 'Stock' | 'Commerce' | 'Management' | 'Web' | 'Transverse';
export type StoredStatut = 'À faire' | 'En cours' | 'Fait';
export type DisplayStatut = StoredStatut | 'Retard';

export interface MagasinData {
  magasin: string;
  phase: Phase;
  // Stock
  stockTotal: number;
  stockAge: number;
  top20Traite: boolean;
  rattachementWeb: number;
  gmroi: number;
  // Commerce
  nbEtp: number;
  panierMoyen: number;
  estalyParSemaine: number;
  noteGoogle: number;
  tauxAnnulationWeb: number;
  // Management
  briefingQuotidien: boolean;
  entretiensMenusuels: boolean;
  nbVendeursFormes: number;
  masseSalarialePct: number;
  nbInventairesTournants: number;
}

export const DEFAULT_DATA: MagasinData = {
  magasin: '',
  phase: 'Croissance',
  stockTotal: 0,
  stockAge: 0,
  top20Traite: false,
  rattachementWeb: 0,
  gmroi: 0,
  nbEtp: 0,
  panierMoyen: 0,
  estalyParSemaine: 0,
  noteGoogle: 0,
  tauxAnnulationWeb: 0,
  briefingQuotidien: false,
  entretiensMenusuels: false,
  nbVendeursFormes: 0,
  masseSalarialePct: 0,
  nbInventairesTournants: 0,
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
