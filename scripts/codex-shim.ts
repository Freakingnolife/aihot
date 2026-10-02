// Local OpenAI-compatible endpoint backed by the Codex CLI and Marcus's ChatGPT sign-in, so the reader's
// default model route (LLM_BASE_URL) can run on his Codex allowance. Private, loopback only, at most two
// requests at a time by default. Each request starts a locked-down `codex exec`: empty working folder, read-only sandbox, no user
// config, rules or project docs, no saved session, stdin closed. Images are not passed through.
//   node scripts/codex-shim.ts   (CODEX_SHIM_HOST=127.0.0.1 CODEX_SHIM_PORT=4340 CODEX_MODEL=gpt-6.1-sol CODEX_EFFORT=medium)
// Then: LLM_BASE_URL=http://127.0.0.1:4340/v1, LLM_API_KEY=local-codex, LLM_MODEL=<same model>.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const HOST = process.env.CODEX_SHIM_HOST ?? "127.0.0.1"; // 0.0.0.0 only inside a private container network (deploy/nas)
const PORT = Number(process.env.CODEX_SHIM_PORT ?? 4340);
const MODEL = process.env.CODEX_MODEL ?? "gpt-6.1-sol";
const EFFORT = process.env.CODEX_EFFORT ?? "medium";
const TIMEOUT_MS = 170_000;

type Part = { type: string; text?: string };
type Message = { role: string; content: string | Part[] };

function text(content: Message["content"]): string {
  return typeof content === "string" ? content : content.filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n");
}

function prompt(messages: Message[], json: boolean): string {
  const system = messages.filter((m) => m.role === "system").map((m) => text(m.content)).join("\n\n");
  const user = messages.filter((m) => m.role !== "system").map((m) => text(m.content)).join("\n\n");
  return [
    "You are a text-processing function inside a news pipeline, not a coding agent. Do not run commands, read files or browse. Answer only from the material below.",
    system && `<instructions>\n${system}\n</instructions>`,
    `<input>\n${user}\n</input>`,
    json ? "Reply with a single JSON object only, no prose and no code fences." : "Reply with the requested text only.",
  ].filter(Boolean).join("\n\n");
}

async function runCodex(input: string): Promise<{ content: string; usage: Record<string, number> | null }> {
  const dir = await mkdtemp(path.join(tmpdir(), "codex-shim-"));
  const out = path.join(dir, "last.txt");
  try {
    const args = [
      "exec", "--ignore-user-config", "--ignore-rules", "-c", "project_doc_max_bytes=0",
      "-m", MODEL, "-c", `model_reasoning_effort=${EFFORT}`,
      "-s", "read-only", "--skip-git-repo-check", "--ephemeral", "-C", dir, "-o", out, "--json", "-",
    ];
    const events = await new Promise<string>((resolve, reject) => {
      const child = spawn("codex", args, { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("codex timed out")); }, TIMEOUT_MS);
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        code === 0 ? resolve(stdout) : reject(new Error(`codex exited ${code}: ${stderr.slice(-400)}`));
      });
      // The prompt goes in on stdin and stdin is closed, so codex never waits for more input.
      child.stdin.end(input);
    });
    let usage: Record<string, number> | null = null;
    for (const line of events.split("\n")) {
      if (!line.includes('"turn.completed"')) continue;
      const u = JSON.parse(line).usage as Record<string, number> | undefined;
      if (u) usage = { prompt_tokens: u.input_tokens ?? 0, completion_tokens: (u.output_tokens ?? 0) + (u.reasoning_output_tokens ?? 0), cached_tokens: u.cached_input_tokens ?? 0 };
    }
    return { content: (await readFile(out, "utf8")).trim(), usage };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// At most two codex runs at once: the pipeline sends its two independent scores together, and a strict
// one-at-a-time queue made the second wait past the caller's 120 s timeout.
// CODEX_SHIM_MAX_RUNNING raises it for batches that process several articles at once (two per article).
const MAX_RUNNING = Number(process.env.CODEX_SHIM_MAX_RUNNING ?? 2);
let running = 0;
const waiting: Array<() => void> = [];
async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_RUNNING) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: { message: "not found" } }));
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    const body = JSON.parse(raw) as { messages: Message[]; response_format?: { type?: string } };
    const { content, usage } = await limited(() => runCodex(prompt(body.messages, body.response_format?.type === "json_object")));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      id: `codex-${randomUUID()}`, object: "chat.completion", model: MODEL,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage,
    }));
  } catch (error) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: String(error).slice(0, 500) } }));
  }
}).listen(PORT, HOST, () => console.log(`codex shim on http://${HOST}:${PORT}/v1 using ${MODEL} (${EFFORT})`));
