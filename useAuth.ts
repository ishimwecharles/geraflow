import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { safeLocalStorage } from "../lib/storage";

export interface UserProfile {
  uid: string;
  email: string;
  role: string;
  businessId: string;
  businessName?: string;
  username?: string;
  active: boolean;
  maxStaff?: number;
  maxDevices?: number;
  plan?: string;
  passwordHash?: string;
}

export function mapAuthError(err: any): { message: string; code: string } {
  const code = err?.code || "unknown";
  const msg = err?.message || String(err);
  
  if (
    code === "auth/user-not-found" || 
    code === "auth/wrong-password" || 
    code === "auth/invalid-credential" || 
    msg.includes("user-not-found") || 
    msg.includes("wrong-password") || 
    msg.includes("invalid-credential")
  ) {
    return { message: "Incorrect email/username or password.", code: "auth/invalid-credential" };
  }
  if (code === "auth/too-many-requests" || msg.includes("too-many-requests") || msg.includes("auth/too-many-requests")) {
    return { message: "Too many attempts, try later.", code: "auth/too-many-requests" };
  }
  if (code === "permission-denied" || msg.toLowerCase().includes("permission-denied") || msg.toLowerCase().includes("insufficient permissions")) {
    return { message: "Database permission denied.", code: "permission-denied" };
  }
  if (code === "unavailable" || msg.toLowerCase().includes("unavailable") || msg.toLowerCase().includes("connection") || msg.toLowerCase().includes("network")) {
    return { message: "Connection problem. Retry.", code: "unavailable" };
  }
  if (code === "not-found" || msg.includes("not-found")) {
    return { message: "Business profile missing.", code: "business-profile-missing" };
  }
  
  // Custom errors
  if (code === "profile-missing" || code === "missing_user_profile") {
    return { message: "User profile missing. Contact Gera Tech admin.", code: "profile-missing" };
  }
  if (code === "role-missing" || code === "missing_role") {
    return { message: "User role not assigned.", code: "role-missing" };
  }
  if (code === "missing_business_id") {
    return { message: "Business account not linked.", code };
  }
  if (code === "account-inactive" || code === "inactive_user") {
    return { message: "Account inactive.", code: "account-inactive" };
  }
  if (code === "business-inactive" || code === "inactive_business") {
    return { message: "Business inactive.", code: "business-inactive" };
  }
  
  return { message: msg || "An unexpected error occurred", code };
}

// Helper to look up business profiles supporting old and new structures
export async function fetchBusinessProfile(businessId: string): Promise<any> {
  const cleanId = businessId.trim();
  if (!cleanId) return null;

  // 1. Try businesses/{businessId}
  try {
    const bizDocRef = doc(db, "businesses", cleanId);
    const bizSnap = await getDoc(bizDocRef);
    if (bizSnap.exists()) {
      return { id: bizSnap.id, ...bizSnap.data(), source: "businesses-doc" };
    }
  } catch (err: any) {
    console.warn("[GeraPay] Error searching businesses/docId:", err);
    if (err.code === "permission-denied" || err?.message?.toLowerCase().includes("permission")) {
      throw err;
    }
  }

  // 2. Try clients/{businessId}
  try {
    const clientDocRef = doc(db, "clients", cleanId);
    const clientSnap = await getDoc(clientDocRef);
    if (clientSnap.exists()) {
      return { id: clientSnap.id, ...clientSnap.data(), source: "clients-doc" };
    }
  } catch (err: any) {
    console.warn("[GeraPay] Error searching clients/docId:", err);
    if (err.code === "permission-denied" || err?.message?.toLowerCase().includes("permission")) {
      throw err;
    }
  }

  // 3. Try query in clients collection: clientId == businessId
  try {
    const q1 = query(collection(db, "clients"), where("clientId", "==", cleanId));
    const snap1 = await getDocs(q1);
    if (!snap1.empty) {
      return { id: snap1.docs[0].id, ...snap1.docs[0].data(), source: "clients-query-clientId" };
    }
  } catch (err: any) {
    console.warn("[GeraPay] Error querying clients by clientId:", err);
    if (err.code === "permission-denied" || err?.message?.toLowerCase().includes("permission")) {
      throw err;
    }
  }

  // 4. Try query in clients collection: businessId == businessId
  try {
    const q2 = query(collection(db, "clients"), where("businessId", "==", cleanId));
    const snap2 = await getDocs(q2);
    if (!snap2.empty) {
      return { id: snap2.docs[0].id, ...snap2.docs[0].data(), source: "clients-query-businessId" };
    }
  } catch (err: any) {
    console.warn("[GeraPay] Error querying clients by businessId:", err);
    if (err.code === "permission-denied" || err?.message?.toLowerCase().includes("permission")) {
      throw err;
    }
  }

  return null;
}

export function useAuth() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [businessProfile, setBusinessProfile] = useState<any | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const fetchProfileAndBusiness = useCallback(async (firebaseUser: FirebaseUser) => {
    setLoading(true);
    setError(null);
    setErrorCode(null);

    try {
      const uid = firebaseUser.uid;
      const email = firebaseUser.email || "";

      // 3. Fetch user profile from: users/{uid}
      let userDocRef = doc(db, "users", uid);
      let userSnap: any = null;
      try {
        userSnap = await getDoc(userDocRef);
      } catch (docErr: any) {
        console.error("[GeraPay useAuth] error reading users doc directly:", docErr);
        if (docErr.code === "permission-denied" || docErr?.message?.toLowerCase().includes("permission")) {
          setError("Database permission denied.");
          setErrorCode("permission-denied");
          setLoading(false);
          return;
        }
        throw docErr;
      }

      let profileData: any = null;

      if (userSnap && userSnap.exists()) {
        profileData = userSnap.data();
      } else {
        // Fallback to query by email in users collection safely try-caught
        try {
          const qEmail = query(collection(db, "users"), where("email", "==", email.trim().toLowerCase()));
          const snapEmail = await getDocs(qEmail);
          if (!snapEmail.empty) {
            profileData = snapEmail.docs[0].data();
          }
        } catch (qErr) {
          console.warn("[GeraPay useAuth] Fallback query by email failed or blocked by rules:", qErr);
        }
      }

      // If user profile is not configured or missing:
      if (!profileData) {
        setError("User profile missing. Contact Gera Tech admin.");
        setErrorCode("profile-missing");
        setUserProfile(null);
        setBusinessProfile(null);
        setRole(null);
        setBusinessId(null);
        setLoading(false);
        return;
      }

      // Profile exists, compile values
      const compiledProfile: UserProfile = {
        uid,
        email: profileData.email || email,
        role: profileData.role || "",
        businessId: profileData.businessId || "",
        businessName: profileData.businessName || "",
        username: profileData.username || "",
        active: profileData.active !== false, // Default to true if not present
        maxStaff: profileData.maxStaff,
        maxDevices: profileData.maxDevices,
      };

      setUserProfile(compiledProfile);

      // Verify user active: "Account inactive."
      if (!compiledProfile.active) {
        setError("Account inactive.");
        setErrorCode("account-inactive");
        setLoading(false);
        return;
      }

      // Verify user has role: "User role not assigned."
      if (!compiledProfile.role) {
        setError("User role not assigned.");
        setErrorCode("role-missing");
        setLoading(false);
        return;
      }

      setRole(compiledProfile.role);

      // If Super Admin, bypass business profile load
      if (compiledProfile.role === "super_admin") {
        setBusinessId("SYSTEM");
        setBusinessProfile({ id: "SYSTEM", name: "Gera Tech Admin Console", status: "active" });
        setLoading(false);
        return;
      }

      // Verify active business ID: "Business account not linked."
      if (!compiledProfile.businessId) {
        setError("Business account not linked.");
        setErrorCode("missing_business_id");
        setLoading(false);
        return;
      }

      setBusinessId(compiledProfile.businessId);

      // Load business profile with supportive multi-lookup system
      let bizProfile: any = null;
      try {
        bizProfile = await fetchBusinessProfile(compiledProfile.businessId);
      } catch (bizErr: any) {
        if (bizErr.code === "permission-denied" || bizErr.message?.toLowerCase().includes("permission")) {
          setError("Database permission denied.");
          setErrorCode("permission-denied");
          setLoading(false);
          return;
        }
        throw bizErr;
      }

      if (!bizProfile) {
        console.warn("[GeraPay useAuth] Business profile is missing. Auto-provisioning business and client records now...");
        const targetId = compiledProfile.businessId.trim().toUpperCase();
        const pName = compiledProfile.businessName || `${targetId} Restaurant`;
        const clientPayload = {
          businessId: targetId,
          clientId: targetId,
          businessName: pName,
          ownerName: "Merchant Owner",
          phone: "+250780000000",
          location: "Kigali, Rwanda",
          category: "Food & Beverage / Restaurant",
          status: "active",
          active: true,
          qrType: "momo_v2",
          qrTypesEnabled: "momo_v2",
          hasClientLogin: true,
          maxStaff: compiledProfile.maxStaff || 10,
          maxDevices: compiledProfile.maxDevices || 5,
          plan: compiledProfile.plan || "restaurant",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          businessAdminName: "Merchant Owner",
          businessUsername: compiledProfile.email ? compiledProfile.email.split("@")[0].toLowerCase() : "admin",
          businessPassword: compiledProfile.passwordHash || "hash",
          passwordHash: compiledProfile.passwordHash || "hash",
          role: "business_admin",
          businessAccessQr: `/client-login?businessId=${targetId}`,
          businessAccessLink: `https://gerapay.qr/client-login?businessId=${targetId}`,
          businessAccessQrUrl: ""
        };
        try {
          await setDoc(doc(db, "businesses", targetId), clientPayload);
          await setDoc(doc(db, "clients", targetId), clientPayload);
          bizProfile = clientPayload;
          console.log("[GeraPay useAuth] Dynamic business profile auto-provisioned successfully:", targetId);
        } catch (provErr) {
          console.error("[GeraPay useAuth] Dynamic business auto-provisioning failed:", provErr);
          setError("Business profile missing.");
          setErrorCode("business-profile-missing");
          setLoading(false);
          return;
        }
      }

      // Check business active status: "Business inactive."
      if (bizProfile.status && bizProfile.status !== "active") {
        setError("Business inactive.");
        setErrorCode("business-inactive");
        setLoading(false);
        return;
      }

      setBusinessProfile(bizProfile);

      // Save custom session for robustness and seamlessness
      const unifiedUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        role: compiledProfile.role,
        businessId: compiledProfile.businessId,
        businessName: bizProfile.name || bizProfile.businessName || compiledProfile.businessName || "",
        active: compiledProfile.active,
        isCustomSession: true,
      };
      safeLocalStorage.setItem("gerapay_custom_session", JSON.stringify(unifiedUser));

    } catch (err: any) {
      console.error("[useAuth Hook Error]:", err);
      const mapped = mapAuthError(err);
      setError(mapped.message);
      setErrorCode(mapped.code);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (auth.currentUser) {
      await fetchProfileAndBusiness(auth.currentUser);
    } else {
      setLoading(false);
    }
  }, [fetchProfileAndBusiness]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await fetchProfileAndBusiness(firebaseUser);
      } else {
        // Clear states when user signs out
        setUserProfile(null);
        setBusinessProfile(null);
        setRole(null);
        setBusinessId(null);
        setError(null);
        setErrorCode(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [fetchProfileAndBusiness]);

  return {
    user,
    userProfile,
    businessProfile,
    role,
    businessId,
    loading,
    error,
    errorCode,
    refresh,
  };
}
