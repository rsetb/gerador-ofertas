

'use client';

import { useParams } from 'next/navigation';
import { Fragment, useMemo, useState, useEffect, useRef } from 'react';
import type { Order, StoreSettings } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, ShoppingCart, Phone, History, Send } from 'lucide-react';
import Logo from '@/components/Logo';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { generatePixPayload } from '@/lib/pix';
import PixQRCode from '@/components/PixQRCode';
import { cn, onlyDigits } from '@/lib/utils';
import { getClientFirebase } from '@/lib/firebase-client';
import { doc, getDoc } from 'firebase/firestore';
import { useData } from '@/context/DataContext';
import html2canvas from 'html2canvas';
import { useToast } from '@/hooks/use-toast';


const formatCurrency = (value: number) => {
  if (typeof value !== 'number') return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const initialSettings: StoreSettings = {
    storeName: 'ADC Móveis', storeCity: '', storeAddress: '', pixKey: '', storePhone: ''
};

const CarnetContent = ({ order, settings, pixPayload, productCodeById }: { order: Order; settings: StoreSettings, pixPayload: string | null, productCodeById: Map<string, string> }) => {
    
    const [expandedHistory, setExpandedHistory] = useState<number | null>(null);
    const subtotal = useMemo(() => order.items.reduce((acc, item) => acc + (item.price * item.quantity), 0), [order.items]);
    const totalPedido = useMemo(() => Math.max(0, subtotal - (order.discount || 0)), [subtotal, order.discount]);
    const entrada = order.downPayment || 0;
    const totalFinanciado = useMemo(() => {
        const financedFromInstallments = (order.installmentDetails || []).reduce((sum, inst) => sum + (inst.amount || 0), 0);
        if (financedFromInstallments > 0) return financedFromInstallments;
        return Math.max(0, totalPedido - entrada);
    }, [order.installmentDetails, totalPedido, entrada]);
    const isOrderPaidOff = useMemo(() => (order.installmentDetails || []).every((inst) => inst.status === 'Pago'), [order.installmentDetails]);
    const productsList = useMemo(() => {
        const items = order.items || [];
        return items.map((item, index) => {
            const code = productCodeById.get(item.id) || String(index + 1);
            const quantity = item.quantity || 0;
            return {
                key: `${item.id}-${index}`,
                code,
                name: item.name,
                quantity,
            };
        });
    }, [order.items, productCodeById]);
    const customerNameWithCode = useMemo(() => {
        const code = (order.customer.code || '').trim();
        if (!code) return order.customer.name;
        return `${order.customer.name} - ${code}`;
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
    const customerPhonesText = useMemo(() => {
        const phones = [order.customer.phone, order.customer.phone2, order.customer.phone3]
            .map((p) => (p || '').trim())
            .filter(Boolean);
        return phones.join(' / ');
    }, [order.customer.phone, order.customer.phone2, order.customer.phone3]);

    return (
    <div className="carnet-content-wrapper bg-white text-black break-inside-avoid-page print:p-0 text-sm print:text-[11px] print:leading-[1.25] flex flex-col relative">
        {isOrderPaidOff && (
            <div className="absolute top-24 right-3 pointer-events-none">
                <div className="border-[5px] border-green-700 text-green-700 rounded-md px-5 py-2 rotate-12 opacity-80">
                    <p className="text-2xl print:text-xl font-black tracking-widest">QUITADO</p>
                </div>
            </div>
        )}
        <div className="pb-0 border-b">
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
                    <p className="font-semibold print:text-[10px]">
                        Pedido Nº <span className="font-mono text-lg print:text-base">{order.id}</span>
                    </p>
                    <p className="text-sm print:text-[11px] text-black">
                        Data da compra: {format(new Date(order.date), 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                </div>
            </div>
        </div>

        <div className="carnet-customer-grid grid grid-cols-1 sm:grid-cols-[1fr_150px] print-default:sm:grid-cols-[1fr_130px] gap-x-1 gap-y-0 py-0 print:py-0 border-b">
            <div className="min-w-0">
                <div className="grid grid-cols-1 sm:grid-cols-[1.55fr_1fr] print-default:sm:grid-cols-[1.9fr_0.85fr] gap-x-2 print-default:gap-x-1 gap-y-0 leading-[1.25]">
                    <div className="space-y-0.5">
                        <p className="carnet-label text-[9px] text-muted-foreground leading-none">CLIENTE</p>
                        <p className="carnet-customer-value font-semibold">{customerNameWithCode}</p>
                        <p className="carnet-label text-[9px] text-muted-foreground leading-none">ENDEREÇO</p>
                        <p className="carnet-customer-value font-semibold whitespace-pre-line">{customerAddressText}</p>
                    </div>
                    <div className="space-y-0.5 print-default:sm:w-fit print-default:sm:justify-self-end">
                        <p className="carnet-label text-[9px] text-muted-foreground leading-none">CPF</p>
                        <p className="carnet-customer-value font-semibold">
                            {order.customer.cpf || ''}
                        </p>
                        <p className="carnet-label text-[9px] text-muted-foreground leading-none">TELEFONE(S)</p>
                        <p className="carnet-customer-value font-semibold">{customerPhonesText}</p>
                        <p className="carnet-label text-[9px] text-muted-foreground leading-none">VENDEDOR(A)</p>
                        <p className="carnet-customer-value font-semibold">{order.sellerName}</p>
                    </div>
                </div>

                <div className="mt-0.5 space-y-0.5 leading-[1.2]">
                    <p className="carnet-label text-[9px] text-muted-foreground leading-none">PRODUTO(S)</p>
                    <div className="carnet-products-value font-semibold text-[11px] print:text-[10px] leading-tight">
                        {productsList.map((item) => (
                            <div key={item.key} className="break-words">
                                <span>
                                    {item.code} - {item.name}
                                </span>
                                {item.quantity > 1 && <span> (x{item.quantity})</span>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex items-start justify-end">
                {pixPayload && (
                    <div className="w-full flex flex-col items-end gap-1">
                        <div className="carnet-qr w-full max-w-[150px] print-default:max-w-[130px] flex-shrink-0">
                            <PixQRCode payload={pixPayload} size={768} className="p-1" />
                        </div>
                        {settings.pixKey && (
                            <div className="w-full max-w-[150px] print-default:max-w-[130px]">
                                <p className="carnet-label text-[9px] text-muted-foreground text-center leading-none">CHAVE PIX</p>
                                <div className="flex items-center justify-center gap-2">
                                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-primary text-primary-foreground text-[10px] font-extrabold leading-none flex-shrink-0 print:h-5 print:w-5 print:text-[9px]">
                                        PIX
                                    </span>
                                    <p className="carnet-pix-key font-mono break-all text-center text-[15px] leading-tight print:text-[12px]">
                                        {settings.pixKey}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
        
        <div className="flex-grow mt-0 print:mt-0 border rounded-md overflow-hidden flex flex-col">
            <div className="overflow-y-auto print:overflow-visible">
                <table className="carnet-installments-table w-full table-fixed text-sm print:text-[11px]">
                    <thead className="bg-muted/50 print:bg-gray-100">
                        <tr className="border-b">
                            <th className="px-2 py-1 print:px-1 print:py-0.5 text-center font-semibold w-[16%]">Parc.</th>
                            <th className="px-2 py-1 print:px-1 print:py-0.5 text-left font-semibold w-[22%]">Venc.</th>
                            <th className="px-2 py-1 print:px-1 print:py-0.5 text-right font-semibold w-[26%]">Valor (R$)</th>
                            <th className="px-2 py-1 print:px-1 print:py-0.5 text-left font-semibold w-[28%]">Data Pag.</th>
                            <th className="px-2 py-1 text-center font-semibold w-[8%] print:hidden">Hist.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(order.installmentDetails || []).map((installment) => {
                            const isExpanded = expandedHistory === installment.installmentNumber;
                            const payments = Array.isArray(installment.payments) ? [...installment.payments] : [];
                            payments.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                            const hasPayments = payments.length > 0;

                            return (
                                <Fragment key={installment.installmentNumber}>
                                    <tr className="border-b last:border-none">
                                        <td className="px-2 py-1 print:px-1 print:py-0.5 text-center font-semibold">{installment.installmentNumber}/{order.installments}</td>
                                        <td className="px-2 py-1 print:px-1 print:py-0.5 font-semibold">{format(parseISO(installment.dueDate), 'dd/MM/yy')}</td>
                                        <td className="px-2 py-1 print:px-1 print:py-0.5 text-right font-mono font-semibold">{formatCurrency(installment.amount)}</td>
                                        <td className="px-2 py-1 print:px-1 print:py-0.5 border-l">
                                            {installment.status === 'Pago' 
                                                ? (installment.paymentDate ? format(parseISO(installment.paymentDate), 'dd/MM/yy') : 'Pago')
                                                : '\u00A0'
                                            }
                                        </td>
                                        <td className="px-2 py-1 text-center print:hidden">
                                            {hasPayments && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => setExpandedHistory(isExpanded ? null : installment.installmentNumber)}
                                                    aria-label="Ver histórico de pagamentos"
                                                >
                                                    <History className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className="border-b print:hidden">
                                            <td colSpan={5} className="p-0">
                                                <div className="bg-muted/30 px-3 py-2">
                                                    <div className="mb-2 text-sm font-semibold">Histórico de Pagamentos</div>
                                                    <div className="rounded-md border bg-background">
                                                        <table className="w-full text-xs">
                                                            <thead className="bg-muted/50">
                                                                <tr className="border-b">
                                                                    <th className="px-2 py-1 text-left font-semibold">Data</th>
                                                                    <th className="px-2 py-1 text-left font-semibold">Método</th>
                                                                    <th className="px-2 py-1 text-right font-semibold">Valor</th>
                                                                    <th className="px-2 py-1 text-left font-semibold">Recebido por</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {payments.map((p) => (
                                                                    <tr key={p.id} className="border-b last:border-none">
                                                                        <td className="px-2 py-1">{format(parseISO(p.date), 'dd/MM/yy HH:mm', { locale: ptBR })}</td>
                                                                        <td className="px-2 py-1">{p.method}</td>
                                                                        <td className="px-2 py-1 text-right font-mono">{formatCurrency(p.amount)}</td>
                                                                        <td className="px-2 py-1">{p.receivedBy || '-'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
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
                            <td className="p-1 text-right font-mono">{formatCurrency(totalPedido)}</td>
                            <td></td>
                        </tr>
                        {entrada > 0 && (
                            <tr className="border-t text-base print:text-sm">
                                <td colSpan={2} className="p-1 text-right">TOTAL A FINANCIAR:</td>
                                <td className="p-1 text-right font-mono">{formatCurrency(totalFinanciado)}</td>
                                <td></td>
                            </tr>
                        )}
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
  const { toast } = useToast();
  const carnetRef = useRef<HTMLElement | null>(null);
  const [isSendingPrint, setIsSendingPrint] = useState(false);

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
            !loadedOrder.customer?.phone ||
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
                    phone: loadedOrder.customer.phone || customerData.phone || '',
                    phone2: loadedOrder.customer.phone2 || customerData.phone2,
                    phone3: loadedOrder.customer.phone3 || customerData.phone3,
                    email: loadedOrder.customer.email || customerData.email,
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

  const resolveCustomerPhoneDigits = (o: Order) => {
    const candidates = [o.customer?.phone, o.customer?.phone2, o.customer?.phone3];
    for (const candidate of candidates) {
      const digits = onlyDigits(candidate || '');
      if (digits.length === 10 || digits.length === 11 || digits.length === 12 || digits.length === 13) return digits;
    }
    return '';
  };

  const handleSendPrintWhatsApp = async () => {
    if (!order) return;
    const number = resolveCustomerPhoneDigits(order);
    if (!number) {
      toast({ title: 'Telefone inválido', description: 'Cliente sem número de WhatsApp cadastrado.' });
      return;
    }

    const el = carnetRef.current;
    if (!el) {
      toast({ title: 'Erro ao capturar', description: 'Não foi possível localizar o conteúdo do carnê.' });
      return;
    }

    setIsSendingPrint(true);
    const hadDefault = document.body.classList.contains('print-layout-default');
    const hadA4 = document.body.classList.contains('print-layout-a4');

    try {
      document.body.classList.remove('print-layout-default', 'print-layout-a4');
      document.body.classList.add('print-layout-a4');

      await new Promise((resolve) => setTimeout(resolve, 150));

      const imgs = Array.from(el.querySelectorAll('img'));
      const hiddenImgs: Array<{ el: HTMLImageElement; display: string }> = [];
      for (const img of imgs) {
        const src = (img.getAttribute('src') || '').trim();
        if (!src) continue;
        try {
          img.crossOrigin = 'anonymous';
        } catch {}
        if (/^https?:\/\//i.test(src) && !src.startsWith(window.location.origin)) {
          hiddenImgs.push({ el: img, display: img.style.display });
          img.style.display = 'none';
        }
      }

      const canvas = await html2canvas(el, {
        scale: 1.4,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollX: -window.scrollX,
        scrollY: -window.scrollY,
      });

      for (const item of hiddenImgs) {
        item.el.style.display = item.display;
      }

      let finalCanvas = canvas;
      const resizeToWidth = (maxWidth: number) => {
        if (finalCanvas.width <= maxWidth) return;
        const ratio = maxWidth / finalCanvas.width;
        const resized = document.createElement('canvas');
        resized.width = maxWidth;
        resized.height = Math.max(1, Math.round(finalCanvas.height * ratio));
        const ctx = resized.getContext('2d');
        if (!ctx) throw new Error('Falha ao processar a imagem.');
        ctx.drawImage(finalCanvas, 0, 0, resized.width, resized.height);
        finalCanvas = resized;
      };

      resizeToWidth(1100);

      const encodeJpeg = (quality: number) => finalCanvas.toDataURL('image/jpeg', quality);
      let mediaDataUrl = encodeJpeg(0.62);
      if (mediaDataUrl.length > 1_800_000) {
        resizeToWidth(950);
        mediaDataUrl = encodeJpeg(0.52);
      }
      if (mediaDataUrl.length > 1_800_000) {
        resizeToWidth(850);
        mediaDataUrl = encodeJpeg(0.45);
      }

      if (mediaDataUrl.length > 1_800_000) {
        throw new Error('Print muito grande para enviar. Tente imprimir em A4 e tentar novamente.');
      }
      const firstName = String(order.customer?.name || '').trim().split(' ')[0] || 'Olá';
      const message = `Olá, ${firstName}! Segue o print do seu carnê (pedido ${order.id}).\n\n*${settings.storeName}*`;

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-request': '1' },
        body: JSON.stringify({
          number,
          message,
          mediaDataUrl,
          filename: `carne-${order.id}.jpg`,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(String(data?.error || 'Falha ao enviar no WhatsApp.'));
      }

      toast({ title: 'Enviado!', description: 'O print do carnê foi enviado no WhatsApp.' });
    } catch (e) {
      toast({ title: 'Erro ao enviar', description: e instanceof Error ? e.message : 'Erro inesperado.' });
    } finally {
      document.body.classList.remove('print-layout-default', 'print-layout-a4');
      if (hadDefault) document.body.classList.add('print-layout-default');
      if (hadA4) document.body.classList.add('print-layout-a4');
      setIsSendingPrint(false);
    }
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
            {nextPendingInstallment && (
              <Button
                variant="secondary"
                onClick={() => window.open(`/carnet/${order.id}/${nextPendingInstallment.installmentNumber}`, '_blank')}
              >
                Cobrar Parcela
              </Button>
            )}
            <Button variant="outline" onClick={handleSendPrintWhatsApp} disabled={isSendingPrint}>
                <Send className="mr-2 h-4 w-4" />
                Enviar Print
            </Button>
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
        
        <main ref={carnetRef} className="w-full bg-white text-black p-4 print:p-0 print:shadow-none print-default:grid print-default:grid-cols-2 print-default:gap-x-2 print-a4:flex print-a4:flex-col">
            <div className="print-default:border-r print-default:border-dashed print-default:border-black print-default:pr-2">
                <CarnetContent order={order} settings={settings} pixPayload={pixPayload} productCodeById={productCodeById} />
            </div>
            <div className="hidden print-default:block print-default:pl-2">
                <CarnetContent order={order} settings={settings} pixPayload={pixPayload} productCodeById={productCodeById} />
            </div>
        </main>
      </div>
    </div>
  );
}
