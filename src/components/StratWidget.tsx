"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { getStatus } from "@/lib/scoring";

interface Message {
  role: "user" | "assistant";
  text: string;
}

// Parse sections with emoji headers (📈 DIAGNOSTIC, 💸 IMPACT, 🎯 ACTION P1, 👤 HUMAIN)
function StratResponse({ text }: { text: string }) {
  const sections = text.split(/(?=📈|💸|🎯|👤)/).filter(Boolean);
  if (sections.length <= 1) {
    return <span style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6 }}>{text}</span>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {sections.map((s, i) => {
        const nl = s.indexOf("\n");
        const header = nl > -1 ? s.slice(0, nl).trim() : s.trim();
        const body = nl > -1 ? s.slice(nl + 1).trim() : "";
        return (
          <div key={i}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#1a1a1a", marginBottom: 3 }}>{header}</div>
            {body && <div style={{ fontSize: 12, color: "#333", lineHeight: 1.55 }}>{body}</div>}
          </div>
        );
      })}
    </div>
  );
}

async function buildContext(magasinId: string) {
  const { data: vData } = await supabase
    .from("v_dernieres_valeurs")
    .select("*")
    .eq("magasin_id", magasinId);

  const { data: pData } = await supabase
    .from("plans_action")
    .select("action, priorite, statut")
    .eq("magasin_id", magasinId)
    .neq("statut", "Fait")
    .limit(5);

  const kpis = ((vData ?? []) as any[]).map((r) => ({
    nom: r.indicateur_nom,
    valeur: r.valeur,
    unite: r.unite ?? "",
    statut: getStatus(r.valeur, r.direction, r.seuil_ok, r.seuil_vigilance),
    categorie: r.categorie,
    seuil_ok: r.seuil_ok,
  }));

  const alertes = kpis.filter((k) => k.statut === "dg");
  const stockAge = kpis.find((k) => k.nom.toLowerCase().includes("stock") && k.nom.toLowerCase().includes("âg"));

  return {
    nbIndicateurs: kpis.length,
    nbAlertes: alertes.length,
    stockAge: stockAge ? `${stockAge.valeur}${stockAge.unite}` : null,
    alertes: alertes.slice(0, 5).map((k) => `${k.nom}: ${k.valeur}${k.unite} (seuil: ${k.seuil_ok}${k.unite})`),
    pap: ((pData ?? []) as any[]).map((a) => `[${a.priorite}] ${a.action}`),
  };
}

const SUGGESTIONS = [
  "Comment réduire mes coûts cachés ?",
  "Mon stock âgé est-il problématique ?",
  "Quelle action prioritaire aujourd'hui ?",
  "Comment améliorer ma marge ?",
];

export function StratWidget({ magasinId }: { magasinId?: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ctx, setCtx] = useState<Record<string, unknown> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load context + opening message on first open
  useEffect(() => {
    if (!open || messages.length > 0) return;
    if (!magasinId) {
      setMessages([{ role: "assistant", text: "Sélectionnez un magasin pour activer le Stratège." }]);
      return;
    }
    buildContext(magasinId).then((c) => {
      setCtx(c);
      const stockMsg = c.stockAge ? `Votre stock âgé (${c.stockAge}) paralyse votre trésorerie.` : "";
      setMessages([{
        role: "assistant",
        text: `Bonjour. J'ai analysé vos ${c.nbIndicateurs} indicateurs. ${stockMsg} ${c.nbAlertes} alerte${c.nbAlertes !== 1 ? "s" : ""} détectée${c.nbAlertes !== 1 ? "s" : ""}. Que voulez-vous corriger en priorité ?`.trim(),
      }]);
    }).catch(() => {
      setMessages([{ role: "assistant", text: "Bonjour. Posez votre question sur le magasin." }]);
    });
  }, [open, messages.length, magasinId]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || loading) return;
    setInput("");
    setMessages((p) => [...p, { role: "user", text: question }]);
    setLoading(true);

    try {
      const context = ctx ?? (magasinId ? await buildContext(magasinId) : {});
      if (!ctx && magasinId) setCtx(context as Record<string, unknown>);

      const res = await fetch("/api/strategy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, context }),
      });
      const data = await res.json();
      const reply = data.response ?? data.error ?? "Erreur — réessayez.";
      setMessages((p) => [...p, { role: "assistant", text: reply }]);
    } catch {
      setMessages((p) => [...p, { role: "assistant", text: "Erreur de connexion. Réessayez." }]);
    }
    setLoading(false);
  };

  return (
    <>
      {/* Floating button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", bottom: 25, right: 25, zIndex: 9999,
          background: open ? "#1a1a1a" : "linear-gradient(135deg, #ffcc00, #ffb300)",
          border: "none", borderRadius: "50%",
          width: 65, height: 65,
          cursor: "pointer",
          boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
          fontSize: 30,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: open ? "#ffcc00" : "#1a1a1a",
        }}
        aria-label="Stratège EasyCash"
      >
        {open ? "✕" : "🤖"}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "fixed", bottom: 105, right: 25, zIndex: 9998,
              width: 380, height: 540,
              background: "#fff",
              borderRadius: 20,
              display: "flex", flexDirection: "column",
              boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
              overflow: "hidden",
              border: "1px solid #e0e0e0",
              fontFamily: "DM Sans, sans-serif",
            }}
          >
            {/* Header */}
            <div style={{ background: "#1a1a1a", color: "#ffcc00", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 1 }}>STRATÈGE EASYCASH</div>
                <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>
                  {ctx ? `${(ctx as any).nbIndicateurs ?? "—"} KPIs · ${(ctx as any).nbAlertes ?? "—"} alertes` : "Chargement…"}
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, padding: 16, overflowY: "auto", background: "#f8f9fa", display: "flex", flexDirection: "column", gap: 12 }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ alignSelf: msg.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                  {msg.role === "user" ? (
                    <div style={{ background: "#1a1a1a", color: "#fff", padding: "10px 14px", borderRadius: "15px 15px 0 15px", fontSize: 13 }}>
                      {msg.text}
                    </div>
                  ) : (
                    <div style={{ background: "#fff", padding: "12px 14px", borderRadius: "15px 15px 15px 0", borderLeft: "4px solid #ffcc00", boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}>
                      <StratResponse text={msg.text} />
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div style={{ alignSelf: "flex-start", background: "#fff", padding: "12px 14px", borderRadius: "15px 15px 15px 0", borderLeft: "4px solid #ffcc00", display: "flex", gap: 5 }}>
                  {[0, 1, 2].map((i) => (
                    <motion.div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#ffcc00" }}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, delay: i * 0.3, repeat: Infinity }}
                    />
                  ))}
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Suggestions */}
            {messages.length <= 1 && (
              <div style={{ padding: "8px 12px", background: "#f8f9fa", display: "flex", gap: 6, overflowX: "auto", flexShrink: 0 }}>
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => send(s)}
                    style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 20, padding: "5px 12px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", color: "#555", fontFamily: "inherit" }}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div style={{ padding: "12px 14px", background: "#fff", borderTop: "1px solid #eee", display: "flex", gap: 10, flexShrink: 0 }}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                placeholder="Ex: Comment réduire mes coûts cachés ?"
                style={{ flex: 1, border: "1px solid #ddd", padding: "10px 14px", borderRadius: 10, outline: "none", fontSize: 13, fontFamily: "inherit", color: "#1a1a1a" }}
              />
              <button onClick={() => send()} disabled={loading || !input.trim()}
                style={{ background: loading || !input.trim() ? "#ccc" : "#1a1a1a", color: "#ffcc00", border: "none", padding: "10px 18px", borderRadius: 10, cursor: loading || !input.trim() ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 13, fontFamily: "inherit" }}>
                →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
