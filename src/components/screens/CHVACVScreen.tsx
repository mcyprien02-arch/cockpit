"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { formatEuro } from "@/lib/hiddenCosts";

interface CHVACVRecord {
  id?: string;
  magasin_id: string;
  periode: string;  // 'YYYY-MM'
  ca_annuel: number;
  cv_annuelles: number;
  nb_heures_travaillees: number;
  chvacv_calculee?: number;
}

interface CHVACVScreenProps {
  magasinId: string;
  magasin: { nom: string } | null;
}

const DEFAULT_HYPOTHESES = {
  ca_annuel: 0,
  cv_annuelles: 0,
  nb_etp: 4,
  heures_semaine: 35,
  semaines_an: 47,
};

function calcCHVACV(ca: number, cv: number, heures: number): number {
  if (heures <= 0) return 0;
  return Math.round(((ca - cv) / heures) * 100) / 100;
}

function calcHeures(etp: number, hSemaine: number, semaines: number): number {
  return etp * hSemaine * semaines;
}

const NATURES = ["GC", "RD", "GF", "PS", "PD"] as const;
type Nature = (typeof NATURES)[number];
const NATURE_LABELS: Record<Nature, string> = {
  GC: "Gestion Courante",
  RD: "Régulation Dysfonctionnements",
  GF: "Glissement de Fonction",
  PS: "Pilotage Stratégique",
  PD: "Prévention Dysfonctionnements",
};
const NATURE_COLORS: Record<Nature, string> = {
  GC: "#4da6ff",
  RD: "#ff4d6a",
  GF: "#ff8c42",
  PS: "#00d4aa",
  PD: "#a78bfa",
};
const NATURE_TARGET: Record<Nature, number> = {
  GC: 30,
  RD: 15,
  GF: 10,
  PS: 25,
  PD: 20,
};

function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 border shadow-xl text-[11px]"
      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
      <div className="font-bold mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }}>{p.name}: {formatEuro(p.value)}/h</div>
      ))}
    </div>
  );
}

export function CHVACVScreen({ magasinId, magasin }: CHVACVScreenProps) {
  const storageKey = `chvacv_${magasinId}`;
  const [hyp, setHyp] = useState(DEFAULT_HYPOTHESES);
  const [history, setHistory] = useState<CHVACVRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currentPeriode, setCurrentPeriode] = useState(
    new Date().toISOString().slice(0, 7)
  );

  // Load from localStorage
  useEffect(() => {
    try {
      const s = localStorage.getItem(storageKey);
      if (s) {
        const parsed = JSON.parse(s);
        setHyp({ ...DEFAULT_HYPOTHESES, ...parsed });
      }
    } catch { /* noop */ }
  }, [storageKey]);

  const saveHyp = (next: typeof hyp) => {
    setHyp(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  // Load history from Supabase
  const loadHistory = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("chvacv")
      .select("*")
      .eq("magasin_id", magasinId)
      .order("periode", { ascending: true })
      .limit(12);
    if (data) setHistory(data as CHVACVRecord[]);
  }, [magasinId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const heures = calcHeures(hyp.nb_etp, hyp.heures_semaine, hyp.semaines_an);
  const chvacv = calcCHVACV(hyp.ca_annuel, hyp.cv_annuelles, heures);
  const valeurAjoutee = hyp.ca_annuel - hyp.cv_annuelles;

  const handleSave = async () => {
    if (!chvacv) return;
    setSaving(true);
    await (supabase as any).from("chvacv").upsert({
      magasin_id: magasinId,
      periode: currentPeriode,
      ca_annuel: hyp.ca_annuel,
      cv_annuelles: hyp.cv_annuelles,
      nb_heures_travaillees: heures,
    }, { onConflict: "magasin_id,periode" });
    await loadHistory();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const historyForChart = history.map((r) => ({
    periode: r.periode,
    chvacv: r.chvacv_calculee ?? calcCHVACV(r.ca_annuel, r.cv_annuelles, r.nb_heures_travaillees),
  }));

  return (
    <div className="space-y-5 max-w-[1100px] mx-auto">
      {/* ── Hero metric ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-6 border relative overflow-hidden"
        style={{ background: "var(--surface)", borderColor: chvacv > 0 ? "#00d4aa40" : "var(--border)" }}
      >
        <div className="absolute inset-0 opacity-5"
          style={{ background: "radial-gradient(ellipse at 20% 50%, #00d4aa 0%, transparent 70%)" }} />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--textMuted)" }}>
              CHVACV — Contribution Horaire à la Valeur Ajoutée sur Coûts Variables
            </div>
            <div className="flex items-baseline gap-3">
              <AnimatePresence mode="wait">
                <motion.div
                  key={chvacv}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-[52px] font-black"
                  style={{ color: chvacv > 0 ? "#00d4aa" : "var(--textDim)" }}
                >
                  {chvacv > 0 ? formatEuro(chvacv) : "—"}
                </motion.div>
              </AnimatePresence>
              <div className="text-[18px] font-semibold" style={{ color: "var(--textMuted)" }}>/heure</div>
            </div>
            <div className="text-[14px] mt-2" style={{ color: "var(--textMuted)" }}>
              {chvacv > 0
                ? <>1 heure de travail dans votre entreprise produit <strong style={{ color: "#00d4aa" }}>{formatEuro(chvacv)} de valeur</strong></>
                : "Saisissez vos données pour calculer la CHVACV"}
            </div>
          </div>
          <div className="text-right hidden md:block">
            <div className="text-[11px] uppercase tracking-widest mb-1" style={{ color: "var(--textMuted)" }}>Valeur ajoutée annuelle</div>
            <div className="text-[28px] font-bold" style={{ color: valeurAjoutee > 0 ? "#4da6ff" : "var(--textDim)" }}>
              {valeurAjoutee > 0 ? formatEuro(valeurAjoutee) : "—"}
            </div>
            <div className="text-[11px] mt-1" style={{ color: "var(--textDim)" }}>CA − Charges variables</div>
          </div>
        </div>
        {chvacv > 0 && (
          <div className="relative z-10 mt-4 p-3 rounded-xl text-[11px]"
            style={{ background: "#ff4d6a0a", border: "1px solid #ff4d6a20", color: "var(--textMuted)" }}>
            ⚠️ <strong style={{ color: "var(--text)" }}>Chaque heure perdue en dysfonctionnement vous coûte {formatEuro(chvacv)}.</strong>
            {" "}C&apos;est une estimation — utilisez-la pour prioriser vos actions, pas pour des décisions comptables.
          </div>
        )}
      </motion.div>

      <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* ── Saisie des hypothèses ─────────────────────────── */}
        <div className="space-y-4">
          <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: "var(--textMuted)" }}>
              Paramètres de calcul
            </div>

            <div className="space-y-4">
              {/* CA */}
              <div>
                <label className="block text-[11px] mb-1.5 font-semibold" style={{ color: "var(--textMuted)" }}>
                  Chiffre d&apos;affaires annuel (comptes 7)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={hyp.ca_annuel || ""}
                    placeholder="ex: 850000"
                    onChange={(e) => saveHyp({ ...hyp, ca_annuel: Number(e.target.value) || 0 })}
                    className="w-full rounded-xl px-4 py-3 text-[13px] border pr-8"
                    style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: "var(--textDim)" }}>€</span>
                </div>
              </div>

              {/* CV */}
              <div>
                <label className="block text-[11px] mb-1.5 font-semibold" style={{ color: "var(--textMuted)" }}>
                  Charges variables annuelles (comptes 6, hors salaires)
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      value={hyp.cv_annuelles || ""}
                      placeholder="ex: 320000"
                      onChange={(e) => saveHyp({ ...hyp, cv_annuelles: Number(e.target.value) || 0 })}
                      className="w-full rounded-xl px-4 py-3 text-[13px] border pr-8"
                      style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: "var(--textDim)" }}>€</span>
                  </div>
                </div>
                <div className="text-[10px] mt-1" style={{ color: "var(--textDim)" }}>
                  Les salaires NE sont PAS des charges variables — ils restent fixes
                </div>
              </div>

              {/* Heures */}
              <div className="rounded-xl p-3 border space-y-3" style={{ borderColor: "var(--border)", background: "var(--surfaceAlt)" }}>
                <div className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>Heures travaillées annuelles</div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Nb ETP", key: "nb_etp" as const, min: 1 },
                    { label: "H/semaine", key: "heures_semaine" as const, min: 10 },
                    { label: "Semaines", key: "semaines_an" as const, min: 1 },
                  ].map(({ label, key, min }) => (
                    <div key={key}>
                      <div className="text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>{label}</div>
                      <input
                        type="number"
                        min={min}
                        value={hyp[key] || ""}
                        onChange={(e) => saveHyp({ ...hyp, [key]: Number(e.target.value) || 0 })}
                        className="w-full rounded-lg px-3 py-2 text-[12px] border text-center"
                        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                      />
                    </div>
                  ))}
                </div>
                <div className="text-[11px] font-semibold" style={{ color: "#00d4aa" }}>
                  = {heures.toLocaleString("fr-FR")} heures/an
                </div>
              </div>
            </div>

            {/* Formule transparente */}
            <div className="mt-4 rounded-xl p-3 font-mono text-[11px]"
              style={{ background: "#0f1117", border: "1px solid var(--border)", color: "#8b8fa3" }}>
              <div style={{ color: "var(--textMuted)" }}>// Formule CHVACV :</div>
              <div className="mt-1">
                <span style={{ color: "#4da6ff" }}>CHVACV</span>
                <span style={{ color: "var(--text)" }}> = (CA − CV) / Heures</span>
              </div>
              <div className="mt-1">
                <span style={{ color: "#4da6ff" }}>CHVACV</span>
                <span style={{ color: "var(--text)" }}> = ({hyp.ca_annuel.toLocaleString("fr-FR")} − {hyp.cv_annuelles.toLocaleString("fr-FR")}) / {heures.toLocaleString("fr-FR")}</span>
              </div>
              {chvacv > 0 && (
                <div className="mt-1">
                  <span style={{ color: "#4da6ff" }}>CHVACV</span>
                  <span style={{ color: "#00d4aa", fontWeight: 700 }}> = {formatEuro(chvacv)}/h</span>
                </div>
              )}
            </div>

            {/* Save button */}
            <div className="mt-4 flex items-center gap-3">
              <div>
                <div className="text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Période</div>
                <input
                  type="month"
                  value={currentPeriode}
                  onChange={(e) => setCurrentPeriode(e.target.value)}
                  className="rounded-lg px-3 py-2 text-[12px] border"
                  style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>
              <div className="flex-1" />
              <button
                onClick={handleSave}
                disabled={!chvacv || saving}
                className="px-5 py-2.5 rounded-xl text-[12px] font-bold disabled:opacity-40"
                style={{ background: saved ? "#00d4aa" : "var(--accent)", color: "#000" }}
              >
                {saving ? "Enregistrement…" : saved ? "✓ Enregistré" : "Enregistrer"}
              </button>
            </div>
          </div>

          {/* ── Exemples de coûts cachés avec CHVACV ──────── */}
          {chvacv > 0 && (
            <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--textMuted)" }}>
                Ce que chaque dysfonctionnement vous coûte
              </div>
              <div className="space-y-2">
                {[
                  { label: "1h de réunion improductive × 3 pers × 2×/sem × 47 sem", calc: () => chvacv * 3 * 2 * 47 },
                  { label: "30 min de saisie en double × 1 pers × 5j/sem × 47 sem", calc: () => chvacv * 0.5 * 5 * 47 },
                  { label: "15 min de recherche d'info × 2 pers × 5j/sem × 47 sem", calc: () => chvacv * 0.25 * 2 * 5 * 47 },
                  { label: "2h de gestion de retour évitable × 1 pers × 3×/sem × 47 sem", calc: () => chvacv * 2 * 3 * 47 },
                ].map(({ label, calc }) => (
                  <div key={label} className="flex items-start justify-between gap-3 py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>{label}</div>
                    <div className="text-[12px] font-bold shrink-0" style={{ color: "var(--danger)" }}>
                      {formatEuro(Math.round(calc()))}/an
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Indicateurs dérivés + courbe ─────────────────── */}
        <div className="space-y-4">
          {/* KPIs dérivés */}
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: "Valeur 1h de dysf.",
                value: chvacv > 0 ? formatEuro(chvacv) : "—",
                sub: "Coût d'une heure perdue",
                color: "var(--danger)",
                bg: "#ff4d6a12",
              },
              {
                label: "Valeur 1 journée (8h)",
                value: chvacv > 0 ? formatEuro(chvacv * 8) : "—",
                sub: "Par personne",
                color: "#ffb347",
                bg: "#ffb34712",
              },
              {
                label: "Valeur 1 semaine",
                value: chvacv > 0 ? formatEuro(chvacv * hyp.heures_semaine) : "—",
                sub: `${hyp.heures_semaine}h × ${formatEuro(chvacv)}`,
                color: "#4da6ff",
                bg: "#4da6ff12",
              },
              {
                label: "Valeur annuelle / ETP",
                value: chvacv > 0 ? formatEuro(chvacv * heures / hyp.nb_etp) : "—",
                sub: "Contribution par personne",
                color: "#00d4aa",
                bg: "#00d4aa12",
              },
            ].map(({ label, value, sub, color, bg }) => (
              <div key={label} className="rounded-xl p-4 border text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--textMuted)" }}>{label}</div>
                <div className="text-[18px] font-bold" style={{ color }}>{value}</div>
                <div className="text-[10px] mt-1" style={{ color: "var(--textDim)" }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Natures d'activité */}
          {chvacv > 0 && (
            <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--textMuted)" }}>
                Coût des écarts par nature d&apos;activité (cible ISEOR)
              </div>
              <div className="space-y-2.5">
                {(["RD", "GF"] as Nature[]).map((n) => {
                  const realPct = NATURE_TARGET[n]; // placeholder
                  const excessH = Math.max(0, (realPct - NATURE_TARGET[n]) / 100) * heures;
                  const cost = excessH * chvacv;
                  const targetPct = NATURE_TARGET[n];
                  return (
                    <div key={n} className="rounded-xl p-3 border" style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)" }}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: NATURE_COLORS[n] }} />
                          <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>{n} — {NATURE_LABELS[n]}</span>
                        </div>
                        <span className="text-[11px]" style={{ color: "var(--textMuted)" }}>cible ≤ {targetPct}%</span>
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>
                        Chaque % au-dessus de la cible = <strong style={{ color: NATURE_COLORS[n] }}>{formatEuro(Math.round(heures / 100 * chvacv))}/an</strong> de coûts cachés
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Courbe historique */}
          {historyForChart.length > 1 && (
            <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: "var(--textMuted)" }}>
                Évolution de la CHVACV
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={historyForChart} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="periode" tick={{ fill: "#8b8fa3", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#8b8fa3", fontSize: 9 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => `${v}€`} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#00d4aa30" }} />
                  <Line
                    type="monotone" dataKey="chvacv" name="CHVACV" stroke="#00d4aa"
                    strokeWidth={2.5} dot={{ fill: "#00d4aa", r: 4 }} activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Note méthodologique ──────────────────────────────── */}
      <div className="rounded-2xl p-4 border text-[11px] leading-relaxed"
        style={{ background: "var(--surface)", borderColor: "#4da6ff30", borderLeft: "3px solid #4da6ff", color: "var(--textMuted)" }}>
        <strong style={{ color: "#4da6ff" }}>Méthode ISEOR — CHVACV</strong>
        {" "}La CHVACV est par définition une <em>estimation</em>. Elle ne se compare pas entre entreprises — c&apos;est un indicateur d&apos;évolution interne. Si un contrat ou une activité rapporte moins par heure que la CHVACV, il convient de s&apos;interroger sur sa pertinence.
        <strong style={{ color: "var(--text)" }}> Pilotage mensuel recommandé.</strong>
        {" "}Source : Henri Savall & Véronique Zardet, ISEOR, Lyon.
      </div>
    </div>
  );
}
