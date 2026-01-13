'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionsContext';
import { ALL_SECTIONS, hasAccess } from '@/lib/permissions';

export default function AdminRootPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { permissions, isLoading: permissionsLoading } = usePermissions();

  useEffect(() => {
    if (isLoading || permissionsLoading) return;
    if (!isAuthenticated || !user || !permissions) {
      router.replace('/login');
      return;
    }

    const firstAccessible = ALL_SECTIONS.find((s) => hasAccess(user.role, s.id, permissions));
    router.replace(`/admin/${firstAccessible?.id || 'pedidos'}`);
  }, [router, isLoading, permissionsLoading, isAuthenticated, user, permissions]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
        <p>Redirecionando para o painel...</p>
    </div>
  );
}
