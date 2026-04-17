// @ts-nocheck — SaaS 원본 JS 이식본 (타입 정리는 후속 작업)
/**
 * ContractWizard — 하우스맨 홈페이지 공실 계약 신청 5단계 마법사
 *
 * 단계: verify → terms → price → summary → done
 *
 * 원본: C:/클로드코드수업/260228/src/pages/HomepagePage.jsx (라인 664-1318)
 *   - SaaS의 Zustand store 호출을 Supabase 직접 호출로 변환
 *   - 모달 팝업 UI → 본문 카드 UI 로 재구성 (홈페이지 전용)
 *   - ?sim=true 시뮬레이션 모드 지원 (DB 쓰기 스킵)
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ensureAnonSession } from '../../lib/supabase-anon-session';
import BrokerVerify from './BrokerVerify';
import TermsStep from './TermsStep';
import PriceStep from './PriceStep';
import SummaryStep from './SummaryStep';
import { C, T, S } from './contractStyles';

type Step = 'verify' | 'terms' | 'price' | 'summary' | 'done';

export interface BrokerInfo {
  name: string;
  phone: string;
  isVip: boolean;
  discount?: number;
}

export interface PriceData {
  broker?: string;
  brokerPhone?: string;
  deposit?: number | string;
  rent?: number | string;
  mgmt?: number | string;
  waterFee?: string;
  cable?: string;
  exitFee?: number | string;
  moveIn?: string;
  expiry?: string;
  contractDeposit?: number | string;
  depositor?: string;
}

/* ─── 건물/호실 DB 컬럼 → camelCase 매핑 (원본 BUILDING_FIELD_MAP와 동일 원칙) ─── */
function mapRoomRow(row: any): any {
  if (!row) return null;
  return {
    ...row,
    supabaseId: row.id,
    roomNumber: row.room_number,
    roomLayout: row.room_layout,
    standardRent: row.standard_rent,
    standardDeposit: row.standard_deposit,
    standardManagementFee: row.standard_management_fee,
    standardWaterFee: row.standard_water_fee,
    standardInternetFee: row.standard_internet_fee,
    standardCleaningFee: row.standard_cleaning_fee,
    standardBrokerFee: row.standard_broker_fee,
    standardBrokerFeeRate: row.standard_broker_fee_rate,
    standardParkingType: row.standard_parking_type,
    standardParkingFee: row.standard_parking_fee,
    standardParkingRemoteDeposit: row.standard_parking_remote_deposit,
    externalParkingNote: row.external_parking_note,
    extraOccupantFee: row.extra_occupant_fee,
    rentDiscountLimit: row.rent_discount_limit,
    maxOccupants: row.max_occupants,
  };
}

function mapBuildingRow(row: any): any {
  if (!row) return null;
  return {
    ...row,
    _supabaseId: row.id,
    buildingName: row.building_name,
    isShortTermRental: row.is_short_term_rental,
    isLongTermRental: row.is_long_term_rental,
    isCommercial: row.is_commercial,
    isManagementAgency: row.is_management_agency,
    isResidentRegistrationAllowed: row.is_resident_registration_allowed,
    requiresBrokerTaxInvoice: row.requires_broker_tax_invoice,
    maxOccupants: row.max_occupants,
    parkingTotalSpaces: row.parking_total_spaces,
    contractSpecialTermsShortTerm: row.contract_special_terms_short_term,
    contractSpecialTermsLongTerm: row.contract_special_terms_long_term,
    contractSpecialTermsCommercial: row.contract_special_terms_commercial,
    depositAccountTarget: row.deposit_account_target,
    rentAccountTarget: row.rent_account_target,
    managementFeeAccountTarget: row.management_fee_account_target,
    utilityAccountTarget: row.utility_account_target,
    housemanBillingAccount: row.houseman_billing_account,
    housemanBillingAccountBank: row.houseman_billing_account_bank,
    housemanBillingAccountHolder: row.houseman_billing_account_holder,
    billingAccount1: row.billing_account_1,
    billingAccount1Bank: row.billing_account_1_bank,
    billingAccount1Holder: row.billing_account_1_holder,
    billingAccount2: row.billing_account_2,
    billingAccount2Bank: row.billing_account_2_bank,
    billingAccount2Holder: row.billing_account_2_holder,
    billingAccount3: row.billing_account_3,
    billingAccount3Bank: row.billing_account_3_bank,
    billingAccount3Holder: row.billing_account_3_holder,
    billingAccount4: row.billing_account_4,
    billingAccount4Bank: row.billing_account_4_bank,
    billingAccount4Holder: row.billing_account_4_holder,
  };
}

/* ─── 호실 유형 판별 (getRoomType 간소화 버전) ─── */
export function deriveRoomType(building: any): '단기' | '일반임대' | '근생' {
  if (!building) return '단기';
  if (building.isShortTermRental) return '단기';
  if (building.isCommercial) return '근생';
  if (building.isLongTermRental) return '일반임대';
  return '단기';
}

export default function ContractWizard(): JSX.Element {
  const [step, setStep] = useState<Step>('verify');
  const [roomData, setRoomData] = useState<any>(null);
  const [buildingData, setBuildingData] = useState<any>(null);
  const [brokerInfo, setBrokerInfo] = useState<BrokerInfo | null>(null);
  const [priceData, setPriceData] = useState<PriceData>({});
  const [termsAgreed, setTermsAgreed] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSim, setIsSim] = useState<boolean>(false);

  // URL 쿼리에서 room ID 로드
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    const simParam = urlParams.get('sim') === 'true';
    setIsSim(simParam);

    if (!roomId) {
      setLoadError('공실 정보가 선택되지 않았습니다. 공실 목록에서 다시 시도해주세요.');
      return;
    }

    (async () => {
      try {
        await ensureAnonSession();
        const { data, error } = await supabase
          .from('rooms')
          .select('*, buildings!inner(*)')
          .eq('id', roomId)
          .maybeSingle();

        if (error || !data) {
          setLoadError('공실 정보를 불러올 수 없습니다.');
          return;
        }
        const room = mapRoomRow(data);
        const building = mapBuildingRow((data as any).buildings);
        setRoomData(room);
        setBuildingData(building);
      } catch (e) {
        console.error('[ContractWizard] load error:', e);
        setLoadError('네트워크 오류입니다. 잠시 후 다시 시도해주세요.');
      }
    })();
  }, []);

  if (loadError) {
    return (
      <div style={S.content}>
        <div style={{ ...S.card, textAlign: 'center', padding: 40 }}>
          <div style={{ ...T.title, marginBottom: 8 }}>공실 정보가 없습니다</div>
          <div style={{ ...T.caption, marginBottom: 20 }}>{loadError}</div>
          <a href="/vacancies" style={{ ...S.btnPrimary, display: 'inline-block', width: 'auto', padding: '12px 24px', textDecoration: 'none', lineHeight: '28px' }}>
            공실 목록으로
          </a>
        </div>
      </div>
    );
  }

  if (!roomData || !buildingData) {
    return (
      <div style={S.content}>
        <div style={{ ...S.card, textAlign: 'center', padding: 60 }}>
          <div style={{ ...T.body, color: C.textSec }}>공실 정보 로딩 중...</div>
        </div>
      </div>
    );
  }

  const roomType = deriveRoomType(buildingData);

  /* ─── 진행 표시 (Stripe 스타일) ─── */
  const steps: Array<{ key: Step; label: string }> = [
    { key: 'verify', label: '부동산 인증' },
    { key: 'terms', label: '계약 확인' },
    { key: 'price', label: '금액 정보' },
    { key: 'summary', label: '최종 확인' },
  ];
  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div style={S.content}>
      {/* 상단 진행 표시 */}
      {step !== 'done' && (
        <div style={{ marginBottom: 24, padding: '0 4px' }}>
          <div style={{ ...T.overline, marginBottom: 12, color: C.accent }}>
            STEP {Math.max(currentIdx + 1, 1)} / {steps.length}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {steps.map((s, i) => (
              <div
                key={s.key}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 2,
                  background: i <= currentIdx ? C.accent : '#E2E8F0',
                  transition: 'background 0.3s',
                }}
              />
            ))}
          </div>
          <div style={{ ...T.caption, marginTop: 10 }}>
            {buildingData.buildingName} {roomData.roomNumber}호 · {roomType}
            {isSim && <span style={{ marginLeft: 8, color: C.accent, fontWeight: 600 }}>(시뮬레이션 모드)</span>}
          </div>
        </div>
      )}

      {step === 'verify' && (
        <BrokerVerify
          building={buildingData}
          room={roomData}
          roomType={roomType}
          isSim={isSim}
          onNext={(b) => { setBrokerInfo(b); setStep('terms'); }}
        />
      )}

      {step === 'terms' && (
        <TermsStep
          building={buildingData}
          room={roomData}
          roomType={roomType}
          brokerInfo={brokerInfo!}
          onNext={(agreed) => { setTermsAgreed(agreed); setStep('price'); }}
          onBack={() => setStep('verify')}
        />
      )}

      {step === 'price' && (
        <PriceStep
          building={buildingData}
          room={roomData}
          roomType={roomType}
          brokerInfo={brokerInfo!}
          onNext={(p) => { setPriceData(p); setStep('summary'); }}
          onBack={() => setStep('terms')}
        />
      )}

      {step === 'summary' && (
        <SummaryStep
          building={buildingData}
          room={roomData}
          roomType={roomType}
          brokerInfo={brokerInfo!}
          priceData={priceData}
          termsAgreed={termsAgreed}
          isSim={isSim}
          onComplete={() => setStep('done')}
          onBack={() => setStep('price')}
        />
      )}

      {step === 'done' && (
        <div style={{ ...S.card, textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <div style={{ ...T.display, marginBottom: 12 }}>계약 신청이 완료되었습니다</div>
          <div style={{ ...T.body, color: C.textSec, marginBottom: 32 }}>
            부동산과 건물주에게 알림이 발송되었습니다.
            <br />
            계약서 작성이 시작되면 문자로 안내드립니다.
          </div>
          <a
            href="/vacancies"
            style={{
              ...S.btnPrimary,
              display: 'inline-block',
              width: 'auto',
              padding: '14px 32px',
              textDecoration: 'none',
              lineHeight: '24px',
            }}
          >
            다른 공실 보기
          </a>
        </div>
      )}
    </div>
  );
}
