// 블로그 RSS 2.0 피드 — WP 연동 전까지는 placeholder 5건
import type { APIRoute } from 'astro';

const SITE = 'https://houseman.co.kr';

const placeholderItems = [
  { title: '임대료 미납 대응 5단계', slug: 'coming-soon-1', pubDate: '2026-06-16',
    description: '미납 초기 대응이 왜 중요한지, 어떤 순서로 처리하면 분쟁 없이 회수 가능한지.' },
  { title: '강남 단기임대 수익률 계산법 (2026)', slug: 'coming-soon-2', pubDate: '2026-06-17',
    description: '장기 월세 대비 단기임대로 전환 시 실제 수익이 얼마나 달라지는지.' },
  { title: '근생 건물 관리비 누수 막는 3가지', slug: 'coming-soon-3', pubDate: '2026-06-18',
    description: '관리비가 매년 오르는 이유와 놓치기 쉬운 3곳.' },
  { title: '18개월 공실 건물 30일 만실', slug: 'coming-soon-4', pubDate: '2026-06-19',
    description: '역삼 6층 상가 빌딩 실제 케이스.' },
  { title: '알림톡 자동 발송 설정 5분', slug: 'coming-soon-5', pubDate: '2026-06-20',
    description: '하우스맨 SaaS에서 알림톡 5종 세팅하는 방법.' },
];

export const GET: APIRoute = () => {
  const items = placeholderItems
    .map(
      (p) => `
    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${SITE}/blog/${p.slug}</link>
      <guid>${SITE}/blog/${p.slug}</guid>
      <pubDate>${new Date(p.pubDate).toUTCString()}</pubDate>
      <description><![CDATA[${p.description}]]></description>
    </item>`,
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>하우스맨 블로그</title>
    <link>${SITE}/blog</link>
    <description>건물주를 위한 실무 가이드 — 미납·공실·세무·단기임대</description>
    <language>ko-KR</language>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
