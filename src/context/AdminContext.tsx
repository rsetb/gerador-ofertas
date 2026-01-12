

'use client';

import React, { createContext, useContext, ReactNode, useCallback, useState, useEffect, useMemo } from 'react';
import type { Order, Product, Installment, CustomerInfo, Category, User, CommissionPayment, Payment, StockAudit, Avaria, ChatSession } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { getClientFirebase } from '@/lib/firebase-client';
import { collection, doc, writeBatch, setDoc, updateDoc, deleteDoc, getDocs, query, orderBy, onSnapshot } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useData } from './DataContext';
import { addMonths, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from './AuthContext';
import { allocateNextCustomerCode, formatCustomerCode, reserveCustomerCodes } from '@/lib/customer-code';

// Helper function to log actions, passed as an argument now
type LogAction = (action: string, details: string, user: User | null) => void;

// Moved from utils to avoid server-side execution
const calculateCommission = (order: Order, allProducts: Product[]) => {
    // If a commission was set manually on the order, it takes precedence.
    if (order.isCommissionManual && typeof order.commission === 'number') {
        return order.commission;
    }
    
    // If the order has no seller, there's no commission.
    if (!order.sellerId) {
        return 0;
    }

    // Otherwise, calculate based on product rules.
    return order.items.reduce((totalCommission, item) => {
        const product = allProducts.find(p => p.id === item.id);
        
        // If product doesn't exist in catalog (e.g., custom item) or has no commission value, skip it.
        if (!product || typeof product.commissionValue === 'undefined' || product.commissionValue === null) {
            return totalCommission;
        }
        
        const commissionType = product.commissionType || 'percentage'; // Default to percentage
        const commissionValue = product.commissionValue;

        if (commissionType === 'fixed') {
            return totalCommission + (commissionValue * item.quantity);
        }
        
        if (commissionType === 'percentage') {
            const itemTotal = item.price * item.quantity;
            return totalCommission + (itemTotal * (commissionValue / 100));
        }
        
        return totalCommission;
    }, 0);
};

function recalculateInstallments(total: number, installmentsCount: number, orderId: string, firstDueDate: string): Installment[] {
    if (installmentsCount <= 0 || total < 0) return [];
    
    const totalInCents = Math.round(total * 100);
    const baseInstallmentValueInCents = Math.floor(totalInCents / installmentsCount);
    let remainderInCents = totalInCents % installmentsCount;

    const newInstallmentDetails: Installment[] = [];
    
    for (let i = 0; i < installmentsCount; i++) {
        let installmentValueCents = baseInstallmentValueInCents;
        if (remainderInCents > 0) {
            installmentValueCents++;
            remainderInCents--;
        }
        
        newInstallmentDetails.push({
            id: `inst-${orderId}-${i + 1}`,
            installmentNumber: i + 1,
            amount: installmentValueCents / 100,
            dueDate: addMonths(new Date(firstDueDate), i).toISOString(),
            status: 'Pendente',
            paidAmount: 0,
            payments: [],
        });
    }

    return newInstallmentDetails;
}

function sanitizeCustomerForFirestore(customer: CustomerInfo): Record<string, any> {
    const obj: Record<string, any> = {};
    Object.entries(customer).forEach(([key, value]) => {
        if (value !== undefined) obj[key] = value;
    });
    if (obj.password === undefined || obj.password === '') {
        delete obj.password;
    }
    return obj;
}


interface AdminContextType {
  addOrder: (order: Partial<Order> & { firstDueDate: Date }, logAction: LogAction, user: User | null) => Promise<Order | null>;
  generateCustomerCodes: (logAction: LogAction, user: User | null) => Promise<{ newCustomers: number; updatedOrders: number }>;
  deleteOrder: (orderId: string, logAction: LogAction, user: User | null) => Promise<void>;
  permanentlyDeleteOrder: (orderId: string, logAction: LogAction, user: User | null) => Promise<void>;
  updateOrderStatus: (orderId: string, status: Order['status'], logAction: LogAction, user: User | null) => Promise<void>;
  recordInstallmentPayment: (orderId: string, installmentNumber: number, payment: Omit<Payment, 'receivedBy'>, logAction: LogAction, user: User | null) => Promise<void>;
  reversePayment: (orderId: string, installmentNumber: number, paymentId: string, logAction: LogAction, user: User | null) => Promise<void>;
  updateInstallmentDueDate: (orderId: string, installmentNumber: number, newDueDate: Date, logAction: LogAction, user: User | null) => Promise<void>;
  updateInstallmentAmount: (orderId: string, installmentNumber: number, newAmount: number, logAction: LogAction, user: User | null) => Promise<void>;
  updateCustomer: (oldCustomer: CustomerInfo, updatedCustomerData: CustomerInfo, logAction: LogAction, user: User | null) => Promise<void>;
  deleteCustomer: (customer: CustomerInfo, logAction: LogAction, user: User | null) => Promise<void>;
  importCustomers: (csvData: string, logAction: LogAction, user: User | null) => Promise<void>;
  updateOrderDetails: (orderId: string, details: Partial<Order> & { downPayment?: number, resetDownPayment?: boolean }, logAction: LogAction, user: User | null) => Promise<void>;
  addProduct: (productData: Omit<Product, 'id' | 'data-ai-hint' | 'createdAt'>, logAction: LogAction, user: User | null) => Promise<void>;
  updateProduct: (product: Product, logAction: LogAction, user: User | null) => Promise<void>;
  deleteProduct: (productId: string, logAction: LogAction, user: User | null) => Promise<void>;
  addCategory: (categoryName: string, logAction: LogAction, user: User | null) => Promise<void>;
  deleteCategory: (categoryId: string, logAction: LogAction, user: User | null) => Promise<void>;
  updateCategoryName: (categoryId: string, newName: string, logAction: LogAction, user: User | null) => Promise<void>;
  addSubcategory: (categoryId: string, subcategoryName: string, logAction: LogAction, user: User | null) => Promise<void>;
  updateSubcategory: (categoryId: string, oldSub: string, newSub: string, logAction: LogAction, user: User | null) => Promise<void>;
  deleteSubcategory: (categoryId: string, subcategoryName: string, logAction: LogAction, user: User | null) => Promise<void>;
  moveCategory: (categoryId: string, direction: 'up' | 'down', logAction: LogAction, user: User | null) => Promise<void>;
  reorderSubcategories: (categoryId: string, draggedSub: string, targetSub: string, logAction: LogAction, user: User | null) => Promise<void>;
  moveSubcategory: (sourceCategoryId: string, subName: string, targetCategoryId: string, logAction: LogAction, user: User | null) => Promise<void>;
  payCommissions: (sellerId: string, sellerName: string, amount: number, orderIds: string[], period: string, logAction: LogAction, user: User | null) => Promise<string | null>;
  reverseCommissionPayment: (paymentId: string, logAction: LogAction, user: User | null) => Promise<void>;
  restoreAdminData: (data: { products: Product[], orders: Order[], categories: Category[] }, logAction: LogAction, user: User | null) => Promise<void>;
  resetOrders: (logAction: LogAction, user: User | null) => Promise<void>;
  resetProducts: (logAction: LogAction, user: User | null) => Promise<void>;
  resetFinancials: (logAction: LogAction, user: User | null) => Promise<void>;
  resetAllAdminData: (logAction: LogAction, user: User | null) => Promise<void>;
  saveStockAudit: (audit: StockAudit, logAction: LogAction, user: User | null) => Promise<void>;
  addAvaria: (avariaData: Omit<Avaria, 'id' | 'createdAt' | 'createdBy' | 'createdByName'>, logAction: LogAction, user: User | null) => Promise<void>;
  updateAvaria: (avariaId: string, avariaData: Partial<Omit<Avaria, 'id'>>, logAction: LogAction, user: User | null) => Promise<void>;
  deleteAvaria: (avariaId: string, logAction: LogAction, user: User | null) => Promise<void>;
  emptyTrash: (logAction: LogAction, user: User | null) => Promise<void>;
  // Admin Data states
  orders: Order[];
  commissionPayments: CommissionPayment[];
  stockAudits: StockAudit[];
  avarias: Avaria[];
  chatSessions: ChatSession[];
  customers: CustomerInfo[];
  deletedCustomers: CustomerInfo[];
  customerOrders: { [key: string]: Order[] };
  customerFinancials: { [key: string]: { totalComprado: number, totalPago: number, saldoDevedor: number } };
  financialSummary: { totalVendido: number, totalRecebido: number, totalPendente: number, lucroBruto: number, monthlyData: { name: string, total: number }[] };
  commissionSummary: { totalPendingCommission: number, commissionsBySeller: { id: string; name: string; total: number; count: number; orderIds: string[] }[] };
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider = ({ children }: { children: ReactNode }) => {
  const { products, categories } = useData();
  const { toast } = useToast();
  const { user, users } = useAuth();

  // Admin data states, now managed here
  const [orders, setOrders] = useState<Order[]>([]);
  const [commissionPayments, setCommissionPayments] = useState<CommissionPayment[]>([]);
  const [stockAudits, setStockAudits] = useState<StockAudit[]>([]);
  const [avarias, setAvarias] = useState<Avaria[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);

  // Effect for fetching admin-specific data
  useEffect(() => {
    const { db } = getClientFirebase();
    const unsubscribes: (() => void)[] = [];

    const setupListener = (collectionName: string, setter: React.Dispatch<React.SetStateAction<any[]>>, orderField = 'createdAt') => {
        const q = query(collection(db, collectionName), orderBy(orderField, 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setter(snapshot.docs.map(d => ({ ...d.data(), id: d.id })));
        }, (error) => console.error(`Error fetching ${collectionName}:`, error));
        unsubscribes.push(unsubscribe);
    };

    setupListener('orders', setOrders, 'date');
    setupListener('commissionPayments', setCommissionPayments, 'paymentDate');
    setupListener('stockAudits', setStockAudits);
    setupListener('avarias', setAvarias);
    
    return () => unsubscribes.forEach(unsub => unsub());
  }, []);

  // Memos for derived data, now living in AdminContext
  const { customers, deletedCustomers } = useMemo(() => {
    const customerMap = new Map<string, { customer: CustomerInfo, hasActiveOrder: boolean }>();
    const sortedOrders = [...orders].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    sortedOrders.forEach(order => {
        const customerKey = order.customer.cpf ? order.customer.cpf.replace(/\D/g, '') : `${order.customer.name}-${order.customer.phone}`;
        if (!customerKey) return;

        const existing = customerMap.get(customerKey);
        
        if (!existing) {
             customerMap.set(customerKey, { customer: order.customer, hasActiveOrder: order.status !== 'Excluído' });
        } else if (order.status !== 'Excluído') {
            existing.hasActiveOrder = true;
        }
    });
    
    const all = Array.from(customerMap.values());
    const active = all.filter(item => item.hasActiveOrder).map(item => item.customer).sort((a, b) => a.name.localeCompare(b.name));
    const deleted = all.filter(item => !item.hasActiveOrder).map(item => item.customer).sort((a, b) => a.name.localeCompare(b.name));

    return { customers: active, deletedCustomers: deleted };
  }, [orders]);
  
  const customerOrders = useMemo(() => {
    const ordersByCustomer: { [key: string]: Order[] } = {};
    orders.forEach(order => {
        const customerKey = order.customer.cpf?.replace(/\D/g, '') || `${order.customer.name}-${order.customer.phone}`;
        if (!ordersByCustomer[customerKey]) {
          ordersByCustomer[customerKey] = [];
        }
        ordersByCustomer[customerKey].push(order);
    });
    for(const key in ordersByCustomer) {
        ordersByCustomer[key].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return ordersByCustomer;
  }, [orders]);

  const customerFinancials = useMemo(() => {
      const financialsByCustomer: { [key: string]: { totalComprado: number, totalPago: number, saldoDevedor: number } } = {};
      const allCustomers = [...customers, ...deletedCustomers];
      allCustomers.forEach(customer => {
        const customerKey = customer.cpf?.replace(/\D/g, '') || `${customer.name}-${customer.phone}`;
        const ordersForCustomer = (customerOrders[customerKey] || []).filter(o => o.status !== 'Excluído' && o.status !== 'Cancelado');
        
        const allInstallments = ordersForCustomer.flatMap(order => order.installmentDetails || []);
        const totalComprado = ordersForCustomer.reduce((acc, order) => acc + order.total, 0);
        const totalPago = allInstallments.reduce((sum, inst) => sum + (inst.paidAmount || 0), 0);
        const saldoDevedor = totalComprado - totalPago;
        financialsByCustomer[customerKey] = { totalComprado, totalPago, saldoDevedor };
      });
      return financialsByCustomer;
  }, [customers, deletedCustomers, customerOrders]);

  const financialSummary = useMemo(() => {
    let totalVendido = 0;
    let totalRecebido = 0;
    let totalPendente = 0;
    let lucroBruto = 0;
    const monthlySales: { [key: string]: number } = {};

    orders.forEach(order => {
      if (order.status !== 'Cancelado' && order.status !== 'Excluído') {
        totalVendido += order.total;

        order.items.forEach(item => {
            const product = products.find(p => p.id === item.id);
            const cost = product?.cost || 0;
            const itemRevenue = item.price * item.quantity;
            const itemCost = cost * item.quantity;
            lucroBruto += (itemRevenue - itemCost);
        });

        const monthKey = format(parseISO(order.date), 'MMM/yy', { locale: ptBR });
        if (!monthlySales[monthKey]) {
          monthlySales[monthKey] = 0;
        }
        monthlySales[monthKey] += order.total;

        if (order.paymentMethod === 'Crediário') {
            (order.installmentDetails || []).forEach(inst => {
            if (inst.status === 'Pago') {
                totalRecebido += inst.paidAmount || inst.amount;
            } else {
                totalRecebido += inst.paidAmount || 0;
                totalPendente += inst.amount - (inst.paidAmount || 0);
            }
            });
        } else {
            totalRecebido += order.total;
        }
      }
    });
    
    const monthlyData = Object.entries(monthlySales).map(([name, total]) => ({ name, total })).reverse();

    return { totalVendido, totalRecebido, totalPendente, lucroBruto, monthlyData };
  }, [orders, products]);
  
  const commissionSummary = useMemo(() => {
    const sellerCommissions = new Map<string, { name: string; total: number; count: number; orderIds: string[] }>();

    orders.forEach(order => {
        if (order.status === 'Entregue' && order.sellerId && typeof order.commission === 'number' && order.commission > 0 && !order.commissionPaid) {
            const sellerId = order.sellerId;
            const sellerName = order.sellerName || users.find(u => u.id === sellerId)?.name || 'Vendedor Desconhecido';
            
            const current = sellerCommissions.get(sellerId) || { name: sellerName, total: 0, count: 0, orderIds: [] };
            current.total += order.commission;
            current.count += 1;
            current.orderIds.push(order.id);
            sellerCommissions.set(sellerId, current);
        }
    });

    const commissionsBySeller = Array.from(sellerCommissions.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a,b) => b.total - a.total);

    const totalPendingCommission = commissionsBySeller.reduce((acc, seller) => acc + seller.total, 0);

    return { totalPendingCommission, commissionsBySeller };
  }, [orders, users]);
  
  const restoreAdminData = useCallback(async (data: { products: Product[], orders: Order[], categories: Category[] }, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const BATCH_LIMIT = 400;

    const processCollectionInBatches = async (collectionName: string, dataArray: any[], currentData: any[]) => {
        // Step 1: Delete all existing documents in the collection
        if (currentData.length > 0) {
            let deleteBatch = writeBatch(db);
            let deleteCount = 0;
            for (const docSnapshot of currentData) {
                deleteBatch.delete(doc(db, collectionName, docSnapshot.id));
                deleteCount++;
                if (deleteCount >= BATCH_LIMIT) {
                    await deleteBatch.commit();
                    deleteBatch = writeBatch(db);
                    deleteCount = 0;
                }
            }
            if (deleteCount > 0) {
                await deleteBatch.commit();
            }
        }
        
        // Step 2: Write new documents from the backup file
        if (dataArray && dataArray.length > 0) {
            let writeBatchOp = writeBatch(db);
            let writeCount = 0;
            for (const item of dataArray) {
                const docId = item.id || doc(collection(db, collectionName)).id;
                writeBatchOp.set(doc(db, collectionName, docId), { ...item, id: docId });
                writeCount++;
                if (writeCount >= BATCH_LIMIT) {
                    await writeBatchOp.commit();
                    writeBatchOp = writeBatch(db);
                    writeCount = 0;
                }
            }
            if (writeCount > 0) {
                await writeBatchOp.commit();
            }
        }
    };

    try {
        await processCollectionInBatches('products', data.products, products);
        await processCollectionInBatches('orders', data.orders, orders);
        await processCollectionInBatches('categories', data.categories, categories);
        
        logAction('Restauração de Backup', 'Todos os dados de produtos, pedidos e categorias foram restaurados.', user);
        toast({ title: 'Dados restaurados com sucesso!' });
    } catch (error) {
        console.error("Error restoring data:", error);
        toast({ title: 'Erro ao Restaurar', description: 'Falha na operação de escrita no banco de dados. Verifique o console para mais detalhes.', variant: 'destructive'});
        // This is a critical failure, we re-throw to let the caller know.
        throw new FirestorePermissionError({
            path: 'multiple collections',
            operation: 'write',
        });
    }
  }, [products, orders, categories, toast]);


  const resetOrders = useCallback(async (logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const batch = writeBatch(db);
    // Only delete orders that are NOT registration-only orders
    orders.forEach(o => {
        if (o.items.length > 0) {
            batch.delete(doc(db, 'orders', o.id));
        }
    });
    
    batch.commit().then(() => {
        logAction('Reset de Pedidos', 'Todos os pedidos de compra foram zerados.', user);
    }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'orders', operation: 'delete' }));
    });
  }, [orders]);

  const resetProducts = useCallback(async (logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const batch = writeBatch(db);
    products.forEach(p => batch.delete(doc(db, 'products', p.id)));
    
    batch.commit().then(() => {
        logAction('Reset de Produtos', 'Todos os produtos foram zerados.', user);
    }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'products', operation: 'delete' }));
    });
  }, [products]);

  const resetFinancials = useCallback(async (logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const batch = writeBatch(db);
    commissionPayments.forEach(p => batch.delete(doc(db, 'commissionPayments', p.id)));
    
    batch.commit().then(() => {
        logAction('Reset Financeiro', 'Todos os pagamentos de comissão foram zerados.', user);
    }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'commissionPayments', operation: 'delete' }));
    });
  }, [commissionPayments]);
  
  const resetAllAdminData = useCallback(async (logAction: LogAction, user: User | null) => {
    await restoreAdminData({ products: [], orders: [], categories: [] }, logAction, user);
    await resetFinancials(logAction, user);
    logAction('Reset da Loja', 'Todos os dados da loja foram resetados para o padrão.', user);
  }, [restoreAdminData, resetFinancials]);

  const addProduct = useCallback(async (productData: Omit<Product, 'id' | 'data-ai-hint' | 'createdAt'>, logAction: LogAction, user: User | null) => {
      const { db } = getClientFirebase();
      const newProductId = `PROD-${Date.now().toString().slice(-6)}`;
      const newProductCode = `ITEM-${Date.now().toString().slice(-6)}`;
      
      const newProduct: Partial<Product> = {
        ...productData,
        id: newProductId,
        code: productData.code || newProductCode,
        createdAt: new Date().toISOString(),
        'data-ai-hint': productData.name.toLowerCase().split(' ').slice(0, 2).join(' '),
      };

      if (!newProduct.promotionEndDate) {
        delete newProduct.promotionEndDate;
      }
      
      const productRef = doc(db, 'products', newProductId);
      setDoc(productRef, newProduct).then(() => {
        logAction('Criação de Produto', `Produto "${newProduct.name}" (ID: ${newProductId}) foi criado.`, user);
        toast({
            title: "Produto Cadastrado!",
            description: `O produto "${newProduct.name}" foi adicionado ao catálogo.`,
        });
      }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: productRef.path,
            operation: 'create',
            requestResourceData: newProduct,
        }));
      });
  }, [toast]);

  const updateProduct = useCallback(async (updatedProduct: Product, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const productRef = doc(db, 'products', updatedProduct.id);
    const productToUpdate: Partial<Product> = { ...updatedProduct };
    
    if (!productToUpdate.promotionEndDate) {
        delete productToUpdate.promotionEndDate;
    }
    
    setDoc(productRef, productToUpdate, { merge: true }).then(() => {
        logAction('Atualização de Produto', `Produto "${updatedProduct.name}" (ID: ${updatedProduct.id}) foi atualizado.`, user);
    }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: productRef.path,
            operation: 'update',
            requestResourceData: productToUpdate,
        }));
    });
  }, []);

  const deleteProduct = useCallback(async (productId: string, logAction: LogAction, user: User | null) => {
      const { db } = getClientFirebase();
      const productRef = doc(db, 'products', productId);
      const productToDelete = products.find(p => p.id === productId);

      deleteDoc(productRef).then(() => {
        if (productToDelete) {
          logAction('Exclusão de Produto', `Produto "${productToDelete.name}" (ID: ${productId}) foi excluído.`, user);
        }
        toast({
            title: 'Produto Excluído!',
            description: 'O produto foi removido do catálogo.',
            variant: 'destructive',
            duration: 5000,
        });
      }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: productRef.path,
            operation: 'delete',
        }));
      });
  }, [products, toast]);

  const addCategory = useCallback(async (categoryName: string, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    if (categories.some(c => c.name.toLowerCase() === categoryName.toLowerCase())) {
      toast({ title: "Erro", description: "Essa categoria já existe.", variant: "destructive" });
      return;
    }
    const newCategoryId = `CAT-${Date.now().toString().slice(-6)}`;
    const newOrder = categories.length > 0 ? Math.max(...categories.map(c => c.order)) + 1 : 0;
    const newCategory: Category = {
      id: newCategoryId,
      name: categoryName,
      order: newOrder,
      subcategories: []
    };
    
    const categoryRef = doc(db, 'categories', newCategoryId);
    setDoc(categoryRef, newCategory).then(() => {
        logAction('Criação de Categoria', `Categoria "${categoryName}" foi criada.`, user);
        toast({ title: "Categoria Adicionada!" });
    }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: categoryRef.path,
            operation: 'create',
            requestResourceData: newCategory,
        }));
    });
  }, [categories, toast]);

  const updateCategoryName = useCallback(async (categoryId: string, newName: string, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    if (categories.some(c => c.name.toLowerCase() === newName.toLowerCase() && c.id !== categoryId)) {
        toast({ title: "Erro", description: "Uma categoria com esse novo nome já existe.", variant: "destructive" });
        return;
    }
    const oldCategory = categories.find(c => c.id === categoryId);
    if (!oldCategory) return;
    const oldName = oldCategory.name;

    const batch = writeBatch(db);
    const categoryRef = doc(db, 'categories', categoryId);
    batch.update(categoryRef, { name: newName });
    
    products.forEach(p => {
        if (p.category.toLowerCase() === oldName.toLowerCase()) {
            const productRef = doc(db, 'products', p.id);
            batch.update(productRef, { category: newName });
        }
    });

    batch.commit().then(() => {
        logAction('Atualização de Categoria', `Categoria "${oldName}" foi renomeada para "${newName}".`, user);
        toast({ title: "Categoria Renomeada!" });
    }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: `categories/${categoryId}`,
            operation: 'update',
            requestResourceData: { name: newName },
        }));
    });
  }, [categories, products, toast]);

  const deleteCategory = useCallback(async (categoryId: string, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const categoryToDelete = categories.find(c => c.id === categoryId);
    if (!categoryToDelete) return;

    const productsInCategory = products.some(p => p.category === categoryToDelete.name);

    if (productsInCategory) {
        toast({ title: "Erro", description: "Não é possível excluir categorias que contêm produtos.", variant: "destructive" });
        return;
    }
    const categoryRef = doc(db, 'categories', categoryId);
    deleteDoc(categoryRef).then(() => {
        logAction('Exclusão de Categoria', `Categoria "${categoryToDelete.name}" foi excluída.`, user);
        toast({ title: "Categoria Excluída!", variant: "destructive", duration: 5000 });
    }).catch(async(e) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: categoryRef.path,
            operation: 'delete',
        }));
    });
  }, [categories, products, toast]);

  const addSubcategory = useCallback(async (categoryId: string, subcategoryName: string, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;
    if (category.subcategories.some(s => s.toLowerCase() === subcategoryName.toLowerCase())) {
      toast({ title: "Erro", description: "Essa subcategoria já existe.", variant: "destructive" });
      return;
    }
    const newSubcategories = [...category.subcategories, subcategoryName].sort();
    const categoryRef = doc(db, 'categories', categoryId);
    updateDoc(categoryRef, { subcategories: newSubcategories }).then(() => {
        logAction('Criação de Subcategoria', `Subcategoria "${subcategoryName}" foi adicionada à categoria "${category.name}".`, user);
        toast({ title: "Subcategoria Adicionada!" });
    }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: categoryRef.path,
            operation: 'update',
            requestResourceData: { subcategories: newSubcategories },
        }));
    });
  }, [categories, toast]);

  const updateSubcategory = useCallback(async (categoryId: string, oldSub: string, newSub: string, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;
    if (category.subcategories.some(s => s.toLowerCase() === newSub.toLowerCase() && s.toLowerCase() !== oldSub.toLowerCase())) {
        toast({ title: "Erro", description: "Essa subcategoria já existe.", variant: "destructive" });
        return;
    }
    
    const batch = writeBatch(db);
    const newSubs = category.subcategories.map(s => s.toLowerCase() === oldSub.toLowerCase() ? newSub : s).sort();
    batch.update(doc(db, 'categories', categoryId), { subcategories: newSubs });
    
    products.forEach(p => {
        if (p.category === category.name && p.subcategory?.toLowerCase() === oldSub.toLowerCase()) {
            batch.update(doc(db, 'products', p.id), { subcategory: newSub });
        }
    });
    batch.commit().then(() => {
        logAction('Atualização de Subcategoria', `Subcategoria "${oldSub}" foi renomeada para "${newSub}" na categoria "${category.name}".`, user);
        toast({ title: "Subcategoria Renomeada!" });
    }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: `categories/${categoryId}`,
            operation: 'update',
        }));
    });
  }, [categories, products, toast]);

  const deleteSubcategory = useCallback(async (categoryId: string, subcategoryName: string, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;
    
    const productsInSubcategory = products.some(p => {
        return p.category === category.name && p.subcategory?.toLowerCase() === subcategoryName.toLowerCase();
    });

    if (productsInSubcategory) {
        toast({ title: "Erro", description: "Não é possível excluir subcategorias que contêm produtos.", variant: "destructive" });
        return;
    }
    const newSubcategories = category.subcategories.filter(s => s.toLowerCase() !== subcategoryName.toLowerCase());
    const categoryRef = doc(db, 'categories', categoryId);
    updateDoc(categoryRef, { subcategories: newSubcategories }).then(() => {
        logAction('Exclusão de Subcategoria', `Subcategoria "${subcategoryName}" foi excluída da categoria "${category.name}".`, user);
        toast({ title: "Subcategoria Excluída!", variant: "destructive", duration: 5000 });
    }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: categoryRef.path,
            operation: 'update',
            requestResourceData: { subcategories: newSubcategories },
        }));
    });
  }, [categories, products, toast]);
    
  const moveCategory = useCallback(async (categoryId: string, direction: 'up' | 'down', logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
    const index = sortedCategories.findIndex(c => c.id === categoryId);

    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sortedCategories.length - 1) return;

    const otherIndex = direction === 'up' ? index - 1 : index + 1;
    
    const category1 = sortedCategories[index];
    const category2 = sortedCategories[otherIndex];

    const order1 = category1.order;
    const order2 = category2.order;
    
    const batch = writeBatch(db);
    batch.update(doc(db, 'categories', category1.id), { order: order2 });
    batch.update(doc(db, 'categories', category2.id), { order: order1 });
    await batch.commit().then(() => {
        logAction('Reordenação de Categoria', `Categoria "${category1.name}" foi movida ${direction === 'up' ? 'para cima' : 'para baixo'}.`, user);
    }).catch(async(e) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'categories',
            operation: 'update',
        }));
    });
  }, [categories]);

  const reorderSubcategories = useCallback(async (categoryId: string, draggedSub: string, targetSub: string, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;

    const subs = Array.from(category.subcategories);
    const draggedIndex = subs.indexOf(draggedSub);
    const targetIndex = subs.indexOf(targetSub);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const [removed] = subs.splice(draggedIndex, 1);
    subs.splice(targetIndex, 0, removed);
    
    const categoryRef = doc(db, 'categories', categoryId);
    updateDoc(categoryRef, { subcategories: subs }).then(() => {
        logAction('Reordenação de Subcategoria', `Subcategorias da categoria "${category.name}" foram reordenadas.`, user);
    }).catch(async (e) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: categoryRef.path,
            operation: 'update',
            requestResourceData: { subcategories: subs },
        }));
    });
  }, [categories]);

  const moveSubcategory = useCallback(async (sourceCategoryId: string, subName: string, targetCategoryId: string, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const sourceCategory = categories.find(c => c.id === sourceCategoryId);
    const targetCategory = categories.find(c => c.id === targetCategoryId);

    if (!sourceCategory || !targetCategory) return;
    if (targetCategory.subcategories.some(s => s.toLowerCase() === subName.toLowerCase())) {
        toast({ title: 'Subcategoria já existe', description: `A categoria "${targetCategory.name}" já possui uma subcategoria chamada "${subName}".`, variant: "destructive" });
        return;
    }

    const newSourceSubs = sourceCategory.subcategories.filter(s => s.toLowerCase() !== subName.toLowerCase());
    const newTargetSubs = [...targetCategory.subcategories, subName].sort();
    
    const batch = writeBatch(db);
    products.forEach(p => {
        if (p.category === sourceCategory.name && p.subcategory?.toLowerCase() === subName.toLowerCase()) {
            batch.update(doc(db, 'products', p.id), { category: targetCategory.name });
        }
    });
    batch.update(doc(db, 'categories', sourceCategoryId), { subcategories: newSourceSubs });
    batch.update(doc(db, 'categories', targetCategoryId), { subcategories: newTargetSubs });
    
    batch.commit().then(() => {
        logAction('Movimentação de Subcategoria', `Subcategoria "${subName}" foi movida de "${sourceCategory.name}" para "${targetCategory.name}".`, user);
        toast({ title: 'Subcategoria Movida!', description: `"${subName}" agora faz parte de "${targetCategory.name}".`});
    }).catch(async(e) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'categories',
            operation: 'update',
        }));
    });
  }, [categories, products, toast]);

  const manageStockForOrder = useCallback(async (order: Order | undefined, operation: 'add' | 'subtract'): Promise<boolean> => {
    const { db } = getClientFirebase();
    if (!order) return false;
    const batch = writeBatch(db);
    
    for (const orderItem of order.items) {
        const product = products.find(p => p.id === orderItem.id);
        if (product) {
            const stockChange = orderItem.quantity;
            const newStock = operation === 'add' ? product.stock + stockChange : product.stock - stockChange;
            
            if (newStock < 0) {
              toast({
                  title: 'Estoque Insuficiente',
                  description: `Não há estoque suficiente para ${product.name}. Disponível: ${product.stock}, Pedido: ${stockChange}.`,
                  variant: 'destructive'
              });
              return false; // Indicate failure
            }
            
            batch.update(doc(db, 'products', product.id), { stock: newStock });
        }
    }
    
    try {
        await batch.commit();
        return true; // Indicate success
    } catch(e) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'products',
            operation: 'update',
        }));
        throw e; // Re-throw to indicate failure
    }
  }, [products, toast]);

  const addOrder = async (order: Partial<Order> & { firstDueDate: Date }, logAction: LogAction, user: User | null): Promise<Order | null> => {
    const { db } = getClientFirebase();
    // A robust way to generate a unique order ID
    const prefix = order.items && order.items.length > 0 ? 'PED' : 'REG';
    const orderId = `${prefix}-${Date.now().toString().slice(-6)}`;
    
    let isNewCustomer = true;
    const customerKey = order.customer?.cpf?.replace(/\D/g, '') || (order.customer ? `${order.customer.name}-${order.customer.phone}` : '');
    if (customerKey) {
        const existingCustomerOrder = orders.find(o => (o.customer.cpf?.replace(/\D/g, '') || `${o.customer.name}-${o.customer.phone}`) === customerKey);
        if (existingCustomerOrder) isNewCustomer = false;
    }

    const orderToSave = {
        ...order,
        id: orderId,
        sellerId: order.sellerId || user?.id || '',
        sellerName: order.sellerName || 'Não atribuído',
        commissionPaid: false,
    } as Order;

    if (orderToSave.customer) {
        const existingCode = orderToSave.customer.code
          || orders.find(o => (o.customer.cpf?.replace(/\D/g, '') || `${o.customer.name}-${o.customer.phone}`) === customerKey)?.customer.code;
        const code = existingCode || await allocateNextCustomerCode(db);
        orderToSave.customer = { ...orderToSave.customer, code };
    }

    if (isNewCustomer && order.customer?.cpf) {
        orderToSave.customer.password = order.customer.cpf.substring(0, 6);
    }


    orderToSave.commission = calculateCommission(orderToSave, products);
    
    const subtotal = order.items?.reduce((acc, item) => acc + item.price * item.quantity, 0) || 0;
    const total = subtotal - (order.discount || 0);
    const totalFinanced = total - (order.downPayment || 0);
    orderToSave.total = total; // Total should reflect the final price after discount
    
    if (orderToSave.installments > 0 && order.firstDueDate) {
      orderToSave.installmentDetails = recalculateInstallments(totalFinanced, orderToSave.installments, orderId, order.firstDueDate.toISOString())
      orderToSave.installmentValue = orderToSave.installmentDetails[0]?.amount || 0;
    }
    
    try {
      if (!await manageStockForOrder(orderToSave, 'subtract')) {
        throw new Error(`Estoque insuficiente para um ou mais produtos.`);
      }

      await setDoc(doc(db, 'orders', orderToSave.id), { ...orderToSave, customer: sanitizeCustomerForFirestore(orderToSave.customer) });
      
      const creator = user ? `por ${user.name}`: 'pelo cliente';
      logAction('Criação de Pedido', `Novo pedido #${orderToSave.id} para ${orderToSave.customer.name} no valor de R$${orderToSave.total?.toFixed(2)} foi criado ${creator}.`, user);
      return orderToSave;
    } catch(e) {
        console.error("Failed to add order", e);
        if (e instanceof Error && e.message.startsWith('Estoque insuficiente')) {
        } else {
            throw e;
        }
        await manageStockForOrder(order as Order, 'add');
        throw e;
    }
  };

  const generateCustomerCodes = useCallback(async (logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();

    const customerKeyForOrder = (o: Order) =>
      o.customer.cpf?.replace(/\D/g, '') || `${o.customer.name}-${o.customer.phone}`;

    const codeByCustomerKey = new Map<string, string>();
    let maxExistingNumber = 0;

    orders.forEach((o) => {
      const key = customerKeyForOrder(o);
      if (!key) return;
      const existing = (o.customer.code || '').trim();
      if (!existing) return;
      if (!codeByCustomerKey.has(key)) codeByCustomerKey.set(key, existing);
      const numeric = Number(existing.replace(/\D/g, ''));
      if (Number.isFinite(numeric) && numeric > maxExistingNumber) maxExistingNumber = numeric;
    });

    const uniqueCustomerKeys = Array.from(
      new Set(
        orders
          .map((o) => customerKeyForOrder(o))
          .filter((k) => !!k)
      )
    );

    const missingKeys = uniqueCustomerKeys
      .filter((k) => !codeByCustomerKey.has(k))
      .sort((a, b) => a.localeCompare(b));

    if (missingKeys.length > 0) {
      const { startNumber } = await reserveCustomerCodes(db, missingKeys.length, maxExistingNumber);
      missingKeys.forEach((key, idx) => {
        codeByCustomerKey.set(key, formatCustomerCode(startNumber + idx));
      });
    }

    const updates: Array<{ orderId: string; code: string }> = [];
    orders.forEach((o) => {
      const key = customerKeyForOrder(o);
      const code = key ? codeByCustomerKey.get(key) : undefined;
      if (!code) return;
      if ((o.customer.code || '').trim() === code) return;
      updates.push({ orderId: o.id, code });
    });

    const chunkSize = 450;
    let updatedOrders = 0;
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((u) => {
        batch.update(doc(db, 'orders', u.orderId), { 'customer.code': u.code });
      });
      await batch.commit();
      updatedOrders += chunk.length;
    }

    logAction(
      'Geração de Código de Cliente',
      `Foram gerados códigos para ${missingKeys.length} clientes e atualizados ${updatedOrders} pedidos.`,
      user
    );
    toast({
      title: 'Códigos Gerados!',
      description: `Novos clientes: ${missingKeys.length}. Pedidos atualizados: ${updatedOrders}.`,
    });

    return { newCustomers: missingKeys.length, updatedOrders };
  }, [orders, toast]);

  const updateOrderStatus = useCallback(async (orderId: string, newStatus: Order['status'], logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const orderToUpdate = orders.find(o => o.id === orderId);
    if (!orderToUpdate) return;

    const oldStatus = orderToUpdate.status;
    const wasCanceledOrDeleted = oldStatus === 'Cancelado' || oldStatus === 'Excluído';
    const isNowCanceledOrDeleted = newStatus === 'Cancelado' || newStatus === 'Excluído';
    
    const updatedOrderWithDetails: Order = { ...orderToUpdate, status: newStatus };
    const detailsToUpdate: Partial<Order> = { status: newStatus };

    if (newStatus === 'Entregue' && updatedOrderWithDetails.sellerId) {
        detailsToUpdate.commission = calculateCommission(updatedOrderWithDetails, products);
        detailsToUpdate.commissionPaid = false;
    }
    
    const orderRef = doc(db, 'orders', orderId);
    updateDoc(orderRef, detailsToUpdate).then(async () => {
        if (!wasCanceledOrDeleted && isNowCanceledOrDeleted) {
            await manageStockForOrder(orderToUpdate, 'add');
        }
        
        logAction('Atualização de Status de Pedido', `Status do pedido #${orderId} alterado de "${oldStatus}" para "${newStatus}".`, user);
        
        if (newStatus !== 'Excluído') {
          toast({ title: "Status do Pedido Atualizado!", description: `O pedido #${orderId} agora está como "${newStatus}".` });
        } else {
          logAction('Exclusão de Pedido', `Pedido #${orderId} movido para a lixeira.`, user);
          toast({ title: "Pedido movido para a Lixeira", description: `O pedido #${orderId} foi movido para a lixeira.` });
        }
    }).catch(async (e) => {
        if (wasCanceledOrDeleted && !isNowCanceledOrDeleted) {
            await manageStockForOrder(orderToUpdate, 'add');
        }
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: orderRef.path,
            operation: 'update',
        }));
    });
  }, [orders, products, manageStockForOrder, toast]);

  const deleteOrder = useCallback(async (orderId: string, logAction: LogAction, user: User | null) => {
    await updateOrderStatus(orderId, 'Excluído', logAction, user);
  }, [updateOrderStatus]);

  const permanentlyDeleteOrder = useCallback(async (orderId: string, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const orderToDelete = orders.find(o => o.id === orderId);
    if (!orderToDelete || orderToDelete.status !== 'Excluído') {
      toast({ title: "Erro", description: "Só é possível excluir permanentemente pedidos que estão na lixeira.", variant: "destructive" });
      return;
    }
    
    const orderRef = doc(db, 'orders', orderId);
    deleteDoc(orderRef).then(() => {
        logAction('Exclusão Permanente de Pedido', `Pedido #${orderId} foi excluído permanentemente.`, user);
    }).catch(async (e) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: orderRef.path,
            operation: 'delete',
        }));
    });
  }, [orders, toast]);

  const recordInstallmentPayment = useCallback(async (orderId: string, installmentNumber: number, paymentData: Omit<Payment, 'receivedBy'>, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    const paymentWithUser = {
      ...paymentData,
      receivedBy: user?.name || 'Sistema'
    };
    
    const updatedInstallments = (order.installmentDetails || []).map((inst) => {
      if (inst.installmentNumber === installmentNumber) {
        const currentPaidAmount = Number(inst.paidAmount) || 0;
        const paymentAmount = Number(paymentWithUser.amount) || 0;
        const newPaidAmount = currentPaidAmount + paymentAmount;
        const isPaid = Math.abs(newPaidAmount - inst.amount) < 0.01;
        const newStatus = isPaid ? 'Pago' : 'Pendente';
        const existingPayments = Array.isArray(inst.payments) ? inst.payments : [];

        return { 
          ...inst, 
          status: newStatus, 
          paidAmount: newPaidAmount, 
          payments: [...existingPayments, paymentWithUser]
        };
      }
      return inst;
    });

    const orderRef = doc(db, 'orders', orderId);
    updateDoc(orderRef, { installmentDetails: updatedInstallments }).then(() => {
        logAction('Registro de Pagamento de Parcela', `Registrado pagamento de ${paymentWithUser.amount} (${paymentWithUser.method}) na parcela ${installmentNumber} do pedido #${orderId}.`, user);
        toast({ title: 'Pagamento Registrado!' });
    }).catch(async(e) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: orderRef.path,
            operation: 'update',
            requestResourceData: { installmentDetails: updatedInstallments },
        }));
    });
  }, [orders, toast]);

  const reversePayment = useCallback(async (orderId: string, installmentNumber: number, paymentId: string, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    let reversedPaymentAmount = 0;
    const updatedInstallments = (order.installmentDetails || []).map(inst => {
      if (inst.installmentNumber === installmentNumber) {
        const paymentToReverse = inst.payments.find(p => p.id === paymentId);
        if (!paymentToReverse) return inst;

        reversedPaymentAmount = paymentToReverse.amount;
        const newPayments = inst.payments.filter(p => p.id !== paymentId);
        const newPaidAmount = (inst.paidAmount || 0) - reversedPaymentAmount;
        const newStatus = newPaidAmount >= inst.amount ? 'Pago' : 'Pendente';
        
        return { ...inst, payments: newPayments, paidAmount: newPaidAmount, status: newStatus };
      }
      return inst;
    });

    const orderRef = doc(db, 'orders', orderId);
    updateDoc(orderRef, { installmentDetails: updatedInstallments }).then(() => {
        logAction('Estorno de Pagamento', `Estornado pagamento de ${reversedPaymentAmount} da parcela ${installmentNumber} do pedido #${orderId}.`, user);
        toast({ title: 'Pagamento Estornado!', description: 'O valor foi retornado ao saldo devedor da parcela.' });
    }).catch(async(e) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: orderRef.path,
            operation: 'update',
            requestResourceData: { installmentDetails: updatedInstallments },
        }));
    });
  }, [orders, toast]);


  const updateInstallmentDueDate = useCallback(async (orderId: string, installmentNumber: number, newDueDate: Date, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const oldDueDate = order.installmentDetails?.find(i => i.installmentNumber === installmentNumber)?.dueDate;

    const updatedInstallments = (order.installmentDetails || []).map((inst) =>
      inst.installmentNumber === installmentNumber ? { ...inst, dueDate: newDueDate.toISOString() } : inst
    );
    const orderRef = doc(db, 'orders', orderId);
    updateDoc(orderRef, { installmentDetails: updatedInstallments }).then(() => {
        logAction('Atualização de Vencimento', `Vencimento da parcela ${installmentNumber} do pedido #${orderId} alterado de ${oldDueDate ? new Date(oldDueDate).toLocaleDateString() : 'N/A'} para ${newDueDate.toLocaleDateString()}.`, user);
        toast({ title: "Vencimento Atualizado!" });
    }).catch(async(e) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: orderRef.path,
            operation: 'update',
            requestResourceData: { installmentDetails: updatedInstallments },
        }));
    });
  }, [orders, toast]);

    const updateInstallmentAmount = useCallback(async (orderId: string, installmentNumber: number, newAmount: number, logAction: LogAction, user: User | null) => {
        const { db } = getClientFirebase();
        const order = orders.find(o => o.id === orderId);
        if (!order || !order.installmentDetails) return;

        const updatedInstallments = order.installmentDetails.map(inst => 
            inst.installmentNumber === installmentNumber ? { ...inst, amount: newAmount } : inst
        );
        
        const newTotalFinanced = updatedInstallments.reduce((sum, inst) => sum + inst.amount, 0);
        
        const subtotal = order.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        const newDiscount = subtotal - (newTotalFinanced + (order.downPayment || 0));

        const dataToUpdate: Partial<Order> = {
            installmentDetails: updatedInstallments,
            total: newTotalFinanced,
            discount: newDiscount,
        };

        const orderRef = doc(db, 'orders', orderId);
        updateDoc(orderRef, dataToUpdate).then(() => {
            logAction('Atualização de Valor de Parcela', `Valor da parcela ${installmentNumber} do pedido #${orderId} alterado para ${newAmount.toFixed(2)}. Total do pedido e desconto recalculados.`, user);
            toast({ title: 'Valor da Parcela Atualizado!' });
        }).catch(async (e) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: orderRef.path,
                operation: 'update',
                requestResourceData: dataToUpdate,
            }));
        });
    }, [orders, toast]);

  const updateCustomer = useCallback(async (oldCustomer: CustomerInfo, updatedCustomerData: CustomerInfo, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const batch = writeBatch(db);
    const oldCustomerKey = oldCustomer.cpf?.replace(/\D/g, '') || `${oldCustomer.name}-${oldCustomer.phone}`;

    orders.forEach(order => {
        const orderCustomerKey = order.customer.cpf?.replace(/\D/g, '') || `${order.customer.name}-${order.customer.phone}`;
        if (orderCustomerKey === oldCustomerKey) {
            const customerDataForOrder = { ...updatedCustomerData };
            
            if (updatedCustomerData.code === undefined && order.customer.code) {
                customerDataForOrder.code = order.customer.code;
            }
            // Preserve seller info from the existing order record if not present in the update
            if (updatedCustomerData.sellerId === undefined && order.customer.sellerId) {
                customerDataForOrder.sellerId = order.customer.sellerId;
                customerDataForOrder.sellerName = order.customer.sellerName;
            }
            batch.update(doc(db, 'orders', order.id), { customer: sanitizeCustomerForFirestore(customerDataForOrder) });
        }
    });

    batch.commit().then(() => {
        logAction('Atualização de Cliente', `Dados do cliente ${updatedCustomerData.name} (CPF: ${updatedCustomerData.cpf}) foram atualizados.`, user);
        toast({ title: "Cliente Atualizado!", description: `Os dados de ${updatedCustomerData.name} foram salvos.` });
    }).catch(async(e) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: `orders`,
            operation: 'update',
        }));
    });
  }, [orders, toast]);
  
  const deleteCustomer = useCallback(async (customer: CustomerInfo, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const customerKey = customer.cpf?.replace(/\D/g, '') || `${customer.name}-${customer.phone}`;

    const ordersToUpdate = orders.filter(order => {
        const orderCustomerKey = order.customer.cpf?.replace(/\D/g, '') || `${order.customer.name}-${order.customer.phone}`;
        return orderCustomerKey === customerKey;
    });

    if (ordersToUpdate.length === 0) {
        toast({ title: "Nenhum pedido encontrado", description: "Não há registros para este cliente.", variant: "destructive" });
        return;
    }
    
    const batch = writeBatch(db);
    ordersToUpdate.forEach(order => {
        batch.update(doc(db, 'orders', order.id), { status: 'Excluído' });
    });

    batch.commit().then(() => {
        logAction('Exclusão de Cliente', `Cliente ${customer.name} (CPF: ${customer.cpf}) e seus ${ordersToUpdate.length} pedidos foram movidos para a lixeira.`, user);
        toast({ title: "Cliente Excluído!", description: `O cliente ${customer.name} e todos os seus pedidos foram movidos para a lixeira.`, variant: "destructive" });
    }).catch(async(e) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'orders',
            operation: 'update',
        }));
    });
}, [orders, toast]);

  const importCustomers = useCallback(async (csvData: string, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const sanitizedCsv = csvData.trim().replace(/^\uFEFF/, ''); 
    if (!sanitizedCsv) {
        toast({ title: 'Arquivo Vazio', description: 'O arquivo CSV está vazio.', variant: 'destructive' });
        return;
    }
    const lines = sanitizedCsv.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) {
        toast({ title: 'Arquivo Inválido', description: 'O arquivo CSV precisa ter um cabeçalho e pelo menos uma linha de dados.', variant: 'destructive' });
        return;
    }
    
    const headerLine = lines[0];
    const dataLines = lines.slice(1);
    const delimiter = headerLine.includes(';') ? ';' : ',';
    
    const fileHeaders = headerLine.split(delimiter).map(h => h.trim().replace(/["']/g, '').toLowerCase());

    const possibleMappings: { [key in keyof Omit<CustomerInfo, 'password'>]?: string[] } = {
        cpf: ['cpf'],
        name: ['nome', 'nome completo', 'cliente', 'razao social'],
        phone: ['telefone', 'fone', 'celular', 'whatsapp'],
        email: ['email', 'e-mail'],
        zip: ['cep'],
        address: ['endereco', 'rua', 'logradouro', 'end'],
        number: ['numero', 'num'],
        complement: ['complemento', 'compl'],
        neighborhood: ['bairro'],
        city: ['cidade', 'municipio'],
        state: ['estado', 'uf'],
    };

    const headerMap: { [key: string]: number } = {};

    for (const key in possibleMappings) {
        const typedKey = key as keyof Omit<CustomerInfo, 'password'>;
        const potentialNames = possibleMappings[typedKey]!;
        
        const foundIndex = fileHeaders.findIndex(header => 
            potentialNames.some(pName => header.includes(pName))
        );

        if (foundIndex !== -1) {
            headerMap[typedKey] = foundIndex;
        }
    }
    
    if (headerMap.cpf === undefined) {
        toast({ title: 'Arquivo Inválido', description: "A coluna 'cpf' é obrigatória e não foi encontrada no arquivo.", variant: 'destructive' });
        return;
    }
    
    const customersToImport = dataLines.map(line => {
        if (!line.trim()) return null;
        const data = line.split(delimiter);
        const customer: Partial<CustomerInfo> = {};
        for (const key in headerMap) {
            const typedKey = key as keyof CustomerInfo;
            const colIndex = headerMap[key];
            if (colIndex !== undefined && colIndex < data.length) {
                customer[typedKey] = data[colIndex]?.trim().replace(/["']/g, '') || '';
            }
        }
        return customer;
    }).filter((c): c is Partial<CustomerInfo> & { cpf: string } => !!c && !!c.cpf && c.cpf.replace(/\D/g, '').length === 11);

    if (customersToImport.length === 0) {
        toast({ title: 'Nenhum Cliente Válido', description: 'Nenhum cliente com CPF válido foi encontrado no arquivo para importar.', variant: 'destructive' });
        return;
    }
    
    const batch = writeBatch(db);
    let updatedCount = 0;
    let createdCount = 0;
    
    const existingCpfSet = new Set(
        orders
            .map(o => o.customer.cpf)
            .filter((cpf): cpf is string => !!cpf)
            .map(cpf => cpf.replace(/\D/g, ''))
    );


    for (const importedCustomer of customersToImport) {
        const cpf = importedCustomer.cpf!.replace(/\D/g, '');
        const existingOrders = orders.filter(o => o.customer.cpf && o.customer.cpf.replace(/\D/g, '') === cpf);

        if (existingOrders.length > 0) {
            let customerAlreadyUpdated = false;
            existingOrders.forEach(order => {
                const updatedCustomerData = { ...order.customer, ...importedCustomer, cpf };
                batch.update(doc(db, 'orders', order.id), { customer: updatedCustomerData });
                if (!customerAlreadyUpdated) {
                    updatedCount++;
                    customerAlreadyUpdated = true;
                }
            });
        } else {
            if (!existingCpfSet.has(cpf)) {
                const orderId = `REG-${cpf}`;
                const completeCustomerData: CustomerInfo = {
                    cpf,
                    name: importedCustomer.name || 'Nome não informado',
                    phone: importedCustomer.phone || '',
                    phone2: importedCustomer.phone2,
                    phone3: importedCustomer.phone3,
                    email: importedCustomer.email || '',
                    zip: importedCustomer.zip || '',
                    address: importedCustomer.address || '',
                    number: importedCustomer.number || '',
                    complement: importedCustomer.complement || '',
                    neighborhood: importedCustomer.neighborhood || '',
                    city: importedCustomer.city || '',
                    state: importedCustomer.state || '',
                    password: cpf.substring(0, 6)
                };
                const dummyOrder: Order = {
                    id: orderId,
                    customer: completeCustomerData,
                    items: [], total: 0, installments: 0, installmentValue: 0,
                    date: new Date().toISOString(), status: 'Excluído',
                    paymentMethod: 'Dinheiro', installmentDetails: [],
                };
                batch.set(doc(db, 'orders', orderId), dummyOrder);
                createdCount++;
                existingCpfSet.add(cpf);
            }
        }
    }

    try {
        await batch.commit();
        logAction('Importação de Clientes', `${createdCount} clientes criados e ${updatedCount} atualizados via CSV.`, user);
        toast({
            title: 'Importação Concluída!',
            description: `${createdCount} novos clientes foram criados e ${updatedCount} clientes existentes foram atualizados.`
        });
    } catch (e) {
        console.error("Error during batch commit for customer import", e);
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'orders',
            operation: 'write',
        }));
    }
  }, [orders, toast]);


  const updateOrderDetails = useCallback(async (orderId: string, details: Partial<Order> & { resetDownPayment?: boolean }, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    let detailsToUpdate: Partial<Order> = { ...details };
    const { downPayment, resetDownPayment, ...otherDetails } = details;
    detailsToUpdate = otherDetails;
    
    const subtotal = order.items.reduce((acc, item) => acc + item.price * item.quantity, 0);

    const hasInstallmentsChanged = details.installments && details.installments !== order.installments;
    const hasDiscountChanged = details.discount !== undefined && details.discount !== order.discount;
    const hasDownPayment = downPayment !== undefined && downPayment > 0;

    let currentDownPayment = order.downPayment || 0;
    if (resetDownPayment) {
        currentDownPayment = 0;
        logAction('Redefinição de Entrada', `A entrada do pedido #${orderId} foi zerada.`, user);
    } else if (hasDownPayment) {
        currentDownPayment += downPayment;
    }

    if (hasInstallmentsChanged || hasDiscountChanged || hasDownPayment || resetDownPayment) {
        const currentDiscount = hasDiscountChanged ? details.discount! : (order.discount || 0);
        const totalAfterDiscountAndEntry = subtotal - currentDiscount - currentDownPayment;
        
        detailsToUpdate.total = totalAfterDiscountAndEntry;
        
        const currentInstallments = hasInstallmentsChanged ? details.installments! : order.installments;
        
        let newInstallmentDetails = recalculateInstallments(totalAfterDiscountAndEntry, currentInstallments, orderId, order.date);

        if (hasDownPayment) {
            logAction('Registro de Entrada', `Registrada entrada de R$${downPayment?.toFixed(2)} no pedido #${orderId}.`, user);
        }
        
        detailsToUpdate = {
            ...detailsToUpdate,
            discount: currentDiscount,
            installments: currentInstallments,
            installmentValue: newInstallmentDetails[0]?.amount || 0,
            installmentDetails: newInstallmentDetails,
            downPayment: currentDownPayment,
        };
    }
    
    const orderRef = doc(db, 'orders', orderId);
    updateDoc(orderRef, detailsToUpdate).then(() => {
      logAction('Atualização de Detalhes do Pedido', `Detalhes do pedido #${orderId} foram atualizados.`, user);
      toast({ title: "Pedido Atualizado!", description: `Os detalhes do pedido #${orderId} foram atualizados.` });
    }).catch(async (e) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: orderRef.path,
          operation: 'update',
          requestResourceData: detailsToUpdate,
      }));
    });
  }, [orders, toast]);

  const payCommissions = useCallback(async (sellerId: string, sellerName: string, amount: number, orderIds: string[], period: string, logAction: LogAction, user: User | null): Promise<string | null> => {
    const { db } = getClientFirebase();
    const paymentId = `COMP-${Date.now().toString().slice(-6)}`;
    const payment: CommissionPayment = {
        id: paymentId,
        sellerId,
        sellerName,
        amount,
        paymentDate: new Date().toISOString(),
        period,
        orderIds
    };
    const batch = writeBatch(db);
    const paymentRef = doc(db, 'commissionPayments', paymentId);
    batch.set(paymentRef, payment);

    orderIds.forEach(orderId => {
        const orderRef = doc(db, 'orders', orderId);
        batch.update(orderRef, { commissionPaid: true });
    });

    try {
        await batch.commit();
        logAction('Pagamento de Comissão', `Comissão de ${sellerName} no valor de R$${amount.toFixed(2)} referente a ${period} foi paga.`, user);
        toast({ title: "Comissão Paga!", description: `O pagamento para ${sellerName} foi registrado.` });
        return paymentId;
    } catch (e) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'commissionPayments',
            operation: 'create',
            requestResourceData: payment,
        }));
        return null;
    }
  }, [toast]);

  const reverseCommissionPayment = useCallback(async (paymentId: string, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const paymentToReverse = commissionPayments.find(p => p.id === paymentId);
    if (!paymentToReverse) {
      toast({ title: "Erro", description: "Pagamento não encontrado.", variant: "destructive" });
      return;
    }
    
    const batch = writeBatch(db);
    batch.delete(doc(db, 'commissionPayments', paymentId));

    paymentToReverse.orderIds.forEach(orderId => {
      batch.update(doc(db, 'orders', orderId), { commissionPaid: false });
    });

    batch.commit().then(() => {
        logAction('Estorno de Comissão', `O pagamento de comissão ID ${paymentId} foi estornado.`, user);
        toast({ title: "Pagamento Estornado!", description: "As comissões dos pedidos voltaram a ficar pendentes." });
    }).catch(async (e) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: `commissionPayments/${paymentId}`,
            operation: 'delete',
        }));
    });
  }, [commissionPayments, toast]);

  const saveStockAudit = useCallback(async (audit: StockAudit, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const auditRef = doc(db, 'stockAudits', audit.id);
    setDoc(auditRef, audit).then(() => {
        logAction('Auditoria de Estoque', `Auditoria de estoque para ${audit.month}/${audit.year} foi salva.`, user);
        toast({ title: "Auditoria Salva!", description: "O relatório de auditoria foi salvo com sucesso." });
    }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: auditRef.path,
            operation: 'create',
            requestResourceData: audit,
        }));
    });
  }, [toast]);

  const addAvaria = useCallback(async (avariaData: Omit<Avaria, 'id' | 'createdAt' | 'createdBy' | 'createdByName'>, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    if (!user) return;
    const newAvariaId = `AVR-${Date.now().toString().slice(-6)}`;
    const newAvaria: Avaria = {
      ...avariaData,
      id: newAvariaId,
      createdAt: new Date().toISOString(),
      createdBy: user.id,
      createdByName: user.name,
    };
    
    const avariaRef = doc(db, 'avarias', newAvariaId);
    setDoc(avariaRef, newAvaria).then(() => {
        logAction('Registro de Avaria', `Nova avaria registrada para o cliente ${avariaData.customerName} (Produto: ${avariaData.productName}).`, user);
        toast({
            title: "Avaria Registrada!",
            description: "O registro de avaria foi salvo com sucesso.",
        });
    }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: avariaRef.path,
            operation: 'create',
            requestResourceData: newAvaria,
        }));
    });
  }, [toast]);

  const updateAvaria = useCallback(async (avariaId: string, avariaData: Partial<Omit<Avaria, 'id'>>, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const avariaRef = doc(db, 'avarias', avariaId);
    const dataToUpdate = {
        ...avariaData,
        // Update who last modified it, if needed for tracking
        lastModifiedBy: user?.name,
        lastModifiedAt: new Date().toISOString(),
    };
    updateDoc(avariaRef, dataToUpdate).then(() => {
        logAction('Atualização de Avaria', `Avaria ID ${avariaId} foi atualizada.`, user);
        toast({ title: "Avaria Atualizada!", description: "O registro de avaria foi atualizado." });
    }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: avariaRef.path,
            operation: 'update',
            requestResourceData: dataToUpdate,
        }));
    });
  }, [toast]);

  const deleteAvaria = useCallback(async (avariaId: string, logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const avariaRef = doc(db, 'avarias', avariaId);
    deleteDoc(avariaRef).then(() => {
        logAction('Exclusão de Avaria', `Avaria ID ${avariaId} foi excluída.`, user);
        toast({ title: "Avaria Excluída!", variant: "destructive", duration: 5000 });
    }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: avariaRef.path,
            operation: 'delete',
        }));
    });
  }, [toast]);

  const emptyTrash = useCallback(async (logAction: LogAction, user: User | null) => {
    const { db } = getClientFirebase();
    const batch = writeBatch(db);
    const deletedOrders = orders.filter(o => o.status === 'Excluído' && o.items.length > 0);
    
    if (deletedOrders.length === 0) {
      toast({ title: 'Lixeira Vazia', description: 'Não há pedidos de compra para remover da lixeira.' });
      return;
    }

    deletedOrders.forEach(order => {
      const orderRef = doc(db, 'orders', order.id);
      batch.delete(orderRef);
    });

    try {
      await batch.commit();
      logAction('Esvaziar Lixeira', `Todos os ${deletedOrders.length} pedidos da lixeira foram permanentemente excluídos.`, user);
      toast({ title: 'Lixeira Esvaziada!', description: `${deletedOrders.length} pedidos foram excluídos permanentemente.` });
    } catch (e) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'orders',
        operation: 'delete',
      }));
    }
  }, [orders, toast]);
  
  const value = useMemo(() => ({
    addOrder, generateCustomerCodes, deleteOrder, permanentlyDeleteOrder, updateOrderStatus, recordInstallmentPayment, reversePayment, updateInstallmentDueDate, updateInstallmentAmount, updateCustomer, deleteCustomer, importCustomers, updateOrderDetails,
    addProduct, updateProduct, deleteProduct,
    addCategory, deleteCategory, updateCategoryName, addSubcategory, updateSubcategory, deleteSubcategory, moveCategory, reorderSubcategories, moveSubcategory,
    payCommissions, reverseCommissionPayment,
    restoreAdminData, resetOrders, resetProducts, resetFinancials, resetAllAdminData,
    saveStockAudit, addAvaria, updateAvaria, deleteAvaria,
    emptyTrash,
    // Admin Data states
    orders,
    commissionPayments,
    stockAudits,
    avarias,
    chatSessions,
    customers,
    deletedCustomers,
    customerOrders,
    customerFinancials,
    financialSummary,
    commissionSummary,
  }), [
    addOrder, generateCustomerCodes, deleteOrder, permanentlyDeleteOrder, updateOrderStatus, recordInstallmentPayment, reversePayment, updateInstallmentDueDate, updateInstallmentAmount, updateCustomer, deleteCustomer, importCustomers, updateOrderDetails,
    addProduct, updateProduct, deleteProduct,
    addCategory, deleteCategory, updateCategoryName, addSubcategory, updateSubcategory, deleteSubcategory, moveCategory, reorderSubcategories, moveSubcategory,
    payCommissions, reverseCommissionPayment,
    restoreAdminData, resetOrders, resetProducts, resetFinancials, resetAllAdminData,
    saveStockAudit, addAvaria, updateAvaria, deleteAvaria,
    emptyTrash,
    orders, commissionPayments, stockAudits, avarias, chatSessions, customers, deletedCustomers, customerOrders, customerFinancials, financialSummary, commissionSummary
  ]);

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = (): AdminContextType => {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
};

export const useAdminData = (): AdminContextType => {
    const context = useContext(AdminContext);
    if (context === undefined) {
        throw new Error('useAdminData must be used within an AdminProvider');
    }
    return context;
};
