import { useEffect, useState } from 'react';

interface Props {
  images: string[];
  alt?: string;
}

/**
 * 공실 상세 이미지 갤러리 — React Island (client:load)
 * - 이전/다음 버튼, 썸네일 리스트
 * - 키보드 화살표 지원
 * - 이미지 없으면 placeholder
 */
export function VacancyGallery({ images, alt = '' }: Props) {
  const [idx, setIdx] = useState(0);
  const count = images?.length ?? 0;

  // 키보드 화살표
  useEffect(() => {
    if (count <= 1) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setIdx((p) => (p > 0 ? p - 1 : count - 1));
      else if (e.key === 'ArrowRight') setIdx((p) => (p < count - 1 ? p + 1 : 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [count]);

  if (!count) {
    return (
      <div className="aspect-[16/9] w-full bg-ink-soft flex flex-col items-center justify-center text-ink-label rounded-card-lg">
        <div className="text-5xl mb-3">🏢</div>
        <div className="text-sm">사진 준비중</div>
      </div>
    );
  }

  const prev = () => setIdx((p) => (p > 0 ? p - 1 : count - 1));
  const next = () => setIdx((p) => (p < count - 1 ? p + 1 : 0));

  return (
    <div>
      {/* 메인 이미지 */}
      <div className="relative aspect-[16/9] w-full bg-ink-soft overflow-hidden rounded-card-lg">
        <img
          src={images[idx]}
          alt={alt}
          className="w-full h-full object-contain"
        />
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="이전 사진"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 hover:bg-white text-ink text-xl flex items-center justify-center shadow-card transition"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="다음 사진"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 hover:bg-white text-ink text-xl flex items-center justify-center shadow-card transition"
            >
              ›
            </button>
            <div className="absolute bottom-3 right-3 text-xs font-semibold px-3 py-1 rounded-full bg-black/60 text-white">
              {idx + 1} / {count}
            </div>
          </>
        )}
      </div>

      {/* 썸네일 */}
      {count > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((p, pi) => (
            <button
              key={pi}
              type="button"
              onClick={() => setIdx(pi)}
              aria-label={`사진 ${pi + 1}번 보기`}
              className={`w-16 h-12 flex-shrink-0 overflow-hidden rounded border-2 transition ${
                pi === idx ? 'border-navy-700 opacity-100' : 'border-transparent opacity-50 hover:opacity-80'
              }`}
            >
              <img src={p} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default VacancyGallery;
