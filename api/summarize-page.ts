/**
 * One-click "AI Summary" endpoint — summarizes whatever panels the caller
 * currently has visible on their dashboard.
 *
 * POST /api/summarize-page
 * Body: { panels: { title: string, text: string }[] }
 *
 * Public, free, no auth/Pro gate (product decision: this feature is
 * available to all users, unlike /api/chat-analyst). Cost control is a
 * scoped per-IP rate limit (see ENDPOINT_RATE_POLICIES['/api/summarize-page']
 * in server/_shared/rate-limit.ts) plus tight per-request payload caps and a
 * non-reasoning ("utility") LLM call rather than the frontier model
 * chat-analyst uses.
 *
 * The panel text comes straight from the caller's rendered DOM (see
 * src/utils/panel-summary-collector.ts), i.e. it is fully untrusted —
 * every panel's text is line-sanitized before it reaches the prompt so a
 * compromised/attacker-influenced feed rendered inside a panel cannot forge
 * its own section headers or inject instruction-override text (same policy
 * as server/worldmonitor/intelligence/v1/chat-analyst-context.ts).
 *
 * Returns 200 { summary: string } on success, 4xx/5xx JSON error otherwise.
 * No SSE streaming in this first version — kept simple/robust; can be
 * upgraded to match /api/chat-analyst's streaming shape later without
 * changing the request contract.
 */

export const config = { runtime: 'edge', regions: ['iad1', 'lhr1', 'fra1', 'sfo1'] };

// @ts-expect-error — JS module, no declaration file
import { getCorsHeaders } from './_cors.js';
// @ts-expect-error — JS module, no declaration file
import { captureSilentError } from './_sentry-edge.js';
import { sanitizeForPromptLine } from '../server/_shared/llm-sanitize.js';
import { ENDPOINT_RATE_POLICIES, checkScopedRateLimit, getClientIp } from '../server/_shared/rate-limit';
import { callLlm } from '../server/_shared/llm';

const RATE_LIMIT_SCOPE = '/api/summarize-page';
const RATE_LIMIT_POLICY = ENDPOINT_RATE_POLICIES[RATE_LIMIT_SCOPE];
if (!RATE_LIMIT_POLICY) {
  // Module-load failure — better to crash cold-start loudly than silently
  // run with no rate limit if the policy entry is ever removed/renamed.
  throw new Error(
    `[summarize-page] missing ENDPOINT_RATE_POLICIES['${RATE_LIMIT_SCOPE}'] — see server/_shared/rate-limit.ts`,
  );
}
const RATE_LIMIT_MAX = RATE_LIMIT_POLICY.limit;
const RATE_LIMIT_WINDOW = RATE_LIMIT_POLICY.window;

// Caps mirror the client-side collector (src/utils/panel-summary-collector.ts)
// but are enforced again here — never trust client-side truncation alone.
const MAX_PANELS = 100;
const MAX_TITLE_CHARS = 80;
const MAX_TEXT_CHARS_PER_PANEL = 600;
const MAX_TOTAL_PROMPT_CHARS = 6_000;

interface PanelInput {
  /** The panel's `data-panel` id, echoed back in the response so the client
   *  can turn each bullet's panel title into a link that reveals that panel. */
  id: string;
  title: string;
  text: string;
}

/** Provider-reported finish reasons that mean "ran out of output budget".
 *  Mirrors TOKEN_LIMIT_FINISH_REASONS in server/_shared/llm.ts, which is not
 *  exported. */
const LENGTH_FINISH_REASONS = new Set(['length', 'max_tokens', 'max_output_tokens']);

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors },
  });
}

function extractPanels(body: unknown): PanelInput[] {
  if (!body || typeof body !== 'object') return [];
  const raw = (body as Record<string, unknown>).panels;
  if (!Array.isArray(raw)) return [];

  const panels: PanelInput[] = [];
  for (const entry of raw.slice(0, MAX_PANELS)) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    // The id is an internal panel key (e.g. "cii", "chat-analyst"), never
    // shown to the model — it only round-trips to the client. Constrain it to
    // the key charset so nothing else can ride along in the response.
    const rawId = typeof e.id === 'string' ? e.id.slice(0, 64) : '';
    const id = /^[a-zA-Z0-9_-]+$/.test(rawId) ? rawId : '';
    const title = sanitizeForPromptLine(typeof e.title === 'string' ? e.title.slice(0, MAX_TITLE_CHARS) : '');
    const text = sanitizeForPromptLine(typeof e.text === 'string' ? e.text.slice(0, MAX_TEXT_CHARS_PER_PANEL) : '');
    if (!id || !title || !text) continue;
    panels.push({ id, title, text });
  }
  return panels;
}

/** Build the section-delimited prompt block, hard-capped at MAX_TOTAL_PROMPT_CHARS.
 *  The "### <title>" delimiters are ours, not caller-controlled — every
 *  panel value that flows in is already line-sanitized so it cannot forge
 *  a fake "### " section of its own. */
function panelSection(p: PanelInput): string {
  return `### ${p.title}\n${p.text}`;
}

/** The prefix of `panels` that fits MAX_TOTAL_PROMPT_CHARS — i.e. exactly the
 *  panels the model is shown. buildPanelBlock and the response's source list
 *  both derive from this so they can never disagree about what was read. */
function panelsWithinBudget(panels: PanelInput[]): PanelInput[] {
  const kept: PanelInput[] = [];
  let total = 0;
  for (const p of panels) {
    const len = panelSection(p).length;
    if (total + len > MAX_TOTAL_PROMPT_CHARS) break;
    kept.push(p);
    total += len;
  }
  return kept;
}

function buildPanelBlock(panels: PanelInput[]): string {
  return panelsWithinBudget(panels).map(panelSection).join('\n\n');
}

const SYSTEM_PROMPT = `You are a concise briefing assistant for a live world monitoring dashboard.
You will be given the text currently visible in several dashboard panels, each under a "### <panel title>" heading.
For each panel, you have to summarize what is going on, and rank then panels information by severity and give me the top 3. Use bullet point for the panels, with the panel title and the summary. The summary should be brief as 1 sentence.
The return should be the list of bullet point I asked for, follow up by a general summary.
Notice that this is written to underwriters of our insurance company, not for a technical person, so you are allowed to use financial language instead of data science language.
Only use the information given. Do not invent facts, numbers, or sources not present in the panel text. If the panels contain little of substance, say so briefly instead of padding.`;

/**
 * Drop a trailing half-written line when the model ran out of output budget.
 *
 * The prompt asks for ranked bullets followed by a general summary, which is
 * long enough that a tight maxTokens used to cut mid-sentence and surface a
 * dangling fragment in the modal. maxTokens is now sized for the full answer,
 * so this is the backstop for the rare overflow: keep everything up to the
 * last line that actually terminates, and drop the fragment rather than
 * rendering it.
 *
 * Only trims when the provider reported a length stop — a normally-finished
 * completion is returned untouched even if it ends without punctuation.
 */
const TERMINATED_RE = /[.!?:;)\]]$/;

export function trimIncompleteTail(content: string, finishReason: string | null): string {
  if (!finishReason || !LENGTH_FINISH_REASONS.has(finishReason)) return content;

  // Drop trailing lines that don't terminate — a cut-off bullet is a whole
  // line we can discard without touching the ones above it.
  const lines = content.split('\n');
  while (lines.length > 1) {
    const last = (lines[lines.length - 1] ?? '').trim();
    if (last === '' || !TERMINATED_RE.test(last)) {
      lines.pop();
      continue;
    }
    break;
  }
  let kept = lines.join('\n').trimEnd();

  // What survives can still end mid-sentence — notably when the whole answer
  // is one unterminated paragraph, where the loop above has nothing to pop.
  // Cut back to the last sentence end in that case.
  if (kept && !TERMINATED_RE.test(kept)) {
    const lastStop = Math.max(kept.lastIndexOf('.'), kept.lastIndexOf('!'), kept.lastIndexOf('?'));
    kept = lastStop > 0 ? kept.slice(0, lastStop + 1) : '';
  }

  // No sentence boundary anywhere: showing the fragment beats showing nothing.
  return kept || content.trimEnd();
}

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req) as Record<string, string>;

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  try {
    const ip = getClientIp(req);
    const scoped = await checkScopedRateLimit(RATE_LIMIT_SCOPE, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW, ip);
    if (!scoped.allowed) {
      return json(
        { error: `Rate limit exceeded. Max ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW} per IP.` },
        429,
        { ...corsHeaders, 'Retry-After': String(Math.max(1, Math.ceil((scoped.reset - Date.now()) / 1000))) },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, corsHeaders);
    }

    const panels = extractPanels(body);
    if (panels.length === 0) {
      return json({ error: 'No summarizable panel content provided' }, 400, corsHeaders);
    }

    const panelBlock = buildPanelBlock(panels);

    const result = await callLlm({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: panelBlock },
      ],
      temperature: 0.3,
      // Sized for the full answer the prompt asks for: three ranked bullets
      // plus a general summary. At the old 350 the model regularly hit the
      // cap and the modal rendered a dangling half sentence.
      maxTokens: 900,
      timeoutMs: 25_000,
      stage: 'summarize-page',
      // Explicit even though it's the default: this is a free, high-volume
      // route, so it must never pay for reasoning tokens.
      enableReasoning: false,
    });

    if (!result || !result.content.trim()) {
      return json({ error: 'summary_unavailable' }, 503, corsHeaders);
    }

    const summary = trimIncompleteTail(result.content.trim(), result.finishReason).trim();
    if (!summary) {
      return json({ error: 'summary_unavailable' }, 503, corsHeaders);
    }

    // Echo the panels that actually reached the model (buildPanelBlock may drop
    // the tail when MAX_TOTAL_PROMPT_CHARS is hit, so recompute from the same
    // budget rather than returning everything the client sent). The client uses
    // this to show what was summarized and to link each bullet to its panel.
    const usedPanels = panelsWithinBudget(panels).map((p) => ({ id: p.id, title: p.title }));

    return json({ summary, panels: usedPanels }, 200, corsHeaders);
  } catch (err) {
    captureSilentError(err, { tags: { route: 'api/summarize-page' } });
    return json({ error: 'service_unavailable' }, 503, corsHeaders);
  }
}
