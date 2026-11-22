/** @type {import('tailwindcss').Config} */
export default {
  // class 策略：<html class="dark"> 时启用暗色；由 useTheme composable 统一切换
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 主色：工程蓝
        brand: {
          50: '#eef4ff',
          100: '#dbe7ff',
          200: '#bed3ff',
          300: '#91b5ff',
          400: '#5d8dff',
          500: '#3a68f7',
          600: '#2549eb',
          700: '#1d37d8',
          800: '#1e30ae',
          900: '#1e2e89',
        },
        // 辅助色：PCB 青
        accent: {
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
        },
        ink: {
          900: '#0b1120',
          800: '#111827',
          700: '#1f2937',
          600: '#374151',
          500: '#4b5563',
          400: '#6b7280',
          300: '#9ca3af',
        },
        page: '#f6f7fb',
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'PingFang SC',
          'Microsoft YaHei',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'JetBrains Mono', 'Consolas', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 8px 24px -12px rgba(16,24,40,.12)',
        lift: '0 18px 40px -18px rgba(16,24,40,.28)',
        glow: '0 0 0 1px rgba(37,73,235,.16), 0 12px 32px -12px rgba(37,73,235,.35)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      maxWidth: {
        content: '1200px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'sheen': {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(120%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .5s cubic-bezier(.22,.61,.36,1) both',
        'fade-in': 'fade-in .4s ease both',
        sheen: 'sheen 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
