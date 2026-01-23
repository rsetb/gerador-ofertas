import { NextResponse } from 'next/server';
import { resetWhatsApp, startWhatsApp } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const shouldForce = (request: Request) => {
  try {
    const url = new URL(request.url);
    return url.searchParams.get('force') === '1';
  } catch {
    return false;
  }
};

export async function GET(request: Request) {
  if (shouldForce(request)) {
    await resetWhatsApp();
  }
  const status = await startWhatsApp();
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  if (shouldForce(request)) {
    await resetWhatsApp();
  }
  const status = await startWhatsApp();
  return NextResponse.json(status);
}
