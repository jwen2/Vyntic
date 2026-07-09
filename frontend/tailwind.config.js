import typography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Cobalt accent scale (spec 2026-07-09-cobalt-accent-design.md).
        // Existing blue-* usages retune to the brand accent; 900/950 stay
        // near Tailwind defaults (used only as dark washes).
        blue: {
          50: "#eef3fc",
          100: "#e7edfb",
          200: "#b6c6ee",
          300: "#93aee4",
          400: "#8ab4ff",
          500: "#1d4ed8",
          600: "#1d4ed8",
          700: "#1e40af",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },
      },
    },
  },
  plugins: [typography],
};
