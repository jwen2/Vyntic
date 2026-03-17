"use client";
import { useState, useCallback, useEffect } from "react";
import { matrixCompare, CellData } from "@/lib/api";

export interface MatrixState {
  deals: string[];
  queries: string[];
  cells: Record<string, Record<string, CellData>>;
  loading: boolean;
  error: string | null;
}

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

  // Keep selectedDeals in sync when deals change — select all by default
  useEffect(() => {
    setSelectedDeals(new Set(state.deals));
    setLastClickedDeal(null);
  }, [state.deals]);

  const setDeals = useCallback((deals: string[]) => {
    setState((s) => ({ ...s, deals }));
  }, []);

  // Excel-style row selection: click, ctrl+click, shift+click
  const selectDeal = useCallback(
    (dealId: string, opts: { ctrl?: boolean; shift?: boolean } = {}) => {
      setSelectedDeals((prev) => {
        if (opts.shift && lastClickedDeal) {
          // Range select from lastClicked to dealId
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
          // Toggle individual
          const next = new Set(prev);
          if (next.has(dealId)) {
            next.delete(dealId);
          } else {
            next.add(dealId);
          }
          return next;
        }

        // Plain click: select only this one
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

  const addQuery = useCallback(
    async (query: string, targetDealIds?: string[]) => {
      if (!query.trim() || state.deals.length === 0) return;

      const dealsToQuery = targetDealIds ?? state.deals;
      const newQueries = [...state.queries, query];

      // Set loading state for targeted deals, "Not queried" for others
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

      try {
        const result = await matrixCompare(dealsToQuery, [query]);

        setState((s) => {
          const updatedCells = { ...s.cells };
          for (const dealId of dealsToQuery) {
            if (!updatedCells[dealId]) updatedCells[dealId] = {};
            updatedCells[dealId][query] = result.cells[dealId]?.[query] || {
              answer: "No data",
              citations: [],
              status: "error",
            };
          }
          return { ...s, cells: updatedCells, loading: false };
        });
      } catch (err) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Query failed",
        }));
      }
    },
    [state.deals, state.queries]
  );

  const runAllQueries = useCallback(
    async (dealIds: string[], queries: string[]) => {
      if (dealIds.length === 0 || queries.length === 0) return;

      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const result = await matrixCompare(dealIds, queries);
        setState((s) => ({
          ...s,
          deals: dealIds,
          queries,
          cells: result.cells,
          loading: false,
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Query failed",
        }));
      }
    },
    []
  );

  return {
    ...state,
    setDeals,
    addQuery,
    runAllQueries,
    selectedDeals,
    selectDeal,
    selectAllDeals,
    deselectAllDeals,
  };
}
