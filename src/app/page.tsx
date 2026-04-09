"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Navigation, ModeSwitcher, TabId, AppMode, getTabGroup } from "@/components/layout/Navigation";

// Screens
import { VerdictScreen }          from "@/components/screens/VerdictScreen";
import { KPIsGPSScreen }          from "@/components/screens/KPIsGPSScreen";
import { SaisieScreen }           from "@/components/screens/SaisieScreen";
import { DiagnosticScreen }       from "@/components/screens/DiagnosticScreen";
import { DiagnosticExpressScreen } from "@/components/screens/DiagnosticExpressScreen";
import { ImportScreen }           from "@/components/screens/ImportScreen";
import { ComparatifScreen }       from "@/components/screens/ComparatifScreen";
import { BalanceEconomiqueScreen } from "@/components/screens/BalanceEconomiqueScreen";
import { SimulateurScreen }       from "@/components/screens/SimulateurScreen";
import { CHVACVScreen }           from "@/components/screens/CHVACVScreen";
import { PAPScreen }              from "@/components/screens/PAPScreen";
import { PlanActionScreen }       from "@/components/screens/PlanActionScreen";
import { CompetencesISEORScreen } from "@/components/screens/CompetencesISEORScreen";
import { CarnetDeBordScreen }     from "@/components/screens/CarnetDeBordScreen";
import { ChecklistScreen }         from "@/components/screens/ChecklistScreen";
import { JournalVisiteScreen }    from "@/components/screens/JournalVisiteScreen";
import { ParametrageScreen }      from "@/components/screens/ParametrageScreen";
import { ExportCRScreen }         from "@/components/screens/ExportCRScreen";
import { MaJourneeScreen }        from "@/components/screens/MaJourneeScreen";
import { AvisClientsScreen }      from "@/components/screens/AvisClientsScreen";
import { VictoiresScreen }        from "@/components/screens/VictoiresScreen";
import { AssistantWidget }        from "@/components/AssistantWidget";
import { SpiralIndicator }        from "@/components/SpiralIndicator";
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
  const noStore: TabId[] = ["config"];
  return (
    <header style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between px-6 py-3 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px] font-bold"
            style={{ background: "linear-gradient(135deg, #ff4d6a, #c0392b)", color: "#fff" }}
          >
            E
          </div>
          <div>
            <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>EasyCash Cockpit</div>
            <div className="text-[10px]" style={{ color: "var(--textDim)" }}>GPS de décision franchise</div>
          </div>
        </div>
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

// ─── Restricted screen ────────────────────────────────────────
function RestrictedScreen({ onSwitchMode }: { onSwitchMode: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
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
  const [magasins, setMagasins]     = useState<Magasin[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeTab, setActiveTab]   = useState<TabId>("cockpit");
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [mode, setMode]             = useState<AppMode>("consultant");

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

  useEffect(() => {
    try {
      const saved = localStorage.getItem("app_mode");
      if (saved === "consultant" || saved === "franchisé") setMode(saved);
      const savedTab = localStorage.getItem("active_tab") as TabId | null;
      if (savedTab) setActiveTab(savedTab);
    } catch { /* ignore */ }
  }, []);

  const handleModeChange = (m: AppMode) => {
    setMode(m);
    try { localStorage.setItem("app_mode", m); } catch { /* ignore */ }
    if (m === "franchisé") {
      const allowed = ["journee_grp", "actions"];
      if (!allowed.includes(getTabGroup(activeTab))) setActiveTab("journee");
    }
  };

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    try { localStorage.setItem("active_tab", tab); } catch { /* ignore */ }
  };

  const selectedMagasin = magasins.find(m => m.id === selectedId) ?? null;

  const CONSULTANT_ONLY: TabId[] = [
    "balance", "chvacv", "kpis_gps", "competences", "config",
    "diagnostic", "comparatif", "import", "journal_visite", "export",
  ];
  const isRestricted = (tab: TabId) =>
    CONSULTANT_ONLY.includes(tab) && mode !== "consultant";

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        <div className="h-14 border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />
        <div className="h-12 border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />
        <div className="px-6 py-6 max-w-[1600px] mx-auto space-y-4">
          <div className="h-64 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const noStoreNeeded: TabId[] = ["config"];
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
      <Navigation activeTab={activeTab} onTabChange={handleTabChange} mode={mode} />

      <main className="px-6 py-5 max-w-[1600px] mx-auto">
        {error && (
          <div
            className="rounded-xl p-4 mb-4 text-[13px] font-medium"
            style={{ background: "#ff4d6a12", color: "var(--danger)", border: "1px solid #ff4d6a30" }}
          >
            ⚠ {error}
          </div>
        )}

        {/* Spiral indicator — shown on verdict/cockpit tab */}
        {(activeTab === "cockpit" || activeTab === "kpis_gps") && selectedId && (
          <div className="mb-4">
            <SpiralIndicator
              magasinId={selectedId}
              onOpenSimulateur={() => handleTabChange("simulateur")}
            />
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
                <button
                  onClick={() => handleTabChange("config")}
                  className="mt-4 rounded-xl px-5 py-2 text-[13px] font-semibold"
                  style={{ background: "var(--accent)", color: "#000", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Aller dans Paramétrage →
                </button>
              </div>
            ) : (
              <>
                {/* ☀️ MA JOURNÉE */}
                {activeTab === "journee" && selectedId && (
                  <MaJourneeScreen magasinId={selectedId} />
                )}
                {activeTab === "avis_clients" && selectedId && (
                  <AvisClientsScreen />
                )}
                {activeTab === "victoires" && selectedId && (
                  <VictoiresScreen magasinId={selectedId} />
                )}
                {activeTab === "checklist" && selectedId && (
                  <ChecklistScreen magasinId={selectedId} />
                )}

                {/* ⚡ VERDICT */}
                {activeTab === "cockpit" && selectedId && (
                  <VerdictScreen
                    magasinId={selectedId}
                    onNavigate={tab => handleTabChange(tab as TabId)}
                    mode={mode}
                  />
                )}
                {activeTab === "kpis_gps" && selectedId && (
                  isRestricted("kpis_gps")
                    ? <RestrictedScreen onSwitchMode={() => handleModeChange("consultant")} />
                    : <KPIsGPSScreen
                        magasinId={selectedId}
                        onNavigate={tab => handleTabChange(tab as TabId)}
                      />
                )}
                {activeTab === "saisie" && selectedId && (
                  <SaisieScreen magasinId={selectedId} />
                )}
                {activeTab === "diagnostic" && selectedId && (
                  isRestricted("diagnostic")
                    ? <RestrictedScreen onSwitchMode={() => handleModeChange("consultant")} />
                    : <DiagnosticScreen magasinId={selectedId} />
                )}
                {activeTab === "diagnostic_express" && selectedId && (
                  <DiagnosticExpressScreen />
                )}
                {activeTab === "import" && selectedId && (
                  isRestricted("import")
                    ? <RestrictedScreen onSwitchMode={() => handleModeChange("consultant")} />
                    : <ImportScreen magasinId={selectedId} magasin={selectedMagasin} onNavigate={tab => handleTabChange(tab as TabId)} />
                )}
                {activeTab === "comparatif" && selectedId && (
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
                  <SimulateurScreen magasinId={selectedId} />
                )}
                {activeTab === "chvacv" && selectedId && (
                  isRestricted("chvacv")
                    ? <RestrictedScreen onSwitchMode={() => handleModeChange("consultant")} />
                    : <CHVACVScreen magasinId={selectedId} magasin={selectedMagasin} />
                )}

                {/* 🎯 ACTIONS */}
                {activeTab === "pap" && selectedId && (
                  <PAPScreen magasinId={selectedId} />
                )}
                {activeTab === "plan" && selectedId && (
                  <PlanActionScreen magasinId={selectedId} />
                )}
                {activeTab === "competences" && selectedId && (
                  isRestricted("competences")
                    ? <RestrictedScreen onSwitchMode={() => handleModeChange("consultant")} />
                    : <CompetencesISEORScreen magasinId={selectedId} />
                )}
                {activeTab === "carnet" && selectedId && (
                  <CarnetDeBordScreen magasinId={selectedId} />
                )}

                {/* 👥 ÉQUIPE */}
                {activeTab === "journal_visite" && selectedId && (
                  isRestricted("journal_visite")
                    ? <RestrictedScreen onSwitchMode={() => handleModeChange("consultant")} />
                    : <JournalVisiteScreen magasinId={selectedId} magasinNom={selectedMagasin?.nom} />
                )}
                {activeTab === "config" && <ParametrageScreen />}
                {activeTab === "export" && selectedId && (
                  isRestricted("export")
                    ? <RestrictedScreen onSwitchMode={() => handleModeChange("consultant")} />
                    : <ExportCRScreen magasinId={selectedId} magasinNom={selectedMagasin?.nom} />
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating assistant — visible on most tabs */}
      {selectedId && !["config"].includes(activeTab) && (
        <AssistantWidget />
      )}
    </div>
  );
}
