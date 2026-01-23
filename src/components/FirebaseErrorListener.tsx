

'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';

export default function FirebaseErrorListener() {
  useEffect(() => {
    const handleError = (error: any) => {
      const message = typeof error?.message === 'string' ? error.message : '';
      const code =
        typeof error?.code === 'string'
          ? error.code
          : typeof error === 'object' && error !== null && 'code' in error
            ? String((error as any).code)
            : '';

      if (code === 'resource-exhausted' || /quota exceeded/i.test(message)) {
        return;
      }

      throw error;
    };

    errorEmitter.on(handleError);

    return () => {
      errorEmitter.off(handleError);
    };
  }, []);

  return null; // This component doesn't render anything
}
