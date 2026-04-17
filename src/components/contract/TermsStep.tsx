// @ts-nocheck — SaaS 원본 JS 이식본 (타입 정리는 후속 작업)
/**
 * TermsStep — STEP 2. VIP 배너 + 약관/특약 확인
 *
 * 원본: HomepagePage.jsx 라인 808-911 (terms 단계)
 *
 * - VIP 부동산: 상단에 네이비 배너, 할인 표시
 * - 단기: PriorityRestrictionsBadge (mode='agree')
 * - 일반임대/근생: 특약 체크리스트 (황색 박스)
 */

import { useMemo, useState } from 'react';
import { PriorityRestrictionsBadge } from '../PriorityRestrictionsBadge';
import { buildRestrictionItems } from '../../lib/priorityRestrictions';
import type { BrokerInfo } from './ContractWizard';
import { C, T, S } from './contractStyles';

interface Props {
  building: any;
  room: any;
  roomType: '단기' | '일반임대' | '근생';
  brokerInfo: BrokerInfo;
  onNext: (agreed: boolean) => void;
  onBack: () => void;
}

const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');

export default function TermsStep({
  building, room, roomType, brokerInfo, onNext, onBack,
}: Props): JSX.Element {
  // 단기면 badge 모드, 아니면 체크리스트
  const isShort = roomType === '단기';

  // 단기 자유특약 items
  const items = useMemo(() => {
    if (!isShort) return [];
    return buildRestrictionItems(building?.contractSpecialTermsShortTerm, {
      requiresBrokerTaxInvoice: !!building?.requiresBrokerTaxInvoice,
    });
  }, [isShort, building]);

  // 일반/근생 특약 목록
  const longTermCards: string[] = useMemo(() => {
    if (isShort) return [];
    const key =
      roomType === '일반임대'
        ? 'contractSpecialTermsLongTerm'
        : 'contractSpecialTermsCommercial';
    const cards = Array.isArray(building?.[key]) ? building[key] : [];
    return cards.map((c: any) => c?.text || '').filter(Boolean);
  }, [isShort, roomType, building]);

  // 주차 정보 (단기용)
  const parkingInfo = isShort
    ? {
        type: room?.standardParkingType || '',
        fee: parseInt(String(room?.standardParkingFee ?? '0')) || 0,
        remoteDeposit:
          parseInt(String(room?.standardParkingRemoteDeposit ?? '0')) || 0,
      }
    : undefined;

  const extraOccupantFee = parseInt(String(room?.extraOccupantFee ?? '0')) || 0;
  const externalParkingNote = room?.externalParkingNote || '';

  // agree 상태
  const [agreedShort, setAgreedShort] = useState(false);
  const [agreedLong, setAgreedLong] = useState<boolean[]>(
    () => new Array(longTermCards.length || 1).fill(false),
  );

  const allLongAgreed =
    agreedLong.length === 0 ? false : agreedLong.every(Boolean);
  const canProceed = isShort ? agreedShort : allLongAgreed;

  // VIP 할인 표시
  const rentStd = parseInt(String(room?.standardRent ?? '0')) || 0;
  const rentStdMan = Math.round(rentStd / 10000);
  const discountMan = brokerInfo.discount
    ? Math.round(brokerInfo.discount / 10000)
    : 0;
  const showDiscount =
    brokerInfo.isVip && discountMan > 0 && discountMan < rentStdMan;

  const handleNext = (): void => {
    if (!canProceed) {
      alert(
        isShort
          ? '계약 전 안내사항을 확인 후 체크해주세요.'
          : '모든 특약사항을 확인해주세요.',
      );
      return;
    }
    onNext(true);
  };

  return (
    <div>
      {/* VIP 배너 */}
      {brokerInfo.isVip && (
        <div
          style={{
            ...S.card,
            background:
              'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            color: '#fff',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: '#fbbf24',
              letterSpacing: '0.12em',
              marginBottom: 8,
            }}
          >
            VIP PARTNER
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              marginBottom: 6,
              letterSpacing: '-0.01em',
            }}
          >
            {brokerInfo.name || '등록 부동산'}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
            등록 VIP 부동산 — 최대 할인 적용 특별 금액
          </div>
          {showDiscount && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                background: 'rgba(251,191,36,0.12)',
                borderRadius: 8,
                border: '1px solid rgba(251,191,36,0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.4)',
                  textDecoration: 'line-through',
                }}
              >
                {fmt(rentStdMan)}만원
              </div>
              <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.3)' }}>→</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fbbf24' }}>
                {fmt(discountMan)}만원
              </div>
              <div
                style={{
                  marginLeft: 'auto',
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#ef4444',
                }}
              >
                -{fmt(rentStdMan - discountMan)}만 할인
              </div>
            </div>
          )}
        </div>
      )}

      {/* 특약 */}
      <div style={S.card}>
        <div style={{ ...T.title, marginBottom: 6 }}>계약 전 확인</div>
        <div style={{ ...T.caption, marginBottom: 20 }}>
          입주 후 분쟁이 없도록, 아래 사항을 반드시 확인해주세요.
        </div>

        {isShort ? (
          <PriorityRestrictionsBadge
            building={building}
            room={room}
            items={items}
            parkingInfo={parkingInfo?.type ? parkingInfo : undefined}
            extraOccupantFee={extraOccupantFee}
            externalParkingNote={externalParkingNote}
            title="계약 전 반드시 확인"
            mode="agree"
            agreed={agreedShort}
            onAgree={setAgreedShort}
          />
        ) : (
          <div
            style={{
              padding: 16,
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: 10,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: '#92400E',
                marginBottom: 4,
              }}
            >
              계약 특약사항
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#B45309',
                marginBottom: 12,
                padding: '6px 10px',
                background: '#FEF3C7',
                borderRadius: 6,
                fontWeight: 600,
              }}
            >
              각 항목을 확인하고 체크해주세요
            </div>
            {longTermCards.length > 0 ? (
              longTermCards.map((line, i) => (
                <label
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 0',
                    borderBottom:
                      i < longTermCards.length - 1
                        ? '1px solid #FDE68A'
                        : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!agreedLong[i]}
                    onChange={(e) => {
                      setAgreedLong((prev) => {
                        const n = [...prev];
                        n[i] = e.target.checked;
                        return n;
                      });
                    }}
                    style={{
                      width: 18,
                      height: 18,
                      marginTop: 1,
                      accentColor: '#92400E',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{ fontSize: 13, color: '#78350F', lineHeight: 1.6 }}
                  >
                    {line}
                  </span>
                </label>
              ))
            ) : (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 0',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!agreedLong[0]}
                  onChange={(e) => setAgreedLong([e.target.checked])}
                  style={{
                    width: 18,
                    height: 18,
                    accentColor: '#92400E',
                    cursor: 'pointer',
                  }}
                />
                <span style={{ fontSize: 13, color: '#78350F' }}>
                  특약사항을 확인했습니다
                </span>
              </label>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onBack} style={{ ...S.btnSecondary, flex: '0 0 100px' }}>
            이전
          </button>
          <button
            onClick={handleNext}
            style={canProceed ? { ...S.btnPrimary, flex: 1 } : { ...S.btnDisabled, flex: 1 }}
            disabled={!canProceed}
          >
            모두 확인했습니다
          </button>
        </div>
      </div>
    </div>
  );
}
