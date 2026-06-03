"use client";
import { useState, useRef } from "react";
import { Deal } from "@/lib/api";

interface Props {
  deals: Deal[];
  onUpload: (deal_id: string, file: File) => void;
  uploading: boolean;
}

export default function UploadPanel({ deals, onUpload, uploading }: Props) {
  const [selectedDeal, setSelectedDeal] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedDeal) {
      onUpload(selectedDeal, file);
      e.target.value = "";
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">
        Upload Documents
      </h3>
      <div className="space-y-3">
        <select
          value={selectedDeal}
          onChange={(e) => setSelectedDeal(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">Select a deal...</option>
          {deals.map((d) => (
            <option key={d.deal_id} value={d.deal_id}>
              {d.name} ({d.document_count} docs)
            </option>
          ))}
        </select>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.xlsx,.xls"
          onChange={handleFileChange}
          disabled={!selectedDeal || uploading}
          className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
        />
        {uploading && (
          <div className="text-xs text-blue-600 animate-pulse">
            Parsing and indexing document...
          </div>
        )}
      </div>
    </div>
  );
}
