import { useCallback, useState } from "react";

function bust(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}retry=1`;
}

export function retrySourceSet(srcSet: string | null | undefined): string | undefined {
  return srcSet?.split(",").map((candidate) => {
    const [url, ...descriptor] = candidate.trim().split(/\s+/);
    return [bust(url!), ...descriptor].join(" ");
  }).join(", ");
}

/** Give an image one cache-busted browser retry before its caller shows fallback UI. */
export function useImageRetry(src: string | null, srcSet?: string | null) {
  const [failure, setFailure] = useState<{ src: string; state: "retrying" | "failed" } | null>(null);
  const retrying = !!src && failure?.src === src && failure.state === "retrying";
  const failed = !!src && failure?.src === src && failure.state === "failed";
  const onError = useCallback(() => {
    if (src) setFailure((previous) => ({ src, state: previous?.src === src ? "failed" : "retrying" }));
  }, [src]);
  return {
    src: src && (retrying || failed) ? bust(src) : src,
    srcSet: retrying || failed ? retrySourceSet(srcSet) : srcSet ?? undefined,
    onError,
    failed,
  };
}
