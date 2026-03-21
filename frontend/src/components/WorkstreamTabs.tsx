"use client";
import { WorkstreamId } from "@/lib/queryTemplates";

interface Tab {
  id: WorkstreamId;
  name: string;
  icon: string;
  questionCount: number;
  completedCount: number;
}

interface Props {
  tabs: Tab[];
  activeTab: WorkstreamId;
  onTabChange: (tab: WorkstreamId) => void;
}

export default function WorkstreamTabs({ tabs, activeTab, onTabChange }: Props) {
  return (
    <div className="flex border-b border-gray-200 bg-white overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const progress =
          tab.completedCount > 0
            ? Math.round((tab.completedCount / tab.questionCount) * 100)
            : 0;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
              isActive
                ? "border-blue-600 text-blue-700 bg-blue-50/50"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="text-base">{tab.icon}</span>
            <span>{tab.name}</span>
            {tab.completedCount > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  progress === 100
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {tab.completedCount}/{tab.questionCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
