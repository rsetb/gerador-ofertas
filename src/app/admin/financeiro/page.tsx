

'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAdmin, useAdminData } from '@/context/AdminContext';
import type { Order, User } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { ChartContainer, ChartTooltipContent, ChartTooltip } from '@/components/ui/chart';
import { DollarSign, CheckCircle, Clock, Percent, Award, FileText, TrendingUp, Eye, Printer, TrendingDown, ShoppingCart, Users as UsersIcon } from 'lucide-react';
import { format, isValid, parse, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import Logo from '@/components/Logo';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { useAudit } from '@/context/AuditContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const parseFlexibleDate = (value: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const isoParsed = parseISO(trimmed);
  if (isValid(isoParsed)) return isoParsed;

  const patterns = [
    'dd/MM/yy HH:mm:ss',
    'dd/MM/yyyy HH:mm:ss',
    'dd/MM/yy HH:mm',
    'dd/MM/yyyy HH:mm',
    'dd/MM/yy',
    'dd/MM/yyyy',
  ];

  for (const pattern of patterns) {
    const parsed = parse(trimmed, pattern, new Date());
    if (isValid(parsed)) return parsed;
  }

  const fallback = new Date(trimmed);
  return isValid(fallback) ? fallback : null;
};

const formatOrderProducts = (items: Order['items']) => {
  return items.map((item) => `${item.quantity}x ${item.name}`).join(', ');
};

type SellerCommissionDetails = {
    id: string;
    name: string;
    total: number;
    count: number;
    orderIds: string[];
};

type SellerPerformanceDetails = {
    id: string;
    name: string;
    salesCount: number;
    totalSold: number;
    totalCommission: number;
    orders: Order[];
}

const meses = [
    { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' }, { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' }, { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' }, { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' }, { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
];

export default function FinanceiroPage() {
  const { payCommissions } = useAdmin();
  const { orders, financialSummary, commissionSummary } = useAdminData();
  const { settings } = useSettings();
  const { user, users } = useAuth();
  const { logAction } = useAudit();
  const router = useRouter();
  const isManager = user?.role === 'gerente';
  const [mesSelecionado, setMesSelecionado] = useState(() => format(new Date(), 'MM'));
  const [anoSelecionado, setAnoSelecionado] = useState(() => format(new Date(), 'yyyy'));
  const [isCommissionDetailModalOpen, setIsCommissionDetailModalOpen] = useState(false);
  const [selectedCommissionSeller, setSelectedCommissionSeller] = useState<SellerCommissionDetails | null>(null);
  const [isPerformanceDetailModalOpen, setIsPerformanceDetailModalOpen] = useState(false);
  const [selectedPerformanceSeller, setSelectedPerformanceSeller] = useState<SellerPerformanceDetails | null>(null);
  const [printTitle, setPrintTitle] = useState('');
  
  const deliveredOrders = useMemo(() => {
    if (!orders) return [];
    return orders
      .filter((o) => o.status === 'Entregue')
      .sort((a, b) => {
        const timeA = parseFlexibleDate(a.date)?.getTime() ?? 0;
        const timeB = parseFlexibleDate(b.date)?.getTime() ?? 0;
        return timeB - timeA;
      });
  }, [orders]);

  const anosDisponiveis = useMemo(() => {
    if (!orders) return [anoSelecionado];
    const years = new Set<string>();
    orders.forEach((o) => {
      const date = parseFlexibleDate(o.date);
      if (date) {
        years.add(format(date, 'yyyy'));
      }
    });
    const sorted = Array.from(years).sort((a, b) => Number(b) - Number(a));
    return sorted.length > 0 ? sorted : [anoSelecionado];
  }, [orders, anoSelecionado]);

  useEffect(() => {
    if (!anosDisponiveis.includes(anoSelecionado)) {
      setAnoSelecionado(anosDisponiveis[0]);
    }
  }, [anosDisponiveis, anoSelecionado]);

  const ordersDoPeriodo = useMemo(() => {
    if (!orders) return [];
    return orders.filter((o) => {
      const date = parseFlexibleDate(o.date);
      if (!date) return false;
      return format(date, 'MM') === mesSelecionado && format(date, 'yyyy') === anoSelecionado;
    });
  }, [orders, mesSelecionado, anoSelecionado]);

  const rotuloPeriodo = useMemo(() => {
    const monthLabel = meses.find(m => m.value === mesSelecionado)?.label ?? mesSelecionado;
    return `${monthLabel}/${anoSelecionado}`;
  }, [mesSelecionado, anoSelecionado]);

  const sellerPerformance = useMemo(() => {
    if (!users) return [];

    const performanceMap = new Map<string, SellerPerformanceDetails>();

    users.forEach(seller => {
        if(seller.role === 'vendedor' || seller.role === 'gerente' || seller.role === 'admin') {
            performanceMap.set(seller.id, { id: seller.id, name: seller.name, salesCount: 0, totalSold: 0, totalCommission: 0, orders: [] });
        }
    });

    ordersDoPeriodo.forEach(order => {
        if (order.sellerId && performanceMap.has(order.sellerId) && order.status !== 'Cancelado' && order.status !== 'Excluído') {
            const sellerData = performanceMap.get(order.sellerId)!;
            sellerData.salesCount += 1;
            sellerData.totalSold += order.total;
            sellerData.totalCommission += order.commission || 0;
            sellerData.orders.push(order);
            performanceMap.set(order.sellerId, sellerData);
        }
    });

    return Array.from(performanceMap.values())
      .sort((a, b) => {
        if (b.totalSold !== a.totalSold) return b.totalSold - a.totalSold;
        return a.name.localeCompare(b.name);
      });
  }, [ordersDoPeriodo, users]);

  const sellerPerformanceWithCommission = useMemo(() => {
    return sellerPerformance.filter((s) => s.salesCount > 0 && s.totalCommission > 0);
  }, [sellerPerformance]);


  const handlePayCommission = async (seller: SellerCommissionDetails) => {
      const period = format(new Date(), 'MMMM/yyyy', { locale: ptBR });
      const paymentId = await payCommissions(seller.id, seller.name, seller.total, seller.orderIds, period, logAction, user);
      if (paymentId) {
          router.push(`/admin/comprovante-comissao/${paymentId}`);
      }
  };
  
  const handleOpenCommissionDetails = (seller: SellerCommissionDetails) => {
    setSelectedCommissionSeller(seller);
    setIsCommissionDetailModalOpen(true);
  };
  
  const ordersForSelectedCommissionSeller = useMemo(() => {
    if (!selectedCommissionSeller) return [];
    return orders.filter(o => selectedCommissionSeller.orderIds.includes(o.id));
  }, [selectedCommissionSeller, orders]);
  
  const handleOpenPerformanceDetails = (seller: SellerPerformanceDetails) => {
    setSelectedPerformanceSeller(seller);
    setIsPerformanceDetailModalOpen(true);
  };

  const handlePrint = (type: 'sales' | 'profits' | 'commissions' | 'sellers' | 'all') => {
    if (isManager && type !== 'sellers') {
      return;
    }
    let title = 'Relatório Financeiro';
    
    document.body.classList.remove('print-sales-only', 'print-profits-only', 'print-commissions-only', 'print-sellers-only');
    
    if (type === 'sales') {
        title = 'Relatório de Vendas';
        document.body.classList.add('print-sales-only');
    } else if (type === 'profits') {
        title = 'Relatório de Lucros';
        document.body.classList.add('print-profits-only');
    } else if (type === 'commissions') {
        title = 'Relatório de Comissões';
        document.body.classList.add('print-commissions-only');
    } else if (type === 'sellers') {
        title = `Relatório de Vendas e Comissões por Vendedor - ${rotuloPeriodo}`;
        document.body.classList.add('print-sellers-only');
    }
    
    setPrintTitle(title);

    setTimeout(() => {
        window.print();
        document.body.className = '';
    }, 100);
  };

  const handlePrintSingleSeller = () => {
    if (!selectedPerformanceSeller) return;
    const printContents = document.getElementById('seller-report-modal-content')?.innerHTML;
    const originalContents = document.body.innerHTML;
    
    const header = `
      <div style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 1rem; border-bottom: 1px solid #ccc;">
        <div>
          <h1 style="font-size: 1.5rem; font-weight: bold;">Relatório de Vendas e Comissões - ${selectedPerformanceSeller.name}</h1>
          <p style="font-size: 0.9rem; color: #666;">Período: ${rotuloPeriodo}</p>
          <p style="font-size: 0.9rem; color: #666;">Gerado em: ${new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      </div>
    `;

    document.body.innerHTML = `<div class="print-container">${header}${printContents}</div>`;
    window.print();
    document.body.innerHTML = originalContents;
    window.location.reload(); // To re-attach React event listeners
  }

  
  const chartConfig = {
      total: {
        label: 'Vendas',
        color: 'hsl(var(--primary))',
      },
    };

  const sellerPerformanceCard = (
    <Card id="seller-performance-card">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><UsersIcon className="h-5 w-5" /> Vendas e Comissão por Vendedor</CardTitle>
            <CardDescription>
              Resumo por mês, com total vendido e comissão gerada. Período: <span className="font-medium">{rotuloPeriodo}</span>
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
              <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                {meses.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={anoSelecionado} onValueChange={setAnoSelecionado}>
              <SelectTrigger className="w-full sm:w-[120px]">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {anosDisponiveis.map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => handlePrint('sellers')}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir Relatório
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-center">Vendas</TableHead>
                <TableHead className="text-right">Total Vendido</TableHead>
                <TableHead className="text-right">Comissão Gerada</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sellerPerformanceWithCommission.length > 0 ? (
                sellerPerformanceWithCommission.map(seller => (
                  <TableRow key={seller.id}>
                    <TableCell className="font-medium">{seller.name}</TableCell>
                    <TableCell className="text-center">{seller.salesCount}</TableCell>
                    <TableCell className="text-right">{formatCurrency(seller.totalSold)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(seller.totalCommission)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenPerformanceDetails(seller)}
                      >
                        <Eye className="mr-2 h-4 w-4" /> Ver Vendas
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">Nenhuma venda com comissão registrada no período.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  const printSellersSection = (
    <div className={`print-section print-section-sellers mt-8${isManager ? '' : ' page-break-before'}`}>
      <h2 className="text-xl font-semibold text-center mb-4">Desempenho dos Vendedores</h2>
      {sellerPerformanceWithCommission.length > 0 ? (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2">
              <th className="text-left p-2 font-bold">Vendedor</th>
              <th className="text-center p-2 font-bold">Vendas</th>
              <th className="text-right p-2 font-bold">Total Vendido</th>
              <th className="text-right p-2 font-bold">Comissão Gerada</th>
            </tr>
          </thead>
          <tbody>
            {sellerPerformanceWithCommission.map(seller => (
              <tr key={seller.id} className="border-b last:border-none">
                <td className="p-2">{seller.name}</td>
                <td className="text-center p-2">{seller.salesCount}</td>
                <td className="text-right p-2">{formatCurrency(seller.totalSold)}</td>
                <td className="text-right p-2 font-semibold">{formatCurrency(seller.totalCommission)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-center text-sm text-muted-foreground">Nenhuma venda com comissão registrada no período.</p>
      )}
    </div>
  );

  return (
    <div className='space-y-8'>
      <div className="print-hidden">
        {isManager ? (
          sellerPerformanceCard
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Relatório Financeiro</CardTitle>
                <CardDescription>Resumo de vendas, lucros e comissões. Use os botões para imprimir seções específicas.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button onClick={() => handlePrint('all')}>
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimir Relatório Completo
                </Button>
                <Button variant="outline" onClick={() => handlePrint('sales')}>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Apenas Vendas
                </Button>
                <Button variant="outline" onClick={() => handlePrint('sellers')}>
                  <UsersIcon className="mr-2 h-4 w-4" />
                  Vendas por Vendedor
                </Button>
                <Button variant="outline" onClick={() => handlePrint('profits')}>
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Apenas Lucros
                </Button>
                <Button variant="outline" onClick={() => handlePrint('commissions')}>
                  <Award className="mr-2 h-4 w-4" />
                  Apenas Comissões
                </Button>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Vendas do Mês</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(financialSummary.totalVendido)}</div>
                  <p className="text-xs text-muted-foreground">Somente pedidos do mês atual</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Lucro Bruto</CardTitle>
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(financialSummary.lucroBruto)}</div>
                  <p className="text-xs text-muted-foreground">Receita total - Custo dos produtos</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Contas a Receber</CardTitle>
                  <Clock className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(financialSummary.totalPendente)}</div>
                  <p className="text-xs text-muted-foreground">Soma de todas as parcelas pendentes</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Comissões a Pagar</CardTitle>
                  <Percent className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(commissionSummary.totalPendingCommission)}</div>
                  <p className="text-xs text-muted-foreground">Soma das comissões pendentes</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Vendas Mensais</CardTitle>
                </CardHeader>
                <CardContent className="pl-2">
                  <ChartContainer config={chartConfig} className="h-[350px] w-full">
                    <ResponsiveContainer>
                      <BarChart data={financialSummary.monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                          dataKey="name"
                          tickLine={false}
                          tickMargin={10}
                          axisLine={false}
                          className="capitalize"
                        />
                        <YAxis
                          tickFormatter={(value) => formatCurrency(value as number)}
                          tickLine={false}
                          axisLine={false}
                          width={100}
                        />
                        <ChartTooltip
                          cursor={false}
                          content={<ChartTooltipContent
                            formatter={(value) => formatCurrency(value as number)}
                          />}
                        />
                        <Legend />
                        <Bar dataKey="total" fill="var(--color-total)" radius={4} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
              {sellerPerformanceCard}
            </div>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2"><Award className="h-5 w-5" /> Comissões a Pagar</CardTitle>
                  <CardDescription>Total de comissões pendentes para cada vendedor (apenas de pedidos entregues).</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendedor</TableHead>
                        <TableHead className="text-center">Nº de Vendas</TableHead>
                        <TableHead className="text-right">Comissão Total</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {commissionSummary.commissionsBySeller.length > 0 ? (
                        commissionSummary.commissionsBySeller.map(seller => (
                          <TableRow key={seller.id}>
                            <TableCell className="font-medium">{seller.name}</TableCell>
                            <TableCell className="text-center">{seller.count}</TableCell>
                            <TableCell className="text-right font-semibold">{formatCurrency(seller.total)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenCommissionDetails(seller)}>
                                  <Eye className="h-4 w-4" />
                                  <span className="sr-only">Ver detalhes</span>
                                </Button>
                                <Button size="sm" onClick={() => handlePayCommission(seller)}>
                                  <DollarSign className="mr-2 h-4 w-4" />
                                  Pagar
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="h-24 text-center">
                            Nenhuma comissão pendente de pagamento.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

       {/* Print-only view */}
      <div className="hidden print-only">
        <div className="mb-8">
            <div className="flex justify-between items-start pb-4 border-b">
                <div>
                    <div className="text-xs">
                        <p className="font-bold">{settings.storeName}</p>
                        <p className="whitespace-pre-line">{settings.storeAddress}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-sm text-gray-500">{new Date().toLocaleDateString('pt-BR')}</p>
                    <p className="text-lg font-bold">{printTitle}</p>
                </div>
            </div>
        </div>
        
        {isManager ? (
          printSellersSection
        ) : (
          <>
            <div className="print-section print-section-profits print-section-sales space-y-6">
              <h2 className="text-xl font-semibold text-center">Resumo Financeiro</h2>
              <table className="w-full text-base border-collapse">
                <tbody>
                  <tr className="border-b">
                    <td className="p-2 font-medium">Vendas do Mês</td>
                    <td className="p-2 text-right font-bold">{formatCurrency(financialSummary.totalVendido)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">Lucro Bruto</td>
                    <td className="p-2 text-right font-bold">{formatCurrency(financialSummary.lucroBruto)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">Contas a Receber</td>
                    <td className="p-2 text-right font-bold">{formatCurrency(financialSummary.totalPendente)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">Comissões a Pagar</td>
                    <td className="p-2 text-right font-bold">{formatCurrency(commissionSummary.totalPendingCommission)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="print-section print-section-sales mt-8">
              <h2 className="text-xl font-semibold text-center mb-4">Vendas Mensais</h2>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2">
                    <th className="text-left p-2 font-bold">Mês/Ano</th>
                    <th className="text-left p-2 font-bold">Total Vendido</th>
                  </tr>
                </thead>
                <tbody>
                  {financialSummary.monthlyData.map(item => (
                    <tr key={item.name} className="border-b last:border-none">
                      <td className="p-2 capitalize">{item.name}</td>
                      <td className="p-2 text-right font-semibold">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-8">
                <h2 className="text-xl font-semibold text-center mb-4">Relatório de Vendas Entregues</h2>
                {deliveredOrders.length > 0 ? (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b-2">
                        <th className="text-left p-2 font-bold">Data</th>
                        <th className="text-left p-2 font-bold">Pedido</th>
                        <th className="text-left p-2 font-bold">Cliente</th>
                        <th className="text-left p-2 font-bold">Vendedor</th>
                        <th className="text-left p-2 font-bold">Valor</th>
                        <th className="text-left p-2 font-bold">Comissão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveredOrders.map(order => (
                        <tr key={order.id} className="border-b last:border-none">
                          <td className="p-2">
                            {(() => {
                              const date = parseFlexibleDate(order.date);
                              return date ? format(date, 'dd/MM/yy') : order.date;
                            })()}
                          </td>
                          <td className="p-2 font-mono">{order.id}</td>
                          <td className="p-2">{order.customer.name}</td>
                          <td className="p-2">{order.sellerName}</td>
                          <td className="p-2 text-right">{formatCurrency(order.total)}</td>
                          <td className="p-2 text-right font-semibold">{formatCurrency(order.commission || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <ShoppingCart className="mx-auto h-8 w-8" />
                    <p className="mt-2">Nenhuma venda entregue no período.</p>
                  </div>
                )}
              </div>

            </div>

            {printSellersSection}

            <div className="print-section print-section-commissions mt-8">
              <h2 className="text-xl font-semibold text-center mb-4">Comissões a Pagar</h2>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2">
                    <th className="text-left p-2 font-bold">Vendedor</th>
                    <th className="text-left p-2 font-bold">Nº de Vendas</th>
                    <th className="text-left p-2 font-bold">Comissão Total</th>
                  </tr>
                </thead>
                <tbody>
                  {commissionSummary.commissionsBySeller.length > 0 ? (
                    commissionSummary.commissionsBySeller.map(seller => (
                      <tr key={seller.id} className="border-b last:border-none">
                        <td className="p-2">{seller.name}</td>
                        <td className="text-center p-2">{seller.count}</td>
                        <td className="text-right p-2 font-semibold">{formatCurrency(seller.total)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="h-24 text-center text-gray-500">
                        Nenhuma comissão pendente de pagamento.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    
    {!isManager && (
      <Dialog open={isCommissionDetailModalOpen} onOpenChange={setIsCommissionDetailModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Vendas Pendentes de Comissão</DialogTitle>
            <DialogDescription>
              Lista de vendas para o vendedor <span className="font-bold">{selectedCommissionSeller?.name}</span> que compõem o total da comissão.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Valor Pedido</TableHead>
                  <TableHead className="text-right">Valor Comissão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordersForSelectedCommissionSeller.length > 0 ? (
                  ordersForSelectedCommissionSeller.map(order => (
                    <TableRow key={order.id}>
                      <TableCell>
                        {(() => {
                          const date = parseFlexibleDate(order.date);
                          return date ? format(date, 'dd/MM/yy') : order.date;
                        })()}
                      </TableCell>
                      <TableCell className="font-mono">{order.id}</TableCell>
                      <TableCell>{order.customer.name}</TableCell>
                      <TableCell className="text-right">{formatCurrency(order.total)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(order.commission || 0)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">Nenhum pedido encontrado.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    )}
    
    <Dialog open={isPerformanceDetailModalOpen} onOpenChange={setIsPerformanceDetailModalOpen}>
        <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle>Relatório de Vendas - {selectedPerformanceSeller?.name}</DialogTitle>
                <DialogDescription>
                    Lista de vendas realizadas pelo vendedor no período selecionado.
                </DialogDescription>
            </DialogHeader>
            <div id="seller-report-modal-content">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    <div className="p-3 rounded-md border bg-muted/30">
                        <p className="text-xs text-muted-foreground">Total vendido</p>
                        <p className="text-lg font-bold">{formatCurrency(selectedPerformanceSeller?.totalSold ?? 0)}</p>
                    </div>
                    <div className="p-3 rounded-md border bg-muted/30">
                        <p className="text-xs text-muted-foreground">Comissão gerada</p>
                        <p className="text-lg font-bold">{formatCurrency(selectedPerformanceSeller?.totalCommission ?? 0)}</p>
                    </div>
                </div>
                <div className="hidden print-only space-y-1 text-sm">
                    <div className="font-semibold border-b pb-1">
                        Data | Pedido | Cliente | Produtos | Valor | Comissão
                    </div>
                    {(selectedPerformanceSeller?.orders.length ?? 0) > 0 ? (
                        selectedPerformanceSeller?.orders.map(order => (
                            <div key={order.id} className="border-b py-1">
                                {(() => {
                                  const date = parseFlexibleDate(order.date);
                                  return date ? format(date, 'dd/MM/yy') : order.date;
                                })()} | {order.id} | {order.customer.name} | {formatOrderProducts(order.items)} | {formatCurrency(order.total)} | {formatCurrency(order.commission || 0)}
                            </div>
                        ))
                    ) : (
                        <div className="py-4 text-center text-muted-foreground">
                            Nenhuma venda encontrada para este vendedor.
                        </div>
                    )}
                </div>
                <div className="rounded-md border max-h-[60vh] overflow-y-auto print-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Pedido</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Produtos</TableHead>
                                <TableHead className="text-right">Valor da Venda</TableHead>
                                <TableHead className="text-right">Comissão</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(selectedPerformanceSeller?.orders.length ?? 0) > 0 ? (
                                selectedPerformanceSeller?.orders.map(order => (
                                    <TableRow key={order.id}>
                                        <TableCell>
                                          {(() => {
                                            const date = parseFlexibleDate(order.date);
                                            return date ? format(date, 'dd/MM/yy') : order.date;
                                          })()}
                                        </TableCell>
                                        <TableCell className="font-mono">{order.id}</TableCell>
                                        <TableCell>{order.customer.name}</TableCell>
                                        <TableCell className="max-w-[260px] truncate" title={formatOrderProducts(order.items)}>
                                          {formatOrderProducts(order.items)}
                                        </TableCell>
                                        <TableCell className="text-right font-semibold">{formatCurrency(order.total)}</TableCell>
                                        <TableCell className="text-right font-semibold">{formatCurrency(order.commission || 0)}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">Nenhuma venda encontrada para este vendedor.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
            <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setIsPerformanceDetailModalOpen(false)}>Fechar</Button>
                <Button onClick={handlePrintSingleSeller}>
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimir
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    </div>
  );
}
