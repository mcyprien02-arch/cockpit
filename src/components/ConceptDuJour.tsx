'use client';

import { useState } from 'react';

interface Props { magasinNom: string; onNavigate?: (tab: string) => void; }

type ConceptTag = 'Vente' | 'Achat' | 'Stock' | 'Management' | 'Mindset';
type View = 'today' | 'vision' | 'library';

interface Vision {
  vision3ans: string;
  valeur1: string; valeur2: string; valeur3: string;
  capCommercial: string;
}

interface ConceptMaison {
  id: string;
  titre: string;
  phrase: string;
  application: string;
  tag: ConceptTag;
}

const DEFAULT_VISION: Vision = { vision3ans: '', valeur1: '', valeur2: '', valeur3: '', capCommercial: '' };

const TAG_COLORS: Record<ConceptTag, string> = {
  Vente:      'bg-green-100 text-green-700 border-green-200',
  Achat:      'bg-blue-100 text-blue-700 border-blue-200',
  Stock:      'bg-orange-100 text-orange-700 border-orange-200',
  Management: 'bg-purple-100 text-purple-700 border-purple-200',
  Mindset:    'bg-[#FFF5F5] text-[#E30613] border-[#E30613]/20',
};

// ── 60 concepts réseau ────────────────────────────────────────────────────────
const CONCEPTS_RESEAU: Array<{ titre: string; phrase: string; tag: ConceptTag }> = [
  // Vente (15)
  { titre: "Le sourire vend avant les mots", phrase: "Un accueil chaleureux génère plus de conversions qu'un argument produit parfait.", tag: 'Vente' },
  { titre: "L'accessoire crée la valeur perçue", phrase: "Un produit seul se revend. Un produit avec son accessoire se désire.", tag: 'Vente' },
  { titre: "La question bat l'argument", phrase: "Posez 3 questions avant de parler prix. Votre taux de transformation vous remerciera.", tag: 'Vente' },
  { titre: "Estaly : une protection, pas une option", phrase: "Si vous n'oserez pas refuser cette protection pour vous, ne l'omettez pas pour votre client.", tag: 'Vente' },
  { titre: "Un SAV bien géré crée un client fidèle", phrase: "La façon dont vous gérez les problèmes en dit plus sur vous que vos ventes faciles.", tag: 'Vente' },
  { titre: "Le prix n'est jamais le vrai sujet", phrase: "Quand un client dit 'c'est trop cher', il dit 'je ne vois pas encore la valeur'.", tag: 'Vente' },
  { titre: "Votre vitrine est votre premier vendeur", phrase: "Soignez-la chaque matin comme si votre meilleur client passait dans 10 minutes.", tag: 'Vente' },
  { titre: "Le client achète une solution", phrase: "Il n'achète pas un téléphone, il achète de la connexion. Vendez le bénéfice.", tag: 'Vente' },
  { titre: "Oser conclure, c'est respecter le client", phrase: "Ne pas proposer d'aller en caisse prive le client d'une décision assumée.", tag: 'Vente' },
  { titre: "La réassurance bat la promotion", phrase: "La garantie convainc mieux qu'une remise. Apprenez à valoriser le service.", tag: 'Vente' },
  { titre: "Un bon vendeur écoute à 70%", phrase: "Parler, c'est expliquer. Écouter, c'est comprendre. La vente se joue dans la différence.", tag: 'Vente' },
  { titre: "La vente additionnelle honore le client", phrase: "Proposer un accessoire adapté, c'est montrer que vous pensez à lui, pas à votre CA.", tag: 'Vente' },
  { titre: "Anticiper l'objection, c'est l'éliminer", phrase: "Nommez la limitation vous-même avant le client. Ça crédibilise et désamorce.", tag: 'Vente' },
  { titre: "Le comparatif joue pour vous", phrase: "En seconde main, votre concurrent est le neuf. Maîtrisez cet écart de prix.", tag: 'Vente' },
  { titre: "La promesse tenue vaut mieux que la promo", phrase: "Un client à qui vous avez rendu service revient. Un client attiré par une promo compare.", tag: 'Vente' },
  // Achat (10)
  { titre: "Acheter juste, vendre avec plaisir", phrase: "Le prix d'achat détermine votre marge future. Prenez-le aussi au sérieux que la vente.", tag: 'Achat' },
  { titre: "La VPD protège autant qu'elle cadre", phrase: "Les 5 questions de la VPD vous protègent autant que le client. Appliquez-les sans exception.", tag: 'Achat' },
  { titre: "Piceasoft : 30 secondes, zéro SAV", phrase: "Un test Piceasoft au rachat élimine 80% des litiges. Le temps perdu se récupère immédiatement.", tag: 'Achat' },
  { titre: "Votre fournisseur, c'est votre client qui vend", phrase: "Traitez chaque apporteur comme un partenaire. Votre gamme se construit à l'achat.", tag: 'Achat' },
  { titre: "Négocier, c'est respecter sa marge", phrase: "Chaque euro gagné à l'achat est garanti. Chaque euro espéré à la vente reste incertain.", tag: 'Achat' },
  { titre: "La gamme se décide au comptoir", phrase: "C'est à l'achat que vous construisez l'offre que vous venderez. Anticipez la demande.", tag: 'Achat' },
  { titre: "Un produit mal acheté est un problème futur", phrase: "La précipitation à l'achat crée le stock âgé de demain. Prenez 30 secondes de plus.", tag: 'Achat' },
  { titre: "Deux acheteurs, une assurance", phrase: "Un seul acheteur formé, c'est une dépendance. Deux acheteurs, c'est une équipe robuste.", tag: 'Achat' },
  { titre: "L'estimation juste fidélise le vendeur", phrase: "Un client qui obtient une estimation honnête revient. Et il amène ses amis.", tag: 'Achat' },
  { titre: "EasyPrice est votre boussole", phrase: "La cote réseau évolue chaque semaine. La consulter est votre routine la plus rentable.", tag: 'Achat' },
  // Stock (10)
  { titre: "Le stock âgé est du cash gelé", phrase: "Chaque produit invendu depuis 30 jours vous coûte de l'argent. Calculez, puis agissez.", tag: 'Stock' },
  { titre: "Le TOP 20, votre radar hebdomadaire", phrase: "20 produits concentrent souvent 80% de votre stock critique. Extrayez-les chaque lundi.", tag: 'Stock' },
  { titre: "Baisser maintenant évite de sacrifier plus tard", phrase: "Une décote de 10% aujourd'hui protège votre marge mieux qu'un déstockage forcé à -40%.", tag: 'Stock' },
  { titre: "L'inventaire tournant, c'est la réalité", phrase: "Sans inventaire régulier, votre Intranet vous ment. Et vous gérez une illusion.", tag: 'Stock' },
  { titre: "Décider vite sur les accélérations", phrase: "Attendre que l'alerte rouge s'allume coûte cher. Anticipez dès la vigilance orange.", tag: 'Stock' },
  { titre: "EC.fr tourne quand vous dormez", phrase: "Un produit bien référencé avec photos correctes génère des ventes sans vendeur.", tag: 'Stock' },
  { titre: "Démarquer est une décision, pas un échec", phrase: "Accepter de démarquer un invendu est courageux. Laisser traîner est une faiblesse.", tag: 'Stock' },
  { titre: "La gamme équilibrée réduit le risque", phrase: "Concentrer les achats sur une famille crée une vulnérabilité. La diversité protège la marge.", tag: 'Stock' },
  { titre: "Le rattachement F3 parle pour vous", phrase: "Sans rattachement produit, EasyPrice ne peut pas vous aider. La donnée est votre levier.", tag: 'Stock' },
  { titre: "Piloter le stock, c'est piloter le cash", phrase: "Votre trésorerie se lit en grande partie dans vos étagères. Gérez-les comme un compte.", tag: 'Stock' },
  // Management (15)
  { titre: "Ce que vous tolérez devient votre standard", phrase: "Votre niveau correspond exactement à ce que vous avez accepté d'observer sans agir.", tag: 'Management' },
  { titre: "5 minutes de brief, une journée alignée", phrase: "Un briefing matinal court et structuré vaut mieux que trois rappels éparpillés.", tag: 'Management' },
  { titre: "Manager, c'est poser les bonnes questions", phrase: "Donner des réponses forme des exécutants. Poser des questions forme des décideurs.", tag: 'Management' },
  { titre: "Félicitez public, recadrez en privé", phrase: "La reconnaissance publique crée des modèles. Le recadrage en privé préserve la dignité.", tag: 'Management' },
  { titre: "Votre équipe fait ce que vous faites", phrase: "L'exemplarité n'est pas optionnelle. Chaque comportement que vous autorisez pour vous est autorisé implicitement.", tag: 'Management' },
  { titre: "Un objectif sans chiffre est un vœu pieux", phrase: "Dites '+2 Estaly/semaine' pas 'améliorer l'Estaly'. Le chiffre crée l'intention.", tag: 'Management' },
  { titre: "La confiance se délègue, le résultat se vérifie", phrase: "Faire confiance ne signifie pas ne pas contrôler. Ça signifie contrôler avec bienveillance.", tag: 'Management' },
  { titre: "Un entretien mensuel évite trois crises", phrase: "1h d'investissement par mois par collaborateur coûte moins cher que les dysfonctionnements non dits.", tag: 'Management' },
  { titre: "Formez avant d'exiger", phrase: "On ne peut pas reprocher à un collaborateur de mal faire ce qu'il n'a jamais appris correctement.", tag: 'Management' },
  { titre: "La polyvalence est votre assurance opérationnelle", phrase: "Un seul expert par rayon, c'est un risque. Deux, c'est une équipe. Investissez en conséquence.", tag: 'Management' },
  { titre: "Ce qui se mesure s'améliore", phrase: "Affichez vos indicateurs. Un chiffre visible crée une intention. Une intention crée une action.", tag: 'Management' },
  { titre: "Recruter mal coûte plus qu'une formation", phrase: "Le vrai coût d'un mauvais recrutement dépasse le salaire. L'intégration est un investissement.", tag: 'Management' },
  { titre: "La reconnaissance est un levier gratuit", phrase: "Dire 'c'est bien ce que tu as fait ce matin' prend 5 secondes et dure plusieurs jours.", tag: 'Management' },
  { titre: "EasyTraining est votre plan de montée en puissance", phrase: "Chaque module non suivi est une compétence non développée. Planifiez, ne subissez pas.", tag: 'Management' },
  { titre: "Les feedbacks courts remplacent les bilans annuels", phrase: "À l'heure du turnover élevé, les retours fréquents et brefs ancrent mieux que les grands entretiens.", tag: 'Management' },
  // Mindset (10)
  { titre: "La performance est une routine, pas un talent", phrase: "Les meilleurs magasins du réseau ne font rien d'extraordinaire. Ils font l'ordinaire, extraordinairement.", tag: 'Mindset' },
  { titre: "Le problème n'est pas le problème", phrase: "Un problème récurrent est un signe d'absence de méthode. La solution est dans le process.", tag: 'Mindset' },
  { titre: "La régularité bat le talent irrégulier", phrase: "Un magasin moyen appliqué bat un magasin brillant distrait. Chaque semaine, sans exception.", tag: 'Mindset' },
  { titre: "Travaillez SUR votre magasin", phrase: "Passer toutes vos heures DANS le magasin vous empêche de le voir. Sortez la tête pour piloter.", tag: 'Mindset' },
  { titre: "Votre attitude du matin donne le ton", phrase: "L'état d'esprit du responsable contamine l'équipe — positivement ou négativement. Choisissez.", tag: 'Mindset' },
  { titre: "Le client difficile est votre formateur", phrase: "Chaque objection non résolue est une compétence à développer. Analysez-la sans vous défausser.", tag: 'Mindset' },
  { titre: "Sans brief, l'énergie se disperse", phrase: "Un magasin sans cap collectif part chaque matin sans direction. La réunion courte aligne tout.", tag: 'Mindset' },
  { titre: "Le plus grand risque est l'immobilisme", phrase: "Dans un marché qui évolue, rester immobile est une stratégie de déclin. Adaptez-vous.", tag: 'Mindset' },
  { titre: "Les chiffres sont vos amis", phrase: "Fuir les indicateurs ne fait pas disparaître les problèmes. Ils vous donnent du temps d'avance.", tag: 'Mindset' },
  { titre: "Ce que vous croyez de votre équipe la crée", phrase: "Les managers qui croient en leur équipe obtiennent de meilleurs résultats. La confiance est contagieuse.", tag: 'Mindset' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDayOfYear(): number {
  const now = new Date();
  return Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000);
}

function seededPick<T>(arr: T[], seed: number): T {
  const x = Math.abs(Math.sin(seed + 1) * 10000);
  return arr[Math.floor((x - Math.floor(x)) * arr.length)];
}

function uid(): string { return Math.random().toString(36).slice(2); }

function loadVision(nom: string): Vision {
  if (typeof window === 'undefined' || !nom) return DEFAULT_VISION;
  try { const s = localStorage.getItem(`vision_${nom}`); return s ? { ...DEFAULT_VISION, ...JSON.parse(s) as Partial<Vision> } : DEFAULT_VISION; }
  catch { return DEFAULT_VISION; }
}

function loadConcepts(nom: string): ConceptMaison[] {
  if (typeof window === 'undefined' || !nom) return [];
  try { const s = localStorage.getItem(`concepts_maison_${nom}`); return s ? JSON.parse(s) as ConceptMaison[] : []; }
  catch { return []; }
}

const TAGS: ConceptTag[] = ['Vente', 'Achat', 'Stock', 'Management', 'Mindset'];
const DEFAULT_FORM: Omit<ConceptMaison, 'id'> = { titre: '', phrase: '', application: '', tag: 'Vente' };

// ── Composant ─────────────────────────────────────────────────────────────────
export default function ConceptDuJour({ magasinNom, onNavigate }: Props) {
  const [view, setView] = useState<View>('today');

  // Vision
  const [vision, setVision] = useState<Vision>(() => loadVision(magasinNom));
  const [visionForm, setVisionForm] = useState<Vision>(() => loadVision(magasinNom));
  const [visionSaved, setVisionSaved] = useState(false);

  // Personal library
  const [concepts, setConcepts] = useState<ConceptMaison[]>(() => loadConcepts(magasinNom));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<Omit<ConceptMaison, 'id'>>(DEFAULT_FORM);

  function saveVision() {
    const v = { ...visionForm };
    setVision(v);
    localStorage.setItem(`vision_${magasinNom}`, JSON.stringify(v));
    setVisionSaved(true);
    setTimeout(() => setVisionSaved(false), 2000);
  }

  function saveConcepts(next: ConceptMaison[]) {
    setConcepts(next);
    localStorage.setItem(`concepts_maison_${magasinNom}`, JSON.stringify(next));
  }

  function addConcept() {
    if (!form.titre.trim() || !form.phrase.trim()) return;
    saveConcepts([...concepts, { ...form, id: uid() }]);
    setForm(DEFAULT_FORM);
    setShowAddForm(false);
  }

  function startEdit(c: ConceptMaison) {
    setEditingId(c.id);
    setForm({ titre: c.titre, phrase: c.phrase, application: c.application, tag: c.tag });
    setShowAddForm(false);
  }

  function saveEdit() {
    if (!editingId || !form.titre.trim()) return;
    saveConcepts(concepts.map(c => c.id === editingId ? { ...c, ...form } : c));
    setEditingId(null);
    setForm(DEFAULT_FORM);
  }

  function deleteConcept(id: string) {
    saveConcepts(concepts.filter(c => c.id !== id));
  }

  const dayOfYear = getDayOfYear();
  const todayGeneric = CONCEPTS_RESEAU[dayOfYear % CONCEPTS_RESEAU.length];
  const todayPersonal = concepts.length > 0 ? seededPick(concepts, dayOfYear) : null;

  const SUB_TABS: Array<{ id: View; label: string }> = [
    { id: 'today',   label: '💡 Concept du jour' },
    { id: 'vision',  label: '🎯 Ma vision' },
    { id: 'library', label: '📝 Mes concepts maison' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-[#1A1A1A]">💡 Concept du jour</h2>
        <p className="text-sm text-[#6B7280] mt-0.5">Brief matinal · Inspirez votre équipe chaque jour</p>
      </div>

      {/* Sub-nav */}
      <div className="flex gap-2 flex-wrap">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors border ${
              view === t.id
                ? 'bg-[#E30613] text-white border-[#E30613]'
                : 'bg-white text-[#1A1A1A] border-[#E0E0E0] hover:bg-[#F5F5F5]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── VIEW : CONCEPT DU JOUR ─────────────────────────────────────────── */}
      {view === 'today' && (
        <div className="space-y-4">
          {/* Date */}
          <p className="text-xs text-[#6B7280]">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>

          {/* Two concepts side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Concept réseau */}
            <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Concept réseau du jour</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TAG_COLORS[todayGeneric.tag]}`}>
                  {todayGeneric.tag}
                </span>
              </div>
              <h3 className="text-base font-black text-[#1A1A1A] leading-tight">{todayGeneric.titre}</h3>
              <p className="text-sm text-[#374151] leading-relaxed flex-1">{todayGeneric.phrase}</p>
              <p className="text-[10px] text-[#9CA3AF]">Concept {(dayOfYear % CONCEPTS_RESEAU.length) + 1}/{CONCEPTS_RESEAU.length}</p>
            </div>

            {/* Concept maison */}
            {todayPersonal ? (
              <div className="bg-white rounded-xl border border-[#E30613]/30 shadow-sm p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#E30613] uppercase tracking-wider">Votre concept maison</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TAG_COLORS[todayPersonal.tag]}`}>
                    {todayPersonal.tag}
                  </span>
                </div>
                <h3 className="text-base font-black text-[#1A1A1A] leading-tight">{todayPersonal.titre}</h3>
                <p className="text-sm text-[#374151] leading-relaxed flex-1">{todayPersonal.phrase}</p>
                {todayPersonal.application && (
                  <div className="bg-[#FFF5F5] border border-[#E30613]/20 rounded-lg p-3">
                    <p className="text-xs font-semibold text-[#E30613] mb-1">En brief :</p>
                    <p className="text-xs text-[#374151] leading-relaxed">{todayPersonal.application}</p>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setView('library')}
                className="bg-[#FAFAFA] border-2 border-dashed border-[#E0E0E0] rounded-xl p-5 text-left hover:border-[#E30613]/40 hover:bg-[#FFF5F5] transition-colors group"
              >
                <p className="text-sm font-semibold text-[#6B7280] group-hover:text-[#E30613] mb-2">🎯 Votre concept maison</p>
                <p className="text-xs text-[#9CA3AF] leading-relaxed">
                  Vous n&apos;avez pas encore créé vos concepts maison. Cliquez pour exprimer votre vision et créer vos premiers concepts.
                </p>
              </button>
            )}
          </div>

          {/* Vision reminder */}
          {(vision.vision3ans || vision.valeur1) && (
            <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Votre cap</p>
              {vision.vision3ans && <p className="text-sm text-[#1A1A1A] truncate">🌟 {vision.vision3ans}</p>}
              {(vision.valeur1 || vision.valeur2 || vision.valeur3) && (
                <p className="text-xs text-[#6B7280] mt-1">
                  💎 {[vision.valeur1, vision.valeur2, vision.valeur3].filter(Boolean).join(' · ')}
                </p>
              )}
              {vision.capCommercial && (
                <p className="text-xs text-[#6B7280] mt-0.5 truncate">🚀 {vision.capCommercial}</p>
              )}
            </div>
          )}

          {/* CTA buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setView('vision')}
              className="text-sm font-semibold px-4 py-2 bg-white border border-[#E0E0E0] rounded-xl text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors"
            >
              🎯 Personnaliser ma vision
            </button>
            <button
              onClick={() => setView('library')}
              className="text-sm font-semibold px-4 py-2 bg-white border border-[#E0E0E0] rounded-xl text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors"
            >
              📝 Gérer mes concepts maison
            </button>
          </div>
        </div>
      )}

      {/* ── VIEW : MA VISION ───────────────────────────────────────────────── */}
      {view === 'vision' && (
        <div className="space-y-5">
          {/* Intro */}
          <div className="bg-[#FFF5F5] border border-[#E30613]/20 rounded-xl px-4 py-3 text-sm text-[#1A1A1A] leading-relaxed">
            Ces éléments expriment qui vous êtes et où vous emmenez votre équipe. Ils alimentent les concepts du jour personnalisés que vous pourrez partager en brief matinal.
          </div>

          <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-5 space-y-5">
            {/* Vision 3 ans */}
            <div>
              <label className="text-sm font-semibold text-[#1A1A1A] block mb-1">🌟 Ma vision pour mon magasin dans 3 ans</label>
              <textarea
                value={visionForm.vision3ans}
                onChange={e => setVisionForm(v => ({ ...v, vision3ans: e.target.value }))}
                rows={3}
                className="w-full bg-[#FAFAFA] border border-[#E0E0E0] rounded-xl px-4 py-3 text-sm text-[#1A1A1A] resize-none focus:outline-none focus:border-[#E30613] focus:bg-white transition-colors"
                placeholder="Ex : Devenir LA référence seconde main de Valence, faire vivre une équipe qui réussit ensemble..."
              />
            </div>

            {/* Valeurs */}
            <div>
              <label className="text-sm font-semibold text-[#1A1A1A] block mb-2">💎 Mes 3 valeurs non-négociables pour mon équipe</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(['valeur1', 'valeur2', 'valeur3'] as const).map((k, i) => (
                  <input
                    key={k}
                    value={visionForm[k]}
                    onChange={e => setVisionForm(v => ({ ...v, [k]: e.target.value.slice(0, 50) }))}
                    maxLength={50}
                    className="bg-[#FAFAFA] border border-[#E0E0E0] rounded-xl px-4 py-3 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613] focus:bg-white transition-colors"
                    placeholder={['Ex : Exigence', 'Bienveillance', 'Cash discipline'][i]}
                  />
                ))}
              </div>
            </div>

            {/* Cap commercial */}
            <div>
              <label className="text-sm font-semibold text-[#1A1A1A] block mb-1">🚀 Mon cap commercial pour cette année</label>
              <textarea
                value={visionForm.capCommercial}
                onChange={e => setVisionForm(v => ({ ...v, capCommercial: e.target.value }))}
                rows={2}
                className="w-full bg-[#FAFAFA] border border-[#E0E0E0] rounded-xl px-4 py-3 text-sm text-[#1A1A1A] resize-none focus:outline-none focus:border-[#E30613] focus:bg-white transition-colors"
                placeholder="Ex : Marge nette à 38%, stock âgé <25%, top 10 réseau"
              />
            </div>

            <button
              onClick={saveVision}
              className="w-full bg-[#E30613] hover:bg-[#B8050F] text-white font-semibold py-3 rounded-xl text-sm transition-colors"
            >
              {visionSaved ? '✓ Vision enregistrée !' : 'Enregistrer ma vision'}
            </button>
          </div>
        </div>
      )}

      {/* ── VIEW : MES CONCEPTS MAISON ─────────────────────────────────────── */}
      {view === 'library' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[#6B7280]">
              {concepts.length === 0 ? 'Aucun concept maison créé.' : `${concepts.length} concept${concepts.length > 1 ? 's' : ''} maison`}
            </p>
            {!showAddForm && editingId === null && (
              <button
                onClick={() => { setShowAddForm(true); setForm(DEFAULT_FORM); }}
                className="bg-[#E30613] hover:bg-[#B8050F] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                + Ajouter un concept maison
              </button>
            )}
          </div>

          {/* Add form */}
          {showAddForm && (
            <ConceptForm
              form={form}
              setForm={setForm}
              onSave={addConcept}
              onCancel={() => { setShowAddForm(false); setForm(DEFAULT_FORM); }}
              saveLabel="Ajouter"
            />
          )}

          {/* Concept list */}
          <div className="space-y-3">
            {concepts.map(c => (
              <div key={c.id} className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
                {editingId === c.id ? (
                  <div className="p-4">
                    <ConceptForm
                      form={form}
                      setForm={setForm}
                      onSave={saveEdit}
                      onCancel={() => { setEditingId(null); setForm(DEFAULT_FORM); }}
                      saveLabel="Enregistrer"
                    />
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-[#1A1A1A]">{c.titre}</h3>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TAG_COLORS[c.tag]}`}>{c.tag}</span>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => startEdit(c)}
                          className="text-xs px-2.5 py-1.5 bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg hover:bg-[#EBEBEB] transition-colors"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => deleteConcept(c.id)}
                          className="text-xs px-2.5 py-1.5 bg-[#FFF5F5] border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-[#374151] mb-2 leading-relaxed">{c.phrase}</p>
                    {c.application && (
                      <div className="bg-[#F5F5F5] rounded-lg px-3 py-2">
                        <p className="text-xs font-semibold text-[#6B7280] mb-0.5">En brief :</p>
                        <p className="text-xs text-[#6B7280] leading-relaxed">{c.application}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {concepts.length === 0 && !showAddForm && (
            <div className="text-center py-10 text-[#9CA3AF] text-sm">
              <p className="text-3xl mb-3">✍️</p>
              <p>Créez vos propres concepts pour les partager en brief matinal.</p>
              <p className="text-xs mt-1">Inspirez-vous des 60 concepts réseau disponibles dans l&apos;onglet Concept du jour.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Formulaire de concept ─────────────────────────────────────────────────────
function ConceptForm({
  form, setForm, onSave, onCancel, saveLabel,
}: {
  form: Omit<ConceptMaison, 'id'>;
  setForm: React.Dispatch<React.SetStateAction<Omit<ConceptMaison, 'id'>>>;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="bg-[#FAFAFA] border border-[#E0E0E0] rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[#6B7280] mb-1 block">Titre court (30 car. max)</label>
          <input
            value={form.titre}
            onChange={e => setForm(f => ({ ...f, titre: e.target.value.slice(0, 30) }))}
            maxLength={30}
            className="w-full bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]"
            placeholder="Ex : Vendre sans baisser les prix"
          />
        </div>
        <div>
          <label className="text-xs text-[#6B7280] mb-1 block">Catégorie</label>
          <select
            value={form.tag}
            onChange={e => setForm(f => ({ ...f, tag: e.target.value as ConceptTag }))}
            className="w-full bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]"
          >
            {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-[#6B7280] mb-1 block">Phrase principale (~20 mots max)</label>
        <input
          value={form.phrase}
          onChange={e => setForm(f => ({ ...f, phrase: e.target.value }))}
          className="w-full bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]"
          placeholder="Ex : La marge se joue à l'achat. Chaque euro négocié est acquis."
        />
      </div>
      <div>
        <label className="text-xs text-[#6B7280] mb-1 block">Application concrète (ce que vous direz en brief)</label>
        <textarea
          value={form.application}
          onChange={e => setForm(f => ({ ...f, application: e.target.value }))}
          rows={3}
          className="w-full bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] resize-none focus:outline-none focus:border-[#E30613]"
          placeholder="Ex : Ce matin je veux que vous soyez attentif à la négociation. Chaque fois qu'un client vend, essayez de..."
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={!form.titre.trim() || !form.phrase.trim()}
          className="flex-1 bg-[#E30613] hover:bg-[#B8050F] disabled:bg-[#D1D5DB] text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
        >
          {saveLabel}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 bg-white border border-[#E0E0E0] rounded-xl text-sm text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
