
'use client';

import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, Shield, Store, KeyRound, ChevronDown, Clock, Moon, Sun, Menu } from 'lucide-react';
import AdminNav from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { hasAccess } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/context/PermissionsContext";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AppSection } from "@/lib/types";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import ScrollButtons from "@/components/ScrollButtons";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'A senha atual é obrigatória.'),
  newPassword: z.string().min(6, 'A nova senha deve ter pelo menos 6 caracteres.'),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'As senhas não correspondem.',
  path: ['confirmPassword'],
});

const pathToSectionMap: { [key: string]: AppSection } = {
    '/admin/pedidos': 'pedidos',
    '/admin/criar-pedido': 'criar-pedido',
    '/admin/clientes': 'clientes',
    '/admin/produtos': 'produtos',
    '/admin/categorias': 'categorias',
    '/admin/avarias': 'avarias',
    '/admin/financeiro': 'financeiro',
    '/admin/minhas-comissoes': 'minhas-comissoes',
    '/admin/auditoria': 'auditoria',
    '/admin/configuracao': 'configuracao',
    '/admin/usuarios': 'usuarios',
};

const isWithinCommercialHours = (start: string, end: string) => {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMinute] = start.split(':').map(Number);
    const startTime = startHour * 60 + startMinute;

    const [endHour, endMinute] = end.split(':').map(Number);
    const endTime = endHour * 60 + endMinute;

    return currentTime >= startTime && currentTime <= endTime;
};

function ModeToggle() {
  const { setTheme } = useTheme()
 
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Claro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Escuro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          Sistema
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AdminLayoutContent({ children }: { children: ReactNode }) {
    const { user, isAuthenticated, isLoading, logout, changeMyPassword } = useAuth();
    const { permissions, isLoading: permissionsLoading } = usePermissions();
    const { settings, isLoading: settingsLoading } = useSettings();
    const router = useRouter();
    const pathname = usePathname();
    const { toast } = useToast();
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
    const [isNavSheetOpen, setIsNavSheetOpen] = useState(false);

    const form = useForm<z.infer<typeof changePasswordSchema>>({
        resolver: zodResolver(changePasswordSchema),
        defaultValues: {
            currentPassword: '',
            newPassword: '',
            confirmPassword: ''
        }
    });

    useEffect(() => {
        const totalLoading = isLoading || permissionsLoading || settingsLoading;
        if (!totalLoading && !isAuthenticated) {
            router.push('/login');
            return;
        }

        if (!totalLoading && isAuthenticated && user && permissions) {
            // Check for commercial hours access
            if (
                settings.accessControlEnabled && 
                (user.role === 'vendedor' || user.role === 'vendedor_externo') && 
                !isWithinCommercialHours(settings.commercialHourStart || '00:00', settings.commercialHourEnd || '23:59')
            ) {
                 toast({
                    title: "Acesso Fora do Horário",
                    description: `O acesso para vendedores está disponível apenas entre ${settings.commercialHourStart} e ${settings.commercialHourEnd}.`,
                    variant: "destructive",
                    duration: Infinity,
                });
                logout();
                return;
            }


            // Check for page access permission
            const currentSection = Object.entries(pathToSectionMap)
                .filter(([path]) => pathname.startsWith(path))
                .sort((a,b) => b[0].length - a[0].length)[0]?.[1];
            
            if (currentSection && !hasAccess(user.role, currentSection, permissions)) {
                toast({
                    title: "Acesso Negado",
                    description: "Você não tem permissão para acessar esta página.",
                    variant: "destructive"
                });
                router.push('/admin');
            }
        }
    }, [isLoading, permissionsLoading, settingsLoading, isAuthenticated, user, permissions, settings, router, pathname, toast, logout]);
    
    useEffect(() => {
        setIsNavSheetOpen(false);
    }, [pathname]);

    const handlePasswordChange = async (values: z.infer<typeof changePasswordSchema>) => {
        const success = await changeMyPassword(values.currentPassword, values.newPassword);
        if (success) {
            setIsPasswordDialogOpen(false);
            form.reset();
        }
    };

    if (isLoading || permissionsLoading || settingsLoading || !isAuthenticated || !user) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <p>Verificando autenticação e permissões...</p>
            </div>
        );
    }
    
    if (pathname === '/admin') {
        return <main>{children}</main>;
    }

    return (
        <>
            <div className="container mx-auto px-4 py-8 print:p-0">
                <header className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-6 print-hidden">
                    <div className="flex items-center gap-4">
                        <Sheet open={isNavSheetOpen} onOpenChange={setIsNavSheetOpen}>
                            <SheetTrigger asChild>
                                <Button variant="outline" size="icon" className="md:hidden">
                                    <Menu />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="p-0">
                                <AdminNav />
                            </SheetContent>
                        </Sheet>
                        <Shield className="h-10 w-10 text-primary hidden sm:block" />
                        <div>
                            <h1 className="text-xl sm:text-3xl font-bold font-headline text-primary">Painel Administrativo</h1>
                            <p className="text-muted-foreground text-sm sm:text-base">Gerencie sua loja de forma fácil e rápida.</p>
                        </div>
                    </div>
                        <div className="flex items-center gap-2 sm:gap-4 self-end sm:self-center">
                            <ModeToggle />
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/">
                                <Store className="mr-2 h-4 w-4" />
                                <span className="hidden sm:inline">Voltar à Loja</span>
                            </Link>
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <div className="flex flex-col items-start pr-2">
                                        <span className="font-semibold text-sm">{user.name}</span>
                                        <span className="text-xs text-muted-foreground capitalize -mt-1">{user.role}</span>
                                    </div>
                                    <ChevronDown className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem onClick={() => setIsPasswordDialogOpen(true)}>
                                    <KeyRound className="mr-2 h-4 w-4" />
                                    <span>Alterar Senha</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => logout()} className="text-destructive focus:text-destructive">
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>Sair</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>
                <div className="print-hidden hidden md:block">
                    <AdminNav />
                </div>
                <main>{children}</main>
                <ScrollButtons />
            </div>

            <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Alterar Minha Senha</DialogTitle>
                        <DialogDescription>
                            Para sua segurança, informe sua senha atual antes de definir uma nova.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handlePasswordChange)} className="space-y-4 py-4">
                            <FormField
                                control={form.control}
                                name="currentPassword"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Senha Atual</FormLabel>
                                        <FormControl><Input type="password" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="newPassword"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nova Senha</FormLabel>
                                        <FormControl><Input type="password" placeholder="Mínimo 6 caracteres" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="confirmPassword"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Confirmar Nova Senha</FormLabel>
                                        <FormControl><Input type="password" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>Cancelar</Button>
                                <Button type="submit" disabled={form.formState.isSubmitting}>Salvar Nova Senha</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </>
    );
}


export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <AdminLayoutContent>{children}</AdminLayoutContent>
    );
}
