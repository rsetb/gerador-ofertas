

'use client';

import { useMemo } from 'react';
import { useAdmin, useAdminData } from '@/context/AdminContext';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, PiggyBank, BadgePercent, Eye, Undo2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useAudit } from '@/context/AuditContext';


const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export default function MyCommissionsPage() {
  const { reverseCommissionPayment } = useAdmin();
  const { orders, commissionPayments, commissionSummary } = useAdminData();
  const { user } = useAuth();
  const { logAction } = useAudit();

  const isAdmin = user?.role === 'admin';
  const currentMonthKey = format(new Date(), 'yyyy-MM');

  const getMonthKey = (isoDate: string) => {
    try {
      return format(parseISO(isoDate), 'yyyy-MM');
    } catch {
      return null;
    }
  };
  
  const pendingCommissions = useMemo(() => {
    if (!user || !orders) return [];
    
    let userOrders = orders.filter(o => {
      const isPending = o.status === 'Entregue' && typeof o.commission === 'number' && o.commission > 0 && !o.commissionPaid;
      if (!isPending) return false;
      if (getMonthKey(o.date) !== currentMonthKey) return false;
      if (isAdmin) return true;
      return o.sellerId === user.id;
    });
    return userOrders.sort((a, b) => {
      const aTime = parseISO(a.date).getTime();
      const bTime = parseISO(b.date).getTime();
      return bTime - aTime;
    });
  }, [orders, user, isAdmin, currentMonthKey]);

  const totalPending = pendingCommissions.reduce((acc, order) => acc + (order.commission || 0), 0);

  const myPaidCommissions = useMemo(() => {
    if (!user || !commissionPayments) return [];
    return commissionPayments
      .filter(p => p.sellerId === user.id)
      .filter(p => getMonthKey(p.paymentDate) === currentMonthKey)
      .sort((a,b) => parseISO(b.paymentDate).getTime() - parseISO(a.paymentDate).getTime());
  }, [commissionPayments, user, currentMonthKey]);

  const paidTotal = myPaidCommissions.reduce((acc, p) => acc + p.amount, 0);

  const commissionsBySellerThisMonth = useMemo(() => {
    if (!isAdmin) return [];
    const bySeller = new Map<string, { id: string; name: string; total: number; count: number }>();
    pendingCommissions.forEach((order) => {
      const sellerId = order.sellerId || 'unknown';
      const sellerName = order.sellerName || 'Vendedor Desconhecido';
      const current = bySeller.get(sellerId) || { id: sellerId, name: sellerName, total: 0, count: 0 };
      current.total += order.commission || 0;
      current.count += 1;
      bySeller.set(sellerId, current);
    });
    return Array.from(bySeller.values())
      .filter((s) => s.count > 0)
      .sort((a, b) => b.total - a.total);
  }, [isAdmin, pendingCommissions]);

  const allPaymentsThisMonth = useMemo(() => {
    if (!commissionPayments) return [];
    return commissionPayments
      .filter((p) => getMonthKey(p.paymentDate) === currentMonthKey)
      .sort((a, b) => parseISO(b.paymentDate).getTime() - parseISO(a.paymentDate).getTime());
  }, [commissionPayments, currentMonthKey]);

  const paidTotalForCards = isAdmin
    ? allPaymentsThisMonth.reduce((acc, p) => acc + p.amount, 0)
    : paidTotal;

  const paidCountForCards = isAdmin ? allPaymentsThisMonth.length : myPaidCommissions.length;


  if (!user) {
    return <p>Carregando...</p>;
  }


  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BadgePercent className="h-6 w-6" />
            Minhas Comissões
          </CardTitle>
          <CardDescription>
            Acompanhe suas comissões a receber e o histórico de pagamentos.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="grid gap-4 md:grid-cols-2 mb-8">
                <Card className="bg-amber-500/10 border-amber-500/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{isAdmin ? 'Comissão Pendente (Equipe)' : 'Saldo a Receber'}</CardTitle>
                        <DollarSign className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600">{formatCurrency(totalPending)}</div>
                        <p className="text-xs text-muted-foreground">{isAdmin ? `Comissões pendentes de ${pendingCommissions.length} vendas (mês atual).` : `Comissões de ${pendingCommissions.length} vendas entregues.`}</p>
                    </CardContent>
                </Card>
                <Card className="bg-green-500/10 border-green-500/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{isAdmin ? 'Comissão Paga no Mês (Equipe)' : 'Total Já Recebido'}</CardTitle>
                        <PiggyBank className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{formatCurrency(paidTotalForCards)}</div>
                        <p className="text-xs text-muted-foreground">Total de {paidCountForCards} pagamentos no mês.</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="pending">
                <TabsList>
                    <TabsTrigger value="pending">Comissões Pendentes</TabsTrigger>
                    <TabsTrigger value="history">Meus Pagamentos</TabsTrigger>
                    {isAdmin && <TabsTrigger value="by_seller">Por Vendedor</TabsTrigger>}
                    {isAdmin && <TabsTrigger value="all_history">Histórico Geral</TabsTrigger>}
                </TabsList>
                <TabsContent value="pending" className="mt-4">
                     <Card>
                        <CardHeader>
                            <CardTitle>{isAdmin ? 'Comissões Pendentes (Todos os Vendedores)' : 'Minhas Comissões a Receber'}</CardTitle>
                            <CardDescription>{isAdmin ? 'Lista de todas as vendas concluídas de todos os vendedores, cuja comissão ainda não foi paga.' : 'Esta é a lista de todas as suas vendas concluídas cuja comissão ainda não foi paga.'}</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Data da Venda</TableHead>
                                            {isAdmin && <TableHead>Vendedor</TableHead>}
                                            <TableHead>Pedido ID</TableHead>
                                            <TableHead>Cliente</TableHead>
                                            <TableHead className="text-right">Valor da Comissão</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pendingCommissions.length > 0 ? (
                                            pendingCommissions.map(order => (
                                                <TableRow key={order.id}>
                                                    <TableCell>{format(parseISO(order.date), "dd/MM/yyyy")}</TableCell>
                                                    {isAdmin && <TableCell>{order.sellerName}</TableCell>}
                                                    <TableCell className="font-mono">{order.id}</TableCell>
                                                    <TableCell>{order.customer.name}</TableCell>
                                                    <TableCell className="text-right font-semibold">{formatCurrency(order.commission || 0)}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={isAdmin ? 5 : 4} className="h-24 text-center">
                                                  {isAdmin ? 'Nenhuma comissão pendente para a equipe.' : 'Você não tem comissões pendentes.'}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                     </Card>
                </TabsContent>
                {isAdmin && (
                    <TabsContent value="by_seller" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Comissões Pendentes por Vendedor</CardTitle>
                                <CardDescription>Total de comissão pendente e quantidade de vendas por vendedor (mês atual).</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Vendedor</TableHead>
                                                <TableHead className="text-center">Nº de Vendas</TableHead>
                                                <TableHead className="text-right">Comissão Total</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {commissionsBySellerThisMonth.length > 0 ? (
                                                commissionsBySellerThisMonth.map((seller) => (
                                                    <TableRow key={seller.id}>
                                                        <TableCell className="font-medium">{seller.name}</TableCell>
                                                        <TableCell className="text-center">{seller.count}</TableCell>
                                                        <TableCell className="text-right font-semibold">{formatCurrency(seller.total)}</TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={3} className="h-24 text-center">Nenhuma comissão pendente para a equipe.</TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}
                <TabsContent value="history" className="mt-4">
                     <Card>
                        <CardHeader>
                            <CardTitle>Meus Pagamentos Recebidos</CardTitle>
                             <CardDescription>Pagamentos de comissão recebidos no mês atual.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Data do Pagamento</TableHead>
                                            <TableHead>Período</TableHead>
                                            <TableHead className="text-right">Valor Recebido</TableHead>
                                            <TableHead className="text-right">Ação</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {myPaidCommissions.length > 0 ? (
                                            myPaidCommissions.map(payment => (
                                                <TableRow key={payment.id}>
                                                    <TableCell>{format(parseISO(payment.paymentDate), "dd/MM/yyyy")}</TableCell>
                                                    <TableCell className="capitalize">{payment.period}</TableCell>
                                                    <TableCell className="text-right font-semibold">{formatCurrency(payment.amount)}</TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Button variant="outline" size="sm" asChild>
                                                                <Link href={`/admin/comprovante-comissao/${payment.id}`}>
                                                                    <Eye className="mr-2 h-4 w-4" />
                                                                    Ver Comprovante
                                                                </Link>
                                                            </Button>
                                                             {isAdmin && (
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button variant="destructive" outline size="sm">
                                                                            <Undo2 className="mr-2 h-4 w-4" />
                                                                            Estornar
                                                                        </Button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle>Confirmar Estorno?</AlertDialogTitle>
                                                                            <AlertDialogDescription>
                                                                                Esta ação não pode ser desfeita. O pagamento será excluído e as comissões dos pedidos voltarão a ficar pendentes.
                                                                            </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                            <AlertDialogAction onClick={() => reverseCommissionPayment(payment.id, logAction, user)}>
                                                                                Sim, estornar
                                                                            </AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center">Nenhum pagamento recebido neste mês.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                     </Card>
                </TabsContent>
                {isAdmin && (
                    <TabsContent value="all_history" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Histórico Geral de Pagamentos</CardTitle>
                                <CardDescription>Pagamentos de comissão de todos os vendedores no mês atual.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Data</TableHead>
                                                <TableHead>Vendedor</TableHead>
                                                <TableHead>Período</TableHead>
                                                <TableHead className="text-right">Valor</TableHead>
                                                <TableHead className="text-right">Ação</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {allPaymentsThisMonth.length > 0 ? (
                                                allPaymentsThisMonth.map(payment => (
                                                    <TableRow key={payment.id}>
                                                        <TableCell>{format(parseISO(payment.paymentDate), "dd/MM/yyyy")}</TableCell>
                                                        <TableCell>{payment.sellerName}</TableCell>
                                                        <TableCell className="capitalize">{payment.period}</TableCell>
                                                        <TableCell className="text-right font-semibold">{formatCurrency(payment.amount)}</TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-2">
                                                                <Button variant="outline" size="sm" asChild>
                                                                    <Link href={`/admin/comprovante-comissao/${payment.id}`}>
                                                                        <Eye className="mr-2 h-4 w-4" />
                                                                        Ver Comprovante
                                                                    </Link>
                                                                </Button>
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button variant="destructive" outline size="sm">
                                                                            <Undo2 className="mr-2 h-4 w-4" />
                                                                            Estornar
                                                                        </Button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle>Confirmar Estorno?</AlertDialogTitle>
                                                                            <AlertDialogDescription>
                                                                                Esta ação não pode ser desfeita. O pagamento será excluído e as comissões dos pedidos voltarão a ficar pendentes.
                                                                            </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                            <AlertDialogAction onClick={() => reverseCommissionPayment(payment.id, logAction, user)}>
                                                                                Sim, estornar
                                                                            </AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-24 text-center">Nenhum pagamento foi realizado ainda.</TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}
            </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

    
