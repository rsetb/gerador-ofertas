

'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getClientFirebase } from '@/lib/firebase-client';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { useAudit } from './AuditContext';
import { useAuth } from './AuthContext';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import type { StoreSettings } from '@/lib/types';

const initialSettings: StoreSettings = {
    storeName: 'ADC Móveis',
    storeCity: '',
    storeAddress: '',
    pixKey: '',
    storePhone: '',
    logoUrl: '',
    accessControlEnabled: false,
    commercialHourStart: '08:00',
    commercialHourEnd: '18:00',
};

const SETTINGS_CACHE_KEY = 'adcpro/storeSettingsCache/v1';

const mergeWithDefaults = (maybeSettings: Partial<StoreSettings> | null | undefined): StoreSettings => {
    return {
        ...initialSettings,
        ...(maybeSettings || {}),
    };
};

const isSettingsEffectivelyEmpty = (settings: StoreSettings) => {
    return (
        !settings.storeName?.trim() &&
        !settings.storeAddress?.trim() &&
        !settings.storeCity?.trim() &&
        !settings.pixKey?.trim() &&
        !settings.storePhone?.trim() &&
        !settings.logoUrl?.trim()
    );
};

const readCachedSettings = (): StoreSettings | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(SETTINGS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoreSettings;
        return mergeWithDefaults(parsed);
    } catch {
        return null;
    }
};

const writeCachedSettings = (settings: StoreSettings) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
    } catch {}
};

const clearCachedSettings = () => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(SETTINGS_CACHE_KEY);
    } catch {}
};

interface SettingsContextType {
    settings: StoreSettings;
    updateSettings: (newSettings: Partial<StoreSettings>) => Promise<void>;
    isLoading: boolean;
    restoreSettings: (settings: StoreSettings) => Promise<void>;
    resetSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
    const [settings, setSettings] = useState<StoreSettings>(() => readCachedSettings() || initialSettings);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();
    const { logAction } = useAudit();
    const { user } = useAuth();


    useEffect(() => {
        const { db } = getClientFirebase();
        const settingsRef = doc(db, 'config', 'storeSettings');
        const unsubscribe = onSnapshot(settingsRef, async (docSnap) => {
            const cached = readCachedSettings();

            if (!docSnap.exists()) {
                setSettings(cached || initialSettings);
                setIsLoading(false);
                return;
            }

            const remote = mergeWithDefaults(docSnap.data() as Partial<StoreSettings>);
            const remoteEmpty = isSettingsEffectivelyEmpty(remote);
            const cachedUsable = cached && !isSettingsEffectivelyEmpty(cached);

            if (remoteEmpty && cachedUsable) {
                setSettings(cached);
                writeCachedSettings(cached);
                if (user?.role === 'admin') {
                    try {
                        await setDoc(settingsRef, cached, { merge: true });
                    } catch {}
                }
                setIsLoading(false);
                return;
            }

            setSettings(remote);
            writeCachedSettings(remote);
            setIsLoading(false);
        }, (error) => {
            console.error("Failed to load settings from Firestore:", error);
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'config/storeSettings',
                operation: 'get',
            }));
            setSettings(readCachedSettings() || initialSettings);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [user?.role]);

    const updateSettings = async (newSettings: Partial<StoreSettings>) => {
        try {
            const { db } = getClientFirebase();
            const settingsRef = doc(db, 'config', 'storeSettings');

            const cleanedNewSettings = Object.fromEntries(
                Object.entries(newSettings).filter(([, value]) => value !== undefined)
            ) as Partial<StoreSettings>;

            await setDoc(settingsRef, cleanedNewSettings, { merge: true });

            logAction('Atualização de Configurações', `Configurações da loja foram alteradas.`, user);
            toast({
                title: "Configurações Salvas!",
                description: "As informações da loja foram atualizadas com sucesso.",
            });
        } catch (error) {
            console.error("Error updating settings in Firestore:", error);
            toast({ title: "Erro", description: "Não foi possível salvar as configurações.", variant: "destructive" });
        }
    };
    
    const restoreSettings = async (settingsToRestore: StoreSettings) => {
        await updateSettings(settingsToRestore);
        logAction('Restauração de Configurações', `Configurações da loja foram restauradas de um backup.`, user);
    };

    const resetSettings = async () => {
        clearCachedSettings();
        await updateSettings(initialSettings);
        logAction('Reset de Configurações', `Configurações da loja foram restauradas para o padrão.`, user);
    };

    return (
        <SettingsContext.Provider value={{ settings, updateSettings, isLoading, restoreSettings, resetSettings }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};

    
