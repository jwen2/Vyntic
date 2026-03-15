import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpokeMatrix — PE Deal Comparison",
  description: "Multi-tenant RAG for PE deal comparison in a matrix format",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">{children}</body>
    </html>
  );
}
