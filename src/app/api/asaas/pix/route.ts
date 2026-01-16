import { NextResponse } from 'next/server';
import { z } from 'zod';
import { onlyDigits } from '@/lib/utils';
import { getServerFirebase } from '@/lib/firebase';
import type { AsaasSettings } from '@/lib/types';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().finite().positive(),
  dueDate: z.string().optional(),
  customer: z.object({
    name: z.string().min(1),
    cpfCnpj: z.string().min(1),
    email: z.string().optional(),
    phone: z.string().optional(),
    zip: z.string().optional(),
    address: z.string().optional(),
    number: z.string().optional(),
    complement: z.string().optional(),
    neighborhood: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
  }),
});

type AsaasCustomerListResponse = {
  data?: Array<{ id: string; cpfCnpj?: string; name?: string }>;
};

type AsaasPaymentResponse = {
  id: string;
  status?: string;
};

type AsaasPixQrCodeResponse = {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
};

function resolveAsaasEnv(maybeEnv?: string) {
  const env = (maybeEnv || '').toLowerCase();
  return env === 'sandbox' ? 'sandbox' : 'production';
}

function resolveAsaasBaseUrl(env: 'sandbox' | 'production') {
  return env === 'sandbox' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
}

function resolveAsaasToken(asaasSettings: AsaasSettings | null) {
  const envToken = (process.env.ASAAS_ACCESS_TOKEN || process.env.ASAAS_API_KEY || '').trim();
  if (envToken) return envToken;
  return (asaasSettings?.accessToken || '').trim();
}

function asaasHeaders(token: string) {
  return { 'Content-Type': 'application/json', access_token: token };
}

function toDueDate(value?: string) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
}

async function asaasFetch(baseUrl: string, path: string, init?: RequestInit) {
  const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, init);
  const text = await res.text();
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }
  if (!res.ok) {
    return { ok: false as const, status: res.status, json };
  }
  return { ok: true as const, status: res.status, json };
}

async function upsertCustomerId(baseUrl: string, token: string, cpfCnpjDigits: string, customerPayload: any) {
  const list = await asaasFetch(baseUrl, `/customers?cpfCnpj=${encodeURIComponent(cpfCnpjDigits)}`, {
    method: 'GET',
    headers: asaasHeaders(token),
  });
  if (list.ok) {
    const data = (list.json as AsaasCustomerListResponse | null)?.data || [];
    const first = data[0];
    if (first?.id) return first.id;
  }

  const created = await asaasFetch(baseUrl, '/customers', {
    method: 'POST',
    headers: asaasHeaders(token),
    body: JSON.stringify(customerPayload),
  });
  if (!created.ok || !created.json?.id) {
    throw new Error('Falha ao criar cliente no Asaas.');
  }
  return String(created.json.id);
}

export async function POST(request: Request) {
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

  const { orderId, amount, customer, dueDate } = parsed.data;
  const cpfCnpjDigits = onlyDigits(customer.cpfCnpj);
  if (cpfCnpjDigits.length !== 11 && cpfCnpjDigits.length !== 14) {
    return NextResponse.json({ error: 'CPF/CNPJ inválido.' }, { status: 400 });
  }

  const phoneDigits = onlyDigits(customer.phone || '');
  const zipDigits = onlyDigits(customer.zip || '');

  const customerPayload = {
    name: customer.name,
    cpfCnpj: cpfCnpjDigits,
    email: (customer.email || '').trim() || undefined,
    phone: phoneDigits || undefined,
    mobilePhone: phoneDigits || undefined,
    postalCode: zipDigits || undefined,
    address: customer.address || undefined,
    addressNumber: customer.number || undefined,
    complement: customer.complement || undefined,
    province: customer.neighborhood || undefined,
    cityName: customer.city || undefined,
    state: customer.state || undefined,
  };

  try {
    const { db } = getServerFirebase();
    const asaasSettingsSnap = await db.doc('config/asaasSettings').get();
    const asaasSettings = asaasSettingsSnap.exists ? (asaasSettingsSnap.data() as AsaasSettings) : null;

    const env = resolveAsaasEnv(process.env.ASAAS_ENV || asaasSettings?.env);
    const baseUrl = resolveAsaasBaseUrl(env);
    const token = resolveAsaasToken(asaasSettings);
    if (!token) {
      return NextResponse.json({ error: 'ASAAS_ACCESS_TOKEN não configurado.' }, { status: 500 });
    }

    const existingRef = db.doc(`asaasPayments/${orderId}`);
    const existingSnap = await existingRef.get();
    if (existingSnap.exists) {
      return NextResponse.json(existingSnap.data());
    }

    const asaasCustomerId = await upsertCustomerId(baseUrl, token, cpfCnpjDigits, customerPayload);

    const paymentCreated = await asaasFetch(baseUrl, '/payments', {
      method: 'POST',
      headers: asaasHeaders(token),
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: 'PIX',
        value: Number(amount),
        dueDate: toDueDate(dueDate),
        description: `Pedido ${orderId}`,
        externalReference: orderId,
        notificationEnabled: false,
      }),
    });
    if (!paymentCreated.ok) {
      return NextResponse.json({ error: 'Falha ao criar cobrança no Asaas.', details: paymentCreated.json }, { status: 502 });
    }

    const payment = paymentCreated.json as AsaasPaymentResponse;
    const pixQr = await asaasFetch(baseUrl, `/payments/${encodeURIComponent(payment.id)}/pixQrCode`, {
      method: 'GET',
      headers: asaasHeaders(token),
    });
    if (!pixQr.ok) {
      return NextResponse.json({ error: 'Falha ao obter QR Code PIX no Asaas.', details: pixQr.json }, { status: 502 });
    }

    const qr = pixQr.json as AsaasPixQrCodeResponse;
    const payload = String(qr.payload || '');
    if (!payload) {
      return NextResponse.json({ error: 'QR Code PIX retornou payload vazio.' }, { status: 502 });
    }

    const responseData = {
      orderId,
      asaasCustomerId,
      asaasPaymentId: payment.id,
      status: payment.status || null,
      pix: {
        payload,
        encodedImage: qr.encodedImage || null,
        expirationDate: qr.expirationDate || null,
      },
      createdAt: new Date().toISOString(),
    };

    await existingRef.set(responseData, { merge: true });
    await db.doc(`asaasPaymentMap/${payment.id}`).set({ orderId }, { merge: true });

    await db.doc(`orders/${orderId}`).set(
      {
        asaas: {
          customerId: asaasCustomerId,
          paymentId: payment.id,
          status: payment.status || null,
          pix: {
            payload,
            encodedImage: qr.encodedImage || null,
            expirationDate: qr.expirationDate || null,
          },
          updatedAt: new Date().toISOString(),
        },
      },
      { merge: true }
    );

    return NextResponse.json(responseData);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro inesperado.' }, { status: 500 });
  }
}
