import { collection, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

export interface OfflineAction {
  id: string;
  type: 'create_bill' | 'update_bill_status';
  collectionName: 'bills' | 'billPayments';
  payload: any;
  createdAt: number;
}

const LOCAL_STORAGE_KEY = 'gerapay_offline_queue';

export function getOfflineQueue(): OfflineAction[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to read offline queue from localStorage:', e);
    return [];
  }
}

export function saveOfflineQueue(queue: OfflineAction[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Failed to save offline queue to localStorage:', e);
  }
}

export function addToOfflineQueue(
  type: 'create_bill' | 'update_bill_status',
  collectionName: 'bills' | 'billPayments',
  payload: any
): OfflineAction {
  const queue = getOfflineQueue();
  const action: OfflineAction = {
    id: `off-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    collectionName,
    payload,
    createdAt: Date.now()
  };
  queue.push(action);
  saveOfflineQueue(queue);
  return action;
}

export async function syncOfflineQueue(db: any, onSyncSuccess?: (msg: string) => void) {
  if (!navigator.onLine) {
    return;
  }

  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return;
  }

  console.log(`[GeraPay Sync] Starting synchronization of ${queue.length} offline actions...`);
  const remaining: OfflineAction[] = [];
  let successfulSyncs = 0;

  for (const action of queue) {
    try {
      if (action.type === 'create_bill') {
        const payloadWithTime = {
          ...action.payload,
          createdAt: serverTimestamp(),
          expiresAt: action.payload.expiresAt ? new Date(action.payload.expiresAt) : null,
          paidAt: action.payload.paidAt ? new Date(action.payload.paidAt) : null,
        };
        // Remove client-specific temp fields
        delete payloadWithTime.isOfflinePending;
        
        // Use setDoc so that the custom human-readable billId becomes the Firestore document key
        await setDoc(doc(db, action.collectionName, action.payload.billId), payloadWithTime);
        successfulSyncs++;
      } else if (action.type === 'update_bill_status') {
        const { billDocId, status, paidAt, paymentMethod } = action.payload;
        const ref = doc(db, action.collectionName, billDocId);
        const updates: any = { status };
        if (paidAt) updates.paidAt = serverTimestamp();
        if (paymentMethod) updates.paymentMethod = paymentMethod;
        
        await updateDoc(ref, updates);
        successfulSyncs++;
      }
    } catch (e) {
      console.error(`[GeraPay Sync] Action ${action.id} failed to sync, keeping in queue:`, e);
      remaining.push(action);
    }
  }

  saveOfflineQueue(remaining);

  if (successfulSyncs > 0 && onSyncSuccess) {
    onSyncSuccess(`Synced ${successfulSyncs} offline bills and changes successfully with Firebase.`);
  }
}
