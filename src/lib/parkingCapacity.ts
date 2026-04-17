import { supabase } from './supabase';

/**
 * 건물 주차 규칙 — DB buildings.parking_total_spaces 기준
 *
 * 규칙:
 * - NULL(미입력) → 선착순 주차 (상한 없음)
 * - 0            → 주차 불가
 * - N > 0        → 현재 차량 대수가 N 이상이면 만차, 그 미만이면 여유
 *
 * 현재 차량 대수 = tenants.car_number_1~5 NOT NULL 총합 (active/contracting)
 */

export const PARKING_MODE = {
  UNLIMITED: 'unlimited',    // NULL: 선착순
  PROHIBITED: 'prohibited',  // 0: 주차 불가
  CAPPED: 'capped',          // >0: 상한 있음
} as const;

export type ParkingMode = typeof PARKING_MODE[keyof typeof PARKING_MODE];

export interface ParkingStatus {
  mode: ParkingMode;
  max: number | null;
  current: number;
  isFull: boolean;
  statusText: string;
}

/**
 * 현재 주차중인 차량 대수 (유/무료 무관)
 */
export async function getCurrentParkingCount(buildingId: number | string): Promise<number> {
  const { data, error } = await supabase.from('tenants')
    .select('car_number_1, car_number_2, car_number_3, car_number_4, car_number_5')
    .eq('building_id', buildingId)
    .in('status', ['active', 'contracting']);
  if (error) { console.warn('[parking] query failed:', error); return 0; }
  let count = 0;
  for (const t of (data || [])) {
    for (let i = 1; i <= 5; i++) {
      const v = (t as any)[`car_number_${i}`];
      if (v && String(v).trim()) count++;
    }
  }
  return count;
}

/**
 * 주차 현황 조회
 */
export async function checkParkingStatus(buildingId: number | string | null, parkingTotalSpaces?: number | null): Promise<ParkingStatus> {
  let max: any = parkingTotalSpaces;
  if (max === undefined) {
    const { data } = await supabase.from('buildings')
      .select('parking_total_spaces').eq('id', buildingId).maybeSingle();
    max = (data as any)?.parking_total_spaces ?? null;
  }

  // NULL: 선착순
  if (max === null || max === undefined) {
    return { mode: PARKING_MODE.UNLIMITED, max: null, current: 0, isFull: false,
      statusText: '선착순 주차 — 등록 차량 1대 한정' };
  }
  // 0: 주차 불가
  if (Number(max) === 0) {
    return { mode: PARKING_MODE.PROHIBITED, max: 0, current: 0, isFull: true,
      statusText: '주차 불가 — 건물 내 주차장이 없습니다. 인근 공영주차장을 이용해주세요.' };
  }
  // 상한 있음: 현재 대수 조회
  const current = buildingId != null ? await getCurrentParkingCount(buildingId) : 0;
  const cap = Number(max);
  const isFull = current >= cap;
  return {
    mode: PARKING_MODE.CAPPED,
    max: cap,
    current,
    isFull,
    statusText: isFull
      ? `주차 만차 (${current}/${cap}) — 현재 만차 상태로 추가 주차가 불가합니다. 인근 공영주차장을 이용해주세요.`
      : `주차 가능 (${current}/${cap}) — 여유 ${cap - current}대`,
  };
}

/**
 * 상한만 조회 (동기, 건물 객체가 있을 때 사용)
 */
export function getParkingMode(parkingTotalSpaces: any): ParkingMode {
  if (parkingTotalSpaces === null || parkingTotalSpaces === undefined || parkingTotalSpaces === '') {
    return PARKING_MODE.UNLIMITED;
  }
  if (Number(parkingTotalSpaces) === 0) return PARKING_MODE.PROHIBITED;
  return PARKING_MODE.CAPPED;
}
