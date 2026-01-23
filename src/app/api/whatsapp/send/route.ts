import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendWhatsAppMedia, sendWhatsAppMessage, startWhatsApp } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const requestSchema = z.object({
  number: z.string().min(1),
  message: z.string().optional().default(''),
  mediaDataUrl: z.string().optional(),
  filename: z.string().optional(),
}).superRefine((val, ctx) => {
  const hasMedia = !!(val.mediaDataUrl || '').trim();
  const hasMessage = !!(val.message || '').trim();
  if (!hasMedia && !hasMessage) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['message'], message: 'Mensagem é obrigatória.' });
  }
});

const parseDataUrl = (input: string) => {
  const trimmed = (input || '').trim();
  if (!trimmed.startsWith('data:')) return null;
  const comma = trimmed.indexOf(',');
  if (comma < 0) return null;
  const meta = trimmed.slice('data:'.length, comma).trim();
  const base64 = trimmed.slice(comma + 1).trim();
  const parts = meta.split(';').map((p) => p.trim()).filter(Boolean);
  const mimeType = String(parts[0] || '').trim();
  const hasBase64 = parts.some((p) => p.toLowerCase() === 'base64');
  if (!hasBase64) return null;
  if (!mimeType || !base64) return null;
  return { mimeType, base64 };
};

const isSameOrigin = (request: Request) => {
  const origin = (request.headers.get('origin') || '').trim();
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
};

const isAdminRequest = (request: Request) => {
  const adminHint = (request.headers.get('x-admin-request') || '').trim();
  if (adminHint === '1' && isSameOrigin(request)) return true;

  const referer = (request.headers.get('referer') || '').toLowerCase();
  if (!referer) return false;
  try {
    const url = new URL(referer);
    return url.pathname === '/admin' || url.pathname.startsWith('/admin/');
  } catch {
    return false;
  }
};

export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 });
  }

  try {
    const status = await startWhatsApp();
    if (status.status !== 'ready') {
      return NextResponse.json({ error: 'WhatsApp não está conectado.' }, { status: 409 });
    }
    const mediaDataUrl = (parsed.data.mediaDataUrl || '').trim();
    if (mediaDataUrl) {
      const parsedUrl = parseDataUrl(mediaDataUrl);
      if (!parsedUrl) {
        return NextResponse.json({ error: 'mediaDataUrl inválido.' }, { status: 400 });
      }
      const sendAsDocument = parsedUrl.mimeType.toLowerCase() === 'application/pdf';
      await sendWhatsAppMedia(
        parsed.data.number,
        { ...parsedUrl, filename: (parsed.data.filename || '').trim() || undefined },
        (parsed.data.message || '').toString(),
        { sendAsDocument }
      );
    } else {
      await sendWhatsAppMessage(parsed.data.number, (parsed.data.message || '').toString());
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro inesperado.' }, { status: 500 });
  }
}
