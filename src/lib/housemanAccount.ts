/**
 * 하우스맨 계좌 해결 (Houseman Account Resolution)
 *
 * 단일 소스: app_settings.company_settings.houseman_bank_accounts[]
 *
 * 해결 순서 (fallback 체인):
 *   1. override (호출자가 명시적으로 전달)
 *   2. cached (한 번 조회 후 모듈 캐시)
 *   3. Supabase 직접 조회 (app_settings)
 *   4. LEGACY_HM_FALLBACK
 *
 * Astro 환경에서는 AppLayout이 없으므로 첫 호출 시 Supabase에서 직접 로드.
 */

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface HousemanAccount {
  bank: string;
  account: string;
  holder: string;
  alias?: string;
  status?: string;
  isPrimary?: boolean;
}

/** 레거시 fallback — 관리 리스트가 비어있거나 로딩 전일 때만 사용 */
export const LEGACY_HM_FALLBACK: Readonly<HousemanAccount> = Object.freeze({
  bank: '하나',
  account: '225-910048-15704',
  holder: '박종호(하우스맨)',
});

/**
 * CompanySettingsPage에 저장된 계좌 객체를 billingEngine 형식으로 정규화.
 * 입력:  { bank, account_number, holder, alias, status, isPrimary, note }
 * 출력:  { bank, account, holder, alias?, status?, isPrimary? }
 */
export function normalizeHousemanAccount(raw: any): HousemanAccount | null {
  if (!raw || typeof raw !== 'object') return null;
  const bank = raw.bank || '';
  const account = raw.account ?? raw.account_number ?? '';
  const holder = raw.holder || '';
  if (!bank && !account && !holder) return null;
  return {
    bank,
    account,
    holder,
    ...(raw.alias !== undefined && { alias: raw.alias }),
    ...(raw.status !== undefined && { status: raw.status }),
    ...(raw.isPrimary !== undefined && { isPrimary: raw.isPrimary }),
  };
}

/**
 * company_settings 객체에서 primary 계좌 1개 추출.
 * 우선순위: isPrimary === true → 첫 번째 active → 첫 번째 → null
 */
export function getPrimaryHousemanAccount(companySettings: any): HousemanAccount | null {
  const list = companySettings?.houseman_bank_accounts;
  if (!Array.isArray(list) || list.length === 0) return null;

  const primary = list.find((a: any) => a?.isPrimary === true);
  if (primary) return normalizeHousemanAccount(primary);

  const active = list.find((a: any) => a?.status === 'active');
  if (active) {
    console.warn('[housemanAccount] isPrimary 계좌가 없어 첫 active 계좌를 사용합니다.');
    return normalizeHousemanAccount(active);
  }

  console.warn('[housemanAccount] active 계좌가 없어 첫 계좌를 사용합니다.');
  return normalizeHousemanAccount(list[0]);
}

/**
 * 계좌 객체를 "은행명 계좌번호 예금주" 문자열로 포맷.
 */
export function formatHousemanAccount(acct: HousemanAccount | null | undefined): string {
  if (!acct) return '';
  const parts = [acct.bank, acct.account, acct.holder].filter(Boolean);
  return parts.join(' ');
}

/* ══════════════════════════════════════════════════════════════
   모듈-레벨 싱글톤 캐시 (Astro: React Island에서 한 번만 로드)
   ══════════════════════════════════════════════════════════════ */

let _cached: HousemanAccount | null = null;
let _loadingPromise: Promise<HousemanAccount> | null = null;

export function setCachedHousemanAccount(acct: HousemanAccount | null): void {
  _cached = acct || null;
}

export function getCachedHousemanAccount(): HousemanAccount | null {
  return _cached;
}

async function _loadFromSupabase(): Promise<HousemanAccount> {
  try {
    const { data } = await supabase.from('app_settings')
      .select('value')
      .eq('key', 'company_settings')
      .maybeSingle();
    const settings = (data as any)?.value ?? {};
    const primary = getPrimaryHousemanAccount(settings);
    _cached = primary ?? { ...LEGACY_HM_FALLBACK };
  } catch (e) {
    console.warn('[housemanAccount] load failed, using fallback:', e);
    _cached = { ...LEGACY_HM_FALLBACK };
  }
  return _cached!;
}

/**
 * 해결 체인: override → cached → Supabase → LEGACY_HM_FALLBACK
 * Astro 환경: 첫 호출 시 Supabase에서 직접 로드 후 캐시.
 */
export async function resolveHousemanAccount(override: HousemanAccount | null = null): Promise<HousemanAccount> {
  if (override) return override;
  if (_cached) return _cached;
  if (!_loadingPromise) {
    _loadingPromise = _loadFromSupabase();
  }
  return _loadingPromise;
}

/**
 * 동기 버전 — cached 또는 LEGACY fallback (기존 billingEngine 호환)
 * 주의: 첫 호출 전에는 LEGACY를 반환. async resolveHousemanAccount()를 먼저 한 번 호출할 것.
 */
export function resolveHousemanAccountSync(override: HousemanAccount | null = null): HousemanAccount {
  if (override) return override;
  if (_cached) return _cached;
  return { ...LEGACY_HM_FALLBACK };
}

/* ══════════════════════════════════════════════════════════════
   React 훅 (React Island 에서 사용)
   ══════════════════════════════════════════════════════════════ */

/**
 * 하우스맨 primary 계좌 훅.
 * 컴포넌트에서 사용: const primary = useHousemanAccount();
 */
export function useHousemanAccount(): HousemanAccount {
  const [primary, setPrimary] = useState<HousemanAccount>(() => _cached ?? { ...LEGACY_HM_FALLBACK });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const acct = await resolveHousemanAccount();
      if (!cancelled) setPrimary(acct);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setCachedHousemanAccount(primary);
  }, [primary.bank, primary.account, primary.holder]);

  return primary;
}
