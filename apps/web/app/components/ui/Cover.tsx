import { useEffect, useRef, useState } from "react";
import type { CoverView } from "@aihot/contracts/site";

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A closed wobbly contour, the outline of one printed layer; deeper layers wobble more. */
function contour(cx: number, cy: number, r: number, wobble: number, phase: number): string {
  const points = Array.from({ length: 56 }, (_, i) => {
    const a = (i / 56) * Math.PI * 2;
    const k = r + wobble * (Math.sin(a * 3 + phase) + 0.6 * Math.sin(a * 5 - phase * 1.7));
    return `${(cx + k * 1.35 * Math.cos(a)).toFixed(1)},${(cy + k * Math.sin(a)).toFixed(1)}`;
  });
  return `M${points.join("L")}Z`;
}

/** Generated cover for a story without a usable photo: stacked layer outlines in evidence navy on cream, the same for the same story. */
export function CoverArt({ seed }: { seed: string }) {
  const h = hash(seed);
  const phase = (h % 628) / 100;
  const cx = 150 + ((h >> 8) % 60) - 30;
  const cy = 100 + ((h >> 16) % 30) - 15;
  return (
    <svg viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice" className="size-full" aria-hidden="true" style={{ background: "var(--surface)" }}>
      {Array.from({ length: 11 }, (_, i) => (
        <path key={i} d={contour(cx, cy, 10 + i * 11, 1.2 + i * 0.9, phase + i * 0.12)} fill="none" stroke="var(--ink)" strokeWidth={i === 10 ? 2 : 1.2} opacity={0.25 + i * 0.065} />
      ))}
    </svg>
  );
}

/**
 * A story's picture: the publisher's own photo with its credit line (a link to the original article), or
 * generated art when the article has no usable photo. Sized by the parent; the credit sits under the picture.
 */
export function Cover({ cover, seed, sizes, large = false, ratio = "aspect-[3/2]", className = "" }: {
  cover: CoverView | null;
  seed: string;
  sizes: string;
  large?: boolean;
  /** A Tailwind aspect-ratio class. */
  ratio?: string;
  className?: string;
}) {
  // A photo the publisher's site will not serve is replaced by the generated art, without its credit.
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // An image that failed before the page hydrated raised its error event with nobody listening.
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth === 0) setFailed(true);
  }, []);
  const photo = cover && !failed ? cover : null;
  return (
    <figure className={`min-w-0 ${className}`}>
      <div className={`${ratio} overflow-hidden rounded-card bg-bg-muted ring-1 ring-inset ring-line-soft`}>
        {photo ? (
          <img
            ref={img}
            src={photo.url}
            srcSet={large ? photo.largeSrcSet ?? undefined : photo.srcSet ?? undefined}
            sizes={sizes}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="size-full object-cover"
          />
        ) : (
          <CoverArt seed={seed} />
        )}
      </div>
      {photo && (
        <figcaption className="relative z-10 mt-1 line-clamp-2 break-words text-[11px] leading-4 text-ink-4">
          Image: <a href={photo.credit.url} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-ink">{photo.credit.source}</a>
        </figcaption>
      )}
    </figure>
  );
}
