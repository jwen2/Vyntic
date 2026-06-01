"use client";

import { useState } from "react";
import Link from "next/link";

const NAV_LINKS = [
  {
    label: "Product",
    href: "#product",
    children: [
      { label: "Comparison Matrix", href: "#product" },
      { label: "Document Analysis", href: "#product" },
      { label: "Source Verification", href: "#product" },
      { label: "Synthesis Engine", href: "#product" },
    ],
  },
  {
    label: "Solutions",
    href: "#solutions",
    children: [
      { label: "Deal Screening", href: "#solutions" },
      { label: "Due Diligence", href: "#solutions" },
      { label: "IC Preparation", href: "#solutions" },
      { label: "Portfolio Monitoring", href: "#solutions" },
    ],
  },
  { label: "Customers", href: "#customers" },
  {
    label: "Resources",
    href: "#resources",
    children: [
      { label: "Blog", href: "#" },
      { label: "Documentation", href: "#" },
      { label: "API Reference", href: "#" },
      { label: "Changelog", href: "#" },
    ],
  },
  { label: "Pricing", href: "#pricing" },
];

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="10"
      height="6"
      viewBox="0 0 10 6"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1 1L5 5L9 1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LandingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0A0F1E]/95 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">V</span>
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">
            Vyntic
          </span>
        </a>

        {/* Desktop nav links */}
        <div className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <div
              key={link.label}
              className="relative"
              onMouseEnter={() =>
                link.children ? setOpenDropdown(link.label) : undefined
              }
              onMouseLeave={() => setOpenDropdown(null)}
            >
              <a
                href={link.href}
                className="px-3.5 py-2 text-sm text-gray-300 hover:text-white transition-colors flex items-center gap-1"
              >
                {link.label}
                {link.children && (
                  <ChevronDown className="opacity-50 mt-0.5" />
                )}
              </a>

              {/* Dropdown */}
              {link.children && openDropdown === link.label && (
                <div className="absolute top-full left-0 pt-2">
                  <div className="bg-[#141927] border border-white/10 rounded-xl shadow-2xl py-2 min-w-[200px]">
                    {link.children.map((child) => (
                      <a
                        key={child.label}
                        href={child.href}
                        className="block px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        {child.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right side CTAs */}
        <div className="hidden lg:flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-gray-300 hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <a
            href="#hero"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            See a demo
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="lg:hidden text-white p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-[#0A0F1E] border-t border-white/5 px-6 py-4 space-y-1">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="block py-2.5 text-gray-300 hover:text-white transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <div className="pt-4 border-t border-white/10 space-y-3">
            <Link
              href="/login"
              className="block text-gray-300 hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <a
              href="#hero"
              className="block w-full text-center px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg"
              onClick={() => setMobileOpen(false)}
            >
              See a demo
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
