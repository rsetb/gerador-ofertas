

'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAdmin, useAdminData } from '@/context/AdminContext';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useAudit } from '@/context/AuditContext';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandItem } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Check, ChevronsUpDown, PlusCircle, ShoppingCart, Trash2, CalendarIcon, MinusCircle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CustomerInfo, User, Product, CartItem, Order, Installment } from '@/lib/types';
import { addMonths, format, parse, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

const createOrderSchema = z.object({
  customerId: z.string().min(1, 'É obrigatório selecionar um cliente.'),
  sellerId: z.string().min(1, 'É obrigatório selecionar um vendedor.'),
  date: z.date({ required_error: 'A data do pedido é obrigatória.' }),
  firstDueDate: z.date({ required_error: 'O vencimento da 1ª parcela é obrigatório.' }),
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number(),
    quantity: z.number().min(1, 'A quantidade deve ser pelo menos 1.'),
    imageUrl: z.string(),
  })).min(1, 'O pedido deve ter pelo menos um item.'),
  installments: z.coerce.number().min(1, 'O número de parcelas deve ser pelo menos 1.'),
  discount: z.coerce.number().min(0, 'O desconto não pode ser negativo.').optional(),
  downPayment: z.coerce.number().min(0, 'A entrada não pode ser negativa.').optional(),
  observations: z.string().optional(),
});

type CreateOrderFormValues = z.infer<typeof createOrderSchema>;

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatBRL = (value: number | undefined | null) => {
  if (value === undefined || value === null || isNaN(value)) {
    return "";
  }
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const CustomProductForm = ({ onAdd }: { onAdd: (item: CartItem) => void }) => {
    const [name, setName] = useState('');
    const [price, setPrice] = useState('');
    const [quantity, setQuantity] = useState('1');
    const [isOpen, setIsOpen] = useState(false);

    const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        if (!rawValue) {
            setPrice('');
            return;
        }

        const numericValue = parseInt(rawValue, 10);
        
        // Formata para o formato BRL (1.000,00)
        const formattedValue = new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(numericValue / 100);

        setPrice(formattedValue);
    };

    const handleAdd = () => {
        // Converte o valor formatado '1.234,56' para um número 1234.56
        const priceValue = parseFloat(price.replace(/\./g, '').replace(',', '.'));
        const quantityValue = parseInt(quantity, 10);

        if (name && !isNaN(priceValue) && priceValue > 0 && !isNaN(quantityValue) && quantityValue > 0) {
            onAdd({
                id: `CUSTOM-${Date.now().toString().slice(-6)}`,
                name: name,
                price: priceValue,
                quantity: quantityValue,
                imageUrl: 'https://placehold.co/100x100.png?text=AVULSO',
            });
            setName('');
            setPrice('');
            setQuantity('1');
            setIsOpen(false);
        }
    };


    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button type="button" variant="outline">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Adicionar Produto Avulso
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Adicionar Produto Avulso</DialogTitle>
                    <DialogDescription>
                        Insira os detalhes do produto que não está no catálogo.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <FormLabel htmlFor="custom-product-name">Nome do Produto</FormLabel>
                        <Input id="custom-product-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Montagem especial" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <FormLabel htmlFor="custom-product-quantity">Quantidade</FormLabel>
                            <Input id="custom-product-quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min={1} />
                        </div>
                        <div className="space-y-2">
                            <FormLabel htmlFor="custom-product-price">Preço Unitário (R$)</FormLabel>
                            <Input id="custom-product-price" value={price} onChange={handlePriceChange} placeholder="Ex: 50,00" />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                    <Button onClick={handleAdd}>Adicionar ao Pedido</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


export default function CreateOrderPage() {
  const { addOrder } = useAdmin();
  const { products: allProducts } = useData();
  const { customers: allCustomers } = useAdminData();
  const { user, users } = useAuth();
  const { logAction } = useAudit();
  const router = useRouter();
  const { toast } = useToast();

  const [selectedItems, setSelectedItems] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [openProductPopover, setOpenProductPopover] = useState(false);
  
  const [openCustomerPopover, setOpenCustomerPopover] = useState(false);
  

  const sellers = useMemo(() => {
    return users.filter(u => u.role === 'vendedor' || u.role === 'admin' || u.role === 'gerente');
  }, [users]);
  
  const uniqueProducts = useMemo(() => {
    const productMap = new Map<string, Product>();
    allProducts.forEach(p => {
        if (!productMap.has(p.id)) {
            productMap.set(p.id, p);
        }
    });
    return Array.from(productMap.values()).sort((a,b) => a.name.localeCompare(b.name));
  }, [allProducts]);
  
  const filteredProducts = useMemo(() => {
    if (!productSearch) return uniqueProducts.filter(p => p.stock > 0);
    const lowercasedQuery = productSearch.toLowerCase();
    return uniqueProducts.filter(p => 
        p.stock > 0 && 
        (
            p.name.toLowerCase().includes(lowercasedQuery) ||
            p.code?.toLowerCase().includes(lowercasedQuery)
        )
    );
  }, [productSearch, uniqueProducts]);


  const form = useForm<CreateOrderFormValues>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      customerId: '',
      sellerId: user?.id || sellers[0]?.id || '',
      date: new Date(),
      firstDueDate: addMonths(new Date(), 1),
      items: [],
      installments: 1,
      discount: 0,
      downPayment: 0,
      observations: '',
    },
  });
  
  const handleAddItem = (product: Product | CartItem) => {
    setProductSearch('');
    setOpenProductPopover(false);

    const existingItem = selectedItems.find(item => item.id === product.id);
    let newItems;
    
    const quantityToAdd = 'quantity' in product ? product.quantity : 1;

    if (existingItem) {
      newItems = selectedItems.map(item =>
        item.id === product.id ? { ...item, quantity: item.quantity + quantityToAdd } : item
      );
    } else {
      newItems = [...selectedItems, {
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: quantityToAdd,
        imageUrl: 'imageUrl' in product ? product.imageUrl : (product.imageUrls?.[0] || 'https://placehold.co/100x100.png'),
      }];
    }
    setSelectedItems(newItems);
    form.setValue('items', newItems, { shouldValidate: true });
  };
  
  const handleQuantityChange = (productId: string, quantity: number) => {
    let newItems;
    if (quantity < 1) {
      newItems = selectedItems.filter(item => item.id !== productId);
    } else {
      const productInCatalog = allProducts.find(p => p.id === productId);
      const stockLimit = productInCatalog?.stock ?? Infinity; // Infinity for custom products
      if (quantity > stockLimit) {
        toast({ title: "Limite de Estoque Atingido", description: `A quantidade máxima para este item é ${stockLimit}.`, variant: "destructive" });
        quantity = stockLimit;
      }
      newItems = selectedItems.map(item =>
        item.id === productId ? { ...item, quantity } : item
      );
    }
    setSelectedItems(newItems);
    form.setValue('items', newItems, { shouldValidate: true });
  };
  
  const handleRemoveItem = (productId: string) => {
    const newItems = selectedItems.filter(item => item.id !== productId);
    setSelectedItems(newItems);
    form.setValue('items', newItems, { shouldValidate: true });
  };
  
  const subtotal = useMemo(() => {
    return selectedItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  }, [selectedItems]);
  
  const discount = form.watch('discount') || 0;
  const downPayment = form.watch('downPayment') || 0;
  const total = subtotal - discount;
  const totalFinanced = total - downPayment;
  const installmentsCount = form.watch('installments');
  const firstDueDate = form.watch('firstDueDate');
  
  const installmentPreview = useMemo(() => {
    if (!totalFinanced || totalFinanced <= 0 || !installmentsCount || installmentsCount <= 0) {
      return [];
    }
    const orderId = 'preview';
    const totalInCents = Math.round(totalFinanced * 100);
    const baseInstallmentValueInCents = Math.floor(totalInCents / installmentsCount);
    let remainderInCents = totalInCents % installmentsCount;

    const newInstallmentDetails: Partial<Installment>[] = [];
    
    for (let i = 0; i < installmentsCount; i++) {
        let installmentValueCents = baseInstallmentValueInCents;
        if (remainderInCents > 0) {
            installmentValueCents++;
            remainderInCents--;
        }
        
        newInstallmentDetails.push({
            installmentNumber: i + 1,
            amount: installmentValueCents / 100,
            dueDate: addMonths(firstDueDate, i).toISOString(),
        });
    }
    return newInstallmentDetails;
  }, [totalFinanced, installmentsCount, firstDueDate]);
  
  async function onSubmit(values: CreateOrderFormValues) {
    const customer = allCustomers.find(c => (c.cpf || `${c.name}-${c.phone}`) === values.customerId);
    const seller = users.find(u => u.id === values.sellerId);
    
    if (!customer || !seller) {
        toast({ title: 'Erro', description: 'Cliente ou vendedor inválido.', variant: 'destructive'});
        return;
    }
    
    const installmentValue = totalFinanced / values.installments;

    const installmentDetails = Array.from({ length: values.installments }, (_, i) => ({
      id: `inst-manual-${Date.now().toString().slice(-6)}-${i}`,
      installmentNumber: i + 1,
      amount: installmentValue,
      dueDate: addMonths(values.firstDueDate, i).toISOString(),
      status: 'Pendente' as const,
      paidAmount: 0,
      payments: [],
    }));
    
    const orderData: Partial<Order> & { firstDueDate: Date } = {
        customer: customer,
        items: selectedItems,
        total: total,
        discount: values.discount,
        downPayment: values.downPayment,
        installments: values.installments,
        installmentValue,
        date: values.date.toISOString(),
        firstDueDate: values.firstDueDate,
        status: 'Processando' as const,
        paymentMethod: 'Crediário' as const,
        installmentDetails,
        sellerId: seller.id,
        sellerName: seller.name,
        observations: values.observations,
        source: 'Manual',
    };
    
    try {
        const savedOrder = await addOrder(orderData, logAction, user);
        if (savedOrder) {
            router.push(`/admin/pedidos`);
        }
    } catch (error) {
        if (error instanceof Error) {
            toast({
                title: "Erro ao Criar Pedido",
                description: error.message,
                variant: 'destructive',
            });
        }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlusCircle className="h-6 w-6" />
          Criar Novo Pedido Manualmente
        </CardTitle>
        <CardDescription>
          Preencha os dados abaixo para registrar um novo pedido no sistema.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 items-start">
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Cliente</FormLabel>
                    <Popover open={openCustomerPopover} onOpenChange={setOpenCustomerPopover}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn("w-full justify-between", !field.value && "text-muted-foreground")}
                          >
                            {field.value
                              ? allCustomers.find(c => (c.cpf || `${c.name}-${c.phone}`) === field.value)?.name
                              : "Selecione um cliente"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 pointer-events-auto">
                        <Command>
                           <CommandInput 
                            placeholder="Buscar cliente por nome ou CPF..."
                          />
                           <CommandList>
                            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                            <CommandGroup>
                              {allCustomers && allCustomers.map(c => {
                                const customerId = c.cpf || `${c.name}-${c.phone}`;
                                return (
                                <CommandItem
                                  key={customerId}
                                  value={`${c.code || ''} ${c.name} ${c.cpf || ''} ${c.phone || ''}`.trim()}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                  className="cursor-pointer"
                                  onSelect={() => {
                                    form.setValue("customerId", customerId, { shouldValidate: true });
                                    setOpenCustomerPopover(false);
                                  }}
                                  onClick={() => {
                                    form.setValue("customerId", customerId, { shouldValidate: true });
                                    setOpenCustomerPopover(false);
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", customerId === field.value ? "opacity-100" : "opacity-0")} />
                                  <div className="flex flex-col items-start text-left">
                                      <span>{c.name}</span>
                                      <span className="text-xs text-muted-foreground">
                                        {c.code ? `${c.code} • ` : ''}
                                        {c.cpf || c.phone}
                                      </span>
                                  </div>
                                </CommandItem>
                                )
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sellerId"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                        <FormLabel>Vendedor</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione o vendedor responsável" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {sellers.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
               />

                <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Data do Pedido</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP", {locale: ptBR})
                                ) : (
                                  <span>Escolha uma data</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              defaultMonth={field.value}
                              disabled={(date) =>
                                date > new Date() || date < new Date("1900-01-01")
                              }
                              
                              locale={ptBR}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="firstDueDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Vencimento da 1ª Parcela</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP", {locale: ptBR})
                                ) : (
                                  <span>Escolha uma data</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              defaultMonth={field.value}
                              locale={ptBR}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                />
            </div>
            
             <div>
                <h3 className="text-lg font-medium mb-2">Itens do Pedido</h3>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Produto</TableHead>
                                <TableHead className="w-[120px] text-right">Preço</TableHead>
                                <TableHead className="w-[120px] text-center">Qtd.</TableHead>
                                <TableHead className="w-[120px] text-right">Subtotal</TableHead>
                                <TableHead className="w-[60px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {selectedItems.length > 0 ? (
                                selectedItems.map(item => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium">{item.name}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.price)}</TableCell>
                                        <TableCell>
                                            <Input 
                                                type="number" 
                                                className="w-20 mx-auto text-center" 
                                                value={item.quantity}
                                                onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value))}
                                                min={1}
                                            />
                                        </TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.price * item.quantity)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveItem(item.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">Nenhum produto adicionado.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                <div className="mt-4 flex flex-wrap gap-4 items-center">
                   <Popover open={openProductPopover} onOpenChange={setOpenProductPopover}>
                        <PopoverTrigger asChild>
                           <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openProductPopover}
                            className="w-[300px] justify-between"
                          >
                            {"Selecione um produto..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent 
                            className="w-[300px] p-0"
                        >
                            <Command shouldFilter={false}>
                                <CommandInput 
                                        placeholder="Buscar por nome ou código..."
                                        value={productSearch}
                                        onValueChange={setProductSearch}
                                />
                                <CommandList>
                                    <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                                    <CommandGroup>
                                        {filteredProducts.map(p => (
                                            <CommandItem
                                                key={p.id}
                                                onSelect={() => handleAddItem(p)}
                                            >
                                                <Check className={cn("mr-2 h-4 w-4", selectedItems.some(i => i.id === p.id) ? "opacity-100" : "opacity-0")} />
                                                <div className="flex flex-col">
                                                    <span className="font-semibold">{p.name}</span>
                                                    <span className="text-xs text-muted-foreground">{p.code}</span>
                                                </div>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                    <CustomProductForm onAdd={handleAddItem} />
                    <FormMessage>{form.formState.errors.items?.message || form.formState.errors.items?.root?.message}</FormMessage>
                </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8 items-start pt-6 border-t">
                <div className="space-y-4">
                     <FormField
                        control={form.control}
                        name="discount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Desconto (R$)</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        placeholder="0,00"
                                        inputMode="decimal"
                                        value={formatBRL(field.value)}
                                        onChange={(e) => {
                                            const rawValue = e.target.value.replace(/\D/g, '');
                                            field.onChange(Number(rawValue) / 100);
                                        }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="downPayment"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Valor de Entrada (R$)</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        placeholder="0,00"
                                        inputMode="decimal"
                                        value={formatBRL(field.value)}
                                        onChange={(e) => {
                                            const rawValue = e.target.value.replace(/\D/g, '');
                                            field.onChange(Number(rawValue) / 100);
                                        }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                     <FormField
                        control={form.control}
                        name="installments"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Número de Parcelas (Restante)</FormLabel>
                                <FormControl>
                                    <Input 
                                        type="number" 
                                        min={1} 
                                        {...field} 
                                        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <div className='flex flex-col'>
                    <FormLabel>Resumo Financeiro</FormLabel>
                    <div className="p-4 bg-muted rounded-lg mt-2 space-y-2">
                        <div className="flex justify-between items-center text-md">
                            <span>Subtotal</span>
                            <span>{formatCurrency(subtotal)}</span>
                        </div>
                        <div className="flex justify-between items-center text-md text-destructive">
                            <span>Desconto</span>
                            <span>- {formatCurrency(discount)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between items-center text-lg font-bold">
                            <span>TOTAL DO PEDIDO</span>
                            <span>{formatCurrency(total)}</span>
                        </div>
                         <div className="flex justify-between items-center text-md text-green-600">
                            <span>Entrada</span>
                            <span>- {formatCurrency(downPayment)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between items-center text-xl font-bold">
                            <span>TOTAL A FINANCIAR</span>
                            <span>{formatCurrency(totalFinanced)}</span>
                        </div>
                    </div>
                </div>

            </div>

             <FormField
                control={form.control}
                name="observations"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Observações do Pedido (Opcional)</FormLabel>
                        <FormControl>
                            <Textarea
                                placeholder="Digite aqui qualquer observação relevante para este pedido. Ex: Entregar após as 14h, produto para presente, etc."
                                {...field}
                                rows={3}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {installmentPreview.length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-2 flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Pré-visualização do Carnê
                </h3>
                 <div className="rounded-md border max-h-60 overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px]">Parcela</TableHead>
                                <TableHead>Vencimento</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {installmentPreview.map(inst => (
                                <TableRow key={inst.installmentNumber}>
                                    <TableCell className="font-semibold">{inst.installmentNumber}/{installmentsCount}</TableCell>
                                    <TableCell>{format(new Date(inst.dueDate!), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                                    <TableCell className="text-right font-mono">{formatCurrency(inst.amount!)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
              </div>
            )}
            
            <Button type="submit" size="lg" className="w-full md:w-auto" disabled={form.formState.isSubmitting}>
                <ShoppingCart className="mr-5 h-5 w-5" />
                Criar Pedido
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
