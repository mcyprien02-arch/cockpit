"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Navigation, TabId } from "@/components/layout/Navigation";
import { HomeScreen } from "@/components/screens/HomeScreen";
import { DiagnosticScreen } from "@/components/screens/DiagnosticScreen";
import { SaisieScreen } from "@/components/screens/SaisieScreen";
import { PlanActionScreen } from "@/components/screens/PlanActionScreen";
import { VisiteScreen } from "@/components/screens/VisiteScreen";
import { SimulateurScreen } from "@/components/screens/SimulateurScreen";
import { AssistantScreen } from "@/components/screens/AssistantScreen";
import { CompetencesScreen } from "@/components/screens/CompetencesScreen";
import { ParametrageScreen } from "@/components/screens/ParametrageScreen";
import type { Magasin } from "@/types";

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

function AppHeader({
  magasins, selectedId, onSelect,
}: {
  magasins: Magasin[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
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
            <div className="text-[10px]" style={{ color: "var(--textDim)" }}>Outil de pilotage franchise</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {magasins.length > 0 && (
            <StoreSelector magasins={magasins} selectedId={selectedId} onChange={onSelect} />
          )}
        </div>
      </div>
    </header>
  );
}

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

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        <div className="h-14 border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />
        <div className="h-12 border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />
        <div className="px-6 py-6 max-w-[1600px] mx-auto space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
            ))}
          </div>
          <div className="h-64 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
        </div>
      </div>
    );
  }

  const noStore = !selectedId && activeTab !== "config";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader
        magasins={magasins}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} mode="consultant" />

      <main className="px-6 py-5 max-w-[1600px] mx-auto">
        {error && (
          <div
            className="rounded-xl p-4 mb-4 text-[13px] font-medium"
            style={{ background: "#ff4d6a12", color: "var(--danger)", border: "1px solid #ff4d6a30" }}
          >
            ⚠ {error}
          </div>
        )}

        {noStore ? (
          <div className="text-center py-16" style={{ color: "var(--textMuted)" }}>
            <div className="text-[40px] mb-3">🏪</div>
            <div className="text-[14px]">Aucun magasin trouvé. Ajoutez-en un dans Paramétrage.</div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
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
              {activeTab === "visite" && selectedId && (
                <VisiteScreen magasin={selectedMagasin} magasinId={selectedId} />
              )}
              {activeTab === "simulateur" && selectedId && (
                <SimulateurScreen magasinId={selectedId} />
              )}
              {activeTab === "assistant" && selectedId && (
                <AssistantScreen magasinId={selectedId} />
              )}
              {activeTab === "competences" && selectedId && (
                <CompetencesScreen magasinId={selectedId} />
              )}
              {activeTab === "config" && <ParametrageScreen />}
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}
