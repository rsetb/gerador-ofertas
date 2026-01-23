

'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useRef } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { getClientFirebase } from '@/lib/firebase-client';
import type { Product, Category, Order, CommissionPayment, StockAudit, Avaria, CustomerInfo, ChatSession } from '@/lib/types';

// This context now only handles PUBLIC data.
// Admin-related data has been moved to AdminContext for performance optimization.
interface DataContextType {
  products: Product[];
  categories: Category[];
  isLoading: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const CACHE_TTL_MS = 10 * 60 * 1000;

const loadCache = <T,>(key: string): T | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const loadCacheTimestamp = (key: string): number | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${key}__ts`);
    const ts = raw ? Number(raw) : NaN;
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
};

const saveCache = (key: string, data: unknown) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(`${key}__ts`, String(Date.now()));
  } catch {
  }
};

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const lastGoodProductsRef = useRef<Product[]>([]);

  useEffect(() => {
    const { db } = getClientFirebase();
    const now = Date.now();

    const isQuotaExceeded = (error: unknown) => {
      const message = error instanceof Error ? error.message : '';
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as any).code) : '';
      return code === 'resource-exhausted' || /quota exceeded/i.test(message);
    };

    const isEmptyProductsAllowed = () => {
      if (typeof window === 'undefined') return false;
      try {
        const raw = localStorage.getItem('allowEmptyProductsUntil');
        const until = raw ? Number(raw) : 0;
        return Number.isFinite(until) && until > Date.now();
      } catch {
        return false;
      }
    };

    const applyProducts = (nextProducts: Product[]) => {
      if (nextProducts.length > 0) {
        setProducts(nextProducts);
        saveCache('productsCache', nextProducts);
        lastGoodProductsRef.current = nextProducts;
        return;
      }

      if (isEmptyProductsAllowed()) {
        setProducts([]);
        saveCache('productsCache', []);
        lastGoodProductsRef.current = [];
        return;
      }

      if (lastGoodProductsRef.current.length > 0) {
        setProducts(lastGoodProductsRef.current);
        return;
      }

      setProducts([]);
    };

    const cachedProducts = loadCache<Product[]>('productsCache');
    const cachedProductsTs = loadCacheTimestamp('productsCache');
    const hasFreshProductsCache =
      !!cachedProducts &&
      cachedProducts.length > 0 &&
      cachedProductsTs !== null &&
      now - cachedProductsTs < CACHE_TTL_MS;
    if (cachedProducts && cachedProducts.length > 0) {
      setProducts(cachedProducts);
      lastGoodProductsRef.current = cachedProducts;
      setProductsLoading(false);
    }

    const cachedCategories = loadCache<Category[]>('categoriesCache');
    const cachedCategoriesTs = loadCacheTimestamp('categoriesCache');
    const hasFreshCategoriesCache =
      !!cachedCategories &&
      cachedCategories.length > 0 &&
      cachedCategoriesTs !== null &&
      now - cachedCategoriesTs < CACHE_TTL_MS;
    if (cachedCategories && cachedCategories.length > 0) {
      setCategories(cachedCategories);
      setCategoriesLoading(false);
    }

    const fetchOnce = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setProductsLoading(false);
        setCategoriesLoading(false);
        return;
      }
      if (!hasFreshProductsCache) {
        try {
          const productsSnapshot = await getDocs(query(collection(db, 'products'), orderBy('createdAt', 'asc')));
          const fetchedProducts = productsSnapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Product));
          applyProducts(fetchedProducts);
        } catch (error) {
          console.error('Error fetching products:', error);
          if (isQuotaExceeded(error)) {
            if (cachedProducts && cachedProducts.length > 0) {
              setProducts(cachedProducts);
              lastGoodProductsRef.current = cachedProducts;
            }
          }
        } finally {
          setProductsLoading(false);
        }
      } else {
        setProductsLoading(false);
      }

      if (!hasFreshCategoriesCache) {
        try {
          const categoriesSnapshot = await getDocs(query(collection(db, 'categories'), orderBy('order')));
          const fetchedCategories = categoriesSnapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Category));
          setCategories(fetchedCategories);
          saveCache('categoriesCache', fetchedCategories);
        } catch (error) {
          console.error('Error fetching categories:', error);
          if (isQuotaExceeded(error)) {
            if (cachedCategories && cachedCategories.length > 0) {
              setCategories(cachedCategories);
            }
          }
        } finally {
          setCategoriesLoading(false);
        }
      } else {
        setCategoriesLoading(false);
      }
    };

    const onOnline = () => {
      fetchOnce();
    };

    fetchOnce();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline);
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline);
      }
    };
  }, []);

  const isLoading = productsLoading || categoriesLoading;

  const value = useMemo(() => ({
    products, 
    categories, 
    isLoading,
  }), [
    products, 
    categories, 
    isLoading,
  ]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

export const useData = (): DataContextType => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
