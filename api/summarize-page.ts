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
const MAX_PANELS = 24;
const MAX_TITLE_CHARS = 80;
const MAX_TEXT_CHARS_PER_PANEL = 600;
const MAX_TOTAL_PROMPT_CHARS = 6_000;

interface PanelInput {
  title: string;
  text: string;
}

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
    const title = sanitizeForPromptLine(typeof e.title === 'string' ? e.title.slice(0, MAX_TITLE_CHARS) : '');
    const text = sanitizeForPromptLine(typeof e.text === 'string' ? e.text.slice(0, MAX_TEXT_CHARS_PER_PANEL) : '');
    if (!title || !text) continue;
    panels.push({ title, text });
  }
  return panels;
}

/** Build the section-delimited prompt block, hard-capped at MAX_TOTAL_PROMPT_CHARS.
 *  The "### <title>" delimiters are ours, not caller-controlled — every
 *  panel value that flows in is already line-sanitized so it cannot forge
 *  a fake "### " section of its own. */
function buildPanelBlock(panels: PanelInput[]): string {
  const lines: string[] = [];
  let total = 0;
  for (const p of panels) {
    const section = `### ${p.title}\n${p.text}`;
    if (total + section.length > MAX_TOTAL_PROMPT_CHARS) break;
    lines.push(section);
    total += section.length;
  }
  return lines.join('\n\n');
}

const SYSTEM_PROMPT = `You are a concise briefing assistant for a live world monitoring dashboard.
You will be given the text currently visible in several dashboard panels, each under a "### <panel title>" heading.
For each panel, you have to summarize what is going on, and rank then panels information by severity and give me the top 3. Use bullet point for the panels, with the panel title and the summary. The summary should be brief as 1 sentence.
The return should be the list of bullet point I asked for, follow up by a general summary.
Notice that this is written to underwriters of our insurance company, not for a technical person, so you are allowed to use financial language instead of data science language.
Only use the information given. Do not invent facts, numbers, or sources not present in the panel text. If the panels contain little of substance, say so briefly instead of padding.`;

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
      maxTokens: 350,
      timeoutMs: 20_000,
      stage: 'summarize-page',
      // Explicit even though it's the default: this is a free, high-volume
      // route, so it must never pay for reasoning tokens.
      enableReasoning: false,
    });

    if (!result || !result.content.trim()) {
      return json({ error: 'summary_unavailable' }, 503, corsHeaders);
    }

    return json({ summary: result.content.trim() }, 200, corsHeaders);
  } catch (err) {
    captureSilentError(err, { tags: { route: 'api/summarize-page' } });
    return json({ error: 'service_unavailable' }, 503, corsHeaders);
  }
}
