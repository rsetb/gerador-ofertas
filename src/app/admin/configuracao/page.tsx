

'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useSettings } from '@/context/SettingsContext';
import { useAdmin, useAdminData } from '@/context/AdminContext';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useState, useRef } from 'react';
import { Settings, Save, FileDown, Upload, AlertTriangle, RotateCcw, Trash2, Lock, History, User, Calendar, Shield, Image as ImageIcon, Clock, Package, DollarSign, Users, ShoppingCart } from 'lucide-react';
import type { RolePermissions, UserRole, AppSection, StoreSettings, CustomerInfo } from '@/lib/types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAudit } from '@/context/AuditContext';
import { usePermissions } from '@/context/PermissionsContext';
import { ALL_SECTIONS } from '@/lib/permissions';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Image from 'next/image';
import { Switch } from '@/components/ui/switch';
import { useData } from '@/context/DataContext';
import { getClientFirebase } from '@/lib/firebase-client';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const settingsSchema = z.object({
  storeName: z.string().min(3, 'O nome da loja é obrigatório.'),
  storeAddress: z.string().min(10, 'O endereço da loja é obrigatório.'),
  storeCity: z.string().min(3, 'A cidade da loja é obrigatória.'),
  pixKey: z.string().min(1, 'A chave PIX é obrigatória.'),
  storePhone: z.string().min(10, 'O telefone da loja é obrigatório.'),
  logoUrl: z.string().optional(),
  accessControlEnabled: z.boolean().optional(),
  commercialHourStart: z.string().optional(),
  commercialHourEnd: z.string().optional(),
});

function AuditLogCard() {
    const { auditLogs, isLoading } = useAudit();
    const [page, setPage] = useState(1);
    const logsPerPage = 10;

    const paginatedLogs = auditLogs.slice((page - 1) * logsPerPage, page * logsPerPage);
    const totalPages = Math.ceil(auditLogs.length / logsPerPage);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <History className="h-6 w-6" />
                    Log de Ações do Sistema
                </CardTitle>
                <CardDescription>
                    Acompanhe as ações importantes realizadas no sistema.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <p>Carregando logs...</p>
                ) : auditLogs.length > 0 ? (
                    <>
                        <div className="rounded-md border overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[180px]">Data e Hora</TableHead>
                                        <TableHead>Usuário</TableHead>
                                        <TableHead>Ação</TableHead>
                                        <TableHead>Detalhes</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedLogs.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="text-xs whitespace-nowrap">
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {format(new Date(log.timestamp), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium flex items-center gap-1"><User className="h-3 w-3" /> {log.userName}</span>
                                                    <Badge variant="secondary" className="capitalize w-fit mt-1">
                                                        <Shield className="h-3 w-3 mr-1" />
                                                        {log.userRole}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{log.action}</Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{log.details}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {totalPages > 1 && (
                            <div className="flex justify-end items-center gap-2 mt-4">
                                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border rounded text-sm disabled:opacity-50">
                                    Anterior
                                </button>
                                <span className="text-sm">
                                    Página {page} de {totalPages}
                                </span>
                                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 border rounded text-sm disabled:opacity-50">
                                    Próxima
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
                        <History className="mx-auto h-12 w-12" />
                        <h3 className="mt-4 text-lg font-semibold">Nenhum registro de auditoria</h3>
                        <p className="mt-1 text-sm">As ações realizadas no sistema aparecerão aqui.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default function ConfiguracaoPage() {
  const { settings, updateSettings, isLoading: settingsLoading, restoreSettings, resetSettings } = useSettings();
  const { restoreAdminData, resetOrders, resetProducts, resetFinancials, resetAllAdminData } = useAdmin();
  const { products, categories } = useData();
  const { orders, customers, deletedCustomers, commissionPayments, stockAudits, avarias, chatSessions } = useAdminData();
  const { user, users, restoreUsers } = useAuth();
  const { permissions, updatePermissions, isLoading: permissionsLoading, resetPermissions } = usePermissions();
  const { toast } = useToast();
  const { logAction } = useAudit();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [dialogOpenFor, setDialogOpenFor] = useState<'resetOrders' | 'resetProducts' | 'resetFinancials' | 'resetAll' | null>(null);
  const [localPermissions, setLocalPermissions] = useState<RolePermissions | null>(null);

  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
        storeName: '',
        storeCity: '',
        storeAddress: '',
        pixKey: '',
        storePhone: '',
        logoUrl: '',
        accessControlEnabled: false,
        commercialHourStart: '08:00',
        commercialHourEnd: '18:00',
    },
  });

  useEffect(() => {
    if (!settingsLoading && settings) {
      form.reset({
          ...settings,
          commercialHourStart: settings.commercialHourStart || '08:00',
          commercialHourEnd: settings.commercialHourEnd || '18:00',
      });
    }
  }, [settingsLoading, settings, form]);

  useEffect(() => {
    if (!permissionsLoading && permissions) {
        setLocalPermissions(JSON.parse(JSON.stringify(permissions)));
    }
  }, [permissionsLoading, permissions]);

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        form.setValue('logoUrl', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExport = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const date = new Date().toISOString().slice(0, 10);
    link.download = `export-${filename}-${date}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: 'Exportação Concluída!', description: `O arquivo ${filename} foi baixado.` });
  };

  const handleExportFullBackup = async () => {
    try {
      const { db } = getClientFirebase();
      const customerCodeCounterSnap = await getDoc(doc(db, 'config', 'customerCodeCounter'));
      const customerCodeCounter = customerCodeCounterSnap.exists() ? customerCodeCounterSnap.data() : null;

      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings,
        permissions,
        customerCodeCounter,
        products,
        categories,
        orders,
        customers,
        customersTrash: deletedCustomers,
        users,
        commissionPayments,
        stockAudits,
        avarias,
        chatSessions,
      };

      handleExport(backup, 'backup-completo');
    } catch (error) {
      console.error("Failed to export full backup:", error);
      toast({ title: 'Erro ao Exportar', description: 'Não foi possível gerar o backup completo.', variant: 'destructive' });
    }
  };

  const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);

        if (data.settings && data.products && data.orders && data.categories && data.users) {
          await restoreSettings(data.settings);
          await restoreAdminData({
            products: data.products,
            orders: data.orders,
            categories: data.categories,
            commissionPayments: data.commissionPayments,
            stockAudits: data.stockAudits,
            avarias: data.avarias,
            chatSessions: data.chatSessions,
            customers: data.customers,
            customersTrash: data.customersTrash,
          }, logAction, user);
          await restoreUsers(data.users);
          if (data.permissions) {
             await updatePermissions(data.permissions);
          }
          if (data.customerCodeCounter) {
            const { db } = getClientFirebase();
            await setDoc(doc(db, 'config', 'customerCodeCounter'), data.customerCodeCounter, { merge: true });
          }
        } else {
          throw new Error('Formato de arquivo de backup inválido.');
        }
      } catch (error) {
        console.error("Failed to restore backup:", error);
        toast({ title: 'Erro ao Restaurar', description: 'O arquivo de backup é inválido ou está corrompido.', variant: 'destructive' });
      } finally {
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };
  
  const handleReset = async (type: 'resetOrders' | 'resetProducts' | 'resetFinancials' | 'resetAll') => {
    setDialogOpenFor(null);
    switch (type) {
        case 'resetOrders':
            await resetOrders(logAction, user);
            toast({ title: "Ação Concluída", description: "Todos os pedidos e dados de clientes foram zerados." });
            break;
        case 'resetProducts':
            await resetProducts(logAction, user);
            toast({ title: "Ação Concluída", description: "Todos os produtos foram zerados." });
            break;
        case 'resetFinancials':
            await resetFinancials(logAction, user);
            toast({ title: "Ação Concluída", description: "O histórico de pagamentos de comissão foi zerado." });
            break;
        case 'resetAll':
            await resetAllAdminData(logAction, user);
            await restoreUsers([]); // Will trigger recreation of initial users
            await resetSettings();
            await resetPermissions();
            toast({ title: "Loja Resetada!", description: "Todos os dados foram restaurados para o padrão." });
            break;
    }
  }

  function onSubmit(values: z.infer<typeof settingsSchema>) {
    updateSettings(values);
  }

  const handlePermissionChange = (role: UserRole, section: AppSection, checked: boolean) => {
    setLocalPermissions(prev => {
        if (!prev) return null;
        let updatedPermissions = { ...prev };
        
        let rolePermissions = updatedPermissions[role] ? [...updatedPermissions[role]] : [];

        if (checked) {
            if (!rolePermissions.includes(section)) {
                rolePermissions.push(section);
            }
        } else {
            rolePermissions = rolePermissions.filter(s => s !== section);
        }

        updatedPermissions[role] = rolePermissions;
        
        return updatedPermissions;
    });
  };

  const handleSavePermissions = () => {
      if (localPermissions) {
          updatePermissions(localPermissions);
      }
  };

  if (settingsLoading || permissionsLoading) {
    return <p>Carregando configurações...</p>;
  }

  const logoPreview = form.watch('logoUrl');
  const accessControlEnabled = form.watch('accessControlEnabled');


  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Configurações da Loja
          </CardTitle>
          <CardDescription>
            Altere as informações da sua loja, como nome, endereço, chave PIX e telefone para notificações.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="storeName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Loja</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Minha Loja Incrível" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="storeAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endereço da Loja</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Ex: Rua da Loja, 123 - Centro, São Paulo/SP" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="logoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2"><ImageIcon /> Logo da Loja</FormLabel>
                     <div className="flex items-center gap-4">
                        {logoPreview ? (
                            <div className="relative w-32 h-14 rounded-md border p-1 bg-muted">
                                <Image src={logoPreview} alt="Preview do Logo" fill className="object-contain" sizes="130px"/>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-14 w-32 rounded-md border border-dashed bg-muted/50 text-muted-foreground">
                                <ImageIcon className="h-8 w-8" />
                            </div>
                        )}
                        <FormControl>
                            <Input type="file" accept="image/*" onChange={handleLogoUpload} className="max-w-xs" />
                        </FormControl>
                    </div>
                    <FormDescription>
                      Tamanho recomendado: 130px (largura) por 56px (altura).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <FormField
                    control={form.control}
                    name="storeCity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cidade da Loja (para Recibos)</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: São Paulo" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pixKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Chave PIX</FormLabel>
                        <FormControl>
                          <Input placeholder="CPF, CNPJ, Email, Telefone ou Chave Aleatória" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="storePhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                            <div className="text-green-600"><WhatsAppIcon /></div>
                            Telefone da Loja (WhatsApp)
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="5511999999999" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
              </div>
              <Button type="submit">
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Alterações
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {user?.role === 'admin' && (
        <Card>
           <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-6 w-6" />
                Controle de Acesso por Horário
              </CardTitle>
              <CardDescription>
                Restrinja o acesso de vendedores ao sistema para um horário comercial específico. Gerentes e admins não são afetados.
              </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <FormField
                            control={form.control}
                            name="accessControlEnabled"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <FormLabel className="text-base">
                                    Ativar controle de acesso por horário
                                    </FormLabel>
                                    <FormDescription>
                                    Se ativado, vendedores só poderão acessar o painel no horário definido.
                                    </FormDescription>
                                </div>
                                <FormControl>
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                                </FormItem>
                            )}
                        />
                         {accessControlEnabled && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                                <FormField
                                    control={form.control}
                                    name="commercialHourStart"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>Início do Horário Comercial</FormLabel>
                                        <FormControl>
                                            <Input type="time" {...field} value={field.value || '08:00'} />
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="commercialHourEnd"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>Fim do Horário Comercial</FormLabel>
                                        <FormControl>
                                            <Input type="time" {...field} value={field.value || '18:00'} />
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        )}
                        <Button type="submit">
                            <Save className="mr-2 h-4 w-4" />
                            Salvar Controle de Acesso
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
      )}
      
      {user?.role === 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-6 w-6" />
              Permissões de Acesso
            </CardTitle>
            <CardDescription>
              Defina quais seções cada perfil de usuário pode acessar no painel administrativo. A hierarquia é Vendedor {'<'} Gerente {'<'} Admin.
            </CardDescription>
          </CardHeader>
          <CardContent>
              {localPermissions ? (
                  <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                          <div>
                              <h3 className="font-semibold mb-4 capitalize">Vendedor</h3>
                              <div className="space-y-3">
                                  {ALL_SECTIONS.map(section => (
                                      <div key={`vendedor-${section.id}`} className="flex items-center space-x-2">
                                          <Checkbox
                                              id={`vendedor-${section.id}`}
                                              checked={localPermissions.vendedor?.includes(section.id)}
                                              onCheckedChange={(checked) => handlePermissionChange('vendedor', section.id, !!checked)}
                                          />
                                          <label
                                              htmlFor={`vendedor-${section.id}`}
                                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                          >
                                              {section.label}
                                          </label>
                                      </div>
                                  ))}
                              </div>
                          </div>

                          <div>
                              <h3 className="font-semibold mb-4 capitalize">Gerente</h3>
                               <div className="space-y-3">
                                  {ALL_SECTIONS.map(section => (
                                      <div key={`gerente-${section.id}`} className="flex items-center space-x-2">
                                          <Checkbox
                                              id={`gerente-${section.id}`}
                                              checked={localPermissions.gerente?.includes(section.id)}
                                              onCheckedChange={(checked) => handlePermissionChange('gerente', section.id, !!checked)}
                                          />
                                          <label
                                              htmlFor={`gerente-${section.id}`}
                                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                          >
                                              {section.label}
                                          </label>
                                      </div>
                                  ))}
                              </div>
                          </div>

                          <div>
                              <h3 className="font-semibold mb-4 capitalize">Admin</h3>
                              <div className="space-y-3">
                                  {ALL_SECTIONS.map(section => (
                                      <div key={`admin-${section.id}`} className="flex items-center space-x-2">
                                          <Checkbox
                                              id={`admin-${section.id}`}
                                              checked
                                              disabled
                                          />
                                          <label
                                              htmlFor={`admin-${section.id}`}
                                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                          >
                                              {section.label}
                                          </label>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      </div>
                      <Button onClick={handleSavePermissions}>
                          <Save className="mr-2 h-4 w-4" />
                          Salvar Permissões
                      </Button>
                  </div>
              ) : (
                  <p>Carregando permissões...</p>
              )}
          </CardContent>
        </Card>
      )}

      <Card>
          <CardHeader>
              <CardTitle>Backup e Restauração</CardTitle>
              <CardDescription>Salve ou recupere os dados da sua loja.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Exportar Dados</h3>
                <div className="flex flex-col sm:flex-row gap-4">
                    <Button variant="outline" onClick={handleExportFullBackup}>
                        <FileDown className="mr-2 h-4 w-4" />
                        Baixar Backup Completo
                    </Button>
                    <Button variant="outline" onClick={() => handleExport(orders, 'pedidos')}>
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Exportar Pedidos
                    </Button>
                    <Button variant="outline" onClick={() => handleExport(customers, 'clientes')}>
                        <Users className="mr-2 h-4 w-4" />
                        Exportar Clientes
                    </Button>
                    <Button variant="outline" onClick={() => handleExport(products, 'produtos')}>
                        <Package className="mr-2 h-4 w-4" />
                        Exportar Produtos
                    </Button>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2 mt-6">Restaurar Backup Completo</h3>
                 <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                   <Upload className="mr-2 h-4 w-4" />
                  Restaurar Backup
                </Button>
                <Input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleRestore} />
                 <p className="text-xs text-muted-foreground mt-2">A restauração substitui todos os dados (pedidos, produtos, categorias, usuários, etc.).</p>
              </div>
          </CardContent>
      </Card>

       <Card className="border-destructive/50">
          <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-6 w-6" />
                  Zona de Perigo
              </CardTitle>
              <CardDescription>Ações nesta área são irreversíveis. Tenha certeza do que está fazendo.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
              <AlertDialog open={dialogOpenFor === 'resetOrders'} onOpenChange={(open) => !open && setDialogOpenFor(null)}>
                  <AlertDialogTrigger asChild>
                      <Button variant="destructive" outline onClick={() => setDialogOpenFor('resetOrders')}>
                        <Trash2 className="mr-2 h-4 w-4" /> Zerar Pedidos
                      </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                      <AlertDialogHeader>
                          <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
                          <AlertDialogDescription>
                              Esta ação não pode ser desfeita. Isso irá apagar permanentemente todos os pedidos e dados de clientes associados.
                          </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleReset('resetOrders')}>Sim, zerar pedidos</AlertDialogAction>
                      </AlertDialogFooter>
                  </AlertDialogContent>
              </AlertDialog>
              <AlertDialog open={dialogOpenFor === 'resetProducts'} onOpenChange={(open) => !open && setDialogOpenFor(null)}>
                  <AlertDialogTrigger asChild>
                      <Button variant="destructive" outline onClick={() => setDialogOpenFor('resetProducts')}>
                        <Package className="mr-2 h-4 w-4" /> Zerar Produtos
                      </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                      <AlertDialogHeader>
                          <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
                          <AlertDialogDescription>
                              Esta ação não pode ser desfeita. Isso irá apagar permanentemente todos os produtos do catálogo.
                          </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleReset('resetProducts')}>Sim, zerar produtos</AlertDialogAction>
                      </AlertDialogFooter>
                  </AlertDialogContent>
              </AlertDialog>
              <AlertDialog open={dialogOpenFor === 'resetFinancials'} onOpenChange={(open) => !open && setDialogOpenFor(null)}>
                  <AlertDialogTrigger asChild>
                      <Button variant="destructive" outline onClick={() => setDialogOpenFor('resetFinancials')}>
                        <DollarSign className="mr-2 h-4 w-4" /> Zerar Financeiro
                      </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                      <AlertDialogHeader>
                          <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
                          <AlertDialogDescription>
                              Esta ação não pode ser desfeita. Isso irá apagar permanentemente todo o histórico de pagamentos de comissão.
                          </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleReset('resetFinancials')}>Sim, zerar financeiro</AlertDialogAction>
                      </AlertDialogFooter>
                  </AlertDialogContent>
              </AlertDialog>

               <AlertDialog open={dialogOpenFor === 'resetAll'} onOpenChange={(open) => !open && setDialogOpenFor(null)}>
                  <AlertDialogTrigger asChild>
                      <Button variant="destructive" onClick={() => setDialogOpenFor('resetAll')}>
                          <RotateCcw className="mr-2 h-4 w-4" /> Resetar Loja
                      </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                      <AlertDialogHeader>
                          <AlertDialogTitle>Você realmente quer resetar toda a loja?</AlertDialogTitle>
                          <AlertDialogDescription>
                              Esta ação é irreversível. Todos os produtos, pedidos, clientes e categorias serão apagados. A loja voltará ao estado inicial, como se tivesse acabado de ser instalada.
                          </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                           <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleReset('resetAll')}>Sim, resetar toda a loja</AlertDialogAction>
                      </AlertDialogFooter>
                  </AlertDialogContent>
              </AlertDialog>
          </CardContent>
       </Card>
        
        <AuditLogCard />
    </div>
  );
}
