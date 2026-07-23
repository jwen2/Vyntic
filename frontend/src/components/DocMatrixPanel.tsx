import { useCallback, useMemo, useState } from "react";
import { DocumentMetadata, Citation } from "@/lib/api";
import DocumentViewer from "./DocumentViewer";
import ConfirmDialog from "./ConfirmDialog";
import { useDocMatrix } from "./docmatrix/useDocMatrix";
import DocMatrixToolbar from "./docmatrix/DocMatrixToolbar";
import DocMatrixTable from "./docmatrix/DocMatrixTable";

interface ViewerState {
  dealId: string;
  filename: string;
  page: number;
  snippet: string;
}

interface Props {
  documents: DocumentMetadata[];
  dealId: string;
  onViewDocument: (citation: Citation) => void;
  onDeleteDocument?: (doc: DocumentMetadata) => Promise<void> | void;
  activeCitationId?: string | null;
  onInspectCitation?: (citation: Citation, id: string) => void;
}

export default function DocMatrixPanel({
  documents,
  dealId,
  onViewDocument,
  onDeleteDocument,
  activeCitationId = null,
  onInspectCitation,
}: Props) {
  const matrix = useDocMatrix(dealId, documents);
  const { columns, cells, sortConfig } = matrix;

  // ── UI chrome (kept out of the hook) ──
  const [gridSearchOpen, setGridSearchOpen] = useState(false);
  const [gridSearch, setGridSearch] = useState("");
  const [viewerState, setViewerState] = useState<ViewerState | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<DocumentMetadata | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [deleteDocError, setDeleteDocError] = useState<string | null>(null);
  const [confirmDeleteCol, setConfirmDeleteCol] = useState<number | null>(null);

  const filteredDocuments = useMemo(() => {
    let result = documents;

    const search = gridSearch.trim().toLowerCase();
    if (search) {
      result = result.filter((doc) => {
        const docHaystack = [
          doc.filename,
          `${doc.page_count} pages`,
        ].join(" ").toLowerCase();
        if (docHaystack.includes(search)) return true;

        return columns.some((column) => {
          const cell = cells[doc.doc_id]?.[column.id];
          if (!cell) return false;
          const citationText = (cell.citations || [])
            .filter(Boolean)
            .map((citation) =>
              `${citation?.source_file || ""} ${citation?.page || ""} ${citation?.text_snippet || ""}`
            )
            .join(" ");
          return [
            cell.answer,
            citationText,
          ].join(" ").toLowerCase().includes(search);
        });
      });
    }

    // Apply sort
    if (sortConfig) {
      result = [...result].sort((a, b) => {
        const aVal = a.filename;
        const bVal = b.filename;
        return sortConfig.dir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
    }
    return result;
  }, [documents, gridSearch, sortConfig, columns, cells]);

  const handleDeleteDocument = async () => {
    if (!confirmDeleteDoc || !onDeleteDocument) return;
    setDeletingDocId(confirmDeleteDoc.doc_id);
    setDeleteDocError(null);
    try {
      await onDeleteDocument(confirmDeleteDoc);
      setConfirmDeleteDoc(null);
    } catch (err) {
      setDeleteDocError(err instanceof Error ? err.message : "Failed to delete document");
    } finally {
      setDeletingDocId(null);
    }
  };

  // Stable callbacks so memoized rows don't re-render on unrelated state changes.
  const handleCitationClick = useCallback(
    (citation: Citation, id: string) => {
      if (onInspectCitation) onInspectCitation(citation, id);
      else onViewDocument(citation);
    },
    [onInspectCitation, onViewDocument]
  );

  const handleOpenViewer = useCallback(
    (doc: DocumentMetadata) => {
      setViewerState({ dealId, filename: doc.filename, page: 1, snippet: "" });
    },
    [dealId]
  );

  const handleRequestDeleteDoc = useCallback((doc: DocumentMetadata) => {
    setDeleteDocError(null);
    setConfirmDeleteDoc(doc);
  }, []);

  const toggleGridSearch = useCallback(() => {
    setGridSearchOpen((open) => {
      if (open) setGridSearch("");
      return !open;
    });
  }, []);

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-t3">
        <svg
          className="w-12 h-12 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
        <p className="text-sm font-medium">No documents uploaded yet</p>
        <p className="text-xs mt-1">
          Upload documents to build the matrix.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <DocMatrixToolbar
        documentCount={documents.length}
        queryCount={matrix.queries.length}
        filteredCount={filteredDocuments.length}
        gridSearch={gridSearch}
        gridSearchOpen={gridSearchOpen}
        onSearchChange={setGridSearch}
        onToggleSearch={toggleGridSearch}
      />

      <DocMatrixTable
        columns={columns}
        documents={filteredDocuments}
        cells={cells}
        loading={matrix.loading}
        dealId={dealId}
        activeCitationId={activeCitationId}
        getColWidth={matrix.getColWidth}
        resizingKey={matrix.resizingKey}
        onColResize={matrix.startColResize}
        sortConfig={sortConfig}
        onSort={matrix.setSortConfig}
        onCitationClick={handleCitationClick}
        onRetry={matrix.retryCell}
        onSaveColumn={matrix.saveColumn}
        onRequestDeleteCol={setConfirmDeleteCol}
        onReorder={matrix.reorderQueries}
        onAddQuery={matrix.addQuery}
        onAddTemplate={matrix.addTemplateColumn}
        onOpenViewer={handleOpenViewer}
        onRequestDeleteDoc={onDeleteDocument ? handleRequestDeleteDoc : undefined}
        deletingDocId={deletingDocId}
        showDeleteDoc={!!onDeleteDocument}
      />

      {/* Document Viewer slide-over panel */}
      {viewerState && (
        <DocumentViewer
          dealId={viewerState.dealId}
          filename={viewerState.filename}
          page={viewerState.page}
          snippet={viewerState.snippet}
          onClose={() => setViewerState(null)}
        />
      )}

      {/* Confirm delete column dialog */}
      {confirmDeleteCol !== null && (
        <ConfirmDialog
          title="Delete Column"
          message={`Remove "${columns[confirmDeleteCol]?.label || "this column"}" and all its results? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            matrix.removeQuery(confirmDeleteCol);
            setConfirmDeleteCol(null);
          }}
          onCancel={() => setConfirmDeleteCol(null)}
        />
      )}

      {confirmDeleteDoc && (
        <ConfirmDialog
          title="Delete Document"
          message={
            deleteDocError ||
            `Remove "${confirmDeleteDoc.filename}"? This cannot be undone.`
          }
          confirmLabel={deletingDocId === confirmDeleteDoc.doc_id ? "Deleting..." : "Delete"}
          onConfirm={handleDeleteDocument}
          onCancel={() => {
            if (deletingDocId) return;
            setDeleteDocError(null);
            setConfirmDeleteDoc(null);
          }}
        />
      )}

      {/* Confirm prompt change — discards committed answers and re-runs */}
      {matrix.pendingColumnUpdate && (
        <ConfirmDialog
          title="Re-run with updated prompt?"
          message={`This will discard existing answers for "${matrix.pendingColumnUpdate.label}" and re-run the updated prompt against ${documents.length} document${documents.length !== 1 ? "s" : ""}.`}
          confirmLabel="Re-run"
          cancelLabel="Keep existing"
          onConfirm={matrix.confirmColumnUpdate}
          onCancel={matrix.cancelColumnUpdate}
        />
      )}
    </div>
  );
}
