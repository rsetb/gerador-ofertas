

'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { CustomerInfo, Order } from '@/lib/types';
import { getClientFirebase } from '@/lib/firebase-client';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface CustomerAuthContextType {
  customer: CustomerInfo | null;
  customerOrders: Order[];
  login: (cpf: string, pass: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

const CUSTOMER_ORDERS_CACHE_TTL_MS = 5 * 60 * 1000;

export const CustomerAuthProvider = ({ children }: { children: ReactNode }) => {
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const isQuotaExceeded = (error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as any).code) : '';
    return code === 'resource-exhausted' || /quota exceeded/i.test(message);
  };

  const readOrdersCache = (cpf: string): Order[] | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(`adcpro/customerOrders/${cpf}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Order[];
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const readOrdersCacheTs = (cpf: string): number | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(`adcpro/customerOrders/${cpf}__ts`);
      const ts = raw ? Number(raw) : NaN;
      return Number.isFinite(ts) ? ts : null;
    } catch {
      return null;
    }
  };

  const writeOrdersCache = (cpf: string, orders: Order[]) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(`adcpro/customerOrders/${cpf}`, JSON.stringify(orders));
      localStorage.setItem(`adcpro/customerOrders/${cpf}__ts`, String(Date.now()));
    } catch {}
  };
  
  useEffect(() => {
    setIsLoading(true);
    try {
        const storedCustomer = localStorage.getItem('customer');
        if (storedCustomer) {
            setCustomer(JSON.parse(storedCustomer));
        }
    } catch (error) {
        console.error("Failed to read customer from localStorage", error);
        localStorage.removeItem('customer');
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pathname.startsWith('/area-cliente')) {
        return;
    }
    if (!customer?.cpf) {
        setCustomerOrders([]);
        return;
    }

    const cpf = customer.cpf.replace(/\D/g, '');
    const now = Date.now();
    const cached = readOrdersCache(cpf);
    const cachedTs = readOrdersCacheTs(cpf);
    const hasFreshCache = cachedTs !== null && now - cachedTs < CUSTOMER_ORDERS_CACHE_TTL_MS;

    if (cached && cached.length > 0) {
      setCustomerOrders(cached);
      if (hasFreshCache) return;
    }

    void (async () => {
      const { db } = getClientFirebase();
      const ordersRef = collection(db, 'orders');
      const q = query(ordersRef, where('customer.cpf', '==', cpf));

      try {
        const querySnapshot = await getDocs(q);
        const ordersData = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Order));
        setCustomerOrders(ordersData);
        writeOrdersCache(cpf, ordersData);
      } catch (error) {
        console.error('Error fetching customer orders: ', error);
        if (isQuotaExceeded(error)) {
          const fallback = readOrdersCache(cpf);
          if (fallback && fallback.length > 0) {
            setCustomerOrders(fallback);
          }
          toast({
            title: 'Indisponível no momento',
            description: 'Limite do Firebase atingido (quota). Tente novamente mais tarde.',
            variant: 'destructive',
          });
        }
      }
    })();

    return () => {};
  }, [customer, pathname]);

  const login = async (cpf: string, pass: string): Promise<boolean> => {
    const { db } = getClientFirebase();
    const normalizedCpf = cpf.replace(/\D/g, '');
    
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('customer.cpf', '==', normalizedCpf));

    try {
        const querySnapshot = await getDocs(q);
        
        const customerOrders = querySnapshot.docs.map(doc => doc.data() as Order);

        if (customerOrders.length === 0) {
             toast({ title: 'Falha no Login', description: 'CPF não encontrado.', variant: 'destructive' });
             return false;
        }
        
        const latestCustomerData = customerOrders
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .find(o => o.customer.password)?.customer;

        if (!latestCustomerData || !latestCustomerData.password) {
            toast({ title: 'Falha no Login', description: 'Esta conta ainda não possui uma senha cadastrada. Por favor, complete uma nova compra para criar uma.', variant: 'destructive' });
            return false;
        }

        if (latestCustomerData.password === pass) {
            const customerToStore = { ...latestCustomerData };
            delete customerToStore.password;
            
            setCustomer(customerToStore); 
            localStorage.setItem('customer', JSON.stringify(customerToStore));
            router.push('/area-cliente/minha-conta');
            toast({
                title: 'Login bem-sucedido!',
                description: `Bem-vindo(a) de volta, ${customerToStore.name.split(' ')[0]}.`,
            });
            return true;
        } else {
            toast({
                title: 'Falha no Login',
                description: 'Senha inválida.',
                variant: 'destructive',
            });
            return false;
        }

    } catch (error) {
        console.error("Error during login:", error);
        toast({ title: 'Erro de Autenticação', description: 'Não foi possível verificar suas credenciais. Tente novamente.', variant: 'destructive' });
        return false;
    }
  };

  const logout = () => {
    setCustomer(null);
    localStorage.removeItem('customer');
    router.push('/area-cliente/login');
  };

  const value = useMemo(() => ({
    customer,
    customerOrders,
    login,
    logout,
    isLoading,
    isAuthenticated: !!customer,
  }), [customer, customerOrders, isLoading]);


  return (
    <CustomerAuthContext.Provider value={value}>
      {children}
    </CustomerAuthContext.Provider>
  );
};

export const useCustomerAuth = () => {
  const context = useContext(CustomerAuthContext);
  if (context === undefined) {
    throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  }
  return context;
};
