// @ts-nocheck — SaaS 원본 JS 이식본 (타입 정리는 후속 작업)
/**
 * SummaryStep — STEP 4. 최종 확인 + 입주금 계좌 안내 + 카톡 공유 + 계약 시작
 *
 * 원본: HomepagePage.jsx 라인 1034-1318 (summary 단계)
 *
 * 두 개의 액션:
 *   A) "바로 계약서 진행" → registerContract() — calendar_events insert
 *   B) "계약서 나중에쓰기" → upsertContract() + 토큰 링크 발송 (navigator.share)
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { upsertContract } from '../../lib/contracts';
import {
  resolveHousemanAccount,
  type HousemanAccount,
  LEGACY_HM_FALLBACK,
} from '../../lib/housemanAccount';
import { buildRestrictionItems } from '../../lib/priorityRestrictions';
import type { BrokerInfo, PriceData } from './ContractWizard';
import { C, T, S } from './contractStyles';

interface Props {
  building: any;
  room: any;
  roomType: '단기' | '일반임대' | '근생';
  brokerInfo: BrokerInfo;
  priceData: PriceData;
  termsAgreed: boolean;
  isSim: boolean;
  onComplete: () => void;
  onBack: () => void;
}

const toManwon = (v: string | number | undefined): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const parseInt0 = (v: string | number | undefined): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = parseInt(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const fmtAmount = (n: number): string =>
  n >= 10000
    ? `${(n / 10000).toLocaleString('ko-KR')}만`
    : n > 0
      ? `${n.toLocaleString('ko-KR')}원`
      : '-';

/* ─── target → 계좌 해석 ─── */
interface AccountInfo {
  type: string;
  label: string;
  bank: string;
  account: string;
  holder: string;
  color: string;
  bg: string;
}

function resolveTarget(
  target: string | undefined,
  building: any,
  hmAccount: HousemanAccount,
): AccountInfo {
  if (!target || target === 'houseman' || target === 'hm') {
    return {
      type: 'hm',
      label: '하우스맨',
      bank: building.housemanBillingAccountBank || hmAccount.bank,
      account: building.housemanBillingAccount || hmAccount.account,
      holder: building.housemanBillingAccountHolder || hmAccount.holder,
      color: '#1E3A5F',
      bg: '#EDF4FF',
    };
  }
  const n = String(target).replace(/^owner_?/, '');
  return {
    type: `owner_${n}`,
    label: n === '1' ? '건물주' : `건물주 ${n}`,
    bank: building[`billingAccount${n}Bank`] || '',
    account: building[`billingAccount${n}`] || '',
    holder: building[`billingAccount${n}Holder`] || '',
    color: '#EA580C',
    bg: '#FFF7ED',
  };
}

export default function SummaryStep({
  building, room, roomType, brokerInfo, priceData, isSim,
  onComplete, onBack,
}: Props): JSX.Element {
  const isShort = roomType === '단기';
  const depositLabel = isShort ? '예치금' : '보증금';
  const [busy, setBusy] = useState(false);
  const [hmAccount, setHmAccount] = useState<HousemanAccount>(LEGACY_HM_FALLBACK);

  useEffect(() => {
    (async () => {
      try {
        const acct = await resolveHousemanAccount();
        setHmAccount(acct);
      } catch (_e) {
        setHmAccount(LEGACY_HM_FALLBACK);
      }
    })();
  }, []);

  // 금액 계산 (원 단위로 통일)
  const dep = toManwon(priceData.deposit) * 10000;
  const rent = toManwon(priceData.rent) * 10000;
  const mgmt = toManwon(priceData.mgmt) * 10000;
  const water = parseInt0(priceData.waterFee);
  const cable = parseInt0(priceData.cable);

  // 항목별 → target
  const items = useMemo(
    () =>
      [
        { l: depositLabel, v: dep, target: building.depositAccountTarget || 'houseman' },
        { l: '임대료', v: rent, target: building.rentAccountTarget || 'houseman' },
        { l: '관리비', v: mgmt, target: building.managementFeeAccountTarget || 'houseman' },
        { l: '수도', v: water, target: building.utilityAccountTarget || 'houseman' },
        { l: '인터넷', v: cable, target: building.utilityAccountTarget || 'houseman' },
      ].filter((x) => x.v > 0),
    [depositLabel, dep, rent, mgmt, water, cable, building],
  );

  // 그룹화
  const groups = useMemo(() => {
    const map = new Map<string, AccountInfo & { items: typeof items; subtotal: number }>();
    items.forEach((it) => {
      const key = it.target;
      if (!map.has(key)) {
        map.set(key, { ...resolveTarget(key, building, hmAccount), items: [], subtotal: 0 });
      }
      const g = map.get(key)!;
      g.items.push(it);
      g.subtotal += it.v;
    });
    return Array.from(map.values());
  }, [items, building, hmAccount]);

  const total = items.reduce((a, x) => a + x.v, 0);

  /* ─── 카톡 메시지 ─── */
  const kakaoMsg = useMemo(() => {
    const dm = toManwon(priceData.deposit);
    const rm = toManwon(priceData.rent);
    const mm = toManwon(priceData.mgmt);
    const lines = [
      `[${building.buildingName} ${room.roomNumber}호 계약 안내]`,
      ``,
      `▪ ${depositLabel}: ${dm}만원`,
      `▪ 월세: ${rm}만원`,
      mm ? `▪ 관리비: ${mm}만원` : null,
      isShort && priceData.waterFee ? `▪ 수도: ${priceData.waterFee}` : null,
      isShort && priceData.cable ? `▪ 인터넷: ${priceData.cable}` : null,
      isShort && priceData.exitFee ? `▪ 퇴실청소비: ${priceData.exitFee}` : null,
      ``,
      `▪ 입주일: ${priceData.moveIn || '-'}`,
      priceData.expiry ? `▪ 만기일: ${priceData.expiry}` : null,
      `▪ 계약금: ${priceData.contractDeposit || 0}만원`,
      ``,
      `▪ 부동산: ${priceData.broker || brokerInfo.name}`,
      ``,
      `HOUSEMAN 하우스맨`,
    ].filter(Boolean);
    return lines.join('\n');
  }, [building, room, priceData, depositLabel, isShort, brokerInfo]);

  const shareKakao = async (): Promise<void> => {
    // HTTPS 환경에서만 navigator.share 동작
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as any).share({
          title: '계약 안내',
          text: kakaoMsg,
        });
        return;
      } catch (_e) { /* 사용자 취소 — fall through */ }
    }
    // 폴백: clipboard
    try {
      await navigator.clipboard.writeText(kakaoMsg);
      alert('계약 정보가 클립보드에 복사되었습니다.');
    } catch (_e) {
      alert('클립보드 복사에 실패했습니다. 수동으로 복사해주세요.');
    }
  };

  const copyText = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(kakaoMsg);
      alert('계약 정보가 클립보드에 복사되었습니다.');
    } catch (_e) {
      alert('복사에 실패했습니다.');
    }
  };

  /* ─── 공통: calendar_events insert 후 { eventRow, snapshot } 리턴 ─── */
  // snapshot = 원본 SaaS 와 동일한 camelCase 형태 (contracts.contract_data jsonb 저장용)
  // eventRow = 실제 DB insert 결과 row (calendar_event_id FK 연결용)
  const registerContract = async (): Promise<{ eventRow: any; snapshot: any } | null> => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // 원본 HomepagePage.jsx:1226-1237 과 동일한 camelCase snapshot
    const snapshot: any = {
      date: priceData.moveIn,
      type: '계약',
      building: building.buildingName,
      room: room.roomNumber,
      name: '',
      color: '#346aff',
      registeredBy: priceData.broker,
      registeredSource: 'broker',
      contractDate: todayStr,
      deposit: toManwon(priceData.deposit),
      rent: toManwon(priceData.rent),
      nego: toManwon(priceData.rent),
      mgmt: toManwon(priceData.mgmt),
      broker: priceData.broker,
      brokerPhone: priceData.brokerPhone,
      moveIn: priceData.moveIn,
      expiry: priceData.expiry || '',
      contractDeposit: toManwon(priceData.contractDeposit),
      depositor: priceData.depositor || '',
      ...(isShort
        ? {
            waterFee: priceData.waterFee,
            cable: priceData.cable,
            exitFee: parseInt0(priceData.exitFee),
          }
        : {}),
    };

    if (isSim) {
      // 시뮬레이션: DB 쓰기 스킵, dummy row + snapshot 리턴
      return { eventRow: { id: 0 }, snapshot };
    }

    // 중복 체크 — 동일 호실 계약 이벤트 있으면 차단
    const { data: existing } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('event_type', '계약')
      .eq('building_id', building._supabaseId)
      .eq('room_id', room.supabaseId)
      .limit(1);

    if (((existing as any[]) ?? []).length > 0) {
      alert(`${building.buildingName} ${room.roomNumber}호는 이미 계약이 등록되어 있습니다.`);
      return null;
    }

    // calendar_events 실제 컬럼명 (snake_case, DB 스키마 기준)
    // contract_deposit / depositor / waterFee / cable / exitFee 는 테이블에 없으므로
    // contracts.contract_data jsonb 에만 snapshot 로 저장됨
    const calendarPayload: any = {
      event_date: priceData.moveIn,
      event_type: '계약',
      building_id: building._supabaseId,
      building_name: building.buildingName,
      room_id: room.supabaseId,
      room_number: room.roomNumber,
      name: '',
      color: '#346aff',
      registered_by: priceData.broker,
      registered_source: 'broker',
      contract_date: todayStr,
      deposit: toManwon(priceData.deposit),
      rent: toManwon(priceData.rent),
      nego: toManwon(priceData.rent),
      management_fee: toManwon(priceData.mgmt),
      broker_name: priceData.broker,
      broker_phone: priceData.brokerPhone,
      move_in_date: priceData.moveIn,
      contract_end_date: priceData.expiry || null,
    };

    const { data, error } = await supabase
      .from('calendar_events')
      .insert(calendarPayload)
      .select('*')
      .single();
    if (error) {
      console.error('[SummaryStep] calendar_events insert 실패:', error);
      alert('계약 등록에 실패했습니다. 잠시 후 다시 시도해주세요.');
      return null;
    }
    return { eventRow: data, snapshot };
  };

  /* ─── A) 바로 계약서 진행 ─── */
  const handleRegisterAndProceed = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    if (isSim) {
      setBusy(false);
      alert('시뮬레이션: 계약 등록 (DB 쓰기 없음)');
      onComplete();
      return;
    }
    const result = await registerContract();
    setBusy(false);
    if (!result) return;
    alert('계약이 등록되었습니다.\n현장에서 계약서를 작성해주세요.');
    onComplete();
  };

  /* ─── B) 계약서 나중에쓰기 — 토큰 링크 발송 ─── */
  const handleSendLaterLink = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    if (isSim) {
      setBusy(false);
      alert('시뮬레이션: 토큰 링크 발송 (DB 쓰기 없음)');
      onComplete();
      return;
    }

    const result = await registerContract();
    if (!result) { setBusy(false); return; }
    const { eventRow, snapshot } = result;

    const contractId = `${building.buildingName}_${room.roomNumber}_${Date.now()}`;
    const contractToken = crypto.randomUUID();

    // 특약 (유형별 카드 → \n join)
    const specialTermsKey =
      roomType === '단기'
        ? 'contractSpecialTermsShortTerm'
        : roomType === '일반임대'
          ? 'contractSpecialTermsLongTerm'
          : 'contractSpecialTermsCommercial';
    const cards = Array.isArray(building?.[specialTermsKey])
      ? building[specialTermsKey]
      : [];
    const specialTerms = cards
      .map((c: any) => c?.text || '')
      .filter(Boolean)
      .join('\n');

    // 단기: priorityRestrictions 스냅샷
    const priorityRestrictionsResolved = isShort
      ? buildRestrictionItems(building.contractSpecialTermsShortTerm, {
          requiresBrokerTaxInvoice: !!building.requiresBrokerTaxInvoice,
        })
      : [];

    const parkingInfo = isShort
      ? {
          type: room?.standardParkingType || '',
          fee: parseInt0(room?.standardParkingFee),
          remoteDeposit: parseInt0(room?.standardParkingRemoteDeposit),
        }
      : null;

    const extraOccupantFee = parseInt0(room?.extraOccupantFee);
    const externalParkingNote = room?.externalParkingNote || '';

    const payload = {
      contract_id: contractId,
      contract_token: contractToken,
      building_id: building._supabaseId,
      room_id: room.supabaseId,
      building_name: building.buildingName,
      room_number: room.roomNumber,
      type: roomType,
      status: 'broker_pending',
      deposit: toManwon(priceData.deposit),
      rent: toManwon(priceData.rent),
      management_fee: toManwon(priceData.mgmt),
      move_in: priceData.moveIn || null,
      expiry: priceData.expiry || null,
      special_terms: specialTerms,
      broker_name: priceData.broker || null,
      broker_phone: priceData.brokerPhone || null,
      calendar_event_id: eventRow?.id ?? null,
      contract_data: {
        ...snapshot,
        priorityRestrictionsResolved,
        parkingInfo,
        extraOccupantFee,
        externalParkingNote,
      },
    };

    const { error } = await upsertContract(payload);
    setBusy(false);
    if (error) {
      alert('계약서 링크 생성에 실패했습니다. 다시 시도해주세요.');
      return;
    }

    const link = `${window.location.origin}/contract?token=${contractToken}`;
    const msg = `[하우스맨] ${building.buildingName} ${room.roomNumber}호 계약서\n\n아래 링크에서 계약서를 작성해주세요.\n${link}`;

    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as any).share({ title: '계약서 링크', text: msg });
      } catch (_e) {
        try {
          await navigator.clipboard.writeText(msg);
        } catch (_e2) { /* ignore */ }
      }
    } else {
      try { await navigator.clipboard.writeText(msg); } catch (_e) { /* ignore */ }
    }

    alert(
      `계약이 등록되었습니다.\n\n계약서 링크가 ${
        'share' in (navigator || {}) ? '공유' : '복사'
      }되었습니다. 부동산에게 전달해주세요.`,
    );
    onComplete();
  };

  return (
    <div>
      {/* 입주금 안내 */}
      <div style={S.card}>
        <div style={{ ...T.title, marginBottom: 6 }}>입주금 안내</div>
        <div style={{ ...T.caption, marginBottom: 16 }}>
          {building.buildingName} {room.roomNumber}호 · {roomType}
        </div>

        {!isShort ? (
          /* 근생/일반임대: 첫 그룹 계좌만 표시 */
          (() => {
            const first = groups[0] || resolveTarget('houseman', building, hmAccount);
            const acctStr = [
              first.bank,
              first.account,
              first.holder && `(${first.holder})`,
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div
                style={{
                  padding: 14,
                  background: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#92400E',
                    marginBottom: 6,
                  }}
                >
                  입금 계좌
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: C.text,
                    fontFamily: 'monospace',
                  }}
                >
                  {acctStr || '미설정'}
                </div>
              </div>
            );
          })()
        ) : (
          /* 단기: 그룹별 입주금 테이블 */
          <div
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.text }}>
                  <th
                    colSpan={3}
                    style={{
                      padding: '10px 14px',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 700,
                      textAlign: 'left',
                    }}
                  >
                    입주금 안내{' '}
                    <span style={{ fontWeight: 400, fontSize: 11, color: '#9CA3AF', marginLeft: 8 }}>
                      {groups.length === 1
                        ? `전체 → ${groups[0].label}계좌`
                        : `${groups.length}개 계좌로 분할`}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const g = groups.find((x) => x.type.endsWith(String(it.target).replace(/^owner_?/, '')) || (it.target === 'houseman' && x.type === 'hm'));
                  const color = g?.color || C.accent;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #E5E7EB' }}>
                      <td style={{ padding: '8px 12px', width: 16 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                      </td>
                      <td style={{ padding: '8px 4px', color: '#374151' }}>{it.l}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                        {fmtAmount(it.v)}
                      </td>
                    </tr>
                  );
                })}
                {groups.map((g, gi) => {
                  const acctStr =
                    g.bank && g.account
                      ? `${g.bank} ${g.account}${g.holder ? ` (${g.holder})` : ''}`
                      : '미설정';
                  return (
                    <tr key={`g-${gi}`} style={{ background: g.bg, borderBottom: '1px solid #E5E7EB' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: g.color }} />
                      </td>
                      <td style={{ padding: '8px 4px', fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: g.color }}>{g.label}</span>
                        <span style={{ color: '#9CA3AF', fontSize: 11, marginLeft: 6 }}>{acctStr}</span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: g.color, fontFamily: 'monospace' }}>
                        {fmtAmount(g.subtotal)}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: '#F3F4F6' }}>
                  <td colSpan={2} style={{ padding: '10px 14px', fontWeight: 800, fontSize: 13, color: C.text }}>
                    입주금 합계
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontSize: 14, color: C.text, fontFamily: 'monospace' }}>
                    {fmtAmount(total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 카톡 공유 */}
      <div style={S.card}>
        <div style={{ ...T.headline, marginBottom: 10 }}>계약 정보 공유</div>
        <div style={{ ...T.caption, marginBottom: 14 }}>
          부동산과 건물주에게 계약 정보를 전달하세요.
        </div>
        <button
          onClick={shareKakao}
          style={{
            width: '100%',
            padding: 14,
            background: '#fee500',
            color: '#1d1d1f',
            border: 'none',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            borderRadius: 10,
            marginBottom: 8,
          }}
        >
          카카오톡으로 보내기
        </button>
        <button
          onClick={copyText}
          style={{ ...S.btnSecondary, width: '100%' }}
        >
          텍스트 복사
        </button>
      </div>

      {/* 계약서 분기 버튼 */}
      <div style={S.card}>
        <div style={{ ...T.headline, marginBottom: 14 }}>계약서 작성</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <button
            onClick={handleRegisterAndProceed}
            disabled={busy}
            style={{
              padding: '18px 12px',
              background: busy ? '#A0AEC0' : C.text,
              color: '#fff',
              border: 'none',
              fontSize: 14,
              fontWeight: 800,
              cursor: busy ? 'default' : 'pointer',
              fontFamily: 'inherit',
              borderRadius: 12,
              textAlign: 'center',
              lineHeight: 1.4,
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 4 }}>📝</div>
            바로 계약서 진행
            <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
              현장에서 즉시 작성
            </div>
          </button>
          <button
            onClick={handleSendLaterLink}
            disabled={busy}
            style={{
              padding: '18px 12px',
              background: '#fff',
              color: C.text,
              border: `2px solid ${C.text}`,
              fontSize: 14,
              fontWeight: 800,
              cursor: busy ? 'default' : 'pointer',
              fontFamily: 'inherit',
              borderRadius: 12,
              textAlign: 'center',
              lineHeight: 1.4,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 4 }}>🔗</div>
            계약서 나중에쓰기
            <div style={{ fontSize: 11, fontWeight: 500, color: C.textSec, marginTop: 4 }}>
              링크 발송 → 부동산/임차인 입력
            </div>
          </button>
        </div>

        <button
          onClick={onBack}
          disabled={busy}
          style={{ ...S.btnSecondary, width: '100%', marginTop: 6 }}
        >
          이전
        </button>
      </div>
    </div>
  );
}
