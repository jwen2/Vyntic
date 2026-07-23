
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Citation, ConversationEntry, Deal, DocumentMetadata } from "@/lib/api";
import {
  saveConversation,
  singleQuestionStream,
} from "@/lib/api";
import AnswerText from "@/components/dd/AnswerText";
import { useTheme } from "@/components/ThemeProvider";
import { ACCENT, ddTheme, tint } from "@/components/dd/types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: (Citation | null)[];
  status?: "loading" | "complete" | "error";
  error?: string;
  documents?: string[];
};

const ASSISTANT_PROMPTS = [
  "Find all red flags and deal-breakers across every document in this deal room. Focus on anything that could affect valuation or close probability.",
  "Cross-validate all revenue and EBITDA figures across the CIM, QoE report, and financial statements. Flag any discrepancies and explain their implications.",
  "Perform a deep scan of the Legal DD document. Identify all litigation exposure, IP risks, regulatory concerns, and undisclosed liabilities.",
  "Identify concentration risks across customers, suppliers, and key employees. Quantify exposure and highlight renewal, retention, or continuity risks.",
  "Find cross-document inconsistencies across the CIM, QoE, financials, legal documents, and operations materials. Highlight metric mismatches, contradictory claims, and missing evidence.",
];

// Suggested-research cards: a scannable title + blurb over each full prompt.
const PROMPT_CARDS: { title: string; blurb: string; chips: string[]; prompt: string }[] = [
  {
    title: "Surface red flags",
    blurb: "Sweep every document for anything that could hit valuation or close probability.",
    chips: ["All documents"],
    prompt: ASSISTANT_PROMPTS[0],
  },
  {
    title: "Cross-validate the financials",
    blurb: "Reconcile revenue and EBITDA across the CIM, QoE, and statements; flag every discrepancy.",
    chips: ["CIM", "QoE", "Financials"],
    prompt: ASSISTANT_PROMPTS[1],
  },
  {
    title: "Scan legal exposure",
    blurb: "Litigation, IP risk, regulatory concerns, and undisclosed liabilities in the Legal DD.",
    chips: ["Legal DD"],
    prompt: ASSISTANT_PROMPTS[2],
  },
  {
    title: "Map concentration risk",
    blurb: "Quantify customer, supplier, and key-employee exposure and continuity risk.",
    chips: ["All documents"],
    prompt: ASSISTANT_PROMPTS[3],
  },
  {
    title: "Find cross-document inconsistencies",
    blurb: "Metric mismatches and contradictory claims across every document in the room.",
    chips: ["All documents"],
    prompt: ASSISTANT_PROMPTS[4],
  },
];

function messageId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function shortDocName(filename: string) {
  const clean = filename.replace(/\.[^.]+$/, "");
  return clean.length > 34 ? `${clean.slice(0, 31)}...` : clean;
}

export default function DealAssistantPanel({
  deal,
  documents,
  selectedEntry,
  newChatSignal,
  activeCitId,
  onCit,
  onOpenDocument,
  onConversationSaved,
  onProactiveScan,
  pendingPrompt,
  pendingPromptSignal,
}: {
  deal: Deal;
  documents: DocumentMetadata[];
  selectedEntry: ConversationEntry | null;
  newChatSignal: number;
  activeCitId: string | null;
  onCit: (citation: Citation, id: string) => void;
  onOpenDocument: (citation: Citation) => void;
  onConversationSaved?: (entry: ConversationEntry) => void;
  /** Optional — when present, the empty state shows a "Run Proactive Scan" CTA. */
  onProactiveScan?: () => void;
  /** Auto-submit this prompt when the signal value increments. Used by "Ask about this document". */
  pendingPrompt?: string | null;
  pendingPromptSignal?: number;
}) {
  const { theme } = useTheme();
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const newChatMountedRef = useRef(false);
  const lastPendingSignalRef = useRef<number>(pendingPromptSignal ?? 0);

  const selectedDocs = useMemo(
    () => documents.filter((doc) => selectedDocIds.includes(doc.doc_id)),
    [documents, selectedDocIds]
  );

  useEffect(() => {
    controllerRef.current?.abort();
    setMessages([]);
    setDraft("");
    setSelectedDocIds([]);
    setError(null);
    setIsStreaming(false);
  }, [deal.deal_id]);

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setDraft("");
    setSelectedDocIds([]);
    setError(null);
    setIsStreaming(false);
    if (!selectedEntry) {
      setMessages([]);
      return;
    }
    setMessages([
      {
        id: `${selectedEntry.id}_user`,
        role: "user",
        content: selectedEntry.question,
        status: "complete",
      },
      {
        id: `${selectedEntry.id}_assistant`,
        role: "assistant",
        content: selectedEntry.answer,
        citations: selectedEntry.citations,
        status: "complete",
      },
    ]);
  }, [selectedEntry]);

  useEffect(() => {
    if (!newChatMountedRef.current) {
      newChatMountedRef.current = true;
      return;
    }
    controllerRef.current?.abort();
    controllerRef.current = null;
    setMessages([]);
    setDraft("");
    setSelectedDocIds([]);
    setError(null);
    setIsStreaming(false);
    textareaRef.current?.focus();
  }, [newChatSignal]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isStreaming]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [selectedEntry, newChatSignal]);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, []);

  const toggleDocument = useCallback((docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  }, []);

  const submit = useCallback((value?: string) => {
    const text = (value ?? draft).trim();
    if (!text || isStreaming) return;

    const docsForMessage = selectedDocs.map((doc) => doc.filename);
    const scopedQuestion = docsForMessage.length
      ? `Focus on these document(s): ${docsForMessage.map((name) => `"${name}"`).join(", ")}.\n\n${text}`
      : text;
    const userMessage: ChatMessage = {
      id: messageId("u"),
      role: "user",
      content: text,
      documents: docsForMessage,
      status: "complete",
    };
    const assistantId = messageId("a");
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      citations: [],
      status: "loading",
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setDraft("");
    setSelectedDocIds([]);
    setError(null);
    setIsStreaming(true);
    requestAnimationFrame(resizeTextarea);

    let finalAnswer = "";
    let finalCitations: (Citation | null)[] = [];
    controllerRef.current = singleQuestionStream(
      deal.deal_id,
      scopedQuestion,
      (event) => {
        if (event.type === "token") {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: msg.content + event.token }
                : msg
            )
          );
          return;
        }
        if (event.type === "done") {
          finalAnswer = event.answer;
          finalCitations = event.citations;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    content: event.answer,
                    citations: event.citations,
                    status: "complete",
                  }
                : msg
            )
          );
          void saveConversation(deal.deal_id, {
            question: scopedQuestion,
            answer: event.answer,
            citations: event.citations,
            workstream: "assistant",
          })
            .then((entry) => onConversationSaved?.(entry))
            .catch(() => undefined);
          return;
        }
        if (event.type === "error") {
          setError(event.error);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    content: event.error,
                    status: "error",
                    error: event.error,
                  }
                : msg
            )
          );
        }
      },
      () => {
        setIsStreaming(false);
        controllerRef.current = null;
        if (!finalAnswer) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId && msg.status === "loading"
                ? { ...msg, status: "complete", citations: finalCitations }
                : msg
            )
          );
        }
      },
      (err) => {
        setIsStreaming(false);
        controllerRef.current = null;
        const message = err.message || "Assistant request failed";
        setError(message);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: message, status: "error", error: message }
              : msg
          )
        );
      }
    );
  }, [deal.deal_id, draft, isStreaming, onConversationSaved, resizeTextarea, selectedDocs]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.status === "loading"
          ? { ...msg, status: "complete", content: msg.content || "Stopped." }
          : msg
      )
    );
  }, []);

  // Auto-submit on a fresh pending prompt signal (used by "Ask about this document").
  useEffect(() => {
    if (pendingPromptSignal === undefined || pendingPromptSignal === 0) return;
    if (lastPendingSignalRef.current === pendingPromptSignal) return;
    lastPendingSignalRef.current = pendingPromptSignal;
    const text = (pendingPrompt ?? "").trim();
    if (!text) return;
    submit(text);
  }, [pendingPrompt, pendingPromptSignal, submit]);

  // Single composer, rendered either in the empty-state hero or docked at the
  // bottom during an active chat (only one mounts at a time).
  const renderComposer = () => (
    <>
      {documents.length > 0 && (
        <div className="dd-scroll" style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 2px 8px" }}>
          {documents.slice(0, 10).map((doc) => {
            const selected = selectedDocIds.includes(doc.doc_id);
            return (
              <button
                key={doc.doc_id}
                type="button"
                title={doc.filename}
                onClick={() => toggleDocument(doc.doc_id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 8px",
                  borderRadius: 99,
                  border: `1px solid ${selected ? tint(ACCENT, 53) : c.border}`,
                  background: selected ? (isDark ? "#1f1f1f" : "#f0f0e8") : c.surface,
                  color: selected ? ACCENT : c.t2,
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                {shortDocName(doc.filename)}
              </button>
            );
          })}
        </div>
      )}

      <div style={{
        background: c.surface,
        border: `1.5px solid ${c.border}`,
        borderRadius: 14,
        boxShadow: isDark ? "0 14px 38px rgba(0,0,0,.22)" : "0 14px 38px rgba(15,23,42,.08)",
        overflow: "hidden",
      }}>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            resizeTextarea();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={`Ask anything about ${deal.name}…`}
          rows={1}
          style={{
            width: "100%",
            minHeight: 52,
            maxHeight: 180,
            padding: "15px 16px 10px",
            resize: "none",
            outline: "none",
            border: "none",
            background: "transparent",
            color: c.t1,
            lineHeight: 1.55,
            fontSize: 14,
            textAlign: "left",
          }}
        />
        <div className="flex items-center justify-between" style={{ padding: "8px 10px", borderTop: `1px solid ${c.borderLight}` }}>
          <span style={{ fontSize: 11, color: c.t3, paddingLeft: 4 }}>
            Enter to send · Shift+Enter for a new line
          </span>
          <button
            type="button"
            onClick={() => (isStreaming ? cancel() : submit())}
            disabled={!isStreaming && !draft.trim()}
            title={isStreaming ? "Stop" : "Send"}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "none",
              background: isStreaming || draft.trim() ? ACCENT : c.border,
              color: isStreaming || draft.trim() ? "var(--on-accent)" : c.t3,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: isStreaming || draft.trim() ? "pointer" : "default",
            }}
          >
            {isStreaming ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="M13 6l6 6-6 6" />
              </svg>
            )}
          </button>
        </div>
      </div>
      <div style={{ textAlign: "center", fontSize: 11, color: c.t3, paddingTop: 8 }}>
        AI can make mistakes. Verify cited source documents.
      </div>
    </>
  );

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: c.bg }}>
      <div className="dd-scroll" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "34px 24px 150px" }}>
          {messages.length === 0 ? (
            <InitialAssistantState
              dealName={deal.name}
              docCount={documents.length}
              totalPages={documents.reduce((sum, doc) => sum + (doc.page_count || 0), 0)}
              loading={false}
              onPrompt={submit}
              onProactiveScan={onProactiveScan}
              theme={theme}
              composer={renderComposer()}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {messages.map((msg) => (
                <ChatBubble
                  key={msg.id}
                  message={msg}
                  activeCitId={activeCitId}
                  onCit={onCit}
                  onOpenDocument={onOpenDocument}
                  theme={theme}
                />
              ))}
              {error && (
                <div style={{ color: "#ef4444", fontSize: 12, paddingLeft: 44 }}>{error}</div>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {messages.length > 0 && (
        <div style={{
          flexShrink: 0,
          padding: "0 24px 18px",
          background: `linear-gradient(to top, ${c.bg} 78%, ${isDark ? "rgba(15,15,15,0)" : "rgba(243,243,238,0)"})`,
        }}>
          <div style={{ maxWidth: 820, margin: "0 auto" }}>
            {renderComposer()}
          </div>
        </div>
      )}
    </div>
  );
}

function InitialAssistantState({
  dealName,
  docCount,
  totalPages,
  loading,
  onPrompt,
  onProactiveScan,
  theme,
  composer,
}: {
  dealName: string;
  docCount: number;
  totalPages: number;
  loading: boolean;
  onPrompt: (prompt: string) => void;
  onProactiveScan?: () => void;
  theme: "light" | "dark";
  composer?: ReactNode;
}) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  return (
    <div style={{ minHeight: "calc(100vh - 280px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 640, textAlign: "center" }}>
        <div className="font-mono-plex" style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: c.t3,
          marginBottom: 16,
        }}>
          {docCount} document{docCount === 1 ? "" : "s"} · isolated deal room
        </div>
        <div style={{
          width: 38,
          height: 38,
          margin: "0 auto 18px",
          borderRadius: 10,
          background: ACCENT,
          color: "var(--on-accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 15,
        }}>
          V
        </div>
        <h1 style={{ fontSize: 28, lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.02em", color: c.t1, marginBottom: 8 }}>
          Begin your diligence
        </h1>
        <p style={{ fontSize: 13.5, color: c.t2, lineHeight: 1.6, marginBottom: 24 }}>
          Ask anything about {dealName} — every answer is cited to the exact page across
          {" "}{docCount} document{docCount === 1 ? "" : "s"}.
        </p>

        {composer && <div style={{ marginBottom: 26, textAlign: "left" }}>{composer}</div>}

        {/* Proactive Scan CTA — calmed to a neutral ghost. Only when the parent wires the callback. */}
        {onProactiveScan && (
          <button
            type="button"
            onClick={onProactiveScan}
            disabled={loading}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = tint(ACCENT, 42))}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = c.border)}
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              gap: 12,
              padding: "13px 15px",
              background: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: 12,
              cursor: loading ? "default" : "pointer",
              marginBottom: 26,
              textAlign: "left",
              transition: "border-color .12s",
            }}
          >
            <span style={{
              width: 34, height: 34, borderRadius: 8,
              background: c.surfaceAlt,
              border: `1px solid ${c.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, flexShrink: 0,
            }}>🔍</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: c.t1 }}>Run Proactive Scan</span>
              <span style={{ display: "block", fontSize: 12, color: c.t2, marginTop: 1 }}>
                {totalPages > 0
                  ? `Sweep all ${totalPages} pages to find hidden risks, buried clauses, and data room gaps`
                  : "Sweep the deal room to find hidden risks, buried clauses, and data room gaps"}
              </span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.t3} strokeWidth="2"><path d="M5 3l14 9-14 9V3z" /></svg>
          </button>
        )}

        <div className="font-mono-plex" style={{
          fontSize: 10, fontWeight: 600, color: c.t3,
          textTransform: "uppercase", letterSpacing: "0.16em",
          marginBottom: 12, textAlign: "left",
        }}>
          Try asking Vyntic to…
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, opacity: loading ? 0.55 : 1 }}>
          {PROMPT_CARDS.map((card) => (
            <button
              key={card.title}
              type="button"
              disabled={loading}
              onClick={() => onPrompt(card.prompt)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = tint(ACCENT, 42);
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = c.border;
                e.currentTarget.style.transform = "none";
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 7,
                textAlign: "left",
                padding: "14px 15px",
                borderRadius: 14,
                border: `1px solid ${c.border}`,
                background: c.surface,
                cursor: loading ? "default" : "pointer",
                transition: "border-color .12s, transform .12s",
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 600, color: c.t1, lineHeight: 1.3 }}>
                {card.title}
              </span>
              <span style={{ fontSize: 12, color: c.t2, lineHeight: 1.5 }}>
                {card.blurb}
              </span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                {card.chips.map((chip) => (
                  <span
                    key={chip}
                    style={{
                      fontSize: 10.5,
                      color: c.t3,
                      background: c.surfaceAlt,
                      border: `1px solid ${c.border}`,
                      borderRadius: 6,
                      padding: "3px 7px",
                    }}
                  >
                    {chip}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  message,
  activeCitId,
  onCit,
  onOpenDocument,
  theme,
}: {
  message: ChatMessage;
  activeCitId: string | null;
  onCit: (citation: Citation, id: string) => void;
  onOpenDocument: (citation: Citation) => void;
  theme: "light" | "dark";
}) {
  const c = ddTheme(theme);
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          {message.documents && message.documents.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
              {message.documents.map((doc) => (
                <span key={doc} style={{
                  fontSize: 10,
                  color: c.t2,
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: 99,
                  padding: "2px 7px",
                }}>
                  {shortDocName(doc)}
                </span>
              ))}
            </div>
          )}
          <div style={{
            background: c.surfaceAlt,
            color: c.t1,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            padding: "11px 13px",
            fontSize: 14,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
          }}>
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        background: ACCENT,
        color: "var(--on-accent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 800,
        flexShrink: 0,
      }}>
        V
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          background: c.surface,
          border: `1px solid ${message.status === "error" ? "#fecaca" : c.border}`,
          borderRadius: 12,
          padding: "14px 16px",
          color: message.status === "error" ? "#ef4444" : c.t1,
          minHeight: 50,
        }}>
          {message.content ? (
            <AnswerText
              text={message.content}
              citations={message.citations || []}
              activeCitId={activeCitId}
              onCit={onCit}
            />
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: c.t2, fontSize: 13 }}>
              <span className="dd-spin" style={{ width: 13, height: 13, border: `2px solid ${c.border}`, borderTopColor: ACCENT, borderRadius: "50%" }} />
              Reading the deal room...
            </span>
          )}
        </div>
        {(message.citations || []).filter(Boolean).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
            {(message.citations || []).filter(Boolean).slice(0, 6).map((citation, index) => {
              const cit = citation as Citation;
              return (
                <button
                  key={`${cit.source_file}_${cit.page}_${index}`}
                  type="button"
                  onClick={() => onOpenDocument(cit)}
                  style={{
                    border: `1px solid ${c.border}`,
                    background: c.surfaceAlt,
                    color: c.t2,
                    borderRadius: 99,
                    padding: "3px 8px",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {shortDocName(cit.source_file)} p.{cit.page}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
