"use client";
import { useState, useCallback, useEffect } from "react";
import {
  Deal,
  listDeals,
  createDeal as apiCreateDeal,
  deleteDeal as apiDeleteDeal,
  uploadDocument as apiUploadDocument,
} from "@/lib/api";

export function useDeals() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listDeals();
      setDeals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deals");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addDeal = useCallback(
    async (deal_id: string, name: string, description: string = "") => {
      setLoading(true);
      setError(null);
      try {
        await apiCreateDeal(deal_id, name, description);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create deal");
      } finally {
        setLoading(false);
      }
    },
    [refresh]
  );

  const removeDeal = useCallback(
    async (deal_id: string) => {
      setLoading(true);
      try {
        await apiDeleteDeal(deal_id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete deal");
      } finally {
        setLoading(false);
      }
    },
    [refresh]
  );

  const uploadDoc = useCallback(
    async (deal_id: string, file: File) => {
      setLoading(true);
      setError(null);
      try {
        await apiUploadDocument(deal_id, file);
        await refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to upload document"
        );
      } finally {
        setLoading(false);
      }
    },
    [refresh]
  );

  return { deals, loading, error, addDeal, removeDeal, uploadDoc, refresh };
}
