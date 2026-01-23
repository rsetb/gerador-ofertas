
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { AuditLog, User, UserRole } from '@/lib/types';
import { getClientFirebase } from '@/lib/firebase-client';
import { collection, doc, getDocs, setDoc, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { usePathname } from 'next/navigation';

interface AuditContextType {
  auditLogs: AuditLog[];
  logAction: (action: string, details: string, user: User | null) => void;
  isLoading: boolean;
}

const AuditContext = createContext<AuditContextType | undefined>(undefined);

export const AuditProvider = ({ children }: { children: ReactNode }) => {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith('/admin')) {
      setAuditLogs([]);
      setIsLoading(false);
      return () => {};
    }

    const { db } = getClientFirebase();
    const logsCollection = collection(db, 'auditLogs');
    const q = query(logsCollection, orderBy('timestamp', 'desc'), limit(200));

    const isQuotaExceeded = (error: unknown) => {
      const message = error instanceof Error ? error.message : '';
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as any).code) : '';
      return code === 'resource-exhausted' || /quota exceeded/i.test(message);
    };

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const fetchedLogs = querySnapshot.docs.map(d => ({ ...d.data(), id: d.id })) as AuditLog[];
        setAuditLogs(fetchedLogs);
        setIsLoading(false);
    }, (error) => {
        console.error("Error fetching audit logs from Firestore:", error);
        if (!isQuotaExceeded(error)) {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
              path: 'auditLogs',
              operation: 'list',
          }));
        }
        setIsLoading(false);
    });

    return () => unsubscribe();
  }, [pathname]);


  const logAction = useCallback(async (action: string, details: string, user: User | null) => {
    if (!user) return;
    const { db } = getClientFirebase();

    const logId = `log-${Date.now()}`;
    const newLog: AuditLog = {
      id: logId,
      timestamp: new Date().toISOString(),
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action,
      details
    };

    try {
      await setDoc(doc(db, 'auditLogs', logId), newLog);
      // Real-time listener will update the state
    } catch (error) {
      console.error("Error writing audit log to Firestore:", error);
    }
  }, []);

  return (
    <AuditContext.Provider value={{ auditLogs, logAction, isLoading }}>
      {children}
    </AuditContext.Provider>
  );
};

export const useAudit = () => {
  const context = useContext(AuditContext);
  if (context === undefined) {
    throw new Error('useAudit must be used within an AuditProvider');
  }
  return context;
};
