import { useState, useCallback, useEffect } from "react";
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

export function useDeals() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgressByDeal, setUploadProgressByDeal] = useState<
    Record<string, UploadProgress>
  >({});

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
    async (payload: CreateDealPayload & { new_manager_name?: string }) => {
      setLoading(true);
      setError(null);
      try {
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
      const uploadId = newUploadId();
      let pollTimer: ReturnType<typeof setInterval> | undefined;
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
          stage: "Uploading file",
          percent: 0,
          filename: file.name,
        });
        pollTimer = setInterval(async () => {
          try {
            setProgress(await getUploadProgress(deal_id, uploadId));
          } catch {}
        }, 1000);
        await apiUploadDocument(deal_id, file, {
          uploadId,
          onUploadProgress: (percent) =>
            setProgress({
              upload_id: uploadId,
              status: "uploading",
              stage: percent >= 100 ? "Preparing backend processing" : "Uploading file",
              percent: Math.round(percent * 0.1),
              filename: file.name,
              detail:
                percent >= 100
                  ? "The first parsing batch can take a few minutes."
                  : undefined,
            }),
        });
        await waitForProcessing();
        await refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to upload document"
        );
        setProgress({
          upload_id: uploadId,
          status: "error",
          stage: "Upload failed",
          percent: 100,
          filename: file.name,
          detail: err instanceof Error ? err.message : "Failed to upload document",
        });
      } finally {
        if (pollTimer) clearInterval(pollTimer);
        clearProgressSoon();
        setLoading(false);
      }
    },
    [refresh]
  );

  const uploadDocs = useCallback(
    async (deal_id: string, files: File[]) => {
      setLoading(true);
      setError(null);
      const uploadId = newUploadId();
      const label =
        files.length === 1 ? files[0].name : `${files.length} documents`;
      let pollTimer: ReturnType<typeof setInterval> | undefined;
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
        pollTimer = setInterval(async () => {
          try {
            setProgress(await getUploadProgress(deal_id, uploadId));
          } catch {}
        }, 1000);
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
        await refresh();
      } catch (err) {
        setError(
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
        if (pollTimer) clearInterval(pollTimer);
        clearProgressSoon();
        setLoading(false);
      }
    },
    [refresh]
  );

  const editDeal = useCallback(
    async (
      deal_id: string,
      data: { name?: string; description?: string; stage?: string; tags?: string[] }
    ) => {
      setError(null);
      try {
        await apiUpdateDeal(deal_id, data);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update deal");
      }
    },
    [refresh]
  );

  return {
    deals,
    loading,
    error,
    addDeal,
    removeDeal,
    uploadDoc,
    uploadDocs,
    uploadProgressByDeal,
    editDeal,
    refresh,
  };
}
