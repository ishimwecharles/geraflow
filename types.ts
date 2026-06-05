// Unified TypeScript definitions for Gera Flow

export type ClientStatus = "active" | "inactive";

export interface Client {
  id?: string;             // Firestore document ID
  clientId: string;        // E.g., GP-XXXX
  businessId?: string;     // E.g., GP-XXXX (Matches clientId)
  businessName: string;
  ownerName: string;
  phone: string;
  momoCode: string;        // MTN MoMo merchant code or phone number
  location: string;
  category: string;
  logoUrl?: string;
  status: ClientStatus;
  active?: boolean;
  clientType?: "system_access" | "qr_only";
  mtnPaymentType?: "momo_code" | "phone_number";
  momoPhoneNumber?: string;
  momoPayCode?: string;
  qrType?: "local" | "international";
  qrTypesEnabled?: string;
  hasClientLogin?: boolean;
  maxStaff?: number;
  maxDevices?: number;
  plan?: string;
  businessUsername?: string;
  businessPassword?: string;
  businessAccessQr?: string;
  businessAdminName?: string;
  role?: string;
  createdAt?: any;         // Firestore Timestamp
  updatedAt?: any;         // Firestore Timestamp
}

export type TransactionStatus = "pending" | "processing" | "confirmed" | "failed" | "rejected";

export interface Transaction {
  id?: string;             // Firestore document ID
  clientId: string;
  clientDocId: string;
  businessName: string;
  momoCode: string;
  amount: number;          // amount in transaction currency (RWF or USD)
  phone: string;           // Customer phone number
  note?: string;
  status: TransactionStatus;
  momoReferenceId?: string | null;  // MTN MoMo reference UUID
  momoStatus?: string | null;       // MTN callback status
  momoRawResponse?: string | null;   // Real JSON string logged from MTN
  qrType?: "local" | "international";
  currency?: string;
  method?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface PaymentLog {
  id?: string;
  transactionId: string;
  clientId: string;
  businessName: string;
  amount: number;
  method: string;          // E.g., "mtn_request_to_pay" or "manual"
  createdAt?: any;
}

export type DeviceMode = "admin" | "cashier" | "waiter";

export type BillStatus = "unpaid" | "paid" | "expired" | "cancelled";

export interface BillItem {
  id: string; // inline item ID
  name: string;
  qty: number;
  price: number;
  subtotal: number;
}

export interface Bill {
  id?: string; // Firestore document ID
  billId: string; // custom human readable format, e.g. BILL-XXXX
  clientId: string; // store / client identification code
  businessName: string; // client store name
  tableNumber: string;
  customerName?: string;
  items: BillItem[];
  subtotal: number;
  totalAmount: number;
  currency: "RWF";
  status: BillStatus;
  createdAt: any;
  expiresAt: any;
  paidAt?: any | null;
  createdByDeviceMode: DeviceMode;
  paymentMethod?: string | null;
  isOfflinePending?: boolean; // client-side indicator for offline actions
}

export interface BillPayment {
  id?: string;
  billId: string;
  clientId: string;
  businessName: string;
  amount: number;
  method: "momo" | "ussd" | "manual";
  phone?: string;
  createdAt: any;
}

export interface Activation {
  id?: string;               // document ID in Firestore
  licenseCode: string;       // GP-LIC-XXXX-XXXX
  userId: string;            // Google Auth uid or sandbox ID
  userEmail: string;
  deviceId: string;          // Browser localstorage fingerprint
  deviceName: string;        // e.g., "Safari on iOS"
  planId: string;            // starter | restaurant | international | enterprise
  planName: string;
  billingCycle: "monthly" | "yearly";
  amountPaid: number;        // amount in RWF
  currency: string;          // RWF
  paymentMethod: "momo" | "ussd" | "card";
  paymentPhone?: string;     // for momo
  status: "active" | "expired" | "reset";
  createdAt: any;            // Firestore Timestamp or date
  expiresAt: any;            // Firestore Timestamp or date
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  priceRWF: number;
  description: string;
  features: string[];
}

export interface SystemLog {
  id?: string;
  logId: string;
  errorType: string;
  message: string;
  route: string;
  userAgent: string;
  deviceType: "desktop" | "mobile" | "tablet" | "terminal";
  browser: string;
  networkStatus: "online" | "offline";
  loadTime: number; // in milliseconds
  createdAt: any;
  severity: "low" | "medium" | "high" | "critical";
  suggestedFix: string;
  resolved: boolean;
  isSimulation?: boolean;
  isDemo?: boolean;
  source?: string;
}

export interface AutoFixLog {
  id?: string;
  fixId: string;
  errorId: string;
  fixType: string;
  actionTaken: string;
  beforeStatus: string;
  afterStatus: string;
  triggeredBy: string;
  createdAt: any;
  success: boolean;
  message: string;
}

export interface Menu {
  id?: string;
  businessId: string;
  restaurantName: string;
  description?: string;
  logoUrl?: string;
  category?: string;
  phone?: string;
  location?: string;
  active: boolean;
  updatedAt?: any;
}

export interface MenuSection {
  id?: string;
  sectionId: string;
  businessId: string;
  sectionName: string;
  description?: string;
  sortOrder: number;
  active: boolean;
}

export interface MenuProduct {
  id?: string;
  productId: string;
  businessId: string;
  sectionId: string;
  productName: string;
  translatedName?: string;
  description?: string;
  price: number;
  imageUrl?: string;
  productImageUrl?: string;
  allergens?: string[];
  available: boolean;
  sortOrder: number;
  createdAt?: any;
}

export interface SecurityAuditLog {
  id?: string;
  logId: string;
  eventType: string;
  action: string;
  userId: string | null;
  userEmail: string | null;
  userRole: string | null;
  businessId: string | null;
  resourceId: string | null;
  userAgent: string;
  createdAt: any;
  metadata?: any;
}



