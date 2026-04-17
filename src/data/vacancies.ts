// 공실 데이터 — /vacancies 목록, [slug] 상세, 다른 페이지에서 공유
// 향후 WordPress 또는 Supabase 연동 시 이 파일의 데이터 부분만 교체

export interface Vacancy {
  slug: string;
  category: '단기' | '근생' | '주택';
  building: string;
  room: string;
  deposit: number;          // 만원
  rent: number;             // 만원
  area: string;
  fullAddress?: string;
  layout?: string;          // 원룸 / 원룸원거실 / 투룸 등
  areaSize?: string;        // 전용 평수
  floor?: string;
  facing?: string;          // 방향
  subway?: string;
  elevator?: boolean;
  parking?: string;
  option?: string;          // 풀옵션 / 기본 등
  highlight?: string;       // 한 줄 특이사항
  availableFrom?: string;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w가-힣-]/g, '');
}

const RAW: Omit<Vacancy, 'slug'>[] = [
  // 단기임대 9건
  { category: '단기', building: '다존하우스', room: '208호', deposit: 500, rent: 80, area: '역삼동',
    layout: '원룸', areaSize: '전용 6평', floor: '2층', subway: '역삼역 도보 5분',
    elevator: true, parking: '협의주차', option: '풀옵션',
    highlight: '조용한 블록, 출퇴근 편리', availableFrom: '즉시' },
  { category: '단기', building: '다존하우스', room: '309호', deposit: 500, rent: 85, area: '역삼동',
    layout: '원룸', areaSize: '전용 6.5평', floor: '3층', subway: '역삼역 도보 5분',
    elevator: true, parking: '협의주차', option: '풀옵션',
    highlight: '채광 좋은 남향', availableFrom: '즉시' },
  { category: '단기', building: '다존하우스', room: '605호', deposit: 500, rent: 95, area: '역삼동',
    layout: '원룸원거실', areaSize: '전용 7평', floor: '6층', subway: '역삼역 도보 5분',
    elevator: true, parking: '협의주차', option: '풀옵션',
    highlight: '고층 뷰, 분리형', availableFrom: '5/1' },
  { category: '단기', building: '모던라이프', room: '303호', deposit: 300, rent: 110, area: '강남',
    layout: '원룸원거실', areaSize: '전용 8평', floor: '3층', subway: '강남역 도보 8분',
    elevator: true, parking: '건물주 주차', option: '풀옵션',
    highlight: '역세권·신축급 인테리어', availableFrom: '즉시' },
  { category: '단기', building: '스타빌', room: '101호', deposit: 500, rent: 90, area: '논현동',
    layout: '투룸', areaSize: '전용 9평', floor: '1층', subway: '논현역 도보 7분',
    elevator: true, parking: '협의주차', option: '풀옵션',
    highlight: '테라스 딸린 1층', availableFrom: '즉시' },
  { category: '단기', building: 'W하우스', room: '603호', deposit: 500, rent: 120, area: '서초',
    layout: '원룸원거실', areaSize: '전용 8평', floor: '6층', subway: '서초역 도보 5분',
    elevator: true, parking: '협의주차', option: '풀옵션 프리미엄',
    highlight: '최고급 가전·인테리어', availableFrom: '즉시' },
  { category: '단기', building: '리트코하우스', room: '601호', deposit: 500, rent: 130, area: '역삼',
    layout: '투룸', areaSize: '전용 10평', floor: '6층', subway: '역삼역 도보 3분',
    elevator: true, parking: '건물주 주차', option: '풀옵션',
    highlight: '역 초근접·뷰 좋음', availableFrom: '즉시' },
  { category: '단기', building: '서우하우스', room: '401호', deposit: 500, rent: 100, area: '역삼',
    layout: '원룸원거실', areaSize: '전용 7평', floor: '4층', subway: '역삼역 도보 6분',
    elevator: true, parking: '협의주차', option: '풀옵션',
    highlight: '조용한 주거지', availableFrom: '즉시' },
  { category: '단기', building: '서우하우스', room: '402호', deposit: 500, rent: 100, area: '역삼',
    layout: '원룸원거실', areaSize: '전용 7평', floor: '4층', subway: '역삼역 도보 6분',
    elevator: true, parking: '협의주차', option: '풀옵션',
    highlight: '동일 라인 401호와 동일 컨셉', availableFrom: '즉시' },

  // 근생 12건
  { category: '근생', building: '에이스빌딩', room: 'B1층', deposit: 2000, rent: 150, area: '구로동',
    layout: '근생', areaSize: '30평', floor: 'B1', subway: '구로역 도보 5분',
    elevator: true, parking: '건물주 주차', highlight: '지하 카페·스튜디오 적합' },
  { category: '근생', building: '우영빌딩', room: '2층', deposit: 3000, rent: 250, area: '논현동',
    layout: '근생', areaSize: '40평', floor: '2층', subway: '논현역 도보 3분',
    elevator: true, parking: '협의주차', highlight: '사무실·학원 최적' },
  { category: '근생', building: '우영빌딩', room: '4층', deposit: 3000, rent: 250, area: '논현동',
    layout: '근생', areaSize: '40평', floor: '4층', subway: '논현역 도보 3분',
    elevator: true, parking: '협의주차', highlight: '채광 좋은 상층부' },
  { category: '근생', building: '문화빌딩', room: 'B1층', deposit: 2000, rent: 200, area: '도화동',
    layout: '근생', areaSize: '35평', floor: 'B1', subway: '마포역 도보 7분',
    elevator: true, parking: '협의주차', highlight: '바·레스토랑 적합' },
  { category: '근생', building: '문화빌딩', room: '2층', deposit: 2500, rent: 230, area: '도화동',
    layout: '근생', areaSize: '40평', floor: '2층', subway: '마포역 도보 7분',
    elevator: true, parking: '협의주차', highlight: '사무실·커뮤니티 공간' },
  { category: '근생', building: '어반그레이', room: 'B01', deposit: 2000, rent: 180, area: '논현동',
    layout: '근생', areaSize: '28평', floor: 'B1', subway: '논현역 도보 5분',
    elevator: true, parking: '협의주차', highlight: '감각적 지하 공간' },
  { category: '근생', building: '어반그레이', room: '1층', deposit: 5000, rent: 350, area: '논현동',
    layout: '근생', areaSize: '45평', floor: '1층', subway: '논현역 도보 5분',
    elevator: true, parking: '협의주차', highlight: '노출 좋은 1층 매장' },
  { category: '근생', building: '어반그레이', room: '2층', deposit: 3000, rent: 250, area: '논현동',
    layout: '근생', areaSize: '40평', floor: '2층', subway: '논현역 도보 5분',
    elevator: true, parking: '협의주차', highlight: '사무실 추천' },
  { category: '근생', building: '상건빌딩', room: '301호', deposit: 2000, rent: 160, area: '을지로6가',
    layout: '근생', areaSize: '35평', floor: '3층', subway: '동대문역사문화공원역 도보 5분',
    elevator: true, parking: '건물주 주차', highlight: '임대 공간 디자인 자유로움' },
  { category: '근생', building: '상건빌딩', room: '302호', deposit: 2000, rent: 160, area: '을지로6가',
    layout: '근생', areaSize: '35평', floor: '3층', subway: '동대문역사문화공원역 도보 5분',
    elevator: true, parking: '건물주 주차', highlight: '301호와 동일 스펙' },
  { category: '근생', building: '유석빌딩', room: '402호', deposit: 2500, rent: 200, area: '신당동',
    layout: '근생', areaSize: '38평', floor: '4층', subway: '신당역 도보 5분',
    elevator: true, parking: '협의주차', highlight: '상업·사무 복합' },
  { category: '근생', building: '미진빌딩', room: '5층', deposit: 3000, rent: 280, area: '을지로6가',
    layout: '근생', areaSize: '42평', floor: '5층', subway: '동대문역사문화공원역 도보 5분',
    elevator: true, parking: '건물주 주차', highlight: '최상층 전체 임대' },
];

export const vacancies: Vacancy[] = RAW.map((v) => ({
  ...v,
  slug: slug(`${v.building}-${v.room}`),
}));

export function getVacancyBySlug(s: string): Vacancy | undefined {
  return vacancies.find((v) => v.slug === s);
}

export function filterByCategory(cat: string): Vacancy[] {
  if (cat === '전체') return vacancies;
  return vacancies.filter((v) => v.category === cat);
}
