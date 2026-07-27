
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Citation, ConversationEntry, Deal, DocumentMetadata } from "@/lib/api";
import {
  saveConversation,
  singleQuestionStream,
} from "@/lib/api";
import AnswerText from "@/components/dd/AnswerText";
import { useTheme } from "@/components/ThemeProvider";
import { ACCENT, tint } from "@/components/dd/types";
import Button from "@/components/ui/Button";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: (Citation | null)[];
  status?: "loading" | "complete" | "error";
  error?: string;
  documents?: string[];
};

// Buyout deal investigations (entity_type="deal").
const DEAL_PROMPTS = [
  "Find all red flags and deal-breakers across every document in this deal room. Focus on anything that could affect valuation or close probability.",
  "Cross-validate all revenue and EBITDA figures across the CIM, QoE report, and financial statements. Flag any discrepancies and explain their implications.",
  "Perform a deep scan of the Legal DD document. Identify all litigation exposure, IP risks, regulatory concerns, and undisclosed liabilities.",
  "Identify concentration risks across customers, suppliers, and key employees. Quantify exposure and highlight renewal, retention, or continuity risks.",
  "Find cross-document inconsistencies across the CIM, QoE, financials, legal documents, and operations materials. Highlight metric mismatches, contradictory claims, and missing evidence.",
];

// Suggested-research cards per entity type: a scannable title + blurb over each prompt.
type PromptCard = { title: string; blurb: string; chips: string[]; prompt: string };

// Buyout deal cards (entity_type="deal").
const DEAL_CARDS: PromptCard[] = [
  {
    title: "Surface red flags",
    blurb: "Sweep every document for anything that could hit valuation or close probability.",
    chips: ["All documents"],
    prompt: DEAL_PROMPTS[0],
  },
  {
    title: "Cross-validate the financials",
    blurb: "Reconcile revenue and EBITDA across the CIM, QoE, and statements; flag every discrepancy.",
    chips: ["CIM", "QoE", "Financials"],
    prompt: DEAL_PROMPTS[1],
  },
  {
    title: "Scan legal exposure",
    blurb: "Litigation, IP risk, regulatory concerns, and undisclosed liabilities in the Legal DD.",
    chips: ["Legal DD"],
    prompt: DEAL_PROMPTS[2],
  },
  {
    title: "Map concentration risk",
    blurb: "Quantify customer, supplier, and key-employee exposure and continuity risk.",
    chips: ["All documents"],
    prompt: DEAL_PROMPTS[3],
  },
  {
    title: "Find cross-document inconsistencies",
    blurb: "Metric mismatches and contradictory claims across every document in the room.",
    chips: ["All documents"],
    prompt: DEAL_PROMPTS[4],
  },
];

// LP fund investigations (entity_type="fund"): grounded in the DDQ, PPM, LPA,
// track record, and side letter.
const FUND_PROMPTS = [
  "Scan the DDQ, PPM, and pitchbook for evasive answers and contradictions on team, track record, fees, and conflicts.",
  "Rebuild the track record and check each fund for TVPI = DPI + RVPI. Flag inflated or cherry-picked multiples.",
  "Extract the fund terms and flag anything off-market vs. ILPA: fees, waterfall, GP commitment, key-person, removal.",
  "Assess team and key-person risk: departures, succession gaps, and whether named key persons are still active.",
  "Review ODD and compliance exposure: affiliated service providers, regulatory history, and valuation governance.",
];

// LP fund cards.
const FUND_CARDS: PromptCard[] = [
  {
    title: "Probe the DDQ & PPM",
    blurb: "Scan for evasive answers and contradictions on team, track record, fees, and conflicts.",
    chips: ["DDQ", "PPM", "Pitchbook"],
    prompt: FUND_PROMPTS[0],
  },
  {
    title: "Verify the track record",
    blurb: "Rebuild returns and check TVPI = DPI + RVPI; flag inflated or cherry-picked multiples.",
    chips: ["Track record"],
    prompt: FUND_PROMPTS[1],
  },
  {
    title: "Check terms vs. ILPA",
    blurb: "Fees, waterfall, GP commitment, key-person, and removal — flag anything off-market.",
    chips: ["LPA", "Side letter"],
    prompt: FUND_PROMPTS[2],
  },
  {
    title: "Assess key-person risk",
    blurb: "Departures, succession gaps, and whether named key persons are still active.",
    chips: ["All documents"],
    prompt: FUND_PROMPTS[3],
  },
  {
    title: "Review ODD & compliance",
    blurb: "Affiliated service providers, regulatory history, and valuation governance.",
    chips: ["ODD"],
    prompt: FUND_PROMPTS[4],
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
  historyOpenSignal,
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
  historyOpenSignal: number;
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
  const isDark = theme === "dark";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
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
    // Clearing the selected row does not mean "new chat"; it also happens
    // when a response is saved. Only New chat should clear the live thread.
    if (!selectedEntry) return;
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
  }, [historyOpenSignal, selectedEntry]);

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
  const activeSources = selectedDocIds.length === 0 ? documents.length : selectedDocIds.length;

  const renderComposer = () => (
    <>
      <div style={{ position: "relative" }}>
        {sourcesOpen && documents.length > 0 && (
          <>
            <button
              type="button"
              aria-label="Close sources"
              onClick={() => setSourcesOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 19, background: "transparent", border: "none", cursor: "default" }}
            />
            <div
              className="dd-scroll bg-surface border border-edge"
              style={{
                position: "absolute",
                ...(messages.length === 0
                  ? { top: "calc(100% + 8px)" }
                  : { bottom: "calc(100% + 8px)" }),
                left: 0,
                width: 300,
                maxHeight: 280,
                overflowY: "auto",
                borderRadius: 12,
                boxShadow: isDark ? "0 18px 44px rgba(0,0,0,.4)" : "0 18px 44px rgba(15,23,42,.12)",
                zIndex: 20,
                padding: 6,
                textAlign: "left",
              }}
            >
              <div className="font-mono-plex text-t3" style={{ padding: "6px 8px", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                Search across
              </div>
              {documents.map((doc) => {
                const on = selectedDocIds.length === 0 || selectedDocIds.includes(doc.doc_id);
                return (
                  <button
                    key={doc.doc_id}
                    type="button"
                    onClick={() => toggleDocument(doc.doc_id)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-alt)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}
                  >
                    <span style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${on ? ACCENT : "var(--border)"}`, background: on ? ACCENT : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      {on && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="text-t1" style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {shortDocName(doc.filename)}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div
          className="bg-surface"
          style={{
            border: "1.5px solid var(--border)",
            borderRadius: 16,
            boxShadow: isDark
              ? "0 12px 32px -20px rgba(0,0,0,.55)"
              : "0 12px 32px -20px rgba(15,23,42,.12)",
            overflow: "hidden",
          }}
        >
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
            className="text-t1"
            style={{
              width: "100%",
              minHeight: 52,
              maxHeight: 180,
              padding: "15px 16px 10px",
              resize: "none",
              outline: "none",
              border: "none",
              background: "transparent",
              lineHeight: 1.55,
              fontSize: 15,
              textAlign: "left",
            }}
          />
          <div className="flex items-center justify-between border-t border-t-edge-light" style={{ padding: "8px 10px", gap: 8 }}>
            <div className="flex items-center" style={{ gap: 6 }}>
              {documents.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSourcesOpen((v) => !v)}
                  iconLeft={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  }
                >
                  Sources · {activeSources}
                </Button>
              )}
              {onProactiveScan && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onProactiveScan}
                  iconLeft={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                  }
                >
                  Scan a document
                </Button>
              )}
            </div>
            <Button
              variant="primary"
              onClick={() => (isStreaming ? cancel() : submit())}
              disabled={!isStreaming && !draft.trim()}
              iconRight={
                !isStreaming ? (
                  <svg className="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                ) : undefined
              }
            >
              {isStreaming ? "Stop" : "Ask"}
            </Button>
          </div>
        </div>
      </div>
      <div className="text-t3" style={{ textAlign: "center", fontSize: 11, paddingTop: 8 }}>
        AI can make mistakes. Verify cited source documents.
      </div>
    </>
  );

  return (
    <div className="bg-appbg" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div className="dd-scroll" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "34px 24px 150px" }}>
          {messages.length === 0 ? (
            <InitialAssistantState
              docCount={documents.length}
              loading={false}
              isFund={deal.entity_type === "fund"}
              onPrompt={submit}
              onProactiveScan={onProactiveScan}
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
                />
              ))}
              {error && (
                <div style={{ color: "var(--danger)", fontSize: 12, paddingLeft: 44 }}>{error}</div>
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
          // A CSS function call, not a rendered element — the fade color
          // can't be a class, so the token stays a var() literal here.
          background: `linear-gradient(to top, var(--bg) 78%, ${isDark ? "rgba(15,15,15,0)" : "rgba(243,243,238,0)"})`,
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
  docCount,
  loading,
  isFund,
  onPrompt,
  onProactiveScan,
  composer,
}: {
  docCount: number;
  loading: boolean;
  isFund: boolean;
  onPrompt: (prompt: string) => void;
  onProactiveScan?: () => void;
  composer?: ReactNode;
}) {
  const scanTitle = isFund ? "Run Fund Brief" : "Run Proactive Scan";
  const cards = isFund ? FUND_CARDS : DEAL_CARDS;
  return (
    <div style={{ minHeight: "calc(100vh - 280px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 640, textAlign: "center" }}>
        <div className="font-mono-plex text-t3" style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: 16,
        }}>
          {docCount} document{docCount === 1 ? "" : "s"} · isolated deal room
        </div>
        <h1 className="text-t1" style={{ font: "var(--text-h2)", letterSpacing: "-0.022em", marginBottom: 10 }}>
          Begin your diligence
        </h1>
        <p className="text-t2" style={{ font: "var(--text-sm)", marginBottom: 24 }}>
          Ask anything — every answer is cited to the exact page across this deal&rsquo;s documents.
        </p>

        {composer && <div style={{ marginBottom: 26, textAlign: "left" }}>{composer}</div>}

        <div className="font-mono-plex text-t3" style={{
          fontSize: 10, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.16em",
          marginBottom: 12, textAlign: "center",
        }}>
          Try asking Vyntic to…
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, opacity: loading ? 0.55 : 1 }}>
          {cards.map((card) => (
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
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.transform = "none";
              }}
              className="bg-surface"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 7,
                textAlign: "left",
                padding: "14px 15px",
                borderRadius: 14,
                border: "1px solid var(--border)",
                cursor: loading ? "default" : "pointer",
                transition: "border-color .12s, transform .12s",
              }}
            >
              <span className="text-t1" style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3 }}>
                {card.title}
              </span>
              <span className="text-t2" style={{ fontSize: 12, lineHeight: 1.5 }}>
                {card.blurb}
              </span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                {card.chips.map((chip) => (
                  <span
                    key={chip}
                    className="text-t3 bg-surface-alt border border-edge"
                    style={{
                      fontSize: 10.5,
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

        {onProactiveScan && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
            <button
              type="button"
              onClick={onProactiveScan}
              disabled={loading}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = tint(ACCENT, 42))}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              className="flex items-center bg-surface text-t1"
              style={{
                gap: 8,
                padding: "9px 16px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? "default" : "pointer",
                transition: "border-color .12s",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 6h17M6.5 12h11M10 18h4" />
              </svg>
              {scanTitle}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatBubble({
  message,
  activeCitId,
  onCit,
  onOpenDocument,
}: {
  message: ChatMessage;
  activeCitId: string | null;
  onCit: (citation: Citation, id: string) => void;
  onOpenDocument: (citation: Citation) => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          {message.documents && message.documents.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
              {message.documents.map((doc) => (
                <span key={doc} className="text-t2 bg-surface border border-edge" style={{
                  fontSize: 10,
                  borderRadius: 99,
                  padding: "2px 7px",
                }}>
                  {shortDocName(doc)}
                </span>
              ))}
            </div>
          )}
          <div className="bg-surface-alt text-t1 border border-edge" style={{
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
        <div
          className="bg-surface"
          // An error status tints the border/text with the danger token, not
          // ddTheme, so the whole conditional stays inline together.
          style={{
            border: `1px solid ${message.status === "error" ? "var(--danger-tint-border)" : "var(--border)"}`,
            borderRadius: 12,
            padding: "14px 16px",
            color: message.status === "error" ? "var(--danger)" : "var(--text-1)",
            minHeight: 50,
          }}
        >
          {message.content ? (
            <AnswerText
              text={message.content}
              citations={message.citations || []}
              activeCitId={activeCitId}
              onCit={onCit}
            />
          ) : (
            <span className="text-t2" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span className="dd-spin border-edge" style={{ width: 13, height: 13, borderWidth: 2, borderStyle: "solid", borderTopColor: ACCENT, borderRadius: "50%" }} />
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
                  className="border border-edge bg-surface-alt text-t2"
                  style={{
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
