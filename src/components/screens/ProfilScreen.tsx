"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────
type AiseLevel = "debutant" | "intermediaire" | "expert";
type NbMagasins = "1" | "2-3" | "4+";
type NiveauProfil = 1 | 2 | 3 | 4;

interface ProfilData {
  anciennete: number;      // années
  nbMagasins: NbMagasins;
  aise: AiseLevel;
}

const DEFAULT_PROFIL: ProfilData = { anciennete: 3, nbMagasins: "1", aise: "intermediaire" };

// ─── Niveau computation ───────────────────────────────────────
function computeNiveau(p: ProfilData): NiveauProfil {
  if (p.anciennete > 5 && p.nbMagasins !== "1" && p.aise === "expert") return 4;
  if (p.anciennete > 5 && p.aise === "expert") return 3;
  if (p.anciennete >= 2 && p.aise !== "debutant") return 2;
  return 1;
}

const NIVEAU_CONFIG: Record<NiveauProfil, {
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  desc: string;
  adapt: string[];
  conseils: string[];
}> = {
  1: {
    icon: "🌱",
    title: "En développement",
    subtitle: "Prise en main de l'outil",
    color: "#4da6ff",
    desc: "Tu es en train de construire tes repères sur le pilotage. L'outil t'accompagne pas à pas avec des explications détaillées et un mode guidé.",
    adapt: [
      "Recommandations détaillées avec explications contextuelles",
      "Mode guidé activé — chaque action est expliquée",
      "Alertes simplifiées avec la conduite à tenir",
    ],
    conseils: [
      "Saisis tes KPIs chaque semaine, même partiellement",
      "Concentre-toi sur 3 indicateurs : marge, stock âgé, GMROI",
      "Utilise l'assistant pour chaque question que tu te poses",
    ],
  },
  2: {
    icon: "⚙️",
    title: "En consolidation",
    subtitle: "Pilotage actif du magasin",
    color: "#ffb347",
    desc: "Tu maîtrises les basiques et tu pilotes activement. L'outil te propose des comparatifs réseau et des options d'analyse avancées.",
    adapt: [
      "Comparatif réseau activé sur chaque KPI",
      "Options multiples proposées pour chaque problème",
      "Simulateur Et si ? déverrouillé avec tous les scénarios",
    ],
    conseils: [
      "Exploite le simulateur pour valider tes décisions avant d'agir",
      "Compare-toi systématiquement aux médianes réseau",
      "Vise le niveau Autonome en travaillant ta lecture du GMROI",
    ],
  },
  3: {
    icon: "🚀",
    title: "Autonome",
    subtitle: "Décisions sans dépendance",
    color: "#00d4aa",
    desc: "Tu pilotes de façon autonome et efficace. L'outil te donne une vue synthétique avec des actions directes, sans explication redondante.",
    adapt: [
      "Vue synthétique — pas d'explications superflues",
      "Actions directes sans étape intermédiaire",
      "Accès au mode expert du simulateur",
    ],
    conseils: [
      "Documente tes bonnes pratiques pour le réseau",
      "Expérimente le multi-magasin si l'opportunité se présente",
      "Aide un franchisé niveau 1 ou 2 en partageant tes méthodes",
    ],
  },
  4: {
    icon: "🏆",
    title: "Ambassadeur",
    subtitle: "Référent réseau",
    color: "#a78bfa",
    desc: "Tu es un modèle pour le réseau. L'outil t'ouvre des données agrégées et une fonction mentor pour accompagner les autres franchisés.",
    adapt: [
      "Accès aux données réseau agrégées (top/médiane/bas)",
      "Fonction mentor activée — tu peux être mis en contact avec des franchisés niveau 1",
      "Vue comparative multi-magasins déverrouillée",
    ],
    conseils: [
      "Contribue aux benchmarks réseau en partageant tes pratiques",
      "Propose des témoignages pour les formations franchisés",
      "Anticipe l'ouverture d'un nouveau magasin avec le simulateur",
    ],
  },
};

// ─── ProfilScreen ─────────────────────────────────────────────
export function ProfilScreen() {
  const [profil, setProfil] = useState<ProfilData>(DEFAULT_PROFIL);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [firstLaunch, setFirstLaunch] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("profilMaturite");
      if (raw) {
        setProfil(JSON.parse(raw));
        setFirstLaunch(false);
      } else {
        setEditing(true); // First launch: show form
      }
    } catch { setEditing(true); }
  }, []);

  const saveProfile = () => {
    try {
      localStorage.setItem("profilMaturite", JSON.stringify(profil));
    } catch { /* ignore */ }
    setEditing(false);
    setFirstLaunch(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const niveau = computeNiveau(profil);
  const config = NIVEAU_CONFIG[niveau];
  const nextNiveau = (niveau < 4 ? niveau + 1 : null) as NiveauProfil | null;
  const nextConfig = nextNiveau ? NIVEAU_CONFIG[nextNiveau] : null;

  // Progress within niveau (rough estimate)
  const progressInLevel = Math.min(100, (() => {
    if (niveau === 1) return Math.min(100, (profil.anciennete / 2) * 60 + (profil.aise === "debutant" ? 0 : 40));
    if (niveau === 2) return Math.min(100, ((profil.anciennete - 2) / 3) * 60 + (profil.aise === "expert" ? 40 : 20));
    if (niveau === 3) return profil.nbMagasins !== "1" ? 75 : 40;
    return 100;
  })());

  return (
    <div className="space-y-5 max-w-[700px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[18px] font-bold" style={{ color: "var(--text)" }}>
            🌱 Profil de maturité
          </h2>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--textMuted)" }}>
            Selon Hersey & Blanchard — l'outil s'adapte à ton niveau
          </p>
        </div>
        <button
          onClick={() => setEditing(v => !v)}
          className="rounded-xl px-4 py-2 text-[12px] font-semibold"
          style={{
            background: editing ? "var(--surfaceAlt)" : "var(--surface)",
            color: editing ? "var(--textMuted)" : "var(--accent)",
            border: `1px solid ${editing ? "var(--border)" : "var(--accent)"}`,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {editing ? "Annuler" : "✏ Recalculer mon profil"}
        </button>
      </div>

      {/* Edit form */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="rounded-2xl p-5 space-y-5"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              {firstLaunch && (
                <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                  Bienvenue ! Renseigne ton profil pour que l'outil s'adapte à toi.
                </div>
              )}

              {/* Ancienneté */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider block mb-2" style={{ color: "var(--textDim)" }}>
                  Ancienneté dans le réseau Easycash — {profil.anciennete} an{profil.anciennete > 1 ? "s" : ""}
                </label>
                <input
                  type="range" min={0} max={20} step={1}
                  value={profil.anciennete}
                  onChange={e => setProfil(p => ({ ...p, anciennete: parseInt(e.target.value) }))}
                  className="w-full"
                  style={{ accentColor: "var(--accent)" }}
                />
                <div className="flex justify-between text-[9px] mt-1" style={{ color: "var(--textDim)" }}>
                  <span>0 an</span><span>5 ans</span><span>10 ans</span><span>20 ans</span>
                </div>
              </div>

              {/* Nombre de magasins */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider block mb-2" style={{ color: "var(--textDim)" }}>
                  Nombre de magasins gérés
                </label>
                <div className="flex gap-2">
                  {(["1", "2-3", "4+"] as NbMagasins[]).map(n => (
                    <button
                      key={n}
                      onClick={() => setProfil(p => ({ ...p, nbMagasins: n }))}
                      className="flex-1 rounded-xl py-2 text-[12px] font-semibold transition-all"
                      style={{
                        background: profil.nbMagasins === n ? "var(--accent)" : "var(--surfaceAlt)",
                        color: profil.nbMagasins === n ? "#000" : "var(--textMuted)",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aise avec les outils */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider block mb-2" style={{ color: "var(--textDim)" }}>
                  Niveau d'aise avec les outils de pilotage
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: "debutant",       label: "Débutant",       desc: "Je découvre" },
                    { id: "intermediaire",  label: "Intermédiaire",  desc: "Je me repère" },
                    { id: "expert",         label: "Expert",         desc: "Je pilote seul" },
                  ] as { id: AiseLevel; label: string; desc: string }[]).map(a => (
                    <button
                      key={a.id}
                      onClick={() => setProfil(p => ({ ...p, aise: a.id }))}
                      className="rounded-xl p-3 text-center transition-all"
                      style={{
                        background: profil.aise === a.id ? "#00d4aa18" : "var(--surfaceAlt)",
                        border: profil.aise === a.id ? "1px solid #00d4aa40" : "1px solid transparent",
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      <div className="text-[12px] font-semibold" style={{ color: profil.aise === a.id ? "#00d4aa" : "var(--text)" }}>
                        {a.label}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--textDim)" }}>{a.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={saveProfile}
                className="w-full rounded-xl py-3 text-[13px] font-bold"
                style={{ background: "var(--accent)", color: "#000", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              >
                Calculer mon profil →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile card */}
      {!editing && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl overflow-hidden"
          style={{ border: `1px solid ${config.color}40` }}
        >
          {/* Header */}
          <div
            className="px-6 py-5"
            style={{ background: `${config.color}12` }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-[28px] shrink-0"
                style={{ background: `${config.color}20` }}
              >
                {config.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-[20px] font-black" style={{ color: config.color }}>
                    Niveau {niveau} — {config.title}
                  </div>
                  {saved && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#00d4aa20", color: "#00d4aa" }}>
                      ✓ Sauvegardé
                    </span>
                  )}
                </div>
                <div className="text-[13px] mt-1 font-medium" style={{ color: "var(--textMuted)" }}>
                  {config.subtitle}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--text)" }}>
              {config.desc}
            </p>
          </div>

          <div className="px-6 py-5 space-y-5" style={{ background: "var(--surface)" }}>
            {/* Progress to next level */}
            {nextConfig && (
              <div>
                <div className="flex items-center justify-between mb-2 text-[11px]">
                  <span style={{ color: "var(--textDim)" }}>Progression vers Niveau {nextNiveau}</span>
                  <span style={{ color: config.color }}>{progressInLevel}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surfaceAlt)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${progressInLevel}%`, background: config.color }}
                  />
                </div>
                <div className="text-[10px] mt-1.5" style={{ color: "var(--textDim)" }}>
                  Prochain niveau : {nextConfig.icon} {nextConfig.title}
                </div>
              </div>
            )}

            {/* What changes in the app */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--textDim)" }}>
                CE QUE L'OUTIL ADAPTE POUR TOI
              </div>
              <div className="space-y-1.5">
                {config.adapt.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px]">
                    <span style={{ color: config.color }}>✓</span>
                    <span style={{ color: "var(--text)" }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Conseils */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--textDim)" }}>
                POUR PROGRESSER
              </div>
              <div className="space-y-1.5">
                {config.conseils.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px]">
                    <span style={{ color: "#8b8fa3" }}>→</span>
                    <span style={{ color: "var(--textMuted)" }}>{c}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Note animateur */}
            <div
              className="rounded-xl p-3 text-[11px] italic"
              style={{ background: "var(--surfaceAlt)", color: "var(--textDim)" }}
            >
              Ce profil est indicatif. Ton animateur réseau peut l'ajuster lors de sa prochaine visite.
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
