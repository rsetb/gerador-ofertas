

'use client';

import React, { useState, useEffect, useMemo, useCallback, ChangeEvent, DragEvent, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAdmin, useAdminData } from '@/context/AdminContext';
import type { Order, CustomerInfo, Installment, Attachment, Payment, User } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { User as UserIcon, Mail, Phone, MapPin, Users, CreditCard, Printer, Upload, FileText, X, Pencil, CheckCircle, Undo2, CalendarIcon, ClipboardPaste, KeyRound, Search, MessageSquarePlus, Clock, UserSquare, History, Import, UserPlus, FileSignature, Trash2, Trash, MoreVertical } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import PaymentDialog from '@/components/PaymentDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useAudit } from '@/context/AuditContext';
import CustomerForm from '@/components/CustomerForm';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { useSettings } from '@/context/SettingsContext';
import { useSearchParams, useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const getCustomerKey = (customer: CustomerInfo | null) => {
  if (!customer) return '';
  return customer.cpf?.replace(/\D/g, '') || `${customer.name}-${customer.phone}`;
}

const formatPhone = (value: string) => {
    if (!value) return '';
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length <= 2) {
      return `(${digitsOnly}`;
    }
    if (digitsOnly.length <= 7) {
      return `(${digitsOnly.slice(0, 2)}) ${digitsOnly.slice(2)}`;
    }
    return `(${digitsOnly.slice(0, 2)}) ${digitsOnly.slice(2, 7)}-${digitsOnly.slice(7, 11)}`;
};


const resizeImage = (file: File, MAX_WIDTH = 1920, MAX_HEIGHT = 1080): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (typeof event.target?.result !== 'string') {
                return reject(new Error('Falha ao ler o arquivo.'));
            }
            const img = document.createElement('img');
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Não foi possível obter o contexto do canvas.'));
                }
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL(file.type, 0.9);
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
            img.src = event.target.result as string;
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
    });
};

export default function CustomersAdminPage() {
  const { updateCustomer, recordInstallmentPayment, updateInstallmentDueDate, updateOrderDetails, reversePayment, importCustomers, addCustomer, deleteCustomer, restoreCustomerFromTrash, updateOrderStatus, generateCustomerCodes } = useAdmin();
  const { customers, customerOrders, customerFinancials, deletedCustomers } = useAdminData();
  const { user, users } = useAuth();
  const { settings } = useSettings();
  const { logAction } = useAudit();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerInfo | null>(null);
  const [imageToView, setImageToView] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddCustomerDialogOpen, setIsAddCustomerDialogOpen] = useState(false);
  const [editedInfo, setEditedInfo] = useState<Partial<CustomerInfo>>({});
  const [openDueDatePopover, setOpenDueDatePopover] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [installmentToPay, setInstallmentToPay] = useState<Installment | null>(null);
  const [orderForPayment, setOrderForPayment] = useState<Order | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('active');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isGeneratingCustomerCodes, setIsGeneratingCustomerCodes] = useState(false);

  const [commentDialog, setCommentDialog] = useState<{
    open: boolean;
    orderId?: string;
    attachmentIndex?: number;
    currentComment?: string;
    onSave?: (comment: string) => Promise<void>;
  }>({ open: false });
  
  // Effect to handle selecting a customer from URL query parameter
  useEffect(() => {
    const cpfFromQuery = searchParams.get('cpf');
    if (cpfFromQuery && customers.length > 0) {
      const customerToSelect = customers.find(c => c.cpf && c.cpf.replace(/\D/g, '') === cpfFromQuery.replace(/\D/g, ''));
      if (customerToSelect) {
        setSelectedCustomer(customerToSelect);
        // Optional: clear the query param after selection
        router.replace('/admin/clientes', undefined);
      }
    }
  }, [searchParams, customers, router]);

  const getStatusVariant = (status: Order['status']): 'secondary' | 'default' | 'outline' | 'destructive' => {
    switch (status) {
      case 'Processando':
        return 'secondary';
      case 'Enviado':
        return 'default';
      case 'Entregue':
        return 'outline';
      case 'Cancelado':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    if (!searchQuery) return customers;

    const lowercasedQuery = searchQuery.toLowerCase();
    return customers.filter(customer =>
        customer.name.toLowerCase().includes(lowercasedQuery) ||
        (customer.cpf && customer.cpf.replace(/\D/g, '').includes(lowercasedQuery)) ||
        (customer.code && customer.code.toLowerCase().includes(lowercasedQuery))
    );
  }, [customers, searchQuery]);

  const filteredDeletedCustomers = useMemo(() => {
    if (!deletedCustomers) return [];
    if (!searchQuery) return deletedCustomers;

    const lowercasedQuery = searchQuery.toLowerCase();
    return deletedCustomers.filter(customer =>
        customer.name.toLowerCase().includes(lowercasedQuery) ||
        (customer.cpf && customer.cpf.replace(/\D/g, '').includes(lowercasedQuery)) ||
        (customer.code && customer.code.toLowerCase().includes(lowercasedQuery))
    );
  }, [deletedCustomers, searchQuery]);
  
  const ordersForSelectedCustomer = useMemo(() => {
      if (!selectedCustomer) return [];
      const customerKey = getCustomerKey(selectedCustomer);
      return customerOrders[customerKey] || [];
  }, [selectedCustomer, customerOrders]);

  const financialsForSelectedCustomer = useMemo(() => {
      if (!selectedCustomer) return { totalComprado: 0, totalPago: 0, saldoDevedor: 0 };
      const customerKey = getCustomerKey(selectedCustomer);
      return customerFinancials[customerKey] || { totalComprado: 0, totalPago: 0, saldoDevedor: 0 };
  }, [selectedCustomer, customerFinancials]);

  
  const handleOpenPaymentDialog = (order: Order, installment: Installment) => {
    setOrderForPayment(order);
    setInstallmentToPay(installment);
    setPaymentDialogOpen(true);
  };
  
  const handlePaymentSubmit = (payment: Omit<Payment, 'receivedBy'>) => {
    if (orderForPayment && installmentToPay && user) {
      recordInstallmentPayment(orderForPayment.id, installmentToPay.installmentNumber, payment, logAction, user);
      window.open(`/carnet/${orderForPayment.id}/${installmentToPay.installmentNumber}`, '_blank');
    }
    setPaymentDialogOpen(false);
    setInstallmentToPay(null);
    setOrderForPayment(null);
  };

  const handleDueDateChange = (orderId: string, installmentNumber: number, date: Date | undefined) => {
    if (date && user) {
        updateInstallmentDueDate(orderId, installmentNumber, date, logAction, user);
    }
    setOpenDueDatePopover(null);
  };
    
  const addAttachments = useCallback(async (order: Order, newAttachments: Omit<Attachment, 'addedAt' | 'addedBy'>[]) => {
    if (!user) return;
    const currentAttachments = order.attachments || [];
    
    const processedAttachments: Attachment[] = newAttachments.map(att => ({
        ...att,
        addedAt: new Date().toISOString(),
        addedBy: user?.name || 'Desconhecido'
    }));

    await updateOrderDetails(order.id, { attachments: [...currentAttachments, ...processedAttachments] }, logAction, user);
    toast({ title: 'Anexos Adicionados!', description: 'Os novos documentos foram salvos com sucesso.' });
  }, [updateOrderDetails, toast, user, logAction]);

  const handleFileProcessing = useCallback(async (order: Order, files: File[]) => {
    const filesToProcess = Array.from(files);
    if (filesToProcess.length === 0) return;

    toast({ title: 'Processando anexos...', description: 'Aguarde enquanto os arquivos são otimizados e enviados.' });

    const attachmentsToAdd: Omit<Attachment, 'addedAt' | 'addedBy'>[] = [];

    for (const file of filesToProcess) {
        try {
            const isImage = file.type.startsWith('image/');
            const fileUrl = isImage ? await resizeImage(file) : await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => e.target?.result ? resolve(e.target.result as string) : reject(new Error('Falha ao ler o arquivo.'));
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            attachmentsToAdd.push({
                name: file.name,
                type: isImage ? 'image' : 'pdf',
                url: fileUrl,
            });
        } catch (error) {
            console.error("Error processing file:", error);
            toast({ title: 'Erro ao Processar Arquivo', description: `Não foi possível processar o arquivo ${file.name}.`, variant: 'destructive' });
        }
    }
    
    if (attachmentsToAdd.length === 0) return;
    
    if (attachmentsToAdd.length > 1) {
        await addAttachments(order, attachmentsToAdd);
    } else {
        setCommentDialog({
            open: true,
            onSave: async (comment) => {
                const finalAttachment = { ...attachmentsToAdd[0], comment: comment || undefined };
                await addAttachments(order, [finalAttachment]);
            }
        });
    }
  }, [addAttachments, toast]);
  
  
  const handleFileChange = async (order: Order, event: ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files) return;
      await handleFileProcessing(order, Array.from(event.target.files));
      event.target.value = '';
  };

    const handleDrag = (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = async (e: DragEvent<HTMLElement>, order: Order) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            await handleFileProcessing(order, Array.from(e.dataTransfer.files));
        }
    };
  
  const handlePaste = async (order: Order) => {
    if (!navigator.clipboard?.read) {
        toast({ title: "Navegador não suporta esta ação", description: "Seu navegador não permite colar imagens dessa forma.", variant: "destructive" });
        return;
    }
    try {
        const clipboardItems = await navigator.clipboard.read();
        const imageFiles: File[] = [];

        for (const item of clipboardItems) {
            const imageType = item.types.find(type => type.startsWith('image/'));
            if (imageType) {
                const blob = await item.getType(imageType);
                const fileName = `colado-${new Date().toISOString()}.png`;
                const file = new File([blob], fileName, { type: imageType });
                imageFiles.push(file);
            }
        }

        if (imageFiles.length > 0) {
            await handleFileProcessing(order, imageFiles);
        } else {
            toast({ title: "Nenhuma imagem encontrada", description: "Não há imagens na sua área de transferência para colar." });
        }
    } catch (err) {
        console.error('Falha ao colar:', err);
        toast({ title: "Falha ao colar", description: "Verifique as permissões do seu navegador para acessar a área de transferência.", variant: "destructive" });
    }
  };

  const handleDeleteAttachment = (order: Order, indexToDelete: number) => {
    if (!user) return;
    const newAttachments = (order.attachments || []).filter((_, index) => index !== indexToDelete);
    updateOrderDetails(order.id, { attachments: newAttachments }, logAction, user);
  };
  
  const handleEditComment = (order: Order, attachmentIndex: number) => {
    if (!user) return;
    const attachment = order.attachments?.[attachmentIndex];
    if (!attachment) return;

    setCommentDialog({
      open: true,
      currentComment: attachment.comment,
      onSave: async (comment) => {
        const newAttachments = [...(order.attachments || [])];
        newAttachments[attachmentIndex] = {
          ...newAttachments[attachmentIndex],
          comment: comment || undefined,
          addedAt: new Date().toISOString(),
          addedBy: user?.name || 'Desconhecido',
        };
        await updateOrderDetails(order.id, { attachments: newAttachments }, logAction, user);
        toast({ title: 'Comentário salvo!' });
      }
    });
  };

  const handleOpenEditDialog = () => {
    if (selectedCustomer) {
      setEditedInfo(selectedCustomer);
      setIsEditDialogOpen(true);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name.startsWith('phone')) {
        setEditedInfo(prev => ({ ...prev, [name]: formatPhone(value) }));
    } else {
        setEditedInfo(prev => ({ ...prev, [name]: value }));
    }
  };
  
  const handleSellerChange = (sellerId: string) => {
    if (sellerId === 'none') {
        setEditedInfo(prev => ({
            ...prev,
            sellerId: undefined,
            sellerName: undefined,
        }));
    } else {
      const seller = sellers.find(s => s.id === sellerId);
      if (seller) {
          setEditedInfo(prev => ({
              ...prev,
              sellerId: seller.id,
              sellerName: seller.name,
          }));
      }
    }
  };

  const handleSaveChanges = () => {
    if (selectedCustomer && editedInfo && user) {
      const updatedCustomerData = { ...selectedCustomer, ...editedInfo };
      // Se a senha estiver vazia, não a envie na atualização, mantendo a antiga
      if (editedInfo.password === '') {
          delete updatedCustomerData.password;
      }

      updateCustomer(selectedCustomer, updatedCustomerData as CustomerInfo, logAction, user);
      setSelectedCustomer(updatedCustomerData as CustomerInfo);
      setIsEditDialogOpen(false);
    }
  };

  const handleCommentDialogSubmit = () => {
    const { onSave, currentComment } = commentDialog;
    
    // Optimistically close dialog
    setCommentDialog({ open: false });

    // Perform save operation
    onSave?.(currentComment || '');
  };

  const handleImportCustomers = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!user) return;
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            await importCustomers(text, logAction, user);
        };
        reader.readAsText(file);
        
        // Reset file input
        if(fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };
    
  const handleAddCustomer = async (customerData: CustomerInfo) => {
    if (!user) return;
    
    const existingCustomer = customers.find(c => c.cpf && customerData.cpf && c.cpf.replace(/\D/g, '') === customerData.cpf.replace(/\D/g, ''));
    if (existingCustomer) {
        toast({ title: 'Erro', description: 'Um cliente com este CPF já existe.', variant: 'destructive' });
        return;
    }
    
    const customerSellerId = customerData.sellerId ?? user.id;
    const customerSellerName = customerData.sellerName ?? user.name;
    await addCustomer({ ...customerData, sellerId: customerSellerId, sellerName: customerSellerName }, logAction, user);
    setIsAddCustomerDialogOpen(false);
  };
  
  const handleSendWhatsAppReminder = (order: Order, installment: Installment) => {
    if (!settings.wapiInstance || !settings.wapiToken) {
        const customerName = order.customer.name.split(' ')[0];
        const customerPhone = order.customer.phone.replace(/\D/g, '');
        const dueDate = format(parseISO(installment.dueDate), 'dd/MM/yyyy', { locale: ptBR });
        const amount = formatCurrency(installment.amount - (installment.paidAmount || 0));
        
        const message = `Olá, ${customerName}! Passando para lembrar sobre o vencimento da sua parcela nº ${installment.installmentNumber} do seu carnê (pedido ${order.id}).

Vencimento: *${dueDate}*
Valor: *${amount}*

Chave pix: ${settings.pixKey}
Adriano Cavalcante de Oliveira
Banco: Nubank 

Não esqueça de enviar o comprovante!`;
        
        const whatsappUrl = `https://wa.me/55${customerPhone}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    } else {
        // W-API logic would go here
    }
  };

  const handleDeleteCustomer = () => {
    if (!selectedCustomer || !user) return;
    
    deleteCustomer(selectedCustomer, logAction, user);
    setSelectedCustomer(null);
  };
  
  const handleRestoreCustomer = (customer: CustomerInfo) => {
    if (!user) return;
    restoreCustomerFromTrash(customer, logAction, user);
    const ordersToRestore = customerOrders[getCustomerKey(customer)] || [];
    ordersToRestore.forEach(order => {
        if(order.status === 'Excluído') {
            updateOrderStatus(order.id, 'Processando', logAction, user);
        }
    });
    toast({ title: "Cliente Restaurado!", description: `O cliente ${customer.name} e seus pedidos foram restaurados.`});
  };

  const canDeleteCustomer = user?.role === 'admin' || user?.role === 'gerente';
  const canAccessTrash = user?.role === 'admin' || user?.role === 'gerente';
  const isAdmin = user?.role === 'admin';

  const sellers = useMemo(() => {
    return users.filter(u => u.role === 'vendedor' || u.role === 'admin' || u.role === 'gerente');
  }, [users]);
  
  const handleAssignSeller = (order: Order, seller: User) => {
    if (!seller) return;
    const detailsToUpdate: Partial<Order> = {
        sellerId: seller.id,
        sellerName: seller.name,
    };
    updateOrderDetails(order.id, detailsToUpdate, logAction, user);
    toast({
        title: "Vendedor Atribuído!",
        description: `O pedido #${order.id} foi atribuído a ${seller.name}.`
    });
  };
  
  const handleAssignToMe = (order: Order) => {
    if (!user) return;
    handleAssignSeller(order, user);
  };

  return (
    <>
        <div className="grid lg:grid-cols-3 gap-8 items-start">
            <Card className="lg:col-span-1">
                <CardHeader>
                    <div className='flex justify-between items-center flex-wrap gap-2'>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Clientes
                        </CardTitle>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setIsAddCustomerDialogOpen(true)}>
                                <UserPlus className="h-4 w-4 mr-2" />
                                Cadastrar
                            </Button>
                            {isAdmin && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="outline" size="sm" disabled={isGeneratingCustomerCodes}>
                                            <KeyRound className="h-4 w-4 mr-2" />
                                            Gerar Códigos
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Gerar códigos para todos os clientes?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Isso vai preencher o código em todos os pedidos antigos. Pode levar alguns segundos.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={async () => {
                                                    if (!user) return;
                                                    try {
                                                        setIsGeneratingCustomerCodes(true);
                                                        await generateCustomerCodes(logAction, user);
                                                    } finally {
                                                        setIsGeneratingCustomerCodes(false);
                                                    }
                                                }}
                                            >
                                                Gerar
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                            {isAdmin && (
                                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                                    <Import className="h-4 w-4 mr-2" />
                                    Importar
                                </Button>
                            )}
                        </div>
                        {isAdmin && (
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".csv"
                                onChange={handleImportCustomers}
                            />
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className={cn("grid w-full", canAccessTrash ? "grid-cols-2" : "grid-cols-1")}>
                            <TabsTrigger value="active">Ativos</TabsTrigger>
                            {canAccessTrash && <TabsTrigger value="deleted">Lixeira</TabsTrigger>}
                        </TabsList>
                        <div className="relative my-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="Buscar por nome ou CPF..."
                                className="pl-10"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearchQuery('')}>
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                        <TabsContent value="active">
                             {filteredCustomers.length > 0 ? (
                                <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-2">
                                {filteredCustomers.map((customer) => (
                                    <Button
                                    key={getCustomerKey(customer)}
                                    variant={getCustomerKey(selectedCustomer) === getCustomerKey(customer) ? 'secondary' : 'ghost'}
                                    className="justify-start w-full text-left h-auto py-2"
                                    onClick={() => setSelectedCustomer(customer)}
                                    >
                                    <div className="flex items-center gap-3">
                                        <div className="bg-muted rounded-full p-2">
                                        <UserIcon className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <p className="font-semibold">{customer.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {customer.code ? `${customer.code} • ` : ''}
                                                {customer.cpf}
                                            </p>
                                        </div>
                                    </div>
                                    </Button>
                                ))}
                                </div>
                            ) : (
                                <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">
                                    <Users className="mx-auto h-10 w-10" />
                                    <h3 className="mt-4 text-md font-semibold">Nenhum cliente ativo</h3>
                                    <p className="mt-1 text-xs">{searchQuery ? 'Tente uma busca diferente.' : 'Os clientes aparecerão aqui.'}</p>
                                </div>
                            )}
                        </TabsContent>
                        {canAccessTrash && (
                        <TabsContent value="deleted">
                             {filteredDeletedCustomers.length > 0 ? (
                                <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-2">
                                {filteredDeletedCustomers.map((customer) => (
                                    <div key={getCustomerKey(customer)} className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="bg-destructive/10 rounded-full p-2 flex-shrink-0">
                                                <Trash className="h-5 w-5 text-destructive" />
                                            </div>
                                            <div className="flex-grow overflow-hidden">
                                                <p className="font-semibold truncate" title={customer.name}>{customer.name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {customer.code ? `${customer.code} • ` : ''}
                                                    {customer.cpf}
                                                </p>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={() => handleRestoreCustomer(customer)}>
                                            <History className="mr-2 h-4 w-4" /> Restaurar
                                        </Button>
                                    </div>
                                ))}
                                </div>
                            ) : (
                                <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">
                                    <Trash className="mx-auto h-10 w-10" />
                                    <h3 className="mt-4 text-md font-semibold">Lixeira vazia</h3>
                                    <p className="mt-1 text-xs">Clientes excluídos aparecerão aqui.</p>
                                </div>
                            )}
                        </TabsContent>
                        )}
                    </Tabs>
                </CardContent>
            </Card>

        <Card className="lg:col-span-2">
            <CardHeader>
            <CardTitle>Detalhes do Cliente</CardTitle>
            <CardDescription>Informações cadastrais, situação do crediário e pedidos.</CardDescription>
            </CardHeader>
            <CardContent>
            {selectedCustomer ? (
                <div className="space-y-8">
                <div>
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <UserIcon className="h-5 w-5 text-primary" />
                            Informações Pessoais
                        </h3>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={handleOpenEditDialog}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                            </Button>
                            {canDeleteCustomer && (
                               <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                                     <Trash2 className="mr-2 h-4 w-4" />
                                                    Excluir Cliente
                                                </DropdownMenuItem>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Tem certeza que deseja excluir este cliente?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Esta ação moverá todos os pedidos do cliente <span className="font-bold">{selectedCustomer.name}</span> para a lixeira.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleDeleteCustomer}>
                                                        Sim, Excluir
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        <div className="flex items-center gap-2">
                            <UserIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="flex items-center gap-2 flex-wrap">
                                <span>{selectedCustomer.name}</span>
                                {!!selectedCustomer.code && (
                                    <span className="text-muted-foreground font-mono text-xs">{selectedCustomer.code}</span>
                                )}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span>{selectedCustomer.email || 'Não informado'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span>{selectedCustomer.phone} (WhatsApp)</span>
                        </div>
                        {selectedCustomer.phone2 && (
                            <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                <span>{selectedCustomer.phone2}</span>
                            </div>
                        )}
                        {selectedCustomer.phone3 && (
                            <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                <span>{selectedCustomer.phone3}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <strong className="text-muted-foreground font-mono text-xs">CPF</strong>
                            <span>{selectedCustomer.cpf || 'Não informado'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <strong className="text-muted-foreground font-mono text-xs">CÓD</strong>
                            <span>{selectedCustomer.code || '—'}</span>
                        </div>
                         {selectedCustomer.sellerName && (
                            <div className="flex items-center gap-2">
                                <UserIcon className="h-4 w-4 text-muted-foreground" />
                                <span className="font-semibold">Vendedor: <strong>{selectedCustomer.sellerName}</strong></span>
                            </div>
                        )}
                        <div className="flex items-start col-span-full gap-2 mt-2">
                            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div>
                                <p>{`${selectedCustomer.address}, ${selectedCustomer.number}${selectedCustomer.complement ? ` - ${selectedCustomer.complement}` : ''}`}</p>
                                <p className="text-muted-foreground">{`${selectedCustomer.neighborhood}, ${selectedCustomer.city}/${selectedCustomer.state} - CEP: ${selectedCustomer.zip}`}</p>
                            </div>
                        </div>
                        {selectedCustomer.observations && (
                             <div className="flex items-start col-span-full gap-2 mt-2 pt-4 border-t">
                                <FileSignature className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="font-semibold text-foreground">Observações</p>
                                    <p className="text-muted-foreground whitespace-pre-line">{selectedCustomer.observations}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-primary" />
                        Situação do Crediário
                    </h3>
                    <div className="grid gap-4 md:grid-cols-3 mb-6">
                        <Card className="bg-muted/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Total Comprado</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xl font-bold">{formatCurrency(financialsForSelectedCustomer.totalComprado)}</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-green-500/10 border-green-500/20">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Total Pago</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xl font-bold text-green-600">{formatCurrency(financialsForSelectedCustomer.totalPago)}</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-amber-500/10 border-amber-500/20">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Saldo Devedor</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xl font-bold text-amber-600">{formatCurrency(financialsForSelectedCustomer.saldoDevedor)}</p>
                            </CardContent>
                        </Card>
                    </div>
                    {ordersForSelectedCustomer.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full space-y-2">
                        {ordersForSelectedCustomer.map((order) => {
                            const isCrediario = !order.paymentMethod || order.paymentMethod === 'Crediário';
                            const allInstallmentsPaid = isCrediario &&
                                order.installmentDetails &&
                                order.installmentDetails.length > 0 &&
                                order.installmentDetails.every(inst => inst.status === 'Pago');
                            
                            const isPaidOff = allInstallmentsPaid || (order.paymentMethod && ['Pix', 'Dinheiro'].includes(order.paymentMethod));
                            const productNames = order.items.map(item => item.name).join(', ');

                            return (
                                <AccordionItem value={order.id} key={order.id} className="border-b-0 rounded-lg border bg-background">
                                    <AccordionTrigger className="p-4 hover:no-underline rounded-t-lg data-[state=open]:bg-muted/50 data-[state=open]:rounded-b-none">
                                        <div className="flex justify-between items-center w-full">
                                            <div className="text-left space-y-1">
                                                <p className="font-bold">Pedido: <span className="font-mono">{order.id}</span></p>
                                                <p className="text-xs text-muted-foreground italic truncate max-w-xs">{productNames}</p>
                                                <p className="text-sm text-muted-foreground">{format(new Date(order.date), "dd/MM/yyyy", { locale: ptBR })}</p>
                                            </div>
                                            <div className="text-right flex flex-col items-end gap-1">
                                                <p className="font-bold">{formatCurrency(order.total)}</p>
                                                {isPaidOff ? (
                                                    <Badge className="bg-green-600 hover:bg-green-700 text-primary-foreground">Quitado</Badge>
                                                ) : (
                                                    <Badge variant={getStatusVariant(order.status)}>{order.status}</Badge>
                                                )}
                                                {order.sellerName && <Badge variant="outline">{order.sellerName}</Badge>}
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <div className="p-4 pt-0 space-y-6">
                                            {(order.installmentDetails && order.installmentDetails.length > 0) ? (
                                                <Table>
                                                    <TableBody>
                                                    {(order.installmentDetails || []).map((inst) => {
                                                        const uniqueKey = `${order.id}-${inst.installmentNumber}`;
                                                        const isExpanded = expandedHistory === uniqueKey;
                                                        const remainingAmount = inst.amount - (inst.paidAmount || 0);
                                                        const isOverdue = inst.status === 'Pendente' && new Date(inst.dueDate) < new Date();
                                                        
                                                        let statusText: string = inst.status;
                                                        if (inst.status === 'Pendente' && (inst.paidAmount || 0) > 0) {
                                                            statusText = `Parcial (${formatCurrency(remainingAmount)} pendente)`;
                                                        } else if (isOverdue) {
                                                            statusText = 'Atrasado';
                                                        }
                                                        const statusVariant = inst.status === 'Pago' ? 'default' : isOverdue ? 'destructive' : 'secondary';
                                                        
                                                        return (
                                                            <React.Fragment key={uniqueKey}>
                                                                <TableRow>
                                                                    <TableCell colSpan={5} className="p-0">
                                                                        <div className='flex items-center justify-between p-3 gap-4 text-sm w-full'>
                                                                            <div className="whitespace-nowrap"><span className="font-medium">Parcela:</span> {inst.installmentNumber}/{order.installments}</div>
                                                                            <Popover open={openDueDatePopover === uniqueKey} onOpenChange={(isOpen) => setOpenDueDatePopover(isOpen ? uniqueKey : null)}>
                                                                                <PopoverTrigger asChild>
                                                                                    <Button variant={"outline"} className="w-[150px] justify-start text-left font-normal text-xs" disabled={inst.status === 'Pago'}>
                                                                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                                                                        Venc: {format(new Date(inst.dueDate), 'dd/MM/yyyy')}
                                                                                    </Button>
                                                                                </PopoverTrigger>
                                                                                <PopoverContent className="w-auto p-0">
                                                                                    <Calendar locale={ptBR} mode="single" selected={new Date(inst.dueDate)} onSelect={(date) => handleDueDateChange(order.id, inst.installmentNumber, date)} />
                                                                                </PopoverContent>
                                                                            </Popover>
                                                                            <div className="whitespace-nowrap"><span className="font-medium">Valor:</span> {formatCurrency(inst.amount)}</div>
                                                                            <div className="min-w-[150px] text-right"><Badge variant={statusVariant}>{statusText}</Badge></div>
                                                                            
                                                                            <div className="flex gap-2 justify-end ml-4">
                                                                                <Button variant="ghost" size="sm" className="bg-green-500/10 text-green-700 hover:bg-green-500/20 hover:text-green-800" onClick={() => handleSendWhatsAppReminder(order, inst)}>
                                                                                    <WhatsAppIcon />
                                                                                </Button>
                                                                                {user && (
                                                                                    <>
                                                                                        {(inst.payments && inst.payments.length > 0) && (
                                                                                            <Button variant="ghost" size="sm" onClick={() => setExpandedHistory(isExpanded ? null : uniqueKey)}>
                                                                                                <History className="mr-2 h-4 w-4" />Histórico
                                                                                            </Button>
                                                                                        )}
                                                                                        <Button variant="outline" size="sm" onClick={() => handleOpenPaymentDialog(order, inst)} disabled={inst.status === 'Pago'}>
                                                                                            <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                                                                                            Pagar
                                                                                        </Button>
                                                                                    </>
                                                                                )}
                                                                                <Button variant="outline" size="sm" asChild>
                                                                                    <Link href={`/carnet/${order.id}/${inst.installmentNumber}`} target="_blank" rel="noopener noreferrer">
                                                                                        <Printer className="mr-2 h-4 w-4" />
                                                                                        Ver
                                                                                    </Link>
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                    </TableCell>
                                                                </TableRow>
                                                                {isExpanded && (
                                                                    <TableRow>
                                                                        <TableCell colSpan={5} className="p-0 border-none">
                                                                            <div className="p-3 bg-muted/30 border-t">
                                                                                <h4 className="font-semibold text-sm mb-2">Histórico de Pagamentos da Parcela</h4>
                                                                                {(inst.payments && inst.payments.length > 0) ? (
                                                                                    <Table>
                                                                                        <TableHeader>
                                                                                            <TableRow>
                                                                                                <TableHead>Data</TableHead>
                                                                                                <TableHead>Recebido por</TableHead>
                                                                                                <TableHead>Método</TableHead>
                                                                                                <TableHead>Valor</TableHead>
                                                                                                <TableHead className='text-right'>Ação</TableHead>
                                                                                            </TableRow>
                                                                                        </TableHeader>
                                                                                        <TableBody>
                                                                                            {inst.payments.map((p, index) => (
                                                                                                <TableRow key={`${p.id}-${index}`}>
                                                                                                    <TableCell>{format(parseISO(p.date), "dd/MM/yyyy 'às' HH:mm")}</TableCell>
                                                                                                    <TableCell>{p.receivedBy}</TableCell>
                                                                                                    <TableCell>{p.method}</TableCell>
                                                                                                    <TableCell>{formatCurrency(p.amount)}</TableCell>
                                                                                                    <TableCell className="text-right">
                                                                                                        {user && (
                                                                                                            <AlertDialog>
                                                                                                                <AlertDialogTrigger asChild>
                                                                                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                                                                                                        <Undo2 className="h-4 w-4" />
                                                                                                                    </Button>
                                                                                                                </AlertDialogTrigger>
                                                                                                                <AlertDialogContent>
                                                                                                                    <AlertDialogHeader>
                                                                                                                        <AlertDialogTitle>Confirmar Estorno?</AlertDialogTitle>
                                                                                                                        <AlertDialogDescription>
                                                                                                                            Esta ação irá reverter o pagamento de {formatCurrency(p.amount)} feito em {format(parseISO(p.date), 'dd/MM/yy')}. Isso não pode ser desfeito.
                                                                                                                        </AlertDialogDescription>
                                                                                                                    </AlertDialogHeader>
                                                                                                                    <AlertDialogFooter>
                                                                                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                                                                        <AlertDialogAction onClick={() => reversePayment(order.id, inst.installmentNumber, p.id, logAction, user)}>
                                                                                                                            Sim, Estornar
                                                                                                                        </AlertDialogAction>
                                                                                                                    </AlertDialogFooter>
                                                                                                                </AlertDialogContent>
                                                                                                            </AlertDialog>
                                                                                                        )}
                                                                                                    </TableCell>
                                                                                                </TableRow>
                                                                                            ))}
                                                                                        </TableBody>
                                                                                    </Table>
                                                                                ) : <p className='text-xs text-muted-foreground'>Nenhum pagamento registrado para esta parcela.</p>}
                                                                            </div>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                    </TableBody>
                                                </Table>
                                            ) : (
                                                <p className="text-muted-foreground text-sm text-center py-4">Este pedido foi pago por {order.paymentMethod} e não possui parcelas.</p>
                                            )}
                                             <div className="flex justify-between items-center mt-4 pt-4 border-t flex-wrap gap-2">
                                                <div className="flex gap-2 items-center">
                                                    <Button variant="outline" size="sm" onClick={() => handleAssignToMe(order)}>
                                                        <UserPlus className="mr-2 h-4 w-4" />
                                                        Atribuir a Mim
                                                    </Button>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="sm">
                                                                Atribuir a Outro...
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="start">
                                                            <DropdownMenuLabel>Selecione o Vendedor</DropdownMenuLabel>
                                                            <DropdownMenuSeparator />
                                                            {sellers.map(s => (
                                                                <DropdownMenuItem key={s.id} onSelect={() => handleAssignSeller(order, s)}>
                                                                    {s.name}
                                                                </DropdownMenuItem>
                                                            ))}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                                
                                                {order.paymentMethod === 'Crediário' && (
                                                <Button variant="ghost" size="sm" asChild>
                                                    <Link href={`/carnet/${order.id}`} target="_blank" rel="noopener noreferrer">
                                                        <FileText className="mr-2 h-4 w-4" />
                                                        Ver Carnê Completo
                                                    </Link>
                                                </Button>
                                                )}
                                             </div>
                                                
                                            <div className="space-y-4 pt-4 border-t">
                                                <h4 className="font-semibold flex items-center gap-2 text-sm">
                                                    <Upload className="h-4 w-4 text-primary" />
                                                    Documentos e Anexos do Pedido
                                                </h4>
                                                <div className="grid gap-4">
                                                    <label 
                                                        htmlFor={`file-upload-${order.id}`}
                                                        className={cn(
                                                            "relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors",
                                                            dragActive ? "border-primary bg-primary/10" : "border-muted-foreground/30"
                                                        )}
                                                        onDragEnter={handleDrag}
                                                        onDragLeave={handleDrag}
                                                        onDragOver={handleDrag}
                                                        onDrop={(e) => handleDrop(e, order)}
                                                    >
                                                        <div className="text-center space-y-2 pointer-events-none">
                                                          <p className="text-sm text-muted-foreground">Arraste arquivos ou clique para adicionar</p>
                                                            <Button variant="outline" size="sm" type="button">
                                                                <Upload className="mr-2 h-4 w-4" />
                                                                Selecionar
                                                            </Button>
                                                        </div>
                                                        <Input id={`file-upload-${order.id}`} type="file" className="sr-only" multiple accept="image/*,application/pdf" onChange={(e) => handleFileChange(order, e)} />
                                                    </label>
                                                     <Button variant="outline" size="sm" onClick={() => handlePaste(order)} className="w-fit self-center">
                                                        <ClipboardPaste className="mr-2 h-4 w-4" />
                                                        Colar da área de transferência
                                                    </Button>
                                                    {(order.attachments && order.attachments.length > 0) ? (
                                                        <div className="space-y-2">
                                                            {order.attachments.map((file, index) => (
                                                                <div key={index} className="flex items-start justify-between p-2 rounded-md border bg-muted/50">
                                                                    <div className="flex-grow overflow-hidden">
                                                                        {file.type === 'image' ? (
                                                                            <button onClick={() => setImageToView(file.url)} className="flex items-start gap-3 group text-left w-full">
                                                                                <Image src={file.url} alt={file.name} width={40} height={40} className="h-10 w-10 rounded-md object-cover flex-shrink-0" />
                                                                                 <div className="flex-grow">
                                                                                    <span className="text-sm font-medium group-hover:underline break-words" title={file.name}>
                                                                                        {file.name}
                                                                                    </span>
                                                                                    {file.comment && <p className="text-xs text-muted-foreground mt-1 italic">"{file.comment}"</p>}
                                                                                     {file.addedAt && (
                                                                                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                                                                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(parseISO(file.addedAt), 'dd/MM/yy HH:mm')}</span>
                                                                                            <span className="flex items-center gap-1"><UserSquare className="h-3 w-3" />{file.addedBy}</span>
                                                                                        </div>
                                                                                     )}
                                                                                 </div>
                                                                            </button>
                                                                        ) : (
                                                                            <a href={file.url} download={file.name} className="flex items-start gap-3 group w-full">
                                                                                <FileText className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                                                                                <div className="flex-grow">
                                                                                    <span className="text-sm font-medium group-hover:underline break-words" title={file.name}>
                                                                                        {file.name}
                                                                                    </span>
                                                                                    {file.comment && <p className="text-xs text-muted-foreground mt-1 italic">"{file.comment}"</p>}
                                                                                    {file.addedAt && (
                                                                                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                                                                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(parseISO(file.addedAt), 'dd/MM/yy HH:mm')}</span>
                                                                                            <span className="flex items-center gap-1"><UserSquare className="h-3 w-3" />{file.addedBy}</span>
                                                                                        </div>
                                                                                     )}
                                                                                </div>
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex-shrink-0 flex items-center">
                                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditComment(order, index)}>
                                                                            <MessageSquarePlus className="h-4 w-4" />
                                                                        </Button>
                                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteAttachment(order, index)}>
                                                                            <X className="h-4 w-4" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-center text-sm text-muted-foreground">Nenhum documento anexado a este pedido.</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            );
                        })}
                    </Accordion>
                    ) : (
                    <p className="text-muted-foreground text-sm text-center py-8">Nenhum pedido encontrado para este cliente.</p>
                    )}
                </div>
                </div>
            ) : (
                <div className="text-center py-24 text-muted-foreground border-2 border-dashed rounded-lg">
                    <UserIcon className="mx-auto h-12 w-12" />
                    <p className="mt-4">Selecione um cliente na lista ao lado para visualizar seus detalhes.</p>
                </div>
            )}
            </CardContent>
        </Card>
        </div>

        <Dialog open={!!imageToView} onOpenChange={() => setImageToView(null)}>
            <DialogContent className="max-w-4xl h-[80vh] p-2 sm:p-4">
                <DialogHeader>
                    <DialogTitle>Visualizador de Imagem</DialogTitle>
                </DialogHeader>
                <div className="relative w-full h-full my-4">
                    {imageToView && (
                        <Image src={imageToView} alt="Visualização do anexo" fill className="object-contain" />
                    )}
                </div>
            </DialogContent>
        </Dialog>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Editar Informações do Cliente</DialogTitle>
                    <DialogDescription>
                        Faça alterações nos dados cadastrais do cliente aqui. Clique em salvar quando terminar.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-6 py-4 max-h-[70vh] overflow-y-auto px-1">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="name">Nome Completo</Label>
                            <Input id="name" name="name" value={editedInfo.name || ''} onChange={handleInputChange} />
                        </div>
                        <div>
                            <Label htmlFor="cpf">CPF</Label>
                            <Input id="cpf" name="cpf" value={editedInfo.cpf || ''} onChange={handleInputChange} />
                        </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="phone">Telefone (WhatsApp)</Label>
                            <Input id="phone" name="phone" value={editedInfo.phone || ''} onChange={handleInputChange} maxLength={15} />
                        </div>
                        <div>
                            <Label htmlFor="phone2">Telefone 2</Label>
                            <Input id="phone2" name="phone2" value={editedInfo.phone2 || ''} onChange={handleInputChange} maxLength={15} />
                        </div>
                         <div>
                            <Label htmlFor="phone3">Telefone 3</Label>
                            <Input id="phone3" name="phone3" value={editedInfo.phone3 || ''} onChange={handleInputChange} maxLength={15} />
                        </div>
                        <div>
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" name="email" type="email" value={editedInfo.email || ''} onChange={handleInputChange} />
                        </div>
                    </div>
                    <div className="grid md:grid-cols-6 gap-4">
                         <div className="md:col-span-2">
                            <Label htmlFor="zip">CEP</Label>
                            <Input id="zip" name="zip" value={editedInfo.zip || ''} onChange={handleInputChange} />
                        </div>
                        <div className="md:col-span-4">
                             <Label htmlFor="address">Endereço</Label>
                             <Input id="address" name="address" value={editedInfo.address || ''} onChange={handleInputChange} />
                        </div>
                        <div className="md:col-span-2">
                             <Label htmlFor="number">Número</Label>
                             <Input id="number" name="number" value={editedInfo.number || ''} onChange={handleInputChange} />
                        </div>
                        <div className="md:col-span-4">
                            <Label htmlFor="complement">Complemento</Label>
                            <Input id="complement" name="complement" value={editedInfo.complement || ''} onChange={handleInputChange} />
                        </div>
                        <div className="md:col-span-3">
                            <Label htmlFor="neighborhood">Bairro</Label>
                            <Input id="neighborhood" name="neighborhood" value={editedInfo.neighborhood || ''} onChange={handleInputChange} />
                        </div>
                        <div className="md:col-span-3">
                            <Label htmlFor="city">Cidade</Label>
                            <Input id="city" name="city" value={editedInfo.city || ''} onChange={handleInputChange} />
                        </div>
                         <div className="md:col-span-6">
                            <Label htmlFor="state">Estado</Label>                            <Input id="state" name="state" value={editedInfo.state || ''} onChange={handleInputChange} />
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="sellerId">Vendedor Responsável</Label>
                        <Select value={editedInfo.sellerId || 'none'} onValueChange={handleSellerChange}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione um vendedor" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Nenhum</SelectItem>
                                {sellers.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label htmlFor="observations">Observações</Label>
                        <Textarea id="observations" name="observations" value={editedInfo.observations || ''} onChange={handleInputChange} />
                    </div>
                    <div className="pt-4 border-t">
                        <Label htmlFor="password" className="flex items-center gap-2 mb-2"><KeyRound className="h-4 w-4" /> Senha de Acesso</Label>
                        <Input id="password" name="password" type="text" onChange={handleInputChange} placeholder="Deixe em branco para não alterar" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
                    <Button type="submit" onClick={handleSaveChanges}>Salvar Alterações</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        
        <Dialog open={commentDialog.open} onOpenChange={(open) => !open && setCommentDialog({ open: false })}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{commentDialog.onSave ? 'Adicionar Comentário ao Anexo' : 'Editar Comentário'}</DialogTitle>
                    <DialogDescription>
                         Adicione ou edite um comentário para o anexo.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="comment-text">Comentário</Label>
                    <Textarea 
                        id="comment-text"
                        value={commentDialog.currentComment || ''}
                        onChange={(e) => setCommentDialog(prev => ({...prev, currentComment: e.target.value}))}
                        placeholder="Ex: Comprovante de endereço, RG frente, etc."
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setCommentDialog({ open: false })}>Cancelar</Button>
                    <Button onClick={handleCommentDialogSubmit}>Salvar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        
        <Dialog open={isAddCustomerDialogOpen} onOpenChange={setIsAddCustomerDialogOpen}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Cadastrar Novo Cliente</DialogTitle>
                    <DialogDescription>
                        Preencha as informações abaixo para adicionar um novo cliente ao sistema.
                    </DialogDescription>
                </DialogHeader>
                <CustomerForm onSave={handleAddCustomer} onCancel={() => setIsAddCustomerDialogOpen(false)} />
            </DialogContent>
        </Dialog>

        {installmentToPay && orderForPayment && (
            <PaymentDialog
                isOpen={paymentDialogOpen}
                onOpenChange={setPaymentDialogOpen}
                installment={installmentToPay}
                orderId={orderForPayment.id}
                customerName={orderForPayment.customer.name}
                onSubmit={handlePaymentSubmit}
            />
        )}
    </>
  );
}
