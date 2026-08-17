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
        // ---- Ground: warm plum-charcoal. Neutral, not a hue. ----
        base: {
          950: "#120E13",
          900: "#191319",
          800: "#241C24",
          700: "#332833",
        },

        // ---- Glass tints ----
        glass: {
          DEFAULT: "rgba(255, 244, 248, 0.055)",
          border: "rgba(255, 240, 246, 0.11)",
          strong: "rgba(255, 244, 248, 0.10)",
          faint: "rgba(255, 244, 248, 0.03)",
        },

        /**
         * THE BLUSH RAMP — one hue (~345deg), nine steps.
         *
         * This is the entire chromatic palette. There is no second
         * hue anywhere in the product: no lavender, no mint, no
         * amber. Everything that needs to read as "different" varies
         * by LIGHTNESS along this ramp, which is why the result stays
         * monochrome without going flat.
         */
        blush: {
          50: "#FFEAF1",
          100: "#FFD5E0",
          200: "#FFB3C7",
          300: "#F79BB5",
          400: "#ED7FA0",
          500: "#DC6A8D",
          600: "#C85F80",
          700: "#A44E6C",
          800: "#7D3B52",
        },

        // ---- The one action colour ----
        action: {
          DEFAULT: "#ED7FA0",
          light: "#FFB3C7",
          dark: "#C85F80",
          deep: "#A44E6C",
        },

        // ---- Secondary / AI: a paler step of the SAME hue ----
        accent: {
          DEFAULT: "#FFB3C7",
          soft: "#FFD5E0",
          muted: "#A44E6C",
        },

        // ---- Warm white text. Neutral, carries no hue. ----
        ink: {
          DEFAULT: "#FBF4F7",
          muted: "#C4B2BC",
          faint: "#8E7D88",
        },

        /**
         * State, expressed as position on the ramp rather than hue:
         * pale = good, deep = bad. Every one of these already ships
         * beside a text label (P/A/L, Paid/Due), so meaning never
         * rests on colour alone — and a single-hue scale is more
         * colour-blind-safe than green/amber/red, not less.
         */
        success: "#FFD5E0",
        warning: "#F79BB5",
        danger: "#C4456B",
        mint: "#FFD5E0",
        amber: "#F79BB5",
        coral: "#C4456B",

        // ---- Role identity: four steps of the same ramp ----
        role: {
          admin: "#ED7FA0",
          teacher: "#FFB3C7",
          student: "#FFD5E0",
          parent: "#C85F80",
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
        "glow-accent": "0 8px 26px rgba(255, 179, 199, 0.26)",
        "glow-mint": "0 8px 26px rgba(255, 213, 224, 0.26)",
        // The inner top-edge highlight — the detail that reads as glass.
        "glass-edge": "inset 0 1px 0 rgba(255, 247, 251, 0.18)",
      },

      backdropBlur: {
        xs: "2px",
      },

      /* Tailwind's default ring colour is blue-500. Any bare `ring-*`
         utility would inject a blue that exists nowhere in this
         palette, so the default is pinned to the ramp. */
      ringColor: {
        DEFAULT: "#ED7FA0",
      },
      ringOffsetColor: {
        DEFAULT: "#120E13",
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
