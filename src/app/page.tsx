"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Navigation, TabId } from "@/components/layout/Navigation";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";
import { HomeScreen } from "@/components/screens/HomeScreen";
import { DiagnosticScreen } from "@/components/screens/DiagnosticScreen";
import { SaisieScreen } from "@/components/screens/SaisieScreen";
import { PlanActionScreen } from "@/components/screens/PlanActionScreen";
import { ComparatifScreen } from "@/components/screens/ComparatifScreen";
import { VisiteScreen } from "@/components/screens/VisiteScreen";
import { PAPScreen } from "@/components/screens/PAPScreen";
import { CompetencesISEORScreen } from "@/components/screens/CompetencesISEORScreen";
import { ImportScreen } from "@/components/screens/ImportScreen";
import { BalanceEconomiqueScreen } from "@/components/screens/BalanceEconomiqueScreen";
import { ParametrageScreen } from "@/components/screens/ParametrageScreen";
import type { Magasin } from "@/types";

// ─── Store selector dropdown ──────────────────────────────────
function StoreSelector({
  magasins, selectedId, onChange,
}: {
  magasins: Magasin[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-xl px-4 py-2.5 pr-10 text-[13px] font-semibold border cursor-pointer"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--text)",
          fontFamily: "inherit",
        }}
      >
        {magasins.map((m) => (
          <option key={m.id} value={m.id} style={{ background: "var(--surface)" }}>
            {m.nom}
          </option>
        ))}
      </select>
      <span
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px]"
        style={{ color: "var(--textDim)" }}
      >
        ▼
      </span>
    </div>
  );
}

// ─── App Header ───────────────────────────────────────────────
function AppHeader({
  magasins, selectedId, onSelect, activeTab, onTabChange,
}: {
  magasins: Magasin[];
  selectedId: string;
  onSelect: (id: string) => void;
  activeTab: TabId;
  onTabChange: (t: TabId) => void;
}) {
  return (
    <header style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between px-6 py-3 max-w-[1600px] mx-auto">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px] font-bold"
            style={{ background: "linear-gradient(135deg, #ff4d6a, #c0392b)", color: "#fff" }}
          >
            E
          </div>
          <div>
            <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>EasyCash Cockpit</div>
            <div className="text-[10px]" style={{ color: "var(--textDim)" }}>Outil de pilotage franchise</div>
          </div>
        </div>

        {/* Store selector */}
        <div className="flex items-center gap-3">
          {activeTab !== "comparatif" && activeTab !== "config" && magasins.length > 0 && (
            <StoreSelector magasins={magasins} selectedId={selectedId} onChange={onSelect} />
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<TabId>("cockpit");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setLoading(false);
    }
    loadMagasins();
  }, []);

  const selectedMagasin = magasins.find((m) => m.id === selectedId) ?? null;

  // ── Supabase config guard ────────────────────────────────────
  if (!SUPABASE_CONFIGURED) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--bg)" }}>
        <div className="rounded-2xl p-8 border max-w-lg w-full text-center" style={{ background: "var(--surface)", borderColor: "#ff4d6a40" }}>
          <div className="text-[32px] mb-3">⚙️</div>
          <div className="text-[16px] font-bold mb-2" style={{ color: "var(--text)" }}>Configuration requise</div>
          <div className="text-[13px] mb-5" style={{ color: "var(--textMuted)" }}>
            Les variables d&apos;environnement Supabase sont manquantes. L&apos;application ne peut pas démarrer.
          </div>
          <div className="rounded-xl p-4 text-left mb-4 font-mono text-[11px] leading-relaxed"
            style={{ background: "#0f1117", border: "1px solid var(--border)", color: "#00d4aa" }}>
            <div style={{ color: "var(--textDim)" }}># Dans Vercel → Settings → Environment Variables :</div>
            <div className="mt-2">NEXT_PUBLIC_SUPABASE_URL</div>
            <div className="mt-1">= https://bgreukjqujstgzulgabz.supabase.co</div>
            <div className="mt-3">NEXT_PUBLIC_SUPABASE_ANON_KEY</div>
            <div className="mt-1 break-all">= eyJhbGci...</div>
          </div>
          <div className="text-[11px]" style={{ color: "var(--textDim)" }}>
            Après avoir ajouté les variables, déclenchez un nouveau déploiement dans Vercel.
          </div>
        </div>
      </div>
    );
  }

  // Tabs that don't need a store selected
  const noStoreNeeded = ["comparatif", "config"];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="text-center">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-[20px] font-bold mx-auto mb-4"
            style={{ background: "linear-gradient(135deg, #ff4d6a, #c0392b)", color: "#fff" }}
          >
            E
          </div>
          <div className="flex gap-1.5 justify-center">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{ background: "var(--accent)", animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader
        magasins={magasins}
        selectedId={selectedId}
        onSelect={setSelectedId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="px-6 py-5 max-w-[1600px] mx-auto">
        {error && (
          <div
            className="rounded-xl p-4 mb-4 text-[13px] font-medium"
            style={{ background: "#ff4d6a12", color: "var(--danger)", border: "1px solid #ff4d6a30" }}
          >
            ⚠ {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "cockpit" && selectedId && (
              <HomeScreen magasinId={selectedId} onNavigate={(tab) => setActiveTab(tab as TabId)} />
            )}
            {activeTab === "diagnostic" && selectedId && (
              <DiagnosticScreen magasinId={selectedId} />
            )}
            {activeTab === "kpis" && selectedId && (
              <SaisieScreen magasinId={selectedId} />
            )}
            {activeTab === "plan" && selectedId && (
              <PlanActionScreen magasinId={selectedId} />
            )}
            {activeTab === "comparatif" && (
              <ComparatifScreen />
            )}
            {activeTab === "visite" && selectedId && (
              <VisiteScreen magasin={selectedMagasin} magasinId={selectedId} />
            )}
            {activeTab === "pap" && selectedId && (
              <PAPScreen magasinId={selectedId} />
            )}
            {activeTab === "competences" && selectedId && (
              <CompetencesISEORScreen magasinId={selectedId} />
            )}
            {activeTab === "import" && selectedId && (
              <ImportScreen magasinId={selectedId} magasin={selectedMagasin} />
            )}
            {activeTab === "balance" && selectedId && (
              <BalanceEconomiqueScreen magasinId={selectedId} magasin={selectedMagasin} />
            )}
            {activeTab === "config" && (
              <ParametrageScreen />
            )}
            {!selectedId && !noStoreNeeded.includes(activeTab) && (
              <div className="text-center py-16" style={{ color: "var(--textMuted)" }}>
                <div className="text-[40px] mb-3">🏪</div>
                <div className="text-[14px]">Aucun magasin trouvé. Ajoutez-en un dans Paramétrage.</div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
