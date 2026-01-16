

'use client';

import { useState, useMemo, useEffect } from 'react';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useRouter } from 'next/navigation';
import type { Order } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Mail, Phone, MapPin, CreditCard, LogOut, FileText, CheckCircle, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Link from 'next/link';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export default function MyAccountPage() {
  const { customer, customerOrders, logout, isAuthenticated, isLoading } = useCustomerAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/area-cliente/login');
    }
  }, [isLoading, isAuthenticated, router]);
  
  const sortedCustomerOrders = useMemo(() => {
    if (!customerOrders) return [];
    return [...customerOrders]
      .filter(o => o.status !== 'Cancelado' && o.status !== 'Excluído')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [customerOrders]);

  const customerFinancials = useMemo(() => {
    if (!customer) {
      return { totalComprado: 0, totalPago: 0, saldoDevedor: 0 };
    }
    
    const totalComprado = sortedCustomerOrders.reduce((acc, order) => acc + order.total, 0);
    const totalPago = sortedCustomerOrders.reduce((sum, order) => {
      if (order.paymentMethod === 'Crediário') {
        const paid = (order.installmentDetails || []).reduce((s, inst) => s + (inst.paidAmount || 0), 0);
        return sum + paid;
      }
      if (order.paymentMethod === 'Dinheiro') {
        return sum + (order.total || 0);
      }
      if (order.paymentMethod === 'Pix') {
        const isLegacyPix = !order.asaas?.paymentId;
        const isPaid = isLegacyPix || !!order.asaas?.paidAt;
        return sum + (isPaid ? (order.total || 0) : 0);
      }
      return sum;
    }, 0);
    const saldoDevedor = totalComprado - totalPago;

    return { totalComprado, totalPago, saldoDevedor };
  }, [customer, sortedCustomerOrders]);

  const getStatusVariant = (status: Order['status']): 'secondary' | 'default' | 'outline' | 'destructive' => {
    switch (status) {
      case 'Processando': return 'secondary';
      case 'Enviado': return 'default';
      case 'Entregue': return 'outline';
      case 'Cancelado': return 'destructive';
      default: return 'secondary';
    }
  };

  if (isLoading || !customer) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <p>Carregando sua conta...</p>
      </div>
    );
  }

  return (
    <div className="bg-muted/30 min-h-screen">
        <div className="container mx-auto py-12 px-4">
            <header className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-headline">Minha Conta</h1>
                    <p className="text-muted-foreground">Olá, {customer.name.split(' ')[0]}! Bem-vindo(a) de volta.</p>
                </div>
                <div className="flex items-center gap-4">
                     <Button variant="outline" asChild>
                        <Link href="/">Ir para a Loja</Link>
                     </Button>
                     <Button variant="ghost" onClick={logout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Sair
                    </Button>
                </div>
            </header>

            <div className="grid lg:grid-cols-3 gap-8 items-start">
                {/* Coluna da Esquerda: Info + Financeiro */}
                <div className="lg:col-span-1 space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg"><User /> Suas Informações</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <p className="font-semibold">{customer.name}</p>
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Mail className="h-4 w-4" /> <span>{customer.email || 'Não informado'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Phone className="h-4 w-4" /> <span>{customer.phone}</span>
                            </div>
                            <div className="flex items-start gap-2 text-muted-foreground pt-2 border-t mt-3">
                                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p>{`${customer.address}, ${customer.number}`}</p>
                                    <p>{`${customer.neighborhood}, ${customer.city}/${customer.state}`}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                         <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg"><CreditCard/> Situação Financeira</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="flex justify-between items-center p-3 rounded-md bg-blue-500/10 text-blue-800">
                                <span className="font-medium">Total Comprado</span>
                                <span className="font-bold text-lg">{formatCurrency(customerFinancials.totalComprado)}</span>
                            </div>
                             <div className="flex justify-between items-center p-3 rounded-md bg-green-500/10 text-green-800">
                                <span className="font-medium">Total Pago</span>
                                <span className="font-bold text-lg">{formatCurrency(customerFinancials.totalPago)}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 rounded-md bg-amber-500/10 text-amber-800">
                                <span className="font-medium">Saldo Devedor</span>
                                <span className="font-bold text-lg">{formatCurrency(customerFinancials.saldoDevedor)}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Coluna da Direita: Pedidos */}
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Meus Pedidos</CardTitle>
                            <CardDescription>Acompanhe o status e os detalhes de suas compras.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {sortedCustomerOrders.length > 0 ? (
                                <Accordion type="single" collapsible className="w-full space-y-2">
                                    {sortedCustomerOrders.map(order => {
                                        const allInstallmentsPaid = (order.installmentDetails || []).every(inst => inst.status === 'Pago');
                                        const isLegacyPix = order.paymentMethod === 'Pix' && !order.asaas?.paymentId;
                                        const isPixPaid = order.paymentMethod === 'Pix' && (isLegacyPix || !!order.asaas?.paidAt);
                                        const isImmediatePaid = order.paymentMethod === 'Dinheiro' || isPixPaid;
                                        const isPaidOff = allInstallmentsPaid || isImmediatePaid;
                                        return (
                                            <AccordionItem value={order.id} key={order.id} className="border-b-0 rounded-lg border bg-background">
                                                <AccordionTrigger className="p-4 hover:no-underline rounded-t-lg data-[state=open]:bg-muted/50 data-[state=open]:rounded-b-none">
                                                    <div className="flex justify-between items-center w-full">
                                                        <div className="text-left">
                                                            <p className="font-bold">Pedido: <span className="font-mono">{order.id}</span></p>
                                                            <p className="text-sm text-muted-foreground">{format(parseISO(order.date), "dd/MM/yyyy", { locale: ptBR })}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="font-bold">{formatCurrency(order.total)}</p>
                                                            {isPaidOff ? (
                                                                <Badge className="bg-green-600 hover:bg-green-700">Quitado</Badge>
                                                            ) : (
                                                                <Badge variant={getStatusVariant(order.status)}>{order.status}</Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                </AccordionTrigger>
                                                <AccordionContent className="p-4 pt-0 space-y-4">
                                                    <div>
                                                        <h4 className="font-semibold mb-2">Produtos</h4>
                                                        <ul className="text-sm space-y-1 text-muted-foreground">
                                                            {order.items.map(item => (
                                                                <li key={item.id}>{item.quantity}x {item.name}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                    {(order.installmentDetails && order.installmentDetails.length > 0) ? (
                                                        <div>
                                                            <h4 className="font-semibold mb-2">Parcelas</h4>
                                                            <div className="space-y-2">
                                                                {order.installmentDetails.map(inst => {
                                                                    const remainingAmount = inst.amount - (inst.paidAmount || 0);
                                                                    const isPaid = inst.status === 'Pago';
                                                                    const isPartiallyPaid = inst.status === 'Pendente' && (inst.paidAmount || 0) > 0;
                                                                    return (
                                                                        <div key={inst.installmentNumber} className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                                                                            <div>
                                                                                <p className="font-medium">Parcela {inst.installmentNumber}</p>
                                                                                <p className="text-xs text-muted-foreground">Venc. {format(parseISO(inst.dueDate), "dd/MM/yy")}</p>
                                                                                {isPartiallyPaid && (
                                                                                     <p className="text-xs text-amber-600 font-semibold">{formatCurrency(remainingAmount)} pendente</p>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="font-semibold">{formatCurrency(inst.amount)}</span>
                                                                                {isPaid ? <CheckCircle className="h-4 w-4 text-green-600"/> : <Clock className="h-4 w-4 text-amber-600" />}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <p className="text-muted-foreground text-sm">Pedido pago via {order.paymentMethod}.</p>
                                                    )}
                                                    <div className="text-right mt-3">
                                                         <Button variant="outline" size="sm" asChild>
                                                            <Link href={`/carnet/${order.id}`} target="_blank" rel="noopener noreferrer">
                                                                <FileText className="mr-2 h-4 w-4" />
                                                                Ver Carnê Completo
                                                            </Link>
                                                        </Button>
                                                    </div>
                                                </AccordionContent>
                                            </AccordionItem>
                                        );
                                    })}
                                </Accordion>
                            ) : (
                                <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
                                    <h3 className="mt-4 text-lg font-semibold">Nenhum pedido encontrado</h3>
                                    <p className="mt-1 text-sm">Suas compras aparecerão aqui.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    </div>
  );
}
