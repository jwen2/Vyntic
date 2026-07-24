import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getUploadProgress,
  uploadDocument,
  uploadDocumentsBatch,
  type UploadProgress,
} from "@/lib/api";

function newUploadId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Shared document-ingestion lifecycle for every upload entry point.
 * Progress remains client state; completed uploads refresh all deal/document
 * queries so the rest of the workspace sees the new files immediately.
 */
export function useDocumentUpload() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgressByDeal, setUploadProgressByDeal] = useState<
    Record<string, UploadProgress>
  >({});
  const clearTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(
    () => () => {
      clearTimers.current.forEach((timer) => clearTimeout(timer));
      clearTimers.current.clear();
    },
    [],
  );

  const uploadDocs = useCallback(
    async (dealId: string, files: File[]): Promise<boolean> => {
      if (files.length === 0) return false;

      setUploading(true);
      setError(null);
      const uploadId = newUploadId();
      const label =
        files.length === 1 ? files[0].name : `${files.length} documents`;
      const setProgress = (progress: UploadProgress) => {
        setUploadProgressByDeal((prev) => ({ ...prev, [dealId]: progress }));
      };
      const clearProgressSoon = () => {
        const existingTimer = clearTimers.current.get(dealId);
        if (existingTimer) clearTimeout(existingTimer);
        const timer = setTimeout(() => {
          setUploadProgressByDeal((prev) => {
            if (prev[dealId]?.upload_id !== uploadId) return prev;
            const next = { ...prev };
            delete next[dealId];
            return next;
          });
          clearTimers.current.delete(dealId);
        }, 3000);
        clearTimers.current.set(dealId, timer);
      };

      const waitForProcessing = async () => {
        const deadline = Date.now() + 2 * 60 * 60 * 1000;
        while (Date.now() < deadline) {
          try {
            const progress = await getUploadProgress(dealId, uploadId);
            setProgress(progress);
            if (progress.status === "complete") return;
            if (progress.status === "error") {
              throw new Error(progress.detail || "Upload failed");
            }
          } catch (uploadError) {
            if (
              uploadError instanceof Error &&
              !uploadError.message.includes("Progress not found")
            ) {
              throw uploadError;
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

        const onUploadProgress = (percent: number) =>
          setProgress({
            upload_id: uploadId,
            status: "uploading",
            stage:
              percent >= 100
                ? "Preparing backend processing"
                : files.length === 1
                  ? "Uploading file"
                  : "Uploading files",
            percent: Math.round(percent * 0.1),
            filename: label,
            detail:
              percent >= 100
                ? "The first parsing batch can take a few minutes."
                : undefined,
          });

        if (files.length === 1) {
          await uploadDocument(dealId, files[0], { uploadId, onUploadProgress });
        } else {
          await uploadDocumentsBatch(dealId, files, {
            uploadId,
            onUploadProgress,
          });
        }

        await waitForProcessing();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["deals"] }),
          queryClient.invalidateQueries({
            queryKey: ["deal", dealId],
            exact: true,
          }),
          queryClient.invalidateQueries({
            queryKey: ["deal", dealId, "documents"],
            exact: true,
          }),
        ]);
        return true;
      } catch (uploadError) {
        const message =
          uploadError instanceof Error
            ? uploadError.message
            : "Failed to upload documents";
        setError(message);
        setProgress({
          upload_id: uploadId,
          status: "error",
          stage: "Upload failed",
          percent: 100,
          filename: label,
          detail: message,
        });
        return false;
      } finally {
        clearProgressSoon();
        setUploading(false);
      }
    },
    [queryClient],
  );

  return { uploadDocs, uploading, uploadProgressByDeal, error };
}
