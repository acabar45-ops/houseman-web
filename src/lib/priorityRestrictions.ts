/**
 * 건물 자유특약 카드 + 가상 항목을 합쳐서 Badge items 생성
 * - cards: [{text}] — 건물 단기 자유특약 (buildings.contract_special_terms_short_term)
 * - context.requiresBrokerTaxInvoice: 중개수수료 전자세금계산서 필수 플래그
 *
 * 원본: src/components/PriorityRestrictionsBadge.jsx 에서 추출
 */
export interface RestrictionItem {
  text: string;
  critical?: boolean;
  _priority?: number;
}

export function buildRestrictionItems(
  cards: any,
  context: { requiresBrokerTaxInvoice?: boolean } = {},
): RestrictionItem[] {
  const items: RestrictionItem[] = (Array.isArray(cards) ? cards : [])
    .filter((c: any) => c && c.text)
    .map((c: any) => ({ text: c.text, critical: !!c.critical }));

  if (context.requiresBrokerTaxInvoice) {
    items.push({
      text: '중개수수료 전자세금계산서 필수',
      critical: false,
      _priority: 1,
    });
  }

  return items;
}
