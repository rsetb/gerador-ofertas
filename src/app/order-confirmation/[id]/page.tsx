

'use client';

import { useEffect, useState, useMemo } from 'react';
import { useCart } from '@/context/CartContext';
import { useSettings } from '@/context/SettingsContext';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import type { Order } from '@/lib/types';
import { CheckCircle } from 'lucide-react';
import Image from 'next/image';
import { generatePixPayload } from '@/lib/pix';
import PixQRCode from '@/components/PixQRCode';
import { format } from 'date-fns';
import { getClientFirebase } from '@/lib/firebase-client';
import { doc, getDoc } from 'firebase/firestore';


const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export default function OrderConfirmationPage() {
  const { lastOrder } = useCart();
  const { settings } = useSettings();
  const router = useRouter();
  const params = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [isOrdersLoading, setIsLoading] = useState(true);
  const [asaasPixPayload, setAsaasPixPayload] = useState<string | null>(null);
  const [asaasError, setAsaasError] = useState<string | null>(null);

  useEffect(() => {
    const orderId = params.id as string;

    if (!orderId && lastOrder) {
      setOrder(lastOrder);
      setIsLoading(false);
      return;
    }
    
    if (!orderId) {
        router.push('/');
        return;
    }

    const { db } = getClientFirebase();
    const orderRef = doc(db, 'orders', orderId);

    getDoc(orderRef).then(docSnap => {
        if (docSnap.exists()) {
            setOrder({ id: docSnap.id, ...docSnap.data() } as Order);
        } else {
            console.error("No such order, redirecting.");
            if (lastOrder) {
                setOrder(lastOrder);
            } else {
                router.push('/');
            }
        }
    }).catch(error => {
        console.error("Error fetching order:", error);
        router.push('/');
    }).finally(() => {
        setIsLoading(false);
    });
  }, [params.id, lastOrder, router]);

  useEffect(() => {
    if (!order) return;
    if (order.paymentMethod !== 'Pix') return;
    if (order.asaas?.pix?.payload) {
      setAsaasPixPayload(order.asaas.pix.payload || null);
      return;
    }

    let canceled = false;
    setAsaasError(null);

    fetch('/api/asaas/pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        amount: order.total,
        customer: {
          name: order.customer.name,
          cpfCnpj: order.customer.cpf || '',
          email: order.customer.email || '',
          phone: order.customer.phone || '',
          zip: order.customer.zip || '',
          address: order.customer.address || '',
          number: order.customer.number || '',
          complement: order.customer.complement || '',
          neighborhood: order.customer.neighborhood || '',
          city: order.customer.city || '',
          state: order.customer.state || '',
        },
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = typeof data?.error === 'string' ? data.error : 'Falha ao gerar PIX no Asaas.';
          throw new Error(msg);
        }
        return data as any;
      })
      .then(async (data) => {
        const payload = String(data?.pix?.payload || '');
        if (!payload) throw new Error('PIX do Asaas retornou payload vazio.');
        if (canceled) return;
        setAsaasPixPayload(payload);
        const nextAsaas = {
          customerId: String(data?.asaasCustomerId || ''),
          paymentId: String(data?.asaasPaymentId || ''),
          status: data?.status ?? null,
          pix: {
            payload,
            encodedImage: data?.pix?.encodedImage ?? null,
            expirationDate: data?.pix?.expirationDate ?? null,
          },
          updatedAt: new Date().toISOString(),
        };
        setOrder((prev) => (prev ? { ...prev, asaas: nextAsaas } : prev));
      })
      .catch((e) => {
        if (canceled) return;
        setAsaasError(e instanceof Error ? e.message : 'Falha ao gerar PIX no Asaas.');
      });

    return () => {
      canceled = true;
    };
  }, [order]);

  const pixPayload = useMemo(() => {
    if (!order) return null;
    if (order.paymentMethod !== 'Pix' && order.paymentMethod !== 'Crediário') return null;

    if (order.paymentMethod === 'Pix') {
      if (asaasPixPayload) return asaasPixPayload;
      if (settings.pixKey) {
        const { pixKey, storeName, storeCity } = settings;
        return generatePixPayload(pixKey, storeName, storeCity, order.id, order.total);
      }
      return null;
    }

    if (!settings.pixKey) return null;

    const { pixKey, storeName, storeCity } = settings;
    
    let amount = order.total;
    let txid = order.id;

    // Generate PIX for the first installment of the "Crediário"
    if (order.installmentDetails && order.installmentDetails.length > 0) {
      amount = order.installmentDetails[0].amount;
      txid = `${order.id}-${order.installmentDetails[0].installmentNumber}`;
    }
    
    return generatePixPayload(pixKey, storeName, storeCity, txid, amount);
  }, [order, settings, asaasPixPayload]);

  if (isOrdersLoading || !order) {
    return (
      <div className="container mx-auto py-24 text-center">
        <p className="text-lg">Carregando detalhes do pedido...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-12 px-4">
      <Card className="max-w-4xl mx-auto shadow-lg">
        <CardHeader className="text-center bg-primary/5 rounded-t-lg p-8">
          <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
          <CardTitle className="text-3xl font-headline text-primary">Pedido Realizado com Sucesso!</CardTitle>
          <CardDescription className="text-lg">
            Obrigado pela sua compra, {order.customer.name.split(' ')[0]}!
          </CardDescription>
          <p className="font-semibold text-muted-foreground">Número do Pedido: <Badge variant="secondary">{order.id}</Badge></p>
          {order.customer.code && (
            <p className="font-semibold text-muted-foreground">
              Seu Código de Cliente: <Badge variant="secondary">{order.customer.code}</Badge>
            </p>
          )}
          {settings.storePhone && (
            <div className="mt-4 flex justify-center">
              <a
                href={`https://wa.me/55${settings.storePhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                  [
                    '*Pedido do Catálogo Online*',
                    `*Cód. Pedido:* ${order.id}`,
                    order.customer.code ? `*Cód. Cliente:* ${order.customer.code}` : '*Cód. Cliente:* -',
                    `*Cliente:* ${order.customer.name}`,
                    order.customer.cpf ? `*CPF:* ${order.customer.cpf}` : '',
                    `*Telefone:* ${order.customer.phone}`,
                  ]
                    .filter(Boolean)
                    .join('\n')
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline">Enviar no WhatsApp</Button>
              </a>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-6 md:p-8">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold text-lg mb-4">Resumo do Pedido</h3>
              <div className="space-y-4">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="relative h-12 w-12 rounded-md overflow-hidden bg-muted">
                        <Image src={item.imageUrl} alt={item.name} fill className="object-cover" />
                      </div>
                      <p>{item.name} <span className="text-muted-foreground">x{item.quantity}</span></p>
                    </div>
                    <p>{formatCurrency(item.price * item.quantity)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-4">Detalhes do Pagamento</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total do Pedido:</span>
                  <span className="font-semibold">{formatCurrency(order.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Forma de Pagamento:</span>
                  <span className="font-semibold">{order.paymentMethod}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Parcelas:</span>
                  <span className="font-semibold text-accent">
                    {order.paymentMethod === 'Crediário'
                      ? `${order.installments}x de ${formatCurrency(order.installmentValue)}`
                      : 'À vista'}
                  </span>
                </div>
                {order.paymentMethod === 'Crediário' && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Próximo Vencimento:</span>
                    <span className="font-semibold">
                      {order.installmentDetails && order.installmentDetails.length > 0
                        ? format(new Date(order.installmentDetails[0].dueDate), 'dd/MM/yyyy')
                        : '-'}
                    </span>
                  </div>
                )}
              </div>
              {asaasError && order.paymentMethod === 'Pix' && (
                <p className="mt-4 text-xs text-destructive">{asaasError}</p>
              )}
              {pixPayload && (
                <div className="mt-6">
                  <p className="font-semibold mb-2 text-primary">
                    {order.paymentMethod === 'Crediário' ? 'Pague a 1ª parcela com PIX' : 'Pague com PIX'}
                  </p>
                  <PixQRCode payload={pixPayload} />
                  {order.paymentMethod === 'Crediário' && settings.pixKey && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Chave PIX:{' '}
                      <span className="font-mono break-all text-foreground">{settings.pixKey}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <Separator className="my-8" />
          <div>
            <h3 className="font-semibold text-lg mb-4">Informações de Entrega</h3>
            <div className="text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">{order.customer.name}</p>
              {order.customer.code && <p>Código do Cliente: {order.customer.code}</p>}
              <p>{`${order.customer.address}, ${order.customer.number}`}</p>
              <p>{`${order.customer.neighborhood}, ${order.customer.city}, ${order.customer.state} - ${order.customer.zip}`}</p>
              <p>Email: {order.customer.email}</p>
              <p>Telefone: {order.customer.phone}</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="text-center p-6 bg-muted/50 rounded-b-lg">
          <Link href="/" className="w-full">
            <Button className="w-full md:w-auto">Voltar para a Página Inicial</Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
