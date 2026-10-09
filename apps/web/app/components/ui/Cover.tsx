import { useEffect, useRef, useState } from "react";
import type { CoverView } from "@aihot/contracts/site";
import { SITE } from "@aihot/industry/site";
import { useImageRetry } from "./image-retry";

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Editorial tile for a story without a usable photo. Its colour and label stay stable for that story. */
export function CoverArt({ seed, label }: { seed: string; label: string }) {
  const h = hash(seed);
  const palette = ["#176b75", "#244d53", "#315c63", "#245c6a"];
  const background = palette[h % palette.length]!;
  return (
    <div className="relative flex size-full flex-col justify-between overflow-hidden p-[5cqw] text-white" style={{ background }} aria-label={`${SITE.name} story tile`}>
      <div className="absolute -right-[12cqw] -top-[16cqw] size-[48cqw] rounded-full border border-white/15" aria-hidden="true" />
      <div className="absolute -right-[7cqw] -top-[11cqw] size-[36cqw] rounded-full border border-white/10" aria-hidden="true" />
      <span className="relative text-[clamp(8px,2cqw,12px)] font-semibold uppercase tracking-[0.14em] text-white/75">AdditiveOS</span>
      <span className="relative line-clamp-2 max-w-[18em] text-[clamp(14px,5cqw,34px)] font-semibold leading-[1.15] tracking-[-0.025em]">{label || SITE.name}</span>
    </div>
  );
}

/**
 * A story's picture: the publisher's own photo with its credit line (a link to the original article), or
 * a branded tile when the article has no usable photo. Sized by the parent; the credit sits under the picture.
 */
export function Cover({ cover, seed, sizes, label = SITE.name, large = false, credit = true, ratio = "aspect-[3/2]", className = "" }: {
  cover: CoverView | null;
  seed: string;
  sizes: string;
  label?: string;
  large?: boolean;
  /** Show the credit line under the picture; small thumbnails may leave it to the article page. */
  credit?: boolean;
  /** A Tailwind aspect-ratio class. */
  ratio?: string;
  className?: string;
}) {
  // A photo the publisher's site will not serve is replaced by the generated art, without its credit.
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const retry = useImageRetry(cover?.url ?? null, large ? cover?.largeSrcSet : cover?.srcSet);
  // An image that failed before the page hydrated raised its error event with nobody listening.
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth === 0) {
      if (retry.failed) setFailed(true);
      else retry.onError();
    }
  }, [retry.failed, retry.onError]);
  const photo = cover && !failed && !retry.failed ? cover : null;
  return (
    <figure className={`min-w-0 ${className}`}>
      <div className={`${ratio} @container overflow-hidden rounded-card bg-bg-muted ring-1 ring-inset ring-line-soft`}>
        {photo ? (
          <img
            ref={img}
            src={retry.src ?? photo.url}
            srcSet={retry.srcSet}
            sizes={sizes}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => { if (retry.failed) setFailed(true); else retry.onError(); }}
            className="size-full object-cover"
          />
        ) : (
          <CoverArt seed={seed} label={label} />
        )}
      </div>
      {photo && credit && (
        <figcaption className="relative z-10 mt-1 line-clamp-2 break-words text-[11px] leading-4 text-ink-4">
          Image: <a href={photo.credit.url} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-ink">{photo.credit.source}</a>
        </figcaption>
      )}
    </figure>
  );
}
