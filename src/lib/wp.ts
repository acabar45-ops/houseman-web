// WordPress REST API 클라이언트 — Astro 빌드 타임에 호출
// cms.houseman.co.kr/wp-json/wp/v2 기준

const WP_BASE = import.meta.env.WP_BASE_URL || 'https://cms.houseman.co.kr/wp-json/wp/v2';

export interface WPPost {
  id: number;
  slug: string;
  date: string;
  modified: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  content: { rendered: string };
  categories: number[];
  tags: number[];
  featured_media: number;
  _embedded?: {
    'wp:featuredmedia'?: Array<{ source_url: string; alt_text: string }>;
    'wp:term'?: Array<Array<{ id: number; name: string; slug: string }>>;
  };
}

export interface WPCategory {
  id: number;
  name: string;
  slug: string;
  count: number;
}

/** 전체 포스트 가져오기 (blog 목록용) */
export async function fetchPosts(options: {
  perPage?: number;
  page?: number;
  categorySlug?: string;
} = {}): Promise<WPPost[]> {
  const { perPage = 20, page = 1, categorySlug } = options;
  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
    _embed: 'true',
  });

  if (categorySlug) {
    const cat = await fetchCategoryBySlug(categorySlug);
    if (cat) params.set('categories', String(cat.id));
  }

  const res = await fetch(`${WP_BASE}/posts?${params}`);
  if (!res.ok) {
    console.warn(`[wp] fetchPosts failed: ${res.status}`);
    return [];
  }
  return await res.json();
}

/** slug로 개별 포스트 가져오기 */
export async function fetchPostBySlug(slug: string): Promise<WPPost | null> {
  const res = await fetch(`${WP_BASE}/posts?slug=${encodeURIComponent(slug)}&_embed=true`);
  if (!res.ok) return null;
  const posts: WPPost[] = await res.json();
  return posts[0] ?? null;
}

/** 카테고리 slug 매칭 */
export async function fetchCategoryBySlug(slug: string): Promise<WPCategory | null> {
  const res = await fetch(`${WP_BASE}/categories?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  const cats: WPCategory[] = await res.json();
  return cats[0] ?? null;
}

/** 모든 카테고리 */
export async function fetchAllCategories(): Promise<WPCategory[]> {
  const res = await fetch(`${WP_BASE}/categories?per_page=100`);
  if (!res.ok) return [];
  return await res.json();
}
