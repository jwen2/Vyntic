import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Deal,
  CreateDealPayload,
  listDeals,
  createDeal as apiCreateDeal,
  createManager as apiCreateManager,
  deleteDeal as apiDeleteDeal,
  updateDeal as apiUpdateDeal,
} from "@/lib/api";
import { useDocumentUpload } from "@/hooks/useDocumentUpload";

/**
 * Deals server state, cached under ["deals"]. The return shape predates
 * TanStack Query and is kept intact for callers: mutations swallow their
 * errors into `error` (string) rather than throwing, and `loading` means
 * "a mutation or upload is in flight", not "the list is fetching".
 * Upload progress stays local useState — it's client state, not server state.
 */
export function useDeals() {
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const {
    uploadDocs,
    uploading,
    uploadProgressByDeal,
    error: uploadError,
  } = useDocumentUpload();

  const dealsQuery = useQuery({ queryKey: ["deals"], queryFn: listDeals });

  const invalidateDeals = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["deals"] }),
    [queryClient]
  );

  const addDealMutation = useMutation({
    mutationFn: async (payload: CreateDealPayload & { new_manager_name?: string }) => {
      const { new_manager_name, ...dealPayload } = payload;
      // "New manager" flow: create the GP firm first, then attach the fund.
      if (new_manager_name && payload.entity_type === "fund" && !payload.manager_id) {
        const managerId = new_manager_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
        const manager = await apiCreateManager(managerId, new_manager_name);
        dealPayload.manager_id = manager.manager_id;
      }
      await apiCreateDeal(dealPayload);
    },
    onSuccess: invalidateDeals,
  });

  const removeDealMutation = useMutation({
    mutationFn: (deal_id: string) => apiDeleteDeal(deal_id),
    onSuccess: invalidateDeals,
  });

  const editDealMutation = useMutation({
    mutationFn: ({
      deal_id,
      data,
    }: {
      deal_id: string;
      data: { name?: string; description?: string; stage?: string; tags?: string[] };
    }) => apiUpdateDeal(deal_id, data),
    onSuccess: invalidateDeals,
  });

  const addDeal = useCallback(
    async (payload: CreateDealPayload & { new_manager_name?: string }) => {
      setMutationError(null);
      try {
        await addDealMutation.mutateAsync(payload);
      } catch (err) {
        setMutationError(err instanceof Error ? err.message : "Failed to create deal");
      }
    },
    [addDealMutation]
  );

  const removeDeal = useCallback(
    async (deal_id: string) => {
      setMutationError(null);
      try {
        await removeDealMutation.mutateAsync(deal_id);
      } catch (err) {
        setMutationError(err instanceof Error ? err.message : "Failed to delete deal");
      }
    },
    [removeDealMutation]
  );

  const editDeal = useCallback(
    async (
      deal_id: string,
      data: { name?: string; description?: string; stage?: string; tags?: string[] }
    ) => {
      setMutationError(null);
      try {
        await editDealMutation.mutateAsync({ deal_id, data });
      } catch (err) {
        setMutationError(err instanceof Error ? err.message : "Failed to update deal");
      }
    },
    [editDealMutation]
  );

  const refresh = useCallback(() => invalidateDeals(), [invalidateDeals]);

  const deals: Deal[] = dealsQuery.data ?? [];
  const queryError = dealsQuery.error
    ? dealsQuery.error instanceof Error
      ? dealsQuery.error.message
      : "Failed to load deals"
    : null;

  return {
    deals,
    loading:
      uploading ||
      addDealMutation.isPending ||
      removeDealMutation.isPending ||
      editDealMutation.isPending,
    error: mutationError ?? uploadError ?? queryError,
    addDeal,
    removeDeal,
    uploadDocs,
    uploadProgressByDeal,
    editDeal,
    refresh,
  };
}
