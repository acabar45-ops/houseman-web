import { useEffect, useState, type CSSProperties } from 'react';
import { getCoreContractNotices } from '../lib/coreNotices';

/**
 * 단기임대 부동산 안내 박스 — 단순/깔끔 디자인
 *
 * 디자인 원칙 (Apple 철학):
 *  - 색은 의미를 위해서만: 빨강(핵심 강조) 1색 + 회색 베이스
 *  - 위계는 타이포로 (글자 크기·굵기·여백)
 *  - 박스 안 박스 X — 얇은 구분선과 여백
 *  - 이모지/아이콘 최소화
 */

interface BadgeItem {
  text?: string;
  label?: string;
  critical?: boolean;
  _priority?: number;
}

interface ParkingInfo {
  type?: string;
  fee?: number | string;
  remoteDeposit?: number | string;
}

interface PriorityRestrictionsBadgeProps {
  items?: BadgeItem[];
  parkingInfo?: ParkingInfo;
  extraOccupantFee?: number | string;
  externalParkingNote?: string;
  building?: any;
  room?: any;
  mode?: 'view' | 'agree';
  agreed?: boolean;
  onAgree?: (checked: boolean) => void;
  compact?: boolean;
  title?: string;
}

export function PriorityRestrictionsBadge({
  items, parkingInfo, extraOccupantFee, externalParkingNote,
  building, room,
  mode = 'view', agreed = false, onAgree,
  compact = false, title = "계약 전 반드시 확인"
}: PriorityRestrictionsBadgeProps) {
  const [coreNotices, setCoreNotices] = useState<Array<{ key: string; label: string; value: string }>>([]);
  const [coreLoaded, setCoreLoaded] = useState<boolean>(!building);

  useEffect(() => {
    if (!building) { setCoreLoaded(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const list = await getCoreContractNotices(building, room);
        if (!cancelled) { setCoreNotices(list); setCoreLoaded(true); }
      } catch (_e) {
        if (!cancelled) setCoreLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [building, room]);

  // items 정규화: 신규 카드 `{text}` + 구 스냅샷 `{label, code, icon, critical}` 양쪽 지원
  const safeItems = (Array.isArray(items) ? items : [])
    .map((i: BadgeItem) => ({
      text: i?.text ?? i?.label ?? '',
      critical: !!i?.critical,
      _priority: i?._priority,
    }))
    .filter((i) => i.text);
  const critical = safeItems.filter((i) => i.critical);
  const optional = safeItems
    .filter((i) => !i.critical)
    .sort((a, b) => (a._priority || 999) - (b._priority || 999));
  const hasParking = parkingInfo && parkingInfo.type && parkingInfo.type !== '';
  const hasExtraOccupant = Number(extraOccupantFee) > 0;
  const hasExternalParking = externalParkingNote && String(externalParkingNote).trim() !== '';

  const hasCore = coreNotices.length > 0;
  if (!hasCore && critical.length === 0 && optional.length === 0 && !hasParking && !hasExtraOccupant && !hasExternalParking) return null;

  // 주차 텍스트 생성
  const parkingText = (() => {
    if (!hasParking) return null;
    const { type, fee, remoteDeposit } = parkingInfo!;
    const hasCost = Number(fee) > 0 || Number(remoteDeposit) > 0;
    if (hasCore && !hasCost) return null;
    if (type === 'prohibited') return '주차 불가';
    if (type === 'free') return '선착순 주차 (자리 부족 가능)';
    const parts: string[] = [];
    if (Number(fee) > 0) parts.push(`월 ${Number(fee).toLocaleString()}원`);
    if (Number(remoteDeposit) > 0) parts.push(`리모컨 보증금 ${Number(remoteDeposit).toLocaleString()}원`);
    return parts.length > 0 ? parts.join(' · ') : null;
  })();

  // 컴팩트 모드 (카드용) — 핵심만 한 줄로
  if (compact) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {critical.slice(0, 4).map((item, idx) => (
          <span key={idx}
            style={{
              fontSize: 11, fontWeight: 600, color: '#DC2626',
              padding: '2px 8px', borderRadius: 3,
              background: '#FEF2F2',
            }}>
            {item.text}
          </span>
        ))}
      </div>
    );
  }

  // 공통 스타일
  const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 600, color: '#9CA3AF', minWidth: 56, paddingTop: 1 };
  const textStyle: CSSProperties = { fontSize: 13, color: '#1F2937', lineHeight: 1.55, flex: 1 };
  const rowStyle: CSSProperties = { display: 'flex', gap: 14, padding: '10px 0', borderBottom: '1px solid #F3F4F6' };
  const lastRowStyle: CSSProperties = { ...rowStyle, borderBottom: 'none' };

  // 표시할 보조 행 모으기 (있는 것만)
  const hasCoreNow = coreNotices.length > 0;

  // 주차 불가/만차 여부 — 5코어 "주차" 줄 텍스트에서 감지
  const parkingCoreValue = String(coreNotices.find(n => n.key === 'parking')?.value || '');
  const parkingUnavailable = /불가|만차/.test(parkingCoreValue);

  // optional 항목 필터
  const filteredOptional = optional.filter(item => {
    const text = item.text;
    if (/주차\s*여부.*문의/.test(text)) return false;
    if (parkingUnavailable && text.includes('주차')) return false;
    return true;
  });

  const auxRows: Array<{ label: string; text: string }> = [];
  if (parkingText) auxRows.push({ label: hasCoreNow ? '주차 요금' : '주차', text: parkingText });
  if (hasExternalParking) auxRows.push({ label: '외부주차', text: externalParkingNote! });
  if (hasExtraOccupant) auxRows.push({ label: hasCoreNow ? '인원 추가' : '거주인원', text: `1인 추가 시 월 ${Number(extraOccupantFee).toLocaleString()}원 추가` });
  filteredOptional.forEach(item => auxRows.push({ label: '안내', text: item.text }));

  return (
    <div style={{
      padding: '20px 22px',
      borderRadius: 12,
      background: '#FFFFFF',
      border: '1px solid #E5E7EB',
      marginBottom: 16,
    }}>
      {/* 헤더 */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: '#9CA3AF',
        letterSpacing: '0.05em', textTransform: 'uppercase',
        marginBottom: 14,
      }}>
        {title}
      </div>

      {/* 5코어 (building 전달 시) */}
      {hasCore && coreLoaded && (
        <div style={{ marginBottom: (critical.length > 0 || auxRows.length > 0) ? 18 : 0 }}>
          {coreNotices.map((n, idx) => (
            <div key={n.key} style={idx === coreNotices.length - 1 ? lastRowStyle : rowStyle}>
              <div style={labelStyle}>{n.label}</div>
              <div style={{ ...textStyle, whiteSpace: 'pre-wrap' }}>{n.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 핵심 (빨강 굵은 글씨) */}
      {critical.length > 0 && (
        <div style={{
          fontSize: 17, fontWeight: 800, color: '#DC2626',
          lineHeight: 1.5, marginBottom: auxRows.length > 0 ? 18 : 0,
          letterSpacing: '-0.01em',
        }}>
          {critical.map(i => i.text).join(' · ')}
        </div>
      )}

      {/* 보조 행들 (회색 라벨 + 검정 텍스트) */}
      {auxRows.length > 0 && (
        <div>
          {auxRows.map((row, idx) => (
            <div key={idx} style={idx === auxRows.length - 1 ? lastRowStyle : rowStyle}>
              <div style={labelStyle}>{row.label}</div>
              <div style={{ ...textStyle, whiteSpace: 'pre-wrap' }}>{row.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* 동의 체크박스 (agree 모드) */}
      {mode === 'agree' && (
        <label style={{
          marginTop: 16, paddingTop: 14, borderTop: '1px solid #F3F4F6',
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          fontSize: 14, fontWeight: 600, color: '#111',
        }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => onAgree?.(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: '#DC2626', cursor: 'pointer' }}
          />
          위 사항을 모두 확인하였습니다
        </label>
      )}
    </div>
  );
}
