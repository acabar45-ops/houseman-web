// @ts-nocheck — SaaS 원본 JS 이식본 (타입 정리는 후속 작업)
/**
 * PriceStep — STEP 3. 금액·입주일·만기일·계약금 입력
 *
 * 원본: HomepagePage.jsx 라인 914-1031 (price 단계)
 *
 * - 부동산명/연락처 수정 가능
 * - 보증금/예치금 · 월세 · 관리비
 * - 입주일 (단기: 오늘 + 5일 이내)
 * - 만기일 (단기: 3개월 버튼 자동계산)
 * - 단기 전용: 수도/인터넷/퇴실청소비
 * - 계약금 + 입금자명
 */

import { useMemo, useState } from 'react';
import type { BrokerInfo, PriceData } from './ContractWizard';
import { C, T, S } from './contractStyles';

interface Props {
  building: any;
  room: any;
  roomType: '단기' | '일반임대' | '근생';
  brokerInfo: BrokerInfo;
  onNext: (p: PriceData) => void;
  onBack: () => void;
}

const toYmd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

const parseManwon = (v: string | number | undefined): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export default function PriceStep({
  building, room, roomType, brokerInfo, onNext, onBack,
}: Props): JSX.Element {
  const isShort = roomType === '단기';
  const depositLabel = isShort ? '예치금' : '보증금';

  // 초기값 계산 (room 표준 가격 기반)
  const initial = useMemo((): PriceData => {
    const rentStd = parseManwon(room?.standardRent) / 10000;
    const depositStd = parseManwon(room?.standardDeposit) / 10000;
    const mgmtStd = parseManwon(room?.standardManagementFee) / 10000;

    const now = new Date();
    const defaultMoveIn = new Date(now);
    defaultMoveIn.setDate(defaultMoveIn.getDate() + (isShort ? 5 : 14));

    // 계약금: 월세의 7일치, 10만원 단위 올림
    const contractDeposit = Math.ceil((rentStd * 7) / 30 / 10) * 10;

    return {
      broker: brokerInfo.name,
      brokerPhone: brokerInfo.phone,
      deposit: depositStd > 0 ? depositStd : '',
      rent: rentStd > 0 ? rentStd : '',
      mgmt: mgmtStd > 0 ? mgmtStd : '',
      moveIn: toYmd(defaultMoveIn),
      expiry: '',
      waterFee: room?.standardWaterFee ? String(room.standardWaterFee) : '',
      cable: room?.standardInternetFee ? String(room.standardInternetFee) : '',
      exitFee: room?.standardCleaningFee ? String(room.standardCleaningFee) : '',
      contractDeposit: contractDeposit > 0 ? contractDeposit : '',
      depositor: '',
    };
  }, [room, brokerInfo.name, brokerInfo.phone, isShort]);

  const [form, setForm] = useState<PriceData>(initial);

  const today = toYmd(new Date());
  const maxMoveIn = useMemo(() => {
    if (!isShort) return undefined;
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return toYmd(d);
  }, [isShort]);

  const update = (patch: Partial<PriceData>): void =>
    setForm((p) => ({ ...p, ...patch }));

  const autoExpiry = (): void => {
    if (!form.moveIn) {
      alert('입주일을 먼저 선택하세요');
      return;
    }
    const d = new Date(form.moveIn);
    d.setMonth(d.getMonth() + 3);
    d.setDate(d.getDate() - 1);
    update({ expiry: toYmd(d) });
  };

  const handleNext = (): void => {
    if (!form.moveIn) { alert('입주일을 선택하세요'); return; }
    if (!form.rent && !form.deposit) {
      alert('월세 또는 보증금 중 하나는 입력해야 합니다');
      return;
    }
    onNext(form);
  };

  const labelStyle = { ...S.label, marginBottom: 6 };
  const fieldInput = { ...S.input, padding: '11px 13px', fontSize: 14 };

  return (
    <div style={S.card}>
      <div style={{ ...T.title, marginBottom: 6 }}>금액 정보</div>
      <div style={{ ...T.caption, marginBottom: 20 }}>
        부동산에서 조율된 금액으로 정확히 입력해주세요.
      </div>

      {/* 부동산 정보 (수정 가능) */}
      <div
        style={{
          padding: 14,
          background: '#F0F9FF',
          border: '1px solid #BAE6FD',
          borderRadius: 10,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#0369A1',
            marginBottom: 10,
          }}
        >
          부동산 정보
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#0369A1', marginBottom: 4 }}>
              부동산명
            </div>
            <input
              value={form.broker || ''}
              onChange={(e) => update({ broker: e.target.value })}
              style={{ ...fieldInput, borderColor: '#BAE6FD' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#0369A1', marginBottom: 4 }}>
              연락처
            </div>
            <input
              value={form.brokerPhone || ''}
              onChange={(e) => update({ brokerPhone: e.target.value })}
              style={{ ...fieldInput, borderColor: '#BAE6FD' }}
            />
          </div>
        </div>
      </div>

      {/* 금액 3열 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div>
          <div style={labelStyle}>{depositLabel} (만원)</div>
          <input
            type="number"
            value={form.deposit ?? ''}
            onChange={(e) => update({ deposit: e.target.value })}
            style={fieldInput}
            inputMode="numeric"
          />
        </div>
        <div>
          <div style={labelStyle}>월세 (만원)</div>
          <input
            type="number"
            value={form.rent ?? ''}
            onChange={(e) => update({ rent: e.target.value })}
            style={fieldInput}
            inputMode="numeric"
          />
        </div>
        <div>
          <div style={labelStyle}>관리비 (만원)</div>
          <input
            type="number"
            value={form.mgmt ?? ''}
            onChange={(e) => update({ mgmt: e.target.value })}
            style={fieldInput}
            inputMode="numeric"
          />
        </div>
      </div>

      {/* 입주일 / 만기일 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isShort ? '1fr auto 1fr' : '1fr 1fr',
          gap: 10,
          marginBottom: 6,
          alignItems: 'end',
        }}
      >
        <div>
          <div style={labelStyle}>
            입주일 <span style={S.required} />
          </div>
          <input
            type="date"
            value={form.moveIn || ''}
            min={today}
            max={maxMoveIn}
            onChange={(e) => update({ moveIn: e.target.value })}
            style={fieldInput}
          />
        </div>
        {isShort && (
          <button
            onClick={autoExpiry}
            style={{
              height: 44,
              padding: '0 16px',
              border: `1px solid ${C.accent}`,
              background: '#EDF4FF',
              color: C.accent,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              borderRadius: 10,
            }}
          >
            3개월
          </button>
        )}
        <div>
          <div style={labelStyle}>만기일</div>
          <input
            type="date"
            value={form.expiry || ''}
            onChange={(e) => update({ expiry: e.target.value })}
            style={fieldInput}
          />
        </div>
      </div>
      {isShort && (
        <div style={{ ...S.helper, marginBottom: 16 }}>
          단기: 오늘로부터 5일 이내 입주
        </div>
      )}

      {/* 단기 전용: 수도/인터넷/퇴실청소비 */}
      {isShort && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 10,
            marginBottom: 16,
            marginTop: 10,
          }}
        >
          <div>
            <div style={labelStyle}>수도</div>
            <input
              value={form.waterFee ?? ''}
              onChange={(e) => update({ waterFee: e.target.value })}
              placeholder="10,000"
              style={fieldInput}
            />
          </div>
          <div>
            <div style={labelStyle}>인터넷</div>
            <input
              value={form.cable ?? ''}
              onChange={(e) => update({ cable: e.target.value })}
              placeholder="포함"
              style={fieldInput}
            />
          </div>
          <div>
            <div style={labelStyle}>퇴실청소비</div>
            <input
              value={form.exitFee ?? ''}
              onChange={(e) => update({ exitFee: e.target.value })}
              placeholder="50,000"
              style={fieldInput}
            />
          </div>
        </div>
      )}

      {/* 계약금 + 입금자명 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div>
          <div style={labelStyle}>계약금 (만원)</div>
          <input
            type="number"
            value={form.contractDeposit ?? ''}
            onChange={(e) => update({ contractDeposit: e.target.value })}
            style={fieldInput}
            inputMode="numeric"
          />
        </div>
        <div>
          <div style={labelStyle}>입금자명</div>
          <input
            value={form.depositor || ''}
            onChange={(e) => update({ depositor: e.target.value })}
            placeholder="입금자명"
            style={fieldInput}
          />
        </div>
      </div>

      {/* 버튼 */}
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button onClick={onBack} style={{ ...S.btnSecondary, flex: '0 0 100px' }}>
          이전
        </button>
        <button onClick={handleNext} style={{ ...S.btnPrimary, flex: 1 }}>
          금액 확인 완료
        </button>
      </div>
    </div>
  );
}
