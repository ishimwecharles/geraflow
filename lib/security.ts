import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Generates a clean URL-friendly username from a business name.
 * Example: "Nema Shop" -> "nema-shop"
 */
export function generateBusinessUsername(businessName: string): string {
  return businessName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // replace symbols and spaces with single hyphens
    .replace(/^-+|-+$/g, ""); // strip leading and trailing hyphens
}

/**
 * Pure TypeScript SHA-256 implementation.
 * Ensures compatibility across all environments, in/out of sandbox, and HTTP/HTTPS.
 * Securely hashes the password so plain passwords are never stored in Firestore.
 */
export function sha256(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = "length";
  let i, j;
  const result: string[] = [];

  const words: number[] = [];
  const asciiLength = ascii[lengthProperty] * 8;
  
  let hash = [] as number[];
  const k = [] as number[];
  let primeCounter = 0;

  const isPrime = (n: number) => {
    for (let factor = 2; factor * factor <= n; factor++) { 
      if (n % factor === 0) return false; 
    }
    return true;
  };

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (isPrime(candidate)) {
      if (primeCounter < 8) {
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      }
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter++;
    }
  }
  
  let asciiBytes = [] as number[];
  for (i = 0; i < ascii[lengthProperty]; i++) {
    asciiBytes.push(ascii.charCodeAt(i));
  }
  asciiBytes.push(0x80);
  while (asciiBytes[lengthProperty] % 64 !== 56) {
    asciiBytes.push(0);
  }
  for (i = 0; i < asciiBytes[lengthProperty]; i++) {
    words[i >> 2] |= asciiBytes[i] << (24 - (i % 4) * 8);
  }
  words[words[lengthProperty]] = ((asciiLength / maxWord) | 0);
  words[words[lengthProperty]] = (asciiLength | 0);
  
  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, j += 16);
    const oldHash = hash.slice(0);
    hash = hash.slice(0);
    for (i = 0; i < 64; i++) {
      if (i >= 16) {
        const w15 = w[i - 15];
        const w2 = w[i - 2];
        const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
        const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      
      const a = hash[0], e = hash[4];
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]);
      const t2 = s0 + maj;
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & hash[5]) ^ (~e & hash[6]);
      const t1 = hash[7] + s1 + ch + k[i] + (w[i] || 0);
      
      hash = [(t1 + t2) | 0].concat(hash);
      hash[4] = (hash[4] + t1) | 0;
      hash.length = 8;
    }
    
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  
  for (i = 0; i < 8; i++) {
    let s = (hash[i] >>> 0).toString(16);
    while (s[lengthProperty] < 8) s = "0" + s;
    result.push(s);
  }
  return result.join("");
}

export interface SecurityAuditPayload {
  eventType: string; // e.g. "auth_login_success", "auth_login_failed", "admin_config_changed", etc.
  action: string;    // Custom descriptive message of the action
  userId?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  businessId?: string | null;
  resourceId?: string | null;
  metadata?: any;
}

/**
 * SecurityAudit utility: Logs significant authentication, administrative, and access control events
 * to an immutable 'logs' collection in Firestore.
 */
export async function logSecurityEvent(payload: SecurityAuditPayload): Promise<void> {
  try {
    const user = auth?.currentUser;
    const finalUserId = payload.userId || user?.uid || null;
    const finalUserEmail = payload.userEmail || user?.email || null;
    
    // Create the log in Firestore
    const logData = {
      logId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
      eventType: payload.eventType,
      action: payload.action,
      userId: finalUserId,
      userEmail: finalUserEmail,
      userRole: payload.userRole || null,
      businessId: payload.businessId || null,
      resourceId: payload.resourceId || null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Server/Unknown',
      metadata: payload.metadata || null,
      createdAt: serverTimestamp()
    };
    
    await addDoc(collection(db, 'logs'), logData);
    console.log(`[SecurityAudit Logged] (${payload.eventType}): ${payload.action}`);
  } catch (error) {
    console.error('[SecurityAudit logging failed]:', error);
    try {
      handleFirestoreError(error, OperationType.WRITE, 'logs');
    } catch (e) {
      // Catch error and do not crash calling code
    }
  }
}

