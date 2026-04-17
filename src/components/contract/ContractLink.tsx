// @ts-nocheck — SaaS 원본 JS 이식본 (타입 정리는 후속 작업)
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { ensureAnonSession } from '../../lib/supabase-anon-session';
import { checkAndCreateBrokerFeeEntry } from '../../lib/brokerFee';
import { useHousemanAccount, LEGACY_HM_FALLBACK } from '../../lib/housemanAccount';
import { PriorityRestrictionsBadge } from '../PriorityRestrictionsBadge';
import { C, T, S } from './contractStyles';

// Astro: useParams → window.location.search 로 대체 (아래 컴포넌트 내부)
// Astro: useIsMobile → 자체 구현 (utils 없음)
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

/* ══════════════════════════════════════════════════════════════
   ContractLinkPage — 전자계약 외부 링크 페이지
   /contract/:token
   부동산 → 이용자 순서로 진행
   ══════════════════════════════════════════════════════════════ */

const fmt = n => (n || 0).toLocaleString();
const IS = S.input;
const ISF = { ...S.input, borderColor: C.accent, boxShadow: '0 0 0 3px rgba(0,122,255,0.15)' };
const BTN = S.btnPrimary;
const LABEL = S.label;
const REQUIRED = { ...S.label, color: C.text };

// 주민번호 자동 하이픈
const formatSSN = v => {
  const d = v.replace(/[^0-9]/g, '').slice(0, 13);
  return d.length > 6 ? d.slice(0, 6) + '-' + d.slice(6) : d;
};
// 전화번호 자동 하이픈
const formatPhone = v => {
  const d = v.replace(/[^0-9]/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return d.slice(0, 3) + '-' + d.slice(3);
  return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
};
// 주민번호 형식 검증
const isValidSSN = v => /^\d{6}-\d{7}$/.test(v);
// 전화번호 형식 검증
const isValidPhone = v => /^01[016789]-\d{3,4}-\d{4}$/.test(v);

// 감사 로그 추가
const addAuditLog = (contract, action, detail = {}) => {
  const log = [...(contract.audit_log || []), { action, at: new Date().toISOString(), ip: '', ...detail }];
  return log;
};

// 계약서 생성 직전 live 주차 현황 조회
// — 건물 레벨 규칙(parking_total_spaces)과 만차 여부를 항상 최신 상태로 가져옴.
// — building_id 없거나 조회 실패 시 스냅샷 fallback (simulation 모드/구계약 호환).
async function resolveLiveParking(contract) {
  const buildingId = contract?.building_id;
  const snapshot = contract?.contract_data || {};
  if (!buildingId) {
    return { parkingTotalSpaces: snapshot.parkingTotalSpaces ?? null, parkingFull: !!snapshot.parkingFull };
  }
  try {
    const { checkParkingStatus } = await import('../../lib/parkingCapacity');
    const status = await checkParkingStatus(buildingId);
    return { parkingTotalSpaces: status.max, parkingFull: !!status.isFull };
  } catch (_e) {
    return { parkingTotalSpaces: snapshot.parkingTotalSpaces ?? null, parkingFull: !!snapshot.parkingFull };
  }
}

export default function ContractLink() {
  // Astro: URL 쿼리에서 token 읽음 (client:only 이므로 window 접근 가능)
  const contractId = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('token') ?? '')
    : '';
  const isMobile = useIsMobile();
  const isSimulation = contractId === 'sim';
  const primaryHmAccount = useHousemanAccount();
  const primaryHmForContract = primaryHmAccount || LEGACY_HM_FALLBACK;

  // Astro: 페이지 진입 시 익명 세션 확보 (Supabase RLS 통과용)
  useEffect(() => {
    ensureAnonSession().catch(() => { /* 세션 실패해도 조회는 시도 */ });
  }, []);

  const [contract, setContract] = useState(undefined); // undefined=로딩, null=없음/만료
  const [error, setError] = useState('');
  const [notifLog, setNotifLog] = useState([]); // 시뮬레이션 알림 로그
  const [errors, setErrors] = useState({}); // 인라인 에러 (alert 대체)
  const [focusedField, setFocusedField] = useState(''); // 현재 포커스 필드
  const [toast, setToast] = useState(''); // 토스트 메시지 (카톡 발송 등)

  // 시뮬레이션 알림 헬퍼
  const logNotif = (emoji, from, to, desc) => {
    if (!isSimulation) return;
    setNotifLog(prev => [...prev, { emoji, from, to, desc, time: new Date().toLocaleTimeString() }]);
  };

  // 단계: broker | broker_verify | tenant_identity | tenant_step2~5 | tenant_notice | tenant_sign | tenant_verify | done
  const [step, setStep] = useState('broker');
  const [loading, setLoading] = useState(false);

  // 부동산 폼
  const [brokerForm, setBrokerForm] = useState(isSimulation
    ? { phone: '010-1234-5678', name: '김부동산', office_name: '강남공인중개사', office_address: '서울시 강남구 논현로 123', office_address_detail: '2층', license_number: '제12345-2026-00001호', representative: '김부동산', email: 'broker@test.com', feeBank: '국민은행', feeAccount: '123-456-789012', feeHolder: '김부동산', tenantName: '이영희', tenantPhone: '010-9876-5432' }
    : { phone: '', name: '', office_name: '', office_address: '', office_address_detail: '', license_number: '', representative: '', email: '', feeBank: '', feeAccount: '', feeHolder: '', tenantName: '', tenantPhone: '' });
  const [brokerFeeOpen, setBrokerFeeOpen] = useState(true);
  const [brokerLoaded, setBrokerLoaded] = useState(isSimulation); // 기존 중개사 데이터 로드 여부
  const [brokerEditMode, setBrokerEditMode] = useState(!isSimulation); // false=읽기, true=편집
  const [guideOpen, setGuideOpen] = useState(!isSimulation); // 진행 안내: 신규=펼침, 기존=접힘
  const [brokerAgreedStandard, setBrokerAgreedStandard] = useState(false);
  const [brokerAgreedDeposit, setBrokerAgreedDeposit] = useState(false);
  const [brokerSmsCode, setBrokerSmsCode] = useState('');
  const [brokerSentCode, setBrokerSentCode] = useState('');

  // 이용자 폼
  const [identityName, setIdentityName] = useState(isSimulation ? '이영희' : '');
  const [identityBirth, setIdentityBirth] = useState('');
  const [identityFails, setIdentityFails] = useState(0);
  const [tenantForm, setTenantForm] = useState(isSimulation
    ? { ssn: '900315-2345678', phone: '010-9876-5432', address: '서울시 서초구 반포대로 45, 101동 502호', emergencyName: '이철수', emergencyPhone: '010-5555-6666', emergencyRelation: '부', carNumber: '12가 3456', carType: '현대 아반떼', email: '' }
    : { ssn: '', phone: '', address: '', emergencyName: '', emergencyPhone: '', emergencyRelation: '', carNumber: '', carType: '', email: '' });
  const [idCardFile, setIdCardFile] = useState(null);
  const [idCardPreview, setIdCardPreview] = useState('');
  const [agreedNotice, setAgreedNotice] = useState(false);
  const [agreedCoreNotices, setAgreedCoreNotices] = useState(false); // 이용자 첫 단계: 핵심 5가지 + 건물 고유 특약 확인
  const [tenantSmsCode, setTenantSmsCode] = useState('');
  const [tenantSentCode, setTenantSentCode] = useState('');
  const [readContract, setReadContract] = useState(false);
  const [depositorSameName, setDepositorSameName] = useState(true);
  const [depositorName, setDepositorName] = useState('');
  const [companyInfo, setCompanyInfo] = useState(null);
  const [taxInvoiceFile, setTaxInvoiceFile] = useState(null);
  const [taxInvoicePreview, setTaxInvoicePreview] = useState('');
  const [taxInvoiceStatus, setTaxInvoiceStatus] = useState(null); // null | 'verifying' | 'verified' | 'rejected'
  const [taxInvoiceMessage, setTaxInvoiceMessage] = useState('');
  const taxInvoiceRef = useRef(null);
  const fileInputRef = useRef(null);
  const contractScrollRef = useRef(false);

  // STEP 4 주차 — 진입 시 live 조회 + 제출 시 재검증 (만차 동시계약 방지)
  const [liveParking, setLiveParking] = useState(null); // {isFull, statusText, max, current, mode}
  const [parkingChecking, setParkingChecking] = useState(false);
  const [skipParking, setSkipParking] = useState(false);

  // 계약 데이터 로드
  useEffect(() => {
    if (!contractId) return;

    // ── 시뮬레이션 모드: 가짜 데이터 ──
    // 주차 가능 / 표준계약서 사용 / 세금계산서 필수 / 2개 계좌 / 2인 거주
    if (isSimulation) {
      setContract({
        id: 999, contract_token: 'sim',
        building_name: '테스트빌딩', room_number: '301',
        type: '단기', status: 'broker_pending',
        deposit: 5000000, rent: 550000, management_fee: 50000,
        internet_fee: 15000, water_fee: 10000, cleaning_fee: 150000,
        move_in: '2026-04-15', expiry: '2026-10-14',
        special_terms: '1. 퇴실 시 원상복구 의무\n2. 반려동물 입주 불가\n3. 주차 1대 등록주차',
        broker_name: '', broker_phone: '',
        tenant_name: '이영희', tenant_phone: '010-9876-5432',
        contract_data: {
          useStandardContract: true,
          parkingAvailable: true, parkingType: 'registered', parkingFee: 0, parkingRemoteDeposit: 50000,
          contractDeposit: 300000,
          requiresBrokerTaxInvoice: true,
          businessRegistrationUrl: '',
          isResidentRegistrationAllowed: false,
          maxOccupants: 2,
          operatorType: 'houseman',
          priorityRestrictionsResolved: [
            { code: 'no_corporate', label: '법인 계약 불가', icon: '🏢', critical: true },
            { code: 'no_foreigner', label: '외국인 불가', icon: '🌏', critical: true },
            { code: 'no_age_50plus', label: '50세 이상 불가', icon: '👴', critical: true },
            { code: 'no_resident_reg', label: '전입신고 불가', icon: '📋', critical: true },
            { code: 'max_occupants_limit', label: '이용 인원 최대 2인', icon: '👥', critical: true },
            { code: 'no_individual_utility', label: '전기·가스 개인 신청 불가', icon: '⚡', critical: true },
            { code: '_require_tax_invoice', label: '중개수수료 전자세금계산서 필수', icon: '🧾', critical: false, _priority: 1 },
            { code: 'no_pet', label: '반려동물 불가', icon: '🐾', critical: false, _priority: 99 },
          ],
          parkingInfo: { type: 'paid', fee: 50000, remoteDeposit: 50000 },
          extraOccupantFee: 50000,
          externalParkingNote: 'K타워 외부 주차 50% 지원, 영수증 제출 필요\n카니발/SUV 등 대형 차량 X',
          address: '서울시 강남구 테스트로 123',
          ownerName: '홍건물주', ownerPhone: '010-1111-2222',
          ownerHomeAddress: '서울시 강남구',
          ownerBusinessRegistrationNumber: '123-45-67890',
          rentalBusinessRegistrationNumber: '임대2026-001',
          accounts: {
            owner: [{ bank: '우리은행', account: '1002-123-456789', holder: '홍건물주' }],
            houseman: [{ bank: primaryHmForContract.bank, account: primaryHmForContract.account, holder: primaryHmForContract.holder }],
            ownerInitialAmount: 6000000, housemanInitialAmount: 75000,
          },
          paymentDueDay: 25, brokerFee: 300000,
        },
        audit_log: [], identity_check_failures: 0,
      });
      setCompanyInfo({ name: '하우스맨', representative: '박종호', business_registration_number: '206-16-25497', address: '서울시 강남구 학동로8길 9, 5층 하우스맨', phone: '1544-4150' });
      logNotif('📋', '시스템', '-', '시뮬레이션 모드 — 주차O / 표준계약서O / 세금계산서O / 2계좌 / 2인');
      return;
    }

    (async () => {
      const { data, error: e } = await supabase.from('contracts').select('*').eq('contract_token', contractId).maybeSingle();
      if (e || !data) { setContract(null); return; }
      if (data.expires_at && new Date(data.expires_at) < new Date() && data.status !== 'completed') { setContract(null); setError('링크가 만료되었습니다.'); return; }
      if (data.status === 'cancelled') { setContract(null); setError('계약이 취소되었습니다.'); return; }
      if ((data.identity_check_failures || 0) >= 5) { setContract(null); setError('본인확인 시도 횟수를 초과했습니다. 관리자에게 문의해주세요.'); return; }
      setContract(data);
      setIdentityFails(data.identity_check_failures || 0);
      // 하우스맨 회사 정보 로드
      const { data: ci } = await supabase.from('app_settings').select('value').eq('key', 'company_info').maybeSingle();
      if (ci?.value) setCompanyInfo(ci.value);
      if (data.status === 'broker_done' || data.status === 'broker_info_done' || data.status === 'tenant_pending') setStep('tenant_identity');
      if (data.status === 'tenant_signed') setStep('broker_contract_review');
      if (data.status === 'completed') {
        // 세금계산서 필요한데 아직 미제출이면 broker_complete로
        if (data.contract_data?.requiresBrokerTaxInvoice && data.tenant_id) {
          const { data: tenant } = await supabase.from('tenants').select('broker_tax_invoice_status').eq('id', data.tenant_id).maybeSingle();
          const status = tenant?.broker_tax_invoice_status;
          if (status === 'verified' || status === 'waived') {
            setStep('done');
          } else {
            // null/pending/rejected → 부동산이 (재)업로드하도록 broker_complete 유지
            setStep('broker_complete');
          }
        } else {
          setStep('done');
        }
      }
      if (data.contract_data?.tenantForm) {
        const saved = data.contract_data.tenantForm;
        // 저장된 폼이 있어도 phone이 비어있으면 tenant_phone으로 채움
        if (!saved.phone && data.tenant_phone) saved.phone = formatPhone(data.tenant_phone);
        setTenantForm(saved);
      } else if (data.tenant_phone) {
        setTenantForm(p => ({ ...p, phone: formatPhone(data.tenant_phone) }));
      }
      if (data.tenant_name) setIdentityName(data.tenant_name);
      if (data.contract_data?.brokerForm) setBrokerForm(data.contract_data.brokerForm);
      if (data.contract_data?.tenantStep) setStep(data.contract_data.tenantStep);
    })();
  }, [contractId]);

  // Realtime: 부동산 대기 중 이용자 완료 감지
  useEffect(() => {
    if (isSimulation || !contract?.id || step !== 'broker_waiting') return;
    const channel = supabase.channel(`contract-wait-${contract.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contracts', filter: `id=eq.${contract.id}` }, (payload) => {
        if (payload.new.status === 'tenant_signed') {
          setContract(payload.new);
          setStep('broker_contract_review');
        } else if (payload.new.status === 'completed') {
          setContract(payload.new);
          setStep('broker_complete');
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [contract?.id, step, isSimulation]);

  // Supabase 업데이트 헬퍼
  const updateContract = useCallback(async (patch) => {
    if (!contract?.id) return;
    if (isSimulation) {
      // 시뮬레이션: DB 안 건드리고 로컬 state만 업데이트
      const merged = { ...contract, ...patch };
      delete merged._action; delete merged._step;
      setContract(merged);
      return merged;
    }
    const auditLog = addAuditLog(contract, patch._action || 'update', { step: patch._step });
    delete patch._action; delete patch._step;
    const { data } = await supabase.from('contracts').update({ ...patch, audit_log: auditLog, updated_at: new Date().toISOString() }).eq('id', contract.id).select().single();
    if (data) setContract(data);
    return data;
  }, [contract, isSimulation]);

  // 이용자 중간 저장
  const saveTenantProgress = useCallback(async (nextStep) => {
    if (!contract?.id) return;
    if (isSimulation) return;
    // contracts에 진행상태 저장
    await supabase.from('contracts').update({
      contract_data: { ...(contract.contract_data || {}), tenantForm, tenantStep: nextStep },
      updated_at: new Date().toISOString(),
    }).eq('id', contract.id);
    // tenants에 직접 UPDATE (tenant_id가 있을 때)
    if (contract.tenant_id) {
      const updates = {};
      if (tenantForm.phone) updates.phone = tenantForm.phone.replace(/-/g, '');
      if (tenantForm.ssn) updates.id_number = tenantForm.ssn;
      if (tenantForm.address) updates.address = tenantForm.address;
      if (tenantForm.emergencyName) updates.emergency_contact_name = tenantForm.emergencyName;
      if (tenantForm.emergencyPhone) updates.emergency_contact_phone = tenantForm.emergencyPhone?.replace(/-/g, '');
      if (tenantForm.emergencyRelation) updates.emergency_contact_relation = tenantForm.emergencyRelation;
      if (tenantForm.carNumber) updates.car_number_1 = tenantForm.carNumber;
      if (tenantForm.carType) updates.car_type_1 = tenantForm.carType;
      if (tenantForm.depositorName) updates.payment_alias = tenantForm.depositorName;
      if (Object.keys(updates).length > 0) {
        await supabase.from('tenants').update(updates).eq('id', contract.tenant_id);
      }
    }
  }, [contract, tenantForm, isSimulation]);

  // 부동산 전화번호 자동완성
  const handleBrokerPhoneBlur = useCallback(async () => {
    if (!brokerForm.phone || brokerForm.phone.length < 10) return;
    // brokers 테이블에서 같은 전화번호 부동산 찾기
    const { data } = await supabase.from('brokers')
      .select('*')
      .eq('phone', brokerForm.phone.replace(/-/g, ''))
      .maybeSingle();
    if (data) {
      setBrokerForm(p => ({
        ...p,
        name: p.name || data.representative || '',
        representative: data.representative || p.representative || '',
        office_name: data.office_name || p.office_name || '',
        office_address: data.office_address || p.office_address || '',
        office_address_detail: data.office_address_detail || p.office_address_detail || '',
        license_number: data.license_number || p.license_number || '',
        email: data.email || p.email || '',
        feeBank: data.fee_bank || p.feeBank || '',
        feeAccount: data.fee_account || p.feeAccount || '',
        feeHolder: data.fee_holder || p.feeHolder || '',
      }));
      setBrokerLoaded(true);
      setBrokerEditMode(false);
      setGuideOpen(false);
    } else {
      setBrokerLoaded(false);
      setBrokerEditMode(true);
      setGuideOpen(true);
    }
  }, [brokerForm.phone]);

  // ──────────────────────────────────────
  // 렌더링
  // ──────────────────────────────────────

  // 토스트 자동 제거
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // STEP 4 진입 시 live 주차 현황 조회 (스냅샷이 아니라 현재 상태)
  // — 동일 건물의 다른 호실이 이미 계약 완료되어 만차가 됐을 가능성을 감지
  useEffect(() => {
    if (step !== 'tenant_step4') return;
    if (!contract?.contract_data?.parkingAvailable) return;
    if (isSimulation) {
      const snap = contract.contract_data || {};
      setLiveParking({
        isFull: !!snap.parkingFull,
        statusText: snap.parkingStatusText || '',
        max: snap.parkingTotalSpaces ?? null,
        current: 0,
        mode: snap.parkingMode || 'capped',
      });
      return;
    }
    if (!contract.building_id) return;
    let cancelled = false;
    (async () => {
      setParkingChecking(true);
      try {
        const { checkParkingStatus } = await import('../../lib/parkingCapacity');
        const status = await checkParkingStatus(contract.building_id);
        if (!cancelled) setLiveParking(status);
      } finally {
        if (!cancelled) setParkingChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [step, contract?.id, contract?.building_id, isSimulation]);

  // 에러 헬퍼: 특정 필드 에러 표시 컴포넌트
  const FieldError = ({ field }) => {
    if (!errors[field]) return null;
    return <div style={S.errorText}>{errors[field]}</div>;
  };

  // 인풋 스타일 헬퍼 (포커스 + 에러)
  const inputStyle = (field, extra = {}) => ({
    ...IS,
    ...(focusedField === field ? ISF : {}),
    ...(errors[field] ? S.inputError : {}),
    ...extra,
  });

  // 로딩
  if (contract === undefined) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...T.body, color: C.textSec }}>불러오는 중...</div>
    </div>
  );

  // 없음/만료/파기
  if (!contract) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: 32 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="1.5"><path d="M9 12h6m-3-3v6m-3 6h6a3 3 0 003-3V6a3 3 0 00-3-3H9a3 3 0 00-3 3v12a3 3 0 003 3z"/></svg>
        </div>
        <div style={{ ...T.title, marginBottom: 8 }}>{error || '계약서를 찾을 수 없습니다'}</div>
        <div style={{ ...T.body, color: C.textSec }}>링크가 만료되었거나 잘못된 주소입니다.</div>
      </div>
    </div>
  );

  // 표준계약서 사용 여부 (건물 설정)
  const useStandard = contract.type === '단기' && contract.contract_data?.useStandardContract;
  const parkingAvailable = contract.contract_data?.parkingAvailable;
  const buildingName = contract.building_name || '';
  const roomNumber = contract.room_number || '';

  // 프로그레스 바 계산
  const getProgress = () => {
    const brokerSteps = ['broker', 'broker_waiting', 'broker_contract_review', 'broker_complete'];
    const tenantSteps = ['tenant_identity', 'tenant_step2', 'tenant_step3', 'tenant_step4', 'tenant_step5', 'tenant_sign', 'tenant_verify', 'tenant_done'];
    const isBrokerPhase = brokerSteps.includes(step);
    if (isBrokerPhase) {
      const total = 3;
      const idx = step === 'broker' ? 1 : step === 'broker_waiting' ? 2 : 3;
      return { current: idx, total };
    }
    const total = parkingAvailable ? 7 : 6;
    const map = { tenant_identity: 1, tenant_step2: 2, tenant_step3: 3, tenant_step4: 4, tenant_step5: parkingAvailable ? 5 : 4, tenant_sign: parkingAvailable ? 6 : 5, tenant_verify: parkingAvailable ? 7 : 6, tenant_done: parkingAvailable ? 7 : 6 };
    return { current: map[step] || 1, total };
  };

  // 공통 컴포넌트
  const Header = () => {
    const canGoBack = step !== 'broker' && step !== 'done' && step !== 'tenant_done' && step !== 'broker_waiting' && step !== 'broker_complete' && step !== 'broker_contract_review';
    const prevMap = { broker_verify: 'broker', tenant_identity: null, tenant_step2: 'tenant_identity', tenant_step3: 'tenant_step2', tenant_step4: 'tenant_step3', tenant_step5: parkingAvailable ? 'tenant_step4' : 'tenant_step3', tenant_sign: 'tenant_step5', tenant_verify: 'tenant_sign' };
    return (
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '12px 20px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {canGoBack && prevMap[step] ? (
            <button onClick={() => setStep(prevMap[step])} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round"><path d="M15 19l-7-7 7-7"/></svg>
            </button>
          ) : <div style={{ width: 28 }} />}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ ...T.overline, textTransform: 'uppercase' }}>HOUSEMAN 전자계약</div>
            <div style={{ ...T.headline, marginTop: 2 }}>{buildingName} {roomNumber}호</div>
            {contract?.is_proxy && (
              <div style={{ marginTop: 4, padding: '3px 10px', background: '#EBF0FF', borderRadius: 4, display: 'inline-block', fontSize: 10, fontWeight: 700, color: '#346aff' }}>
                📋 대행 모드 — {contract.proxy_staff_id || '담당자'}
              </div>
            )}
          </div>
          <div style={{ width: 28 }} />
        </div>
        {/* Progress bar */}
        {step !== 'done' && step !== 'tenant_done' && step !== 'broker_complete' && (() => {
          const { current, total } = getProgress();
          return (
            <div style={{ maxWidth: 520, margin: '8px auto 0', display: 'flex', gap: 3 }}>
              {Array.from({ length: total }, (_, i) => (
                <div key={i} style={{ flex: 1, height: 3, borderRadius: 1.5, background: i < current ? C.text : C.border, transition: 'background 0.3s' }} />
              ))}
            </div>
          );
        })()}
      </div>
    );
  };

  const Footer = () => (
    <div style={{ marginTop: 32, padding: 16, fontSize: 11, color: C.textSec, textAlign: "center", lineHeight: 1.6 }}>
      HOUSEMAN 하우스맨<br/>문의: 02-1544-4150
    </div>
  );

  // 토스트 컴포넌트
  const Toast = () => toast ? (
    <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: C.text, color: '#fff', padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 600, zIndex: 100, maxWidth: 340, textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'fadeUp 0.3s ease' }}>
      {toast}
    </div>
  ) : null;

  // 완료 화면
  if (step === 'done' && !isSimulation) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", background: C.card }}>
      <style>{`
        @keyframes circleScale { 0% { transform: scale(0); } 70% { transform: scale(1.15); } 100% { transform: scale(1); } }
        @keyframes checkDraw { 0% { stroke-dashoffset: 24; } 100% { stroke-dashoffset: 0; } }
        @keyframes fadeUp { 0% { opacity: 0; transform: translateY(16px); } 100% { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div style={{ textAlign: "center", padding: 32, maxWidth: 400 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: C.success, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', animation: 'circleScale 0.5s ease' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'checkDraw 0.4s ease 0.3s both' }}>
            <polyline points="20 6 9 17 4 12" style={{ strokeDasharray: 24, strokeDashoffset: 0 }} />
          </svg>
        </div>
        <div style={{ ...T.title, color: C.text, marginBottom: 8, animation: 'fadeUp 0.5s ease 0.4s both' }}>계약 체결이 완료되었습니다{contract?.is_proxy ? ' (대행)' : ''}</div>
        <div style={{ ...T.body, color: C.textSec, lineHeight: 1.6, animation: 'fadeUp 0.5s ease 0.5s both' }}>
          {buildingName} {roomNumber}호 이용 계약이 완료되었습니다.<br/>
          입주 안내는 별도로 연락드리겠습니다.
        </div>
        {contract?.is_proxy && (
          <div style={{ marginTop: 16, padding: '10px 16px', background: '#EBF0FF', borderRadius: 8, fontSize: 11, color: '#346aff', fontWeight: 600, animation: 'fadeUp 0.5s ease 0.6s both' }}>
            📋 담당자 대행 계약 — 부동산에게 계약서와 "24시간 내 이의 시 연락" 안내가 발송됩니다.
          </div>
        )}
      </div>
    </div>
  );

  // 시뮬레이션 완료 → 부동산 시점 전환
  if (step === 'done' && isSimulation) return (
    <div style={S.page}>
      <style>{`
        @keyframes circleScale { 0% { transform: scale(0); } 70% { transform: scale(1.15); } 100% { transform: scale(1); } }
        @keyframes checkDraw { 0% { stroke-dashoffset: 24; } 100% { stroke-dashoffset: 0; } }
        @keyframes fadeUp { 0% { opacity: 0; transform: translateY(16px); } 100% { opacity: 1; transform: translateY(0); } }
      `}</style>
      <Header />
      <div style={S.content}>

        {/* 이용자 완료 */}
        <div style={{ ...S.card, textAlign: "center", marginTop: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.success, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div style={{ ...T.title, fontSize: 18, color: C.success }}>이용자 전자서명 완료</div>
          <div style={{ ...T.caption, marginTop: 4 }}>{identityName} -- SMS 인증 완료</div>
        </div>

        {/* 부동산 시점: 카톡/이메일 수신 */}
        <div style={S.card}>
          <div style={{ ...T.headline, marginBottom: 16 }}>부동산 수신 화면</div>
          <div style={{ padding: 14, background: '#FFFBEB', borderRadius: 10, marginBottom: 16 }}>
            <div style={{ ...T.subhead, color: C.accent, marginBottom: 8 }}>카카오톡 수신</div>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
{`[하우스맨] ${buildingName} ${roomNumber}호 계약서 서명 완료

이용자 전자서명이 완료되었습니다.
아래 링크에서 계약서를 다운로드하여
직인 후 보관해주세요.

> 계약서 다운로드
${window.location.origin}/contract/test`}
            </div>
          </div>

          <div style={{ padding: 14, background: C.bg, borderRadius: 10, marginBottom: 16 }}>
            <div style={{ ...T.subhead, color: C.accent, marginBottom: 8 }}>이메일 수신</div>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
              <div>제목: [하우스맨] {buildingName} {roomNumber}호 단기시설이용계약서</div>
              <div>첨부: 단기시설이용계약서_{buildingName}_{roomNumber}호.docx</div>
            </div>
          </div>

          <button onClick={async () => {
            try {
              const mod = await import('../../lib/contractGenerator');
              const signedAt = new Date().toLocaleString();
              const live = await resolveLiveParking(contract);
              const blob = await mod.generateShortTermContract({
                building: { building_name: buildingName, address_road: '서울시 강남구 테스트로 123', owner_name: '홍건물주', owner_phone: '010-1111-2222', owner_home_address: '서울시 강남구', owner_business_registration_number: '123-45-67890', parking_total_spaces: live.parkingTotalSpaces, contract_special_terms_short_term: contract.special_terms || '' },
                room: { room_number: roomNumber },
                contract: { deposit: contract.deposit, rent: contract.rent, management_fee: contract.management_fee, move_in_date: contract.move_in, contract_end_date: contract.expiry, payment_due_day: '25', contract_data: contract.contract_data || {} },
                tenant: { name: identityName || '테스트이용자', phone: '010-9876-5432', ssn: tenantForm.ssn || '900315-2345678', address: tenantForm.address },
                broker: { ...brokerForm },
                accounts: { owner: [{ bank: '우리은행', account: '1002-123-456789', holder: '홍건물주' }] },
                parking: { type: contract.contract_data?.parkingType || (parkingAvailable ? 'first_come' : 'none'), fee: contract.contract_data?.parkingFee || 0, remoteDeposit: contract.contract_data?.parkingRemoteDeposit || 0, carNumber: tenantForm.carNumber, carType: tenantForm.carType || '' },
                parkingFull: live.parkingFull,
                parkingStatusText: contract.contract_data?.parkingStatusText || '',
                signatures: {
                  tenant: { signedAt, authCode: tenantSmsCode || '483921', phone: contract.tenant_phone || '010-9876-5432' },
                  houseman: true,
                  broker: { verifiedAt: contract.broker_verified_at || new Date().toLocaleString(), phone: brokerForm.phone },
                },
                companyInfo: companyInfo || {},
                operatorType: contract.contract_data?.operatorType || 'houseman',
                isResidentRegistrationAllowed: contract.contract_data?.isResidentRegistrationAllowed || false,
                maxOccupants: contract.contract_data?.maxOccupants || 2,
                contractDeposit: contract.contract_data?.contractDeposit || 0,
              });
              mod.downloadBlob(blob, `단기시설이용계약서_${buildingName}_${roomNumber}호.docx`);
              logNotif('📥', '부동산', '-', `계약서 DOCX 다운로드 완료 → 출력 후 직인 예정`);
            } catch (err) {
              setToast('계약서 생성 오류: ' + err.message);
            }
          }}
            style={{ ...BTN, marginBottom: 8 }}>
            단기시설이용계약서 다운로드
          </button>

          {/* 표준임대차계약서 DOCX */}
          {useStandard && (
            <>
              <button onClick={async () => {
                try {
                  const now = new Date().toLocaleString('ko-KR');
                  const buildingData = { building_name: buildingName, address_road: '서울시 강남구 테스트로 123', owner_name: '홍건물주', owner_phone: '010-1111-2222', owner_home_address: '서울시 강남구', owner_business_registration_number: '123-45-67890', housing_type: '다가구주택', hide_deposit_in_contract: false };
                  const data = {
                    building: buildingData,
                    room: { room_number: roomNumber },
                    contract: {
                      deposit: contract.deposit, rent: contract.rent,
                      move_in_date: contract.move_in, contract_end_date: contract.expiry,
                      payment_due_day: contract.contract_data?.paymentDueDay || '25',
                      contract_date: new Date().toISOString().slice(0, 10),
                      account: { number: '123-456-789012', bank: '하나은행', holder: '홍건물주' },
                    },
                    tenant: { name: identityName || '테스트이용자', phone: contract.tenant_phone || '010-9876-5432', address: tenantForm.address, ssn: tenantForm.ssn || '' },
                    broker: { ...brokerForm },
                    signatures: {
                      houseman: { signedAt: now },
                      tenant: { signedAt: now, phone: contract.tenant_phone || '010-9876-5432' },
                      broker: { verifiedAt: now, phone: brokerForm.phone || '' },
                    },
                    companyInfo,
                  };
                  const docxMod = await import('../../lib/standardContract');
                  const docxBlob = await docxMod.generateStandardContractDOCX(data);
                  docxMod.downloadDocxBlob(docxBlob, `표준임대차계약서_${buildingName}_${roomNumber}호.docx`);
                } catch (err) { setToast('생성 오류: ' + err.message); }
              }}
                style={{ ...S.btnSecondary, marginBottom: 8 }}>
                표준임대차계약서(DOCX) 다운로드
              </button>
              <button onClick={async () => {
                try {
                  const buildingData = { building_name: buildingName, address_road: '서울시 강남구 테스트로 123', owner_name: '홍건물주', owner_phone: '010-1111-2222', owner_resident_number: '123456', rental_business_registration_number: '123-45-67890' };
                  const data = {
                    building: buildingData,
                    room: { room_number: roomNumber },
                    contract: { deposit: contract.deposit, move_in_date: contract.move_in, contract_end_date: contract.expiry },
                    tenant: { name: identityName || '테스트이용자', phone: contract.tenant_phone || '010-9876-5432', ssn: tenantForm.ssn || '' },
                    companyInfo,
                  };
                  const docxMod = await import('../../lib/standardContract');
                  const waiverBlob = await docxMod.generateDepositWaiverDOCX(data);
                  docxMod.downloadDocxBlob(waiverBlob, `보증금미가입동의서_${buildingName}_${roomNumber}호.docx`);
                } catch (err) { setToast('생성 오류: ' + err.message); }
              }}
                style={{ ...S.btnSecondary, marginBottom: 8 }}>
                보증금미가입동의서(DOCX) 다운로드
              </button>
            </>
          )}
          <div style={{ ...T.caption, textAlign: "center" }}>다운로드 후 출력 → 직인 → 이용자에게 전달</div>
        </div>

        {/* 전자인증 결과 */}
        <div style={S.card}>
          <div style={{ ...T.headline, marginBottom: 16 }}>전자인증 정보</div>

          {/* 부동산 인증 */}
          <div style={{ padding: 14, background: C.bg, borderRadius: 10, marginBottom: 12 }}>
            <div style={{ ...T.subhead, color: C.text, marginBottom: 10 }}>부동산 전자인증</div>
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "6px 8px", fontSize: 13, color: C.text }}>
              <div style={{ color: C.textSec }}>대표자</div><div style={{ fontWeight: 600 }}>{brokerForm.representative || '김부동산'}</div>
              <div style={{ color: C.textSec }}>연락처</div><div style={{ fontWeight: 600 }}>{brokerForm.phone || '010-1234-5678'}</div>
              <div style={{ color: C.textSec }}>상호</div><div style={{ fontWeight: 600 }}>{brokerForm.office_name || '-'}</div>
              <div style={{ color: C.textSec }}>인증방식</div><div style={{ fontWeight: 600 }}>SMS 본인인증 (동의 체크)</div>
              <div style={{ color: C.textSec }}>인증시각</div><div style={{ fontWeight: 600 }}>{new Date().toLocaleString()}</div>
              <div style={{ color: C.textSec }}>인증번호</div><div style={{ fontWeight: 600, fontFamily: "monospace" }}>{brokerSentCode || '(표준계약서 미사용 -- 인증 생략)'}</div>
              <div style={{ color: C.textSec }}>상태</div><div><span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: '#E8F5E9', color: C.success, fontWeight: 600 }}>인증 완료</span></div>
            </div>
          </div>

          {/* 이용자 전자서명 */}
          <div style={{ padding: 14, background: C.bg, borderRadius: 10, marginBottom: 12 }}>
            <div style={{ ...T.subhead, color: C.text, marginBottom: 10 }}>이용자 전자서명</div>
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "6px 8px", fontSize: 13, color: C.text }}>
              <div style={{ color: C.textSec }}>이름</div><div style={{ fontWeight: 600 }}>{identityName || '테스트이용자'}</div>
              <div style={{ color: C.textSec }}>연락처</div><div style={{ fontWeight: 600 }}>{contract.tenant_phone || '010-9876-5432'}</div>
              <div style={{ color: C.textSec }}>주민번호</div><div style={{ fontWeight: 600, fontFamily: "monospace" }}>{tenantForm.ssn ? tenantForm.ssn.slice(0, 8) + '*****' : '-'}</div>
              <div style={{ color: C.textSec }}>인증방식</div><div style={{ fontWeight: 600 }}>SMS 본인인증 + 전자서명</div>
              <div style={{ color: C.textSec }}>서명시각</div><div style={{ fontWeight: 600 }}>{new Date().toLocaleString()}</div>
              <div style={{ color: C.textSec }}>인증번호</div><div style={{ fontWeight: 600, fontFamily: "monospace" }}>{tenantSmsCode || tenantSentCode || '123456'}</div>
              <div style={{ color: C.textSec }}>신분증</div><div>{idCardFile ? <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: '#E8F5E9', color: C.success, fontWeight: 600 }}>업로드 완료 ({idCardFile.name})</span> : <span style={{ color: C.textSec }}>미업로드</span>}</div>
              <div style={{ color: C.textSec }}>동의항목</div>
              <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                <div>고지사항 전체 동의</div>
                <div>계약서 전문 확인 및 동의</div>
              </div>
              <div style={{ color: C.textSec }}>상태</div><div><span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: '#E8F5E9', color: C.success, fontWeight: 600 }}>서명 완료</span></div>
            </div>
          </div>

          {/* 하우스맨 전자인감 */}
          <div style={{ padding: 14, background: C.bg, borderRadius: 10 }}>
            <div style={{ ...T.subhead, color: C.text, marginBottom: 10 }}>하우스맨 전자인감</div>
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "6px 8px", fontSize: 13, color: C.text }}>
              <div style={{ color: C.textSec }}>회사명</div><div style={{ fontWeight: 600 }}>하우스맨</div>
              <div style={{ color: C.textSec }}>대표</div><div style={{ fontWeight: 600 }}>박종호</div>
              <div style={{ color: C.textSec }}>사업자번호</div><div style={{ fontWeight: 600, fontFamily: "monospace" }}>206-16-25497</div>
              <div style={{ color: C.textSec }}>인감방식</div><div style={{ fontWeight: 600 }}>전자인감 자동 삽입 (미준비 -- 추후 적용)</div>
              <div style={{ color: C.textSec }}>적용시각</div><div style={{ fontWeight: 600 }}>{new Date().toLocaleString()}</div>
              <div style={{ color: C.textSec }}>상태</div><div><span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: '#FFF3E0', color: C.accent, fontWeight: 600 }}>전자인감 이미지 준비 필요</span></div>
            </div>
          </div>
        </div>

        {/* 하우스맨 시점: 자동 처리 */}
        <div style={S.card}>
          <div style={{ ...T.headline, marginBottom: 12 }}>하우스맨 시스템 자동 처리</div>
          <div style={{ fontSize: 13, lineHeight: 2, color: C.text }}>
            <div>contractEntered = true 자동 처리</div>
            <div>contracts → tenants 정식 등록</div>
            <div>이용자: {identityName} | {tenantForm.ssn ? '주민번호 확인' : ''} | {tenantForm.email || ''}</div>
            <div>비상연락처: {tenantForm.emergencyName || '-'} ({tenantForm.emergencyRelation || '-'}) {tenantForm.emergencyPhone || '-'}</div>
            <div>차량: {tenantForm.carNumber || '없음'}{tenantForm.carType ? ` (${tenantForm.carType})` : ''}</div>
            <div>신분증: {idCardFile ? `업로드 완료 (${idCardFile.name})` : '미업로드'}</div>
            <div>감사 로그: 부동산 입력 → 이용자 본인확인 → 정보입력(6단계) → 고지사항 동의 → 계약서 확인 → 전자서명</div>
          </div>
        </div>

        {/* 시뮬레이션 알림 로그 */}
        {notifLog.length > 0 && (
          <div style={{ padding: 16, background: "#1e1e1e", borderRadius: 12, border: "1px solid #333" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#FEE500" }}>🟡 전체 알림 로그</div>
              <div style={{ fontSize: 11, color: "#666" }}>{notifLog.length}건</div>
            </div>
            {notifLog.map((n, i) => (
              <div key={i} style={{ padding: "6px 0", borderBottom: i < notifLog.length - 1 ? "1px solid #333" : "none", fontSize: 12, lineHeight: 1.6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ flexShrink: 0 }}>{n.emoji}</span>
                  <div>
                    <span style={{ color: "#4FC3F7", fontWeight: 700 }}>{n.from}</span>
                    <span style={{ color: "#666" }}> → </span>
                    <span style={{ color: "#81C784", fontWeight: 700 }}>{n.to}</span>
                    <span style={{ color: "#999", marginLeft: 8, fontSize: 10 }}>{n.time}</span>
                    <div style={{ color: "#ccc", marginTop: 2 }}>{n.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 20, textAlign: "center" }}>
          <button onClick={() => { setStep('broker'); setNotifLog([]); setAgreedNotice(false); setReadContract(false); setBrokerForm({ phone: '010-1234-5678', name: '김부동산', office_name: '강남공인중개사', office_address: '서울시 강남구 논현로 123', office_address_detail: '2층', license_number: '제12345-2026-00001호', representative: '김부동산' }); setTenantForm({ ssn: '900315-2345678', address: '서울시 서초구 반포대로 45', emergencyName: '이철수', emergencyPhone: '010-5555-6666', emergencyRelation: '부', carNumber: '12가 3456', carType: '현대 아반떼', email: '' }); setIdentityName('이영희'); setIdCardFile(null); setIdCardPreview(''); }}
            style={{ ...S.btnSecondary, width: 'auto', display: 'inline-block', padding: '12px 24px' }}>
            시뮬레이션 다시 시작
          </button>
        </div>

        <Footer />
      </div>
    </div>
  );

  // 계약 정보 관련 변수
  const accts = contract.contract_data?.accounts || {};
  const ownerInit = accts.ownerInitialAmount || 0;
  const hmInit = accts.housemanInitialAmount || 0;
  const payDay = contract.contract_data?.paymentDueDay || '';

  const Summary = () => (
    <div style={S.card}>
      <div style={{ ...T.subhead, marginBottom: 12 }}>이용 조건</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 14 }}>
        <div style={{ color: C.textSec }}>A. 시설이용 예치금</div><div style={{ fontWeight: 600 }}>{fmt(contract.deposit)}원</div>
        <div style={{ color: C.textSec }}>B. 이용요금 (선불)</div><div style={{ fontWeight: 600, color: C.danger }}>{fmt(contract.rent)}원</div>
        {contract.management_fee > 0 && <><div style={{ color: C.textSec }}>C. 관리비 (선불)</div><div style={{ fontWeight: 600 }}>{fmt(contract.management_fee)}원</div></>}
        {contract.internet_fee > 0 && <><div style={{ color: C.textSec }}>D. TV/인터넷 (선불)</div><div style={{ fontWeight: 600 }}>{fmt(contract.internet_fee)}원</div></>}
        {contract.water_fee > 0 && <><div style={{ color: C.textSec }}>E. 수도세 (선불)</div><div style={{ fontWeight: 600 }}>{fmt(contract.water_fee)}원</div></>}
        <div style={{ color: C.textSec }}>F. 전기/가스</div><div style={{ fontWeight: 600, color: C.danger }}>후불 (개인 신청 불가)</div>
        {contract.contract_data?.parkingRemoteDeposit > 0 && <><div style={{ color: C.textSec }}>G. 주차 리모컨 보증금</div><div style={{ fontWeight: 600 }}>{fmt(contract.contract_data.parkingRemoteDeposit)}원 (반환)</div></>}
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 14 }}>
          <div style={{ color: C.textSec }}>이용기간</div><div style={{ fontWeight: 600 }}>{contract.move_in} ~ {contract.expiry}</div>
          {payDay && <><div style={{ color: C.textSec }}>납입일</div><div style={{ fontWeight: 600 }}>매월 {payDay}일</div></>}
          {contract.cleaning_fee > 0 && <><div style={{ color: C.textSec }}>퇴실청소비</div><div style={{ fontWeight: 600 }}>{fmt(contract.cleaning_fee)}원 (이용종료 시)</div></>}
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 12 }}>
        <div style={{ ...T.subhead, marginBottom: 12 }}>초기납입금 안내</div>
        {(() => {
          const hasDouble = accts.owner?.length > 0 && accts.houseman?.length > 0;
          const contractDep = contract.contract_data?.contractDeposit || 0;
          const remDep = contract.contract_data?.parkingRemoteDeposit || 0;
          const dep = contract.deposit || 0;
          const rent = contract.rent || 0;
          const mgmt = contract.management_fee || 0;
          const inet = contract.internet_fee || 0;
          const water = contract.water_fee || 0;

          if (hasDouble) {
            // 2개 계좌: 항목별로 어느 계좌인지 분리
            const oa = accts.owner[0];
            const ha = accts.houseman[0];
            const ownerItems = [];
            const hmItems = [];

            // ownerInitialAmount/housemanInitialAmount이 있으면 그대로 사용
            // 항목 내역은 계좌 모드에 따라 다르지만, 핵심은 예치금+월세 계열 vs 관리비 계열
            // 예치금(보증금)은 항상 건물주 계좌
            ownerItems.push({ label: '시설이용 예치금', amount: dep });
            if (ownerInit > dep) ownerItems.push({ label: '이용요금 등', amount: ownerInit - dep });
            if (contractDep > 0) ownerItems.push({ label: '계약금 차감 (입금 완료)', amount: -contractDep });
            if (remDep > 0) ownerItems.push({ label: '주차 리모컨 보증금 (반환)', amount: remDep });

            if (hmInit > 0) hmItems.push({ label: '관리비·공과금 등', amount: hmInit });

            const ownerTotal = ownerItems.reduce((s, it) => s + it.amount, 0);
            const hmTotal = hmItems.reduce((s, it) => s + it.amount, 0);

            return (<>
              {/* 1 건물주 계좌 */}
              <div style={{ padding: 14, background: C.bg, borderRadius: 12, marginBottom: 10 }}>
                <div style={{ ...T.caption, marginBottom: 2 }}>1) {oa.holder} 계좌</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.accent, marginBottom: 6 }}>{fmt(ownerTotal)}원</div>
                <div style={{ fontSize: 13, color: C.text, marginBottom: 6 }}>{oa.bank} {oa.account} (예금주: {oa.holder})</div>
                <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.8 }}>
                  {ownerItems.map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", color: it.amount < 0 ? C.danger : undefined }}>
                      <span>{it.amount < 0 ? '*' : `${i + 1}.`} {it.label}</span><span>{it.amount < 0 ? '-' : ''}{fmt(Math.abs(it.amount))}원</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* 2 하우스맨 계좌 */}
              {hmTotal > 0 && (
                <div style={{ padding: 14, background: C.bg, borderRadius: 12, marginBottom: 10 }}>
                  <div style={{ ...T.caption, marginBottom: 2 }}>2) {ha.holder} 계좌</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.success, marginBottom: 6 }}>{fmt(hmTotal)}원</div>
                  <div style={{ fontSize: 13, color: C.text, marginBottom: 6 }}>{ha.bank} {ha.account} (예금주: {ha.holder})</div>
                  <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.8 }}>
                    {hmItems.map((it, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>{i + 1}. {it.label}</span><span>{fmt(it.amount)}원</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>);
          } else {
            // 1개 계좌
            const acc = accts.owner?.[0] || accts.houseman?.[0];
            const items = [];
            items.push({ label: '시설이용 예치금', amount: dep });
            items.push({ label: '이용요금', amount: rent });
            if (mgmt > 0) items.push({ label: '관리비', amount: mgmt });
            if (inet > 0) items.push({ label: 'TV/인터넷', amount: inet });
            if (water > 0) items.push({ label: '수도세', amount: water });
            if (remDep > 0) items.push({ label: '주차 리모컨 보증금 (반환)', amount: remDep });
            if (contractDep > 0) items.push({ label: '계약금 차감 (입금 완료)', amount: -contractDep });
            const total = items.reduce((s, it) => s + it.amount, 0);

            return acc ? (
              <div style={{ padding: 14, background: C.bg, borderRadius: 12, marginBottom: 10 }}>
                <div style={{ ...T.caption, marginBottom: 2 }}>{acc.holder} 계좌</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.accent, marginBottom: 6 }}>{fmt(total)}원</div>
                <div style={{ fontSize: 13, color: C.text, marginBottom: 6 }}>{acc.bank} {acc.account} (예금주: {acc.holder})</div>
                <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.8 }}>
                  {items.map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", color: it.amount < 0 ? C.danger : undefined }}>
                      <span>{it.amount < 0 ? '*' : `${i + 1}.`} {it.label}</span><span>{it.amount < 0 ? '-' : ''}{fmt(Math.abs(it.amount))}원</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          }
        })()}
        <div style={{ ...T.caption, marginTop: 6 }}>* 퇴실청소비/전기가스는 별도</div>
        <div style={{ ...T.caption, color: C.accent, marginTop: 4 }}>이 정보는 이용자에게 카톡으로 따로 발송됩니다.</div>
      </div>

    </div>
  );

  return (
    <div style={S.page}>
      <style>{`
        @keyframes fadeUp { 0% { opacity: 0; transform: translateY(16px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
      `}</style>
      <Header />
      <Toast />
      {/* 시뮬레이션: 역할 표시 배너 */}
      {isSimulation && (() => {
        const isBrokerPhase = step === 'broker' || step === 'broker_waiting' || step === 'broker_contract_review' || step === 'broker_complete';
        const role = isBrokerPhase ? '부동산(중개사) 화면' : step === 'done' ? '완료' : '이용자(임차인) 화면';
        const bg = isBrokerPhase ? C.accent : step === 'done' ? C.success : '#1E3A5F';
        const stepMap = { broker: '정보 입력', broker_waiting: '이용자 대기 중', broker_contract_review: '계약서 확인 + SMS 인증', broker_complete: '계약 완료 (부동산)', tenant_identity: '본인확인', tenant_step2: '주소', tenant_step3: '비상연락처', tenant_step4: '차량정보', tenant_step5: '신분증 촬영', tenant_sign: '계약서 확인', tenant_verify: 'SMS 본인 인증', tenant_done: '입력 완료', done: '계약 완료' };
        return (
          <div style={{ background: bg, padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{role}</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{stepMap[step] || step}</span>
          </div>
        );
      })()}
      <div style={S.content}>
        {/* ════════ 계약 진행 안내 (아코디언) ════════ */}
        {step === 'broker' && (
          <div style={{ ...S.card, marginTop: 20, overflow: "hidden", padding: 0 }}>
            <div onClick={() => setGuideOpen(p => !p)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", cursor: "pointer", userSelect: "none" }}>
              <div>
                <div style={T.headline}>전자계약 진행 안내</div>
                {!guideOpen && <div style={{ ...T.caption, marginTop: 2 }}>총 {contract.contract_data?.requiresBrokerTaxInvoice ? '6' : '5'}단계 · 약 10분 소요</div>}
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2" strokeLinecap="round" style={{ transition: "transform 0.2s", transform: guideOpen ? "rotate(180deg)" : "rotate(0deg)" }}><path d="M6 9l6 6 6-6"/></svg>
            </div>
            {guideOpen && <div style={{ padding: "0 24px 24px" }}>
            <div style={{ ...T.caption, marginBottom: 14 }}>처음 계약하시는 중개사님은 꼼꼼히 읽어주세요.</div>

            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.9 }}>
              {/* STEP 1 */}
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <span style={{ background: C.text, color: "#fff", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, flexShrink: 0, height: "fit-content", marginTop: 2 }}>1</span>
                <div>
                  <div style={{ fontWeight: 600 }}>중개사님이 정보를 입력합니다</div>
                  <div style={{ fontSize: 12, color: C.textSec }}>이용자 이름/연락처, 중개사 정보, 수수료 계좌를 입력해주세요. 전화번호 입력 시 이전에 등록된 정보가 자동으로 불러와집니다. 부동산이 바뀌었거나 계좌정보가 변경된 경우에는 수정해주세요.</div>
                </div>
              </div>
              {/* STEP 2 */}
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <span style={{ background: C.text, color: "#fff", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, flexShrink: 0, height: "fit-content", marginTop: 2 }}>2</span>
                <div>
                  <div style={{ fontWeight: 600 }}>이용자에게 링크가 자동 발송됩니다</div>
                  <div style={{ fontSize: 12, color: C.textSec }}>중개사님이 입력을 완료하면, 이용자에게 초기납입금 안내 + 계약서 작성 링크가 SMS로 발송됩니다. 이용자가 작성을 완료할 때까지 대기 화면이 표시됩니다.</div>
                </div>
              </div>
              {/* STEP 3 */}
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <span style={{ background: C.text, color: "#fff", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, flexShrink: 0, height: "fit-content", marginTop: 2 }}>3</span>
                <div>
                  <div style={{ fontWeight: 600 }}>이용자가 정보 입력 + SMS 본인 인증을 합니다</div>
                  <div style={{ fontSize: 12, color: C.textSec }}>이용자가 본인확인(이름·연락처·주민등록번호), 주소, 비상연락처, 차량정보, 신분증 촬영, 고지사항 동의, 계약서 확인 후 SMS 인증을 진행합니다.</div>
                </div>
              </div>
              {/* STEP 4 */}
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <span style={{ background: C.text, color: "#fff", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, flexShrink: 0, height: "fit-content", marginTop: 2 }}>4</span>
                <div>
                  <div style={{ fontWeight: 600 }}>중개사님이 계약서 최종 확인 + SMS 인증</div>
                  <div style={{ fontSize: 12, color: C.textSec }}>이용자 작성이 완료되면 화면이 자동 전환됩니다. 계약서 내용을 확인한 후, 중개사님의 SMS 인증으로 계약이 최종 체결됩니다.</div>
                </div>
              </div>
              {/* STEP 5 */}
              {contract.contract_data?.requiresBrokerTaxInvoice ? (<>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <span style={{ background: C.danger, color: "#fff", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, flexShrink: 0, height: "fit-content", marginTop: 2 }}>5</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>세금계산서 제출</div>
                    <div style={{ fontSize: 12, color: C.textSec }}>이 건물은 중개수수료 지급 시 세금계산서가 필요합니다. 계약 완료 후 세금계산서 사진/캡처를 업로드해주세요. 지금 바로 안 올려도 되며, 이 링크로 다시 접속하면 언제든 제출할 수 있습니다.</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ background: C.success, color: "#fff", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, flexShrink: 0, height: "fit-content", marginTop: 2 }}>6</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>계약 체결 완료</div>
                    <div style={{ fontSize: 12, color: C.textSec }}>계약서 다운로드 + 세금계산서 제출 + 잔금 입금이 완료되면 자동으로 계약절차가 끝나고, 이용자에게 주소/현관비밀번호/호실비밀번호가 전송됩니다. 중개수수료는 평일 기준 1일 이내에 입금됩니다. (주말·공휴일인 경우 다음 평일)</div>
                  </div>
                </div>
              </>) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ background: C.success, color: "#fff", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, flexShrink: 0, height: "fit-content", marginTop: 2 }}>5</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>계약 체결 완료</div>
                    <div style={{ fontSize: 12, color: C.textSec }}>계약서(단기시설이용계약서)를 다운로드하실 수 있습니다. 직인이 필요한 경우는 추가해서 이용자에게 전달해주세요. 따로 계약서를 하우스맨 측으로 보내지 않아도 되며, 계약서 작성 + 잔금 입금이 되면 자동으로 계약절차가 끝나고 이용자에게 주소/현관비밀번호/호실비밀번호가 전송됩니다. 중개수수료는 평일 기준 1일 이내에 입금됩니다. (주말·공휴일인 경우 다음 평일)</div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ ...T.caption, marginTop: 12, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
              소요시간: 중개사님 입력 약 3분 / 이용자 입력 약 5분 / 전체 약 10분
            </div>
            </div>}
          </div>
        )}


        {/* ════════ 부동산 — 이용조건 요약 ════════ */}
        {step === 'broker' && <Summary />}

        {/* ════════ 부동산 — 이용자 정보 입력 ════════ */}
        {step === 'broker' && (
          <div style={S.card}>
            <div style={{ ...T.headline, marginBottom: 4 }}>이용자(계약자)정보</div>
            <div style={{ ...T.caption, marginBottom: 16 }}>계약서 작성 링크를 발송할 이용자(계약자)정보를 입력해주세요.</div>
            <div style={{ marginBottom: 16 }}>
              <div style={REQUIRED}>이용자 이름 <span style={S.required} /></div>
              <input value={brokerForm.tenantName} onChange={e => { setBrokerForm(p => ({ ...p, tenantName: e.target.value })); setErrors(p => ({ ...p, tenantName: '' })); }}
                onFocus={() => setFocusedField('tenantName')} onBlur={() => setFocusedField('')}
                placeholder="이용자 이름" style={inputStyle('tenantName')} />
              <FieldError field="tenantName" />
            </div>
            <div>
              <div style={REQUIRED}>이용자 연락처 <span style={S.required} /></div>
              <input value={brokerForm.tenantPhone} onChange={e => { setBrokerForm(p => ({ ...p, tenantPhone: formatPhone(e.target.value) })); setErrors(p => ({ ...p, tenantPhone: '' })); }}
                onFocus={() => setFocusedField('tenantPhone')} onBlur={() => setFocusedField('')}
                placeholder="010-0000-0000" style={inputStyle('tenantPhone')} />
              <FieldError field="tenantPhone" />
            </div>
          </div>
        )}

        {/* ════════ 부동산 — 중개사 정보 입력 ════════ */}
        {step === 'broker' && (
          <div style={S.card}>
            <div style={{ ...T.headline, marginBottom: 4 }}>중개사 정보</div>
            <div style={{ ...T.caption, marginBottom: 16 }}>전화번호를 먼저 입력하시면 이전 정보가 자동으로 채워집니다.</div>

            <div style={{ marginBottom: 16 }}>
              <div style={REQUIRED}>연락처 <span style={S.required} /></div>
              <input value={brokerForm.phone} onChange={e => { setBrokerForm(p => ({ ...p, phone: formatPhone(e.target.value) })); setErrors(p => ({ ...p, brokerPhone: '' })); }}
                onFocus={() => setFocusedField('brokerPhone')} onBlur={() => { setFocusedField(''); handleBrokerPhoneBlur(); }}
                placeholder="010-0000-0000" style={inputStyle('brokerPhone')} />
              <FieldError field="brokerPhone" />
            </div>

            {/* 읽기 모드: 기존 중개사 데이터 로드됨 */}
            {brokerLoaded && !brokerEditMode ? (
              <div>
                <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: "6px 8px", fontSize: 13, color: C.text }}>
                    <span style={{ color: C.textSec }}>대표자</span><span>{brokerForm.representative}</span>
                    <span style={{ color: C.textSec }}>상호</span><span>{brokerForm.office_name}</span>
                    <span style={{ color: C.textSec }}>소재지</span><span>{brokerForm.office_address}{brokerForm.office_address_detail ? ` ${brokerForm.office_address_detail}` : ''}</span>
                    <span style={{ color: C.textSec }}>허가번호</span><span>{brokerForm.license_number}</span>
                    {brokerForm.email && <><span style={{ color: C.textSec }}>이메일</span><span>{brokerForm.email}</span></>}
                  </div>
                </div>
                <button onClick={() => setBrokerEditMode(true)}
                  style={{ marginTop: 10, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", fontSize: 12, color: C.textSec, cursor: "pointer" }}>
                  수정
                </button>
              </div>
            ) : (
              /* 편집 모드: 신규 중개사 또는 수정 클릭 */
              <>
            <div style={{ marginBottom: 16 }}>
              <div style={REQUIRED}>대표자 <span style={S.required} /></div>
              <input value={brokerForm.representative} onChange={e => { setBrokerForm(p => ({ ...p, representative: e.target.value })); setErrors(p => ({ ...p, representative: '' })); }}
                onFocus={() => setFocusedField('representative')} onBlur={() => setFocusedField('')}
                placeholder="대표자 이름" style={inputStyle('representative')} />
              <FieldError field="representative" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={REQUIRED}>상호 <span style={S.required} /></div>
              <input value={brokerForm.office_name} onChange={e => { setBrokerForm(p => ({ ...p, office_name: e.target.value })); setErrors(p => ({ ...p, office_name: '' })); }}
                onFocus={() => setFocusedField('office_name')} onBlur={() => setFocusedField('')}
                placeholder="부동산 상호" style={inputStyle('office_name')} />
              <FieldError field="office_name" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={REQUIRED}>소재지 <span style={S.required} /></div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={brokerForm.office_address} readOnly
                  placeholder="주소 검색" style={{ ...IS, flex: 1, background: C.bg, cursor: "pointer", ...(errors.office_address ? S.inputError : {}) }}
                  onClick={() => {
                    if (window.daum?.Postcode) {
                      new window.daum.Postcode({
                        oncomplete: (data) => { setBrokerForm(p => ({ ...p, office_address: data.roadAddress || data.jibunAddress })); setErrors(p => ({ ...p, office_address: '' })); },
                      }).open();
                    } else {
                      const addr = prompt('주소를 입력해주세요 (주소검색 API 미로드)');
                      if (addr) { setBrokerForm(p => ({ ...p, office_address: addr })); setErrors(p => ({ ...p, office_address: '' })); }
                    }
                  }} />
                <button onClick={() => {
                  if (window.daum?.Postcode) {
                    new window.daum.Postcode({
                      oncomplete: (data) => { setBrokerForm(p => ({ ...p, office_address: data.roadAddress || data.jibunAddress })); setErrors(p => ({ ...p, office_address: '' })); },
                    }).open();
                  } else {
                    const addr = prompt('주소를 입력해주세요');
                    if (addr) { setBrokerForm(p => ({ ...p, office_address: addr })); setErrors(p => ({ ...p, office_address: '' })); }
                  }
                }} style={{ padding: "0 16px", background: C.text, color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                  검색
                </button>
              </div>
              <FieldError field="office_address" />
              <input value={brokerForm.office_address_detail} onChange={e => setBrokerForm(p => ({ ...p, office_address_detail: e.target.value }))}
                onFocus={() => setFocusedField('office_address_detail')} onBlur={() => setFocusedField('')}
                placeholder="상세주소 (층, 호수 등)" style={{ ...inputStyle('office_address_detail'), marginTop: 8 }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={REQUIRED}>허가번호 <span style={S.required} /></div>
              <input value={brokerForm.license_number} onChange={e => {
                setBrokerForm(p => ({ ...p, license_number: e.target.value })); setErrors(p => ({ ...p, license_number: '' }));
              }}
                onFocus={() => setFocusedField('license_number')} onBlur={() => setFocusedField('')}
                placeholder="제00000-0000-00000호" style={inputStyle('license_number')} />
              <FieldError field="license_number" />
              {!errors.license_number && brokerForm.license_number && !/^제?\d{4,5}-\d{4}-\d{4,5}호?$/.test(brokerForm.license_number) && brokerForm.license_number.length > 5 &&
                <div style={{ ...S.helper, color: C.accent }}>형식 예시: 제12345-2026-00001호</div>}
            </div>

            <div>
              <div style={LABEL}>이메일 (계약서 수신용)</div>
              <input value={brokerForm.email} onChange={e => setBrokerForm(p => ({ ...p, email: e.target.value }))}
                onFocus={() => setFocusedField('brokerEmail')} onBlur={() => setFocusedField('')}
                placeholder="email@example.com" style={inputStyle('brokerEmail')} />
            </div>
              </>
            )}
          </div>
        )}

        {/* ════════ 부동산 — 중개 수수료 계좌 (접기/펼치기) ════════ */}
        {step === 'broker' && (
          <div style={{ ...S.card, overflow: "hidden", padding: 0 }}>
            <div onClick={() => setBrokerFeeOpen(p => !p)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", cursor: "pointer", userSelect: "none" }}>
              <div style={T.headline}>중개 수수료 입금 계좌</div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2" strokeLinecap="round" style={{ transition: "transform 0.2s", transform: brokerFeeOpen ? "rotate(180deg)" : "rotate(0deg)" }}><path d="M6 9l6 6 6-6"/></svg>
            </div>
            {brokerFeeOpen && (
              <div style={{ padding: "0 24px 24px" }}>
                <div style={{ ...T.caption, marginBottom: 16 }}>중개 수수료: <strong style={{ color: C.text }}>{fmt(contract.contract_data?.brokerFee || 0)}원</strong> (계약 완료 후 입금)</div>

                {/* 읽기 모드: 기존 계좌 정보 있음 */}
                {brokerLoaded && !brokerEditMode && brokerForm.feeBank ? (
                  <div>
                    <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: "6px 8px", fontSize: 13, color: C.text }}>
                        <span style={{ color: C.textSec }}>은행</span><span>{brokerForm.feeBank}</span>
                        <span style={{ color: C.textSec }}>계좌번호</span><span>{brokerForm.feeAccount}</span>
                        <span style={{ color: C.textSec }}>예금주</span><span>{brokerForm.feeHolder}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 편집 모드 */
                  <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ ...T.caption, marginBottom: 4 }}>은행</div>
                    <input value={brokerForm.feeBank} onChange={e => setBrokerForm(p => ({ ...p, feeBank: e.target.value }))}
                      placeholder="은행명" style={IS} />
                  </div>
                  <div>
                    <div style={{ ...T.caption, marginBottom: 4 }}>계좌번호</div>
                    <input value={brokerForm.feeAccount} onChange={e => setBrokerForm(p => ({ ...p, feeAccount: e.target.value }))}
                      placeholder="계좌번호" style={IS} />
                  </div>
                </div>
                <div>
                  <div style={{ ...T.caption, marginBottom: 4 }}>예금주</div>
                  <input value={brokerForm.feeHolder} onChange={e => setBrokerForm(p => ({ ...p, feeHolder: e.target.value }))}
                    placeholder="예금주" style={IS} />
                </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════ 부동산 — 렌트홈 안내 + 완료 버튼 ════════ */}
        {step === 'broker' && (
          <div>
            {/* 렌트홈 신고 안내 (표준계약서 사용 건물) */}
            {useStandard && (
              <div style={{ padding: 14, background: C.bg, borderRadius: 10, marginBottom: 16 }}>
                <div style={{ ...T.subhead, marginBottom: 4 }}>렌트홈 임대차 신고 안내</div>
                <div style={{ ...T.caption, lineHeight: 1.6 }}>본 계약은 단기 시설이용계약으로, 실제 이용조건은 시설이용계약서에 따릅니다. 다만 주택임대차신고제(렌트홈)에 따라 임대인(건물주) 측에서 행정신고를 진행하며, 이를 위해 표준임대차계약서가 자동 생성되어 프로그램 내에 보관됩니다.</div>
              </div>
            )}

            <div style={{ padding: 14, background: '#EFF6FF', borderRadius: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
                <strong>신분증 준비 안내</strong><br />
                완료 버튼을 누르면 이용자에게 계약서 작성 링크가 발송됩니다. 이용자에게 <strong>신분증 사진을 핸드폰으로 미리 찍어놓고</strong> 링크를 열어달라고 안내해주세요.
              </div>
            </div>

            {errors._broker && <div style={{ ...S.errorText, marginBottom: 12, textAlign: 'center' }}>{errors._broker}</div>}

            <div style={S.stickyFooter}>
            <button onClick={async () => {
              const errs = {};
              if (!brokerForm.tenantName) errs.tenantName = '이용자 이름을 입력해주세요.';
              if (!brokerForm.tenantPhone) errs.tenantPhone = '이용자 연락처를 입력해주세요.';
              if (!brokerForm.phone) errs.brokerPhone = '중개사 연락처를 입력해주세요.';
              if (!brokerForm.representative) errs.representative = '대표자를 입력해주세요.';
              if (!brokerForm.office_name) errs.office_name = '상호를 입력해주세요.';
              if (!brokerForm.office_address) errs.office_address = '소재지를 입력해주세요.';
              if (!brokerForm.license_number) errs.license_number = '허가번호를 입력해주세요.';
              if (Object.keys(errs).length > 0) { setErrors(errs); return; }
              setLoading(true);

              if (!isSimulation) {
                const brokerPhone = brokerForm.phone.replace(/-/g, '');
                const { data: brokerRow } = await supabase.from('brokers').upsert({
                  phone: brokerPhone,
                  representative: brokerForm.representative,
                  office_name: brokerForm.office_name,
                  office_address: brokerForm.office_address,
                  office_address_detail: brokerForm.office_address_detail,
                  license_number: brokerForm.license_number,
                  email: brokerForm.email,
                  fee_bank: brokerForm.feeBank,
                  fee_account: brokerForm.feeAccount,
                  fee_holder: brokerForm.feeHolder,
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'phone' }).select('id').single();

                await updateContract({
                  broker_id: brokerRow?.id || null,
                  broker_input_name: brokerForm.representative,
                  broker_input_phone: brokerPhone,
                  broker_office_name: brokerForm.office_name,
                  broker_office_address: brokerForm.office_address,
                  broker_license_number: brokerForm.license_number,
                  broker_representative: brokerForm.representative,
                  tenant_name: brokerForm.tenantName,
                  tenant_phone: brokerForm.tenantPhone.replace(/-/g, ''),
                  contract_data: { ...(contract.contract_data || {}), brokerForm },
                  status: 'broker_info_done',
                  _action: 'broker_info_submit', _step: 'broker',
                });

                // tenants 직접 업데이트 (이름, 연락처)
                if (contract.tenant_id) {
                  await supabase.from('tenants').update({
                    name: brokerForm.tenantName,
                    phone: brokerForm.tenantPhone.replace(/-/g, ''),
                  }).eq('id', contract.tenant_id);
                }
              }

              // 로컬 contract 객체에도 반영 (이용자 화면 전환 시 자동 채움용)
              setContract(prev => ({ ...prev, tenant_name: brokerForm.tenantName, tenant_phone: brokerForm.tenantPhone.replace(/-/g, '') }));
              setLoading(false);
              logNotif('✅', '부동산', '시스템', `중개사 정보 입력 완료 (${brokerForm.representative})`);
              logNotif('🟡', '시스템', '이용자', `계약서 작성 링크 SMS → ${brokerForm.tenantPhone}`);
              setToast(`이용자에게 링크가 발송되었습니다`);

              if (contract.is_proxy) {
                // 대행 모드: OTP 인증 건너뛰고 바로 broker_done → 대기 화면
                await updateContract({
                  broker_verified_at: new Date().toISOString(),
                  broker_verified_phone: brokerForm.phone.replace(/-/g, ''),
                  status: 'broker_done',
                  _action: 'proxy_broker_verified', _step: 'broker',
                });
                logNotif('✅', '담당자', '시스템', '대행 모드 — 부동산 구두 확인으로 인증 생략');
              }
              setStep('broker_waiting');
            }} disabled={loading}
              style={loading ? S.btnDisabled : BTN}>
              {loading ? '처리 중...' : contract.is_proxy ? '완료 — 이용자에게 링크 발송 (대행)' : '완료 -- 이용자에게 링크 발송'}
            </button>
            </div>
          </div>
        )}

        {/* ════════ 부동산 — SMS 인증 (모든 건물) ════════ */}
        {step === 'broker_verify' && (
          <div style={{ ...S.card, marginTop: 20 }}>
            <div style={{ ...T.headline, marginBottom: 4 }}>부동산 전자 인증</div>
            <div style={{ ...T.caption, marginBottom: 16 }}>{brokerForm.phone}으로 인증번호를 발송합니다.</div>

            {!brokerSentCode ? (
              <button onClick={() => {
                const code = isSimulation ? '123456' : String(Math.floor(100000 + Math.random() * 900000));
                setBrokerSentCode(code);
                if (isSimulation) {
                  setBrokerSmsCode('123456');
                  logNotif('📱', '시스템', '부동산', `SMS 인증번호 발송 → ${brokerForm.phone}: ${code}`);
                } else {
                  setToast(`인증번호가 발송되었습니다: ${code}`);
                }
              }} style={BTN}>
                인증번호 발송
              </button>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={LABEL}>인증번호 6자리</div>
                  <OtpInput value={brokerSmsCode} onChange={setBrokerSmsCode} />
                  <FieldError field="brokerVerify" />
                </div>
                <button onClick={async () => {
                  if (!isSimulation && brokerSmsCode !== brokerSentCode) { setErrors({ brokerVerify: '인증번호가 일치하지 않습니다.' }); return; }
                  if (isSimulation && brokerSmsCode.length < 6) { setErrors({ brokerVerify: '6자리를 입력해주세요.' }); return; }
                  setLoading(true);
                  await updateContract({
                    broker_input_name: brokerForm.representative,
                    broker_input_phone: brokerForm.phone.replace(/-/g, ''),
                    broker_office_name: brokerForm.office_name,
                    broker_office_address: brokerForm.office_address,
                    broker_license_number: brokerForm.license_number,
                    broker_representative: brokerForm.representative,
                    broker_verified_at: new Date().toISOString(),
                    broker_verified_phone: brokerForm.phone.replace(/-/g, ''),
                    status: 'broker_done',
                    _action: 'broker_verified', _step: 'broker_verify',
                  });
                  setLoading(false);
                  setStep('broker_waiting');
                  logNotif('🟡', '시스템', '이용자', `SMS 자동 발송 → ${contract.tenant_phone || '010-9876-5432'}: 계약서 작성 링크`);
                }} disabled={loading}
                  style={brokerSmsCode.length === 6 && !loading ? BTN : S.btnDisabled}>
                  {loading ? '처리 중...' : '인증 완료'}
                </button>
                <button onClick={() => { setBrokerSentCode(''); setBrokerSmsCode(''); setErrors({}); }}
                  style={{ ...S.btnSecondary, marginTop: 8 }}>
                  인증번호 재발송
                </button>
              </>
            )}
          </div>
        )}

        {/* ════════ 부동산 — 이용자 대기 화면 ════════ */}
        {step === 'broker_waiting' && (
            <div style={{ ...S.card, textAlign: "center", marginTop: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.5"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              </div>
              <div style={{ ...T.title, marginBottom: 8 }}>이용자에게 링크를 발송했습니다</div>
              <div style={{ ...T.body, color: C.textSec, marginBottom: 20, lineHeight: 1.6 }}>
                {contract.tenant_phone || '010-9876-5432'}로 계약서 작성 링크가 전송되었습니다.<br/>
                이용자가 작성을 완료하면 이 화면이 자동으로 전환됩니다.
              </div>
              {contract.is_proxy && (
                <div style={{ padding: 12, background: '#EBF0FF', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#346aff', fontWeight: 600, textAlign: 'left' }}>
                  📋 대행 모드 — 이용자가 직접 링크에서 완료하면 자동으로 다음 단계로 넘어갑니다.
                </div>
              )}
              <div style={{ padding: 14, background: C.bg, borderRadius: 12, marginBottom: 20, fontSize: 13, color: C.text, lineHeight: 1.8 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>다음 단계</div>
                <div>{contract.is_proxy ? '이용자 작성 완료 -> 계약서 최종 확인 -> 계약 체결 (대행)' : '이용자 작성 완료 -> 계약서 최종 확인 -> 중개사 SMS 인증 -> 계약 체결'}</div>
              </div>
              <div style={{ padding: 16, borderRadius: 12, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.accent, animation: "pulse 1.5s infinite" }} />
                  <span style={{ ...T.subhead, color: C.accent }}>이용자 작성 대기 중...</span>
                </div>
              </div>

              {/* 시뮬레이션: 이용자 진행 버튼 */}
              {isSimulation && (
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 16 }}>
                  <div style={{ ...T.caption, marginBottom: 8 }}>시뮬레이션 전용</div>
                  <button onClick={() => {
                    if (brokerForm.tenantName) setIdentityName(brokerForm.tenantName);
                    if (brokerForm.tenantPhone) setTenantForm(p => ({ ...p, phone: brokerForm.tenantPhone }));
                    setStep('tenant_identity');
                  }}
                    style={{ ...BTN, background: '#1E3A5F' }}>
                    이용자 화면으로 전환 (시뮬레이션)
                  </button>
                </div>
              )}
            </div>
        )}

        {/* ════════ 부동산 — 계약서 확인 + SMS 인증 ════════ */}
        {step === 'broker_contract_review' && (
          <div style={{ ...S.card, marginTop: 20 }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.5"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              <div style={T.title}>이용자 서명이 완료되었습니다</div>
              <div style={{ ...T.caption, marginTop: 4 }}>계약서를 확인하고 중개사 전자인증을 진행해주세요.</div>
            </div>

            {/* 계약 요약 */}
            <div style={{ padding: 14, background: C.bg, borderRadius: 12, marginBottom: 16 }}>
              <div style={{ ...T.subhead, color: C.accent, marginBottom: 8 }}>계약 정보</div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.8 }}>
                <div>{buildingName} {roomNumber}호 / 이용자: {identityName || contract.tenant_name || '-'}</div>
                <div>예치금: {fmt(contract.deposit)}원 / 이용요금: {fmt(contract.rent)}원</div>
                <div>기간: {contract.move_in} ~ {contract.expiry}</div>
              </div>
            </div>

            {/* 계약서 DOCX 다운로드 (열람용) */}
            <button onClick={async () => {
              try {
                const mod = await import('../../lib/contractGenerator');
                const signedAt = new Date().toLocaleString();
                const live = await resolveLiveParking(contract);
                const blob = await mod.generateShortTermContract({
                  building: { building_name: buildingName, address_road: contract.contract_data?.address || '', owner_name: contract.contract_data?.ownerName || '', owner_phone: contract.contract_data?.ownerPhone || '', owner_home_address: contract.contract_data?.ownerHomeAddress || '', owner_business_registration_number: contract.contract_data?.ownerBusinessRegistrationNumber || '', rental_business_registration_number: contract.contract_data?.rentalBusinessRegistrationNumber || '', parking_total_spaces: live.parkingTotalSpaces, contract_special_terms_short_term: contract.special_terms || '' },
                  room: { room_number: roomNumber },
                  contract: { deposit: contract.deposit, rent: contract.rent, management_fee: contract.management_fee, move_in_date: contract.move_in, contract_end_date: contract.expiry, payment_due_day: contract.contract_data?.paymentDueDay || '25', contract_data: contract.contract_data || {} },
                  tenant: { name: identityName || '이용자', phone: contract.tenant_phone || '', ssn: tenantForm.ssn || '', address: tenantForm.address },
                  broker: { ...brokerForm },
                  accounts: contract.contract_data?.accounts || { owner: [], houseman: [] },
                  parking: { type: contract.contract_data?.parkingType || 'none', fee: contract.contract_data?.parkingFee || 0, remoteDeposit: contract.contract_data?.parkingRemoteDeposit || 0, carNumber: tenantForm.carNumber, carType: tenantForm.carType || '' },
                  parkingFull: live.parkingFull,
                  parkingStatusText: contract.contract_data?.parkingStatusText || '',
                  signatures: { tenant: { signedAt, authCode: tenantSmsCode || '-', phone: contract.tenant_phone || '' }, houseman: true },
                  companyInfo: companyInfo || {},
                  operatorType: contract.contract_data?.operatorType || 'houseman',
                isResidentRegistrationAllowed: contract.contract_data?.isResidentRegistrationAllowed || false,
                maxOccupants: contract.contract_data?.maxOccupants || 2,
                contractDeposit: contract.contract_data?.contractDeposit || 0,
                });
                mod.downloadBlob(blob, `단기시설이용계약서_${buildingName}_${roomNumber}호.docx`);
              } catch (err) { setToast('생성 오류: ' + err.message); }
            }}
              style={{ ...S.btnSecondary, marginBottom: 8 }}>
              단기시설이용계약서 열람 (DOCX)
            </button>

            {useStandard && (
              <>
                <button onClick={async () => {
                  try {
                    const now = new Date().toLocaleString('ko-KR');
                    const buildingData = { building_name: buildingName, address_road: contract.contract_data?.address || '', owner_name: contract.contract_data?.ownerName || '', owner_phone: contract.contract_data?.ownerPhone || '', owner_home_address: contract.contract_data?.ownerHomeAddress || '', owner_business_registration_number: contract.contract_data?.ownerBusinessRegistrationNumber || '', rental_business_registration_number: contract.contract_data?.rentalBusinessRegistrationNumber || '', housing_type: contract.contract_data?.housingType || '다가구주택', hide_deposit_in_contract: !!contract.contract_data?.hideDepositInContract };
                    const data = {
                      building: buildingData,
                      room: { room_number: roomNumber },
                      contract: {
                        deposit: contract.deposit, rent: contract.rent,
                        move_in_date: contract.move_in, contract_end_date: contract.expiry,
                        payment_due_day: contract.contract_data?.paymentDueDay || '25',
                        contract_date: new Date().toISOString().slice(0, 10),
                        account: contract.contract_data?.account || { number: '', bank: '', holder: '' },
                      },
                      tenant: { name: identityName || '이용자', phone: contract.tenant_phone || '', address: tenantForm.address || '', ssn: tenantForm.ssn || '' },
                      broker: { ...brokerForm },
                      signatures: {
                        houseman: { signedAt: now },
                        tenant: { signedAt: now, phone: contract.tenant_phone || '' },
                        broker: { verifiedAt: now, phone: brokerForm.phone || '' },
                      },
                      companyInfo,
                    };
                    const docxMod = await import('../../lib/standardContract');
                    const docxBlob = await docxMod.generateStandardContractDOCX(data);
                    docxMod.downloadDocxBlob(docxBlob, `표준임대차계약서_${buildingName}_${roomNumber}호.docx`);
                  } catch (err) { setToast('생성 오류: ' + err.message); }
                }}
                  style={{ ...S.btnSecondary, marginBottom: 8 }}>
                  표준임대차계약서(DOCX) 열람
                </button>
                <button onClick={async () => {
                  try {
                    const buildingData = { building_name: buildingName, address_road: contract.contract_data?.address || '', owner_name: contract.contract_data?.ownerName || '', owner_phone: contract.contract_data?.ownerPhone || '', owner_resident_number: contract.contract_data?.ownerResidentNumber || '', rental_business_registration_number: contract.contract_data?.rentalBusinessRegistrationNumber || '' };
                    const data = {
                      building: buildingData,
                      room: { room_number: roomNumber },
                      contract: { deposit: contract.deposit, move_in_date: contract.move_in, contract_end_date: contract.expiry },
                      tenant: { name: identityName || '이용자', phone: contract.tenant_phone || '', ssn: tenantForm.ssn || '' },
                      companyInfo,
                    };
                    const docxMod = await import('../../lib/standardContract');
                    const waiverBlob = await docxMod.generateDepositWaiverDOCX(data);
                    docxMod.downloadDocxBlob(waiverBlob, `보증금미가입동의서_${buildingName}_${roomNumber}호.docx`);
                  } catch (err) { setToast('생성 오류: ' + err.message); }
                }}
                  style={{ ...S.btnSecondary, marginBottom: 16 }}>
                  보증금미가입동의서(DOCX) 열람
                </button>
              </>
            )}

            {/* 부동산 SMS 인증 — 대행 모드에서는 구두 확인 */}
            {contract.is_proxy ? (
              <div style={{ padding: 16, background: C.bg, borderRadius: 12, marginBottom: 16 }}>
                <div style={{ ...T.subhead, marginBottom: 4 }}>계약 대행 — 부동산 구두 확인</div>
                <div style={{ ...T.caption, marginBottom: 16 }}>부동산({brokerForm.representative || brokerForm.phone})에게 전화로 계약 내용을 확인받으세요.</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!brokerSentCode} onChange={e => setBrokerSentCode(e.target.checked ? 'proxy' : '')}
                    style={{ width: 18, height: 18, accentColor: C.accent }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>부동산 본인 확인 완료 (전화 구두)</span>
                </label>
                <button onClick={async () => {
                  if (!brokerSentCode) { setErrors({ brokerReviewVerify: '부동산 확인 체크를 해주세요.' }); return; }
                  setLoading(true);
                  await updateContract({
                    broker_verified_at: new Date().toISOString(),
                    broker_verified_phone: brokerForm.phone.replace(/-/g, ''),
                    status: 'completed',
                    _action: 'proxy_broker_verified', _step: 'broker_contract_review',
                  });
                  logNotif('✅', '담당자', '시스템', `대행 모드 — 부동산 구두 확인으로 계약 체결 (${brokerForm.representative})`);

                  if (!isSimulation && contract.tenant_id) {
                    await supabase.from('tenants').update({ status: 'active', is_active: true }).eq('id', contract.tenant_id);
                    if (contract.calendar_event_id) {
                      await supabase.from('calendar_events').update({ contract_entered: true }).eq('id', contract.calendar_event_id);
                    }
                    await supabase.from('rooms').update({ vacancy_status: null, linked_tenant_name: null, linked_tenant_phone: null }).eq('id', contract.room_id);
                    const feeEntry = await checkAndCreateBrokerFeeEntry(contract.id);
                    if (feeEntry) logNotif('💰', '시스템', '-', `중개수수료 이체 대기 자동 생성`);
                  } else if (isSimulation) {
                    logNotif('✅', '시스템', '-', '[시뮬레이션] 대행 계약 완료');
                  }

                  setToast('계약이 체결되었습니다 (대행)');
                  setLoading(false);
                  setStep('done');
                }} disabled={loading || !brokerSentCode}
                  style={!loading && brokerSentCode ? BTN : S.btnDisabled}>
                  {loading ? '처리 중...' : '계약 체결 (대행)'}
                </button>
                <FieldError field="brokerReviewVerify" />
              </div>
            ) : (
              <div style={{ padding: 16, background: C.bg, borderRadius: 12, marginBottom: 16 }}>
                <div style={{ ...T.subhead, marginBottom: 4 }}>중개사 전자 인증</div>
                <div style={{ ...T.caption, marginBottom: 16 }}>계약서 확인 후 {brokerForm.phone}으로 인증번호를 발송합니다.</div>

                {!brokerSentCode ? (
                  <button onClick={() => {
                    const code = isSimulation ? '123456' : String(Math.floor(100000 + Math.random() * 900000));
                    setBrokerSentCode(code);
                    if (isSimulation) {
                      setBrokerSmsCode('123456');
                      logNotif('📱', '시스템', '부동산', `SMS 인증번호 발송 → ${brokerForm.phone}: ${code}`);
                    } else {
                      setToast(`인증번호가 발송되었습니다: ${code}`);
                    }
                  }} style={BTN}>
                    인증번호 발송
                  </button>
                ) : (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <OtpInput value={brokerSmsCode} onChange={setBrokerSmsCode} />
                      <FieldError field="brokerReviewVerify" />
                    </div>
                    <button onClick={async () => {
                      if (!isSimulation && brokerSmsCode !== brokerSentCode) { setErrors({ brokerReviewVerify: '인증번호가 일치하지 않습니다.' }); return; }
                      if (isSimulation && brokerSmsCode.length < 6) { setErrors({ brokerReviewVerify: '6자리를 입력해주세요.' }); return; }
                      setLoading(true);
                      await updateContract({
                        broker_verified_at: new Date().toISOString(),
                        broker_verified_phone: brokerForm.phone.replace(/-/g, ''),
                        status: 'completed',
                        _action: 'broker_verified', _step: 'broker_contract_review',
                      });
                      logNotif('✅', '부동산', '시스템', `중개사 전자인증 완료 (${brokerForm.representative}, ${brokerForm.phone})`);

                      if (!isSimulation && contract.tenant_id) {
                        await supabase.from('tenants').update({ status: 'active', is_active: true }).eq('id', contract.tenant_id);
                        if (contract.calendar_event_id) {
                          await supabase.from('calendar_events').update({ contract_entered: true }).eq('id', contract.calendar_event_id);
                        }
                        await supabase.from('rooms').update({ vacancy_status: null, linked_tenant_name: null, linked_tenant_phone: null }).eq('id', contract.room_id);
                        logNotif('✅', '시스템', '-', `계약 완료 → tenants.status=active (id=${contract.tenant_id})`);
                        const feeEntry = await checkAndCreateBrokerFeeEntry(contract.id);
                        if (feeEntry) logNotif('💰', '시스템', '-', `중개수수료 이체 대기 자동 생성 (cashbook_entries.id=${feeEntry.id})`);
                      } else if (isSimulation) {
                        logNotif('✅', '시스템', '-', '[시뮬레이션] 계약 완료 → tenants.status=active + calendar_events 업데이트');
                        logNotif('💰', '시스템', '-', '[시뮬레이션] 중개수수료 출납 자동 생성 체크');
                      }

                      setToast('계약이 체결되었습니다');
                      setLoading(false);
                      setStep('done');
                    }} disabled={loading}
                      style={brokerSmsCode.length === 6 && !loading ? BTN : S.btnDisabled}>
                      {loading ? '처리 중...' : '인증 완료 -- 계약 체결'}
                    </button>
                    <button onClick={() => { setBrokerSentCode(''); setBrokerSmsCode(''); setErrors({}); }}
                      style={{ ...S.btnSecondary, marginTop: 8 }}>
                      인증번호 재발송
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════ 부동산 — 이용자 완료 후 결과 화면 ════════ */}
        {step === 'broker_complete' && (
          <div style={{ ...S.card, marginTop: 20 }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.success, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div style={{ ...T.title, color: C.success }}>계약 체결 완료</div>
              <div style={{ ...T.caption, marginTop: 4 }}>{buildingName} {roomNumber}호 / 이용자 전자서명 완료</div>
            </div>

            {/* 전자서명 정보 */}
            <div style={{ padding: 14, background: C.bg, borderRadius: 12, marginBottom: 16 }}>
              <div style={{ ...T.subhead, marginBottom: 8 }}>전자인증 정보</div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.8 }}>
                <div>부동산: {brokerForm.representative || '-'} ({brokerForm.phone}) -- SMS 인증 완료</div>
                <div>이용자: {contract.tenant_name || '-'} ({contract.tenant_phone || '-'}) -- 전자서명 완료</div>
                <div>운영자: {contract.contract_data?.operatorType === 'owner' ? (contract.contract_data?.ownerName || '건물주') : (companyInfo?.name || '하우스맨')} (전자인감 적용)</div>
              </div>
            </div>

            {/* 계약서 다운로드 */}
            <button onClick={async () => {
              try {
                const mod = await import('../../lib/contractGenerator');
                const live = await resolveLiveParking(contract);
                const blob = await mod.generateShortTermContract({
                  building: { building_name: buildingName, address_road: contract.contract_data?.address || '', owner_name: contract.contract_data?.ownerName || '', owner_phone: contract.contract_data?.ownerPhone || '', owner_home_address: contract.contract_data?.ownerHomeAddress || '', owner_business_registration_number: contract.contract_data?.ownerBusinessRegistrationNumber || '', rental_business_registration_number: contract.contract_data?.rentalBusinessRegistrationNumber || '', parking_total_spaces: live.parkingTotalSpaces, contract_special_terms_short_term: contract.special_terms || '' },
                  room: { room_number: roomNumber },
                  contract: { deposit: contract.deposit, rent: contract.rent, management_fee: contract.management_fee, move_in_date: contract.move_in, contract_end_date: contract.expiry, payment_due_day: contract.contract_data?.paymentDueDay || '25', contract_data: contract.contract_data || {} },
                  tenant: { name: contract.tenant_name || '', phone: contract.tenant_phone || '', ssn: '', address: '' },
                  broker: { ...brokerForm },
                  accounts: contract.contract_data?.accounts || {},
                  parking: { type: contract.contract_data?.parkingType || 'none' },
                  parkingFull: live.parkingFull,
                  parkingStatusText: contract.contract_data?.parkingStatusText || '',
                  signatures: { tenant: { signedAt: new Date().toLocaleString(), authCode: '-', phone: contract.tenant_phone || '' }, houseman: true, broker: { verifiedAt: new Date().toLocaleString(), phone: brokerForm.phone } },
                  companyInfo: companyInfo || {},
                  operatorType: contract.contract_data?.operatorType || 'houseman',
                isResidentRegistrationAllowed: contract.contract_data?.isResidentRegistrationAllowed || false,
                maxOccupants: contract.contract_data?.maxOccupants || 2,
                contractDeposit: contract.contract_data?.contractDeposit || 0,
                });
                mod.downloadBlob(blob, `단기시설이용계약서_${buildingName}_${roomNumber}호.docx`);
              } catch (err) { setToast('생성 오류: ' + err.message); }
            }}
              style={{ ...BTN, marginBottom: 8 }}>
              단기시설이용계약서 다운로드 (실제 계약서)
            </button>

            {useStandard && (
              <>
                <button onClick={async () => {
                  try {
                    const now = new Date().toLocaleString('ko-KR');
                    const buildingData = { building_name: buildingName, address_road: contract.contract_data?.address || '', owner_name: contract.contract_data?.ownerName || '', owner_phone: contract.contract_data?.ownerPhone || '', owner_home_address: contract.contract_data?.ownerHomeAddress || '', owner_business_registration_number: contract.contract_data?.ownerBusinessRegistrationNumber || '', rental_business_registration_number: contract.contract_data?.rentalBusinessRegistrationNumber || '', housing_type: contract.contract_data?.housingType || '다가구주택', hide_deposit_in_contract: !!contract.contract_data?.hideDepositInContract };
                    const data = {
                      building: buildingData,
                      room: { room_number: roomNumber },
                      contract: {
                        deposit: contract.deposit, rent: contract.rent,
                        move_in_date: contract.move_in, contract_end_date: contract.expiry,
                        payment_due_day: contract.contract_data?.paymentDueDay || '25',
                        contract_date: new Date().toISOString().slice(0, 10),
                        account: contract.contract_data?.account || { number: '', bank: '', holder: '' },
                      },
                      tenant: { name: identityName || contract.tenant_name || '', phone: contract.tenant_phone || '', address: tenantForm.address || '', ssn: tenantForm.ssn || '' },
                      broker: { ...brokerForm },
                      signatures: {
                        houseman: { signedAt: now },
                        tenant: { signedAt: now, phone: contract.tenant_phone || '' },
                        broker: { verifiedAt: now, phone: brokerForm.phone || '' },
                      },
                      companyInfo,
                    };
                    const docxMod = await import('../../lib/standardContract');
                    const docxBlob = await docxMod.generateStandardContractDOCX(data);
                    docxMod.downloadDocxBlob(docxBlob, `표준임대차계약서_${buildingName}_${roomNumber}호.docx`);
                  } catch (err) { setToast('생성 오류: ' + err.message); }
                }}
                  style={{ ...S.btnSecondary, marginBottom: 8 }}>
                  표준임대차계약서(DOCX) 다운로드 (렌트홈 신고용)
                </button>
                <button onClick={async () => {
                  try {
                    const buildingData = { building_name: buildingName, address_road: contract.contract_data?.address || '', owner_name: contract.contract_data?.ownerName || '', owner_phone: contract.contract_data?.ownerPhone || '', owner_resident_number: contract.contract_data?.ownerResidentNumber || '', rental_business_registration_number: contract.contract_data?.rentalBusinessRegistrationNumber || '' };
                    const data = {
                      building: buildingData,
                      room: { room_number: roomNumber },
                      contract: { deposit: contract.deposit, move_in_date: contract.move_in, contract_end_date: contract.expiry },
                      tenant: { name: identityName || contract.tenant_name || '', phone: contract.tenant_phone || '', ssn: tenantForm.ssn || '' },
                      companyInfo,
                    };
                    const docxMod = await import('../../lib/standardContract');
                    const waiverBlob = await docxMod.generateDepositWaiverDOCX(data);
                    docxMod.downloadDocxBlob(waiverBlob, `보증금미가입동의서_${buildingName}_${roomNumber}호.docx`);
                  } catch (err) { setToast('생성 오류: ' + err.message); }
                }}
                  style={{ ...S.btnSecondary, marginBottom: 8 }}>
                  보증금미가입동의서(DOCX) 다운로드
                </button>
              </>
            )}
            <div style={{ ...T.caption, textAlign: "center", marginBottom: 16 }}>다운로드 후 출력 → 직인(도장) → 이용자에게 전달</div>

            {/* 세금계산서 업로드 (필요한 건물만) */}
            {contract.contract_data?.requiresBrokerTaxInvoice && (
              <div style={{ padding: 16, background: C.bg, borderRadius: 12 }}>
                <div style={{ ...T.subhead, color: C.danger, marginBottom: 4 }}>세금계산서 제출 필수</div>
                <div style={{ ...T.caption, marginBottom: 8 }}>중개수수료 지급을 위해 세금계산서를 제출해주세요. 사진 또는 캡처 이미지를 업로드하면 자동으로 검증됩니다.</div>
                <div style={{ ...T.caption, color: C.accent, marginBottom: 12 }}>지금 바로 올리지 않아도 됩니다. 이 링크로 다시 접속하면 언제든 제출할 수 있습니다.</div>

                {/* 사업자등록증 — 세금계산서 발행용 */}
                <div style={{ padding: 14, background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 12 }}>
                  <div style={{ ...T.subhead, marginBottom: 6 }}>세금계산서 발행 정보</div>
                  <div style={{ ...T.caption, lineHeight: 1.8, marginBottom: 8 }}>
                    <div>상호: {contract.contract_data?.ownerName || '-'}</div>
                    <div>사업자등록번호: {contract.contract_data?.ownerBusinessRegistrationNumber || '-'}</div>
                    <div>금액: {fmt(contract.contract_data?.brokerFee || 0)}원</div>
                  </div>
                  {contract.contract_data?.businessRegistrationUrl && (
                    <a href={contract.contract_data.businessRegistrationUrl} target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-block", padding: "8px 16px", background: C.bg, color: C.text, borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                      사업자등록증 보기/다운로드
                    </a>
                  )}
                </div>

                {!taxInvoicePreview ? (
                  <div
                    onClick={() => taxInvoiceRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={e => {
                      e.preventDefault(); e.stopPropagation();
                      const file = e.dataTransfer.files[0];
                      if (file && file.type.startsWith('image/')) {
                        setTaxInvoiceFile(file);
                        setTaxInvoicePreview(URL.createObjectURL(file));
                      }
                    }}
                    style={{ padding: 24, border: `2px dashed ${C.border}`, borderRadius: 12, textAlign: "center", cursor: "pointer", background: C.card }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="1.5" style={{ margin: '0 auto 8px', display: 'block' }}><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"/></svg>
                    <div style={{ ...T.subhead }}>세금계산서를 여기에 끌어다 놓으세요</div>
                    <div style={{ ...T.caption, marginTop: 4 }}>또는 클릭하여 파일 선택</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ position: "relative", marginBottom: 8 }}>
                      <img src={taxInvoicePreview} alt="세금계산서" style={{ width: "100%", borderRadius: 8, border: "1px solid #E5E7EB" }} />
                      {taxInvoiceStatus !== 'verified' && (
                        <button onClick={() => { setTaxInvoiceFile(null); setTaxInvoicePreview(''); setTaxInvoiceStatus(null); setTaxInvoiceMessage(''); }}
                          style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", fontSize: 14, cursor: "pointer" }}>✕</button>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: C.success, fontWeight: 600, marginBottom: 8 }}>{taxInvoiceFile?.name}</div>
                  </div>
                )}

                <input ref={taxInvoiceRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                  onChange={e => {
                    const file = e.target.files[0];
                    if (file) { setTaxInvoiceFile(file); setTaxInvoicePreview(URL.createObjectURL(file)); }
                  }} />

                {/* 검증 상태 */}
                {taxInvoiceStatus === 'verifying' && (
                  <div style={{ padding: 12, background: '#FFF3E0', borderRadius: 10, marginTop: 8, fontSize: 13, color: C.accent, textAlign: "center" }}>
                    세금계산서 검증 중...
                  </div>
                )}
                {taxInvoiceStatus === 'verified' && (
                  <div style={{ padding: 12, background: '#E8F5E9', borderRadius: 10, marginTop: 8, fontSize: 13, color: C.success }}>
                    검증 완료 -- {taxInvoiceMessage}
                  </div>
                )}
                {taxInvoiceStatus === 'rejected' && (
                  <div style={{ padding: 12, background: '#FFEBEE', borderRadius: 10, marginTop: 8, fontSize: 13, color: C.danger }}>
                    검증 실패 -- {taxInvoiceMessage}
                    <div style={{ ...T.caption, marginTop: 4 }}>올바른 세금계산서를 다시 업로드해주세요.</div>
                  </div>
                )}

                {/* 검증 버튼 */}
                {taxInvoicePreview && taxInvoiceStatus !== 'verified' && taxInvoiceStatus !== 'verifying' && (
                  <button onClick={async () => {
                    setTaxInvoiceStatus('verifying');
                    try {
                      // 이미지를 base64로 변환
                      const reader = new FileReader();
                      const base64 = await new Promise((resolve) => {
                        reader.onload = () => resolve(reader.result.split(',')[1]);
                        reader.readAsDataURL(taxInvoiceFile);
                      });

                      const brokerFee = contract.contract_data?.brokerFee || 0;
                      const ownerName = contract.contract_data?.ownerName || '';

                      // Claude AI 검증 (Edge Function 또는 직접 호출)
                      const { data: aiResult } = await supabase.functions.invoke('verify-tax-invoice', {
                        body: {
                          image_base64: base64,
                          expected_amount: brokerFee,
                          expected_owner_name: ownerName,
                          building_name: buildingName,
                          room_number: roomNumber,
                        },
                      });

                      if (aiResult?.verified) {
                        setTaxInvoiceStatus('verified');
                        setTaxInvoiceMessage(aiResult.message || '금액과 건물주 정보가 일치합니다.');

                        // Supabase Storage에 업로드 + contracts 업데이트
                        if (!isSimulation && contract.tenant_id) {
                          const filePath = `tax-invoices/${contract.tenant_id}_${Date.now()}.${taxInvoiceFile.name.split('.').pop()}`;
                          await supabase.storage.from('contracts').upload(filePath, taxInvoiceFile);
                          const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(filePath);
                          await supabase.from('tenants').update({
                            broker_tax_invoice_url: urlData.publicUrl,
                            broker_tax_invoice_status: 'verified',
                          }).eq('id', contract.tenant_id);
                        }
                        logNotif('✅', '부동산', '시스템', `세금계산서 검증 완료 (${brokerForm.representative})`);
                        // 중개수수료 출납 자동 생성 체크
                        if (!isSimulation) {
                          const feeEntry = await checkAndCreateBrokerFeeEntry(contract.id);
                          if (feeEntry) logNotif('💰', '시스템', '-', `중개수수료 이체 대기 자동 생성`);
                        } else {
                          logNotif('💰', '시스템', '-', '[시뮬레이션] 세금계산서 검증 → 중개수수료 출납 자동 생성 체크');
                        }
                      } else {
                        setTaxInvoiceStatus('rejected');
                        setTaxInvoiceMessage(aiResult?.message || '세금계산서 정보가 일치하지 않습니다.');
                      }
                    } catch (err) {
                      // AI 검증 실패 시 수동 검토로 전환
                      console.error('세금계산서 검증 에러:', err);
                      setTaxInvoiceStatus('verified');
                      setTaxInvoiceMessage('자동 검증을 사용할 수 없어 수동 검토로 접수되었습니다.');

                      if (!isSimulation && contract.tenant_id) {
                        const filePath = `tax-invoices/${contract.tenant_id}_${Date.now()}.${taxInvoiceFile.name.split('.').pop()}`;
                        await supabase.storage.from('contracts').upload(filePath, taxInvoiceFile);
                        const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(filePath);
                        await supabase.from('tenants').update({
                          broker_tax_invoice_url: urlData.publicUrl,
                          broker_tax_invoice_status: 'pending',
                        }).eq('id', contract.tenant_id);
                      }
                    }
                  }}
                    style={{ ...BTN, marginTop: 8 }}>
                    세금계산서 검증하기
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════ 이용자 — 본인확인 + 주민등록번호 (합침) ════════ */}
        {step === 'tenant_identity' && (
          <div style={{ ...S.card, marginTop: 20 }}>
            <PriorityRestrictionsBadge
              building={{
                id: contract.building_id,
                parking_total_spaces: contract.contract_data?.parkingTotalSpaces ?? null,
                is_resident_registration_allowed: !!contract.contract_data?.isResidentRegistrationAllowed,
                max_occupants: contract.contract_data?.maxOccupants ?? 2,
              }}
              items={Array.isArray(contract.contract_data?.priorityRestrictionsResolved) ? contract.contract_data.priorityRestrictionsResolved : []}
              parkingInfo={contract.contract_data?.parkingInfo || null}
              extraOccupantFee={Number(contract.contract_data?.extraOccupantFee) || 0}
              externalParkingNote={contract.contract_data?.externalParkingNote || ''}
              mode="agree"
              agreed={agreedCoreNotices}
              onAgree={(v) => { setAgreedCoreNotices(v); setErrors(p => ({ ...p, agreeCore: '' })); }}
            />
            <FieldError field="agreeCore" />
            <div style={{ fontSize: 14, color: C.accent, fontWeight: 600, textAlign: "center", marginBottom: 16, padding: "10px", background: C.bg, borderRadius: 10 }}>
              신분증 사진(또는 캡처)을 미리 준비해주세요
            </div>
            <StepHeader num={1} total={parkingAvailable ? 5 : 4} title="본인확인" />
            <div style={{ marginBottom: 16 }}>
              <div style={REQUIRED}>이름 <span style={S.required} /></div>
              <input value={identityName} onChange={e => { setIdentityName(e.target.value); setErrors(p => ({ ...p, identityName: '' })); }}
                onFocus={() => setFocusedField('identityName')} onBlur={() => setFocusedField('')}
                placeholder="이름" style={inputStyle('identityName')} />
              <FieldError field="identityName" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={REQUIRED}>연락처 <span style={S.required} /> <span style={{ fontWeight: 400, color: C.textSec }}>(SMS 인증 받을 번호)</span></div>
              <input value={tenantForm.phone || ''} onChange={e => { setTenantForm(p => ({ ...p, phone: formatPhone(e.target.value) })); setErrors(p => ({ ...p, tenantPhone: '' })); }}
                onFocus={() => setFocusedField('tenantPhone')} onBlur={() => setFocusedField('')}
                placeholder="010-0000-0000" style={inputStyle('tenantPhone')} />
              <FieldError field="tenantPhone" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={REQUIRED}>주민등록번호 <span style={S.required} /></div>
              <input value={tenantForm.ssn} onChange={e => { setTenantForm(p => ({ ...p, ssn: formatSSN(e.target.value) })); setErrors(p => ({ ...p, ssn: '' })); }}
                onFocus={() => setFocusedField('ssn')} onBlur={() => setFocusedField('')}
                placeholder="000000-0000000" style={{ ...inputStyle('ssn'), fontFamily: "monospace" }} />
              <FieldError field="ssn" />
              {!errors.ssn && tenantForm.ssn && !isValidSSN(tenantForm.ssn) && <div style={S.errorText}>올바른 주민등록번호 형식을 입력해주세요</div>}
            </div>
            {identityFails > 0 && <div style={{ ...S.errorText, marginBottom: 8 }}>본인확인 실패 ({identityFails}/5회)</div>}

            {/* 입금자명 확인 */}
            <div style={{ padding: 16, background: C.bg, borderRadius: 12, marginBottom: 16 }}>
              <div style={{ ...T.subhead, marginBottom: 4 }}>초기납입금 입금자명 확인</div>
              <div style={{ ...T.caption, marginBottom: 12 }}>초기납입금 입금 시 사용할 이름을 확인해주세요. 배우자/부모 등 다른 분이 입금하실 경우 "다른 이름"을 선택해주세요.</div>

              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 8, padding: "12px 14px", background: depositorSameName ? C.card : C.bg, borderRadius: 10, border: `1px solid ${depositorSameName ? C.accent : C.border}` }}>
                <input type="radio" checked={depositorSameName} onChange={() => { setDepositorSameName(true); setDepositorName(''); setErrors(p => ({ ...p, depositorName: '' })); }}
                  style={{ width: 16, height: 16 }} />
                본인 이름으로 입금합니다
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: depositorSameName ? 0 : 8, padding: "12px 14px", background: !depositorSameName ? C.card : C.bg, borderRadius: 10, border: `1px solid ${!depositorSameName ? C.danger : C.border}` }}>
                <input type="radio" checked={!depositorSameName} onChange={() => setDepositorSameName(false)}
                  style={{ width: 16, height: 16 }} />
                다른 이름으로 입금합니다
              </label>

              {!depositorSameName && (
                <div style={{ marginTop: 8 }}>
                  <input value={depositorName} onChange={e => { setDepositorName(e.target.value); setErrors(p => ({ ...p, depositorName: '' })); }}
                    onFocus={() => setFocusedField('depositorName')} onBlur={() => setFocusedField('')}
                    placeholder="실제 입금할 이름을 입력해주세요" style={inputStyle('depositorName')} />
                  <FieldError field="depositorName" />
                </div>
              )}
            </div>

            <div style={S.stickyFooter}>
            <button onClick={async () => {
              const errs = {};
              if (!agreedCoreNotices) errs.agreeCore = '계약 전 안내사항을 확인 후 체크해주세요.';
              if (!identityName) errs.identityName = '이름을 입력해주세요.';
              if (!tenantForm.phone || tenantForm.phone.replace(/-/g, '').length < 10) errs.tenantPhone = '연락처를 입력해주세요.';
              if (!isValidSSN(tenantForm.ssn)) errs.ssn = '올바른 주민등록번호를 입력해주세요.';
              if (!depositorSameName && !depositorName) errs.depositorName = '입금자명을 입력해주세요.';
              if (Object.keys(errs).length > 0) { setErrors(errs); return; }
              // 본인확인: 계약에 저장된 이름 비교 (있을 때만)
              const tenantName = contract.tenant_name || contract.contract_data?.tenantName || '';
              if (tenantName && identityName !== tenantName) {
                const fails = identityFails + 1;
                setIdentityFails(fails);
                if (!isSimulation) await supabase.from('contracts').update({ identity_check_failures: fails }).eq('id', contract.id);
                if (fails >= 5) { setContract(null); setError('본인확인 시도 횟수를 초과했습니다.'); return; }
                setErrors({ identityName: '중개사 등록 정보와 일치하지 않습니다. 이름을 다시 확인해주세요.' });
                return;
              }
              // 입금자명 저장
              const finalDepositor = depositorSameName ? identityName : depositorName;
              setTenantForm(p => ({ ...p, depositorName: finalDepositor }));
              if (!isSimulation && contract?.id) {
                await supabase.from('contracts').update({
                  contract_data: { ...(contract.contract_data || {}), depositorName: finalDepositor },
                }).eq('id', contract.id);
              }
              saveTenantProgress('tenant_step2');
              setStep('tenant_step2');
              setErrors({});
            }}
              style={BTN}>
              다음
            </button>
            </div>
          </div>
        )}

        {/* ════════ 이용자 STEP 2: 주소 ════════ */}
        {step === 'tenant_step2' && (
          <div style={{ ...S.card, marginTop: 20 }}>
            <StepHeader num={2} total={parkingAvailable ? 5 : 4} title="주소" />
            <div style={{ marginBottom: 16 }}>
              <div style={REQUIRED}>현재 거주지 주소 <span style={S.required} /></div>
              <input value={tenantForm.address} onChange={e => { setTenantForm(p => ({ ...p, address: e.target.value })); setErrors(p => ({ ...p, address: '' })); }}
                onFocus={() => setFocusedField('address')} onBlur={() => setFocusedField('')}
                placeholder="현재 거주지 주소" style={inputStyle('address')} />
              <FieldError field="address" />
            </div>
            <StepNav onPrev={() => setStep('tenant_identity')} onNext={() => {
              if (!tenantForm.address) { setErrors({ address: '현재 거주지 주소를 입력해주세요.' }); return; }
              setErrors({}); saveTenantProgress('tenant_step3'); setStep('tenant_step3');
            }} />
          </div>
        )}

        {/* ════════ 이용자 STEP 3: 비상연락처 ════════ */}
        {step === 'tenant_step3' && (
          <div style={{ ...S.card, marginTop: 20 }}>
            <StepHeader num={3} total={parkingAvailable ? 5 : 4} title="비상연락처" />
            <div style={{ marginBottom: 16 }}>
              <div style={REQUIRED}>이름 <span style={S.required} /></div>
              <input value={tenantForm.emergencyName} onChange={e => { setTenantForm(p => ({ ...p, emergencyName: e.target.value })); setErrors(p => ({ ...p, emergencyName: '' })); }}
                onFocus={() => setFocusedField('emergencyName')} onBlur={() => setFocusedField('')}
                placeholder="비상연락처 이름" style={inputStyle('emergencyName')} />
              <FieldError field="emergencyName" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={REQUIRED}>연락처 <span style={S.required} /></div>
              <input value={tenantForm.emergencyPhone} onChange={e => { setTenantForm(p => ({ ...p, emergencyPhone: formatPhone(e.target.value) })); setErrors(p => ({ ...p, emergencyPhone: '' })); }}
                onFocus={() => setFocusedField('emergencyPhone')} onBlur={() => setFocusedField('')}
                placeholder="010-0000-0000" style={inputStyle('emergencyPhone')} />
              <FieldError field="emergencyPhone" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={REQUIRED}>관계 <span style={S.required} /></div>
              <input value={tenantForm.emergencyRelation} onChange={e => { setTenantForm(p => ({ ...p, emergencyRelation: e.target.value })); setErrors(p => ({ ...p, emergencyRelation: '' })); }}
                onFocus={() => setFocusedField('emergencyRelation')} onBlur={() => setFocusedField('')}
                placeholder="부모 / 배우자 / 형제" style={inputStyle('emergencyRelation')} />
              <FieldError field="emergencyRelation" />
            </div>
            <StepNav onPrev={() => setStep('tenant_step2')} onNext={() => {
              const errs = {};
              if (!tenantForm.emergencyName) errs.emergencyName = '이름을 입력해주세요.';
              if (!tenantForm.emergencyPhone) errs.emergencyPhone = '연락처를 입력해주세요.';
              if (!tenantForm.emergencyRelation) errs.emergencyRelation = '관계를 입력해주세요.';
              if (Object.keys(errs).length > 0) { setErrors(errs); return; }
              setErrors({}); saveTenantProgress(parkingAvailable ? 'tenant_step4' : 'tenant_step5'); setStep(parkingAvailable ? 'tenant_step4' : 'tenant_step5');
            }} />
          </div>
        )}

        {/* ════════ 이용자 STEP 4: 차량번호 (주차 가능 호실만) ════════ */}
        {step === 'tenant_step4' && parkingAvailable && (() => {
          // live 우선, 미로딩 시 스냅샷 fallback
          const snap = contract.contract_data || {};
          const isFull = liveParking ? liveParking.isFull : !!snap.parkingFull;
          const statusText = liveParking?.statusText || snap.parkingStatusText || '';
          const isProhibited = liveParking
            ? liveParking.mode === 'prohibited'
            : snap.parkingMode === 'prohibited';
          return (
          <div style={{ ...S.card, marginTop: 20 }}>
            <StepHeader num={4} total={5} title="차량 정보" />
            {parkingChecking && !liveParking && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: C.bg, borderRadius: 10, fontSize: 12, color: C.textSec }}>
                건물 주차 현황 확인 중...
              </div>
            )}
            {isFull && (
              <div style={{
                marginBottom: 16, padding: "14px 16px",
                background: "#FEF2F2", border: "2px solid #DC2626", borderRadius: 10,
              }}>
                <div style={{ fontWeight: 800, color: "#991B1B", fontSize: 14, marginBottom: 4 }}>
                  🚫 {isProhibited ? '주차 불가' : '현재 건물 주차 만차 — 주차 불가'}
                </div>
                <div style={{ fontSize: 12, color: "#7F1D1D", lineHeight: 1.5 }}>
                  {statusText || '건물 주차장이 현재 만차 상태입니다. 인근 공영주차장을 이용해주세요.'}
                </div>
                {!isProhibited && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, background: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#7F1D1D', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={skipParking}
                      onChange={e => {
                        setSkipParking(e.target.checked);
                        if (e.target.checked) {
                          setTenantForm(p => ({ ...p, carNumber: '', carType: '' }));
                          setErrors(p => ({ ...p, carNumber: '', carType: '' }));
                        }
                      }}
                      style={{ width: 18, height: 18 }}
                    />
                    주차 없이 계약 진행 (인근 공영주차장 이용)
                  </label>
                )}
              </div>
            )}
            {!skipParking && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={REQUIRED}>차량번호 <span style={S.required} /></div>
                  <input value={tenantForm.carNumber} onChange={e => { setTenantForm(p => ({ ...p, carNumber: e.target.value })); setErrors(p => ({ ...p, carNumber: '' })); }}
                    onFocus={() => setFocusedField('carNumber')} onBlur={() => setFocusedField('')}
                    placeholder="12가 3456" style={inputStyle('carNumber')} disabled={isFull} />
                  <FieldError field="carNumber" />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={REQUIRED}>차종 <span style={S.required} /></div>
                  <input value={tenantForm.carType} onChange={e => { setTenantForm(p => ({ ...p, carType: e.target.value })); setErrors(p => ({ ...p, carType: '' })); }}
                    onFocus={() => setFocusedField('carType')} onBlur={() => setFocusedField('')}
                    placeholder="현대 아반떼" style={inputStyle('carType')} disabled={isFull} />
                  <FieldError field="carType" />
                </div>
                {contract.contract_data?.parkingRemoteDeposit > 0 && !isFull && (
                  <div style={{ padding: 12, background: C.bg, borderRadius: 10, marginBottom: 16, fontSize: 13, color: C.text }}>
                    주차 리모컨 보증금: <strong>{fmt(contract.contract_data.parkingRemoteDeposit)}원</strong> (이용 종료 시 반환)
                  </div>
                )}
              </>
            )}
            <StepNav onPrev={() => setStep('tenant_step3')} onNext={async () => {
              // 주차 없이 진행: 차량 정보 비우고 통과
              if (skipParking) {
                setErrors({});
                setTenantForm(p => ({ ...p, carNumber: '', carType: '' }));
                await saveTenantProgress('tenant_step5');
                setStep('tenant_step5');
                return;
              }
              // 입력 필수
              const errs = {};
              if (!tenantForm.carNumber) errs.carNumber = '차량번호를 입력해주세요.';
              if (!tenantForm.carType) errs.carType = '차종을 입력해주세요.';
              if (Object.keys(errs).length > 0) { setErrors(errs); return; }
              // 제출 직전 서버 재검증 — 동시 계약으로 만차가 됐는지 확인
              if (!isSimulation && contract.building_id) {
                try {
                  setParkingChecking(true);
                  const { checkParkingStatus } = await import('../../lib/parkingCapacity');
                  const status = await checkParkingStatus(contract.building_id);
                  setLiveParking(status);
                  if (status.isFull) {
                    setErrors({ carNumber: status.mode === 'prohibited'
                      ? '주차가 불가한 건물입니다. "주차 없이 진행"을 선택해주세요.'
                      : '방금 다른 호실이 마지막 자리를 차지해 만차가 되었습니다. "주차 없이 진행"을 선택하거나 부동산에 문의해주세요.' });
                    return;
                  }
                } finally {
                  setParkingChecking(false);
                }
              }
              setErrors({}); await saveTenantProgress('tenant_step5'); setStep('tenant_step5');
            }} />

          </div>
          );
        })()}

        {/* ════════ 이용자 STEP 5: 신분증 업로드 ════════ */}
        {step === 'tenant_step5' && (() => {
          // 시뮬레이션: 자동 가짜 신분증
          if (isSimulation && !idCardFile) {
            const canvas = document.createElement('canvas');
            canvas.width = 400; canvas.height = 250;
            const ctx2d = canvas.getContext('2d');
            ctx2d.fillStyle = '#E8E0D0'; ctx2d.fillRect(0, 0, 400, 250);
            ctx2d.strokeStyle = '#999'; ctx2d.lineWidth = 2; ctx2d.strokeRect(10, 10, 380, 230);
            ctx2d.fillStyle = '#333'; ctx2d.font = 'bold 18px sans-serif'; ctx2d.fillText('주민등록증 (시뮬레이션)', 60, 50);
            ctx2d.font = '14px sans-serif'; ctx2d.fillText(`이름: ${identityName || '이영희'}`, 30, 90);
            ctx2d.fillText(`주민번호: ${(tenantForm.ssn || '900315-*******').slice(0, 8)}*****`, 30, 115);
            ctx2d.fillText('주소: 서울시 서초구 반포대로 45', 30, 140);
            ctx2d.fillStyle = '#999'; ctx2d.font = '11px sans-serif'; ctx2d.fillText('※ 시뮬레이션용 가짜 신분증', 100, 220);
            canvas.toBlob(blob => {
              const file = new File([blob], 'simulated_id_card.png', { type: 'image/png' });
              setIdCardFile(file);
              setIdCardPreview(URL.createObjectURL(blob));
            });
          }
          return (
          <div style={{ ...S.card, marginTop: 20 }}>
            <StepHeader num={parkingAvailable ? 5 : 4} total={parkingAvailable ? 5 : 4} title="신분증 촬영/업로드" />
            <div style={{ ...T.caption, marginBottom: 4 }}>주민등록증 또는 운전면허증을 촬영하거나 파일을 선택해주세요.</div>
            <div style={{ ...T.caption, color: C.textSec, marginBottom: 12 }}>본인확인 목적으로만 사용되며, 계약서에 포함되지 않습니다.</div>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#059669'; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = '#D1D5DB'; }}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.style.borderColor = '#D1D5DB';
                const file = e.dataTransfer.files[0];
                if (file) { setIdCardFile(file); setIdCardPreview(URL.createObjectURL(file)); }
              }}
              style={{ border: `2px dashed ${C.border}`, borderRadius: 12, padding: 32, textAlign: "center", cursor: "pointer", marginBottom: 16, background: idCardPreview ? '#E8F5E9' : C.bg }}>
              {idCardPreview ? (
                <>
                  <img src={idCardPreview} alt="신분증" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 10, marginBottom: 8 }} />
                  <div style={{ fontSize: 14, color: C.success, fontWeight: 600 }}>{idCardFile?.name}</div>
                </>
              ) : (
                <>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="1.5" style={{ margin: '0 auto 8px', display: 'block' }}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  <div style={{ ...T.subhead }}>신분증을 여기에 끌어다 놓으세요</div>
                  <div style={{ ...T.caption, marginTop: 4 }}>또는 클릭하여 파일 선택</div>
                </>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
              onChange={e => {
                const file = e.target.files[0];
                if (file) { setIdCardFile(file); setIdCardPreview(URL.createObjectURL(file)); }
              }} />

            <FieldError field="idCard" />
            <StepNav onPrev={() => setStep(parkingAvailable ? 'tenant_step4' : 'tenant_step3')} onNext={() => {
              if (!idCardFile) { setErrors({ idCard: '신분증 사진을 업로드해주세요.' }); return; }
              setErrors({}); saveTenantProgress('tenant_sign');
              setStep('tenant_sign');
            }} nextLabel="다음 -- 계약서 확인" />
          </div>
          );
        })()}

        {/* ════════ 이용자 — 계약서 전문 확인 + 동의 ════════ */}
        {step === 'tenant_sign' && (
          <div style={{ ...S.card, marginTop: 20 }}>
            <div style={{ ...T.headline, marginBottom: 4 }}>계약서 전문 확인</div>
            <div style={{ ...T.caption, color: C.danger, marginBottom: 12, fontWeight: 600 }}>아래 계약서 전체 내용을 확인해주세요. 끝까지 스크롤한 후 동의 체크가 가능합니다.</div>

            {/* 계약서 전문 */}
            <div
              onScroll={e => {
                const el = e.target;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
                  contractScrollRef.current = true;
                  setReadContract(true);
                }
              }}
              style={{ maxHeight: 450, overflowY: "auto", padding: 16, background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 16, fontSize: 13, lineHeight: 2 }}>
              <div style={{ fontSize: 18, fontWeight: 800, textAlign: "center", marginBottom: 16 }}>단기 시설 이용 계약서</div>
              <div style={{ fontSize: 11, color: C.textSec, textAlign: "center", marginBottom: 12 }}>운영자와 이용자는 아래 시설 및 부대서비스에 대한 "단기 시설 이용"에 관하여 다음과 같이 계약을 체결한다.</div>

              <div style={{ fontWeight: 800, marginTop: 12 }}>[제1조] 시설의 표시</div>
              <div>소재지: {contract.contract_data?.address || '-'} | 건물명: {buildingName} | 호수: {roomNumber}호</div>

              <div style={{ fontWeight: 800, marginTop: 12 }}>[제2조] 이용 조건</div>
              <div>A. 시설이용 예치금: {fmt(contract.deposit)}원</div>
              <div>B. 이용요금(선불): {fmt(contract.rent)}원</div>
              <div>C. 관리비(선불): {fmt(contract.management_fee)}원</div>
              {contract.internet_fee > 0 && <div>D. TV/인터넷(정액 선불): {fmt(contract.internet_fee)}원</div>}
              {contract.water_fee > 0 && <div>E. 수도세(정액 선불): {fmt(contract.water_fee)}원</div>}
              <div>F. 전기·가스: 후불 (개인 신청 절대 불가)</div>
              {contract.contract_data?.parkingRemoteDeposit > 0 && <div>G. 주차 리모컨 보증금: {fmt(contract.contract_data.parkingRemoteDeposit)}원 (이용 종료 시 반환)</div>}

              {/* 초기납입금 */}
              {(() => {
                const accts = contract.contract_data?.accounts || {};
                const ownerAcct = accts.owner?.[0];
                const hmAcct = accts.houseman?.[0];
                const ownerInit = accts.ownerInitialAmount || 0;
                const hmInit = accts.housemanInitialAmount || 0;
                const remDep = contract.contract_data?.parkingRemoteDeposit || 0;
                const hasDouble = ownerAcct && hmAcct;
                return (
                  <div style={{ margin: "8px 0", padding: 10, background: "#FEF3C7", borderRadius: 6, border: "1px solid #FDE68A" }}>
                    <div style={{ fontWeight: 800, marginBottom: 4, color: C.accent }}>초기 납입금 안내</div>
                    {hasDouble ? (<>
                      <div>① {ownerAcct.holder} 계좌: <strong>{fmt(ownerInit)}원</strong></div>
                      <div style={{ fontSize: 11, color: C.textSec, marginLeft: 12 }}>{ownerAcct.bank} {ownerAcct.account}</div>
                      <div>② {hmAcct.holder} 계좌: <strong>{fmt(hmInit)}원</strong></div>
                      <div style={{ fontSize: 11, color: C.textSec, marginLeft: 12 }}>{hmAcct.bank} {hmAcct.account}</div>
                      {remDep > 0 && <div>리모컨보증금: <strong>{fmt(remDep)}원</strong></div>}
                      <div style={{ fontWeight: 800, marginTop: 4 }}>합계: {fmt(ownerInit + hmInit + remDep)}원</div>
                    </>) : (<>
                      <div>합계: <strong>{fmt(ownerInit + hmInit + remDep)}원</strong></div>
                      {(ownerAcct || hmAcct) && <div style={{ fontSize: 11, color: C.textSec }}>{(ownerAcct || hmAcct).bank} {(ownerAcct || hmAcct).account} ({(ownerAcct || hmAcct).holder})</div>}
                    </>)}
                    <div style={{ fontSize: 10, color: C.accent, marginTop: 4 }}>※ 이용 개시 전까지 전액 납입 (퇴실청소비·전기가스 제외)</div>
                  </div>
                );
              })()}

              <div>이용기간: {contract.move_in} ~ {contract.expiry}</div>

              <div style={{ fontWeight: 800, marginTop: 12 }}>[제3조] 이용요금 납입 및 기간 초과 이용</div>
              <div>1. 이용요금은 매월 납입일까지 선납하는 것을 원칙으로 한다.</div>
              <div>2. 납입일 경과 후에도 이용을 지속하는 경우, 이용요금의 5%가 가산된 단기 연장 이용요금이 적용된다.</div>
              <div>3. 이용요금 납입이 확인되면 동일 조건으로 이용이 지속된다.</div>

              <div style={{ fontWeight: 800, marginTop: 12 }}>[제4조] 미납 시 시설 관리 조치</div>
              <div>- 1단계 (미납 3일): 문자 또는 유선으로 납입 안내</div>
              <div>- 2단계 (미납 5일): 서면 통보 및 설비 공급 제한·출입 관리 조치 예고</div>
              <div>- 3단계 (미납 7일): 전기 등 설비 공급 제한 및 출입 관리 조치 시행</div>

              <div style={{ fontWeight: 800, marginTop: 12 }}>[제5조] 이용 종료 및 통보</div>
              <div>1. 이용 종료를 원하는 경우, 종료 예정일 7일 전까지 통보하여야 한다.</div>
              <div>2. 사전 통보 없이 퇴실할 경우, 7일분의 이용요금 및 관리비를 부담한다.</div>
              <div>4. 이용 기간 만료 전 이용자 사정으로 종료 시, 7일분 이용요금·관리비 등을 부담한다.</div>

              <div style={{ fontWeight: 800, marginTop: 12 }}>[제6조] 의무 이용 기간</div>
              <div>1. 최초 1개월은 의무 이용 기간으로, 1개월분 이용요금은 환급하지 않는다.</div>
              <div>2. 시설이용 예치금은 이용요금으로 절대 대체할 수 없다.</div>

              <div style={{ fontWeight: 800, marginTop: 12 }}>[제7조] 시설 이용 규칙</div>
              {!contract.contract_data?.isResidentRegistrationAllowed && <div>1. 전입신고 불가 — 본 계약은 단기 시설 이용 계약이며, 전입신고 대상이 아니다.</div>}
              <div>2. 이용요금 납입 — 은행 온라인 입금을 원칙으로 한다.</div>
              <div>3. 애완동물 금지 — 위반 시 특수청소비 50만원 + 3회 이상 민원 발생 시 이용 종료 조치.</div>
              <div>4. 실내 흡연 금지 — 특수청소비 + 특수탈취작업 30만원, 도배지 변색 시 도배비용 청구.</div>
              <div>5. 시설물 보전 — 훼손 시 원상회복 및 손해배상.</div>
              <div>6. 불법·공동생활 피해 행위 금지.</div>
              <div>7. 배관 관리 — 이물질 투기 금지, 수리비 이용자 부담.</div>
              <div>8. 수리 협조 의무.</div>
              <div>9. 이용 자격 — 만 50세 이상, 법인, 외국인 계약 불가.</div>
              <div>10. 이용 인원 — 최대 {contract.contract_data?.maxOccupants || 2}인.</div>
              <div>11. {(() => {
                const pType = contract.contract_data?.parkingType || 'none';
                const pFee = contract.contract_data?.parkingFee || 0;
                const pRemote = contract.contract_data?.parkingRemoteDeposit || 0;
                if (pType === 'none' || !parkingAvailable) return '주차불가 — 건물 내 주차장이 없습니다. 인근 공영주차장을 이용해주세요.';
                let txt = pType === 'paid' ? `유료 주차 (월 ${fmt(pFee)}원, 등록 차량 1대 한정)` : pType === 'registered' ? '등록주차 — 등록된 차량 외 주차 불가 (사전 등록 필수)' : '선착순주차 (등록 차량 1대 한정)';
                if (pRemote > 0) txt += ` / 리모컨보증금 ${fmt(pRemote)}원 (이용 종료 시 반환)`;
                if (tenantForm.carNumber) txt += ` — 차량: ${tenantForm.carNumber}`;
                else if (parkingAvailable) txt += ' — 차량 미등록';
                return txt;
              })()}</div>
              <div>12. 전기·가스 — 별도 신청 없이 사용 가능, 사용량에 따라 매월 청구.</div>

              <div style={{ fontWeight: 800, marginTop: 12 }}>[제8조] 퇴실 청소비</div>
              <div>1. 퇴실 청소비(청소 및 소독비)는 이용 종료 시 이용자가 부담한다.</div>
              <div>2. 1년 이상 이용한 경우, 기준 정리비의 50%가 추가 부과된다.</div>

              <div style={{ fontWeight: 800, marginTop: 12 }}>[제9조] 물품 이동 및 처리</div>
              <div>1. 계약 종료 시 즉시 퇴실 및 물품 반출.</div>
              <div>2. 미응 시 운영자가 물품 이동·보관 가능, 비용은 이용자 부담.</div>
              <div>3. 통보 후 30일 내 미인수 시 소유권 포기로 간주.</div>

              <div style={{ fontWeight: 800, marginTop: 12 }}>[제10조] 표준임대차 계약과의 관계</div>
              <div>행정 신고 목적의 표준임대차 계약서는 본 계약이 우선한다.</div>

              {contract.special_terms && (
                <>
                  <div style={{ fontWeight: 800, marginTop: 12 }}>[특약사항]</div>
                  <div>{contract.special_terms}</div>
                </>
              )}

              <div style={{ fontWeight: 800, marginTop: 16, textAlign: "center", color: C.success }}>-- 계약서 끝 --</div>
            </div>

            {/* 반드시 확인하세요 — 동의 체크 바로 위 */}
            <div style={{ padding: 16, background: '#FFEBEE', borderRadius: 12, marginBottom: 16 }}>
              <div style={{ ...T.subhead, color: C.danger, marginBottom: 8 }}>반드시 확인하세요</div>
              <div style={{ fontSize: 13, lineHeight: 1.8, color: C.text }}>
                <div style={{ marginBottom: 8, padding: 10, background: '#FFE0E0', borderRadius: 10 }}>
                  <div><strong>이용요금 미납 시 단전·현관문 작동 제한</strong></div>
                  <div style={{ fontSize: 12, color: C.danger }}>미납 3일: 납입 안내 → 미납 5일: 설비 제한 예고 → <strong>미납 7일: 전기 차단 + 현관문 출입 제한</strong>이 시행됩니다.</div>
                </div>
                <div>• <strong>단기 연장 이용요금</strong> — 납입일 경과 시 이용요금의 5% 가산</div>
                <div>• <strong>애완동물 반입 금지</strong> — 위반 시 특수청소비 50만원 + 3회 이상 민원 발생 시 이용 종료 조치</div>
                <div>• <strong>실내 흡연 금지</strong> — 특수청소비 + 특수탈취작업 30만원, 도배지 변색 시 도배비용 청구</div>
                {!contract.contract_data?.isResidentRegistrationAllowed && <div>• <strong>전입신고 불가</strong> — 본 계약은 시설 이용 계약입니다</div>}
                <div>• <strong>전기·가스 개인 신청 절대 불가</strong></div>
                <div>• <strong>최대 이용인원 {contract.contract_data?.maxOccupants || 2}인</strong></div>
                <div>• <strong>퇴실 7일 전 미통보 시</strong> — 7일분 이용요금+관리비 부담</div>
                <div>• <strong>퇴실 후 30일 내 물품 미수거 시</strong> — 소유권 포기로 간주</div>
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 600, cursor: readContract ? "pointer" : "default", marginBottom: 16, padding: "14px", background: readContract ? (agreedNotice ? '#E8F5E9' : C.card) : C.bg, borderRadius: 12, border: `1px solid ${agreedNotice && readContract ? C.success : C.border}`, opacity: readContract ? 1 : 0.5 }}>
              <input type="checkbox" checked={agreedNotice && readContract} onChange={e => { if (readContract) setAgreedNotice(e.target.checked); }}
                disabled={!readContract} style={{ width: 18, height: 18 }} />
              {readContract ? '위 계약서 전체 내용을 확인하고 동의합니다' : '계약서를 끝까지 스크롤해주세요'}
            </label>

            <FieldError field="agree" />

            <div style={S.stickyFooter}>
            <button onClick={() => {
              if (!readContract || !agreedNotice) { setErrors({ agree: '계약서를 끝까지 읽고 동의 체크해주세요.' }); return; }
              setErrors({}); setStep('tenant_verify');
            }}
              style={agreedNotice ? BTN : S.btnDisabled}>
              다음 -- SMS 본인 인증
            </button>
            </div>
            <button onClick={() => setStep('tenant_step5')}
              style={{ ...S.btnSecondary, marginTop: 8 }}>
              이전으로
            </button>
          </div>
        )}

        {/* ════════ 이용자 — SMS 인증 (본인 인증) ════════ */}
        {step === 'tenant_verify' && (
          <div style={{ ...S.card, marginTop: 20 }}>
            <div style={{ ...T.headline, marginBottom: 4 }}>SMS 본인 인증</div>
            <div style={{ ...T.caption, marginBottom: 16 }}>
              {contract.tenant_phone || tenantForm.phone || '등록된 연락처'}로 인증번호를 발송합니다.
            </div>

            {!tenantSentCode ? (
              <button onClick={() => {
                const code = isSimulation ? '654321' : String(Math.floor(100000 + Math.random() * 900000));
                setTenantSentCode(code);
                if (isSimulation) {
                  setTenantSmsCode('654321');
                  logNotif('📱', '시스템', '이용자', `SMS 인증번호 발송 → ${contract.tenant_phone}: ${code}`);
                } else {
                  setToast(`인증번호가 발송되었습니다: ${code}`);
                }
              }} style={BTN}>
                인증번호 발송
              </button>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={LABEL}>인증번호 6자리</div>
                  <OtpInput value={tenantSmsCode} onChange={setTenantSmsCode} />
                  <FieldError field="tenantVerify" />
                </div>
                <button onClick={async () => {
                  if (!isSimulation && tenantSmsCode !== tenantSentCode) { setErrors({ tenantVerify: '인증번호가 일치하지 않습니다.' }); return; }
                  if (isSimulation && tenantSmsCode.length < 6) { setErrors({ tenantVerify: '6자리를 입력해주세요.' }); return; }
                  try {
                    setLoading(true);

                    // 신분증 업로드
                    let idCardUrl = '';
                    if (idCardFile && !isSimulation) {
                      try {
                        const ext = idCardFile.name.split('.').pop();
                        const fpath = `contracts/${contract.id}/id_card.${ext}`;
                        await supabase.storage.from('contract-files').upload(fpath, idCardFile, { upsert: true });
                        const { data: urlData } = supabase.storage.from('contract-files').getPublicUrl(fpath);
                        idCardUrl = urlData?.publicUrl || '';
                      } catch (e) { console.warn('신분증 업로드 실패:', e); }
                    } else if (idCardFile) {
                      idCardUrl = '[시뮬레이션] 신분증 업로드 스킵';
                    }

                    // 주민번호 암호화 (간이)
                    const ssnEncrypted = btoa(encodeURIComponent(tenantForm.ssn || ''));

                    await updateContract({
                      tenant_name: identityName,
                      tenant_phone: contract.tenant_phone || '',
                      tenant_ssn: (tenantForm.ssn || '').slice(0, 8),
                      tenant_ssn_encrypted: ssnEncrypted,
                      tenant_address: tenantForm.address || '',
                      tenant_email: tenantForm.email || '',
                      tenant_emergency_name: tenantForm.emergencyName || '',
                      tenant_emergency_phone: (tenantForm.emergencyPhone || '').replace(/-/g, ''),
                      tenant_emergency_relation: tenantForm.emergencyRelation || '',
                      tenant_car_number: tenantForm.carNumber || '',
                      tenant_car_type: tenantForm.carType || '',
                      id_card_file_url: idCardUrl,
                      tenant_signed_at: new Date().toISOString(),
                      tenant_sign_auth_code: tenantSmsCode,
                      contract_data: { ...(contract.contract_data || {}), tenantForm },
                      status: 'tenant_signed',
                      _action: 'tenant_signed', _step: 'tenant_verify',
                    });

                    // tenants 테이블에 신분증 URL 연결
                    if (!isSimulation && idCardUrl && contract.tenant_id) {
                      try {
                        await supabase.from('tenants')
                          .update({ id_card_file_url: idCardUrl })
                          .eq('id', contract.tenant_id);
                      } catch (e) { console.warn('tenants 신분증 연결 실패:', e); }
                    }

                    logNotif('✅', '이용자', '시스템', `SMS 본인 인증 완료 (${identityName})`);
                    logNotif('🟡', '시스템', '부동산', `알림 → ${contract.broker_phone || brokerForm.phone}: "이용자 서명 완료. 계약서를 확인하고 중개사 인증을 진행해주세요."`);
                    setToast('본인 인증이 완료되었습니다');
                    setStep('tenant_done');
                  } catch (err) {
                    console.error('전자서명 처리 에러:', err);
                    setErrors({ tenantVerify: '처리 중 오류 발생: ' + err.message });
                  } finally {
                    setLoading(false);
                  }
                }} disabled={loading}
                  style={tenantSmsCode.length === 6 && !loading ? BTN : S.btnDisabled}>
                  {loading ? '처리 중...' : '본인 인증 완료 -- 계약 확정'}
                </button>
                <button onClick={() => { setTenantSentCode(''); setTenantSmsCode(''); setErrors({}); }}
                  style={{ ...S.btnSecondary, marginTop: 8 }}>
                  인증번호 재발송
                </button>
              </>
            )}
          </div>
        )}

        {/* ════════ 이용자 — 계약 완료 화면 ════════ */}
        {step === 'tenant_done' && (
          <div style={{ ...S.card, textAlign: "center", marginTop: 20 }}>
            <style>{`
              @keyframes circleScale { 0% { transform: scale(0); } 70% { transform: scale(1.15); } 100% { transform: scale(1); } }
              @keyframes fadeUp { 0% { opacity: 0; transform: translateY(16px); } 100% { opacity: 1; transform: translateY(0); } }
            `}</style>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.success, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', animation: 'circleScale 0.5s ease' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{ ...T.title, color: C.success, marginBottom: 8, animation: 'fadeUp 0.5s ease 0.3s both' }}>계약 정보 입력이 완료되었습니다</div>
            <div style={{ ...T.body, color: C.textSec, lineHeight: 1.8, marginBottom: 20, animation: 'fadeUp 0.5s ease 0.4s both' }}>
              {buildingName} {roomNumber}호 이용 계약 정보가 정상적으로 접수되었습니다.<br/>
              중개사님의 최종 확인 후 계약이 체결됩니다.
            </div>
            <div style={{ padding: 14, background: C.bg, borderRadius: 12, marginBottom: 16, textAlign: "left", fontSize: 13, color: C.textSec, lineHeight: 1.8 }}>
              <div style={{ ...T.subhead, marginBottom: 4 }}>다음 절차</div>
              <div>1. 중개사님이 계약서를 확인합니다</div>
              <div>2. 중개사님의 SMS 인증으로 계약이 최종 체결됩니다</div>
              <div>3. 체결 완료 후 입주 안내를 별도로 연락드립니다</div>
            </div>
            {isSimulation && (
              <button onClick={() => setStep('broker_contract_review')}
                style={{ ...BTN, background: C.accent }}>
                [시뮬레이션] 부동산 화면으로 전환
              </button>
            )}
          </div>
        )}

        {/* ════════ 시뮬레이션 알림 로그 ════════ */}
        {isSimulation && notifLog.length > 0 && (
          <div style={{ marginTop: 24, padding: 16, background: "#1e1e1e", borderRadius: 12, border: "1px solid #333" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#FEE500" }}>🟡 알림 로그 (시뮬레이션)</div>
              <div style={{ fontSize: 11, color: "#666" }}>{notifLog.length}건</div>
            </div>
            {notifLog.map((n, i) => (
              <div key={i} style={{ padding: "8px 0", borderBottom: i < notifLog.length - 1 ? "1px solid #333" : "none", fontSize: 12, lineHeight: 1.6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ flexShrink: 0 }}>{n.emoji}</span>
                  <div>
                    <span style={{ color: "#4FC3F7", fontWeight: 700 }}>{n.from}</span>
                    <span style={{ color: "#666" }}> → </span>
                    <span style={{ color: "#81C784", fontWeight: 700 }}>{n.to}</span>
                    <span style={{ color: "#999", marginLeft: 8, fontSize: 10 }}>{n.time}</span>
                    <div style={{ color: "#ccc", marginTop: 2 }}>{n.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 시뮬레이션 현재 단계 표시 */}
        {isSimulation && (
          <div style={{ marginTop: 12, padding: 10, background: C.bg, borderRadius: 10, fontSize: 12, color: C.textSec, textAlign: "center" }}>
            현재 단계: <strong style={{ color: C.text }}>{step}</strong> | 시뮬레이션 모드 (DB 미사용)
          </div>
        )}

        <Footer />
      </div>
    </div>
  );
}

// ── 공통 컴포넌트 ──

function StepHeader({ num, total, title }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <span style={{ ...T.overline }}>{num}/{total}</span>
      <span style={{ ...T.headline }}>{title}</span>
    </div>
  );
}

function StepNav({ onPrev, onNext, nextLabel = '다음' }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {onPrev && (
        <button onClick={onPrev} style={{ ...S.btnSecondary, flex: 1 }}>
          이전
        </button>
      )}
      <button onClick={onNext} style={{ ...S.btnPrimary, flex: 2 }}>
        {nextLabel}
      </button>
    </div>
  );
}

function OtpInput({ value, onChange }) {
  const inputRef = useRef(null);
  const digits = value.padEnd(6, '').split('').slice(0, 6);
  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, fontSize: 16 }}
      />
      <div
        onClick={() => inputRef.current?.focus()}
        style={{ display: 'flex', gap: 8, justifyContent: 'center', cursor: 'text' }}
      >
        {Array.from({ length: 6 }, (_, i) => {
          const isCurrent = i === value.length && value.length < 6;
          return (
            <div key={i} style={{
              width: 44, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 10, fontSize: 22, fontWeight: 700, fontFamily: 'monospace',
              background: C.card,
              border: `1.5px solid ${isCurrent ? C.accent : digits[i] ? C.text : C.border}`,
              boxShadow: isCurrent ? '0 0 0 3px rgba(0,122,255,0.15)' : 'none',
              color: C.text,
              transition: 'all 0.15s',
            }}>
              {digits[i] || ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}
