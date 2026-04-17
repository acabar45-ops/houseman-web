import { checkParkingStatus, PARKING_MODE, type ParkingStatus } from './parkingCapacity';

/**
 * 단기 계약 핵심 5가지 사전 안내
 * - 홈페이지 상세 모달 / 계약 진행 화면에서 동일하게 노출
 * - 계약서 본문에는 이미 들어 있는 항목들이며, 계약 전 미리 확인용
 */
export async function getCoreContractNotices(
  building: any,
  room?: any,
): Promise<Array<{ key: string; label: string; value: string }>> {
  const b = building || {};
  const buildingId = b.id ?? b._supabaseId ?? null;
  const totalSpaces = b.parking_total_spaces ?? b.parkingTotalSpaces ?? null;

  let parkingValue: string;
  try {
    const status = await checkParkingStatus(buildingId, totalSpaces);
    parkingValue = parkingLine(status);
  } catch (_e) {
    parkingValue = '주차 안내 — 현장 확인';
  }

  const maxOcc = room?.max_occupants ?? room?.maxOccupants ?? b.max_occupants ?? b.maxOccupants ?? 2;
  const residencyAllowed = b.is_resident_registration_allowed ?? b.isResidentRegistrationAllowed ?? false;

  return [
    { key: 'eligibility', label: '이용 자격', value: '만 50세 미만 / 내국인 / 개인 명의에 한함' },
    { key: 'parking',     label: '주차',       value: parkingValue },
    { key: 'residency',   label: '전입신고',   value: residencyAllowed ? '가능' : '불가 (단기 시설 이용)' },
    { key: 'utility',     label: '전기·가스', value: '개인 신청 불가 — 사용량에 따라 매월 청구' },
    { key: 'occupants',   label: '거주 인원',  value: `최대 ${maxOcc}인 — 초과 시 계약 위반` },
  ];
}

function parkingLine(status: ParkingStatus | null | undefined): string {
  if (!status) return '주차 안내 — 현장 확인';
  if (status.mode === PARKING_MODE.PROHIBITED) return '주차 불가 — 인근 공영주차장 이용';
  if (status.mode === PARKING_MODE.CAPPED && status.isFull) {
    return `주차 만차 (${status.current}/${status.max}) — 추가 주차 불가`;
  }
  if (status.mode === PARKING_MODE.CAPPED) {
    return `주차 가능 (총 ${status.max}대 한정, 현재 ${status.current}대)`;
  }
  return '선착순 주차 (등록 차량 1대)';
}
