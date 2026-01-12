import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const h = await headers();
  const fromForwarded = h.get('x-forwarded-for');
  const fromRealIp = h.get('x-real-ip');
  const fromCf = h.get('cf-connecting-ip');

  const normalizeIp = (raw: string) => {
    let ip = (raw || '').trim();
    if (!ip) return '';
    if (ip.includes(',')) ip = ip.split(',')[0]?.trim() || '';
    if (ip.startsWith('[')) {
      const idx = ip.indexOf(']');
      if (idx > 1) ip = ip.slice(1, idx);
    } else {
      const parts = ip.split(':');
      if (parts.length === 2 && /^\d{1,3}(\.\d{1,3}){3}$/.test(parts[0] || '')) {
        ip = parts[0] || '';
      }
    }
    if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
    return ip.trim();
  };

  const ip = normalizeIp(fromForwarded || '') || normalizeIp(fromCf || '') || normalizeIp(fromRealIp || '');

  return NextResponse.json({ ip: ip || null });
}
