'use client';

import { ThemeProvider } from 'next-themes';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { AuditProvider } from '@/context/AuditContext';
import { AuthProvider } from '@/context/AuthContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { DataProvider } from '@/context/DataContext';
import { CustomerAuthProvider } from '@/context/CustomerAuthContext';
import { CartProvider } from '@/context/CartContext';
import { Toaster } from '@/components/ui/toaster';
import FirebaseErrorListener from '@/components/FirebaseErrorListener';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <AuditProvider>
        <AuthProvider>
          <SettingsProvider>
            <DataProvider>
              <CustomerAuthProvider>
                <CartProvider>
                  {children}
                  <Toaster />
                  <FirebaseErrorListener />
                </CartProvider>
              </CustomerAuthProvider>
            </DataProvider>
          </SettingsProvider>
        </AuthProvider>
      </AuditProvider>
      <SpeedInsights />
    </ThemeProvider>
  );
}

