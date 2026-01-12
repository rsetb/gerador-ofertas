'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';

interface PixQRCodeProps {
  payload: string;
  size?: number;
  className?: string;
}

export default function PixQRCode({ payload, size = 512, className }: PixQRCodeProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  useEffect(() => {
    if (payload) {
      QRCode.toDataURL(payload, { width: size, margin: 1 })
        .then(url => {
          setQrCodeUrl(url);
        })
        .catch(err => {
          console.error('Failed to generate QR Code', err);
        });
    }
  }, [payload, size]);

  if (!payload) return null;

  return (
    <div className={cn("flex flex-col items-center gap-2 print:gap-1 p-2 print:p-1 border rounded-lg bg-muted/50", className)}>
        <div className="flex items-center gap-2 print:gap-1 font-semibold text-sm print:text-[9px]">
            <QrCode className="h-4 w-4 text-primary"/>
            <span>Pague com PIX</span>
        </div>
      {qrCodeUrl ? (
        <img src={qrCodeUrl} alt="PIX QR Code" className="w-full h-auto rounded-md" />
      ) : (
        <Skeleton className="w-full aspect-square rounded-md" />
      )}
      <p className="text-xs text-muted-foreground text-center mt-1 print-hidden pdf-hidden">
        Abra o app do seu banco e aponte a câmera para o QR Code para pagar.
      </p>
    </div>
  );
}
