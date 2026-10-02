import { SITE, withSubject } from "@aihot/industry/site";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Presence } from "../components/ui/Presence";
import { pageMeta } from "../lib/seo";
import { KEYS } from "../lib/local-state";
import { IconCheck, IconClose, IconImage } from "../components/icons";
import { RingMark } from "../components/Logo";
import { AsideCard, ReadingLayout } from "../components/ui/Page";

/** Shared caches may keep this page for five minutes. */
export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

export function meta() {
  return pageMeta({ title: "Feedback", description: `Report reader problems or request source corrections and removal from ${SITE.name}.`, path: "/feedback", image: "/og/pages/feedback.png", noindex: true });
}

interface Draft {
  content: string;
  email: string;
  pageUrl: string;
}

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEYS.feedbackDraft);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return typeof d === "object" && d ? { content: String(d.content ?? ""), email: String(d.email ?? ""), pageUrl: String(d.pageUrl ?? "") } : null;
  } catch {
    return null;
  }
}

function writeDraft(d: Draft | null) {
  try {
    if (d === null) localStorage.removeItem(KEYS.feedbackDraft);
    else localStorage.setItem(KEYS.feedbackDraft, JSON.stringify({ ...d, savedAt: new Date().toISOString() }));
  } catch {
    // storage unavailable: the form still works
  }
}

const TIPS = ["The page or article link", "What happened and what you expected", "An optional screenshot with sensitive details hidden"];

function FeedbackAside() {
  return (
    <>
      <AsideCard title="Useful details">
        <ol className="space-y-2.5">
          {TIPS.map((t, i) => (
            <li key={t} className="flex gap-2.5 text-[13px] leading-[1.6] text-ink-3">
              <span className="mono mt-px text-[11px] font-bold text-accent">{String(i + 1).padStart(2, "0")}</span>
              {t}
            </li>
          ))}
        </ol>
      </AsideCard>
      <AsideCard title="Publishers">
        <p className="text-[13px] leading-[1.75] text-ink-3">For corrections, removal or display requests, include the article link and the change you request.</p>
      </AsideCard>
    </>
  );
}

const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_TEXT = 2000;

export default function FeedbackPage() {
  const [params] = useSearchParams();
  const [draft, setDraft] = useState<Draft>({ content: "", email: "", pageUrl: params.get("from") ?? "" });
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);
  const [state, setState] = useState<{ kind: "idle" | "sending" | "done" | "error"; message?: string; id?: number }>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = readDraft();
    if (saved) setDraft((d) => ({ ...saved, pageUrl: d.pageUrl || saved.pageUrl }));
    else if (!params.get("from") && document.referrer.startsWith(location.origin)) setDraft((d) => ({ ...d, pageUrl: document.referrer }));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => writeDraft(draft.content || draft.email ? draft : null), 400);
    return () => clearTimeout(t);
  }, [draft]);

  useEffect(() => {
    if (!shot) return;
    return () => URL.revokeObjectURL(shot.url);
  }, [shot]);

  const pick = (file: File | null | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setState({ kind: "error", message: "Use a PNG, JPEG or WebP image." });
    if (file.size > MAX_IMAGE) return setState({ kind: "error", message: "The image must be no larger than 5 MB." });
    setShot({ file, url: URL.createObjectURL(file) });
    setState({ kind: "idle" });
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) pick(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.content.trim().length < 2) return setState({ kind: "error", message: "Please enter your feedback." });
    setState({ kind: "sending" });
    try {
      const form = new FormData();
      form.set("content", draft.content);
      form.set("email", draft.email);
      form.set("pageUrl", draft.pageUrl);
      if (shot) form.set("screenshot", shot.file);
      const res = await fetch("/api/site/feedback", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setState({ kind: "error", message: body.detail ?? "Submission failed. Please try again later." });
      writeDraft(null);
      setState({ kind: "done", id: body.id });
      setDraft({ content: "", email: "", pageUrl: "" });
      setShot(null);
    } catch {
      setState({ kind: "error", message: "Connection failed. Your draft is saved in this browser. Try again later." });
    }
  };

  if (state.kind === "done") {
    return (
      <ReadingLayout>
        <div className="card px-6 py-14 text-center">
          <div className="anim-pop-in mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-accent-contrast">
            <IconCheck size={26} />
          </div>
          <h1 className="mt-6 text-[22px] font-semibold text-ink">Feedback received</h1>
          <p className="mt-2 text-[14px] text-ink-3">
            Reference <span className="mono font-semibold text-ink">#{state.id}</span>. Keep this reference for follow-up.
          </p>
          <Link to="/" className="mt-8 inline-flex h-10 items-center rounded-full bg-ink px-6 text-[14px] font-medium text-bg transition-opacity hover:opacity-90">
            Back to latest news
          </Link>
        </div>
      </ReadingLayout>
    );
  }

  const field = "w-full rounded-card bg-bg-sunk text-ink outline-none ring-1 ring-inset ring-line-soft transition-[background-color,box-shadow] placeholder:text-ink-4 hover:ring-line-strong focus:bg-surface focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:ring-accent dark:bg-bg-muted/60 dark:focus:bg-surface";
  const label = "mb-2 block text-[13px] font-semibold text-ink";
  const canSend = draft.content.trim().length >= 2 && state.kind !== "sending";
  return (
    <ReadingLayout aside={<FeedbackAside />}>
      <header>
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">Send feedback</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">Report a problem, suggest a change or request a correction.</p>
      </header>

      <form
        onSubmit={submit}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files[0]);
        }}
        className={`card mt-6 overflow-hidden transition-shadow ${dragging ? "shadow-[0_0_0_3px_var(--accent-soft)] ring-1 ring-accent" : ""}`}
      >
        <div className="space-y-5 p-5 sm:p-6">
          <div>
            <label htmlFor="fb-content" className={label}>
              What happened?
            </label>
            <div className="relative">
              <textarea
                id="fb-content"
                required
                rows={9}
                maxLength={MAX_TEXT}
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                placeholder="For example: I searched for a material and expected..."
                className={`${field} block resize-y px-4 pb-8 pt-3.5 text-[14.5px] leading-relaxed`}
              />
              <span className="mono pointer-events-none absolute bottom-3 right-4 text-[11px] text-ink-4">
                {draft.content.length} / {MAX_TEXT}
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="fb-email" className={label}>
              Email <span className="font-normal text-ink-4">Optional</span>
            </label>
            <input id="fb-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="Email for a reply, if you want one" className={`${field} h-11 px-4 text-[14.5px]`} />
          </div>

          <div>
            <span className={label}>
              Screenshot <span className="font-normal text-ink-4">Optional</span>
            </span>
            {shot ? (
              <div className="flex items-center gap-4 well rounded-card p-3">
                <img src={shot.url} alt="Screenshot preview" className="h-16 w-24 shrink-0 rounded-control border border-line bg-surface object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink-2">{shot.file.name}</div>
                  <div className="mono mt-0.5 text-[11.5px] text-ink-4">{(shot.file.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
                <button type="button" aria-label="Remove screenshot" onClick={() => setShot(null)} className="grid size-8 shrink-0 place-items-center rounded-full text-ink-4 transition-colors hover:bg-surface hover:text-ink">
                  <IconClose size={15} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={`group flex w-full items-center gap-3.5 rounded-card border border-dashed px-4 py-3.5 text-left transition-colors ${dragging ? "border-accent bg-accent-softer" : "border-line-strong hover:border-ink-4 hover:bg-bg-sunk/60"}`}
              >
                <span className="grid size-10 shrink-0 place-items-center well rounded-tile text-ink-3 transition-colors group-hover:text-accent">
                  <IconImage size={19} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold text-ink-2">Add a screenshot</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-4">Paste or drop an image here. Hide sensitive details first. PNG, JPEG or WebP, up to 5 MB.</span>
                </span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </div>

          <Presence show={state.kind === "error"} enter="anim-notice-in" exit="anim-fade-out" duration={160}>
            <p role="alert" className="rounded-tile bg-hot-soft px-3.5 py-2.5 text-[13px] text-hot">
              {state.kind === "error" ? state.message : ""}
            </p>
          </Presence>
        </div>

        <div className="flex flex-col-reverse gap-4 border-t border-line-soft bg-bg-sunk/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:bg-bg-muted/30">
          <p className="text-[12px] leading-relaxed text-ink-4 sm:max-w-[400px]">
            Do not submit secrets, identity documents or unrelated sensitive information. Read the unapproved private-pilot
            <Link to="/privacy" className="text-accent hover:underline">
              privacy notice
            </Link>
             before sending feedback.
          </p>
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-full bg-accent px-6 text-[14px] font-medium text-accent-contrast transition-[background-color,opacity] hover:bg-accent-ink disabled:bg-line-strong disabled:text-ink-4 sm:self-auto"
          >
            {state.kind === "sending" && <RingMark className="size-4" spinning />}
            Send feedback
          </button>
        </div>
      </form>
    </ReadingLayout>
  );
}
