// @ts-nocheck — SaaS 원본 JS 이식본 (타입 정리는 후속 작업)
/**
 * 계약서 자동 생성 엔진 (브라우저용)
 * - 단기시설이용계약서 (3순위)
 * - 표준임대차계약서
 * - 임대보증금 보증 미가입 동의서
 */
import {
  Document, Packer, Paragraph, TextRun, ImageRun, PageBreak, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, UnderlineType,
  HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType,
} from 'docx';
import { getParkingMode, PARKING_MODE } from './parkingCapacity';

// ── 전자인증 도장 이미지 생성 (Canvas → PNG → ArrayBuffer) ──
function createStampImage(certText: string, size = 100): string {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  const dpr = 2; // 고해상도
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);
  // 투명도 60%
  ctx.globalAlpha = 0.6;
  // 빨간 테두리
  ctx.strokeStyle = '#CC0000';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(3, 3, size - 6, size - 6);
  ctx.fillStyle = '#CC0000';
  ctx.textAlign = 'center';
  // 전자인증
  ctx.font = 'bold 13px 맑은 고딕, sans-serif';
  ctx.fillText('전자인증', size / 2, 22);
  // 구분선
  ctx.font = '9px sans-serif';
  ctx.fillText('━━━━━━', size / 2, 33);
  // 인증 정보 (여러 줄)
  ctx.font = 'bold 9px 맑은 고딕, sans-serif';
  const lines = String(certText).split('\n').filter(l => l.trim());
  lines.forEach((line, i) => ctx.fillText(line, size / 2, 46 + i * 12));
  // 구분선
  ctx.font = '9px sans-serif';
  ctx.fillText('━━━━━━', size / 2, 46 + lines.length * 12 + 3);
  // 완료
  ctx.font = 'bold 13px 맑은 고딕, sans-serif';
  ctx.fillText('완료', size / 2, 46 + lines.length * 12 + 17);
  return canvas.toDataURL('image/png');
}

function dataURLtoBuffer(dataURL: string): Uint8Array {
  const base64 = dataURL.split(',')[1];
  const binary = atob(base64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf;
}

function makeStampRun(sigData: any, xPt = 0, yPt = 0): any {
  const lines: string[] = [];
  if (sigData.signedAt || sigData.verifiedAt) lines.push(sigData.signedAt || sigData.verifiedAt);
  if (sigData.phone) lines.push(sigData.phone);
  const certText = lines.join('\n') || '인증완료';
  const dataURL = createStampImage(certText, 90);
  const buffer = dataURLtoBuffer(dataURL);
  const EMU = 12700;
  return new ImageRun({
    data: buffer,
    transformation: { width: 50, height: 50 },
    type: 'png',
    floating: {
      horizontalPosition: {
        relative: HorizontalPositionRelativeFrom.COLUMN,
        offset: Math.round(xPt * EMU),
      },
      verticalPosition: {
        relative: VerticalPositionRelativeFrom.PARAGRAPH,
        offset: Math.round(yPt * EMU),
      },
      wrap: { type: TextWrappingType.NONE },
      behindDocument: false,
      allowOverlap: true,
      lockAnchor: false,
    },
  } as any);
}

// ── 스타일 상수 (Apple Legal Style) ──
const FONT = '맑은 고딕';
const TW = 10300;
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const hLine = { style: BorderStyle.SINGLE, size: 1, color: 'E5E5EA' };
const BS = { top: hLine, bottom: hLine, left: NONE, right: NONE };
const CM = { top: 8, bottom: 8, left: 28, right: 28 };
const CMS = { top: 28, bottom: 28, left: 40, right: 40 };
const BG = 'F8F8FA';
const RED = 'FF3B30';
const GRAY = '86868B';
const TXT = '1D1D1F';

// ── 헬퍼 함수 ──
function R(t: string, o: any = {}): any {
  return new TextRun({ text: t, font: FONT, size: o.s || 18, bold: o.b, color: o.c || TXT, underline: o.u ? { type: UnderlineType.SINGLE } : undefined } as any);
}
function P(content: any, o: any = {}): any {
  const ch = typeof content === 'string' ? [R(content, { s: o.s || 18, b: o.b, c: o.c, u: o.u })] : content;
  return new Paragraph({ children: ch, alignment: o.a || AlignmentType.LEFT, spacing: { before: o.sb != null ? o.sb : 12, after: o.sa != null ? o.sa : 12, line: o.ln || 252 }, indent: o.ind ? { left: o.ind } : undefined } as any);
}
function C(t: string, w: number, o: any = {}): any {
  const m = o.mt === 's' ? CMS : CM;
  return new TableCell({ borders: BS, width: { size: w, type: WidthType.DXA }, margins: m, shading: o.bg ? { fill: o.bg, type: ShadingType.CLEAR } : undefined, verticalAlign: 'center', columnSpan: o.cs, rowSpan: o.rs, children: o.ch || [P(t || '', { s: o.s || 17, b: o.b, c: o.c, a: o.a || AlignmentType.CENTER, sb: 0, sa: 0, ln: 240 })] } as any);
}
function T(rows: any[], w: number[]): any { return new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: w, rows } as any); }
function ROW(c: any[]): any { return new TableRow({ children: c }); }
function H(t: string): any { return P([R(t, { s: 22, b: true })], { sb: 120, sa: 36 }); }
function B(t: any, o: any = {}): any { return P(t, { s: o.s || 18, sb: o.sb != null ? o.sb : 20, sa: o.sa != null ? o.sa : 20, ln: 252, c: o.c, b: o.b }); }
const fmt = (n: any) => (n || 0).toLocaleString();
function PB(): any { return new Paragraph({ children: [new PageBreak()] }); }
function FOOTER(): any { return P([R('210mm×297mm[백상지 80g/㎡]', { s: 14, c: GRAY })], { a: AlignmentType.RIGHT, sb: 20, sa: 0 }); }

// ── 컬럼 폭 (TW 10300) ──
const W1 = [1200, 3450, 1200, 2250, 1200, 1000];
const WC = [2650, 2300, 2650, 2700];
const WD = [1400, 1400, 4300, 1400, 1800];
const WS = [1200, 1000, 3550, 1200, 3350];
const WP = [2000, 8300];

/**
 * 단기시설이용계약서 생성
 */
export async function generateShortTermContract(data: any): Promise<Blob> {
  const { building = {}, room = {}, contract = {}, tenant = {}, broker = {}, accounts = {}, parking = {}, signatures = {} } = data || {};

  const address = building.address_road || building.address_old || '';
  const buildingName = building.building_name || '';
  const roomNumber = room.room_number || contract.room || '';
  // 단기 자유 특약 — 카드 배열(JSONB) 또는 구 TEXT 포맷 둘 다 지원
  const _specialTermsRaw = building.contract_special_terms_short_term;
  const specialTerms = Array.isArray(_specialTermsRaw)
    ? _specialTermsRaw.map((c: any) => c?.text || '').filter(Boolean).join('\n')
    : (_specialTermsRaw || '');
  // 단기 우선 제한 조건 (스냅샷에서 가져옴) — 신/구 포맷 모두 지원 (text ?? label)
  const priorityRestrictions = Array.isArray(contract.contract_data?.priorityRestrictionsResolved)
    ? contract.contract_data.priorityRestrictionsResolved
    : [];
  const priorityRestrictionsText = priorityRestrictions.map((r: any) => `※ ${r.text ?? r.label ?? ''}`).filter((t: string) => t !== '※ ').join('\n');
  // 호실 예외 옵션
  const extraOccupantFee = Number(contract.contract_data?.extraOccupantFee) || 0;
  const externalParkingNote = contract.contract_data?.externalParkingNote || '';

  // 금액
  const deposit = contract.deposit || 0;
  const rent = contract.rent || 0;
  const mgmtFee = contract.management_fee || 0;
  const internet = contract.internet_fee || 0;
  const water = contract.water_fee || 0;
  const cleaningFee = contract.cleaning_fee || 0;

  // 기간
  const moveIn = contract.move_in_date || '';
  const moveOut = contract.contract_end_date || '';
  const paymentDay = contract.payment_due_day || '';

  // 계좌
  const ownerAccounts = accounts.owner || [];
  const hmAccounts = accounts.houseman || [];
  const hasDoubleAccount = hmAccounts.length > 0 && ownerAccounts.length > 0;

  // 초기납입금 계산 (선불 항목만, 퇴실청소비·전기가스 제외)
  const parkingFee = Number(parking.fee) || 0;
  const remoteDeposit = Number(parking.remoteDeposit) || 0;
  const rentToOwner = building.rent_account_target && building.rent_account_target !== 'houseman';
  const baseOwnerInitial = (accounts.ownerInitialAmount || 0);
  const baseHmInitial = (accounts.housemanInitialAmount || 0);
  const ownerInitial = baseOwnerInitial + (rentToOwner ? parkingFee : 0);
  const hmInitial = baseHmInitial + (rentToOwner ? 0 : parkingFee) + remoteDeposit;

  // 주차 텍스트 — 건물 레벨(parking_total_spaces)이 진실의 단일 소스
  const parkingMode = getParkingMode(building.parking_total_spaces);
  const parkingFull = !!data.parkingFull;
  let parkingText: string;
  if (parkingMode === PARKING_MODE.PROHIBITED) {
    parkingText = '주차 불가 — 건물 내 주차장이 없습니다. 인근 공영주차장을 이용해주세요.';
  }
  else if (parkingMode === PARKING_MODE.CAPPED && parkingFull) {
    parkingText = '주차 만차 — 현재 건물 주차장이 만차 상태로 추가 주차가 불가합니다. 인근 공영주차장을 이용해주세요.';
  }
  else if (parkingMode === PARKING_MODE.UNLIMITED) {
    parkingText = '선착순주차 (등록 차량 1대 한정)';
  }
  else if (parking.type === 'first_come' || parking.type === 'free') parkingText = '선착순주차 (등록 차량 1대 한정)';
  else if (parking.type === 'registered') parkingText = '등록주차 — 등록된 차량 외 주차 불가 (사전 등록 필수)';
  else if (parking.type === 'paid' || parking.type === 'remote') {
    const parts: string[] = [];
    if (parkingFee > 0) parts.push(`월 주차요금 ${parkingFee.toLocaleString()}원`);
    if (remoteDeposit > 0) parts.push(`리모컨 보증금 ${remoteDeposit.toLocaleString()}원 (분실 시 동일 금액 재청구)`);
    parkingText = parts.length > 0 ? parts.join(' / ') : '주차 가능';
  }
  else {
    parkingText = parkingMode === PARKING_MODE.CAPPED
      ? `주차 가능 (총 ${building.parking_total_spaces}대 한정)`
      : '주차 가능';
  }

  // 운영자 정보 (operatorType에 따라 건물주 또는 하우스맨)
  const ci = data.companyInfo || {};
  const isOwnerOperator = data.operatorType === 'owner';
  const operatorName = isOwnerOperator ? (building.owner_name || '') : (ci.name || '하우스맨');
  const operatorRepresentative = isOwnerOperator ? '' : (ci.representative || '');
  const operatorRegNo = isOwnerOperator ? (building.owner_business_registration_number || building.owner_resident_number || '') : (ci.business_registration_number || '');
  const operatorAddress = isOwnerOperator ? (building.owner_home_address || '') : (ci.address || '');
  const operatorPhone = isOwnerOperator ? (building.owner_phone || '') : (ci.phone || '');

  // 기간 파싱
  const miParts = moveIn ? moveIn.split('-') : ['', '', ''];
  const moParts = moveOut ? moveOut.split('-') : ['', '', ''];
  const months = miParts[0] && moParts[0] ? Math.max(1, Math.round((new Date(moveOut).getTime() - new Date(moveIn).getTime()) / (1000 * 60 * 60 * 24 * 30))) : '';

  // 계좌 행
  const accountRows: any[] = [];
  if (hasDoubleAccount) {
    const oa = ownerAccounts[0] || {};
    const ha = hmAccounts[0] || {};
    accountRows.push(ROW([C('입 금 계 좌 ①', WD[0], { bg: BG, b: true, s: 16 }), C(`${oa.bank || ''} ${oa.account || ''} ${oa.holder || ''}`, WD[1] + WD[2] + WD[3] + WD[4], { cs: 4, a: AlignmentType.LEFT })]));
    accountRows.push(ROW([C('입 금 계 좌 ②', WD[0], { bg: BG, b: true, s: 16 }), C(`${ha.bank || ''} ${ha.account || ''} ${ha.holder || ''}`, WD[1] + WD[2] + WD[3] + WD[4], { cs: 4, a: AlignmentType.LEFT })]));
  } else {
    const acc = ownerAccounts[0] || hmAccounts[0] || {};
    accountRows.push(ROW([C('입 금 계 좌', WD[0], { bg: BG, b: true }), C(`${acc.bank || ''} ${acc.account || ''} ${acc.holder || ''}`, WD[1] + WD[2] + WD[3] + WD[4], { cs: 4 })]));
  }

  // 초기납입금 행
  const contractDeposit = data.contractDeposit || contract.contract_deposit || 0;
  const initialPaymentRows: any[] = [];
  const paidAmount = contractDeposit;

  if (hasDoubleAccount) {
    const oa = ownerAccounts[0] || {};
    const ha = hmAccounts[0] || {};

    const ownerItems: string[] = [`예치금 ${fmt(deposit)}원`];
    if (ownerInitial > deposit) ownerItems.push(`이용요금 등 ${fmt(ownerInitial - deposit)}원`);
    if (remoteDeposit > 0) ownerItems.push(`리모컨보증금 ${fmt(remoteDeposit)}원`);

    initialPaymentRows.push(ROW([
      C('초기 납입금', 2400, { bg: BG, b: true }),
      C('', 3900, { a: AlignmentType.LEFT, ch: [
        P([R(`① ${oa.holder} 계좌`, { s: 16, b: true })], { sb: 0, sa: 1 }),
        P([R(`${fmt(ownerInitial + remoteDeposit)}원`, { s: 20, b: true })], { sb: 0, sa: 1 }),
        P([R(`${oa.bank} ${oa.account} (${oa.holder})`, { s: 16 })], { sb: 0, sa: 1 }),
        P([R(`${ownerItems.join(' / ')}`, { s: 14, c: GRAY })], { sb: 0, sa: 0 }),
      ] }),
      C('', 3900, { a: AlignmentType.LEFT, ch: [
        P([R(`② ${ha.holder} 계좌`, { s: 16, b: true })], { sb: 0, sa: 1 }),
        P([R(`${fmt(hmInitial)}원`, { s: 20, b: true })], { sb: 0, sa: 1 }),
        P([R(`${ha.bank} ${ha.account} (${ha.holder})`, { s: 16 })], { sb: 0, sa: 1 }),
        P([R(`관리비·공과금 등`, { s: 14, c: GRAY })], { sb: 0, sa: 0 }),
      ] }),
    ]));
  } else {
    const acc = ownerAccounts[0] || hmAccounts[0] || {};
    const items: string[] = [`시설이용 예치금 ${fmt(deposit)}원`, `이용요금 ${fmt(rent)}원`];
    if (mgmtFee > 0) items.push(`관리비 ${fmt(mgmtFee)}원`);
    if (internet > 0) items.push(`TV/인터넷 ${fmt(internet)}원`);
    if (water > 0) items.push(`수도세 ${fmt(water)}원`);
    if (remoteDeposit > 0) items.push(`리모컨보증금 ${fmt(remoteDeposit)}원(반환)`);
    const rawTotal = (ownerInitial || 0) + (hmInitial || 0) + remoteDeposit;
    const total = rawTotal > 0 ? rawTotal : (deposit + rent + mgmtFee + internet + water + remoteDeposit);

    initialPaymentRows.push(ROW([C('초기 납입금', 2400, { bg: BG, b: true }), C('', 7800, { a: AlignmentType.LEFT, s: 20, ch: [
      P([R(`${acc.holder} 계좌: `, { s: 16 }), R(`${fmt(total)}원`, { s: 20, b: true })], { sb: 0, sa: 1 }),
      P([R(`${acc.bank} ${acc.account} (${acc.holder})`, { s: 16 })], { sb: 0, sa: 1 }),
      P([R(`${items.join(' / ')}`, { s: 14, c: GRAY })], { sb: 0, sa: 0 }),
    ] })]));
  }

  // 입금 확인 내역 (별도 2열 테이블)
  const paidAccountLabel = hasDoubleAccount ? ` (① ${ownerAccounts[0]?.holder || '건물주'} 계좌)` : '';
  const paidRow = paidAmount > 0 ? T([ROW([C('입금 확인', 2400, { bg: BG, b: true }), C(`계약금 ${fmt(paidAmount)}원 입금 확인됨${paidAccountLabel}`, 7800, { a: AlignmentType.LEFT, s: 20, c: '059669' })])], [2400, 7800]) : null;

  const children: any[] = [
    // ── 헤더 ──
    P([R('단기 시설 이용 계약서', { s: 52, b: true })], { a: AlignmentType.CENTER, sb: 6, sa: 4 }),
    P([R('전기, 가스는 등록되어 있습니다. 별도로 등록이 필요 없습니다.', { s: 14, c: GRAY })], { a: AlignmentType.CENTER, sb: 0, sa: 1 }),
    P([R('운영자와 이용자는 아래 시설 및 부대서비스에 대한 "단기 시설 이용"에 관하여 다음과 같이 계약을 체결한다.', { s: 18, b: true })], { a: AlignmentType.CENTER, sb: 0, sa: 1 }),
    B('본 계약은 운영자와 이용자가 개별적으로 협의하여 체결한 것으로, 일방이 사전에 마련한 약관이 아니다.', { s: 14, c: GRAY, sb: 0, sa: 6 }),

    // ── 제1조 시설의 표시 ──
    H('[제1조] 시설의 표시'),
    T([ROW([C('소 재 지', W1[0], { bg: BG, b: true }), C(address, W1[1]), C('건 물 명', W1[2], { bg: BG, b: true }), C(buildingName, W1[3]), C('이용시설 호수', W1[4], { bg: BG, b: true, s: 13 }), C(`${roomNumber}호`, W1[5])])], W1),
    B('본 계약은 아래 시설 및 부대서비스를 포함한 단기 시설 이용 계약이다.', { s: 20, sb: 3, sa: 1 }),
    B('① 가구·가전 등 비품 일체 제공  ② 공용부 청소 및 관리  ③ 시설물 유지·보수 서비스  ④ 전기·가스 공급 관리 대행  ⑤ 기타 건물 운영에 따른 관리 서비스', { s: 14, sb: 0, sa: 3, c: GRAY }),

    // ── 제2조 이용 조건 ──
    H('[제2조] 이용 조건'),
    T([
      ROW([C(' A.  시설이용 예치금', WC[0], { a: AlignmentType.LEFT, b: true }), C(`${fmt(deposit)}원`, WC[1], { a: AlignmentType.RIGHT }), C(' D.  TV/인터넷(정액 선불)', WC[2], { a: AlignmentType.LEFT, b: true }), C(`${fmt(internet)}원`, WC[3], { a: AlignmentType.RIGHT })]),
      ROW([C(' B.  이용요금(선불)', WC[0], { a: AlignmentType.LEFT, b: true }), C(`${fmt(rent)}원`, WC[1], { a: AlignmentType.RIGHT }), C(' E.  수도세(정액 선불)', WC[2], { a: AlignmentType.LEFT, b: true }), C(`${fmt(water)}원`, WC[3], { a: AlignmentType.RIGHT })]),
      ROW([C(' C.  관리비(선불)', WC[0], { a: AlignmentType.LEFT, b: true }), C(`${fmt(mgmtFee)}원`, WC[1], { a: AlignmentType.RIGHT }), C(' F.  전기·가스 후불', WC[2], { a: AlignmentType.LEFT, b: true }), C('개인 신청 절대 불가', WC[3], { b: true, c: RED })]),
      ...(remoteDeposit ? [ROW([C(' G.  주차 리모컨 보증금', WC[0], { a: AlignmentType.LEFT, b: true }), C(`${fmt(remoteDeposit)}원`, WC[1], { a: AlignmentType.RIGHT }), C('이용 종료 시 리모컨 반납 후 반환', WC[2] + WC[3], { cs: 2, s: 14, c: GRAY, a: AlignmentType.LEFT })])] : []),
    ], WC),
    B('※ 시설이용 예치금은 이용 종료 시 시설물 점검, 공과금 정산, 원상회복 비용 등을 차감한 후 이용자 본인 계좌로 반환하며, 이용요금의 선납 또는 대체 수단이 아니다.', { s: 14, c: GRAY, sb: 2, sa: 3, ln: 252 }),

    ...(hasDoubleAccount
      ? [T([initialPaymentRows[0]], [2400, 3900, 3900])]
      : [T([initialPaymentRows[0]], [2400, 7800])]
    ),
    ...(paidRow ? [paidRow] : []),
    B('※ 초기 납입금은 이용 개시 전까지 전액 납입하여야 하며, 납입 완료 시 시설 이용이 개시된다.', { s: 14, c: GRAY, sb: 2, sa: 3 }),

    T([
      ROW([C('이 용 기 간', WD[0], { bg: BG, b: true }), C(`${miParts[0]}년 ${miParts[1]}월 ${miParts[2]}일 ~ ${moParts[0]}년 ${moParts[1]}월 ${moParts[2]}일 (${months}개월)`, WD[1] + WD[2], { cs: 2, a: AlignmentType.LEFT }), C('이용기간 만료 전 퇴실 시 아래의 위약금 부과', WD[3] + WD[4], { cs: 2, s: 16 })]),
      ROW([C('납 입 일', WD[0], { bg: BG, b: true }), C(`매월 ${paymentDay}일`, WD[1]), C('최초 1개월은 의무 이용 기간이며, 이후 매월 선불 납입. 기간 초과 시 5% 가산 (제3조)', WD[2] + WD[3] + WD[4], { cs: 3, a: AlignmentType.LEFT, s: 16 })]),
      ...accountRows,
      ROW([C('공 과 금', WD[0], { bg: BG, b: true }), C('전기·가스 후불 (개인 신청 절대 불가) / 이용요금과 함께 청구', WD[1] + WD[2], { cs: 2, a: AlignmentType.LEFT, s: 13 }), C('', WD[3], { ch: [P('퇴실청소비', { s: 20, b: true, u: true, a: AlignmentType.CENTER, sb: 0, sa: 0 })] }), C(`${fmt(cleaningFee)}원`, WD[4])]),
    ], WD),
    B('※ 이용 기간 만료 전 이용 종료 시 제5조에 따른 조건이 적용된다.', { s: 14, c: GRAY, sb: 2, sa: 3 }),

    // ── 제3조~제10조 (고정 약관) ──
    H('[제3조] 이용요금 납입 및 기간 초과 이용'),
    B('1. 이용요금은 매월 납입일까지 선납하는 것을 원칙으로 한다.'),
    B('2. 납입일 포함 5일차까지 미납 시, 이용요금의 5%가 가산된 단기 연장 이용요금이 적용된다. 이는 기간 초과 이용에 대한 시설 이용 대가이며, 연체료 또는 지연이자가 아니다. 단, 가산 적용은 최대 1개월분을 한도로 한다.'),
    B('3. 이용요금 납입이 확인되면 동일 조건으로 이용이 지속된다. 별도의 연장 절차는 필요하지 않으며, 이용 종료를 원할 경우 제5조에 따라 통보한다.'),

    H('[제4조] 미납 시 시설 관리 조치'),
    B('1. 이용요금 미납 시 운영자는 다음 단계에 따라 관리 조치를 시행한다.'),
    B('  - 1단계 (미납 3일): 문자 또는 유선으로 납입 안내', { sb: 2, sa: 2 }),
    B('  - 2단계 (미납 5일): 서면(문자 포함) 통보 및 설비 공급 제한·출입 관리 조치 예고', { sb: 2, sa: 2 }),
    B('  - 3단계 (미납 7일): 전기 등 설비 공급 제한 및 출입 관리 조치 시행(출입수단 변경 포함)', { sb: 2, sa: 2 }),
    B('2. 상기 조치는 시설 운영 및 안전 관리 목적으로 최소한의 범위 내에서 시행하며, 미납 해소 시 즉시 정상화한다.'),
    B('3. 출입수단 변경 등에 소요되는 비용은 이용자가 부담한다.'),
    B('4. 이용자는 본 조항의 내용을 충분히 설명 듣고 이해하였으며, 이에 동의한다.'),

    H('[제5조] 이용 종료 및 통보'),
    B('1. 이용 종료를 원하는 경우, 이용자는 종료 예정일 7일 전까지 운영자 또는 관리인에게 통보하여야 한다.'),
    B('2. 사전 통보 없이 퇴실할 경우, 이용자는 7일분의 이용요금 및 관리비를 부담한다.'),
    B('3. 이용 기간이 명시되어 있더라도 종료 시 7일 전 통보 의무는 동일하게 적용된다.'),
    B('4. 이용 기간 만료 전 이용자 사정으로 이용을 종료하는 경우, 이용자는 7일분 이용요금·관리비 등 운영자 측 중개비용을 부담한다. (단, 이용자가 후속 이용자를 연결한 경우 해당 금액은 면제한다.)'),

    H('[제6조] 의무 이용 기간'),
    B('1. 최초 1개월은 의무 이용 기간으로, 실제 이용 여부와 관계없이 1개월분 이용요금은 환급하지 않는다.'),
    B('2. 시설이용 예치금은 이용요금으로 절대 대체할 수 없다.'),

    H('[제7조] 시설 이용 규칙'),
    ...(data.isResidentRegistrationAllowed ? [] : [B('1. 전입신고 불가 — 본 계약은 단기 시설 이용 계약이며, 전입신고 대상이 아니다. 본 시설의 운영 사업자는 비과세 사업자로 세금계산서 발행이 불가하다.')]),
    B('2. 이용요금 납입 — 은행 온라인 입금을 원칙으로 한다.'),
    B('3. 애완동물 금지 — 일시적 방문·임시 보호 포함 일절 금지한다. 위반 시 이용자는 특수청소비 50만원을 부담한다. 3회 이상 민원 발생 시 이용 종료 조치한다. 실제 복구 비용이 이를 초과하는 경우 실비로 청구하며, 하회하는 경우에도 해당 금액은 시설 복구 및 관리에 소요되는 최소 정리 비용으로서 감액하지 않는다.'),
    B('4. 실내 흡연 금지 — 특수청소비 + 특수탈취작업 30만원을 청구한다. 도배지 변색 시 도배비용을 별도 청구한다.'),
    B('5. 시설물 보전 — 이용자는 비품 및 시설물 훼손 시 원상회복하고 손해액을 배상한다. (못, 각종 부착물 등 운영자 동의 없이 설치 불가)'),
    B('6. 불법·공동생활 피해 행위 금지 — 불법 영업, 도박, 심한 소음, 고성방가, 동물 사육, 전염성 질환 등 공동생활에 심각한 피해를 주는 행위 발생 시 운영자는 즉시 이용 종료 처리할 수 있다.'),
    B('7. 배관 관리 — 변기·하수구 등에 물티슈, 휴지, 음식물쓰레기 등 이물질 투기를 금지하며, 이로 인한 수리 비용은 이용자가 부담한다.'),
    B('8. 수리 협조 — 건물 수리 또는 긴급 응급처치를 위한 작업 시 이용자는 협조하여야 한다.'),
    B('9. 이용 자격 — 본 시설은 운영 특성상 아래에 해당하는 경우 이용 계약을 체결하지 않는다.'),
    B('   ① 계약자가 만 50세 이상인 경우  ② 법인 또는 법인 명의의 계약  ③ 외국인 (외국 국적자)', { sb: 2, sa: 2 }),
    B('   상기 기준은 시설 운영·관리 및 보험·안전 기준에 따른 것이며, 운영자의 이용 계약 체결 기준으로서 사전에 고지한다.', { s: 20, sb: 2, sa: 3 }),
    B(`10. 이용 인원 — 최대 ${data.maxOccupants || 2}인까지이며, ${(data.maxOccupants || 2) + 1}인 이상 이용 시 계약 위반으로 본다.`),
    B(`11. ${parkingText}`),
    B('12. 전기·가스 — 별도 신청 없이 사용 가능하며, 요금은 이용자 부담으로 사용량에 따라 매월 청구한다.'),

    H('[제8조] 퇴실 청소비'),
    B(`1. 퇴실 청소비(청소 및 소독비)는 ${fmt(cleaningFee)}원을 이용 종료 시 이용자가 부담한다.`),
    B('2. 1년 이상 이용한 경우, 기준 정리비의 50%가 추가 부과된다.'),

    H('[제9조] 물품 이동 및 처리'),
    B('1. 이용요금 미납 등의 사유로 본 계약이 종료된 경우, 이용자는 즉시 시설 이용을 중단하고 퇴실하여야 하며, 본인 소유 물품 일체를 반출하여야 한다.'),
    B('2. 이용자가 퇴실 및 물품 반출에 응하지 않을 경우, 운영자는 시설 운영 및 안전 관리 목적으로 해당 물품을 임의 장소로 이동 및 보관할 수 있으며, 이에 대한 비용은 이용자가 부담한다. 이용자는 이에 대해 사전 동의한 것으로 본다.'),
    B('3. 운영자는 이용자에게 서면(문자 포함)으로 물품 인수를 통보하며, 통보일로부터 30일 이내에 미납금 정산 및 물품 인수가 이루어지지 않을 경우, 이용자가 소유권을 포기한 것으로 간주한다.'),
    B('4. 포기로 간주된 물품은 운영자가 폐기, 매각 등 임의 처리할 수 있으며, 이용자는 이에 대해 이의를 제기하지 않기로 한다.'),

    H('[제10조] 표준임대차 계약과의 관계'),
    B('관계 법령에 따른 행정 신고가 필요한 경우, 별도의 표준임대차 계약서를 작성할 수 있다. 해당 계약서는 행정 신고 목적에 한하며, 당사자 간 권리·의무 관계는 본 계약이 우선한다. 양 계약의 내용이 상충할 경우 본 계약을 기준으로 해석한다.'),

  ];

  // 단기는 [특약사항] 분리 없이 [계약 전 반드시 확인 — 제한 조건] 한 섹션으로 통합.
  const freeTermLines: string[] = priorityRestrictions.length > 0
    ? []
    : String(specialTerms || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
  if (priorityRestrictions.length > 0 || freeTermLines.length > 0) {
    children.push(H('[계약 전 반드시 확인 — 제한 조건]'));
    priorityRestrictions.forEach((r: any) => {
      const txt = r?.text ?? r?.label ?? '';
      if (txt) children.push(B(`※ ${txt}`));
    });
    freeTermLines.forEach((line: string) => {
      children.push(B(`※ ${line}`));
    });
  }

  // 주차 정보 (가격 있는 경우)
  if (parking.type === 'paid' || parking.type === 'remote') {
    const parts: string[] = [];
    if (parkingFee > 0) parts.push(`※ 월 주차요금: ${parkingFee.toLocaleString()}원 (선불, 매월 청구)`);
    if (remoteDeposit > 0) parts.push(`※ 주차 리모컨 보증금: ${remoteDeposit.toLocaleString()}원 (1회, 분실 시 동일 금액 재청구)`);
    if (parts.length > 0) {
      children.push(H('[주차]'));
      parts.forEach(line => children.push(B(line)));
    }
  }

  // 외부 주차 안내 (호실 단위)
  if (externalParkingNote && String(externalParkingNote).trim() !== '') {
    children.push(H('[외부 주차 안내]'));
    String(externalParkingNote).split('\n').forEach((line: string) => {
      if (line.trim()) children.push(B(`※ ${line.trim()}`));
    });
  }

  // 거주인원 추가 비용 (호실 단위)
  if (extraOccupantFee > 0) {
    children.push(H('[거주인원 추가 비용]'));
    children.push(B(`※ 거주인원 1인 추가 시 월 ${extraOccupantFee.toLocaleString()}원 추가 (월세에 합산 청구)`));
  }

  // 주차 가능 시 차량 정보
  if (parking.type && parking.type !== 'none') {
    children.push(P('', { sb: 5, sa: 5 }));
    children.push(T([
      ROW([C('차량번호', 2000, { bg: BG, b: true }), C(parking.carNumber || '', 3600), C('차종', 1200, { bg: BG, b: true }), C(parking.carType || '', 3400)]),
    ], [2000, 3600, 1200, 3400]));
    if (parking.remoteDeposit) {
      children.push(B(`※ 주차 리모컨 보증금: ${fmt(parking.remoteDeposit)}원 (이용 종료 시 반환)`, { s: 14, c: GRAY }));
    }
  }

  // 서명란 (전자서명 시 도장 이미지가 표 안에 표시되므로 인라인 인증 정보 불필요)
  if (!signatures.tenant) {
    children.push(P([R('이용자 서명: __________________', { s: 15 })], { a: AlignmentType.RIGHT, sb: 3, sa: 6 }));
  }
  children.push(

    (() => {
      const d = contract.contract_date ? new Date(contract.contract_date) : new Date();
      return P([R(`${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`, { s: 48, b: true })], { a: AlignmentType.CENTER, sb: 200, sa: 120 });
    })(),

    // 운영자
    T([
      ROW([C('운영자', WS[0], { bg: BG, b: true, rs: isOwnerOperator ? 4 : 2, mt: 's' }), C('성명', WS[1], { bg: BG, b: true, s: 20, mt: 's' }), C('', WS[2], { s: 20, mt: 's', ch: [
        P([
          R(`${operatorName}`, { s: 15 }),
          ...(operatorRepresentative ? [R(` (대표:${operatorRepresentative})`, { s: 14, c: '666666' })] : []),
          R('  ', { s: 15 }),
          ...(signatures.houseman ? [makeStampRun(signatures.houseman, 50, -10)] : [R('(인)', { s: 15 })]),
        ], { sb: 0, sa: 0 }),
      ] }), C('등록번호', WS[3], { bg: BG, b: true, s: 20, mt: 's' }), C(operatorRegNo, WS[4], { mt: 's' })]),
      ROW([C('주소', WS[1], { bg: BG, b: true, s: 20, mt: 's' }), C(operatorAddress, WS[2], { mt: 's' }), C('전화번호', WS[3], { bg: BG, b: true, s: 20, mt: 's' }), C(operatorPhone, WS[4], { s: 20, mt: 's' })]),
      ...(isOwnerOperator ? [
        ROW([C('관리회사', WS[1], { bg: BG, b: true, s: 20, mt: 's' }), C(`${ci.name || '하우스맨'} (대표:${ci.representative || ''})`, WS[2], { s: 20, mt: 's' }), C('사업자등록번호', WS[3], { bg: BG, b: true, s: 14, mt: 's' }), C(ci.business_registration_number || '', WS[4], { s: 20, mt: 's' })]),
        ROW([C('주소', WS[1], { bg: BG, b: true, s: 20, mt: 's' }), C(ci.address || '', WS[2] + WS[3] + WS[4], { cs: 3, a: AlignmentType.LEFT, s: 20, mt: 's' })]),
      ] : []),
    ], WS),
    P('', { sb: 80, sa: 80, ln: 40 }),

    // 이용자
    T([
      ROW([C('이용자', WS[0], { bg: BG, b: true, rs: 2, mt: 's' }), C('성명', WS[1], { bg: BG, b: true, s: 20, mt: 's' }), C('', WS[2], { mt: 's', ch: [
        P([
          R(`${tenant.name || ''}  `, { s: 15 }),
          ...(signatures.tenant ? [makeStampRun(signatures.tenant, 50, -10)] : [R('(인)', { s: 15 })]),
        ], { sb: 0, sa: 0 }),
      ] }), C('주민등록번호', WS[3], { bg: BG, b: true, s: 14, mt: 's' }), C(tenant.ssn || '', WS[4], { mt: 's' })]),
      ROW([C('주소', WS[1], { bg: BG, b: true, s: 20, mt: 's' }), C(tenant.address || '', WS[2], { mt: 's' }), C('전화번호', WS[3], { bg: BG, b: true, s: 20, mt: 's' }), C(tenant.phone || '', WS[4], { mt: 's' })]),
    ], WS),
    P('', { sb: 80, sa: 80, ln: 40 }),

    // 공인중개사
    T([
      ROW([C('공인\n중개사', WS[0], { bg: BG, b: true, rs: 3, s: 14, mt: 's' }), C('소재지', WS[1], { bg: BG, b: true, s: 20, mt: 's' }), C(broker.office_address || '', WS[2] + WS[3] + WS[4], { cs: 3, mt: 's' })]),
      ROW([C('상호', WS[1], { bg: BG, b: true, s: 20, mt: 's' }), C(broker.office_name || '', WS[2], { mt: 's' }), C('허가번호', WS[3], { bg: BG, b: true, s: 20, mt: 's' }), C(broker.license_number || '', WS[4], { mt: 's' })]),
      ROW([C('대표', WS[1], { bg: BG, b: true, s: 20, mt: 's' }), C('', WS[2], { s: 20, mt: 's', ch: [
        P([
          R(`${broker.representative || broker.name || ''}  `, { s: 15 }),
          ...(signatures.broker ? [makeStampRun(signatures.broker, 50, -10)] : [R('(인)', { s: 15 })]),
        ], { sb: 0, sa: 0 }),
      ] }), C('전화번호', WS[3], { bg: BG, b: true, s: 20, mt: 's' }), C(broker.phone || '', WS[4], { s: 20, mt: 's' })]),
    ], WS),

    // ── 개인정보 동의 (압축) ──
    P('', { sb: 100, sa: 0, ln: 40 }),
    P([R('개인정보 제3자 제공 동의', { s: 16, b: true })], { a: AlignmentType.CENTER, sb: 8, sa: 6 }),
    B('「개인정보 보호법」 제17조에 따라, 성명·주소·전화번호를 국토교통부장관 및 시장·군수·구청장에게 등록임대주택 정보제공 목적으로 계약 종료일까지 제공합니다. 동의 거부 시 정보제공이 제한됩니다.', { s: 14, sb: 2, sa: 4 }),
    P([
      R(`이용자: ${tenant.name || ''}  `, { s: 15 }),
      ...(signatures.tenant ? [makeStampRun(signatures.tenant, 295, -10)] : [R('(서명 또는 날인)', { s: 15 })]),
    ], { a: AlignmentType.CENTER, sb: 4, sa: 8 }),

    // ── 전자인증 (압축) ──
    ...(signatures.tenant ? (() => {
      const tSig = signatures.tenant;
      const bSig = signatures.broker || {};
      const WE = [2400, 7800];
      return [
        P('', { sb: 80, sa: 0, ln: 40 }),
        P([R('[전자인증 증명]', { s: 18, b: true })], { sb: 5, sa: 3 }),
        B('본 계약은 「전자서명법」 제3조 및 「전자문서법」 제4조에 의거, 전자적 방식으로 체결되었으며 서면 계약과 동일한 법적 효력을 가진다.', { s: 14, c: GRAY, sb: 2, sa: 4 }),
        T([
          ROW([C('구분', WE[0], { bg: 'E8E8ED', b: true, s: 11 }), C('인증 내역', WE[1], { bg: 'E8E8ED', b: true, s: 11 })]),
          ROW([C('이용자', WE[0], { bg: BG, b: true, s: 11 }), C(`${tenant.name || '-'} | SMS인증 ${tSig.phone || '-'} | ${tSig.signedAt || '-'} | 코드: ${tSig.authCode || '-'}`, WE[1], { a: AlignmentType.LEFT, s: 11 })]),
          ROW([C('운영자', WE[0], { bg: BG, b: true, s: 11 }), C('하우스맨 (대표:박종호, 206-16-25497) | 전자인감 자동 적용', WE[1], { a: AlignmentType.LEFT, s: 11 })]),
          ROW([C('중개사', WE[0], { bg: BG, b: true, s: 11 }), C(`${broker.representative || broker.name || '-'} (${broker.office_name || '-'}) | SMS인증 ${bSig.phone || '-'} | ${bSig.verifiedAt || '-'}`, WE[1], { a: AlignmentType.LEFT, s: 11 })]),
        ], WE),
        B('절차: 중개사 SMS인증 → 이용자 본인확인 → 정보입력·신분증 → 고지사항·계약서 확인 → SMS 전자서명. 원본은 시스템에 보관, 감사 로그 기록.', { s: 20, c: GRAY, sb: 3, sa: 0 }),
      ];
    })() : []),
  );

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 15 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, right: 800, bottom: 480, left: 800 } } },
      children,
    }],
  } as any);

  return Packer.toBlob(doc);
}

/**
 * 표준임대차계약서 생성 (국토교통부 별지 제24호서식, 6페이지)
 */
export async function generateStandardContract(data: any): Promise<Blob> {
  const { building = {}, room = {}, contract = {}, tenant = {}, broker = {} } = data || {};

  // 데이터 추출
  const ownerName = building.owner_name || '';
  const ownerPhone = building.owner_phone || '';
  const ownerAddress = building.owner_home_address || '';
  const ownerRegNo = building.owner_business_registration_number || '';
  const ownerRentalRegNo = building.rental_business_registration_number || '';
  const address = building.address_road || '';
  const roomNo = room.room_number || contract.room || '';
  const tenantName = tenant.name || '';
  const tenantPhone = tenant.phone || '';
  const tenantAddress = tenant.address || '';
  const tenantSsn = tenant.ssn || '';
  const brokerOffice = broker.office_name || '';
  const brokerAddress = broker.office_address || '';
  const brokerLicense = broker.license_number || '';
  const brokerRep = broker.representative || broker.name || '';
  const brokerPhone = broker.phone || '';
  const deposit = contract.deposit || 0;
  const rent = contract.rent || 0;
  const moveIn = contract.move_in_date || '';
  const moveOut = contract.contract_end_date || '';
  const miParts = moveIn ? moveIn.split('-') : ['    ', '  ', '  '];
  const moParts = moveOut ? moveOut.split('-') : ['    ', '  ', '  '];
  const _contractType = contract.type || '단기';
  const _rawByType = _contractType === '일반임대' ? building.contract_special_terms_long_term
                   : _contractType === '근생'    ? building.contract_special_terms_commercial
                   : building.contract_special_terms_short_term;
  const specialTerms = Array.isArray(_rawByType)
    ? _rawByType.map((c: any) => c?.text || '').filter(Boolean).join('\n')
    : (_rawByType || '');
  const priorityRestrictions2 = _contractType === '단기' && Array.isArray(contract.contract_data?.priorityRestrictionsResolved)
    ? contract.contract_data.priorityRestrictionsResolved
    : [];

  // 페이지 공통 설정
  const pageProps = { page: { size: { width: 11906, height: 16838 }, margin: { top: 800, right: 900, bottom: 500, left: 900 } } };

  // 본문 스타일 (약간 작은 글씨)
  const s11 = 16;
  const s12 = 18;
  const s13 = 20;
  const s15 = 22;
  const s16 = 24;
  const s24 = 24;

  // ── 컬럼 폭 (표준계약서용) ──
  const W_LABEL = 2000;
  const W_VAL = 8200;
  const W2 = [2000, 8200];

  // PAGE 1
  const page1: any[] = [
    P([R('■ 민간임대주택에 관한 특별법 시행규칙 [별지 제24호서식] <개정 2025. 10. 31.>', { s: s12, c: GRAY })], { sb: 0, sa: 3 }),
    P([R('표준임대차계약서', { s: s24, b: true })], { a: AlignmentType.CENTER, sb: 10, sa: 3 }),
    P([R('(6쪽 중 1쪽)', { s: s12, c: GRAY })], { a: AlignmentType.CENTER, sb: 0, sa: 8 }),

    B(' 임대사업자와 임차인은 아래의 같이 임대차계약을 체결하고 이를 증명하기 위해 계약서 2통을 작성하여 임대사업자와 임차인이 각각 서명 또는 날인한 후 각각 1통씩 보관한다.', { s: s13, sb: 5, sa: 2 }),
    B('  ※ 개업공인중개사가 임대차계약서를 작성하는 경우에는 계약서 3통을 작성하여 임대사업자, 임차인, 개업공인중개사가 각각 서명 또는 날인한 후 각각 1통씩 보관한다.', { s: s11, c: GRAY, sb: 0, sa: 8 }),

    P([R(`계약일:      년      월      일`, { s: s15 })], { a: AlignmentType.CENTER, sb: 5, sa: 10 }),

    P([R(' 1. 계약 당사자', { s: s15, b: true })], { sb: 8, sa: 3 }),
    P([R(' 2. 공인중개사(개업공인중개사가 계약서를 작성하는 경우 해당)', { s: s15, b: true })], { sb: 3, sa: 5 }),

    // 임대사업자 테이블
    T([
      ROW([
        C('임대사업자', 1500, { bg: BG, b: true, rs: 4, s: s12 }),
        C('성명(법인명)', 1700, { bg: BG, b: true, s: s12 }),
        C(ownerName, 3500),
        C('(서명 또는 인)', 3500, { s: s12, c: GRAY }),
      ]),
      ROW([
        C('주소\n(대표 사무소 소재지)', 1700, { bg: BG, b: true, s: s11 }),
        C(ownerAddress, 7000, { cs: 2, a: AlignmentType.LEFT }),
      ]),
      ROW([
        C('주민등록번호\n(사업자등록번호)', 1700, { bg: BG, b: true, s: s11 }),
        C(ownerRegNo, 7000, { cs: 2, a: AlignmentType.LEFT }),
      ]),
      ROW([
        C('전화번호', 1700, { bg: BG, b: true, s: s12 }),
        C(ownerPhone, 3500),
        C('', 3500),
      ]),
    ], [1500, 1700, 3500, 3500]),
    P('', { sb: 2, sa: 2, ln: 50 }),

    // 임대사업자 등록번호
    T([
      ROW([
        C('임대사업자 등록번호', 3200, { bg: BG, b: true, s: s12 }),
        C(ownerRentalRegNo, 7000, { a: AlignmentType.LEFT }),
      ]),
    ], [3200, 7000]),
    P('', { sb: 3, sa: 3, ln: 50 }),

    // 임차인 테이블
    T([
      ROW([
        C('임차인', 1500, { bg: BG, b: true, rs: 3, s: s12 }),
        C('성명(법인명)', 1700, { bg: BG, b: true, s: s12 }),
        C(tenantName, 3500),
        C('(서명 또는 인)', 3500, { s: s12, c: GRAY }),
      ]),
      ROW([
        C('주소', 1700, { bg: BG, b: true, s: s12 }),
        C(tenantAddress, 7000, { cs: 2, a: AlignmentType.LEFT }),
      ]),
      ROW([
        C('주민등록번호', 1700, { bg: BG, b: true, s: s12 }),
        C(tenantSsn, 3500),
        C('', 3500),
      ]),
    ], [1500, 1700, 3500, 3500]),
    P('', { sb: 2, sa: 2, ln: 50 }),

    // 임차인 전화번호
    T([
      ROW([
        C('전화번호', 3200, { bg: BG, b: true, s: s12 }),
        C(tenantPhone, 7000, { a: AlignmentType.LEFT }),
      ]),
    ], [3200, 7000]),
    P('', { sb: 3, sa: 3, ln: 50 }),

    // 개업공인중개사 테이블
    T([
      ROW([
        C('개업공인\n중개사', 1500, { bg: BG, b: true, rs: 3, s: s11 }),
        C('사무소 명칭', 1700, { bg: BG, b: true, s: s11 }),
        C(brokerOffice, 3500),
        C('', 3500, { ch: [P([R('대표자 성명 ', { s: s11 }), R(brokerRep, { s: s13 }), R(' (서명 및 인)', { s: s11, c: GRAY })], { sb: 0, sa: 0, a: AlignmentType.CENTER })] }),
      ]),
      ROW([
        C('사무소 소재지', 1700, { bg: BG, b: true, s: s11 }),
        C(brokerAddress, 3500, { a: AlignmentType.LEFT }),
        C('', 3500, { ch: [P([R('등록번호 ', { s: s11 }), R(brokerLicense, { s: s13 })], { sb: 0, sa: 0, a: AlignmentType.CENTER })] }),
      ]),
      ROW([
        C('전화번호', 1700, { bg: BG, b: true, s: s12 }),
        C(brokerPhone, 3500),
        C('소속공인중개사 (서명 및 인)', 3500, { s: s11, c: GRAY }),
      ]),
    ], [1500, 1700, 3500, 3500]),
    P('', { sb: 8, sa: 3, ln: 50 }),

    // ◈ 해당 주택 안내
    P([R('◈ 해당 주택은 「민간임대주택에 관한 특별법」(이하 "법"이라 한다)에 따라 임대사업자가 시장ㆍ군수ㆍ구청장에게 등록한 민간임대주택으로서 다음과 같은 사항이 적용됩니다.', { s: s12, b: true })], { sb: 5, sa: 3 }),
    B(' ㅇ 임대의무기간 중 민간임대주택 양도 제한(법 제43조)', { s: s12, b: true, sb: 3, sa: 1 }),
    B('   - 임대사업자는 「민간임대주택에 관한 특별법 시행령」 제34조제1항에 따른 시점부터 법 제2조제4호 또는 제5호에 따른 기간 동안 해당 민간임대주택을 계속 임대해야 하며, 그 기간 동안에는 양도가 제한됩니다.', { s: s11, sb: 0, sa: 2 }),
    B(' ㅇ 임대료 증액 제한(법 제44조)', { s: s12, b: true, sb: 3, sa: 1 }),
    B('   - 임대사업자는 해당 민간임대주택에 대한 임대료의 증액을 청구하는 경우 임대료의 5퍼센트의 범위에서 주거비 물가지수, 인근 지역의 임대료 변동률, 임대주택 세대수 등을 고려하여 「민간임대주택에 관한 특별법 시행령」 제34조의2에 따른 증액비율을 초과하여 청구할 수 없습니다. 또한, 임대차계약 또는 임대료 증액이 있은 후 1년 이내에는 그 임대료를 증액할 수 없습니다.', { s: s11, sb: 0, sa: 2 }),
    B(' ㅇ 임대차계약의 해제ㆍ해지 등 제한(법 제45조)', { s: s12, b: true, sb: 3, sa: 1 }),
    B('   - 임대사업자는 임차인이 의무를 위반하거나 임대차를 계속하기 어려운 경우 등의 사유가 발생한 때를 제외하고는 임대사업자로 등록되어 있는 기간 동안 임대차계약을 해제 또는 해지하거나 재계약을 거절할 수 없습니다.', { s: s11, sb: 0, sa: 1 }),
    B('   - 임차인은 시장ㆍ군수ㆍ구청장이 임대주택에 거주하기 곤란한 정도의 중대한 하자가 있다고 인정하는 경우 등에 해당하면 임대의무기간 동안에도 임대차계약을 해제ㆍ해지할 수 있습니다.', { s: s11, sb: 0, sa: 2 }),

    FOOTER(),
  ];

  // PAGE 2
  const page2: any[] = [
    PB(),
    P([R('(6쪽 중 2쪽)', { s: s12, c: GRAY })], { a: AlignmentType.CENTER, sb: 0, sa: 8 }),

    P([R(' 3. 민간임대주택의 표시', { s: s15, b: true })], { sb: 8, sa: 5 }),

    T([
      ROW([C('주택 소재지', 2400, { bg: BG, b: true, s: s12 }), C(`${address} ${roomNo ? roomNo + '호' : ''}`, 7800, { a: AlignmentType.LEFT, s: s13 })]),
      ROW([C('주택 유형', 2400, { bg: BG, b: true, s: s12 }), C('', 7800, { ch: [P([
        R('아파트[ ] 연립주택[ ] 다세대주택[ ] 다가구주택[ ] 그 밖의 주택[ ]', { s: s12 }),
      ], { sb: 0, sa: 0, a: AlignmentType.LEFT })] })]),
    ], [2400, 7800]),

    T([
      ROW([
        C('민간임대주택\n면적(㎡)', 2400, { bg: BG, b: true, s: s11, rs: 2 }),
        C('주거전용면적', 1950, { bg: BG, s: s11 }),
        C('공용면적', 3900, { bg: BG, s: s11, cs: 2 }),
        C('합계', 1950, { bg: BG, s: s11 }),
      ]),
      ROW([
        C('', 1950),
        C('주거공용면적', 1950, { bg: BG, s: s11 }),
        C('그 밖의 공용면적', 1950, { bg: BG, s: s11 }),
        C('', 1950),
      ]),
    ], [2400, 1950, 1950, 1950, 1950]),

    T([
      ROW([
        C('민간임대주택의\n종류', 2400, { bg: BG, b: true, s: s11 }),
        C('', 7800, { ch: [P([
          R('공공지원[ ](□10년,□8년) / 장기일반[ ](□10년,□8년) / 단기[ ](□6년,□4년) / 그 밖의 유형', { s: s11 }),
        ], { sb: 0, sa: 0, a: AlignmentType.LEFT })] }),
      ]),
      ROW([
        C('건설 / 매입', 2400, { bg: BG, b: true, s: s12 }),
        C('건설[ ] / 매입[ ]', 7800, { s: s12, a: AlignmentType.LEFT }),
      ]),
      ROW([C('임대의무 기간\n개시일', 2400, { bg: BG, b: true, s: s11 }), C('', 7800)]),
      ROW([C('100세대 이상\n민간임대주택단지\n해당 여부', 2400, { bg: BG, b: true, s: s11 }), C('해당[ ] / 비해당[ ]', 7800, { s: s12, a: AlignmentType.LEFT })]),
      ROW([C('민간임대주택에 딸린\n부대시설ㆍ복리시설의\n종류', 2400, { bg: BG, b: true, s: s11 }), C('', 7800)]),
      ROW([C('선순위 담보권 등\n권리관계 설정 여부', 2400, { bg: BG, b: true, s: s11 }), C('', 7800)]),
      ROW([C('국세ㆍ지방세\n체납사실', 2400, { bg: BG, b: true, s: s11 }), C('', 7800)]),
      ROW([C('임대보증금 보증\n가입 여부', 2400, { bg: BG, b: true, s: s11 }), C('가입[ ] / 미가입[ ]', 7800, { s: s12, a: AlignmentType.LEFT })]),
    ], [2400, 7800]),

    P('', { sb: 3, sa: 1 }),
    B('※ 참고사항', { s: s11, b: true, sb: 3, sa: 1 }),
    B('  1. "주거전용면적"이란 주거의 용도로만 쓰이는 면적을 말하고, "주거공용면적"이란 복도, 계단, 현관 등 공동주택의 지상층에 있는 공용면적을 말하며, "그 밖의 공용면적"이란 주거공용면적을 제외한 지하, 관리사무소, 경비실 등의 공용면적을 말합니다.', { s: s11, c: GRAY, sb: 0, sa: 1 }),
    B('  2. "공공지원민간임대주택"이란 법 제2조제4호에 따른 공공지원민간임대주택을 말하고, "장기일반민간임대주택"이란 법 제2조제5호에 따른 장기일반민간임대주택을 말합니다.', { s: s11, c: GRAY, sb: 0, sa: 1 }),
    B('  3. "건설"이란 법 제2조제7호에 따라 민간임대주택을 건설하여 임대하는 것을 말하고, "매입"이란 법 제2조제8호에 따라 민간임대주택을 매매 등으로 취득하여 임대하는 것을 말합니다.', { s: s11, c: GRAY, sb: 0, sa: 1 }),
    B('  4. "선순위 담보권 등 권리관계"란 해당 주택에 설정된 저당권 등 담보물권이나 전세권을 말하며, 가압류, 가처분, 임차권등기명령에 따른 임차권등기 등을 포함합니다.', { s: s11, c: GRAY, sb: 0, sa: 1 }),
    B('  5. "국세ㆍ지방세 체납사실"이란 임대차계약일 현재 임대사업자에게 국세 또는 지방세 체납이 있는지를 말합니다.', { s: s11, c: GRAY, sb: 0, sa: 3 }),

    P([R(' 4. 계약조건', { s: s15, b: true })], { sb: 8, sa: 3 }),
    B('  제1조(임대보증금, 월임대료 및 임대차 계약기간) ① 임대사업자는 위 주택의 임대보증금, 월임대료(이하 "임대료"라 한다) 및 임대차 계약기간을 아래와 같이 정하여 임차인에게 임대한다.', { s: s12, sb: 3, sa: 3 }),

    T([
      ROW([C('임대보증금', 3400, { bg: BG, b: true, s: s12 }), C(`금 ${fmt(deposit)}원`, 6800, { a: AlignmentType.LEFT, s: s13 })]),
      ROW([C('월임대료', 3400, { bg: BG, b: true, s: s12 }), C(`금 ${fmt(rent)}원`, 6800, { a: AlignmentType.LEFT, s: s13 })]),
      ROW([C('임대차 계약기간', 3400, { bg: BG, b: true, s: s12 }), C(`${miParts[0]}년 ${miParts[1]}월 ${miParts[2]}일 부터  ${moParts[0]}년 ${moParts[1]}월 ${moParts[2]}일 까지`, 6800, { a: AlignmentType.LEFT, s: s13 })]),
    ], [3400, 6800]),

    B('    ② 임차인은 제1항의 임대보증금에 대하여 아래와 같이 임대사업자에게 지급하기로 한다.', { s: s12, sb: 5, sa: 3 }),

    T([
      ROW([C('계약금', 3400, { bg: BG, b: true, s: s12 }), C('', 6800, { a: AlignmentType.LEFT })]),
      ROW([C('중도금', 3400, { bg: BG, b: true, s: s12 }), C('', 6800, { a: AlignmentType.LEFT })]),
      ROW([C('잔금', 3400, { bg: BG, b: true, s: s12 }), C('', 6800, { a: AlignmentType.LEFT })]),
      ROW([C('계좌번호', 3400, { bg: BG, b: true, s: s12 }), C('', 6800, { a: AlignmentType.LEFT })]),
      ROW([C('은행', 3400, { bg: BG, b: true, s: s12 }), C('', 6800, { a: AlignmentType.LEFT })]),
      ROW([C('예금주', 3400, { bg: BG, b: true, s: s12 }), C('', 6800, { a: AlignmentType.LEFT })]),
    ], [3400, 6800]),

    FOOTER(),
  ];

  // PAGE 3
  const page3: any[] = [
    PB(),
    P([R('(6쪽 중 3쪽)', { s: s12, c: GRAY })], { a: AlignmentType.CENTER, sb: 0, sa: 5 }),

    B('    ③ 임차인은 제1항과 제2항에 따른 임대보증금을 이자 없이 임대사업자에게 예치한다.', { s: s12, sb: 3, sa: 2 }),
    B('    ④ 임차인은 제2항의 지급기한까지 임대보증금을 내지 않는 경우에는 연체이율(연    %)을 적용하여 계산한 연체료를 더하여 내야 한다. 이 경우 연체이율은 한국은행에서 발표하는 예금은행 주택담보대출의 가중평균금리에 「은행법」에 따른 은행으로서 가계자금 대출시장의 점유율이 최상위인 금융기관의 연체가산율을 합산한 이율을 고려하여 결정한다.', { s: s12, sb: 0, sa: 2 }),
    B('    ⑤ 임차인은 당월 분의 월임대료를 매달 말일까지 내야하며, 이를 내지 않을 경우에는 연체된 금액에 제4항에 따른 연체요율을 적용하여 계산한 연체료를 더하여 내야 한다.', { s: s12, sb: 0, sa: 5 }),

    B(`  제2조(민간임대주택의 입주일) 위 주택의 입주일은 ${miParts[0]}년 ${miParts[1]}월 ${miParts[2]}일부터 ${moParts[0]}년 ${moParts[1]}월 ${moParts[2]}일까지로 한다.`, { s: s12, sb: 5, sa: 5 }),

    B('  제3조(월임대료의 계산) ① 임대기간이 월의 첫날부터 시작되지 않거나 월의 말일에 끝나지 않는 경우에는 그 임대기간이 시작되거나 끝나는 월의 임대료는 일할로 산정한다.', { s: s12, sb: 3, sa: 2 }),
    B('    ② 입주 월의 월임대료는 입주일(제2조에 따른 입주일을 정한 경우 입주일)부터 계산한다. 다만, 입주지정기간이 지나 입주하는 경우에는 입주지정기간이 끝난 날부터 계산한다.', { s: s12, sb: 0, sa: 5 }),

    B('  제4조(관리비와 사용료) ① 임차인이 임대주택에 대한 관리비와 사용료를 임대사업자 또는 임대사업자가 지정한 관리주체에게 납부해야 하는 경우에는 특약으로 정하는 기한까지 내야하며, 이를 내지 않을 경우에는 임대사업자는 임차인으로 하여금 연체된 금액에 대해 제1조제4항에 따른 연체요율을 적용하여 계산한 연체료를 더하여 내게 할 수 있다.', { s: s12, sb: 3, sa: 2 }),
    B('    ② 임대사업자는 관리비와 사용료를 부과ㆍ징수할 때에는 관리비와 사용료의 부과 명세서를 첨부하여 임차인에게 이를 낼 것을 통지해야 한다. 이 경우 임대사업자는 일반관리비, 청소비, 경비비, 소독비, 승강기 유지비, 난방비, 급탕비, 수선유지비, 지능형 홈네트워크 설비 유지비 외의 어떠한 명목으로도 관리비를 부과ㆍ징수할 수 없다.', { s: s12, sb: 0, sa: 5 }),

    B('  제5조(임대 조건 등의 변경) 임대사업자는 임대주택에 대한 임대 조건을 변경하려는 경우에는 임대차 계약기간이 끝나기 6개월 전부터 2개월 전까지의 기간에 임차인에게 변경되는 임대 조건을 통지해야 하며, 이 기간에 통지하지 않으면 임대차 계약이 같은 조건으로 다시 체결된 것으로 봅니다.', { s: s12, sb: 3, sa: 5 }),

    B('  제6조(임차인의 금지행위) 임차인은 다음 각 호에 해당하는 행위를 하여서는 안 됩니다.', { s: s12, sb: 3, sa: 2 }),
    B('    1. 임대주택의 본래 용도가 아닌 용도로 사용하는 행위', { s: s12, sb: 0, sa: 1 }),
    B('    2. 임대주택을 개조하거나 변경하는 행위', { s: s12, sb: 0, sa: 1 }),
    B('    3. 임대주택을 전대(轉貸)하거나 임차권을 양도하는 행위', { s: s12, sb: 0, sa: 1 }),
    B('    4. 임대주택을 고의로 파손하거나 멸실하는 행위', { s: s12, sb: 0, sa: 5 }),

    B('  제7조(임차인의 의무) 임차인은 임대사업자의 동의 없이 임대주택에 대한 전대, 임차권의 양도 또는 담보 제공 등의 행위를 하여서는 아니 됩니다.', { s: s12, sb: 3, sa: 5 }),

    B('  제8조(민간임대주택 관리의 범위) 임대사업자는 임대주택의 공용 부분의 관리업무를 수행하고, 임차인은 전용 부분의 관리업무를 수행합니다.', { s: s12, sb: 3, sa: 5 }),

    B('  제9조(민간임대주택의 수선ㆍ유지 및 보수의 한계) ① 임대사업자는 임대주택의 사용에 필요한 수선을 하여야 합니다. 다만, 임차인의 고의나 과실로 인한 파손에 대하여는 임차인이 수선의무를 집니다.', { s: s12, sb: 3, sa: 2 }),

    FOOTER(),
  ];

  // PAGE 4
  const page4: any[] = [
    PB(),
    P([R('(6쪽 중 4쪽)', { s: s12, c: GRAY })], { a: AlignmentType.CENTER, sb: 0, sa: 5 }),

    B('    ② 임대사업자는 임차인이 임대주택의 수선을 요구하는 경우에는 지체 없이 수선하여야 합니다. 다만, 임차인의 고의나 과실로 인한 파손인 경우에는 그러하지 아니합니다.', { s: s12, sb: 3, sa: 2 }),
    B('    ③ 임차인은 임대주택에 부속된 물건이 파손 또는 멸실된 경우 지체 없이 임대사업자에게 그 사실을 통지하여야 합니다.', { s: s12, sb: 0, sa: 5 }),

    B('  제10조(임대차계약의 해제ㆍ해지 및 손해배상) ① 임대사업자는 다음 각 호의 어느 하나에 해당하는 경우에는 임대차계약을 해제ㆍ해지하거나 재계약을 거절할 수 있습니다.', { s: s12, sb: 5, sa: 2 }),
    B('    1. 임차인이 거짓이나 그 밖의 부정한 방법으로 민간임대주택을 임차한 경우', { s: s12, sb: 0, sa: 1 }),
    B('    2. 임차인이 법 제46조에 따른 의무를 위반한 경우', { s: s12, sb: 0, sa: 1 }),
    B('    3. 임차인이 임대료를 3개월 이상 연속하여 연체한 경우', { s: s12, sb: 0, sa: 1 }),
    B('    4. 임차인이 임대사업자의 동의 없이 임대주택의 전부 또는 일부를 전대(轉貸)한 경우', { s: s12, sb: 0, sa: 1 }),
    B('    5. 임차인이 임대주택을 고의로 파손 또는 멸실한 경우', { s: s12, sb: 0, sa: 1 }),
    B('    6. 임차인이 임대주택에서 「공동주택관리법」 제20조제1항을 위반한 행위, 폭행, 위협 등으로 공동생활의 질서를 문란하게 하는 경우', { s: s12, sb: 0, sa: 1 }),
    B('    7. 임대사업자와 임차인이 합의하여 임대차계약을 해제ㆍ해지하는 경우', { s: s12, sb: 0, sa: 1 }),
    B('    8. 그 밖에 임차인이 임대차계약을 위반한 경우', { s: s12, sb: 0, sa: 3 }),

    B('    ② 임차인은 다음 각 호의 어느 하나에 해당하는 경우에는 임대차계약을 해제ㆍ해지할 수 있습니다.', { s: s12, sb: 5, sa: 2 }),
    B('    1. 시장ㆍ군수ㆍ구청장이 임대주택에 거주하기 곤란한 정도의 중대한 하자가 있다고 인정하는 경우', { s: s12, sb: 0, sa: 1 }),
    B('    2. 임대사업자가 임차인의 의사에 반하여 임대 조건을 변경하는 경우', { s: s12, sb: 0, sa: 1 }),
    B('    3. 임대사업자가 법 또는 법에 따른 명령을 위반하여 임차인의 주거생활이 곤란하게 된 경우', { s: s12, sb: 0, sa: 1 }),
    B('    4. 임대사업자와 임차인이 합의하여 임대차계약을 해제ㆍ해지하는 경우', { s: s12, sb: 0, sa: 1 }),
    B('    5. 그 밖에 임대사업자가 임대차계약을 위반한 경우', { s: s12, sb: 0, sa: 3 }),

    B('    ③ 제1항 또는 제2항에 따라 임대차계약이 해제ㆍ해지되는 경우, 귀책사유가 있는 당사자는 그 상대방에게 손해를 배상하여야 합니다.', { s: s12, sb: 3, sa: 3 }),

    FOOTER(),
  ];

  // PAGE 5
  const page5: any[] = [
    PB(),
    P([R('(6쪽 중 5쪽)', { s: s12, c: GRAY })], { a: AlignmentType.CENTER, sb: 0, sa: 5 }),

    B('  제11조(임대보증금의 반환) ① 임대사업자는 임대차 계약이 끝나는 경우 임차인에게 임대보증금을 반환하여야 합니다.', { s: s12, sb: 5, sa: 2 }),
    B('    ② 임대사업자는 임차인이 임대료, 관리비 등을 체납한 경우에는 임대보증금에서 이를 공제하고 반환할 수 있습니다.', { s: s12, sb: 0, sa: 2 }),
    B('    ③ 임대사업자가 임차인에게 반환해야 할 임대보증금에서 제2항에 따른 체납액을 공제하려는 경우에는 반환 전에 임차인에게 공제 명세를 통지해야 합니다.', { s: s12, sb: 0, sa: 5 }),

    B('  제12조(임대보증금 보증) ① 임대사업자는 법 제49조에 따라 임대보증금에 대한 보증에 가입하여야 합니다. 다만, 같은 조 단서에 따른 경우에는 보증에 가입하지 않을 수 있습니다.', { s: s12, sb: 3, sa: 5 }),

    B('  제13조(민간임대주택의 양도) ① 임대사업자가 임대의무기간 중에 해당 민간임대주택을 양도하려는 경우에는 법 제43조에 따라 시장ㆍ군수ㆍ구청장에게 허가를 받아야 합니다.', { s: s12, sb: 3, sa: 2 }),
    B('    ② 제1항에 따라 민간임대주택이 양도된 경우, 양수인은 임대사업자의 지위를 승계합니다.', { s: s12, sb: 0, sa: 5 }),

    B('  제14조(임대사업자의 설명의무) ① 임대사업자는 임대차계약 체결 시 다음 각 호의 사항을 임차인에게 설명하여야 합니다.', { s: s12, sb: 3, sa: 2 }),
    B('    1. 임대 조건(임대보증금, 월임대료 등)', { s: s12, sb: 0, sa: 1 }),
    B('    2. 임대의무기간', { s: s12, sb: 0, sa: 1 }),
    B('    3. 임대료 증액 제한에 관한 사항', { s: s12, sb: 0, sa: 1 }),
    B('    4. 선순위 담보권 등 권리관계 설정 여부에 관한 사항', { s: s12, sb: 0, sa: 1 }),
    B('      가. 선순위 담보권의 종류 및 금액', { s: s12, sb: 0, sa: 1 }),
    B('      나. 선순위 전세권의 유무 및 금액', { s: s12, sb: 0, sa: 1 }),
    B('    5. 국세ㆍ지방세 체납사실에 관한 사항', { s: s12, sb: 0, sa: 1 }),
    B('    6. 임대보증금 보증 가입 여부에 관한 사항', { s: s12, sb: 0, sa: 3 }),
    B('    ② 제1항에 따른 설명은 서면으로 하여야 하며, 임차인은 설명 내용을 확인하고 서명 또는 날인하여야 합니다.', { s: s12, sb: 3, sa: 8 }),

    P('', { sb: 10, sa: 5 }),
    P([R('임차인은 제14조에 따른 설명을 충분히 듣고 이해하였음을 확인합니다.', { s: s13, b: true })], { a: AlignmentType.CENTER, sb: 10, sa: 10 }),
    P([
      R(`임차인:  ${tenantName}    `, { s: s16 }),
      R('(서명 또는 날인)', { s: s13, c: GRAY }),
    ], { a: AlignmentType.CENTER, sb: 10, sa: 10 }),

    FOOTER(),
  ];

  // PAGE 6
  const page6: any[] = [
    PB(),
    P([R('(6쪽 중 6쪽)', { s: s12, c: GRAY })], { a: AlignmentType.CENTER, sb: 0, sa: 5 }),

    B('  제15조(소송) 이 계약에 관하여 분쟁이 발생하는 경우에는 해당 임대주택의 소재지를 관할하는 법원에 소송을 제기합니다.', { s: s12, sb: 5, sa: 5 }),

    B('  제16조(중개대상물의 확인ㆍ설명) 개업공인중개사는 임대사업자와 임차인에게 「공인중개사법」 제25조제1항에 따라 중개대상물에 대하여 확인ㆍ설명하여야 합니다.', { s: s12, sb: 3, sa: 5 }),

    B('  제17조(특약)', { s: s12, b: true, sb: 3, sa: 3 }),
  ];

  if (priorityRestrictions2.length > 0) {
    priorityRestrictions2.forEach((r: any) => {
      const txt = r?.text ?? r?.label ?? '';
      if (txt) page6.push(B(`  ※ ${txt}`, { s: s12, b: true }));
    });
    page6.push(P('', { sb: 5, sa: 5 }));
  } else if (specialTerms) {
    specialTerms.split('\n').forEach((line: string) => {
      if (line.trim()) page6.push(B(line.trim(), { s: s12 }));
    });
  } else {
    page6.push(P('', { sb: 30, sa: 30 }));
  }

  page6.push(
    P('', { sb: 15, sa: 5 }),
    P([R(' 5. 개인정보의 제3자 제공 동의서', { s: s15, b: true })], { sb: 10, sa: 5 }),

    B('「개인정보 보호법」 제17조에 따라 등록임대주택에 관한 정보제공에 필요한 개인정보를 아래와 같이 임차인의 동의를 받아 제공합니다.', { s: s12, sb: 5, sa: 5 }),

    T([
      ROW([C('제공받는 자', W_LABEL, { bg: BG, b: true, s: s12 }), C('국토교통부장관, 시장ㆍ군수ㆍ구청장', W_VAL, { a: AlignmentType.LEFT, s: s12 })]),
      ROW([C('제공 목적', W_LABEL, { bg: BG, b: true, s: s12 }), C('등록임대주택에 관한 정보제공을 위한 우편물 발송, 문자 발송 등 지원 관련', W_VAL, { a: AlignmentType.LEFT, s: s12 })]),
      ROW([C('개인정보 항목', W_LABEL, { bg: BG, b: true, s: s12 }), C('성명, 주소, 전화번호', W_VAL, { a: AlignmentType.LEFT, s: s12 })]),
      ROW([C('보유 및 이용 기간', W_LABEL, { bg: BG, b: true, s: s12 }), C('임대차계약 종료일까지', W_VAL, { a: AlignmentType.LEFT, s: s12 })]),
    ], W2),

    P('', { sb: 5, sa: 3 }),
    B('  주택월세 소득공제 안내', { s: s12, b: true, sb: 5, sa: 2 }),
    B('  「조세특례제한법」 제95조의2에 따라 총급여액 7천만원 이하인 근로소득자(종합소득금액 6천만원 초과자 제외)로서 무주택 세대의 세대주(세대원 포함, 대통령령에서 정하는 경우)가 국민주택규모(전용면적 85㎡) 이하의 주택(주거용 오피스텔 포함)을 월세로 임차하기 위하여 지급하는 월세액(연 1,000만원 한도)의 17%(총급여액 5,500만원 이하인 경우 20%)에 해당하는 금액을 해당 과세연도의 종합소득산출세액에서 공제합니다.', { s: s11, c: GRAY, sb: 0, sa: 5 }),

    P('', { sb: 10, sa: 5 }),
    P([R('본인의 개인정보를 위와 같이 제3자에게 제공하는 것에 동의합니다.', { s: s13, b: true })], { a: AlignmentType.CENTER, sb: 8, sa: 8 }),
    P([
      R(`임차인:  ${tenantName}    `, { s: s16 }),
      R('(서명 또는 날인)', { s: s13, c: GRAY }),
    ], { a: AlignmentType.CENTER, sb: 8, sa: 5 }),

    P('', { sb: 5, sa: 3 }),
    B('※ 임차인은 개인정보 제공에 대한 동의를 거부할 수 있으며, 이 경우 임차인 권리, 등록임대주택에 관한 정보제공이 제한됩니다.', { s: s11, c: GRAY, sb: 3, sa: 0 }),

    FOOTER(),
  );

  const children: any[] = [
    ...page1,
    ...page2,
    ...page3,
    ...page4,
    ...page5,
    ...page6,
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 15 } } } },
    sections: [{
      properties: pageProps,
      children,
    }],
  } as any);
  return Packer.toBlob(doc);
}

/**
 * 임대보증금 보증 미가입 동의서 (단독)
 */
export async function generateDepositWaiver(data: any): Promise<Blob> {
  const { building = {}, tenant = {}, contract = {} } = data || {};
  const children: any[] = [
    P([R('임대보증금 보증 미가입에 대한 임차인 동의서', { s: 24, b: true })], { a: AlignmentType.CENTER, sb: 30, sa: 20 }),
    P([R('(보증금이 우선변제금 이하인 경우)', { s: 20, c: GRAY })], { a: AlignmentType.CENTER, sb: 0, sa: 20 }),

    T([
      ROW([C('임대인(운영자)', 2500, { bg: BG, b: true }), C(building.owner_name || '', 7700, { a: AlignmentType.LEFT })]),
      ROW([C('임차인(이용자)', 2500, { bg: BG, b: true }), C(tenant.name || '', 7700, { a: AlignmentType.LEFT })]),
      ROW([C('임대목적물', 2500, { bg: BG, b: true }), C(`${building.address_road || ''} ${building.building_name || ''} ${contract.room || ''}호`, 7700, { a: AlignmentType.LEFT })]),
      ROW([C('보증금', 2500, { bg: BG, b: true }), C(`금 ${fmt(contract.deposit)}원`, 7700, { a: AlignmentType.LEFT })]),
    ], [2500, 7700]),

    P('', { sb: 20, sa: 0 }),
    B('「민간임대주택에 관한 특별법」 제49조 및 같은 법 시행령 제41조에 따라, 임대보증금이 우선변제금(소액임차인 최우선변제금) 이하인 경우 임대보증금 보증 가입 의무가 면제됩니다.', { sb: 10, sa: 10 }),
    B('본인(임차인)은 위 임대차 계약의 보증금이 우선변제금 이하에 해당하여 임대보증금 보증에 가입하지 않는 것에 대해 충분한 설명을 듣고 이해하였으며, 이에 동의합니다.', { sb: 10, sa: 20 }),

    P([R(`20       년       월       일`, { s: 32, b: true })], { a: AlignmentType.CENTER, sb: 30, sa: 20 }),
    P('', { sb: 20, sa: 0 }),
    P([R(`임차인(이용자):  ${tenant.name || ''}                              (서명 또는 날인)`, { s: 18 })], { a: AlignmentType.CENTER, sb: 10, sa: 10 }),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 15 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 800, right: 900, bottom: 500, left: 900 } } },
      children,
    }],
  } as any);
  return Packer.toBlob(doc);
}

/**
 * 계약서 다운로드 헬퍼
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
