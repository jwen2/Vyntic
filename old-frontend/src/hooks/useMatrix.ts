"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  matrixCompareStream,
  StreamEvent,
  CellData,
  SYNTHESIS_DEAL_ID,
} from "@/lib/api";

export interface MatrixState {
  deals: string[];
  queries: string[];
  cells: Record<string, Record<string, CellData>>;
  loading: boolean;
  error: string | null;
}

const MATRIX_CACHE_KEY = "vyntic_matrix_cache";

export function useMatrix() {
  const [state, setState] = useState<MatrixState>({
    deals: [],
    queries: [],
    cells: {},
    loading: false,
    error: null,
  });
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set());
  const [lastClickedDeal, setLastClickedDeal] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep ref of latest state to auto-save on unmount
  const latestState = useRef(state);
  useEffect(() => {
    latestState.current = state;
  }, [state]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(MATRIX_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setState((s) => ({
          ...s,
          queries: parsed.queries || [],
          cells: parsed.cells || {},
        }));
      }
    } catch {}
    
    // Save on exact unmount (navigation)
    return () => {
      const s = latestState.current;
      if (s.queries.length === 0) return;
      try {
        const persistableCells: Record<string, Record<string, CellData>> = {};
        for (const [dealId, dealCells] of Object.entries(s.cells)) {
          persistableCells[dealId] = {};
          for (const [query, cell] of Object.entries(dealCells)) {
            if (cell.status === "complete" || cell.status === "error") {
              persistableCells[dealId][query] = cell;
            }
          }
        }
        localStorage.setItem(
          MATRIX_CACHE_KEY,
          JSON.stringify({ queries: s.queries, cells: persistableCells })
        );
      } catch {}
    };
  }, []);

  // Save to localStorage whenever queries or cells change (debounced for streaming performance)
  useEffect(() => {
    if (state.queries.length === 0) return;

    const timeoutId = setTimeout(() => {
      try {
        const persistableCells: Record<string, Record<string, CellData>> = {};
        for (const [dealId, dealCells] of Object.entries(state.cells)) {
          persistableCells[dealId] = {};
          for (const [query, cell] of Object.entries(dealCells)) {
            if (cell.status === "complete" || cell.status === "error") {
              persistableCells[dealId][query] = cell;
            }
          }
        }
        localStorage.setItem(
          MATRIX_CACHE_KEY,
          JSON.stringify({ queries: state.queries, cells: persistableCells })
        );
      } catch {}
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [state.queries, state.cells]);

  // Keep selectedDeals in sync when deals change — select all by default
  useEffect(() => {
    setSelectedDeals(new Set(state.deals));
    setLastClickedDeal(null);
  }, [state.deals]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const setDeals = useCallback((deals: string[]) => {
    setState((s) => ({ ...s, deals }));
  }, []);

  // Excel-style row selection: click, ctrl+click, shift+click
  const selectDeal = useCallback(
    (dealId: string, opts: { ctrl?: boolean; shift?: boolean } = {}) => {
      setSelectedDeals((prev) => {
        if (opts.shift && lastClickedDeal) {
          const startIdx = state.deals.indexOf(lastClickedDeal);
          const endIdx = state.deals.indexOf(dealId);
          if (startIdx !== -1 && endIdx !== -1) {
            const lo = Math.min(startIdx, endIdx);
            const hi = Math.max(startIdx, endIdx);
            const next = new Set(prev);
            for (let i = lo; i <= hi; i++) {
              next.add(state.deals[i]);
            }
            return next;
          }
        }

        if (opts.ctrl) {
          const next = new Set(prev);
          if (next.has(dealId)) {
            next.delete(dealId);
          } else {
            next.add(dealId);
          }
          return next;
        }

        return new Set([dealId]);
      });
      setLastClickedDeal(dealId);
    },
    [lastClickedDeal, state.deals]
  );

  const selectAllDeals = useCallback(() => {
    setState((s) => {
      setSelectedDeals(new Set(s.deals));
      return s;
    });
  }, []);

  const deselectAllDeals = useCallback(() => {
    setSelectedDeals(new Set());
  }, []);

  /** Handle a single streaming event — shared by addQuery and runAllQueries */
  const handleStreamEvent = useCallback((event: StreamEvent) => {
    if (event.type === "token") {
      setState((s) => {
        const updatedCells = { ...s.cells };
        const dealCells = { ...updatedCells[event.deal_id] };
        const cell = dealCells[event.query] || {
          answer: "",
          citations: [],
          status: "loading",
        };
        dealCells[event.query] = {
          ...cell,
          answer: cell.answer + event.token,
          status: "loading",
        };
        updatedCells[event.deal_id] = dealCells;
        return { ...s, cells: updatedCells };
      });
    } else if (event.type === "done") {
      setState((s) => {
        const updatedCells = { ...s.cells };
        const dealCells = { ...updatedCells[event.deal_id] };
        dealCells[event.query] = {
          answer: event.answer,
          citations: event.citations,
          status: "complete",
          model: event.model,
          fallback: event.fallback,
          duration_ms: event.duration_ms,
        };
        updatedCells[event.deal_id] = dealCells;
        return { ...s, cells: updatedCells };
      });
    } else if (event.type === "error") {
      setState((s) => {
        const updatedCells = { ...s.cells };
        const dealCells = { ...updatedCells[event.deal_id] };
        dealCells[event.query] = {
          answer: `Error: ${event.error}`,
          citations: [],
          status: "error",
        };
        updatedCells[event.deal_id] = dealCells;
        return { ...s, cells: updatedCells };
      });
    }
  }, []);

  const addQuery = useCallback(
    (query: string, targetDealIds?: string[]) => {
      if (!query.trim() || state.deals.length === 0) return;

      abortRef.current?.abort();

      const dealsToQuery = targetDealIds ?? state.deals;
      const newQueries = [...state.queries, query];

      // Set loading/streaming state for targeted deals + synthesis row
      setState((s) => {
        const updatedCells = { ...s.cells };
        for (const dealId of s.deals) {
          if (!updatedCells[dealId]) updatedCells[dealId] = {};
          if (dealsToQuery.includes(dealId)) {
            updatedCells[dealId][query] = {
              answer: "",
              citations: [],
              status: "loading",
            };
          } else {
            updatedCells[dealId][query] = {
              answer: "Not queried",
              citations: [],
              status: "complete",
            };
          }
        }
        // Initialize synthesis row if comparing multiple deals
        if (dealsToQuery.length > 1) {
          if (!updatedCells[SYNTHESIS_DEAL_ID]) updatedCells[SYNTHESIS_DEAL_ID] = {};
          updatedCells[SYNTHESIS_DEAL_ID][query] = {
            answer: "",
            citations: [],
            status: "loading",
          };
        }
        return {
          ...s,
          queries: newQueries,
          cells: updatedCells,
          loading: true,
          error: null,
        };
      });

      if (dealsToQuery.length === 0) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }

      const controller = matrixCompareStream(
        dealsToQuery,
        [query],
        handleStreamEvent,
        () => setState((s) => ({ ...s, loading: false })),
        (err) =>
          setState((s) => ({
            ...s,
            loading: false,
            error: err.message || "Streaming failed",
          }))
      );

      abortRef.current = controller;
    },
    [state.deals, state.queries, handleStreamEvent]
  );

  const removeQuery = useCallback((index: number) => {
    setState((s) => {
      const query = s.queries[index];
      if (!query) return s;
      const newQueries = s.queries.filter((_, i) => i !== index);
      const newCells = { ...s.cells };
      for (const dealId of Object.keys(newCells)) {
        const dealCells = { ...newCells[dealId] };
        delete dealCells[query];
        newCells[dealId] = dealCells;
      }
      return { ...s, queries: newQueries, cells: newCells };
    });
  }, []);

  const renameQuery = useCallback((index: number, newName: string) => {
    setState((s) => {
      const oldQuery = s.queries[index];
      if (!oldQuery || !newName.trim() || oldQuery === newName) return s;
      if (s.queries.includes(newName)) return s; // no duplicates
      const newQueries = [...s.queries];
      newQueries[index] = newName;
      const newCells = { ...s.cells };
      for (const dealId of Object.keys(newCells)) {
        const dealCells = { ...newCells[dealId] };
        if (dealCells[oldQuery]) {
          dealCells[newName] = dealCells[oldQuery];
          delete dealCells[oldQuery];
        }
        newCells[dealId] = dealCells;
      }
      return { ...s, queries: newQueries, cells: newCells };
    });
  }, []);

  const reorderQueries = useCallback((fromIndex: number, toIndex: number) => {
    setState((s) => {
      if (fromIndex === toIndex) return s;
      const newQueries = [...s.queries];
      const [moved] = newQueries.splice(fromIndex, 1);
      newQueries.splice(toIndex, 0, moved);
      return { ...s, queries: newQueries };
    });
  }, []);

  const runAllQueries = useCallback(
    (dealIds: string[], queries: string[]) => {
      if (dealIds.length === 0 || queries.length === 0) return;

      abortRef.current?.abort();

      setState((s) => {
        const updatedCells: Record<string, Record<string, CellData>> = {};
        for (const dealId of dealIds) {
          updatedCells[dealId] = {};
          for (const query of queries) {
            updatedCells[dealId][query] = {
              answer: "",
              citations: [],
              status: "loading",
            };
          }
        }
        // Initialize synthesis row if comparing multiple deals
        if (dealIds.length > 1) {
          updatedCells[SYNTHESIS_DEAL_ID] = {};
          for (const query of queries) {
            updatedCells[SYNTHESIS_DEAL_ID][query] = {
              answer: "",
              citations: [],
              status: "loading",
            };
          }
        }
        return {
          ...s,
          deals: dealIds,
          queries,
          cells: updatedCells,
          loading: true,
          error: null,
        };
      });

      const controller = matrixCompareStream(
        dealIds,
        queries,
        handleStreamEvent,
        () => setState((s) => ({ ...s, loading: false })),
        (err) =>
          setState((s) => ({
            ...s,
            loading: false,
            error: err.message || "Streaming failed",
          }))
      );

      abortRef.current = controller;
    },
    [handleStreamEvent]
  );

  return {
    ...state,
    setDeals,
    addQuery,
    removeQuery,
    renameQuery,
    reorderQueries,
    runAllQueries,
    selectedDeals,
    selectDeal,
    selectAllDeals,
    deselectAllDeals,
  };
}
