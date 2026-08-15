import type { Config } from "tailwindcss";

// ============================================================
// NEXUS DESIGN TOKENS
// Derived directly from the official reference image:
// deep charcoal-navy atmosphere with a soft magenta/lavender
// nebula glow, glass surfaces, and a single warm pink action color.
// ============================================================
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Base atmosphere
        base: {
          950: "#0A0A11", // deepest background
          900: "#0F0E17",
          800: "#161421",
          700: "#1E1B2E",
        },
        // Glass surface tints (used with opacity utilities)
        glass: {
          DEFAULT: "rgba(255,255,255,0.06)",
          border: "rgba(255,255,255,0.10)",
          strong: "rgba(255,255,255,0.10)",
        },
        // Signature pink — primary action color
        action: {
          DEFAULT: "#FF3E71",
          light: "#FF6F97",
          dark: "#E62B5C",
        },
        // Lavender / purple accent — role icons, secondary highlights
        accent: {
          DEFAULT: "#8B7CF6",
          soft: "#B9A6F9",
          muted: "#5C4E99",
        },
        // Text
        ink: {
          DEFAULT: "#F5F4FA", // primary text on dark
          muted: "#A7A3BE", // secondary text
          faint: "#6E6A88", // tertiary / placeholder
        },
        success: "#34D399",
        warning: "#FBBF66",
        danger: "#FF5C7A",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // controlled type scale — do not add sizes outside this
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.8125rem", { lineHeight: "1.2rem" }],
        base: ["0.9375rem", { lineHeight: "1.4rem" }],
        lg: ["1.0625rem", { lineHeight: "1.5rem" }],
        xl: ["1.25rem", { lineHeight: "1.6rem" }],
        "2xl": ["1.5rem", { lineHeight: "1.9rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.2rem" }],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
        "4xl": "2.25rem",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0,0,0,0.35)",
        "glow-pink": "0 8px 24px rgba(255,62,113,0.35)",
        "glow-accent": "0 8px 24px rgba(139,124,246,0.25)",
      },
      backdropBlur: {
        xs: "2px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out forwards",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
