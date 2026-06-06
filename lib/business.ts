import { doc, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { sha256 } from "./security";

export interface BusinessRegistrationOptions {
  businessName: string;
  ownerName?: string;
  phone?: string;
  location?: string;
  category?: string;
  plan?: string;
  maxStaff?: number;
  maxDevices?: number;
  qrType?: string;
  clientId?: string; // Optional custom businessId
}

export interface UserRegistrationOptions {
  uid: string;
  email: string;
  username?: string;
  password?: string;
  displayName?: string;
  role?: string;
}

/**
 * Automates the creation of a business entry in the 'businesses' collection
 * during the registration flow, ensuring it automatically links a generated
 * 'businessId' to the user's profile upon successful account setup.
 *
 * @param userOptions The user configuration for the profile
 * @param businessOptions The business configuration to define
 */
export async function registerBusinessAndLinkUser(
  userOptions: UserRegistrationOptions,
  businessOptions: BusinessRegistrationOptions
) {
  // 1. Resolve or generate a unique business ID
  const rawBusinessId =
    businessOptions.clientId ||
    businessOptions.businessName
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 6)
      .toUpperCase() +
      "-" +
      Math.floor(1000 + Math.random() * 9000);
      
  const normalizedBusinessId = rawBusinessId.trim().toUpperCase();

  // 2. Build the unified Business Registry entry payload
  const businessPayload = {
    businessId: normalizedBusinessId,
    clientId: normalizedBusinessId,
    businessName: businessOptions.businessName.trim(),
    ownerName: businessOptions.ownerName?.trim() || "Merchant Owner",
    phone: businessOptions.phone?.trim() || "+250780000000",
    location: businessOptions.location?.trim() || "Kigali, Rwanda",
    category: businessOptions.category || "Food & Beverage / Restaurant",
    status: "active",
    active: true,
    qrType: businessOptions.qrType || "momo_v2",
    qrTypesEnabled: businessOptions.qrType || "momo_v2",
    hasClientLogin: true,
    maxStaff: Number(businessOptions.maxStaff || 10),
    maxDevices: Number(businessOptions.maxDevices || 5),
    plan: businessOptions.plan || "restaurant",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    businessAdminName: businessOptions.ownerName?.trim() || "Merchant Owner",
    businessUsername: userOptions.username || userOptions.email.split("@")[0].toLowerCase(),
    businessPassword: userOptions.password ? sha256(userOptions.password) : "",
    passwordHash: userOptions.password ? sha256(userOptions.password) : "",
    role: "business_admin",
    businessAccessQr: `/client-login?businessId=${normalizedBusinessId}`,
    businessAccessLink: `https://gerapay.qr/client-login?businessId=${normalizedBusinessId}`,
    businessAccessQrUrl: ""
  };

  const pathBiz = `businesses/${normalizedBusinessId}`;
  try {
    // Set the business entry in both businesses and clients collection for maximum resilience
    await setDoc(doc(db, "businesses", normalizedBusinessId), businessPayload, { merge: true });
    await setDoc(doc(db, "clients", normalizedBusinessId), businessPayload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, pathBiz);
    throw error;
  }

  // 3. Link the businessId dynamically to the user record
  const finalUsername = userOptions.username || userOptions.email.split("@")[0];
  const userPayload = {
    uid: userOptions.uid,
    email: userOptions.email.toLowerCase(),
    username: finalUsername,
    usernameLower: finalUsername.toLowerCase(),
    role: userOptions.role || "business_admin",
    businessId: normalizedBusinessId,
    businessName: businessOptions.businessName.trim(),
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    displayName: userOptions.displayName || businessOptions.ownerName || "Merchant Owner",
    plan: businessOptions.plan || "restaurant",
    maxStaff: Number(businessOptions.maxStaff || 10),
    maxDevices: Number(businessOptions.maxDevices || 5),
    businessAccessLink: `https://gerapay.qr/client-login?businessId=${normalizedBusinessId}`,
    businessAccessQrUrl: ""
  };

  if (userOptions.password) {
    (userPayload as any).password = sha256(userOptions.password.trim());
    (userPayload as any).passwordHash = sha256(userOptions.password.trim());
  }

  const pathUser = `users/${userOptions.uid}`;
  try {
    await setDoc(doc(db, "users", userOptions.uid), userPayload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, pathUser);
    throw error;
  }

  return {
    businessId: normalizedBusinessId,
    business: businessPayload,
    user: userPayload
  };
}
