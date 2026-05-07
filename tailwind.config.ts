import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "oklch(20% 0.014 230)",
        muted: "oklch(46% 0.018 230)",
        panel: "oklch(96.5% 0.008 230)",
        "panel-soft": "oklch(98% 0.006 230)",
        surface: "oklch(99% 0.004 230)",
        line: "oklch(86.5% 0.012 230)",
        "line-strong": "oklch(78% 0.016 230)",
        signal: "oklch(52% 0.105 190)",
        warn: "oklch(61% 0.14 72)",
        "warn-soft": "oklch(96% 0.04 78)",
        "warn-line": "oklch(84% 0.08 78)",
        "warn-strong": "oklch(39% 0.095 70)",
        danger: "oklch(50% 0.16 27)",
        "danger-soft": "oklch(96% 0.03 27)",
        "danger-line": "oklch(84% 0.075 27)",
        "danger-strong": "oklch(38% 0.13 27)",
        success: "oklch(45% 0.105 150)",
        "success-soft": "oklch(96% 0.035 150)",
        "success-line": "oklch(83% 0.075 150)",
        "success-strong": "oklch(34% 0.09 150)",
        info: "oklch(48% 0.09 230)",
        "info-soft": "oklch(96% 0.025 230)",
        "info-line": "oklch(84% 0.055 230)",
        "info-strong": "oklch(34% 0.075 230)"
      }
    }
  },
  plugins: []
}

export default config
