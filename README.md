# houseman-web

하우스맨 공식 홈페이지 Astro 프로젝트. 2026-06 중순 런칭 예정.

## 스택
- **Astro 5.x** — 정적 사이트 생성
- **Tailwind CSS 3.x** — 하우스맨 네이비 팔레트
- **Headless WordPress** — 블로그 콘텐츠 (`cms.houseman.co.kr`)
- **Vercel** — 호스팅·배포 (hook 기반 재빌드)

## 디렉토리
```
houseman-web/
├─ src/
│  ├─ pages/           # 라우트
│  ├─ layouts/         # BaseLayout
│  ├─ components/      # Hero, StatsGrid, ServiceCardGrid, Footer 등
│  ├─ lib/             # wp.ts (WordPress API 클라이언트)
│  └─ styles/          # global.css
├─ public/             # llms.txt, robots.txt, 이미지
├─ astro.config.mjs
├─ tailwind.config.mjs
└─ package.json
```

## 로컬 개발

```bash
cd houseman-web
npm install
npm run dev       # http://localhost:4321
```

## 빌드
```bash
npm run build     # dist/ 생성
npm run preview   # 빌드 결과 미리보기
```

## Vercel 배포
1. https://vercel.com/ → New Project → Git repo 연결
2. Root Directory: `houseman-web`
3. Framework Preset: Astro (자동 감지)
4. Environment Variables:
   - `WP_BASE_URL=https://cms.houseman.co.kr/wp-json/wp/v2`
5. Deploy

처음 런칭 시 `new.houseman.co.kr` 하위 도메인으로 배포 → 6월 중순 `houseman.co.kr` 메인으로 승격.

## 팔레트 원칙 (중요)

`feedback_no_apple_copy.md` + `feedback_simple_clean_design.md` 원칙 엄수:
- 한 화면 1~2색만 (네이비 `#1E3A5F` + 회색)
- Apple iOS 색상 복사 금지
- 박스 안 박스 X, 위계는 타이포로
- 이모지 최소화

Tailwind에서는 `navy-700`, `ink`, `emphasis` 계열 클래스만 사용.

## JSON-LD / AEO

`src/layouts/BaseLayout.astro`에 Organization, LocalBusiness 스키마 기본 삽입됨.
Phase 3에서 Service, Product, FAQPage, Review 스키마 추가 예정.

`public/llms.txt`는 ChatGPT·Claude·Perplexity 인용을 위한 엔티티 명세.

## 남은 작업 (Phase 2 Week 4~5)

- [ ] LogoCarousel (레퍼런스 로고 5~6개)
- [ ] ComparisonTable (하우스맨 vs 직접 관리)
- [ ] CaseStudy 섹션 (18개월 공실 → 30일 만실 등)
- [ ] Testimonials (고객 후기 3~5개)
- [ ] PricingTable (SaaS 3단 + 대행 견적)
- [ ] RiskList (못 맡기면 터지는 5가지)
- [ ] FAQ 컴포넌트
- [ ] 5대 서비스 개별 페이지
- [ ] /vacancies 공실 실시간 목록
- [ ] /blog WordPress 연동
- [ ] 다크모드 토글 버튼
- [ ] SaaS 데모 영상 임베드
