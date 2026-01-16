'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { PermissionsProvider } from '@/context/PermissionsContext';
import { AdminProvider } from '@/context/AdminContext';
import AdminNav from '@/components/AdminNav';
import { useAuth } from '@/context/AuthContext';
import { Button, buttonVariants } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ArrowLeft, ChevronDown, Moon, Shield, Sun } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { UserRole } from '@/lib/types';

const getRoleLabel = (role: UserRole) => {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'gerente':
      return 'Gerente';
    case 'vendedor':
      return 'Vendedor';
    case 'vendedor_externo':
      return 'Vendedor Externo';
    default:
      return role;
  }
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';
  const userRoleLabel = useMemo(() => (user?.role ? getRoleLabel(user.role) : ''), [user?.role]);

  return (
    <PermissionsProvider>
      <AdminProvider>
        <div className="min-h-screen bg-muted/30">
          <div className="border-b bg-background">
            <div className="container mx-auto flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 h-6 w-6 text-primary" />
                <div className="min-w-0">
                  <p className="text-lg font-semibold leading-none">Painel Administrativo</p>
                  <p className="text-sm text-muted-foreground">Gerencie sua loja de forma fácil e rápida.</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex items-center gap-2 pr-1">
                  <Sun className="hidden sm:block h-4 w-4 text-muted-foreground" aria-hidden />
                  <Switch
                    checked={!!isDark}
                    onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                    aria-label="Alternar tema claro/escuro"
                  />
                  <Moon className="hidden sm:block h-4 w-4 text-muted-foreground" aria-hidden />
                </div>

                <Link
                  href="/"
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar a Loja
                </Link>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={!user || isLoading}>
                      <span className="flex min-w-0 flex-col items-start leading-none">
                        <span className="truncate text-xs text-muted-foreground">
                          {user?.name || 'Carregando...'}
                        </span>
                        <span className="truncate text-xs font-semibold">{userRoleLabel || ' '}</span>
                      </span>
                      <ChevronDown className="ml-2 h-4 w-4 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Conta</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} disabled={!user}>
                      Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          <main className="container mx-auto p-4">
            <AdminNav />
            {children}
          </main>
        </div>
      </AdminProvider>
    </PermissionsProvider>
  );
}
