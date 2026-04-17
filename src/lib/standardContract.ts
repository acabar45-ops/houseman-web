/**
 * 표준임대차계약서 DOCX 생성 (워드 템플릿 + docxtemplater)
 * 템플릿: /public/standard_contract_template.docx
 *
 * 칸 맞추기 0 — 원본 양식을 그대로 사용하고 {변수}만 치환.
 */
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

// 숫자 → 한글 금액 ("원" 미포함)
function toKoreanAmount(num: any): string {
  num = Number(num) || 0;
  if (num === 0) return '영';
  const digits = ['','일','이','삼','사','오','육','칠','팔','구'];
  const tens = ['','십','백','천'];
  const units = ['','만','억','조','경'];
  let result = '';
  let n = num;
  let unitIdx = 0;
  while (n > 0) {
    const chunk = n % 10000;
    if (chunk > 0) {
      let chunkStr = '';
      let c = chunk;
      let tIdx = 0;
      while (c > 0) {
        const d = c % 10;
        if (d > 0) {
          const dStr = (d === 1 && tIdx > 0) ? '' : digits[d];
          chunkStr = dStr + tens[tIdx] + chunkStr;
        }
        c = Math.floor(c / 10);
        tIdx++;
      }
      result = chunkStr + units[unitIdx] + result;
    }
    n = Math.floor(n / 10000);
    unitIdx++;
  }
  return result;
}

const fmt = (n: any) => (n || 0).toLocaleString();

// housing_type → 주택유형 줄에서 해당 옵션 V 체크
function buildHousingTypeLine(housingType: string | undefined): string {
  // 사장님 옵션 6개 → 표준계약서 5개 옵션 매핑
  const map: Record<string, number> = {
    '아파트':      0,
    '다세대주택':  2,
    '다가구주택':  3,
    '단독주택':    4,  // "그 밖의 주택"
    '오피스텔':    4,
    '기타':        4,
  };
  const labels = ['아파트', '연립주택', '다세대주택', '다가구주택', '그 밖의 주택'];
  const idx = map[housingType as string];
  return labels
    .map((label, i) => `${label}[${i === idx ? 'V' : ' '}]`)
    .join('  ');
}

// 날짜 문자열 → "YYYY년 M월 D일" 포맷
function formatKoreanDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[0]}년 ${parseInt(parts[1])}월 ${parseInt(parts[2])}일`;
}

// 표준계약서 임대사업자 필드 해석 — 개인/법인 분기
function resolveOwnerFields(building: any, companyInfo: any) {
  const entity = building.owner_entity_type || 'individual';
  const isCorp = entity === 'corporation';
  return {
    name:     isCorp ? (building.owner_business_name || '') : (building.owner_name || ''),
    regno:    isCorp ? (building.owner_business_registration_number || '') : (building.owner_resident_number || ''),
    phone:    (companyInfo && companyInfo.phone) || '',
    address:  building.owner_business_address || '',
    bizRegno: building.rental_business_registration_number || '',
  };
}

/**
 * 표준임대차계약서 DOCX 생성
 */
export async function generateStandardContractDOCX(data: any): Promise<Blob> {
  const {
    building = {},
    room = {},
    contract = {},
    tenant = {},
    broker = {},
    signatures = {},
    companyInfo = {},
  } = data || {};

  // 템플릿 로드
  const templateUrl = '/standard_contract_template.docx';
  const response = await fetch(templateUrl);
  if (!response.ok) throw new Error('표준계약서 템플릿 로드 실패');
  const templateBuffer = await response.arrayBuffer();

  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  // 금액 계산
  const deposit = contract.deposit || 0;
  const rent = contract.rent || 0;
  const hideDeposit = !!building.hide_deposit_in_contract;
  const finalAmount = hideDeposit ? rent : (deposit + rent);

  // 계약기간 포맷
  const contractPeriod = contract.move_in_date && contract.contract_end_date
    ? `${formatKoreanDate(contract.move_in_date)} ∼ ${formatKoreanDate(contract.contract_end_date)}`
    : '';

  // 임대사업자 필드 (개인/법인 분기 + 하우스맨 대표번호)
  const o = resolveOwnerFields(building, companyInfo);

  // 치환 변수
  const values: Record<string, any> = {
    // 계약일
    contract_date: formatKoreanDate(contract.contract_date) || '',

    // 임대사업자
    owner_name:       o.name,
    owner_address:    o.address,
    owner_regno:      o.regno,
    owner_phone:      o.phone,
    owner_biz_regno:  o.bizRegno,

    // 임차인
    tenant_name:    tenant.name || '',
    tenant_address: tenant.address || '',
    tenant_ssn:     tenant.ssn || '',
    tenant_phone:   tenant.phone || '',

    // 중개사
    broker_office:   broker.office_name || '',
    broker_rep:      broker.representative || '',
    broker_address:  broker.office_address || '',
    broker_license:  broker.license_number || '',
    broker_phone:    broker.phone || '',
    broker_employee: broker.representative || '',

    // 주택 표시
    house_address: `${building.address_road || ''} ${room.room_number || ''}호`.trim(),
    housing_type_line: buildHousingTypeLine(building.housing_type),
    deposit_waiver_check: hideDeposit ? '[V]' : '[  ]',

    // 금액
    deposit_kor: hideDeposit ? '없음' : toKoreanAmount(deposit),
    deposit_num: hideDeposit ? '' : fmt(deposit),
    rent_kor:    toKoreanAmount(rent),
    rent_num:    fmt(rent),
    contract_period: contractPeriod,

    // 계약금/중도금/잔금 (비워둠 — 잔금만 채움)
    contract_fee_kor: '',
    contract_fee_num: '',
    middle_fee_kor:   '',
    middle_fee_num:   '',
    middle_date:      '',
    final_fee_kor:    toKoreanAmount(finalAmount),
    final_fee_num:    fmt(finalAmount),
    final_date:       formatKoreanDate(contract.move_in_date) || '',

    // 계좌
    account_number: contract.account?.number || contract.account?.account || '',
    account_bank:   contract.account?.bank || '',
    account_holder: contract.account?.holder || '',

    // 전자인증 (서명란)
    cert_houseman:   signatures.houseman ? `[전자인증완료] ${(signatures.houseman.signedAt) || new Date().toLocaleString('ko-KR')}` : '',
    cert_tenant:     signatures.tenant ? `[전자인증완료] ${signatures.tenant.signedAt || ''} ${signatures.tenant.phone || ''}`.trim() : '',
    cert_broker:     signatures.broker ? `[전자인증완료] ${signatures.broker.verifiedAt || ''} ${signatures.broker.phone || ''}`.trim() : '',
    cert_broker_sub: signatures.broker ? `[전자인증완료] ${signatures.broker.verifiedAt || ''}`.trim() : '',
  };

  // 치환 실행
  doc.render(values);

  // 결과 Blob 반환
  const out = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  return out as Blob;
}

/**
 * 보증금 미가입 동의서 DOCX 생성
 * 템플릿: /public/deposit_waiver_template.docx
 */
export async function generateDepositWaiverDOCX(data: any): Promise<Blob> {
  const {
    building = {},
    room = {},
    contract = {},
    tenant = {},
    companyInfo = {},
  } = data || {};

  const templateUrl = '/deposit_waiver_template.docx';
  const response = await fetch(templateUrl);
  if (!response.ok) throw new Error('동의서 템플릿 로드 실패');
  const templateBuffer = await response.arrayBuffer();

  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  // 주민번호 앞 6자리 → 생년월일 (개인 임대인 전용, 법인이면 빈값)
  const ownerBirth = (building.owner_resident_number || '').slice(0, 6);
  const tenantBirth = (tenant.ssn || '').slice(0, 6);

  const contractPeriod = contract.move_in_date && contract.contract_end_date
    ? `${formatKoreanDate(contract.move_in_date)} ~ ${formatKoreanDate(contract.contract_end_date)}`
    : '';

  // 임대사업자 필드 (개인/법인 분기 + 하우스맨 대표번호)
  const o = resolveOwnerFields(building, companyInfo);

  const values: Record<string, any> = {
    // 임대사업자
    owner_name:      o.name,
    owner_biz_regno: o.bizRegno,
    owner_birth:     ownerBirth,
    owner_phone:     o.phone,

    // 임대주택
    house_address: `${building.address_road || ''} ${building.building_name || ''} ${room.room_number || ''}호`.trim(),

    // 계약기간 (통합)
    contract_period: contractPeriod,
    // 계약기간 (개별 — 동의서 양식 "년 월 일" 사이 배치용)
    mi_year:  contract.move_in_date ? contract.move_in_date.split('-')[0] : '',
    mi_month: contract.move_in_date ? String(parseInt(contract.move_in_date.split('-')[1])) : '',
    mi_day:   contract.move_in_date ? String(parseInt(contract.move_in_date.split('-')[2])) : '',
    mo_year:  contract.contract_end_date ? contract.contract_end_date.split('-')[0] : '',
    mo_month: contract.contract_end_date ? String(parseInt(contract.contract_end_date.split('-')[1])) : '',
    mo_day:   contract.contract_end_date ? String(parseInt(contract.contract_end_date.split('-')[2])) : '',

    // 우선변제금 (기본값 — 사장님이 나중에 조정 가능)
    region:          '서울특별시',
    setup_date:      '',
    priority_amount: '5,000만원',

    // 동의자 (임차인)
    tenant_deposit: fmt(contract.deposit || 0),
    tenant_name:    tenant.name || '',
    tenant_birth:   tenantBirth,
    tenant_phone:   tenant.phone || '',

    // 동의일
    consent_date: formatKoreanDate(new Date().toISOString().slice(0, 10)),
  };

  doc.render(values);

  return doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }) as Blob;
}

/**
 * 다운로드 헬퍼
 */
export function downloadDocxBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
