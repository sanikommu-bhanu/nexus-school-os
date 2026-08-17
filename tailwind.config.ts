import type { Config } from "tailwindcss";

// ============================================================
// NEXUS DESIGN TOKENS — "Blush Noir"
//
// Deep warm charcoal-plum, lit by a single blush-rose accent and a
// soft lavender secondary. Editorial rather than candy. Four rules
// keep blush reading premium instead of cute:
//
//   60 / 30 / 10   60% deep neutral, 30% glass mid-tones, 10% blush.
//                  A neutral screen with pink LIGHT in it — never a
//                  pink screen.
//   desaturated    blush, not bubblegum. The whole distance between
//                  toy and luxury is #FF3E71 vs #ED7FA0.
//   warm neutrals  the base leans plum so the accent feels native to
//                  the surface instead of stuck on cold grey.
//   hard contrast  softness lives in the colour, never in the text.
//                  Body copy sits near 14:1 on the base.
//
// NOTE ON NAMING: the original token names (base/glass/action/accent/
// ink/success/warning/danger) are deliberately preserved. ~70 screens
// already reference them, so retinting here propagates everywhere
// without touching a single screen file. New tokens are additive.
// ============================================================
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ---- Base: deep warm charcoal-plum, never pure black ----
        base: {
          950: "#120E13",
          900: "#191319",
          800: "#241C24",
          700: "#332833",
        },

        // ---- Glass tints (paired with the .glass-* classes) ----
        glass: {
          DEFAULT: "rgba(255, 244, 248, 0.07)",
          border: "rgba(255, 240, 246, 0.12)",
          strong: "rgba(255, 244, 248, 0.12)",
          faint: "rgba(255, 244, 248, 0.04)",
        },

        // ---- Blush rose: the one action colour. ~10% of pixels. ----
        action: {
          DEFAULT: "#ED7FA0",
          light: "#FFB3C7",
          dark: "#C85F80",
          deep: "#A44E6C",
        },

        // ---- Soft lavender: AI, secondary highlights, role accents ----
        accent: {
          DEFAULT: "#B8A6E8",
          soft: "#D6CCF5",
          muted: "#6B5B99",
        },

        // ---- Warm white text. Softness never costs legibility. ----
        ink: {
          DEFAULT: "#FBF4F7", // ~14:1 on base-950
          muted: "#C4B2BC",
          faint: "#8E7D88",
        },

        // ---- State: soft, never neon ----
        success: "#6FDDB4",
        warning: "#F5C177",
        danger: "#FF8C9C",
        mint: "#6FDDB4",
        amber: "#F5C177",
        coral: "#FF8C9C",

        /**
         * Role identity — colour that carries MEANING rather than
         * decoration, so each role's world is subtly tinted and the
         * tint doubles as wayfinding. Additive: nothing references
         * these yet, and unused Tailwind colours emit no CSS.
         */
        role: {
          admin: "#E8A0BC",
          teacher: "#B8A6E8",
          student: "#6FDDB4",
          parent: "#F5C177",
        },
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
        // Ambient depth plus a warm blush bounce.
        glass: "0 8px 32px rgba(12, 8, 12, 0.45), 0 1px 2px rgba(12, 8, 12, 0.30)",
        "glass-sm": "0 4px 16px rgba(12, 8, 12, 0.34)",
        "glass-lg": "0 20px 56px rgba(12, 8, 12, 0.52), 0 2px 6px rgba(12, 8, 12, 0.32)",
        "glow-pink": "0 8px 28px rgba(237, 127, 160, 0.32)",
        "glow-pink-lg": "0 12px 44px rgba(237, 127, 160, 0.40)",
        "glow-accent": "0 8px 26px rgba(184, 166, 232, 0.26)",
        "glow-mint": "0 8px 26px rgba(111, 221, 180, 0.26)",
        // The inner top-edge highlight — the detail that reads as glass.
        "glass-edge": "inset 0 1px 0 rgba(255, 247, 251, 0.18)",
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
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
