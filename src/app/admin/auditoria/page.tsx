

'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAdmin } from '@/context/AdminContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Boxes, Printer, Save } from 'lucide-react';
import type { Product, StockAudit } from '@/lib/types';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { useSettings } from '@/context/SettingsContext';
import { useData } from '@/context/DataContext';
import { useAdminData } from '@/context/AdminContext';
import { useAudit } from '@/context/AuditContext';


type StockCount = {
    [productId: string]: number | null;
};

const meses = [
    { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' }, { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' }, { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' }, { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' }, { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' }
];

const getAnos = () => {
    const anoAtual = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => (anoAtual - i).toString());
};


function StockAuditTab() {
    const { saveStockAudit } = useAdmin();
    const { products } = useData();
    const { stockAudits } = useAdminData();
    const { settings } = useSettings();
    const { user, isLoading } = useAuth();
    const { logAction } = useAudit();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [stockCounts, setStockCounts] = useState<StockCount>({});
    const [mes, setMes] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [ano, setAno] = useState(new Date().getFullYear().toString());

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const auditId = `audit-${ano}-${mes}`;
        const existingAudit = stockAudits.find(a => a.id === auditId);
        
        if (existingAudit) {
            const loadedCounts: StockCount = {};
            existingAudit.products.forEach(p => {
                if(p.physicalCount !== null) {
                    loadedCounts[p.productId] = p.physicalCount;
                }
            });
            setStockCounts(loadedCounts);
        } else {
            setStockCounts({});
        }
    }, [mes, ano, stockAudits]);

    useEffect(() => {
        if (!mounted || isLoading) return;
        if (!user) {
            router.push('/login');
            return;
        }
        if (user.role !== 'admin' && user.role !== 'gerente') {
            router.push('/admin/pedidos');
        }
    }, [mounted, isLoading, user, router]);

    if (!mounted || isLoading) {
        return <p>Carregando painel...</p>;
    }

    if (!user) {
        return <p>Redirecionando...</p>;
    }

    if (user.role !== 'admin' && user.role !== 'gerente') {
        return <p>Acesso negado. Redirecionando...</p>;
    }

    const handleMonthChange = (newMonth: string) => {
        setMes(newMonth);
    };

    const handleYearChange = (newYear: string) => {
        setAno(newYear);
    };

    const handleCountChange = (productId: string, value: string) => {
        const count = value === '' ? null : parseInt(value, 10);
        setStockCounts(prev => ({
            ...prev,
            [productId]: isNaN(count as number) ? null : count,
        }));
    };

    const auditedProducts = useMemo(() => {
        return products.map(product => {
            const physicalCount = stockCounts[product.id];
            const difference = physicalCount === null || physicalCount === undefined ? null : physicalCount - product.stock;
            return {
                ...product,
                physicalCount: physicalCount ?? '',
                difference: difference,
            };
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [products, stockCounts]);
    
    const handleSaveAudit = () => {
        if (!user) return;
        const auditData: StockAudit = {
            id: `audit-${ano}-${mes}`,
            month: mes,
            year: ano,
            createdAt: new Date().toISOString(),
            auditedBy: user.id,
            auditedByName: user.name,
            products: auditedProducts.map(p => ({
                productId: p.id,
                productName: p.name,
                systemStock: p.stock,
                physicalCount: typeof p.physicalCount === 'number' ? p.physicalCount : null,
                difference: typeof p.difference === 'number' ? p.difference : null,
            })).filter(p => p.physicalCount !== null), // Only save products that were counted
        };
        saveStockAudit(auditData, logAction, user);
    };


    const anos = getAnos();
    const mesLabel = meses.find(m => m.value === mes)?.label;
    
     if (!products) {
        return <p>Carregando produtos...</p>
    }

    return (
        <div>
            {/* Screen-only view */}
            <div className="print-hidden">
                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Boxes className="h-6 w-6" />
                                    Auditoria de Estoque
                                </CardTitle>
                                <CardDescription>
                                    Realize a contagem física dos produtos e compare com o estoque do sistema.
                                </CardDescription>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <Button className="w-1/2 sm:w-auto" variant="outline" onClick={handleSaveAudit} disabled={Object.keys(stockCounts).length === 0}>
                                    <Save className="mr-2 h-4 w-4" />
                                    Salvar
                                </Button>
                                <Button className="w-1/2 sm:w-auto" onClick={() => window.print()}>
                                    <Printer className="mr-2 h-4 w-4" />
                                    Imprimir
                                </Button>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 p-4 border rounded-lg bg-muted/50">
                            <h3 className="font-semibold text-sm sm:text-base">Período:</h3>
                            <div className="flex items-center gap-2">
                                <label htmlFor="mes-auditoria" className="text-sm font-medium">Mês:</label>
                                <Select value={mes} onValueChange={handleMonthChange}>
                                    <SelectTrigger id="mes-auditoria" className="w-full sm:w-[180px]">
                                        <SelectValue placeholder="Selecione o Mês" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {meses.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center gap-2">
                                <label htmlFor="ano-auditoria" className="text-sm font-medium">Ano:</label>
                                <Select value={ano} onValueChange={handleYearChange}>
                                    <SelectTrigger id="ano-auditoria" className="w-full sm:w-[120px]">
                                        <SelectValue placeholder="Selecione o Ano" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {anos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[80px]">Imagem</TableHead>
                                        <TableHead>Produto</TableHead>
                                        <TableHead className="text-center">Estoque Sistema</TableHead>
                                        <TableHead className="w-[150px] text-center">Estoque Físico</TableHead>
                                        <TableHead className="w-[150px] text-center">Diferença</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {auditedProducts.map(product => (
                                        <TableRow key={product.id}>
                                            <TableCell>
                                                <div className="relative h-12 w-12 rounded-md overflow-hidden bg-muted">
                                                    <Image 
                                                        src={(product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : 'https://placehold.co/100x100.png'} 
                                                        alt={product.name} 
                                                        fill 
                                                        className="object-contain" 
                                                    />
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-medium">{product.name}</TableCell>
                                            <TableCell className="text-center font-semibold text-lg">{product.stock}</TableCell>
                                            <TableCell className="text-center">
                                                <Input
                                                    type="number"
                                                    className="w-24 mx-auto text-center"
                                                    value={product.physicalCount}
                                                    onChange={(e) => handleCountChange(product.id, e.target.value)}
                                                />
                                            </TableCell>
                                            <TableCell 
                                                className={cn(
                                                    "text-center font-bold text-lg",
                                                    product.difference === 0 && "text-green-600",
                                                    product.difference !== null && product.difference !== 0 && "text-destructive",
                                                )}
                                            >
                                                {product.difference !== null ? (product.difference > 0 ? `+${product.difference}`: product.difference) : '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Print-only view */}
            <div className="hidden print-only">
                <div className="mb-8">
                    <div className="flex justify-between items-start pb-4 border-b">
                        <div className="flex items-center">
                            <Logo />
                            <div className="w-2" />
                            <div className="text-xs">
                                <p className="font-bold">{settings.storeName}</p>
                                <p className="whitespace-pre-line">{settings.storeAddress}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-gray-500">{new Date().toLocaleDateString('pt-BR')}</p>
                            <p className="text-lg font-bold">Auditoria de Estoque</p>
                        </div>
                    </div>
                    <div className="text-center mt-4">
                        <h2 className="text-xl font-semibold">Relatório de Posição de Estoque</h2>
                        <p className="text-md capitalize">Referente a: {mesLabel} / {ano}</p>
                    </div>
                </div>

                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="border-b-2">
                            <th className="text-left p-2 font-bold">Produto</th>
                            <th className="text-left p-2 font-bold">Estoque Sistema</th>
                            <th className="text-left p-2 font-bold">Estoque Físico</th>
                            <th className="text-left p-2 font-bold">Diferença</th>
                        </tr>
                    </thead>
                    <tbody>
                        {auditedProducts.map(product => (
                            <tr key={product.id} className="border-b last:border-none">
                                <td className="p-2">{product.name}</td>
                                <td className="text-center p-2">{product.stock}</td>
                                <td className="text-center p-2">{product.physicalCount}</td>
                                <td className="text-center p-2 font-bold">
                                    {product.difference !== null ? (product.difference > 0 ? `+${product.difference}`: product.difference) : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}


export default function AuditoriaPage() {
    return (
        <StockAuditTab />
    );
}
      

    
