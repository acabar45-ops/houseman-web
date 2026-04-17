// @ts-nocheck — SaaS 원본 JS 이식본 (타입 정리는 후속 작업)
/**
 * BrokerVerify — STEP 1. 부동산 전화번호 인증
 *
 * 원본: HomepagePage.jsx 라인 664-749 (verify 단계)
 *
 * 로직:
 *   1. Supabase app_settings.broker_list 조회 (VIP 부동산)
 *   2. calendar_events 에서 과거 계약 부동산 수집
 *   3. 전화번호 정규화 후 매칭
 *   4. 시뮬레이션 모드(isSim=true)는 항상 통과
 */

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { BrokerInfo } from './ContractWizard';
import { C, T, S } from './contractStyles';

interface Props {
  building: any;
  room: any;
  roomType: '단기' | '일반임대' | '근생';
  isSim: boolean;
  onNext: (b: BrokerInfo) => void;
}

const normalizePhone = (p: string): string =>
  (p || '').replace(/[-\s()]/g, '');

export default function BrokerVerify({
  building, room, roomType, isSim, onNext,
}: Props): JSX.Element {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async (): Promise<void> => {
    const trimmed = phone.trim();
    if (!trimmed) { setError('연락처를 입력하세요'); return; }
    if (!/^01\d{8,9}$/.test(normalizePhone(trimmed))) {
      setError('올바른 휴대폰 번호를 입력하세요 (01012345678)');
      return;
    }

    setError(null);
    setLoading(true);

    // 시뮬레이션 모드 — DB 접근 없이 통과
    if (isSim) {
      setLoading(false);
      onNext({
        name: '시뮬레이션 부동산',
        phone: trimmed,
        isVip: true,
      });
      return;
    }

    try {
      const brokers: Array<{ name: string; phone: string; isVip: boolean }> = [];

      // 1) app_settings.broker_list (VIP)
      try {
        const { data: setting } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'broker_list')
          .maybeSingle();
        const list = (setting as any)?.value;
        if (Array.isArray(list)) {
          for (const b of list) {
            if (b?.phone) {
              brokers.push({
                name: b.name || '',
                phone: String(b.phone),
                isVip: true,
              });
            }
          }
        }
      } catch (_e) { /* ignore */ }

      // 2) calendar_events 에서 과거 계약 부동산 수집 (비 VIP)
      try {
        const { data: evts } = await supabase
          .from('calendar_events')
          .select('broker, broker_phone')
          .eq('type', '계약')
          .not('broker_phone', 'is', null);
        if (Array.isArray(evts)) {
          for (const e of evts) {
            const p = (e as any).broker_phone;
            if (!p) continue;
            // 이미 VIP로 등록된 건 skip
            if (brokers.some((x) => normalizePhone(x.phone) === normalizePhone(p))) continue;
            brokers.push({
              name: (e as any).broker || '',
              phone: String(p),
              isVip: false,
            });
          }
        }
      } catch (_e) { /* ignore */ }

      const matched = brokers.find(
        (b) => normalizePhone(b.phone) === normalizePhone(trimmed),
      );

      if (!matched) {
        setLoading(false);
        setError('등록되지 않은 부동산입니다. 하우스맨(1544-4150)으로 문의해주세요.');
        return;
      }

      // VIP면 할인 한도 조회 (rooms.rent_discount_limit)
      let discount: number | undefined;
      if (matched.isVip) {
        const raw = room?.rentDiscountLimit ?? room?.rent_discount_limit;
        const n = parseInt(String(raw ?? '').replace(/,/g, ''));
        if (!Number.isNaN(n) && n > 0) discount = n;
      }

      setLoading(false);
      onNext({
        name: matched.name,
        phone: matched.phone,
        isVip: matched.isVip,
        discount,
      });
    } catch (e) {
      setLoading(false);
      console.error('[BrokerVerify] error:', e);
      setError('인증 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  return (
    <div style={S.card}>
      <div style={{ ...T.title, marginBottom: 6 }}>등록 부동산 확인</div>
      <div style={{ ...T.caption, marginBottom: 24 }}>
        등록된 부동산만 홈페이지에서 계약을 진행할 수 있습니다.
        <br />
        등록 부동산이 아니신 경우 하우스맨(1544-4150)으로 연락 부탁드립니다.
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={S.label}>
          부동산 연락처
          <span style={S.required} />
        </div>
        <input
          type="tel"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setError(null); }}
          placeholder="010-0000-0000"
          style={{ ...S.input, ...(error ? S.inputError : {}) }}
          inputMode="tel"
          autoComplete="tel"
        />
        {error && <div style={S.errorText}>{error}</div>}
        {!error && (
          <div style={S.helper}>휴대폰 번호만 입력 가능합니다.</div>
        )}
      </div>

      {isSim && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 12px',
            background: '#EDF4FF',
            border: `1px solid ${C.accent}`,
            borderRadius: 8,
            fontSize: 12,
            color: C.accent,
            fontWeight: 600,
          }}
        >
          시뮬레이션 모드 — 아무 번호나 입력해도 통과합니다.
        </div>
      )}

      <button
        onClick={handleVerify}
        disabled={loading}
        style={loading ? S.btnDisabled : S.btnPrimary}
      >
        {loading ? '확인 중...' : '다음'}
      </button>
    </div>
  );
}
