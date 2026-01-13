

'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useRef } from 'react';
import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
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

const loadCache = <T,>(key: string): T | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const saveCache = (key: string, data: unknown) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
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
    if (cachedProducts && cachedProducts.length > 0) {
      setProducts(cachedProducts);
      lastGoodProductsRef.current = cachedProducts;
      setProductsLoading(false);
    }

    const cachedCategories = loadCache<Category[]>('categoriesCache');
    if (cachedCategories && cachedCategories.length > 0) {
      setCategories(cachedCategories);
      setCategoriesLoading(false);
    }

    const fetchOnce = async () => {
      try {
        const productsSnapshot = await getDocs(query(collection(db, 'products'), orderBy('createdAt', 'asc')));
        const fetchedProducts = productsSnapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Product));
        applyProducts(fetchedProducts);
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setProductsLoading(false);
      }

      try {
        const categoriesSnapshot = await getDocs(query(collection(db, 'categories'), orderBy('order')));
        const fetchedCategories = categoriesSnapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Category));
        setCategories(fetchedCategories);
        saveCache('categoriesCache', fetchedCategories);
      } catch (error) {
        console.error('Error fetching categories:', error);
      } finally {
        setCategoriesLoading(false);
      }
    };

    fetchOnce();

    const productsUnsubscribe = onSnapshot(query(collection(db, 'products'), orderBy('createdAt', 'asc')), (snapshot) => {
      const fetchedProducts = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Product));
      applyProducts(fetchedProducts);
      setProductsLoading(false);
    }, (error) => {
        console.error("Error fetching products:", error);
        setProductsLoading(false);
    });

    const categoriesUnsubscribe = onSnapshot(query(collection(db, 'categories'), orderBy('order')), (snapshot) => {
      const fetchedCategories = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Category));
      setCategories(fetchedCategories);
      saveCache('categoriesCache', fetchedCategories);
      setCategoriesLoading(false);
    }, (error) => {
        console.error("Error fetching categories:", error);
        setCategoriesLoading(false);
    });
    
    return () => {
      productsUnsubscribe();
      categoriesUnsubscribe();
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
