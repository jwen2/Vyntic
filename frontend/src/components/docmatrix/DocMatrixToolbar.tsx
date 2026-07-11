// The doc-matrix's top bar: a document/query/match count line and the
// grid-search toggle + input. Grid search is controlled by the panel because
// the filtered document list derives from it.
export default function DocMatrixToolbar({
  documentCount,
  queryCount,
  filteredCount,
  gridSearch,
  gridSearchOpen,
  onSearchChange,
  onToggleSearch,
}: {
  documentCount: number;
  queryCount: number;
  filteredCount: number;
  gridSearch: string;
  gridSearchOpen: boolean;
  onSearchChange: (value: string) => void;
  onToggleSearch: () => void;
}) {
  return (
    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500 px-1">
      <span>
        {documentCount} document{documentCount !== 1 ? "s" : ""} &middot;{" "}
        {queryCount} quer{queryCount !== 1 ? "ies" : "y"}
        {gridSearch.trim() && (
          <>
            {" "}&middot; {filteredCount} match{filteredCount !== 1 ? "es" : ""}
          </>
        )}
      </span>
      <div className="flex items-center gap-2">
        {gridSearchOpen && (
          <div className="relative">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={gridSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter grid..."
              className="w-56 pl-7 pr-7 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
              autoFocus
            />
            {gridSearch && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-500 hover:text-gray-600 dark:hover:text-gray-200"
                title="Clear search"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={onToggleSearch}
          className={`h-7 w-7 inline-flex items-center justify-center rounded-md border transition-colors ${
            gridSearchOpen || gridSearch.trim()
              ? "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-400"
              : "border-gray-300 bg-white text-gray-500 hover:text-blue-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:text-blue-400"
          }`}
          title={gridSearchOpen ? "Close grid filter" : "Search and filter grid"}
          aria-label={gridSearchOpen ? "Close grid filter" : "Search and filter grid"}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
