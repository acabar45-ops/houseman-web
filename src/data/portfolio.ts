// 관리 중인 건물 포트폴리오 — 공개 동의 받은 후 실명·사진으로 교체
// 현재는 익명 처리된 placeholder (사장님이 동의 확보 → 이 파일 업데이트)

export interface Building {
  slug: string;
  name: string;           // 건물명 (익명이면 "A빌라" 형태)
  type: '주거' | '근생' | '사옥' | '복합';
  area: string;           // 지역
  rooms: number;          // 호실·층수
  since: string;          // 관리 시작 연도·월
  highlight: string;      // 한 줄 특징
  tags: string[];
  anonymous: boolean;
  featured?: boolean;     // 상단 강조
}

export const buildings: Building[] = [
  { slug: 'porsche-korea', name: '포르쉐 코리아 사옥', type: '사옥', area: '강남구 청담',
    rooms: 5, since: '2018-05', highlight: '시설·경비·미화 통합 위탁, 10년+ 파트너십',
    tags: ['대기업', '법정 점검', '에너지'], anonymous: false, featured: true },
  { slug: 'mohw-ebridge', name: '보건복지부 이브릿지', type: '사옥', area: '서울',
    rooms: 12, since: '2021-03', highlight: '공공기관 시설 관리 + 법정 이력 자동화',
    tags: ['공공', '법정', '관제'], anonymous: false, featured: true },
  // 아래는 익명 처리 — 실제 동의 확보 시 이름/사진 교체
  { slug: 'a-villa-yeoksam', name: 'A빌라 (역삼동)', type: '주거', area: '강남구 역삼',
    rooms: 24, since: '2019-08', highlight: '원룸·투룸 혼합, 단기임대 전환 수익 +40%',
    tags: ['단기임대', '전환사례'], anonymous: true },
  { slug: 'b-officetel-gangnam', name: 'B오피스텔 (강남역)', type: '주거', area: '강남구 역삼',
    rooms: 38, since: '2020-02', highlight: '미납 회수율 98% 유지', tags: ['대형'], anonymous: true },
  { slug: 'c-plaza-nonhyeon', name: 'C플라자 (논현동)', type: '근생', area: '강남구 논현',
    rooms: 6, since: '2017-11', highlight: '5개 층 전체 위탁, 임차사 만족도 높음',
    tags: ['근생', '장기파트너'], anonymous: true },
  { slug: 'd-officetel-seocho', name: 'D오피스텔 (서초역)', type: '주거', area: '서초구 서초',
    rooms: 28, since: '2021-07', highlight: '단기임대 특화 건물', tags: ['단기임대'], anonymous: true },
  { slug: 'e-complex-mapo', name: 'E복합빌딩 (마포)', type: '복합', area: '마포구 도화',
    rooms: 15, since: '2022-01', highlight: '주거 + 근생 혼합 건물 운영',
    tags: ['복합'], anonymous: true },
  { slug: 'f-villa-seongdong', name: 'F빌라 (성동)', type: '주거', area: '성동구',
    rooms: 18, since: '2020-10', highlight: '입주민 민원 24시간 대응 체계',
    tags: ['민원관리'], anonymous: true },
  { slug: 'g-building-sinchon', name: 'G빌딩 (신촌)', type: '근생', area: '서대문구 신촌',
    rooms: 8, since: '2019-04', highlight: '대학가 상권 특화', tags: ['상가'], anonymous: true },
  { slug: 'h-complex-jamsil', name: 'H빌딩 (잠실)', type: '복합', area: '송파구 잠실',
    rooms: 22, since: '2021-11', highlight: '고층 빌딩 엘리베이터·냉난방 통합 점검',
    tags: ['대형', '법정'], anonymous: true },
  { slug: 'i-villa-gwanak', name: 'I빌라 (관악)', type: '주거', area: '관악구 신림',
    rooms: 16, since: '2022-06', highlight: '수익률 극대화 단기임대 전환',
    tags: ['단기임대', '전환사례'], anonymous: true },
  { slug: 'j-apt-office', name: 'J오피스 (종로)', type: '사옥', area: '종로구',
    rooms: 1, since: '2020-03', highlight: '기업 사옥 유지관리 풀서비스',
    tags: ['사옥'], anonymous: true },
];

export function byType(type: Building['type']): Building[] {
  return buildings.filter((b) => b.type === type);
}

export function featured(): Building[] {
  return buildings.filter((b) => b.featured);
}
