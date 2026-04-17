// contractStyles.ts — HOUSEMAN 전자계약 디자인 시스템
// 5색: 네이비(브랜드) + 검정(텍스트) + 회색(보조) + 빨강(에러) + 초록(완료)

import type { CSSProperties } from 'react';

export const C = {
  text: '#1D1D1F',
  textSec: '#718096',
  bg: '#FFFFFF',
  card: '#FFFFFF',
  border: '#CBD5E0',
  accent: '#1E3A5F',
  success: '#2B8A3E',
  danger: '#E03131',
} as const;

export const T: Record<string, CSSProperties> = {
  display: { fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: C.text },
  title: { fontSize: 22, fontWeight: 700, color: C.text },
  headline: { fontSize: 17, fontWeight: 700, color: C.text },
  body: { fontSize: 16, fontWeight: 400, color: C.text },
  subhead: { fontSize: 13, fontWeight: 600, color: C.text },
  caption: { fontSize: 12, fontWeight: 400, color: C.textSec },
  overline: { fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: C.textSec },
};

export const S: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.bg, fontFamily: "'Pretendard Variable', -apple-system, sans-serif", WebkitFontSmoothing: 'antialiased', color: C.text },
  content: { maxWidth: 520, margin: '0 auto', padding: '0 20px 120px' },
  card: { background: C.card, borderRadius: 16, padding: 24, marginBottom: 16, boxShadow: '0 2px 8px rgba(30,58,95,0.08)', border: '1px solid #EDF0F4' },
  input: { width: '100%', padding: '14px 16px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 16, fontFamily: 'inherit', background: C.card, outline: 'none', color: C.text, boxSizing: 'border-box' },
  inputError: { borderColor: C.danger, background: '#FFF5F5' },
  inputFocus: { borderColor: C.accent, boxShadow: '0 0 0 3px rgba(30,58,95,0.15)' },
  label: { fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 },
  btnPrimary: { width: '100%', padding: 16, height: 52, border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: C.accent, color: '#FFFFFF', WebkitTapHighlightColor: 'transparent' },
  btnDisabled: { width: '100%', padding: 16, height: 52, border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600, fontFamily: 'inherit', background: '#A0AEC0', color: '#FFFFFF', cursor: 'default' },
  btnSecondary: { width: '100%', padding: 14, height: 44, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: '#EDF0F4', color: C.text },
  stickyFooter: { position: 'sticky', bottom: 0, left: 0, right: 0, padding: '12px 20px 24px', background: `linear-gradient(transparent, ${C.bg} 30%)`, zIndex: 10 },
  required: { width: 5, height: 5, borderRadius: '50%', background: C.danger, display: 'inline-block' },
  errorText: { fontSize: 12, color: C.danger, marginTop: 4 },
  helper: { fontSize: 12, color: C.textSec, marginTop: 4 },
};
