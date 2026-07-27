import typography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // SPIKE: oxblood ramp replacing the cobalt scale. This one declarative
        // file is what carries the ~140 raw `blue-*` utility sites through a
        // reskin without touching a single component — the same trick the
        // cobalt spec used. Everything NOT routed through here (raw hex,
        // slate/amber literals, the categorical badge palettes) is what the
        // screenshots expose as genuinely untokenized.
        blue: {
          50: "#fdf6f4",
          100: "#f2e5e1",
          200: "#e4c9c1",
          300: "#d0a294",
          400: "#c47a5f",
          500: "#a3402f",
          600: "#a3402f",
          700: "#8a3223",
          800: "#8a3223",
          900: "#6d2718",
          950: "#4a1a10",
        },
        // Semantic theming tokens → the CSS vars in index.css (FE11). Usable as
        // bg-surface / text-t1 / border-edge / bg-zebra etc.; theme-aware via
        // the .dark class flipping the vars.
        surface: "var(--surface)",
        "surface-alt": "var(--surface-alt)",
        appbg: "var(--bg)",
        edge: "var(--border)",
        "edge-light": "var(--border-light)",
        t1: "var(--text-1)",
        t2: "var(--text-2)",
        t3: "var(--text-3)",
        t4: "var(--text-4)",
        focus: "var(--focus)",
        zebra: "var(--zebra)",
        "grid-header": "var(--grid-header)",
        accent: "var(--accent)",
        "accent-strong": "var(--accent-strong)",
        "accent-tint": "var(--accent-tint)",
        "accent-tint-border": "var(--accent-tint-border)",
        "on-accent": "var(--on-accent)",
      },
    },
  },
  plugins: [typography],
};
