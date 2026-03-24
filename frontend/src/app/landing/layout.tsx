import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vyntic — AI-Powered Deal Intelligence for Private Equity",
  description:
    "Upload your CIMs, financials, and data rooms. Vyntic's AI analyzes every deal side-by-side so your IC gets answers faster.",
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white text-gray-900 min-h-screen">{children}</div>
  );
}
