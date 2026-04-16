import type { MagasinData } from '@/types';

export type KpiStatus = 'ok' | 'warn' | 'danger';
export type KpiCategory = 'rentabilite' | 'stock' | 'commerce' | 'gamme' | 'rh';

export interface KpiDef {
  key: keyof MagasinData;
  label: string;
  unit: string;
  category: KpiCategory;
  seuilOk: string;
  seuilVigilance: string;
  getStatus: (v: number) => KpiStatus;
  score: (v: number) => number; // 0-100
  actionWarn: string;
  actionDanger: string;
}

function s3(v: number, okFn: (x: number) => boolean, warnFn: (x: number) => boolean): KpiStatus {
  return okFn(v) ? 'ok' : warnFn(v) ? 'warn' : 'danger';
}
function sc3(v: number, okFn: (x: number) => boolean, warnFn: (x: number) => boolean): number {
  return okFn(v) ? 100 : warnFn(v) ? 50 : 0;
}

export const KPI_DEFS: KpiDef[] = [
  // Rentabilité
  {
    key: 'tauxMargeNette', label: 'Taux de marge nette', unit: '%', category: 'rentabilite',
    seuilOk: '≥38%', seuilVigilance: '35-38%',
    getStatus: (v) => s3(v, x => x >= 38, x => x >= 35),
    score: (v) => sc3(v, x => x >= 38, x => x >= 35),
    actionWarn: 'Analysez votre mix rayon. Les familles à faible marge tirent votre moyenne vers le bas.',
    actionDanger: 'Arrêtez les achats sur les familles à marge négative. Revoyez vos prix de vente avec EasyPrice.',
  },
  {
    key: 'tauxDemarque', label: 'Taux de démarque', unit: '%', category: 'rentabilite',
    seuilOk: '<3%', seuilVigilance: '3-5%',
    getStatus: (v) => s3(v, x => x > 0 && x < 3, x => x >= 3 && x <= 5),
    score: (v) => v <= 0 ? 0 : sc3(v, x => x < 3, x => x <= 5),
    actionWarn: 'Renforcez les contrôles à la caisse. Vérifiez les procédures de démarque connue.',
    actionDanger: "Audit démarque urgent. Installez une caméra sur les zones à risque. Inventaire tournant hebdomadaire.",
  },
  {
    key: 'chvacv', label: 'CHVACV', unit: '€/h', category: 'rentabilite',
    seuilOk: '>40€/h', seuilVigilance: '25-40€/h',
    getStatus: (v) => s3(v, x => x >= 40, x => x >= 25),
    score: (v) => sc3(v, x => x >= 40, x => x >= 25),
    actionWarn: 'Réduisez les charges variables (emballage, consommables). Optimisez les heures creuses.',
    actionDanger: 'Votre modèle économique est sous tension. Réduisez les charges variables immédiatement.',
  },
  // Stock
  {
    key: 'stockAge', label: 'Stock âgé', unit: '%', category: 'stock',
    seuilOk: '<20%', seuilVigilance: '20-30%',
    getStatus: (v) => s3(v, x => x > 0 && x < 20, x => x >= 20 && x <= 30),
    score: (v) => v <= 0 ? 0 : sc3(v, x => x < 20, x => x <= 30),
    actionWarn: 'Lancez des accélérations sur les produits >30 jours. Baissez les prix de 10%.',
    actionDanger: 'Traitez votre TOP 20 en valeur — Intranet > Stats > Stocks > Réseau > Ventilation.',
  },
  {
    key: 'gmroi', label: 'GMROI', unit: '', category: 'stock',
    seuilOk: '>3.5', seuilVigilance: '2.5-3.5',
    getStatus: (v) => s3(v, x => x >= 3.5, x => x >= 2.5),
    score: (v) => sc3(v, x => x >= 3.5, x => x >= 2.5),
    actionWarn: 'Réduisez votre stock sans réduire votre marge. Identifiez les familles à faible rotation.',
    actionDanger: 'Votre stock génère peu de marge. Déstocker les familles les moins performantes en priorité.',
  },
  {
    key: 'delaiTel', label: 'Délai vente Téléphonie', unit: 'j', category: 'stock',
    seuilOk: '<30j', seuilVigilance: '30-60j',
    getStatus: (v) => s3(v, x => x > 0 && x < 30, x => x >= 30 && x <= 60),
    score: (v) => v <= 0 ? 0 : sc3(v, x => x < 30, x => x <= 60),
    actionWarn: 'Appliquez les côtes réseau à 30j. Baissez les prix des téléphones >30j de 10%.',
    actionDanger: 'Accélération téléphonie urgente : côtes à 15j, 30j, 60j — passez en-dessous du réseau.',
  },
  {
    key: 'delaiConsole', label: 'Délai vente Console', unit: 'j', category: 'stock',
    seuilOk: '<30j', seuilVigilance: '30-60j',
    getStatus: (v) => s3(v, x => x > 0 && x < 30, x => x >= 30 && x <= 60),
    score: (v) => v <= 0 ? 0 : sc3(v, x => x < 30, x => x <= 60),
    actionWarn: 'Côtes consoles à appliquer. Vérifiez la vitrine et le facing.',
    actionDanger: 'Destockez les consoles âgées. Passez les prix en-dessous du réseau.',
  },
  {
    key: 'delaiJV', label: 'Délai vente Jeux Vidéo', unit: 'j', category: 'stock',
    seuilOk: '<30j', seuilVigilance: '30-60j',
    getStatus: (v) => s3(v, x => x > 0 && x < 30, x => x >= 30 && x <= 60),
    score: (v) => v <= 0 ? 0 : sc3(v, x => x < 30, x => x <= 60),
    actionWarn: 'Côtes JV à appliquer à 30j. Mettre en avant les best-sellers.',
    actionDanger: 'Jeux Vidéo >60j : appliquez les côtes réseau à 60j immédiatement.',
  },
  {
    key: 'delaiTablette', label: 'Délai vente Tablette', unit: 'j', category: 'stock',
    seuilOk: '<30j', seuilVigilance: '30-60j',
    getStatus: (v) => s3(v, x => x > 0 && x < 30, x => x >= 30 && x <= 60),
    score: (v) => v <= 0 ? 0 : sc3(v, x => x < 30, x => x <= 60),
    actionWarn: 'Côtes tablettes à 30j. Vérifiez votre vitrine tablettes.',
    actionDanger: 'Accélération tablettes urgente. Passez sous le prix réseau.',
  },
  {
    key: 'delaiPC', label: 'Délai vente PC portable', unit: 'j', category: 'stock',
    seuilOk: '<30j', seuilVigilance: '30-60j',
    getStatus: (v) => s3(v, x => x > 0 && x < 30, x => x >= 30 && x <= 60),
    score: (v) => v <= 0 ? 0 : sc3(v, x => x < 30, x => x <= 60),
    actionWarn: 'Côtes PC à 30j. Vérifiez les specs affichées et les prix concurrents.',
    actionDanger: 'PC portables >60j : destockez immédiatement en-dessous du réseau.',
  },
  // Commerce
  {
    key: 'tauxTransformation', label: 'Taux de transformation', unit: '%', category: 'commerce',
    seuilOk: '>40%', seuilVigilance: '30-40%',
    getStatus: (v) => s3(v, x => x >= 40, x => x >= 30),
    score: (v) => sc3(v, x => x >= 40, x => x >= 30),
    actionWarn: "Formez l'équipe à la découverte client. Vérifiez l'accueil et le temps d'attente.",
    actionDanger: "Transformation critique. Briefing équipe sur la méthode VPD dès aujourd'hui.",
  },
  {
    key: 'panierMoyen', label: 'Panier moyen', unit: '€', category: 'commerce',
    seuilOk: '>50€', seuilVigilance: '35-50€',
    getStatus: (v) => s3(v, x => x >= 50, x => x >= 35),
    score: (v) => sc3(v, x => x >= 50, x => x >= 35),
    actionWarn: 'Travaillez la montée en gamme et les ventes additionnelles. Formez sur la méthode GPA.',
    actionDanger: 'Panier trop bas. Mettez en avant les produits >50€ en vitrine. Coaching vente immédiat.',
  },
  {
    key: 'estalyParSemaine', label: 'Contrats Estaly/semaine', unit: '/sem', category: 'commerce',
    seuilOk: '>5', seuilVigilance: '3-5',
    getStatus: (v) => s3(v, x => x > 5, x => x >= 3),
    score: (v) => sc3(v, x => x > 5, x => x >= 3),
    actionWarn: 'Briefez vos vendeurs sur Estaly. Posez la question à chaque vente >50€.',
    actionDanger: "Briefez vos vendeurs : 1 contrat/jour = +1 114€/an net pour eux. Démonstration obligatoire.",
  },
  {
    key: 'noteGoogle', label: 'Note Google', unit: '/5', category: 'commerce',
    seuilOk: '>4.4', seuilVigilance: '4.0-4.4',
    getStatus: (v) => s3(v, x => x > 4.4, x => x >= 4.0),
    score: (v) => sc3(v, x => x > 4.4, x => x >= 4.0),
    actionWarn: 'Répondez à tous les avis négatifs. Demandez un avis à chaque client satisfait.',
    actionDanger: "Note critique. Identifiez et traitez les causes racines des mauvais avis en priorité absolue.",
  },
  {
    key: 'poidsDigital', label: 'Poids digital (CA web)', unit: '%', category: 'commerce',
    seuilOk: '>15%', seuilVigilance: '10-15%',
    getStatus: (v) => s3(v, x => x >= 15, x => x >= 10),
    score: (v) => sc3(v, x => x >= 15, x => x >= 10),
    actionWarn: 'Activez plus de références sur EC.fr. Vérifiez la qualité des photos et des descriptions.',
    actionDanger: 'Le digital représente votre 2e magasin. Objectif : 60% de rattachement web.',
  },
  {
    key: 'tauxAnnulationWeb', label: "Taux d'annulation web", unit: '%', category: 'commerce',
    seuilOk: '<20%', seuilVigilance: '20-30%',
    getStatus: (v) => s3(v, x => x > 0 && x < 20, x => x >= 20 && x <= 30),
    score: (v) => v <= 0 ? 0 : sc3(v, x => x < 20, x => x <= 30),
    actionWarn: "Vérifiez la qualité des annonces. Traitez les commandes dans les 24h.",
    actionDanger: "Taux d'annulation critique. Processus de traitement commande à revoir entièrement.",
  },
  {
    key: 'tauxSAV', label: 'Taux de SAV', unit: '%', category: 'commerce',
    seuilOk: '<5%', seuilVigilance: '5-10%',
    getStatus: (v) => s3(v, x => x > 0 && x < 5, x => x >= 5 && x <= 10),
    score: (v) => v <= 0 ? 0 : sc3(v, x => x < 5, x => x <= 10),
    actionWarn: "Renforcez le test produits à l'achat. Vérifiez les procédures de contrôle qualité.",
    actionDanger: 'SAV trop élevé. Auditez vos procédures de test et refusez les produits douteux.',
  },
  // Gamme
  {
    key: 'gammeTel', label: 'Gamme Téléphonie', unit: '%', category: 'gamme',
    seuilOk: '35-40%', seuilVigilance: '25-35% ou 40-45%',
    getStatus: (v) => v >= 35 && v <= 40 ? 'ok' : (v >= 25 && v < 35) || (v > 40 && v <= 45) ? 'warn' : 'danger',
    score: (v) => v >= 35 && v <= 40 ? 100 : (v >= 25 && v < 35) || (v > 40 && v <= 45) ? 50 : 0,
    actionWarn: 'Votre gamme téléphonie est déséquilibrée. Ajustez les achats pour revenir dans la cible 35-40%.',
    actionDanger: 'Gamme téléphonie hors cible. Consultez le réseau pour les quotas par famille.',
  },
  {
    key: 'tauxAchatExterne', label: "Taux d'achat externe", unit: '%', category: 'gamme',
    seuilOk: '<10%', seuilVigilance: '10-20%',
    getStatus: (v) => s3(v, x => x > 0 && x < 10, x => x >= 10 && x <= 20),
    score: (v) => v <= 0 ? 0 : sc3(v, x => x < 10, x => x <= 20),
    actionWarn: 'Les achats externes réduisent votre marge. Privilégiez les dépôts-ventes.',
    actionDanger: "Trop d'achats externes. Formez votre équipe aux techniques d'achat VPD.",
  },
  {
    key: 'tauxPiceasoft', label: 'Utilisation Piceasoft', unit: '%', category: 'gamme',
    seuilOk: '>80%', seuilVigilance: '50-80%',
    getStatus: (v) => s3(v, x => x >= 80, x => x >= 50),
    score: (v) => sc3(v, x => x >= 80, x => x >= 50),
    actionWarn: "Piceasoft non utilisé sur tous les appareils. Formez l'équipe à la procédure.",
    actionDanger: "Piceasoft obligatoire sur tout appareil électronique. Mettez à jour les procédures d'achat.",
  },
  // RH
  {
    key: 'masseSalarialePct', label: 'Masse salariale', unit: '%', category: 'rh',
    seuilOk: '≤15%', seuilVigilance: '15-18%',
    getStatus: (v) => s3(v, x => x > 0 && x <= 15, x => x > 15 && x <= 18),
    score: (v) => v <= 0 ? 0 : sc3(v, x => x <= 15, x => x <= 18),
    actionWarn: 'Ratio cible : 1 ETP / 250k€ CA. Pensez au contrat 39H pour vos piliers.',
    actionDanger: 'Masse salariale critique. Analysez les heures supplémentaires et les pointes de charge.',
  },
  {
    key: 'tauxTurnover', label: 'Taux de turnover', unit: '%', category: 'rh',
    seuilOk: '<15%', seuilVigilance: '15-25%',
    getStatus: (v) => s3(v, x => x > 0 && x < 15, x => x >= 15 && x <= 25),
    score: (v) => v <= 0 ? 0 : sc3(v, x => x < 15, x => x <= 25),
    actionWarn: 'Identifiez les causes de départ. Entretiens de sortie systématiques.',
    actionDanger: 'Turnover critique. Auditez les conditions de travail et la politique salariale.',
  },
  {
    key: 'tauxFormation', label: 'Formation EasyTraining', unit: '%', category: 'rh',
    seuilOk: '>80%', seuilVigilance: '50-80%',
    getStatus: (v) => s3(v, x => x >= 80, x => x >= 50),
    score: (v) => sc3(v, x => x >= 80, x => x >= 50),
    actionWarn: 'Planifiez des sessions EasyTraining pour les collaborateurs non formés.',
    actionDanger: 'Formation insuffisante. Planifiez les formations EasyTraining obligatoires cette semaine.',
  },
];

export function getKpiStatus(key: keyof MagasinData, value: number): KpiStatus {
  const def = KPI_DEFS.find(d => d.key === key);
  if (!def || value === 0) return 'ok';
  return def.getStatus(value);
}

export function getKpiScore(key: keyof MagasinData, value: number): number {
  const def = KPI_DEFS.find(d => d.key === key);
  if (!def || value === 0) return 50;
  return def.score(value);
}

// Category scores (0-100)
export function getCategoryScores(data: MagasinData): {
  rentabilite: number;
  stock: number;
  commerce: number;
  rh: number;
} {
  function avg(keys: Array<keyof MagasinData>): number {
    const vals = keys
      .map(k => {
        const v = data[k];
        return typeof v === 'number' && v > 0 ? getKpiScore(k, v) : null;
      })
      .filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 50;
  }

  return {
    rentabilite: avg(['tauxMargeNette', 'tauxDemarque', 'chvacv']),
    stock: avg(['stockAge', 'gmroi', 'delaiTel', 'delaiConsole', 'delaiJV', 'delaiTablette', 'delaiPC']),
    commerce: avg(['tauxTransformation', 'panierMoyen', 'estalyParSemaine', 'noteGoogle', 'poidsDigital']),
    rh: avg(['masseSalarialePct', 'tauxTurnover', 'tauxFormation']),
  };
}

// Get alerting KPIs (warn or danger)
export interface KpiAlert {
  key: keyof MagasinData;
  label: string;
  unit: string;
  value: number;
  status: KpiStatus;
  seuilOk: string;
  actionText: string;
}

export function getAlerts(data: MagasinData): KpiAlert[] {
  return KPI_DEFS.flatMap(def => {
    const value = data[def.key];
    if (typeof value !== 'number' || value === 0) return [];
    const status = def.getStatus(value);
    if (status === 'ok') return [];
    return [{
      key: def.key,
      label: def.label,
      unit: def.unit,
      value,
      status,
      seuilOk: def.seuilOk,
      actionText: status === 'danger' ? def.actionDanger : def.actionWarn,
    }];
  });
}

// Parse pasted text to extract KPI values
export function parsePastedText(text: string): Partial<MagasinData> {
  const result: Partial<MagasinData> = {};
  const patterns: Array<{ keywords: string[]; key: keyof MagasinData }> = [
    { keywords: ['marge nette', 'taux de marge', 'marge brute', 'marge'], key: 'tauxMargeNette' },
    { keywords: ['démarque', 'demarque', 'taux démarque'], key: 'tauxDemarque' },
    { keywords: ['stock âgé', 'stock age', 'vieux stock', 'stock agé'], key: 'stockAge' },
    { keywords: ['gmroi', 'rotation stock', 'rotation du stock'], key: 'gmroi' },
    { keywords: ['stock total', 'valeur stock', 'stock'], key: 'stockTotal' },
    { keywords: ["chiffre d'affaires", 'ca annuel', 'ca mensuel', 'ca '], key: 'caAnnuel' },
    { keywords: ['estaly', 'contrats estaly'], key: 'estalyParSemaine' },
    { keywords: ['note google', 'google', 'avis google'], key: 'noteGoogle' },
    { keywords: ['masse salariale', 'masse sal', 'ms %'], key: 'masseSalarialePct' },
    { keywords: ['nb etp', 'etp', 'effectif'], key: 'nbEtp' },
    { keywords: ['turnover', 'taux turnover', 'taux de turnover'], key: 'tauxTurnover' },
    { keywords: ['transformation', 'taux transformation', 'tx transfo'], key: 'tauxTransformation' },
    { keywords: ['panier moyen', 'panier'], key: 'panierMoyen' },
    { keywords: ['poids digital', 'web', 'digital'], key: 'poidsDigital' },
    { keywords: ['piceasoft', 'piceas'], key: 'tauxPiceasoft' },
    { keywords: ['achat externe', 'achats externes'], key: 'tauxAchatExterne' },
    { keywords: ['formation', 'easytraining'], key: 'tauxFormation' },
    { keywords: ['téléphonie', 'telephonie', 'gamme tel'], key: 'gammeTel' },
  ];

  for (const p of patterns) {
    for (const kw of p.keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`${escaped}[\\s:=à]*([\\d\\s,.]+)\\s*%?`, 'i');
      const match = text.match(regex);
      if (match) {
        const num = parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
        if (!isNaN(num) && num >= 0) {
          (result as Record<string, number>)[p.key as string] = num;
          break;
        }
      }
    }
  }
  return result;
}
