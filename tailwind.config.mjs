import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // 하우스맨 팔레트 + Stripe 체계 벤치마크
      // (컬러는 복제 아님 — 채도·명도·보더·리듬만 Stripe 패턴에서 차용)
      colors: {
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
        emphasis: '#DC2626',
        ink: {
          DEFAULT: '#0E1C2E', // Stripe "Downriver"와 호환되는 짙은 네이비 (기존 검정보다 따뜻)
          body:    '#2C3E5A', // 본문 (Stripe #425466과 같은 역할, 네이비 계열)
          muted:   '#5A6B85',
          label:   '#8A99B0',
          line:    '#E3E8EE', // Stripe divider 값 그대로 (중립 회색이라 브랜드 복제 아님)
          soft:    '#F6F9FC', // Stripe tint 값
        },
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
        sans: ['Pretendard Variable', 'Pretendard', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Pretendard Variable', 'Pretendard', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Stripe-style display scale (한글 tracking -0.01em 기준)
        'display-xl': ['clamp(40px, 6vw, 72px)', { lineHeight: '1.05', letterSpacing: '-0.022em', fontWeight: '800' }],
        'display-l':  ['clamp(36px, 5vw, 56px)', { lineHeight: '1.1',  letterSpacing: '-0.02em',  fontWeight: '800' }],
        'h2':         ['clamp(28px, 3.4vw, 40px)', { lineHeight: '1.18', letterSpacing: '-0.015em', fontWeight: '700' }],
        'h3':         ['clamp(20px, 2vw, 28px)', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '700' }],
        'body-l':     ['20px', { lineHeight: '1.55' }],
        'body':       ['17px', { lineHeight: '1.65' }],
        'eyebrow':    ['13px', { lineHeight: '1.2', letterSpacing: '0.08em', fontWeight: '700' }],
      },
      spacing: {
        section: '7.5rem',  // 120px (Stripe 섹션 세로 표준)
        'section-sm': '6rem', // 96px (보조)
        gutter: '1.5rem',
      },
      backgroundImage: {
        'hero-gradient':
          'linear-gradient(135deg, #0E1C2E 0%, #1E3A5F 45%, #3A5784 100%)',
        // 하우스맨 저채도 블롭 (Stripe wave-fallback 접근)
        'hero-blobs':
          'radial-gradient(60% 50% at 20% 30%, rgba(183, 210, 235, 0.55) 0%, transparent 60%), ' +
          'radial-gradient(55% 45% at 80% 20%, rgba(107, 134, 182, 0.45) 0%, transparent 65%), ' +
          'radial-gradient(50% 50% at 70% 80%, rgba(218, 200, 255, 0.35) 0%, transparent 60%), ' +
          'radial-gradient(45% 40% at 15% 85%, rgba(143, 193, 227, 0.4) 0%, transparent 60%), ' +
          '#F6F9FC',
        'cta-gradient':
          'linear-gradient(135deg, #0E1C2E 0%, #1E3A5F 50%, #3A5784 100%)',
      },
      borderRadius: {
        card: '12px',
        'card-lg': '16px',
        pill: '9999px',
      },
      boxShadow: {
        // Stripe Elements 공식 토큰 (브랜드와 무관한 기술 값)
        card:        '0 3px 10px rgba(14,28,46,0.06)',
        'card-hover':'0 12px 28px rgba(14,28,46,0.12)',
        mockup:      '0 30px 60px rgba(14,28,46,0.14)',
        cta:         '0 1px 2px rgba(14,28,46,0.08)',
        'cta-hover': '0 6px 18px rgba(30,58,95,0.28)',
      },
      maxWidth: {
        content: '1080px', // Stripe 표준
        'content-wide': '1200px',
        prose: '720px',
      },
      transitionTimingFunction: {
        stripe: 'cubic-bezier(0.2, 1, 0.2, 1)', // Stripe signature easing
      },
      transitionDuration: {
        '240': '240ms',
        '600': '600ms',
      },
      animation: {
        'blob-shift': 'blobShift 60s linear infinite',
      },
      keyframes: {
        blobShift: {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1.05)' },
          '50%':      { transform: 'translate3d(-3%,2%,0) scale(1.1)' },
        },
      },
    },
  },
  plugins: [typography],
};
