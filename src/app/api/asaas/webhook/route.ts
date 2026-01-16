import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerFirebase } from '@/lib/firebase';
import type { AsaasSettings } from '@/lib/types';

export const dynamic = 'force-dynamic';

const webhookSchema = z.object({
  event: z.string().min(1),
  payment: z
    .object({
      id: z.string().min(1),
      status: z.string().optional(),
      externalReference: z.string().optional(),
      value: z.number().optional(),
      netValue: z.number().optional(),
      paymentDate: z.string().optional(),
      confirmedDate: z.string().optional(),
    })
    .passthrough(),
}).passthrough();

function isPaidStatus(status?: string | null) {
  const s = (status || '').toUpperCase();
  return s === 'RECEIVED' || s === 'CONFIRMED';
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }

  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const { event, payment } = parsed.data;
  const paymentId = payment.id;
  const externalReference = (payment.externalReference || '').trim();

  try {
    const { db } = getServerFirebase();
    let expectedToken = (process.env.ASAAS_WEBHOOK_TOKEN || '').trim();
    if (!expectedToken) {
      const settingsSnap = await db.doc('config/asaasSettings').get();
      if (settingsSnap.exists) {
        const settings = settingsSnap.data() as AsaasSettings;
        expectedToken = (settings.webhookToken || '').trim();
      }
    }
    const providedToken = (request.headers.get('asaas-access-token') || '').trim();
    if (!expectedToken || !providedToken || providedToken !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let orderId = externalReference;
    if (!orderId) {
      const mapSnap = await db.doc(`asaasPaymentMap/${paymentId}`).get();
      if (mapSnap.exists) {
        const data = mapSnap.data() as any;
        orderId = String(data.orderId || '');
      }
    }

    if (!orderId) {
      return NextResponse.json({ ok: true });
    }

    const orderRef = db.doc(`orders/${orderId}`);
    const existing = await orderRef.get();
    if (!existing.exists) {
      return NextResponse.json({ ok: true });
    }

    const status = payment.status || null;
    const nowIso = new Date().toISOString();
    const existingAsaas = (existing.data() as any)?.asaas || {};
    const patch: any = {
      asaas: {
        ...existingAsaas,
        paymentId,
        status,
        lastEvent: event,
        updatedAt: nowIso,
        paidAt: isPaidStatus(status) ? (payment.paymentDate || payment.confirmedDate || nowIso) : (existingAsaas.paidAt || null),
      },
    };

    await orderRef.set(patch, { merge: true });
    await db.doc(`asaasPayments/${orderId}`).set(
      {
      status,
      lastEvent: event,
      updatedAt: nowIso,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro inesperado.' }, { status: 500 });
  }
}
