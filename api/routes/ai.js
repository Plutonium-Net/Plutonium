/**
 * AI routes: /ai/chat, /ai/models, /ai/tts, /ai/transcribe, /ai/ratelimit.
 *
 * Ported from cf-worker/groq-worker. Behaviour is unchanged except that every
 * route which spends the shared Groq key now requires a real Firebase ID token
 * and is quota'd on the verified uid. Previously the worker accepted any
 * `Bearer <anything>` and keyed the quota on a slice of that string, so callers
 * could mint unlimited quota by inventing tokens.
 */

import { json, fail, unauthorized } from '../lib/responses.js';
import { verifyIdToken } from '../lib/token.js';
import { checkRateLimit, peekRateLimit } from '../lib/ratelimit.js';

const AI_MAX_MESSAGES = 100;
const AI_WINDOW_SECS  = 12 * 60 * 60;

const MODELS = [
  { id: 'openai/gpt-oss-120b', label: 'GPT OSS 120B',  speed: '500 t/s',  ctx: '131K' },
  { id: 'openai/gpt-oss-20b',  label: 'GPT OSS 20B',   speed: '1000 t/s', ctx: '131K' },
  { id: 'groq/compound',       label: 'Groq Compound', speed: '450 t/s',  ctx: '131K' },
];

const TTS_MODELS    = ['canopylabs/orpheus-v1-english', 'canopylabs/orpheus-arabic-saudi'];
const TTS_VOICES_EN = ['autumn', 'diana', 'hannah', 'austin', 'daniel', 'troy'];
const TTS_MAX_CHARS = 3000;

const STT_MODELS = ['whisper-large-v3', 'whisper-large-v3-turbo'];

const MAX_MESSAGES = 100;

export async function handle(request, env, url, path) {
  if (path === '/models' && request.method === 'GET') {
    return json({ models: MODELS });
  }

  if (path === '/chat' && request.method === 'POST') {
    return handleChat(request, env);
  }

  if (path === '/tts' && request.method === 'POST') {
    return handleTts(request, env);
  }

  if (path === '/transcribe' && request.method === 'POST') {
    return handleTranscribe(request, env);
  }

  if (path === '/ratelimit' && request.method === 'GET') {
    return handleRateLimit(request, env);
  }

  return fail('Not found', 404);
}

function tooManyRequests(result) {
  const retryAfter = result.reset ? Math.max(0, result.reset - Math.floor(Date.now() / 1000)) : AI_WINDOW_SECS;
  return json(
    {
      error:       `Rate limit exceeded - you can send ${AI_MAX_MESSAGES} messages every 12 hours.`,
      retry_after: retryAfter,
    },
    429,
    { 'Retry-After': String(retryAfter) }
  );
}

async function handleChat(request, env) {
  const user = await verifyIdToken(request, env);
  if (!user) return unauthorized();

  const byokKey = (request.headers.get('X-Groq-Key') || '').trim();
  const useByok = byokKey.startsWith('gsk_');
  const groqKey = useByok ? byokKey : env.GROQ_API_KEY;

  if (!groqKey) return fail('GROQ_API_KEY not configured', 500);

  let remaining = null;
  if (!useByok) {
    const rl = await checkRateLimit(env, {
      scope: 'ai',
      uid:   user.uid,
      max:   AI_MAX_MESSAGES,
      windowSecs: AI_WINDOW_SECS,
    });
    if (rl.limited) return tooManyRequests(rl);
    remaining = rl.remaining;
  }

  const body = await request.json().catch(() => null);
  if (!body) return fail('Invalid JSON', 400);

  const { model, messages, system } = body;

  if (!model || !MODELS.find(m => m.id === model)) {
    return fail('Invalid or unsupported model', 400);
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return fail('messages array required', 400);
  }

  const upstream = [];
  if (system) upstream.push({ role: 'system', content: String(system).slice(0, 8000) });

  const sanitized = messages
    .slice(-MAX_MESSAGES)
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 32000) }));

  upstream.push(...sanitized);

  const wantStream = request.headers.get('Accept') === 'text/event-stream';

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model,
      messages:    upstream,
      temperature: 0.7,
      max_tokens:  4096,
      stream:      wantStream,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return fail(data.error?.message || 'Groq error', res.status);
  }

  if (wantStream) {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      try {
        if (res.body) {
          const reader = res.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await writer.write(value);
          }
        }
        await writer.write(
          encoder.encode(`event: rl\ndata: ${JSON.stringify({ remaining: remaining ?? null })}\n\n`)
        );
      } catch (_) {
        // The client hung up mid-stream; nothing left to report.
      } finally {
        try { await writer.close(); } catch (_) {}
      }
    })();

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const data = await res.json();
  return json({
    content:   data.choices?.[0]?.message?.content ?? '',
    model:     data.model,
    usage:     data.usage,
    remaining: remaining ?? null,
  });
}

async function handleTts(request, env) {
  const user = await verifyIdToken(request, env);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body) return fail('Invalid JSON', 400);

  const { model, input, voice } = body;
  if (!TTS_MODELS.includes(model)) return fail('Invalid or unsupported TTS model', 400);
  if (model === 'canopylabs/orpheus-v1-english' && !TTS_VOICES_EN.includes(voice)) {
    return fail('Invalid voice for this model', 400);
  }

  const text = String(input || '').trim();
  if (!text) return fail('input text required', 400);
  if (text.length > TTS_MAX_CHARS) return fail(`input too long (max ${TTS_MAX_CHARS} chars)`, 400);

  if (!env.GROQ_API_KEY) return fail('GROQ_API_KEY not configured', 500);

  const res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      input:           text,
      voice,
      response_format: 'wav',
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return fail(data.error?.message || 'Groq TTS error', res.status);
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type':                res.headers.get('Content-Type') || 'audio/wav',
      'Cache-Control':               'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function handleTranscribe(request, env) {
  const user = await verifyIdToken(request, env);
  if (!user) return unauthorized();

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('multipart/')) {
    return fail('Expected multipart/form-data with a file field', 400);
  }

  const form  = await request.formData();
  const file  = form.get('file');
  const model = form.get('model') || 'whisper-large-v3-turbo';

  if (!file) return fail('Missing file field', 400);
  if (!STT_MODELS.includes(model)) return fail('Invalid or unsupported STT model', 400);
  if (!env.GROQ_API_KEY) return fail('GROQ_API_KEY not configured', 500);

  const out = new FormData();
  out.append('file', file, file.name || 'talk.webm');
  out.append('model', model);
  out.append('response_format', 'json');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${env.GROQ_API_KEY}` },
    body:    out,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return fail(data.error?.message || 'Groq transcription error', res.status);
  return json({ text: data.text || '' });
}

async function handleRateLimit(request, env) {
  const user = await verifyIdToken(request, env);
  if (!user) return unauthorized();

  const result = await peekRateLimit(env, {
    scope: 'ai',
    uid:   user.uid,
    max:   AI_MAX_MESSAGES,
    windowSecs: AI_WINDOW_SECS,
  });

  return json({
    used:      result.used,
    remaining: result.remaining,
    max:       result.max,
    reset:     result.reset,
  });
}
