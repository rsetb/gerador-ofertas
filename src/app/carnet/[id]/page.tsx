

'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import type { Order, StoreSettings } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, ShoppingCart, Phone } from 'lucide-react';
import Logo from '@/components/Logo';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { generatePixPayload } from '@/lib/pix';
import PixQRCode from '@/components/PixQRCode';
import { cn } from '@/lib/utils';
import { getClientFirebase } from '@/lib/firebase-client';
import { doc, getDoc } from 'firebase/firestore';
import { useData } from '@/context/DataContext';


const formatCurrency = (value: number) => {
  if (typeof value !== 'number') return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const initialSettings: StoreSettings = {
    storeName: 'ADC Móveis', storeCity: '', storeAddress: '', pixKey: '', storePhone: ''
};

const CarnetContent = ({ order, settings, pixPayload, productCodeById }: { order: Order; settings: StoreSettings, pixPayload: string | null, productCodeById: Map<string, string> }) => {
    
    const subtotal = useMemo(() => order.items.reduce((acc, item) => acc + (item.price * item.quantity), 0), [order.items]);
    const valorFinanciado = order.total;
    const isOrderPaidOff = useMemo(() => (order.installmentDetails || []).every((inst) => inst.status === 'Pago'), [order.installmentDetails]);
    const productsShort = useMemo(() => {
        const items = order.items || [];
        if (items.length === 0) return '';
        const first = items[0];
        const firstCode = productCodeById.get(first.id) || '1';
        const firstLabel = `${firstCode} - ${first.name}`;
        if (items.length === 1) return firstLabel;
        return `${firstLabel} (+${items.length - 1})`;
    }, [order.items, productCodeById]);
    const productsShortAbbrev = useMemo(() => {
        const text = productsShort;
        const maxLen = 26;
        if (!text) return '';
        if (text.length <= maxLen) return text;

        const suffixMatch = text.match(/\s\(\+\d+\)$/);
        const suffix = suffixMatch ? suffixMatch[0] : '';
        const base = suffix ? text.slice(0, -suffix.length) : text;

        const allowedBaseLen = Math.max(0, maxLen - suffix.length);
        const truncatedBase = base.slice(0, Math.max(0, allowedBaseLen - 1)).trimEnd();
        return `${truncatedBase}…${suffix}`;
    }, [productsShort]);
    const customerNameWithCode = useMemo(() => {
        const code = (order.customer.code || '').trim();
        if (!code) return order.customer.name;
        return `${order.customer.name} | Cód: ${code}`;
    }, [order.customer.code, order.customer.name]);
    const customerAddressText = useMemo(() => {
        const line1 = [
            (order.customer.address || '').trim(),
            (order.customer.number || '').trim(),
        ].filter(Boolean).join(', ');

        const complement = (order.customer.complement || '').trim();
        const line1WithComplement = complement ? [line1, complement].filter(Boolean).join(', ') : line1;

        const cityState = [(order.customer.city || '').trim(), (order.customer.state || '').trim()].filter(Boolean).join('/');
        const neighborhood = (order.customer.neighborhood || '').trim();
        const zip = (order.customer.zip || '').trim();
        const line2 = [neighborhood, cityState, zip ? `CEP ${zip}` : ''].filter(Boolean).join(' - ');

        return [line1WithComplement, line2].filter(Boolean).join('\n');
    }, [
        order.customer.address,
        order.customer.number,
        order.customer.complement,
        order.customer.neighborhood,
        order.customer.city,
        order.customer.state,
        order.customer.zip,
    ]);

    return (
    <div className="carnet-content-wrapper bg-white break-inside-avoid-page print:p-0 text-sm print:text-[11px] print:leading-[1.25] flex flex-col relative">
        {isOrderPaidOff && (
            <div className="absolute top-24 right-3 pointer-events-none">
                <div className="border-[5px] border-green-700 text-green-700 rounded-md px-5 py-2 rotate-12 opacity-80">
                    <p className="text-2xl print:text-xl font-black tracking-widest">QUITADO</p>
                </div>
            </div>
        )}
        <div className="pb-1 border-b">
            <div className="flex justify-between items-start">
                <div className="flex items-center">
                    <Logo />
                    <div className="w-2" />
                    <div>
                        <p className="font-bold text-base print:text-sm">{settings.storeName}</p>
                        <p className="whitespace-pre-line text-xs print:text-[10px]">{settings.storeAddress}</p>
                    </div>
                </div>
                <div className="text-right">
                    {settings.storePhone && (
                        <p className="text-muted-foreground flex items-center gap-1 justify-end text-xs print:text-[10px]"><Phone className="h-3 w-3" /> WhatsApp: {settings.storePhone}</p>
                    )}
                    <p className="font-semibold print:text-[10px]">Pedido Nº</p>
                    <p className="font-mono text-lg print:text-base">{order.id}</p>
                </div>
            </div>
        </div>

        <div className="carnet-customer-grid grid grid-cols-1 sm:grid-cols-[1fr_1fr_0.95fr] gap-x-2 gap-y-0 py-0 print:py-0 border-b">
            <div className="sm:col-span-1 space-y-0.5">
                <p className="carnet-label text-[9px] text-muted-foreground">CLIENTE</p>
                <p className="carnet-customer-value font-semibold">{customerNameWithCode}</p>
                 <p className="carnet-label text-[9px] text-muted-foreground">ENDEREÇO</p>
                <p className="carnet-customer-value font-semibold whitespace-pre-line">{customerAddressText}</p>
            </div>
             <div className="sm:col-span-1 space-y-0.5">
                <p className="carnet-label text-[9px] text-muted-foreground">CPF</p>
                <p className="carnet-customer-value font-semibold">
                    {order.customer.cpf || ''}
                </p>
                <p className="carnet-label text-[9px] text-muted-foreground mt-0 print:mt-0">VENDEDOR(A)</p>
                <p className="carnet-customer-value font-semibold">{order.sellerName}</p>
                <p className="carnet-label text-[9px] text-muted-foreground mt-0 print:mt-0">DATA DA COMPRA</p>
                <p className="carnet-customer-value font-semibold">{format(new Date(order.date), 'dd/MM/yyyy', { locale: ptBR })}</p>
            </div>
             <div className="sm:col-span-1 sm:row-span-2 flex items-start justify-end">
                {pixPayload && (
                    <div className="w-full flex flex-col items-end gap-1">
                        <div className="carnet-qr w-full max-w-[180px] flex-shrink-0">
                            <PixQRCode payload={pixPayload} size={768} className="p-1" />
                        </div>
                        {settings.pixKey && (
                            <div className="w-full max-w-[180px]">
                                <p className="carnet-label text-[9px] text-muted-foreground text-center">CHAVE PIX</p>
                                <div className="flex items-center justify-center gap-2">
                                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-primary text-primary-foreground text-[10px] font-extrabold leading-none flex-shrink-0 print:h-5 print:w-5 print:text-[9px]">
                                        PIX
                                    </span>
                                    <p className="carnet-pix-key font-mono break-all text-center text-[16px] leading-tight print:text-[13px]">
                                        {settings.pixKey}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
        
        <div className="flex-grow mt-0.5 print:mt-0 border rounded-md overflow-hidden flex flex-col">
            <div className="overflow-y-auto print:overflow-visible">
                <table className="carnet-installments-table w-full table-fixed text-sm print:text-[11px]">
                    <thead className="bg-muted/50 print:bg-gray-100">
                        <tr className="border-b">
                            <th className="px-2 py-1 print:px-1 print:py-0.5 text-center font-semibold w-[12%]">Parc.</th>
                            <th className="px-2 py-1 print:px-1 print:py-0.5 text-left font-semibold w-[16%]">Venc.</th>
                            <th className="px-2 py-1 print:px-1 print:py-0.5 text-left font-semibold w-[28%]">Produto</th>
                            <th className="px-2 py-1 print:px-1 print:py-0.5 text-right font-semibold w-[22%]">Valor (R$)</th>
                            <th className="px-2 py-1 print:px-1 print:py-0.5 text-left font-semibold w-[22%]">Data Pag.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(order.installmentDetails || []).map((installment) => (
                            <tr key={installment.installmentNumber} className="border-b last:border-none">
                                <td className="px-2 py-1 print:px-1 print:py-0.5 text-center font-semibold">{installment.installmentNumber}/{order.installments}</td>
                                <td className="px-2 py-1 print:px-1 print:py-0.5 font-semibold">{format(parseISO(installment.dueDate), 'dd/MM/yy')}</td>
                                <td className="px-2 py-1 print:px-1 print:py-0.5 font-semibold">
                                    <span className="block truncate">{productsShortAbbrev}</span>
                                </td>
                                <td className="px-2 py-1 print:px-1 print:py-0.5 text-right font-mono font-semibold">{formatCurrency(installment.amount)}</td>
                                <td className="px-2 py-1 print:px-1 print:py-0.5 border-l">
                                    {installment.status === 'Pago' 
                                        ? (installment.paymentDate ? format(parseISO(installment.paymentDate), 'dd/MM/yy') : 'Pago')
                                        : '\u00A0'
                                    }
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="mt-auto">
                <table className="w-full text-xs print:text-[9px]">
                    <tfoot className="bg-muted/50 print:bg-gray-100 font-bold">
                        <tr className="border-t">
                            <td colSpan={2} className="p-1 text-right">SUBTOTAL:</td>
                            <td className="p-1 text-right font-mono w-[25%]">{formatCurrency(subtotal)}</td>
                            <td className="w-[35%]"></td>
                        </tr>
                        {(order.downPayment || 0) > 0 && (
                            <tr className="border-t">
                                <td colSpan={2} className="p-1 text-right text-green-600">ENTRADA:</td>
                                <td className="p-1 text-right font-mono text-green-600">- {formatCurrency(order.downPayment || 0)}</td>
                                <td></td>
                            </tr>
                        )}
                        {(order.discount || 0) > 0 && (
                            <tr className="border-t">
                                <td colSpan={2} className="p-1 text-right text-destructive">DESCONTO:</td>
                                <td className="p-1 text-right font-mono text-destructive">- {formatCurrency(order.discount || 0)}</td>
                                <td></td>
                            </tr>
                        )}
                        <tr className="border-t text-base print:text-sm">
                            <td colSpan={2} className="p-1 text-right">VALOR TOTAL:</td>
                            <td className="p-1 text-right font-mono">{formatCurrency(valorFinanciado)}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
             </div>
        </div>

        {order.observations && (
            <div className="py-1 border-t mt-1">
                <p className="carnet-label text-[9px] text-muted-foreground">OBSERVAÇÕES:</p>
                <p className="font-semibold whitespace-pre-line text-xs print:text-[10px]">{order.observations}</p>
            </div>
        )}
        
        <div className="carnet-important mt-0.5 print:mt-0 pt-0.5 print:pt-0 text-[9px] print:text-[8px] text-muted-foreground border-t">
            <p className="font-semibold">Importante:</p>
            <ol className="list-decimal list-inside">
                <li>O pagamento pode ser realizado na loja ou via PIX (solicite o código ao vendedor).</li>
                <li>Em caso de atraso, juros e multas podem ser aplicados de acordo com o contrato.</li>
            </ol>
        </div>
    </div>
);
}

export default function CarnetPage() {
  const params = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [settings, setSettings] = useState<StoreSettings>(initialSettings);
  const [isLoading, setIsLoading] = useState(true);
  const { products } = useData();

  useEffect(() => {
    const orderId = params.id as string;
    if (!orderId) {
      setIsLoading(false);
      return;
    }
    
    const { db } = getClientFirebase();
    const orderRef = doc(db, 'orders', orderId);
    const settingsRef = doc(db, 'config', 'storeSettings');
    
    Promise.all([getDoc(orderRef), getDoc(settingsRef)])
      .then(async ([orderDoc, settingsDoc]) => {
        if (orderDoc.exists()) {
          let loadedOrder = { id: orderDoc.id, ...orderDoc.data() } as Order;
          const cpf = (loadedOrder.customer?.cpf || '').replace(/\D/g, '');
          const needsCustomerDetails =
            !loadedOrder.customer?.code ||
            !loadedOrder.customer?.address ||
            !loadedOrder.customer?.number ||
            !loadedOrder.customer?.neighborhood ||
            !loadedOrder.customer?.city ||
            !loadedOrder.customer?.state ||
            !loadedOrder.customer?.zip;

          if (cpf.length === 11 && needsCustomerDetails) {
            try {
              const customerRef = doc(db, 'customers', cpf);
              const customerDoc = await getDoc(customerRef);
              if (customerDoc.exists()) {
                const customerData = customerDoc.data() as Partial<Order['customer']>;
                loadedOrder = {
                  ...loadedOrder,
                  customer: {
                    ...loadedOrder.customer,
                    code: loadedOrder.customer.code || customerData.code,
                    address: loadedOrder.customer.address || customerData.address || '',
                    number: loadedOrder.customer.number || customerData.number || '',
                    complement: loadedOrder.customer.complement || customerData.complement,
                    neighborhood: loadedOrder.customer.neighborhood || customerData.neighborhood || '',
                    city: loadedOrder.customer.city || customerData.city || '',
                    state: loadedOrder.customer.state || customerData.state || '',
                    zip: loadedOrder.customer.zip || customerData.zip || '',
                  },
                };
              }
            } catch {
            }
          }

          setOrder(loadedOrder);
        } else {
          console.error("No such order!");
        }

        if (settingsDoc.exists()) {
            setSettings(settingsDoc.data() as StoreSettings);
        }
      })
      .catch(error => {
        console.error("Error fetching document:", error);
      })
      .finally(() => {
        setIsLoading(false);
      });

  }, [params.id]);

  const productCodeById = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => {
      const code = (p.code || '').trim();
      if (code) map.set(p.id, code);
    });
    return map;
  }, [products]);


  const nextPendingInstallment = useMemo(() => {
    if (!order || !order.installmentDetails) return null;
    // Garante que as parcelas estão ordenadas antes de encontrar a primeira pendente
    const sortedInstallments = [...order.installmentDetails].sort((a,b) => a.installmentNumber - b.installmentNumber);
    return sortedInstallments.find(inst => inst.status === 'Pendente');
  }, [order]);

  const pixPayload = useMemo(() => {
    if (!nextPendingInstallment || !settings.pixKey || !order) return null;
    
    return generatePixPayload(
      settings.pixKey,
      settings.storeName,
      settings.storeCity,
      `${order.id}-${nextPendingInstallment.installmentNumber}`,
      nextPendingInstallment.amount
    );
  }, [nextPendingInstallment, order, settings]);

  const handlePrint = (layout: 'default' | 'a4') => {
    document.body.classList.remove('print-layout-default', 'print-layout-a4');
    document.body.classList.add(`print-layout-${layout}`);
    
    // Use a short timeout to allow state to update and classes to be applied
    setTimeout(() => {
        window.print();
    }, 100);
  };


  if (isLoading) {
    return <div className="p-8 text-center">Carregando carnê...</div>;
  }

  if (!order) {
    return (
      <div className="container mx-auto py-24 text-center">
        <h1 className="text-2xl font-bold">Pedido não encontrado</h1>
        <Button onClick={() => window.close()} className="mt-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>
    );
  }
  
  if (order.paymentMethod !== 'Crediário' || !order.installmentDetails || order.installmentDetails.length === 0) {
    return (
      <div className="container mx-auto py-24 text-center">
        <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Este pedido não é um carnê</h1>
        <p className="text-muted-foreground mt-2">O método de pagamento foi {order.paymentMethod} e não possui parcelamento.</p>
        <Button onClick={() => window.close()} className="mt-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("bg-muted/30 print:bg-white")}>
       <div className="container mx-auto max-w-7xl py-8 print:p-0 print:m-0 print:max-w-full">
        <header className="flex justify-between items-center mb-8 print-hidden">
          <Button variant="ghost" onClick={() => window.close()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <div className="text-center">
             <h1 className="text-2xl font-bold">Carnê de Pagamento</h1>
             <p className="text-muted-foreground">Pedido: {order.id}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handlePrint('default')}>
                <Printer className="mr-2 h-4 w-4" />
                Carnê Duas Vias
            </Button>
            <Button onClick={() => handlePrint('a4')}>
                <Printer className="mr-2 h-4 w-4" />
                Carnê Completo
            </Button>
          </div>
        </header>
        
        <main className="w-full bg-white p-4 print:p-0 print:shadow-none print-default:grid print-default:grid-cols-2 print-default:gap-x-4 print-a4:flex print-a4:flex-col">
            <div className="print-default:border-r print-default:border-dashed print-default:border-black print-default:pr-4">
                <CarnetContent order={order} settings={settings} pixPayload={pixPayload} productCodeById={productCodeById} />
            </div>
            <div className="hidden print-default:block print-default:pl-4">
                <CarnetContent order={order} settings={settings} pixPayload={pixPayload} productCodeById={productCodeById} />
            </div>
        </main>
      </div>
    </div>
  );
}
