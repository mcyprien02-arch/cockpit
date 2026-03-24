"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Header } from "@/components/layout/Header";
import { Navigation, TabId } from "@/components/layout/Navigation";
import { GlobalScore } from "@/components/dashboard/GlobalScore";
import { CategoryCards } from "@/components/dashboard/CategoryCards";
import { AlertsList } from "@/components/dashboard/AlertsList";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  CategoryRadar,
  StackedStatusBars,
  ScoreEvolution,
  KpiBarChart,
} from "@/components/dashboard/DashboardCharts";
import { getStatus, computeScore, computeCategoryScores } from "@/lib/scoring";
import type {
  Magasin,
  ValeurAvecIndicateur,
  CategorieScore,
} from "@/types";

// ─── Loading skeleton ────────────────────────────────────────
function LoadingPulse() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full"
            style={{
              background: "var(--accent)",
              animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Coming Soon tab ─────────────────────────────────────────
function ComingSoon({ label }: { label: string }) {
  return (
    <div
      className="rounded-xl p-10 border text-center mt-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="text-[28px] mb-3">🚧</div>
      <div className="text-[16px] font-semibold mb-1" style={{ color: "var(--text)" }}>
        {label}
      </div>
      <div className="text-[13px]" style={{ color: "var(--textMuted)" }}>
        Cette section est en cours de développement.
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────
export default function Home() {
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<TabId>("cockpit");
  const [valeurs, setValeurs] = useState<ValeurAvecIndicateur[]>([]);
  const [visiteHistory, setVisiteHistory] = useState<{ date: string; score: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load stores on mount
  useEffect(() => {
    async function loadMagasins() {
      const { data, error } = await supabase
        .from("magasins")
        .select("id, nom, ville, franchise")
        .order("nom");
      if (error) {
        setError("Impossible de charger les magasins : " + error.message);
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as Magasin[];
      setMagasins(rows);
      if (rows.length > 0) setSelectedId(rows[0].id);
    }
    loadMagasins();
  }, []);

  // Load KPI values when store changes
  const loadValeurs = useCallback(async (magasinId: string) => {
    if (!magasinId) return;
    setLoading(true);

    const [{ data: vData, error: vErr }, { data: histData }] = await Promise.all([
      supabase
        .from("v_dernieres_valeurs")
        .select("*")
        .eq("magasin_id", magasinId),
      supabase
        .from("visites")
        .select("date_visite, score_global")
        .eq("magasin_id", magasinId)
        .order("date_visite", { ascending: true })
        .limit(12),
    ]);

    if (vErr) {
      setError("Impossible de charger les données : " + vErr.message);
      setLoading(false);
      return;
    }

    type VRow = {
      magasin_id: string; indicateur_id: string; valeur: number; date_saisie: string;
      indicateur_nom: string; unite: string | null; direction: "up" | "down";
      seuil_ok: number | null; seuil_vigilance: number | null; categorie: string;
      poids: number; action_defaut: string | null; magasin_nom: string;
    };
    const enriched: ValeurAvecIndicateur[] = ((vData ?? []) as VRow[]).map((row) => ({
      ...row,
      status: getStatus(row.valeur, row.direction, row.seuil_ok, row.seuil_vigilance),
    }));

    setValeurs(enriched);
    type HistRow = { date_visite: string; score_global: number | null };
    setVisiteHistory(
      ((histData ?? []) as HistRow[]).map((v) => ({
        date: v.date_visite,
        score: v.score_global,
      }))
    );
    setLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (selectedId) loadValeurs(selectedId);
  }, [selectedId, loadValeurs]);

  // Computed values
  const score = computeScore(valeurs);
  const categories: CategorieScore[] = computeCategoryScores(valeurs);
  const alerts = valeurs.filter((v) => v.status === "dg" || v.status === "wn");
  const okCount = valeurs.filter((v) => v.status === "ok").length;
  const wnCount = valeurs.filter((v) => v.status === "wn").length;
  const dgCount = valeurs.filter((v) => v.status === "dg").length;

  // Alert items sorted for KpiBarChart
  const alertsSorted = [...alerts].sort((a, b) => {
    if (a.status === "dg" && b.status !== "dg") return -1;
    if (b.status === "dg" && a.status !== "dg") return 1;
    return b.poids - a.poids;
  });

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <Header
        magasins={magasins}
        selectedId={selectedId}
        onSelectMagasin={setSelectedId}
      />
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="px-6 py-4 max-w-[1600px] mx-auto">
        {/* Error banner */}
        {error && (
          <div
            className="rounded-xl p-4 mb-4 text-[13px] font-medium"
            style={{ background: "var(--dangerDim)", color: "var(--danger)", border: "1px solid var(--danger)" }}
          >
            ⚠ {error}
          </div>
        )}

        {/* ── COCKPIT TAB ─────────────────────────────────── */}
        {activeTab === "cockpit" && (
          <>
            {loading ? (
              <LoadingPulse />
            ) : score === null && valeurs.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-4">
                {/* Top row: score + category cards */}
                <div
                  className="grid gap-4"
                  style={{ gridTemplateColumns: "280px 1fr" }}
                >
                  <GlobalScore
                    score={score}
                    totalIndicateurs={valeurs.filter((v) => v.status !== null).length}
                    okCount={okCount}
                    wnCount={wnCount}
                    dgCount={dgCount}
                  />
                  <CategoryCards categories={categories} />
                </div>

                {/* Charts row */}
                <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <CategoryRadar categories={categories} />
                  <StackedStatusBars categories={categories} />
                </div>

                {/* Bottom row: alerts + kpi bars + evolution */}
                <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                  <AlertsList items={alerts} />
                  <KpiBarChart
                    items={alertsSorted.map((a) => ({
                      nom: a.indicateur_nom,
                      valeur: a.valeur,
                      seuil_ok: a.seuil_ok,
                      unite: a.unite,
                      status: (a.status ?? null) as "ok" | "wn" | "dg" | null,
                    }))}
                  />
                  <ScoreEvolution visites={visiteHistory} />
                </div>
              </div>
            )}
          </>
        )}

        {/* ── OTHER TABS (placeholders) ────────────────── */}
        {activeTab === "kpis" && <KpisTab valeurs={valeurs} loading={loading} />}
        {activeTab === "config" && <ComingSoon label="Paramétrage des indicateurs" />}
        {activeTab === "import" && <ComingSoon label="Import de données" />}
        {activeTab === "checklist" && <ComingSoon label="Checklist quotidienne" />}
        {activeTab === "temps" && <ComingSoon label="Grille Temps" />}
        {activeTab === "decisions" && <ComingSoon label="Décisions & CR visite" />}
        {activeTab === "plan" && <ComingSoon label="Plan d'action" />}
        {activeTab === "comparatif" && <ComingSoon label="Comparatif multi-magasins" />}
        {activeTab === "historique" && <ComingSoon label="Historique" />}
      </main>
    </div>
  );
}

// ─── KPIs Detail Tab ─────────────────────────────────────────
function KpisTab({
  valeurs,
  loading,
}: {
  valeurs: ValeurAvecIndicateur[];
  loading: boolean;
}) {
  const byCategory = valeurs.reduce<Record<string, ValeurAvecIndicateur[]>>((acc, v) => {
    if (!acc[v.categorie]) acc[v.categorie] = [];
    acc[v.categorie].push(v);
    return acc;
  }, {});

  if (loading) return <LoadingPulse />;

  if (valeurs.length === 0) {
    return (
      <div className="mt-4 text-center py-12" style={{ color: "var(--textMuted)" }}>
        Aucun indicateur disponible pour ce magasin.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-6">
      {Object.entries(byCategory).map(([cat, items]) => (
        <div key={cat}>
          <div
            className="text-[11px] font-bold uppercase tracking-widest mb-3 px-1"
            style={{ color: "var(--accent)" }}
          >
            {cat}
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {items.map((item) => (
              <KpiCard key={item.indicateur_id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function KpiCard({ item }: { item: ValeurAvecIndicateur }) {
  const statusColors = {
    ok: { color: "var(--accent)", dim: "var(--accentDim)", glow: "var(--accentGlow)" },
    wn: { color: "var(--warn)", dim: "var(--warnDim)", glow: "var(--warnGlow)" },
    dg: { color: "var(--danger)", dim: "var(--dangerDim)", glow: "var(--dangerGlow)" },
  };
  const s = item.status ? statusColors[item.status] : null;
  const label =
    item.status === "ok" ? "OK" : item.status === "wn" ? "Vigilance" : item.status === "dg" ? "Action" : "—";

  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        background: "var(--surface)",
        borderColor: s ? s.color + "55" : "var(--border)",
        boxShadow: s ? `0 0 12px ${s.glow}` : "none",
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-[12px] font-semibold leading-tight" style={{ color: "var(--text)" }}>
          {item.indicateur_nom}
        </div>
        {s && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0"
            style={{ color: s.color, background: s.dim }}
          >
            {label}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-[24px] font-bold" style={{ color: s?.color ?? "var(--textDim)" }}>
          {item.valeur}
        </span>
        <span className="text-[12px]" style={{ color: "var(--textMuted)" }}>
          {item.unite}
        </span>
      </div>

      <div className="flex gap-4 text-[10px] mb-2" style={{ color: "var(--textDim)" }}>
        <span>✓ OK: {item.seuil_ok}{item.unite}</span>
        <span>⚠ Vigil.: {item.seuil_vigilance}{item.unite}</span>
      </div>

      {item.status !== "ok" && item.action_defaut && (
        <div
          className="text-[11px] mt-2 pt-2 border-t"
          style={{ color: "var(--textMuted)", borderColor: "var(--border)" }}
        >
          → {item.action_defaut}
        </div>
      )}
    </div>
  );
}
