# 이미지 자산 가이드

이 폴더는 **Astro `<Image />` 컴포넌트가 자동 최적화하는 이미지**를 둘 곳입니다.

## `public/` 과의 차이

| 위치 | 용도 | 최적화 | 예시 |
|---|---|---|---|
| `src/assets/` | 페이지·컴포넌트에서 import하는 이미지 | ✅ 자동 WebP 변환·리사이즈 | 히어로 배경·스크린샷 |
| `public/` | 절대 경로로 참조 (그대로 배포) | ❌ 원본 그대로 | favicon.svg, og-default.svg, robots.txt, logos/ |

## Astro Image 사용법

```astro
---
import { Image } from 'astro:assets';
import heroShot from '../assets/hero-dashboard.png';
---

<Image
  src={heroShot}
  alt="하우스맨 대시보드 화면"
  width={1200}
  height={700}
  loading="lazy"
/>
```

자동으로:
- WebP + AVIF 변환
- `srcset` 생성 (1x / 2x 해상도)
- lazy loading
- 올바른 dimensions로 CLS 방지

## 권장 폴더 구조 (이미지 받으면)

```
src/assets/
├─ hero/                   # 히어로 배경·일러스트
├─ screenshots/            # SaaS 실제 화면 (UI 목업 교체용)
│  ├─ dashboard.png
│  ├─ billing-list.png
│  ├─ collection.png
│  └─ settlement-pdf.png
├─ cases/                  # 케이스 스터디 현장 사진
│  ├─ gw-6f-gangnam.jpg
│  ├─ lt-2y-overdue.jpg
│  └─ porsche-sago.jpg
├─ team/                   # 팀 사진 (선택)
└─ buildings/              # 관리 건물 사진 (공개 동의받은 것만)
```

## 이미지 수집 체크리스트

### SaaS 스크린샷 (Phase 2 Week 6)
- [ ] 대시보드 메인 (가명 데이터, 전체 화면)
- [ ] 청구 생성 플로우 (3~4 스텝)
- [ ] 알림톡 발송 UI + 프로그레스바
- [ ] 수금 확인 (미납/납부완료 필터)
- [ ] 정산 리포트 PDF 미리보기
- **캡처 도구:** OBS Studio · Windows 스니핑 도구 · Mac ⌘+Shift+4
- **해상도:** 최소 1440×900, 고해상도 디스플레이는 2880×1800
- **포맷:** PNG (클릭한 흔적 주의 → 가명 마스킹)

### 케이스 스터디 사진 (있으면)
- [ ] 실제 관리 건물 외관 (건물주 동의 후)
- [ ] 유지보수 현장 (익명 처리)
- [ ] 리모델링 전/후 비교

### 레퍼런스 로고 (별도 `public/logos/` 폴더)
- [ ] 포르쉐 코리아 (SVG 또는 500px+ PNG)
- [ ] 보건복지부 이브릿지
- [ ] 추가 3~4개
- **주의:** `public/logos/`에 두면 최적화 없이 원본 그대로 배포됨 (SVG는 이게 정상)

## 이미지 추가하면 저(Claude)에게 알려주세요

예: "`cases/gw-6f.jpg` 넣었어. `/cases` 페이지 첫 케이스에 적용해줘"
→ `src/pages/cases.astro`에 `<Image>` 추가 + 반응형 스타일 적용

## 최적화 기본 설정

`astro.config.mjs`에 추가할 수 있음 (필요 시):

```js
export default defineConfig({
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
  },
});
```

Sharp는 이미 Astro에 내장되어 별도 설치 불필요.
