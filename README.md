# houseman-web

하우스맨 공식 홈페이지 Astro 프로젝트. **2026-06 중순 런칭 예정**.

**Repo:** https://github.com/acabar45-ops/houseman-web
**프로덕션 URL (예정):** https://houseman.co.kr
**스테이징 URL:** (Vercel 배포 후 업데이트)

---

## 📊 현 상태 (2026-04-17)

| 항목 | 값 |
|---|---|
| 페이지 수 | **17** |
| 컴포넌트 수 | 14 |
| 빌드 시간 | ~1.7초 |
| Astro check | **0 errors, 0 warnings** |
| 스택 | Astro 5.18 · Tailwind 3.4 · TypeScript |

### 페이지 목록
```
/                         메인 (16 섹션)
/about                    회사소개
/saas                     SaaS + UI 목업
/pricing                  요금제 3단 + 대행
/cases                    풀 케이스 스터디 3건
/contact                  3채널 문의
/privacy                  개인정보처리방침
/terms                    이용약관
/vacancies                공실 21건
/blog                     블로그 목록
/blog/[slug]              블로그 상세 (WP REST API 연동)
/services/buildings       중소형 빌딩
/services/housing         중소형 주택
/services/short-term      단기임대 ★ 1차 배포 핵심
/services/corporate       기업 시설
/services/non-resident    비상주 관리사무소
/404                      커스텀 에러 페이지
```

---

## 🚀 로컬 개발

```bash
npm install         # 최초 1회
npm run dev         # http://localhost:4321
```

**타입 검증:**
```bash
npx astro check
```

**프로덕션 빌드:**
```bash
npm run build       # dist/ 폴더 생성
npm run preview     # 빌드 결과 미리보기
```

---

## 📁 디렉토리 구조

```
houseman-web/
├─ public/
│  ├─ favicon.svg                # 네이비 배경 H 로고
│  ├─ og-default.svg             # 1200×630 OG 이미지
│  ├─ robots.txt
│  ├─ llms.txt                   # AEO (ChatGPT·Claude 인용용)
│  └─ logos/                     # 레퍼런스 로고 (추가 예정)
│
├─ src/
│  ├─ pages/                     # 라우트 (위 목록)
│  ├─ layouts/
│  │  └─ BaseLayout.astro        # JSON-LD + 메타 + 다크모드 스크립트
│  ├─ components/
│  │  ├─ Nav.astro                 # 상단 네비 + 모바일 햄버거 + 다크 토글
│  │  ├─ Hero.astro                # 히어로 + 알림톡 플로팅
│  │  ├─ LogoCarousel.astro        # 레퍼런스 로고 무한 슬라이드
│  │  ├─ StatsGrid.astro           # 숫자 카운트업 4종
│  │  ├─ ServiceCardGrid.astro     # 주거용/상업용 2카드
│  │  ├─ PainPoint.astro           # 4박자 공감 훅
│  │  ├─ NavigationMetaphor.astro  # 킬러 메타포 섹션
│  │  ├─ AutomationProcess.astro   # 4단계 자동화
│  │  ├─ ComparisonTable.astro     # 하우스맨 vs 직접관리
│  │  ├─ CaseStudies.astro         # 사례 3개 미리보기
│  │  ├─ Testimonials.astro        # 고객 후기
│  │  ├─ PricingPlans.astro        # SaaS 3단
│  │  ├─ RiskList.astro            # 못 맡기면 터지는 5가지
│  │  ├─ FAQ.astro                 # FAQ 7개 + JSON-LD
│  │  ├─ FinalCTA.astro            # 최종 CTA 밴드
│  │  ├─ SaasUIMockup.astro        # SaaS 대시보드 목업
│  │  └─ Footer.astro              # 푸터 + SNS 아이콘
│  ├─ lib/
│  │  └─ wp.ts                   # WordPress REST API 클라이언트
│  ├─ styles/
│  │  └─ global.css              # Tailwind + 스크롤 페이드인
│  └─ assets/
│     └─ README.md               # 이미지 자산 가이드
│
├─ astro.config.mjs              # Astro + Tailwind + MDX + Sitemap
├─ tailwind.config.mjs           # 하우스맨 네이비 팔레트
├─ tsconfig.json                 # strict 모드
├─ vercel.json                   # 301 리다이렉트 (기존 PHP URL)
├─ package.json
└─ README.md                     # (이 파일)
```

---

## 🎨 디자인 원칙 (엄수)

- **한 화면 1~2색만** (네이비 `#1E3A5F` + 회색 베이스)
- Apple iOS 시스템 컬러 복사 금지 (→ `memory/feedback_no_apple_copy.md`)
- **박스 안 박스 X** — 영역 구분은 얇은 회색 구분선 + 여백
- **위계는 타이포로** (색 아닌 글자 크기·굵기)
- **이모지 최소화** — 라벨로 충분하면 이모지 X

### Tailwind 클래스 규칙
- 네이비: `navy-700` (메인), `navy-900` (대비 진한)
- 강조 (페이지당 1곳): `emphasis` (#DC2626)
- 회색: `ink`(검정), `ink-muted`, `ink-label`, `ink-line`, `ink-soft`
- 다크모드: `dk-bg`, `dk-card`, `dk-text`, `dk-accent`, `dk-line`

---

## 🔌 Headless WordPress 연동

- 예상 엔드포인트: `https://cms.houseman.co.kr/wp-json/wp/v2`
- WP가 아직 세팅 안 된 경우 → `fetchPosts()`가 빈 배열 반환, `/blog`는 placeholder 5건 표시
- WP 세팅 후 Astro 재빌드만 하면 실제 글 자동 반영

### WordPress REST API 헬퍼 (`src/lib/wp.ts`)
- `fetchPosts({ perPage, page, categorySlug })` — 목록
- `fetchPostBySlug(slug)` — 개별 글
- `fetchAllCategories()` — 카테고리

---

## 🚢 Vercel 배포

1. https://vercel.com/ → GitHub SSO 가입
2. "Add New Project" → `houseman-web` 선택
3. Framework Preset: Astro (자동 감지)
4. Deploy
5. 환경변수 (나중):
   - `WP_BASE_URL`: https://cms.houseman.co.kr/wp-json/wp/v2 (WP 세팅 후)

### 자동 배포
```
git push origin main
  → Vercel 자동 감지
  → 빌드 (~30초)
  → 프로덕션 반영 (~1분)
```

---

## 🔍 SEO / AEO

### 기본 (완료)
- ✅ JSON-LD: `Organization`, `LocalBusiness`, `FAQPage`
- ✅ Open Graph + Twitter Card
- ✅ sitemap-index.xml 자동 생성
- ✅ robots.txt
- ✅ `public/llms.txt` (LLM 인용용 엔티티 명세)
- ✅ Google + Naver site verification 메타 태그 (값은 Phase 3에 채움)

### 미완 (Phase 3)
- [ ] Google Search Console 연동
- [ ] Naver Search Advisor 등록
- [ ] 페이지별 고유 description 다듬기
- [ ] 블로그 글별 Article 스키마

---

## ✅ 런칭 전 체크리스트 (2026-06-15 기준)

- [ ] 실제 레퍼런스 로고 5~6개 → `public/logos/`
- [ ] SaaS 실사용 스크린샷 → `SaasUIMockup.astro` 교체
- [ ] 1분 데모 영상 → `AutomationProcess.astro` 근처 임베드
- [ ] 블로그 20편+ 축적 (WP 세팅 후)
- [ ] 커스텀 도메인 `houseman.co.kr` 연결
- [ ] 기존 PHP URL 301 리다이렉트 검증
- [ ] Google·Naver search console 사이트맵 제출
- [ ] Lighthouse 90+ (Performance, Accessibility, SEO)

---

## 📝 참고 문서

- **`../numbers.md`** — 홈페이지용 확정 숫자
- **`../copy-update-request.md`** — 현 PHP 사이트 응급 수정 요청서
- **`../email-setup/`** — Cloudflare·Google Workspace·SaaS 연동 가이드
- **`~/.claude/plans/wild-sprouting-planet.md`** — 2026-06-15 런칭 전체 로드맵
- **`memory/competitor_*.md`** — 경쟁사 7개 분석

---

## 📞 문의

- 프로젝트 대표: 박종호 · `contact@houseman.co.kr` · 1544-4150
- 기술 지원: Claude Code (로컬 AI) + Anthropic API (블로그 자동 발행)
