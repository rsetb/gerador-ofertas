

'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useEffect }from 'react';
import type { Order, Installment, StoreSettings } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Printer, Send, ArrowLeft } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useToast } from '@/hooks/use-toast';
import Logo from '@/components/Logo';
import { getClientFirebase } from '@/lib/firebase-client';
import { doc, getDoc } from 'firebase/firestore';
import { useData } from '@/context/DataContext';

const formatCurrency = (value: number) => {
  if (typeof value !== 'number' || isNaN(value)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const initialSettings: StoreSettings = {
    storeName: 'ADC Móveis', storeCity: '', storeAddress: '', pixKey: '', storePhone: ''
};

const ReceiptContent = ({ order, installment, settings, via }: { order: Order; installment: Installment; settings: StoreSettings; via: 'Empresa' | 'Cliente' }) => {
    const { products } = useData();

    const customerNameWithCode = useMemo(() => {
        const code = (order.customer.code || '').trim();
        const name = (order.customer.name || '').trim();
        if (!code) return name.toUpperCase();
        return `${name} - ${code}`.toUpperCase();
    }, [order.customer.code, order.customer.name]);

    const customerAddressText = useMemo(() => {
        const line1 = [
            (order.customer.address || '').trim(),
            (order.customer.number || '').trim(),
        ].filter(Boolean).join(', ');

        const complement = (order.customer.complement || '').trim();
        const line1WithComplement = complement ? [line1, complement].filter(Boolean).join(', ') : line1;

        const neighborhood = (order.customer.neighborhood || '').trim();
        const cityState = [(order.customer.city || '').trim(), (order.customer.state || '').trim()].filter(Boolean).join('/');
        const zip = (order.customer.zip || '').trim();

        const line2 = [neighborhood, cityState, zip ? `CEP ${zip}` : ''].filter(Boolean).join(' - ');
        return [line1WithComplement, line2].filter(Boolean).join(' - ');
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

    const productCodeById = useMemo(() => {
        const map = new Map<string, string>();
        products.forEach((p) => {
            const code = (p.code || '').trim();
            if (code) map.set(p.id, code);
        });
        return map;
    }, [products]);
    
    const sortedPayments = useMemo(() => {
        if (!installment.payments || installment.payments.length === 0) return [];
        return [...installment.payments].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [installment.payments]);

    const totalPaidOnInstallment = installment.paidAmount || 0;
    const isPaid = installment.status === 'Pago';
    const remainingBalance = isPaid ? 0 : installment.amount - totalPaidOnInstallment;
    const isOrderPaidOff = useMemo(() => {
        const installmentsPaid = (order.installmentDetails || []).every((inst) => inst.status === 'Pago');
        const isLegacyPix = order.paymentMethod === 'Pix' && !order.asaas?.paymentId;
        const immediatePaid =
          order.paymentMethod === 'Dinheiro' ||
          (order.paymentMethod === 'Pix' && (isLegacyPix || !!order.asaas?.paidAt));
        return installmentsPaid || immediatePaid;
    }, [order.installmentDetails, order.paymentMethod, order.asaas?.paidAt, order.asaas?.paymentId]);
    
    const valorOriginal = useMemo(() => {
        const subtotal = order.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        return subtotal;
    }, [order.items]);
    
    const entrada = order.downPayment || 0;
    const totalPedido = useMemo(() => Math.max(0, valorOriginal - (order.discount || 0)), [valorOriginal, order.discount]);
    const valorFinanciado = useMemo(() => {
        const financedFromInstallments = (order.installmentDetails || []).reduce((sum, inst) => sum + (inst.amount || 0), 0);
        if (financedFromInstallments > 0) return financedFromInstallments;
        return Math.max(0, totalPedido - entrada);
    }, [order.installmentDetails, totalPedido, entrada]);

    return (
        <div className="bg-white break-inside-avoid-page text-black font-mono text-xs relative print:p-0">
             {isOrderPaidOff && (
                <div className="absolute top-24 right-3 pointer-events-none">
                    <div className="border-[5px] border-green-700 text-green-700 rounded-md px-5 py-2 rotate-12 opacity-80">
                        <p className="text-2xl font-black tracking-widest">QUITADO</p>
                    </div>
                </div>
            )}
             <div className="flex justify-between items-start mb-4">
                <div className="flex items-center">
                    <Logo />
                    <div className="w-2" />
                    <div className="text-[10px]">
                        <p className="font-bold">{settings.storeName}</p>
                        <p className="whitespace-pre-line">{settings.storeAddress}</p>
                    </div>
                </div>
                <h1 className="font-bold text-lg tracking-wider">EXTRATO DA PARCELA</h1>
            </div>

            <div className="grid grid-cols-2 gap-x-4 border-y border-black py-2">
                <div className="space-y-1">
                    <p>CLIENTE: {customerNameWithCode}</p>
                    <p>CPF: {order.customer.cpf}</p>
                    <p>TELEFONE(S): {customerPhonesText}</p>
                    <p>ENDEREÇO: {customerAddressText}</p>
                    <p>PEDIDO: {order.id}</p>
                </div>
                <div className="space-y-1 text-right">
                    <p className="receipt-main-values text-base font-extrabold">PARCELA: {installment.installmentNumber}/{order.installments}</p>
                    <p className="receipt-main-values text-base font-extrabold">VENCIMENTO: {format(parseISO(installment.dueDate), 'dd/MM/yyyy')}</p>
                    <p className="receipt-main-values text-base font-semibold">VALOR ORIGINAL: {formatCurrency(valorOriginal)}</p>
                    {(order.downPayment || 0) > 0 && <p>ENTRADA: -{formatCurrency(order.downPayment || 0)}</p>}
                    {(order.discount || 0) > 0 && <p>DESCONTO: -{formatCurrency(order.discount || 0)}</p>}
                    <p className="receipt-main-values text-base font-semibold">VALOR DO PEDIDO: {formatCurrency(totalPedido)}</p>
                    <p className="receipt-main-values text-base font-extrabold">VALOR FINANCIADO: {formatCurrency(valorFinanciado)}</p>
                </div>
            </div>

            <div className="py-3 receipt-products">
                <h2 className="font-bold text-center mb-2">PRODUTOS DO PEDIDO</h2>
                <table className="w-full receipt-products-table">
                    <thead className="border-b border-black">
                        <tr>
                            <th className="text-left py-1 w-[10%]">Cód.</th>
                            <th className="text-left py-1">Produto</th>
                            <th className="text-center py-1 w-[12%]">Qtde</th>
                        </tr>
                    </thead>
                    <tbody>
                        {order.items.map((item, index) => (
                            <tr key={item.id + index}>
                                <td className="py-1">{productCodeById.get(item.id) || index + 1}</td>
                                <td className="py-1">{item.name}</td>
                                <td className="py-1 text-center">{item.quantity}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="py-4">
                <h2 className="font-bold text-center mb-2">HISTÓRICO DE PAGAMENTOS DA PARCELA</h2>
                {sortedPayments.length > 0 ? (
                    <table className="w-full">
                        <thead className="border-b border-black">
                            <tr>
                                <th className="text-left py-1">Data</th>
                                <th className="text-left py-1">Método</th>
                                <th className="text-right py-1">Valor Pago</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedPayments.map((p, index) => (
                                <tr key={p.id + index}>
                                    <td className="py-1">{format(parseISO(p.date), 'dd/MM/yy HH:mm')}</td>
                                    <td className="py-1">{p.method}</td>
                                    <td className="py-1 text-right">{formatCurrency(p.amount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="text-center text-gray-500">Nenhum pagamento registrado para esta parcela.</p>
                )}
            </div>

            <div className="grid grid-cols-3 gap-x-4 border-y border-black py-2 mt-2">
                <div className="font-bold">
                    <p>TOTAL PAGO NA PARCELA:</p>
                    <p>{formatCurrency(totalPaidOnInstallment)}</p>
                </div>
                <div className="flex-grow">
                    {!isPaid && (
                        <div className="font-bold text-red-600">
                            <p>SALDO PENDENTE DA PARCELA:</p>
                            <p>{formatCurrency(remainingBalance)}</p>
                        </div>
                    )}
                </div>
                <div className="text-right flex flex-col justify-center items-end">
                    {isPaid && (
                        <div className="relative">
                            <div className="border-4 border-blue-500 rounded-md px-4 py-1 transform -rotate-12">
                                <p className="text-xl font-black text-blue-500 tracking-wider">PAGO</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="flex justify-center items-end flex-col mt-4">
                <p>{settings.storeCity}, {format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
            </div>

            <div className="flex justify-between items-center mt-8 border-t border-black pt-1">
                <p>{[settings.storeCity, order.customer.state].filter(Boolean).join('/')}</p>
                <p className="font-bold">Via {via}</p>
                <p>Data da Compra: {format(parseISO(order.date), "dd/MM/yyyy 'às' HH:mm")}</p>
            </div>
        </div>
    );
};


export default function SingleInstallmentPage() {
  const params = useParams();
  const router = useRouter();
  const [settings, setSettings] = useState<StoreSettings>(initialSettings);
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const receiptRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

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


  const installment = useMemo(() => {
    if (!order || !params.installmentNumber) {
        return null;
    }
    const installmentNum = parseInt(params.installmentNumber as string, 10);
    if (isNaN(installmentNum)) {
        return null;
    }
    return order.installmentDetails?.find(i => i.installmentNumber === installmentNum) || null;
  }, [order, params.installmentNumber]);

  const remainingBalance = useMemo(() => {
    if (!installment) return 0;
    if (installment.status === 'Pago') return 0;
    const paid = Number(installment.paidAmount) || 0;
    const amount = Number(installment.amount) || 0;
    return Math.max(0, amount - paid);
  }, [installment]);


  const handleGeneratePdfAndSend = async () => {
    const input = receiptRef.current;
    if (!input || !order || !installment) return;
    
    // Temporarily apply a class to the body for print-specific styles
    document.body.classList.add('print-receipt');
    
    const canvas = await html2canvas(input, {
        scale: 2.5, 
        useCORS: true,
        backgroundColor: '#ffffff'
    });

    // Remove the class after rendering
    document.body.classList.remove('print-receipt');

    const imgData = canvas.toDataURL('image/png');
    
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    const ratio = canvasWidth / canvasHeight;
    let imgWidth = pdfWidth - 20; // with margins
    let imgHeight = imgWidth / ratio;
    
    if(imgHeight > pdfHeight - 20) {
        imgHeight = pdfHeight - 20;
        imgWidth = imgHeight * ratio;
    }

    const x = (pdfWidth - imgWidth) / 2;
    const y = (pdfHeight - imgHeight) / 2;

    pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
    pdf.save(`comprovante-${order.id}-${installment.installmentNumber}.pdf`);

    const customerName = order.customer.name.split(' ')[0];
    const phone = order.customer.phone.replace(/\D/g, '');
    const message = `Olá ${customerName}, segue o extrato atualizado da sua parcela nº ${installment.installmentNumber} (pedido ${order.id}).\n\nObrigado!\n*${settings.storeName}*`;
    
    const webUrl = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
    window.open(webUrl, '_blank');

    toast({
        title: "Passo 1/2: PDF Gerado!",
        description: "Seu PDF foi baixado. Agora, anexe o arquivo na conversa do WhatsApp que abriu.",
        duration: 10000
    });
  };

  if (isLoading) {
    return <div className="p-8 text-center">Carregando parcela...</div>;
  }

  if (!order || !installment) {
    return (
      <div className="container mx-auto py-24 text-center">
        <h1 className="text-2xl font-bold">Parcela não encontrada</h1>
      </div>
    );
  }

  return (
    <div className="bg-muted/30 print:bg-white">
      <div className="container mx-auto py-8 print:p-0">
        <header className="flex flex-col sm:flex-row justify-between items-center mb-8 print-hidden gap-4">
           <Button variant="ghost" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
            </Button>
          <div className="text-center">
             <h1 className="text-2xl font-bold">Extrato da Parcela</h1>
             <p className="text-muted-foreground">Pedido: {order.id} / Parcela: {installment.installmentNumber}</p>
          </div>
           <div className="flex gap-2">
            <Button onClick={handleGeneratePdfAndSend} className="pdf-hidden">
                <Send className="mr-2 h-4 w-4" />
                Gerar PDF e Abrir WhatsApp
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="pdf-hidden">
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
            </Button>
          </div>
        </header>

        <main ref={receiptRef} className="bg-white p-6 print:grid print:grid-cols-2 print:gap-8 print:p-0">
            <div className="print:border-r print:border-dashed print:border-black print:pr-4">
                <ReceiptContent order={order} installment={installment} settings={settings} via="Empresa" />
            </div>
            <div className="hidden print:block print:pl-4">
                <ReceiptContent order={order} installment={installment} settings={settings} via="Cliente" />
            </div>
        </main>
      </div>
    </div>
  );
}
