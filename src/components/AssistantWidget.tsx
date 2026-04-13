"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { buildMagasinContext } from "@/lib/buildContext";
import { runRedacteurAssistant } from "@/lib/agents";

interface Message {
  role: "user" | "assistant";
  text: string;
}

interface AssistantWidgetProps {
  magasinId?: string;
  context?: {
    score?: number;
    gmroi?: number;
    kpisAlerte?: string[];
    kpisOk?: string[];
    actions?: string[];
    caMensuel?: number;
    stockAge?: number;
    tlac?: number;
  };
}

export function AssistantWidget({ magasinId, context }: AssistantWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"assistant" | "miroir">("assistant");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          text: "Bonjour ! Je suis votre consultant EasyCash. Posez-moi une question sur vos KPIs, votre stock, votre équipe ou vos marges. Je réponds avec des actions concrètes.",
        },
      ]);
    }
  }, [open, messages.length]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || loading) return;

    setInput("");
    setMessages(prev => [...prev, { role: "user", text: question }]);
    setLoading(true);

    try {
      if (magasinId) {
        // Use agents.ts when magasinId is available
        const ctx = await buildMagasinContext(magasinId);
        const reply = await runRedacteurAssistant(ctx, question);
        setMessages(prev => [...prev, { role: "assistant", text: reply }]);
      } else {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question, mode, context }),
        });
        const data = await res.json();
        setMessages(prev => [...prev, { role: "assistant", text: data.response ?? "Désolé, je n'ai pas pu répondre." }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Erreur de connexion. Réessayez." }]);
    }
    setLoading(false);
  };

  const triggerMiroir = async () => {
    setMessages(prev => [...prev, { role: "user", text: "Génère l'effet miroir pour ce magasin." }]);
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "miroir", mode: "miroir", context }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", text: data.response ?? "Données insuffisantes pour l'effet miroir." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Erreur de connexion." }]);
    }
    setLoading(false);
  };

  const SUGGESTIONS = [
    "Comment améliorer ma marge ?",
    "Mon stock âgé est-il problématique ?",
    "Quelle action prioritaire aujourd'hui ?",
  ];

  return (
    <>
      {/* Floating button */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
        style={{
          background: open
            ? "var(--surfaceAlt)"
            : "linear-gradient(135deg, #ff4d6a, #c0392b)",
          border: "none",
          cursor: "pointer",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        }}
        aria-label="Assistant EasyCash"
      >
        <span className="text-[22px]">{open ? "✕" : "🤖"}</span>
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl"
            style={{
              width: "360px",
              height: "480px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{
                background: "linear-gradient(135deg, #ff4d6a15, #c0392b15)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold"
                  style={{ background: "linear-gradient(135deg, #ff4d6a, #c0392b)", color: "#fff" }}
                >
                  E
                </div>
                <div>
                  <div className="text-[12px] font-bold" style={{ color: "var(--text)" }}>Consultant EasyCash</div>
                  <div className="text-[9px]" style={{ color: "var(--textDim)" }}>Réponses en 3 phrases max</div>
                </div>
              </div>

              {/* Mode toggle */}
              <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                {(["assistant", "miroir"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className="px-2.5 py-1 text-[9px] font-bold uppercase transition-colors"
                    style={{
                      background: mode === m ? "var(--accent)" : "transparent",
                      color: mode === m ? "#000" : "var(--textMuted)",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {m === "assistant" ? "Conseil" : "Miroir"}
                  </button>
                ))}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className="rounded-xl px-3 py-2 text-[12px] max-w-[85%]"
                    style={{
                      background: msg.role === "user" ? "var(--accent)" : "var(--surfaceAlt)",
                      color: msg.role === "user" ? "#000" : "var(--text)",
                      lineHeight: "1.5",
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div
                    className="rounded-xl px-3 py-2 flex items-center gap-1.5"
                    style={{ background: "var(--surfaceAlt)" }}
                  >
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: "var(--textDim)" }}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.2, delay: i * 0.3, repeat: Infinity }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Suggestions */}
            {messages.length <= 1 && (
              <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto shrink-0">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s)}
                    className="rounded-full px-2.5 py-1 text-[10px] whitespace-nowrap shrink-0 transition-all"
                    style={{
                      background: "var(--surfaceAlt)",
                      color: "var(--textMuted)",
                      border: "1px solid var(--border)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Effet miroir button */}
            {mode === "miroir" && (
              <div className="px-4 pb-2 shrink-0">
                <button
                  onClick={triggerMiroir}
                  disabled={loading}
                  className="w-full rounded-xl py-2 text-[11px] font-bold transition-all"
                  style={{
                    background: loading ? "var(--surfaceAlt)" : "#6b8fa320",
                    color: loading ? "var(--textDim)" : "#8fa3b3",
                    border: "1px solid #6b8fa330",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  🪞 Générer l'effet miroir
                </button>
              </div>
            )}

            {/* Input */}
            <div
              className="flex items-center gap-2 px-3 py-2.5 shrink-0"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") sendMessage(); }}
                placeholder="Posez votre question..."
                className="flex-1 rounded-xl px-3 py-2 text-[12px]"
                style={{
                  background: "var(--surfaceAlt)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0"
                style={{
                  background: loading || !input.trim() ? "var(--surfaceAlt)" : "var(--accent)",
                  border: "none",
                  cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                }}
              >
                <span className="text-[12px]">→</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
