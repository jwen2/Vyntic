"use client";
import { useState, useCallback } from "react";
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

  const setDeals = useCallback((deals: string[]) => {
    setState((s) => ({ ...s, deals }));
  }, []);

  const addQuery = useCallback(
    async (query: string) => {
      if (!query.trim() || state.deals.length === 0) return;

      const newQueries = [...state.queries, query];

      // Set loading state for new column
      setState((s) => {
        const updatedCells = { ...s.cells };
        for (const dealId of s.deals) {
          if (!updatedCells[dealId]) updatedCells[dealId] = {};
          updatedCells[dealId][query] = {
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

      try {
        const result = await matrixCompare(state.deals, [query]);

        setState((s) => {
          const updatedCells = { ...s.cells };
          for (const dealId of s.deals) {
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

  return { ...state, setDeals, addQuery, runAllQueries };
}
