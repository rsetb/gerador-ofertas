

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

  const pixPayload = useMemo(() => {
    if (!order || !settings.pixKey) return null;

    const { pixKey, storeName, storeCity } = settings;
    
    let amount = order.total;
    let txid = order.id;

    // Generate PIX for the first installment of the "Crediário"
    if (order.installmentDetails && order.installmentDetails.length > 0) {
      amount = order.installmentDetails[0].amount;
      txid = `${order.id}-${order.installmentDetails[0].installmentNumber}`;
    }
    
    return generatePixPayload(pixKey, storeName, storeCity, txid, amount);
  }, [order, settings]);

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
                  <span className="font-semibold text-accent">{order.installments}x de {formatCurrency(order.installmentValue)}</span>
                </div>
                  <div className="flex justify-between">
                  <span className="text-muted-foreground">Próximo Vencimento:</span>
                  <span className="font-semibold">{order.installmentDetails && order.installmentDetails.length > 0 ? format(new Date(order.installmentDetails[0].dueDate), 'dd/MM/yyyy') : '-'}</span>
                </div>
              </div>
               {pixPayload && (
                 <div className="mt-6">
                    <p className="font-semibold mb-2 text-primary">Pague a 1ª parcela com PIX</p>
                    <PixQRCode payload={pixPayload} />
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
