"use client";
import { CellData } from "@/lib/api";
import CitationPopover from "./CitationPopover";

interface Props {
  cell: CellData | undefined;
}

export default function MatrixCell({ cell }: Props) {
  if (!cell) {
    return <td className="p-3 text-gray-400 text-sm border border-gray-200">—</td>;
  }

  if (cell.status === "loading") {
    return (
      <td className="p-3 border border-gray-200">
        <div className="animate-pulse space-y-2">
          <div className="h-3 bg-gray-200 rounded w-3/4"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      </td>
    );
  }

  if (cell.status === "error") {
    return (
      <td className="p-3 border border-gray-200 bg-red-50 text-red-700 text-sm">
        {cell.answer}
      </td>
    );
  }

  return (
    <td className="p-3 border border-gray-200 text-sm max-w-xs">
      <CitationPopover citations={cell.citations}>
        <div className="line-clamp-4 text-gray-800 hover:text-blue-700 transition-colors">
          {cell.answer}
        </div>
        {cell.citations.length > 0 && (
          <div className="mt-1 text-xs text-blue-500">
            {cell.citations.length} source{cell.citations.length > 1 ? "s" : ""}
          </div>
        )}
      </CitationPopover>
    </td>
  );
}
