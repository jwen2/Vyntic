import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Deal,
  CreateDealPayload,
  listDeals,
  createDeal as apiCreateDeal,
  createManager as apiCreateManager,
  deleteDeal as apiDeleteDeal,
  uploadDocument as apiUploadDocument,
  uploadDocumentsBatch as apiUploadBatch,
  updateDeal as apiUpdateDeal,
  getUploadProgress,
  UploadProgress,
} from "@/lib/api";

function newUploadId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const [uploading, setUploading] = useState(false);
  const [uploadProgressByDeal, setUploadProgressByDeal] = useState<
    Record<string, UploadProgress>
  >({});

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

  const uploadDocs = useCallback(
    async (deal_id: string, files: File[]) => {
      setUploading(true);
      setMutationError(null);
      const uploadId = newUploadId();
      const label =
        files.length === 1 ? files[0].name : `${files.length} documents`;
      const setProgress = (progress: UploadProgress) => {
        setUploadProgressByDeal((prev) => ({ ...prev, [deal_id]: progress }));
      };
      const clearProgressSoon = () => {
        setTimeout(() => {
          setUploadProgressByDeal((prev) => {
            if (prev[deal_id]?.upload_id !== uploadId) return prev;
            const next = { ...prev };
            delete next[deal_id];
            return next;
          });
        }, 3000);
      };
      // Single source of post-upload progress: this 1s poll loop. The XHR
      // onUploadProgress callbacks below own the 0-10% upload phase; there is
      // deliberately no second interval poller racing it (it used to cause
      // progress flicker from two writers on uploadProgressByDeal).
      const waitForProcessing = async () => {
        const deadline = Date.now() + 2 * 60 * 60 * 1000;
        while (Date.now() < deadline) {
          try {
            const progress = await getUploadProgress(deal_id, uploadId);
            setProgress(progress);
            if (progress.status === "complete") return;
            if (progress.status === "error") {
              throw new Error(progress.detail || "Upload failed");
            }
          } catch (err) {
            if (err instanceof Error && !err.message.includes("Progress not found")) {
              throw err;
            }
          }
          await delay(1000);
        }
        throw new Error("Ingestion is still running after two hours");
      };
      try {
        setProgress({
          upload_id: uploadId,
          status: "uploading",
          stage: "Uploading files",
          percent: 0,
          filename: label,
        });
        if (files.length === 1) {
          await apiUploadDocument(deal_id, files[0], {
            uploadId,
            onUploadProgress: (percent) =>
              setProgress({
                upload_id: uploadId,
                status: "uploading",
                stage: percent >= 100 ? "Preparing backend processing" : "Uploading file",
                percent: Math.round(percent * 0.1),
                filename: files[0].name,
                detail:
                  percent >= 100
                    ? "The first parsing batch can take a few minutes."
                    : undefined,
              }),
          });
        } else {
          await apiUploadBatch(deal_id, files, {
            uploadId,
            onUploadProgress: (percent) =>
              setProgress({
                upload_id: uploadId,
                status: "uploading",
                stage: percent >= 100 ? "Preparing backend processing" : "Uploading files",
                percent: Math.round(percent * 0.1),
                filename: label,
                detail:
                  percent >= 100
                    ? "The first parsing batch can take a few minutes."
                    : undefined,
              }),
          });
        }
        await waitForProcessing();
        await invalidateDeals();
      } catch (err) {
        setMutationError(
          err instanceof Error ? err.message : "Failed to upload documents"
        );
        setProgress({
          upload_id: uploadId,
          status: "error",
          stage: "Upload failed",
          percent: 100,
          filename: label,
          detail: err instanceof Error ? err.message : "Failed to upload documents",
        });
      } finally {
        clearProgressSoon();
        setUploading(false);
      }
    },
    [invalidateDeals]
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
    error: mutationError ?? queryError,
    addDeal,
    removeDeal,
    uploadDocs,
    uploadProgressByDeal,
    editDeal,
    refresh,
  };
}
