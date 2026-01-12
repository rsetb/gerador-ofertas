import { doc, runTransaction } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

export function formatCustomerCode(value: number): string {
  return String(value).padStart(5, '0');
}

export async function allocateNextCustomerCode(db: Firestore): Promise<string> {
  const counterRef = doc(db, 'config', 'customerCodeCounter');

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const lastNumber = snap.exists() ? Number((snap.data() as any).lastNumber || 0) : 0;
    const nextNumber = lastNumber + 1;
    tx.set(counterRef, { lastNumber: nextNumber }, { merge: true });
    return formatCustomerCode(nextNumber);
  });
}

export async function reserveCustomerCodes(
  db: Firestore,
  count: number,
  minLastNumber: number = 0
): Promise<{ startNumber: number; endNumber: number }> {
  if (count <= 0) {
    return { startNumber: 0, endNumber: 0 };
  }

  const counterRef = doc(db, 'config', 'customerCodeCounter');

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const lastNumberRaw = snap.exists() ? Number((snap.data() as any).lastNumber || 0) : 0;
    const lastNumber = Number.isFinite(lastNumberRaw) ? lastNumberRaw : 0;
    const base = Math.max(lastNumber, minLastNumber);
    const startNumber = base + 1;
    const endNumber = base + count;
    tx.set(counterRef, { lastNumber: endNumber }, { merge: true });
    return { startNumber, endNumber };
  });
}
