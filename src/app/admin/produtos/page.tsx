

'use client';

import { useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useAdmin } from '@/context/AdminContext';
import { useData } from '@/context/DataContext';
import type { Product } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoreHorizontal, PlusCircle, Trash, Edit, PackageSearch, Eye, EyeOff, Search, Import, History } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ProductForm from '@/components/ProductForm';
import { useAuth } from '@/context/AuthContext';
import { useAudit } from '@/context/AuditContext';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export default function ManageProductsPage() {
    const { deleteProduct, importProducts } = useAdmin();
    const { products } = useData();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [productToEdit, setProductToEdit] = useState<Product | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState<Product | null>(null);
    const { user } = useAuth();
    const { logAction } = useAudit();
    const { toast } = useToast();
    const [search, setSearch] = useState('');
    const importInputRef = useRef<HTMLInputElement | null>(null);
    const canDelete = user?.role === 'admin' || user?.role === 'gerente';
    const canImport = user?.role === 'admin';

    const handleAddNew = () => {
        setProductToEdit(null);
        setIsDialogOpen(true);
    };

    const handleEdit = (product: Product) => {
        setProductToEdit(product);
        setIsDialogOpen(true);
    };
    
    const requestDelete = (product: Product) => {
        setProductToDelete(product);
        setIsDeleteDialogOpen(true);
    };

    const confirmDelete = () => {
        if (!productToDelete) return;
        deleteProduct(productToDelete.id, logAction, user);
        setIsDeleteDialogOpen(false);
        setProductToDelete(null);
    };

    const handleRestoreFromCache = async () => {
        if (!user || !canImport) return;

        try {
            const raw = localStorage.getItem('productsCache');
            if (!raw) {
                toast({ title: 'Cache vazio', description: 'Nenhum produto foi encontrado no cache deste navegador.', variant: 'destructive' });
                return;
            }
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length === 0) {
                toast({ title: 'Cache vazio', description: 'Nenhum produto foi encontrado no cache deste navegador.', variant: 'destructive' });
                return;
            }
            await importProducts(parsed as Product[], logAction, user);
        } catch {
            toast({ title: 'Erro ao restaurar', description: 'Falha ao ler o cache local.', variant: 'destructive' });
        }
    };

    const handleImportProductsFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!user || !canImport) return;
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result as string;
                const parsed = JSON.parse(text);
                const productsToImport = Array.isArray(parsed) ? parsed : parsed?.products;

                if (!Array.isArray(productsToImport)) {
                    toast({ title: 'Formato inválido', description: 'Use um JSON com uma lista de produtos ou um backup com a chave "products".', variant: 'destructive' });
                    return;
                }

                await importProducts(productsToImport as Product[], logAction, user);
            } catch {
                toast({ title: 'Erro ao importar', description: 'Não foi possível ler o JSON.', variant: 'destructive' });
            } finally {
                if (importInputRef.current) importInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    const filteredProducts = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return products;
        return products.filter((p) => {
            const haystack = [
                p.name,
                p.code,
                p.category,
                p.subcategory,
                p.id,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return haystack.includes(q);
        });
    }, [products, search]);

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Gerenciar Produtos</CardTitle>
                        <CardDescription>Adicione, edite ou remova produtos do seu catálogo.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        {products.length === 0 && (
                            <>
                                <Button variant="outline" onClick={handleRestoreFromCache} disabled={!canImport}>
                                    <History className="mr-2 h-4 w-4" />
                                    Restaurar do cache
                                </Button>
                                <Button variant="outline" onClick={() => importInputRef.current?.click()} disabled={!canImport}>
                                    <Import className="mr-2 h-4 w-4" />
                                    Importar JSON
                                </Button>
                                <input
                                    ref={importInputRef}
                                    type="file"
                                    accept="application/json"
                                    className="hidden"
                                    onChange={handleImportProductsFile}
                                />
                            </>
                        )}
                        <Button onClick={handleAddNew}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Adicionar Produto
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="mb-4">
                        <div className="relative max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nome, código, categoria..."
                                className="pl-10"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    {filteredProducts.length > 0 ? (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[80px]">Imagem</TableHead>
                                        <TableHead>Cód. Item</TableHead>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Categoria</TableHead>
                                        <TableHead className="text-right">Preço</TableHead>
                                        <TableHead className="text-center">Estoque</TableHead>
                                        <TableHead className="text-center">Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredProducts.map((product) => (
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
                                            <TableCell className="font-mono text-xs">{product.code || '-'}</TableCell>
                                            <TableCell className="font-medium">{product.name}</TableCell>
                                            <TableCell className="capitalize">{product.category}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(product.price)}</TableCell>
                                            <TableCell className="text-center">{product.stock}</TableCell>
                                            <TableCell className="text-center">
                                                {product.isHidden ? (
                                                    <Badge variant="outline" className="text-muted-foreground">
                                                        <EyeOff className="mr-2 h-4 w-4" />
                                                        Oculto
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="bg-green-500/20 text-green-700">
                                                        <Eye className="mr-2 h-4 w-4" />
                                                        Visível
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end items-center gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => handleEdit(product)}>
                                                        <Edit className="mr-2 h-4 w-4" />
                                                        Editar
                                                    </Button>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <span className="sr-only">Abrir menu</span>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem
                                                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                                                disabled={!canDelete}
                                                                onClick={() => requestDelete(product)}
                                                            >
                                                                <Trash className="mr-2 h-4 w-4" />
                                                                Excluir
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
                            <PackageSearch className="mx-auto h-12 w-12" />
                            <h3 className="mt-4 text-lg font-semibold">Nenhum produto encontrado</h3>
                            <p className="mt-1 text-sm">
                                {products.length === 0 ? 'Importe/restaure os produtos ou adicione um novo produto.' : 'Ajuste a busca ou adicione um novo produto.'}
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{productToEdit ? 'Editar Produto' : 'Cadastrar Novo Produto'}</DialogTitle>
                        <DialogDescription>
                            {productToEdit ? 'Faça alterações nas informações do produto.' : 'Preencha os campos para adicionar um item ao catálogo.'}
                        </DialogDescription>
                    </DialogHeader>
                    <ProductForm
                        productToEdit={productToEdit}
                        onFinished={() => setIsDialogOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {productToDelete ? `Você está prestes a excluir "${productToDelete.name}".` : 'Você está prestes a excluir este produto.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setProductToDelete(null)}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
