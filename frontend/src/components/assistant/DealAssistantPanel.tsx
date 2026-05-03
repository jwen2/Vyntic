"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Citation, Deal, DocumentMetadata } from "@/lib/api";
import {
  listConversations,
  saveConversation,
  singleQuestionStream,
} from "@/lib/api";
import AnswerText from "@/components/dd/AnswerText";
import { useTheme } from "@/components/ThemeProvider";
import { ACCENT, ddTheme } from "@/components/dd/types";

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
  "Summarize the investment thesis and the three biggest diligence questions.",
  "Find the strongest evidence for and against revenue quality.",
  "What could break this deal or materially change valuation?",
  "Compare management claims against the underlying support in the documents.",
  "Draft an IC-style diligence memo with cited bullets.",
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
  activeCitId,
  onCit,
  onOpenDocument,
}: {
  deal: Deal;
  documents: DocumentMetadata[];
  activeCitId: string | null;
  onCit: (citation: Citation, id: string) => void;
  onOpenDocument: (citation: Citation) => void;
}) {
  const { theme } = useTheme();
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const selectedDocs = useMemo(
    () => documents.filter((doc) => selectedDocIds.includes(doc.doc_id)),
    [documents, selectedDocIds]
  );

  useEffect(() => {
    setMessages([]);
    setDraft("");
    setSelectedDocIds([]);
    setHistoryLoaded(false);
    setError(null);
  }, [deal.deal_id]);

  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    listConversations(deal.deal_id, "assistant")
      .then((items) => {
        if (cancelled) return;
        const loaded = items.flatMap<ChatMessage>((item) => [
          {
            id: `${item.id}_user`,
            role: "user",
            content: item.question,
            status: "complete",
          },
          {
            id: `${item.id}_assistant`,
            role: "assistant",
            content: item.answer,
            citations: item.citations,
            status: "complete",
          },
        ]);
        setMessages(loaded);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoaded(true);
          setLoadingHistory(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [deal.deal_id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isStreaming]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [historyLoaded]);

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
      "assistant",
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
          }).catch(() => undefined);
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
  }, [deal.deal_id, draft, isStreaming, resizeTextarea, selectedDocs]);

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

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: c.bg }}>
      <div className="dd-scroll" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "34px 24px 150px" }}>
          {messages.length === 0 ? (
            <InitialAssistantState
              dealName={deal.name}
              docCount={documents.length}
              loading={loadingHistory}
              prompts={ASSISTANT_PROMPTS}
              onPrompt={submit}
              theme={theme}
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

      <div style={{
        flexShrink: 0,
        padding: "0 24px 18px",
        background: `linear-gradient(to top, ${c.bg} 78%, ${isDark ? "rgba(15,23,42,0)" : "rgba(255,255,255,0)"})`,
      }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
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
                      border: `1px solid ${selected ? `${ACCENT}88` : c.border}`,
                      background: selected ? (isDark ? "#1e3a8a55" : "#eff6ff") : c.surface,
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
              placeholder="Ask about the deal room..."
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
                  color: isStreaming || draft.trim() ? "white" : c.t3,
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
        </div>
      </div>
    </div>
  );
}

function InitialAssistantState({
  dealName,
  docCount,
  loading,
  prompts,
  onPrompt,
  theme,
}: {
  dealName: string;
  docCount: number;
  loading: boolean;
  prompts: string[];
  onPrompt: (prompt: string) => void;
  theme: "light" | "dark";
}) {
  const c = ddTheme(theme);
  return (
    <div style={{ minHeight: "calc(100vh - 280px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 640, textAlign: "center" }}>
        <div style={{
          width: 38,
          height: 38,
          margin: "0 auto 18px",
          borderRadius: 10,
          background: ACCENT,
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 15,
        }}>
          V
        </div>
        <h1 style={{ fontSize: 25, lineHeight: 1.2, fontWeight: 700, color: c.t1, marginBottom: 7 }}>
          Ask Vyntic about {dealName}
        </h1>
        <p style={{ fontSize: 13, color: c.t2, lineHeight: 1.6, marginBottom: 24 }}>
          Chat across {docCount} document{docCount === 1 ? "" : "s"} with cited answers.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, opacity: loading ? 0.55 : 1 }}>
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={loading}
              onClick={() => onPrompt(prompt)}
              style={{
                textAlign: "left",
                padding: "12px 13px",
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: c.surface,
                color: c.t1,
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 1.45,
                cursor: loading ? "default" : "pointer",
              }}
            >
              {prompt}
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
  const isDark = theme === "dark";

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
            background: isDark ? "#1e293b" : "#f1f5f9",
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
        color: "white",
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
