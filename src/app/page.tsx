"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Navigation, ModeSwitcher, TabId, AppMode, getTabGroup } from "@/components/layout/Navigation";
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
import { CHVACVScreen } from "@/components/screens/CHVACVScreen";
import { AnalyseTempsScreen } from "@/components/screens/AnalyseTempsScreen";
import { SimulateurScreen } from "@/components/screens/SimulateurScreen";
import { DiagnosticExpressScreen } from "@/components/screens/DiagnosticExpressScreen";
import { CarnetDeBordScreen } from "@/components/screens/CarnetDeBordScreen";
import type { Magasin } from "@/types";

// ─── Store selector ───────────────────────────────────────────
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
        onChange={e => onChange(e.target.value)}
        className="appearance-none rounded-xl px-4 py-2.5 pr-10 text-[13px] font-semibold border cursor-pointer"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--text)",
          fontFamily: "inherit",
        }}
      >
        {magasins.map(m => (
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
  magasins, selectedId, onSelect, activeTab, mode, onModeChange,
}: {
  magasins: Magasin[];
  selectedId: string;
  onSelect: (id: string) => void;
  activeTab: TabId;
  mode: AppMode;
  onModeChange: (m: AppMode) => void;
}) {
  const noStore = ["comparatif", "config"];
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

        {/* Right side */}
        <div className="flex items-center gap-3">
          {!noStore.includes(activeTab) && magasins.length > 0 && (
            <StoreSelector magasins={magasins} selectedId={selectedId} onChange={onSelect} />
          )}
          <ModeSwitcher mode={mode} onChange={onModeChange} />
        </div>
      </div>
    </header>
  );
}

// ─── Empty state for restricted screens ──────────────────────
function RestrictedScreen({ onSwitchMode }: { onSwitchMode: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <div className="text-[40px] mb-4">🔒</div>
      <div className="text-[16px] font-semibold mb-2" style={{ color: "var(--text)" }}>
        Section réservée au mode Consultant
      </div>
      <div className="text-[13px] mb-5" style={{ color: "var(--textMuted)" }}>
        Cette section est disponible en mode Consultant.
      </div>
      <button
        onClick={onSwitchMode}
        className="rounded-xl px-5 py-2.5 text-[13px] font-semibold"
        style={{ background: "var(--accent)", color: "#000", border: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        Changer de mode →
      </button>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
  const [magasins, setMagasins]   = useState<Magasin[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<TabId>("cockpit");
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [mode, setMode]           = useState<AppMode>("consultant");

  // Load magasins
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

  // Persist mode
  useEffect(() => {
    try {
      const saved = localStorage.getItem("app_mode");
      if (saved === "consultant" || saved === "franchisé") {
        setMode(saved);
      }
    } catch { /* ignore */ }
  }, []);

  const handleModeChange = (m: AppMode) => {
    setMode(m);
    try { localStorage.setItem("app_mode", m); } catch { /* ignore */ }
    if (m === "franchisé") {
      const allowedGroups = ["cockpit", "actions"];
      if (!allowedGroups.includes(getTabGroup(activeTab))) {
        setActiveTab("cockpit");
      }
    }
  };

  const selectedMagasin = magasins.find(m => m.id === selectedId) ?? null;

  const CONSULTANT_ONLY: TabId[] = ["balance", "chvacv", "simulateur", "competences", "temps", "comparatif", "diagnostic_express", "visite", "config"];
  const isRestricted = (tab: TabId) =>
    CONSULTANT_ONLY.includes(tab) && mode !== "consultant";

  // Skeleton loading
  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        {/* Header skeleton */}
        <div className="h-14 border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />
        <div className="h-12 border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />
        <div className="px-6 py-6 max-w-[1600px] mx-auto space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
            ))}
          </div>
          <div className="h-64 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-48 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
            <div className="h-48 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
          </div>
        </div>
      </div>
    );
  }

  const noStoreNeeded: TabId[] = ["comparatif", "config", "diagnostic_express"];
  const noStore = !selectedId && !noStoreNeeded.includes(activeTab);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader
        magasins={magasins}
        selectedId={selectedId}
        onSelect={setSelectedId}
        activeTab={activeTab}
        mode={mode}
        onModeChange={handleModeChange}
      />
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} mode={mode} />

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
            transition={{ duration: 0.18 }}
          >
            {noStore ? (
              <div className="text-center py-16" style={{ color: "var(--textMuted)" }}>
                <div className="text-[40px] mb-3">🏪</div>
                <div className="text-[14px]">Aucun magasin trouvé. Ajoutez-en un dans Paramétrage.</div>
              </div>
            ) : (
              <>
                {/* ⚡ VERDICT */}
                {activeTab === "cockpit" && selectedId && (
                  <HomeScreen magasinId={selectedId} onNavigate={tab => setActiveTab(tab as TabId)} />
                )}

                {/* 🔬 DIAGNOSTIC */}
                {activeTab === "kpis" && selectedId && <SaisieScreen magasinId={selectedId} />}
                {activeTab === "diagnostic" && selectedId && <DiagnosticScreen magasinId={selectedId} />}
                {activeTab === "diagnostic_express" && (
                  isRestricted("diagnostic_express")
                    ? <RestrictedScreen onSwitchMode={() => handleModeChange("consultant")} />
                    : <DiagnosticExpressScreen />
                )}
                {activeTab === "import" && selectedId && (
                  <ImportScreen magasinId={selectedId} magasin={selectedMagasin} onNavigate={tab => setActiveTab(tab as TabId)} />
                )}
                {activeTab === "comparatif" && (
                  isRestricted("comparatif")
                    ? <RestrictedScreen onSwitchMode={() => handleModeChange("consultant")} />
                    : <ComparatifScreen />
                )}

                {/* 💰 DÉCISIONS */}
                {activeTab === "balance" && selectedId && (
                  isRestricted("balance")
                    ? <RestrictedScreen onSwitchMode={() => handleModeChange("consultant")} />
                    : <BalanceEconomiqueScreen magasinId={selectedId} magasin={selectedMagasin} />
                )}
                {activeTab === "simulateur" && selectedId && (
                  isRestricted("simulateur")
                    ? <RestrictedScreen onSwitchMode={() => handleModeChange("consultant")} />
                    : <SimulateurScreen magasinId={selectedId} />
                )}
                {activeTab === "chvacv" && selectedId && (
                  isRestricted("chvacv")
                    ? <RestrictedScreen onSwitchMode={() => handleModeChange("consultant")} />
                    : <CHVACVScreen magasinId={selectedId} magasin={selectedMagasin} />
                )}

                {/* 🎯 ACTIONS */}
                {activeTab === "pap" && selectedId && <PAPScreen magasinId={selectedId} />}
                {activeTab === "plan" && selectedId && <PlanActionScreen magasinId={selectedId} />}
                {activeTab === "competences" && selectedId && (
                  isRestricted("competences")
                    ? <RestrictedScreen onSwitchMode={() => handleModeChange("consultant")} />
                    : <CompetencesISEORScreen magasinId={selectedId} />
                )}
                {activeTab === "carnet" && selectedId && <CarnetDeBordScreen magasinId={selectedId} />}

                {/* 👥 ÉQUIPE */}
                {activeTab === "temps" && selectedId && (
                  isRestricted("temps")
                    ? <RestrictedScreen onSwitchMode={() => handleModeChange("consultant")} />
                    : <AnalyseTempsScreen magasinId={selectedId} />
                )}
                {activeTab === "visite" && selectedId && (
                  isRestricted("visite")
                    ? <RestrictedScreen onSwitchMode={() => handleModeChange("consultant")} />
                    : <VisiteScreen magasin={selectedMagasin} magasinId={selectedId} />
                )}
                {activeTab === "config" && <ParametrageScreen />}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
