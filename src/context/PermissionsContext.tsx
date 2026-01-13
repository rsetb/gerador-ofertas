
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { RolePermissions } from '@/lib/types';
import { initialPermissions } from '@/lib/permissions';
import { getClientFirebase } from '@/lib/firebase-client';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './AuthContext';
import { useAudit } from './AuditContext';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface PermissionsContextType {
    permissions: RolePermissions | null;
    updatePermissions: (newPermissions: RolePermissions) => Promise<void>;
    isLoading: boolean;
    resetPermissions: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export const PermissionsProvider = ({ children }: { children: ReactNode }) => {
    const [permissions, setPermissions] = useState<RolePermissions | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();
    const { user } = useAuth();
    const { logAction } = useAudit();
    
    useEffect(() => {
        const { db } = getClientFirebase();
        const permissionsRef = doc(db, 'config', 'rolePermissions');
        const unsubscribe = onSnapshot(permissionsRef, async (docSnap) => {
            if (docSnap.exists()) {
                const stored = docSnap.data() as Partial<RolePermissions>;
                setPermissions({ ...initialPermissions, ...(stored as any) });
            } else {
                await setDoc(permissionsRef, initialPermissions);
                setPermissions(initialPermissions);
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Failed to load permissions from Firestore:", error);
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'config/rolePermissions',
                operation: 'get',
            }));
            setPermissions(initialPermissions); // Fallback
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [toast]);

    const updatePermissions = useCallback(async (newPermissions: RolePermissions) => {
        try {
            const { db } = getClientFirebase();
            const permissionsRef = doc(db, 'config', 'rolePermissions');
            await setDoc(permissionsRef, newPermissions);
            // Real-time listener will update the state
            logAction('Atualização de Permissões', 'As permissões de acesso dos perfis foram alteradas.', user);
            toast({
                title: "Permissões Salvas!",
                description: "As regras de acesso foram atualizadas com sucesso.",
            });
        } catch (error) {
            console.error("Error updating permissions in Firestore:", error);
            toast({ title: "Erro", description: "Não foi possível salvar as permissões.", variant: "destructive" });
        }
    }, [toast, logAction, user]);

    const resetPermissions = useCallback(async () => {
        await updatePermissions(initialPermissions);
    }, [updatePermissions]);

    return (
        <PermissionsContext.Provider value={{ permissions, updatePermissions, isLoading, resetPermissions }}>
            {children}
        </PermissionsContext.Provider>
    );
};

export const usePermissions = () => {
    const context = useContext(PermissionsContext);
    if (context === undefined) {
        throw new Error('usePermissions must be used within a PermissionsProvider');
    }
    return context;
};
