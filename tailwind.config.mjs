import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // 하우스맨 팔레트 (feedback_no_apple_copy.md + docs/darkmode.md 준수)
      colors: {
        // 메인 네이비 (프라이머리)
        navy: {
          DEFAULT: '#1E3A5F',
          50:  '#F1F4F8',
          100: '#DCE3ED',
          200: '#B8C6DB',
          300: '#93A9C9',
          400: '#6F8CB7',
          500: '#4B6FA5',
          600: '#3A5784',
          700: '#1E3A5F', // 메인
          800: '#162B46',
          900: '#0E1C2E',
        },
        // 핵심 강조 (빨강) — 페이지 당 1곳만 쓸 것
        emphasis: '#DC2626',
        // 회색 스케일 (feedback 원칙 준수)
        ink: {
          DEFAULT: '#111827',
          muted:   '#6B7280',
          label:   '#9CA3AF',
          line:    '#E5E7EB',
          soft:    '#F3F4F6',
        },
        // 다크모드 전용 (docs/darkmode.md 기반)
        dk: {
          bg:    '#1E1E1E',
          card:  '#252526',
          text:  '#CCCCCC',
          muted: '#909090',
          accent:'#6796C8',
          line:  '#3C3C3C',
        },
      },
      fontFamily: {
        sans: ['Pretendard Variable', 'Pretendard', 'system-ui', 'sans-serif'],
      },
      // Stripe 리듬 — 여백 리듬
      spacing: {
        section: '6rem',
      },
      // 히어로 그라디언트 (네이비 → 블루)
      backgroundImage: {
        'hero-gradient':
          'linear-gradient(135deg, #0E1C2E 0%, #1E3A5F 45%, #3A5784 100%)',
      },
      borderRadius: {
        card: '12px',
      },
      maxWidth: {
        content: '1200px',
      },
    },
  },
  plugins: [typography],
};
