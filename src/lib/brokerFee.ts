import { supabase } from './supabase';

/**
 * 중개수수료 계산 + 자동 출납 생성
 * 원본: src/lib/brokerFeeCalc.js + src/lib/brokerFeeAutoEntry.js (둘 합침)
 */

/* ══════════════════════════════════════════════════════════════
   brokerFeeCalc.js
   ══════════════════════════════════════════════════════════════ */

/**
 * 중개수수료 계산 헬퍼
 *
 * 단기: 호실의 standard_broker_fee(정수, 원)을 그대로 반환
 * 일반임대/근생: 환산보증금(보증금 + 월세×100) × rate ÷ 100 으로 자동 계산
 */
export function computeBrokerFee({
  roomType,
  standardBrokerFee,
  standardBrokerFeeRate,
  deposit,
  rent,
}: {
  roomType?: string;
  standardBrokerFee?: number | string;
  standardBrokerFeeRate?: number | string;
  deposit?: number | string;
  rent?: number | string;
}): number {
  const fixed = parseInt(String(standardBrokerFee ?? '').replace(/,/g, '')) || 0;

  if (roomType === '단기') {
    return fixed;
  }

  // 일반임대/근생: 정액 모드(standard_broker_fee에 값 있음)가 우선. 없으면 % 계산.
  if (fixed > 0) return fixed;

  const rate = parseFloat(String(standardBrokerFeeRate ?? '').replace(/[%\s,]/g, '')) || 0;
  if (rate <= 0) return 0;
  const dep = parseInt(String(deposit ?? '').replace(/,/g, '')) || 0;
  const rnt = parseInt(String(rent ?? '').replace(/,/g, '')) || 0;
  const base = dep + rnt * 100;
  return Math.round(base * rate / 100);
}

/* ══════════════════════════════════════════════════════════════
   brokerFeeAutoEntry.js
   ══════════════════════════════════════════════════════════════ */

/**
 * 감사 로그 기록 (원본 writeAuditLog 대체)
 * 원본은 src/lib/supabaseData.js 에 있음 — 간단히 인라인.
 */
async function writeAuditLog(
  table: string,
  recordId: any,
  action: string,
  metadata: any,
  changedBy?: string,
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      table_name: table,
      record_id: String(recordId),
      action,
      metadata,
      changed_by: changedBy || 'system',
    });
  } catch (e) {
    console.warn('[audit_logs] write failed:', e);
  }
}

/**
 * 중개수수료 자동 출납 생성 — 모든 조건 충족 시 cashbook_entries에 이체 대기 건 생성
 *
 * 조건:
 * - 계약 완료 (contracts.status = 'completed')
 * - 잔금 확인 (calendar_events.balance_confirmed = true)
 * - 세금계산서 (필수 건물만: tenants.broker_tax_invoice_status = 'verified' 또는 'waived')
 *
 * 호출 시점: 계약 완료 / 잔금 확인 / 세금계산서 검증 완료
 */
export async function checkAndCreateBrokerFeeEntry(contractId: any): Promise<any> {
  return _createBrokerFeeEntry(contractId, { mode: 'auto' });
}

/**
 * 관리자 강제 생성 — 세금계산서 검증 스킵 + 사유/감사 로그 기록
 */
export async function forceCreateBrokerFeeEntry(
  contractId: any,
  { waiveReason, changedBy }: { waiveReason: string; changedBy?: string },
): Promise<{ ok: boolean; error?: string; entry?: any }> {
  if (!waiveReason || waiveReason.trim().length < 10) {
    return { ok: false, error: '사유는 10자 이상 입력해야 합니다' };
  }
  const entry = await _createBrokerFeeEntry(contractId, { mode: 'force', waiveReason });
  if (!entry) return { ok: false, error: '출납 생성 실패 (이미 존재하거나 잔금 미확인)' };

  // tenants에 waived 플래그 저장 (UI에서 verified와 동치 처리)
  const { data: contract } = await supabase.from('contracts')
    .select('tenant_id')
    .eq('id', contractId)
    .maybeSingle();
  if ((contract as any)?.tenant_id) {
    await supabase.from('tenants')
      .update({
        broker_tax_invoice_status: 'waived',
        broker_tax_invoice_waive_reason: waiveReason,
      })
      .eq('id', (contract as any).tenant_id);
  }

  await writeAuditLog('contracts', contractId, 'force_complete_without_tax_invoice',
    { reason: waiveReason, cashbook_entry_id: entry.id }, changedBy);

  return { ok: true, entry };
}

async function _createBrokerFeeEntry(
  contractId: any,
  { mode, waiveReason }: { mode: 'auto' | 'force'; waiveReason?: string },
): Promise<any> {
  if (!contractId) return null;

  const { data: contract } = await supabase.from('contracts')
    .select('*')
    .eq('id', contractId)
    .maybeSingle();

  if (!contract || (contract as any).status !== 'completed') return null;

  const c: any = contract;
  const brokerFee = c.contract_data?.brokerFee || 0;
  if (brokerFee <= 0) return null;

  // 중복 방지
  const { data: existing } = await supabase.from('cashbook_entries')
    .select('id')
    .eq('tenant_id', c.tenant_id)
    .eq('account', '중개수수료')
    .limit(1);

  if ((existing as any[] | null)?.length ?? 0 > 0) return null;

  // 잔금 확인 체크 (force 모드도 잔금 미확인 시에는 생성 안 함 — 건물주한테 수수료 지급 근거 없음)
  if (c.calendar_event_id) {
    const { data: evt } = await supabase.from('calendar_events')
      .select('balance_confirmed')
      .eq('id', c.calendar_event_id)
      .maybeSingle();

    if (!(evt as any)?.balance_confirmed) return null;
  }

  // 세금계산서 체크 (auto 모드만, force는 스킵)
  const requiresTaxInvoice = c.contract_data?.requiresBrokerTaxInvoice || false;
  let taxInvoiceUrl: any = null;

  if (mode === 'auto' && requiresTaxInvoice && c.tenant_id) {
    const { data: tenant } = await supabase.from('tenants')
      .select('broker_tax_invoice_url, broker_tax_invoice_status')
      .eq('id', c.tenant_id)
      .maybeSingle();

    const t: any = tenant;
    const ok = t && (t.broker_tax_invoice_status === 'verified' || t.broker_tax_invoice_status === 'waived');
    if (!ok) return null;
    taxInvoiceUrl = t.broker_tax_invoice_url;
  }

  // 부동산 계좌
  let bank = '', accountNo = '', holder = '';
  if (c.broker_id) {
    const { data: broker } = await supabase.from('brokers')
      .select('fee_bank, fee_account, fee_holder, representative')
      .eq('id', c.broker_id)
      .maybeSingle();

    const b: any = broker;
    if (b) {
      bank = b.fee_bank || '';
      accountNo = b.fee_account || '';
      holder = b.fee_holder || b.representative || '';
    }
  }

  const comment = mode === 'force'
    ? `[강제완료/세금계산서 미제출] ${waiveReason} (${c.room_number}호)`
    : `전자계약 자동 생성 (${c.room_number}호)`;

  const { data: entry, error } = await supabase.from('cashbook_entries').insert({
    entry_type: 'building',
    account: '중개수수료',
    building_id: c.building_id,
    building_name: c.building_name,
    room_id: c.room_id,
    room_number: c.room_number,
    tenant_id: c.tenant_id,
    tenant_name: c.tenant_name,
    bank,
    account_no: accountNo,
    holder,
    amount: brokerFee,
    status: 'waiting',
    tax_invoice_url: taxInvoiceUrl,
    comment,
    writer: mode === 'force' ? '관리자(강제)' : '시스템',
  }).select('id').single();

  if (error) {
    console.error('[brokerFeeAutoEntry] 출납 생성 실패:', error);
    return null;
  }

  console.log(`[brokerFeeAutoEntry] 중개수수료 이체 대기 생성 (cashbook_entries.id=${(entry as any).id}, mode=${mode})`);
  return entry;
}
