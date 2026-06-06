import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { 
  db, 
  auth, 
  googleProvider, 
  handleFirestoreError, 
  OperationType,
  firebaseConfig
} from "./lib/firebase";
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser,
  signInWithEmailAndPassword
} from "firebase/auth";
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  doc,
  limit
} from "firebase/firestore";
import { Client, Transaction } from "./types";
import { sha256, logSecurityEvent } from "./lib/security";
import PayPage from "./components/PayPage";
import DashboardView from "./components/DashboardView";
import ClientsView, { QRStickerGenerator } from "./components/ClientsView";
import { 
  getBusinessAccessUrl, 
  getPaymentUrl, 
  getMenuUrl, 
  getBillUrl 
} from "./lib/urls";
import TransactionsView from "./components/TransactionsView";
import RestaurantBillsView from "./components/RestaurantBillsView";
import CustomerBillPage from "./components/CustomerBillPage";
import CustomerFeedbackView from "./components/CustomerFeedbackView";
import OnboardingActivation from "./components/OnboardingActivation";
import SubscriptionsAdminView from "./components/SubscriptionsAdminView";
import AdminAccessView from "./components/AdminAccessView";
import ClientAccessView from "./components/ClientAccessView";
import MenuManagerView from "./components/MenuManagerView";
import PublicMenuView from "./components/PublicMenuView";
import BusinessAccessLoginView from "./components/BusinessAccessLoginView";
import LoginPage from "./components/LoginPage";
import { useAuth } from "./hooks/useAuth";
import GeraAIMonitor from "./components/GeraAIMonitor";
import { generateBusinessUsername } from "./lib/security";
import { safeLocalStorage, safeCopyToClipboard } from "./lib/storage";
import { 
  QrCode, 
  LogOut, 
  LayoutDashboard, 
  Users, 
  TrendingUp, 
  Bell, 
  ShieldCheck, 
  ShieldAlert,
  AlertCircle,
  Clock,
  ExternalLink,
  Lock,
  Sparkles,
  RefreshCw,
  RefreshCcw,
  Copy,
  ChevronRight,
  CheckCircle,
  X,
  Download,
  Globe,
  Utensils,
  Briefcase,
  MessageSquare,
  Printer,
  CodeXml as CodeXML
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const ADMIN_EMAIL = "ishimwecharles2525@gmail.com";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

export default function App() {
  const [routePath, setRoutePath] = useState(typeof window !== "undefined" ? window.location.pathname : "/");
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const authState = useAuth();
  const [isDemoAdmin, setIsDemoAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [hasLoadTimeout, setHasLoadTimeout] = useState(false);
  const [accessValidationError, setAccessValidationError] = useState<string | null>(null);
  const [isValidatingAccess, setIsValidatingAccess] = useState<boolean>(false);
  const [qrValidationError, setQrValidationError] = useState<string | null>(null);
  const [searchedQrClientId, setSearchedQrClientId] = useState<string>("");

  // Activation & Licensing States
  const [isActivated, setIsActivated] = useState<boolean>(true);
  const [activePlan, setActivePlan] = useState<string | null>("enterprise");
  const [currentDeviceId, setCurrentDeviceId] = useState<string>(() => {
    let dId = safeLocalStorage.getItem("gerapay_pwa_device_id");
    if (!dId) {
      dId = "GERA-DEV-" + Math.floor(100000 + Math.random() * 900000);
      safeLocalStorage.setItem("gerapay_pwa_device_id", dId);
    }
    return dId;
  });

  // PWA Prompt installer states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  // Define public routes that can load instantly without blocking on authenticating state
  const isPublicPath = (path: string): boolean => {
    if (path === "/" || path === "/client-login" || path === "/admin-login" || path === "/client-login/") {
      return true;
    }
    if (/^\/pay\//i.test(path) || /^\/international\//i.test(path) || /^\/bill\//i.test(path) || /^\/menu\//i.test(path) || /^\/business-access\//i.test(path)) {
      return true;
    }
    return false;
  };

  // Intercept Firestore / connection exceptions globally
  useEffect(() => {
    console.log("[GeraPay Debug] Device Signature ID:", currentDeviceId);
    console.log("[GeraPay Debug] Online status:", typeof navigator !== "undefined" ? navigator.onLine : "unknown");

    const handleFirebaseError = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      const errMsg = detail?.error || "";
      console.error("[GeraPay Debug] Intercepted Firestore node error:", errMsg, detail);
      if (
        errMsg.includes("permission-denied") || 
        errMsg.includes("permission") || 
        errMsg.includes("Missing or insufficient permissions") || 
        errMsg.includes("unauthorized")
      ) {
        console.warn("[GeraPay Debug] Bypassing Gateway Timeout for permission or access control errors: ", errMsg);
        return;
      }
      setConnectionError("Connection error. Please refresh or check internet.");
    };

    const handleOnlineStatusChange = () => {
      const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
      console.log("[GeraPay Debug] Network interface updated, isOnline:", isOnline);
      if (!isOnline) {
        addToast("Terminal disconnected: Running in cache fallback (Offline Mode)", "warning");
      } else {
        addToast("Terminal connected: Synchronization node active", "success");
      }
    };

    window.addEventListener("gerapay_firebase_error", handleFirebaseError);
    window.addEventListener("online", handleOnlineStatusChange);
    window.addEventListener("offline", handleOnlineStatusChange);

    return () => {
      window.removeEventListener("gerapay_firebase_error", handleFirebaseError);
      window.removeEventListener("online", handleOnlineStatusChange);
      window.removeEventListener("offline", handleOnlineStatusChange);
    };
  }, [currentDeviceId]);

  // 0. Detect 8-second handshake timeouts for network robustness
  useEffect(() => {
    const timer = setTimeout(() => {
      if (authLoading) {
        console.warn("[GeraPay Handshake] Loading handshake exceeded 5-second target limits.");
        setHasLoadTimeout(true);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [authLoading]);

  const [mtnMomoActive, setMtnMomoActive] = useState<boolean>(false);

  useEffect(() => {
    fetch("/api/momo/config")
      .then((res) => res.json())
      .then((data) => {
        setMtnMomoActive(!!data.mtnMomoActive);
        if (typeof window !== "undefined") {
          (window as any).mtnMomoActive = !!data.mtnMomoActive;
        }
      })
      .catch((err) => {
        console.warn("Could not load momo configuration:", err);
      });
  }, []);

  // 0b. Handle offline search bypass query automatically on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("offline_bypass") === "true") {
        if ((import.meta as any).env?.DEV === true) {
          console.warn("[GeraPay PWA] Safe offline bypass sequence initiated from index.html.");
          setIsDemoAdmin(true);
          setAuthLoading(false);
          setIsActivated(true);
          setActivePlan("enterprise");
        } else {
          console.warn("[GeraPay PWA] Offline bypass parameter blocked in production environment.");
        }
      }
    }
  }, []);

  // 1. PWA Installation stashing & licensing listeners disabled temporarily
  useEffect(() => {
    console.log("[GeraPay PWA] Native installation hooks temporarily bypassed for performance.");
  }, []);

  const handleInstallApp = async () => {
    addToast("PWA offline installation is temporarily deactivated for performance tuning.", "info");
  };

  
  // Real-time globally synced states
  const [clients, setClients] = useState<Client[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [singleClient, setSingleClient] = useState<Client | null>(null);
  const [singleClientLoading, setSingleClientLoading] = useState(false);

  // Custom credentials login states
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginTab, setLoginTab] = useState<"google" | "credentials">("google");
  const [clientTabView, setClientTabView] = useState("bills");
  const [simulationClient, setSimulationClient] = useState<Client | null>(null);
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);

  // Diagnostic state variables for checking Super Admin setup status
  const [setupCheckResult, setSetupCheckResult] = useState<{
    authEnabled: boolean | null;
    adminEmailExists: boolean | null;
    profileExists: boolean | null;
    roleSuperAdmin: boolean | null;
    activeTrue: boolean | null;
    checking: boolean;
  }>({
    authEnabled: null,
    adminEmailExists: null,
    profileExists: null,
    roleSuperAdmin: null,
    activeTrue: null,
    checking: false
  });

  // Role & Business simulation states for perfect separation
  const [simulationRole, setSimulationRole] = useState<"super_admin" | "business_admin" | "cashier" | "waiter">(() => {
    const stored = safeLocalStorage.getItem("gerapay_simulated_role");
    if (stored === "super_admin" || stored === "business_admin" || stored === "cashier" || stored === "waiter") {
      return stored;
    }
    return "super_admin";
  });

  const [pendingDevicesCount, setPendingDevicesCount] = useState(0);
  const [newFeedbackCount, setNewFeedbackCount] = useState(0);

  // Subscribe to pending devices for reactive sidebar alerts/notifications
  useEffect(() => {
    const bizId = currentUser?.isCustomSession 
      ? currentUser.businessId 
      : (simulationClient?.clientId || "");
      
    if (!bizId) {
      setPendingDevicesCount(0);
      return;
    }

    const hasAuth = auth?.currentUser !== null;
    if (!hasAuth) {
      setPendingDevicesCount(0);
      return;
    }
    
    const q = query(
      collection(db, "devices"),
      where("businessId", "==", bizId), 
      where("status", "==", "pending_approval")
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
      setPendingDevicesCount(snapshot.size);
    }, (err) => {
      console.warn("Could not load devices metadata:", err);
    });
    
    return () => unsub();
  }, [currentUser, simulationClient]);

  // Subscribe to customer feedback count for unread badge and real-time manager alerts
  useEffect(() => {
    const bizId = currentUser?.isCustomSession 
      ? currentUser.businessId 
      : (simulationClient?.clientId || "");
      
    if (!bizId) {
      setNewFeedbackCount(0);
      return;
    }

    const hasAuth = auth?.currentUser !== null;
    if (!hasAuth) {
      setNewFeedbackCount(0);
      return;
    }
    
    const q = query(
      collection(db, "customerFeedback"),
      where("businessId", "==", bizId)
    );
    
    let isInitialLoad = true;
    
    const unsub = onSnapshot(q, (snapshot) => {
      const lastViewedStr = safeLocalStorage.getItem(`gerapay_last_viewed_feedback_${bizId}`) || "";
      const lastViewedTime = lastViewedStr ? new Date(lastViewedStr).getTime() : 0;
      
      let newCount = 0;
      let latestFeedbackDoc: any = null;
      let latestFeedbackTime = 0;
      
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const createdTime = data.createdAt ? new Date(data.createdAt).getTime() : 0;
        
        // Count as "unread" if it was submitted after the last time we viewed the tab
        if (createdTime > lastViewedTime) {
          newCount++;
        }
        
        if (createdTime > latestFeedbackTime) {
          latestFeedbackTime = createdTime;
          latestFeedbackDoc = data;
        }
      });
      
      setNewFeedbackCount(newCount);
      
      // If a brand new feedback lands while active, pop a beautiful alert toast!
      if (!isInitialLoad && latestFeedbackDoc) {
        const ageInSeconds = (Date.now() - latestFeedbackTime) / 1000;
        // Only trigger if submitted within the last 15 seconds to avoid backlog trigger states
        if (ageInSeconds < 15) {
          addToast(
            `New Feedback from Table ${latestFeedbackDoc.tableNumber || "N/A"}: ${latestFeedbackDoc.rating}★ Rating!`, 
            "success"
          );
        }
      }
      
      isInitialLoad = false;
    }, (err) => {
      console.warn("Could not load feedback counts:", err);
    });
    
    return () => unsub();
  }, [currentUser, simulationClient]);

  useEffect(() => {
    if (clients.length > 0 && !simulationClient) {
      setSimulationClient(clients[0]);
    }
  }, [clients, simulationClient]);

  // Active view states for admin
  const [adminView, setAdminView] = useState("dashboard"); // dashboard, clients, transactions, client-detail
  const [viewedClient, setViewedClient] = useState<Client | null>(null);
  const [businessAccessQrData, setBusinessAccessQrData] = useState<string>("");
  const [showPrintAccessCardModal, setShowPrintAccessCardModal] = useState<Client | null>(null);

  useEffect(() => {
    if (viewedClient?.clientId && viewedClient.clientType === "system_access") {
      const accessUrl = getBusinessAccessUrl(viewedClient.clientId);
      QRCode.toDataURL(
        accessUrl,
        {
          width: 512,
          margin: 2,
          color: {
            dark: "#000000",
            light: "#FFFFFF"
          }
        },
        (err, url) => {
          if (!err) {
            setBusinessAccessQrData(url);
          }
        }
      );
    } else {
      setBusinessAccessQrData("");
    }
  }, [viewedClient]);

  // Global toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: "success" | "error" | "info" | "warning" = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };



  // 1. Initial Route Syncing
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname;
      setRoutePath(path);
      
      const menuMatch = path.match(/\/menu\/([^/?#\s]+)/i);
      const menuIdParam = menuMatch ? menuMatch[1].trim() : null;
      console.log(`[GeraPay Route Debug] Current route path: ${path} | Detected Business ID: ${menuIdParam || "none"}`);

      if (path === "/admin/access") {
        setAdminView("access");
      } else if (path === "/client/users") {
        setClientTabView("access");
      } else if (path === "/client/menu") {
        setClientTabView("menu");
      } else if (path === "/client") {
        setClientTabView("bills");
      }
    };
    window.addEventListener("popstate", handleLocationChange);
    handleLocationChange();
    return () => window.removeEventListener("popstate", handleLocationChange);
  }, []);

  // 2. Auth State Sync with Real-time listeners & Profile Handshake Validation
  const performAccessValidation = async (firebaseUser: any) => {
    if (!firebaseUser) {
      setAccessValidationError(null);
      setIsValidatingAccess(false);
      return;
    }
    
    setIsValidatingAccess(true);
    setAccessValidationError(null);

    const uid = firebaseUser.uid || "";
    const email = (firebaseUser.email || "").trim().toLowerCase();

    console.log("[Access Validation] Commencing security handshake...", { uid, email });

    try {
      // Check users collection by email/uid.
      let userDoc = null;
      let userData: any = null;

      // Direct bypass for offline, demo, and customized portal sessions
      if (firebaseUser.isCustomSession) {
        userData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          role: firebaseUser.role,
          active: firebaseUser.active ?? true,
          businessId: firebaseUser.businessId,
          businessName: firebaseUser.businessName,
          plan: firebaseUser.plan || "restaurant",
          isCustomSession: true
        };
      }

      // Try checking by uid first (if not already resolved by custom session bypass)
      if (!userData && uid) {
        const qUid = query(collection(db, "users"), where("uid", "==", uid));
        const snapUid = await getDocs(qUid);
        if (!snapUid.empty) {
          userDoc = snapUid.docs[0];
          userData = userDoc.data();
        }
      }

      // If missing, query by email
      if (!userData && email) {
        const qEmail = query(collection(db, "users"), where("email", "==", email));
        const snapEmail = await getDocs(qEmail);
        if (!snapEmail.empty) {
          userDoc = snapEmail.docs[0];
          userData = userDoc.data();
        }
      }

      // If document is missing, check if it's the ADMIN_EMAIL to bypass, otherwise reject
      if (!userData) {
        if (email === ADMIN_EMAIL) {
          userData = {
            uid: uid || "GP-SYSTEM-ADMIN",
            email: ADMIN_EMAIL,
            role: "super_admin",
            active: true,
            businessId: "SYSTEM",
            businessName: "Gera Tech Admin Console",
            isCustomSession: true
          };
        } else {
          setAccessValidationError("Access not configured. Contact Gera Tech.");
          console.error("[Access Validation Error] User profile missing for auth credentials.", { uid, email });
          
          // Log exactly for requirement 9
          console.log("Logged Credentials Metadata:", {
            uid: uid || "missing",
            email: email || "missing",
            role: "none",
            businessId: "none",
            "business active status": "none"
          });
          setIsValidatingAccess(false);
          return;
        }
      }

      // If role is missing, show: “User role not assigned.”
      if (!userData.role) {
        setAccessValidationError("User role not assigned.");
        console.error("[Access Validation Error] Role is missing on the profile document.", { uid, email });
        
        // Log exactly for requirement 9
        console.log("Logged Credentials Metadata:", {
          uid: uid || userData.uid || "none",
          email: email || userData.email || "none",
          role: "none",
          businessId: userData.businessId || "none",
          "business active status": "none"
        });
        setIsValidatingAccess(false);
        return;
      }

      // If businessId is missing, show: “Business account not linked.”
      // Note: role "super_admin" doesn't require a business account, but other roles do!
      if (userData.role !== "super_admin" && !userData.businessId) {
        setAccessValidationError("Business account not linked.");
        console.error("[Access Validation Error] Business account is not linked to this profile.", { uid, email });
        
        // Log exactly for requirement 9
        console.log("Logged Credentials Metadata:", {
          uid: uid || userData.uid || "none",
          email: email || userData.email || "none",
          role: userData.role,
          businessId: "none",
          "business active status": "none"
        });
        setIsValidatingAccess(false);
        return;
      }

      // If business is inactive, show: “Business account is inactive.”
      let businessActiveStatus = "none";
      let clientSnap: any = null;
      if (userData.role !== "super_admin" && userData.businessId) {
        const clientQuery = query(collection(db, "clients"), where("clientId", "==", userData.businessId));
        clientSnap = await getDocs(clientQuery);
        if (clientSnap.empty) {
          setAccessValidationError("Business account not linked.");
          console.error("[Access Validation Error] Linked business not found in clients.", { uid, email, businessId: userData.businessId });
          
          // Log exactly for requirement 9
          console.log("Logged Credentials Metadata:", {
            uid: uid || userData.uid || "none",
            email: email || userData.email || "none",
            role: userData.role,
            businessId: userData.businessId || "none",
            "business active status": "not found"
          });
          setIsValidatingAccess(false);
          return;
        }
        
        const clientData = clientSnap.docs[0].data();
        businessActiveStatus = clientData.status || "inactive";
        if (clientData.status !== "active") {
          setAccessValidationError("Business account is inactive.");
          console.error("[Access Validation Error] Business account " + userData.businessId + " is inactive.", { uid, email, role: userData.role, businessId: userData.businessId });
          
          // Log exactly for requirement 9
          console.log("Logged Credentials Metadata:", {
            uid: uid || userData.uid || "none",
            email: email || userData.email || "none",
            role: userData.role,
            businessId: userData.businessId || "none",
            "business active status": businessActiveStatus
          });
          setIsValidatingAccess(false);
          return;
        }
      } else if (userData.role === "super_admin") {
        businessActiveStatus = "active";
      }

      // Log details exactly as requested (uid, email, role, businessId, business active status)
      console.log("Logged Credentials Metadata:", {
        uid: uid || userData.uid || "none",
        email: email || userData.email || "none",
        role: userData.role,
        businessId: userData.businessId || "none",
        "business active status": businessActiveStatus
      });

      // Secure link device check and map the simulation client if appropriate
      if (userData.businessId) {
        let look: Client | null = null;
        if (userData.role !== "super_admin" && typeof clientSnap !== "undefined" && !clientSnap.empty) {
          look = { id: clientSnap.docs[0].id, ...clientSnap.docs[0].data() } as Client;
        } else {
          try {
            const clientDocRef = doc(db, "clients", userData.businessId);
            const snap = await getDoc(clientDocRef);
            if (snap.exists()) {
              look = { id: snap.id, ...snap.data() } as Client;
            } else {
              const qLook = query(collection(db, "clients"), where("clientId", "==", userData.businessId));
              const lookSnap = await getDocs(qLook);
              if (!lookSnap.empty) {
                look = { id: lookSnap.docs[0].id, ...lookSnap.docs[0].data() } as Client;
              }
            }
          } catch (e) {
            console.warn("Could not fetch look client on validation:", e);
          }
        }
        if (look) {
          setSimulationClient(look);
        }
      }

      const unifiedUser = {
        uid: uid || userData.uid || userDoc?.id || "unknown",
        email: email || userData.email,
        role: userData.role,
        businessId: userData.businessId || "",
        businessName: userData.businessName || "",
        plan: userData.plan || "restaurant",
        active: userData.active ?? true,
        isCustomSession: true
      };

      setCurrentUser(unifiedUser);
      safeLocalStorage.setItem("gerapay_custom_session", JSON.stringify(unifiedUser));
      setAccessValidationError(null);
      setIsValidatingAccess(false);

    } catch (err: any) {
      console.error("[Access Validation Error] Error during Firestore fetch/rules transaction:", err);
      // If Firestore permission denied, show exact permission error.
      const errorMsg = err?.message || String(err);
      if (errorMsg.includes("permission-denied") || errorMsg.includes("Missing or insufficient permissions") || errorMsg.includes("permission")) {
        setAccessValidationError(`Permission denied: ${errorMsg}`);
      } else {
        setAccessValidationError(`Firestore connection failed: ${errorMsg}`);
      }
      setIsValidatingAccess(false);
    }
  };

  // Sync useAuth hook state to App level state
  useEffect(() => {
    if (authState.userProfile) {
      setCurrentUser({
        uid: authState.userProfile.uid,
        email: authState.userProfile.email,
        role: authState.userProfile.role,
        businessId: authState.userProfile.businessId,
        businessName: authState.userProfile.businessName || authState.businessProfile?.name || authState.businessProfile?.businessName || "",
        active: authState.userProfile.active,
        maxStaff: authState.userProfile.maxStaff || 5,
        maxDevices: authState.userProfile.maxDevices || 3,
        isCustomSession: true
      });
    } else {
      if (!isDemoAdmin) {
        setCurrentUser(null);
      }
    }
  }, [authState.userProfile, authState.businessProfile, isDemoAdmin]);

  useEffect(() => {
    if (!isDemoAdmin) {
      setAuthLoading(authState.loading);
    }
  }, [authState.loading, isDemoAdmin]);

  useEffect(() => {
    if (authState.error) {
      setAccessValidationError(authState.error);
    } else {
      setAccessValidationError(null);
    }
  }, [authState.error]);

  // 2b. Database Activation Validation Loop bypassed to prevent production blocks
  useEffect(() => {
    setIsActivated(true);
    if (currentUser && currentUser.isCustomSession) {
      setActivePlan(currentUser.plan || "restaurant");
    } else {
      setActivePlan("enterprise");
    }
  }, [currentUser, isDemoAdmin]);

  // 3. Bind real-time Firestore listeners if authenticated
  useEffect(() => {
    let unsubClients: () => void;
    let unsubTxns: () => void;
    
    // Only fetch developer-level global dashboards if authenticated as an admin
    const isAdminLogged = isDemoAdmin || (currentUser && currentUser.role === "super_admin");
    const hasAuth = auth?.currentUser !== null;
    
    if (isAdminLogged) {
      if (hasAuth) {
        const clientsPath = "clients";
        const qClients = query(collection(db, clientsPath), orderBy("createdAt", "desc"), limit(150));
        unsubClients = onSnapshot(qClients, (snapshot) => {
          const list: Client[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as Client);
          });
          setClients(list);
        }, (err) => {
          handleFirestoreError(err, OperationType.LIST, clientsPath);
        });

        const txnsPath = "transactions";
        const qTxns = query(collection(db, txnsPath), orderBy("createdAt", "desc"), limit(150));
        unsubTxns = onSnapshot(qTxns, (snapshot) => {
          const list: Transaction[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as Transaction);
          });
          setTransactions(list);
        }, (err) => {
          handleFirestoreError(err, OperationType.LIST, txnsPath);
        });
      } else {
        setClients([]);
        setTransactions([]);
      }
    } else if (currentUser && currentUser.businessId) {
      // Non-admin but business user logged in - load their own client details and transactions safely
      const bizId = currentUser.businessId;

      if (hasAuth) {
        // 1. Load exact client node
        const docRef = doc(db, "clients", bizId);
        unsubClients = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            setClients([{ id: docSnap.id, ...docSnap.data() } as Client]);
          } else {
            setClients([{
              id: bizId,
              clientId: bizId,
              businessId: bizId,
              businessName: currentUser.businessName || "Mizerwa Restaurant",
              plan: currentUser.plan || "restaurant",
              clientType: "system_access",
              logoUrl: "",
              ownerName: "Merchant Owner",
              active: true,
              status: "active",
              createdAt: new Date().toISOString()
            } as Client]);
          }
        }, (err) => {
          console.warn("[Client Live Subscription Error] falling back to local static client configuration", err);
          setClients([{
            id: bizId,
            clientId: bizId,
            businessId: bizId,
            businessName: currentUser.businessName || "Mizerwa Restaurant",
            plan: currentUser.plan || "restaurant",
            clientType: "system_access",
            logoUrl: "",
            ownerName: "Merchant Owner",
            active: true,
            status: "active",
            createdAt: new Date().toISOString()
          } as Client]);
        });

        // 2. Load exact transactions node matching their store
        const qTxns = query(collection(db, "transactions"), where("businessId", "==", bizId), limit(150));
        unsubTxns = onSnapshot(qTxns, (snapshot) => {
          const list: Transaction[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as Transaction);
          });
          setTransactions(list);
        }, (err) => {
          console.warn("[Client Transaction Subscription Error] cleared or restricted:", err);
          setTransactions([]);
        });
      } else {
        setClients([{
          id: bizId,
          clientId: bizId,
          businessId: bizId,
          businessName: currentUser.businessName || "Mizerwa Restaurant",
          plan: currentUser.plan || "restaurant",
          clientType: "system_access",
          logoUrl: "",
          ownerName: "Merchant Owner",
          active: true,
          status: "active",
          createdAt: new Date().toISOString()
        } as Client]);
        setTransactions([]);
      }
    } else {
      // Clear for non-authenticated callers
      setClients([]);
      setTransactions([]);
    }

    return () => {
      if (unsubClients) unsubClients();
      if (unsubTxns) unsubTxns();
    };
  }, [currentUser, isDemoAdmin]);

  // 4. Handle Customer Payment direct route fetching
  useEffect(() => {
    const isPayRoute = /^\/pay\//i.test(routePath);
    const isIntlRoute = /^\/international\//i.test(routePath);

    if (!isPayRoute && !isIntlRoute) {
      setSingleClient(null);
      setQrValidationError(null);
      return;
    }

    const payMatch = routePath.match(/\/pay\/([^/?#\s]+)/i);
    const intlMatch = routePath.match(/\/international\/([^/?#\s]+)/i);
    let clientId = payMatch ? payMatch[1].trim() : (intlMatch ? intlMatch[1].trim() : null);

    // Handle trailing slash if any
    if (clientId && clientId.endsWith("/")) {
      clientId = clientId.slice(0, -1);
    }

    if (!clientId || !/^[A-Z0-9_-]+$/i.test(clientId)) {
      setSearchedQrClientId(clientId || "INVALID");
      setQrValidationError("wrong QR route");
      setSingleClient(null);
      return;
    }

    const normalizedClientId = clientId.toUpperCase();
    setSearchedQrClientId(normalizedClientId);
    setSingleClientLoading(true);
    setQrValidationError(null);

    // Requirement 1: Log merchant ID extracted from QR URL
    console.log("[QR Diagnostic] Extracted merchant ID from QR URL:", normalizedClientId);

    let permissionErrorDetail: { collection: string; id: string; error: string } | null = null;

    const wrapGet = async (col: string, docId: string) => {
      try {
        const docRef = doc(db, col, docId);
        const snap = await getDoc(docRef);
        return snap;
      } catch (err: any) {
        console.error(`[QR Diagnostic Error] getDoc failed on collection '${col}' for doc ID '${docId}':`, err);
        const errMsg = err?.message || String(err);
        const isDeny = err?.code === "permission-denied" || errMsg.toLowerCase().includes("permission");
        if (isDeny && !permissionErrorDetail) {
          permissionErrorDetail = { collection: col, id: docId, error: errMsg };
        }
        return { exists: () => false, data: () => null, id: docId } as any;
      }
    };

    const wrapQuery = async (col: string, field: string, val: string, queryRef: any) => {
      try {
        const snap = await getDocs(queryRef);
        return snap;
      } catch (err: any) {
        console.error(`[QR Diagnostic Error] getDocs failed on collection '${col}' where '${field}' == '${val}':`, err);
        const errMsg = err?.message || String(err);
        const isDeny = err?.code === "permission-denied" || errMsg.toLowerCase().includes("permission");
        if (isDeny && !permissionErrorDetail) {
          permissionErrorDetail = { collection: col, id: `query: ${field} == ${val}`, error: errMsg };
        }
        return { empty: true, docs: [] } as any;
      }
    };

    // Run parallel multi-index redundant search queries with security-safe wrappers
    Promise.all([
      wrapGet("businesses", normalizedClientId),
      wrapGet("clients", normalizedClientId),
      wrapQuery("businesses", "businessId", normalizedClientId, query(collection(db, "businesses"), where("businessId", "==", normalizedClientId))),
      wrapQuery("clients", "clientId", normalizedClientId, query(collection(db, "clients"), where("clientId", "==", normalizedClientId))),
      wrapQuery("businesses", "id", normalizedClientId, query(collection(db, "businesses"), where("id", "==", normalizedClientId))),
      wrapQuery("businesses", "merchantId", normalizedClientId, query(collection(db, "businesses"), where("merchantId", "==", normalizedClientId))),
      wrapQuery("businesses", "terminalId", normalizedClientId, query(collection(db, "businesses"), where("terminalId", "==", normalizedClientId))),
      wrapQuery("clients", "businessId", normalizedClientId, query(collection(db, "clients"), where("businessId", "==", normalizedClientId))),
      wrapQuery("clients", "merchantId", normalizedClientId, query(collection(db, "clients"), where("merchantId", "==", normalizedClientId))),
      wrapQuery("clients", "id", normalizedClientId, query(collection(db, "clients"), where("id", "==", normalizedClientId))),
      wrapQuery("clients", "terminalId", normalizedClientId, query(collection(db, "clients"), where("terminalId", "==", normalizedClientId)))
    ]).then(([
      bizDoc, 
      cliDoc, 
      bizIdSnap, 
      cliIdSnap, 
      bizIdFieldSnap, 
      bizMerchSnap, 
      bizTermSnap,
      cliBizSnap, 
      cliMerchSnap, 
      cliIdFieldSnap,
      cliTermSnap
    ]) => {
      
      let foundDocData: any = null;
      let foundDocId: string = "";
      let matchedCollection: string = "";

      if (bizDoc.exists()) { 
        foundDocData = bizDoc.data(); 
        foundDocId = bizDoc.id; 
        matchedCollection = "businesses"; 
      }
      else if (cliDoc.exists()) { 
        foundDocData = cliDoc.data(); 
        foundDocId = cliDoc.id; 
        matchedCollection = "clients"; 
      }
      else if (!bizIdSnap.empty) { 
        foundDocData = bizIdSnap.docs[0].data(); 
        foundDocId = bizIdSnap.docs[0].id; 
        matchedCollection = "businesses"; 
      }
      else if (!cliIdSnap.empty) { 
        foundDocData = cliIdSnap.docs[0].data(); 
        foundDocId = cliIdSnap.docs[0].id; 
        matchedCollection = "clients"; 
      }
      else if (!bizIdFieldSnap.empty) { 
        foundDocData = bizIdFieldSnap.docs[0].data(); 
        foundDocId = bizIdFieldSnap.docs[0].id; 
        matchedCollection = "businesses"; 
      }
      else if (!bizMerchSnap.empty) { 
        foundDocData = bizMerchSnap.docs[0].data(); 
        foundDocId = bizMerchSnap.docs[0].id; 
        matchedCollection = "businesses"; 
      }
      else if (!bizTermSnap.empty) { 
        foundDocData = bizTermSnap.docs[0].data(); 
        foundDocId = bizTermSnap.docs[0].id; 
        matchedCollection = "businesses"; 
      }
      else if (!cliBizSnap.empty) { 
        foundDocData = cliBizSnap.docs[0].data(); 
        foundDocId = cliBizSnap.docs[0].id; 
        matchedCollection = "clients"; 
      }
      else if (!cliMerchSnap.empty) { 
        foundDocData = cliMerchSnap.docs[0].data(); 
        foundDocId = cliMerchSnap.docs[0].id; 
        matchedCollection = "clients"; 
      }
      else if (!cliIdFieldSnap.empty) { 
        foundDocData = cliIdFieldSnap.docs[0].data(); 
        foundDocId = cliIdFieldSnap.docs[0].id; 
        matchedCollection = "clients"; 
      }
      else if (!cliTermSnap.empty) { 
        foundDocData = cliTermSnap.docs[0].data(); 
        foundDocId = cliTermSnap.docs[0].id; 
        matchedCollection = "clients"; 
      }

      if (!foundDocData) {
        if (permissionErrorDetail) {
          const detailMsg = `FIRESTORE PERMISSION DENIED: Blocked collection '${permissionErrorDetail.collection}', document/query ID '${permissionErrorDetail.id}'`;
          console.error(detailMsg, permissionErrorDetail.error);
          setQrValidationError(detailMsg);
        } else {
          console.error(`[QR Diagnostic] Mismatch error. Merchant ID ${normalizedClientId} not found.`);
          setQrValidationError("Merchant not found.");
        }
        setSingleClient(null);
        setSingleClientLoading(false);
        return;
      }

      console.log(`[QR Diagnostic] Merchant matched in Firestore collection '${matchedCollection}':`, {
        docId: foundDocId,
        data: foundDocData
      });

      // 5. Merchant is valid if: active === true OR status === "active"
      const isActive = (foundDocData.active === true) || (foundDocData.status === "active");
      if (!isActive) {
        console.warn(`[QR Diagnostic] Merchant ${normalizedClientId} found but is inactive. active=${foundDocData.active}, status=${foundDocData.status}`);
        setQrValidationError("Merchant account inactive.");
        setSingleClient(null);
        setSingleClientLoading(false);
        return;
      }

      // 4. Accept both: id, businessId, merchantId (Normalize the data structure)
      const finalId = foundDocData.id || foundDocData.businessId || foundDocData.clientId || foundDocData.merchantId || foundDocId;
      const finalBusinessId = foundDocData.businessId || foundDocData.clientId || foundDocData.merchantId || foundDocData.id || foundDocId;
      const finalMerchantId = foundDocData.merchantId || foundDocData.businessId || foundDocData.clientId || foundDocData.id || foundDocId;

      const normalizedClient = {
        ...foundDocData,
        id: finalId,
        clientId: finalBusinessId,
        businessId: finalBusinessId,
        merchantId: finalMerchantId,
        active: true,
        status: "active"
      } as Client;

      setSingleClient(normalizedClient);
      setQrValidationError(null);
      setSingleClientLoading(false);
    }).catch((err: any) => {
      console.error("[QR Diagnostic] Error querying Firestore databases:", err);
      const errMsg = err?.message || String(err);
      if (permissionErrorDetail) {
        setQrValidationError(`FIRESTORE PERMISSION DENIED: Blocked collection '${permissionErrorDetail.collection}', document/query ID '${permissionErrorDetail.id}'`);
      } else if (err && (err.code === "permission-denied" || errMsg.toLowerCase().includes("permission"))) {
        setQrValidationError("Firestore permission denied: " + errMsg);
      } else {
        setQrValidationError("Firestore permission denied: " + errMsg);
      }
      setSingleClient(null);
      setSingleClientLoading(false);
    });
  }, [routePath]);

  // Trigger diagnostic audit on mounting admin-login or auth updates
  useEffect(() => {
    if (routePath === "/admin-login") {
      runSetupCheck();
    }
  }, [routePath, auth?.currentUser]);

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await logSecurityEvent({
        eventType: "auth_google_login_success",
        action: `User logged in using Google OAuth: ${result.user.email}`,
        userId: result.user.uid,
        userEmail: result.user.email
      });
    } catch (e: any) {
      if (e?.code === "auth/popup-blocked") {
        addToast("Sandbox Warning: Auth popup was blocked by browser", "warning");
      } else {
        addToast(e.message || "Sign in failed", "error");
      }
      await logSecurityEvent({
        eventType: "auth_google_login_failed",
        action: `Google OAuth login attempt failed`,
        metadata: { error: e?.message || String(e), code: e?.code || null }
      });
    }
  };

  const handleDemoBypass = async () => {
    if ((import.meta as any).env?.DEV !== true) {
      addToast("Demo Bypass is disabled in production environments.", "error");
      return;
    }
    setIsDemoAdmin(true);
    addToast("Entered Demo Admin Sandbox mode successfully", "success");
    await logSecurityEvent({
      eventType: "auth_demo_bypass",
      action: "User bypassed standard login authentication to enter Demo Admin Sandbox mode"
    });
  };

  const runSetupCheck = async () => {
    setSetupCheckResult(prev => ({ ...prev, checking: true }));
    let authEnabled = true;
    let adminEmailExists = false;
    let profileExists = false;
    let roleSuperAdmin = false;
    let activeTrue = false;

    // 1. Check if Firebase Auth is enabled by doing a test login
    try {
      await signInWithEmailAndPassword(auth, "test-checker@gerapay.local", "dummy");
    } catch (err: any) {
      if (err.code === "auth/operation-not-allowed" || err?.message?.includes("operation-not-allowed")) {
        authEnabled = false;
      }
    }

    // 2. Check if current admin email exists in users collection
    try {
      const q = query(
        collection(db, "users"),
        where("email", "==", ADMIN_EMAIL)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        adminEmailExists = true;
        const data = snap.docs[0].data();
        if (data.role === "super_admin") {
          roleSuperAdmin = true;
        }
        if (data.active === true) {
          activeTrue = true;
        }
      }
    } catch (e) {
      console.warn("Checker: Failed to check users collection", e);
    }

    // 3. Check if users/{auth.currentUser.uid} exists (if signed in)
    if (auth.currentUser) {
      try {
        const uDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (uDoc.exists()) {
          profileExists = true;
          const data = uDoc.data();
          if (data.role === "super_admin") {
            roleSuperAdmin = true;
          }
          if (data.active === true) {
            activeTrue = true;
          }
        }
      } catch (e) {
        console.warn("Checker: Failed to check users/{uid} collection", e);
      }
    }

    setSetupCheckResult({
      authEnabled,
      adminEmailExists,
      profileExists: auth.currentUser ? profileExists : (adminEmailExists ? true : false),
      roleSuperAdmin,
      activeTrue,
      checking: false
    });
  };

  const handleCreateSuperAdminProfile = async () => {
    if (!auth.currentUser) {
      addToast("Please authenticate first via Firebase Auth.", "error");
      return;
    }
    try {
      const uid = auth.currentUser.uid;
      const email = auth.currentUser.email || ADMIN_EMAIL;
      
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        await updateDoc(docRef, {
          role: "super_admin",
          active: true,
          email,
          businessId: "",
          businessName: "Gera Flow System",
          username: "Super Admin",
          updatedAt: new Date()
        });
      } else {
        const { setDoc } = await import("firebase/firestore");
        await setDoc(docRef, {
          role: "super_admin",
          active: true,
          email,
          businessId: "",
          businessName: "Gera Flow System",
          username: "Super Admin",
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      addToast("Super Admin Profile created in users collection successfully!", "success");
      await runSetupCheck();

      // Automatically register user session to enter page
      const unifiedUser = {
        uid,
        email,
        role: "super_admin",
        businessId: "",
        businessName: "Gera Flow System",
        plan: "enterprise",
        active: true,
        isCustomSession: true
      };
      setCurrentUser(unifiedUser);
      safeLocalStorage.setItem("gerapay_custom_session", JSON.stringify(unifiedUser));
      addToast("Logged in as Super Admin", "success");
      navigateTo("/admin");
    } catch (e: any) {
      console.error("Failed to create super admin profile:", e);
      addToast(`Creation failed: ${e.message}`, "error");
    }
  };

  const handleSuperAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminLoginError(null);
    setLoginLoading(true);

    const emailInput = loginEmail.trim();
    const passwordInput = loginPassword.trim();

    if (!emailInput || !passwordInput) {
      setAdminLoginError("Please enter your email and password.");
      setLoginLoading(false);
      return;
    }

    try {
      let finalUid = "";
      let finalEmail = "";
      let isFallbackMode = false;

      try {
        // Authenticate using Firebase Authentication Email/Password
        const userCredential = await signInWithEmailAndPassword(auth, emailInput, passwordInput);
        finalUid = userCredential.user?.uid || "";
        finalEmail = userCredential.user?.email || emailInput;
      } catch (authErr: any) {
        if (authErr && (authErr.code === "auth/operation-not-allowed" || authErr?.message?.includes("operation-not-allowed"))) {
          console.warn("[GeraPay SysAdmin] Firebase Auth Email/Password disabled hook triggered. Pulling Firestore secure ledger...");
          
          const q = query(collection(db, "users"), where("email", "==", emailInput));
          const snap = await getDocs(q);
          isFallbackMode = true;
          
          if (snap.empty) {
            throw { code: "auth/user-not-found" };
          }
          const uDoc = snap.docs[0];
          const userData = uDoc.data();
          const targetHash = sha256(passwordInput.trim());
          const savedPass = userData.password || userData.passwordHash;
          if (savedPass && savedPass !== passwordInput.trim() && savedPass !== targetHash) {
            throw { code: "auth/wrong-password" };
          }
          finalUid = uDoc.id;
          finalEmail = userData.email || emailInput;
        } else {
          throw authErr;
        }
      }

      // Read users/{uid}
      let userDoc;
      try {
        userDoc = await getDoc(doc(db, "users", finalUid));
      } catch (err: any) {
        throw { code: "permission-denied" };
      }

      let userData;
      if (!userDoc.exists()) {
        const q = query(collection(db, "users"), where("email", "==", finalEmail));
        const qSnap = await getDocs(q);
        if (qSnap.empty) {
          throw { code: "profile-missing" };
        }
        userData = qSnap.docs[0].data();
        finalUid = qSnap.docs[0].id;
      } else {
        userData = userDoc.data();
      }

      // Confirm role == super_admin
      if (userData.role !== "super_admin") {
        throw { code: "role-invalid" };
      }

      // Confirm active == true
      if (userData.active !== true) {
        setAdminLoginError("This account is inactive.");
        addToast("This account is inactive.", "error");
        setLoginLoading(false);
        return;
      }

      // Successful login
      const unifiedUser = {
        uid: finalUid,
        email: userData.email || finalEmail,
        role: userData.role,
        businessId: "",
        businessName: "Gera Flow System",
        plan: "enterprise",
        active: true,
        isCustomSession: true
      };

      setCurrentUser(unifiedUser);
      safeLocalStorage.setItem("gerapay_custom_session", JSON.stringify(unifiedUser));
      addToast("Welcome, Super Admin", "success");
      navigateTo("/admin");
    } catch (err: any) {
      console.error("Super Admin authenticating error:", err);
      let errorMsg = "Unexpected system error";
      const code = err?.code || "";
      const msg = err?.message || "";
      
      if (code === "auth/operation-not-allowed" || msg.includes("operation-not-allowed")) {
        errorMsg = "Email/Password sign-in is disabled.";
      } else if (code === "auth/user-not-found" || code === "auth/invalid-email") {
        errorMsg = "Admin email not found.";
      } else if (code === "auth/wrong-password") {
        errorMsg = "Incorrect admin password.";
      } else if (code === "auth/invalid-credential") {
        errorMsg = "Incorrect email or password.";
      } else if (code === "permission-denied" || msg?.toLowerCase().includes("permission")) {
        errorMsg = "Database permission denied reading admin profile.";
      } else if (code === "profile-missing") {
        errorMsg = "Admin profile missing in users collection.";
      } else if (code === "role-invalid") {
        errorMsg = "This account is not a super admin.";
      } else {
        errorMsg = msg || "Unexpected system error";
      }

      setAdminLoginError(errorMsg);
      addToast(errorMsg, "error");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    const userEmail = auth?.currentUser?.email || "unknown";
    const userId = auth?.currentUser?.uid || "unknown";
    
    await logSecurityEvent({
      eventType: "auth_logout",
      action: `User signed out: ${userEmail}`,
      userId,
      userEmail
    });

    await signOut(auth);
    setIsDemoAdmin(false);
    setIsActivated(false);
    setActivePlan(null);
    safeLocalStorage.removeItem("gerapay_is_activated");
    safeLocalStorage.removeItem("gerapay_active_plan");
    safeLocalStorage.removeItem("gerapay_custom_session");
    addToast("Session terminated", "info");
  };

  const navigateTo = (path: string) => {
    window.history.pushState({}, "", path);
    setRoutePath(path);
  };

  const handleUpdateSimulatedRole = (role: "super_admin" | "business_admin" | "cashier" | "waiter") => {
    setSimulationRole(role);
    safeLocalStorage.setItem("gerapay_simulated_role", role);
    addToast(`Simulated role switched to ${role.replace("_", " ").toUpperCase()}`, "success");
    if (role === "super_admin") {
      navigateTo("/admin");
    } else {
      navigateTo("/client");
    }
  };

  // Synchronous page automatic redirects
  useEffect(() => {
    const isPayRoute = /^\/pay\//i.test(routePath);
    const isIntlRoute = /^\/international\//i.test(routePath);
    const isBillRoute = /^\/bill\//i.test(routePath);
    const isMenuRoute = /^\/menu\//i.test(routePath);
    const isClientPrefix = /^\/client\/|^\/client$/i.test(routePath);
    const isClientLoginRoute = /^\/client-login/i.test(routePath);
    const isAdminPrefix = /^\/admin($|\/)/i.test(routePath);
    const isBusinessAccessRoute = /^\/business-access\//i.test(routePath);

    if (currentUser || isDemoAdmin) {
      const role = currentUser?.role || (isDemoAdmin ? "super_admin" : simulationRole);
      
      const isClientRole = role === "business_admin" || role === "cashier" || role === "waiter";
      if (isClientRole) {
        if (!isClientPrefix && !isPayRoute && !isIntlRoute && !isBillRoute && !isMenuRoute && !isBusinessAccessRoute && !isClientLoginRoute) {
          console.warn(`[Route Security] Restricting client member ${role} to /client workspace.`);
          navigateTo("/client");
          return;
        }
      }

      if (isBusinessAccessRoute) {
        navigateTo("/client");
        return;
      }

      if (isAdminPrefix && role !== "super_admin") {
        addToast("Unauthorized: Restricted to Super Admins", "error");
        navigateTo("/client");
        return;
      }

      if (routePath === "/" || routePath === "" || isClientLoginRoute || routePath === "/admin-login" || (!isPayRoute && !isIntlRoute && !isBillRoute && !isMenuRoute && !isClientPrefix && !isAdminPrefix && !isBusinessAccessRoute)) {
        if (role === "super_admin") {
          navigateTo("/admin");
        } else {
          navigateTo("/client");
        }
      }
    } else {
      // Unauthenticated users trying to access restricted areas
      if (isAdminPrefix) {
        navigateTo("/admin-login");
        return;
      }
      // Allow staying on /business-access/:businessId without redirecting to client-login
      if (isBusinessAccessRoute) {
        // Keep them on current path to render BusinessAccessLoginView directly from URL
        return;
      }
      if (isClientPrefix) {
        // Redirect /client area to /client-login
        navigateTo("/client-login");
      }
    }
  }, [routePath, currentUser, isDemoAdmin, simulationRole]);

  const handleViewClientDetails = (client: Client) => {
    setViewedClient(client);
    setAdminView("client-detail");
  };

  // Global Access configuration validation error gate
  if (accessValidationError && !isPublicPath(routePath)) {
    return (
      <div id="access-error-screen" className="min-h-screen bg-[#0C0E14] text-slate-200 flex flex-col items-center justify-center p-4 font-sans select-none relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,#ef44440a_0%,transparent_50%)] pointer-events-none" />
        
        <div className="w-full max-w-sm bg-[#11141C] border border-white/10 rounded-[32px] p-8 text-center space-y-6 shadow-2xl relative z-10 animate-fade-in">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center">
              <AlertCircle size={32} className="animate-pulse" />
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-mono text-[#FFC107] uppercase tracking-widest font-extrabold mb-1 block">System Guard Protection</span>
            <h2 className="text-[#FFC107] text-md font-black tracking-tight uppercase font-sans">Access Denied</h2>
            <p className="text-sm font-semibold text-rose-400 leading-relaxed font-sans max-w-sm mx-auto">
              {accessValidationError}
            </p>
            <p className="text-xs text-slate-400 leading-normal font-sans">
              Credentials mapped successfully, but your registration node has restricted access privileges.
            </p>
          </div>

          <div className="pt-2 space-y-2.5">
            <button
              onClick={async () => {
                if (auth.currentUser) {
                  await performAccessValidation(auth.currentUser);
                } else {
                  const saved = safeLocalStorage.getItem("gerapay_custom_session");
                  if (saved) {
                    try {
                      const parsed = JSON.parse(saved);
                      if (parsed && parsed.email) {
                        await performAccessValidation({ uid: parsed.uid, email: parsed.email });
                      }
                    } catch (e) {
                      window.location.reload();
                    }
                  } else {
                    window.location.reload();
                  }
                }
              }}
              className="w-full py-3 bg-[#1B32FF] hover:brightness-110 active:scale-[0.98] transition-all text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer font-sans shadow-lg"
            >
              <RefreshCw size={13} /> Retry Access Handshake
            </button>
            
            <button
              onClick={() => {
                signOut(auth);
                setCurrentUser(null);
                setAccessValidationError(null);
                safeLocalStorage.removeItem("gerapay_custom_session");
                navigateTo("/");
              }}
              className="w-full py-3 bg-white/5 border border-white/10 hover:bg-white/10 active:scale-[0.98] transition-all text-slate-300 font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer font-sans"
            >
              <LogOut size={13} /> Sign Out / Switch User
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Global connection/handshake error gate
  if (connectionError) {
    return (
      <div id="connection-error-screen" className="min-h-screen bg-[#0C0E14] text-slate-200 flex flex-col items-center justify-center p-4 font-sans select-none relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,#ef44440a_0%,transparent_50%)] pointer-events-none" />
        
        <div className="w-full max-w-sm bg-[#11141C] border border-white/10 rounded-[32px] p-8 text-center space-y-6 shadow-2xl relative z-10 animate-fade-in">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-[#FFC107] flex items-center justify-center">
              <AlertCircle size={32} className="animate-pulse" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-extrabold text-white uppercase tracking-wider">Gateway Timeout</h2>
            <p className="text-sm font-semibold text-amber-500/90 leading-relaxed font-sans max-w-sm mx-auto">
              Connection error. Please refresh or check internet.
            </p>
            <p className="text-xs text-slate-400 leading-normal font-sans">
              The Gera Flow terminal layer could not connect to Firestore network sockets. Ensure your device is connected to active LTE, 3G, or Wi-Fi, and refresh.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                setConnectionError(null);
                window.location.reload();
              }}
              className="w-full py-3 bg-[#1B32FF] hover:brightness-110 active:scale-[0.98] transition-all text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer font-sans"
            >
              <RefreshCw size={13} /> Reconnect Terminal Node
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Determine what layout to render based on URL
  const isPayRoute = /^\/pay\//i.test(routePath);
  const isIntlRoute = /^\/international\//i.test(routePath);
  const isBillRoute = /^\/bill\//i.test(routePath);
  const isMenuRoute = /^\/menu\//i.test(routePath);
  const billMatch = routePath.match(/\/bill\/([^/?#\s]+)/i);
  const billIdParam = billMatch ? billMatch[1].trim() : null;
  const menuMatch = routePath.match(/\/menu\/([^/?#\s]+)/i);
  const menuIdParam = menuMatch ? menuMatch[1].trim() : null;

  const isBusinessAccessRoute = /^\/business-access\//i.test(routePath);
  const bizAccessMatch = routePath.match(/\/business-access\/([^/?#\s]+)/i);
  const bizAccessId = bizAccessMatch ? bizAccessMatch[1].trim() : null;

  // Render public components IMMEDIATELY to prevent mobile initialization blockages
  if (isBillRoute && billIdParam) {
    return (
      <>
        <CustomerBillPage 
          billIdParam={billIdParam} 
          onAdminBack={currentUser || isDemoAdmin ? () => navigateTo("/") : undefined} 
        />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  if (isMenuRoute && menuIdParam) {
    return (
      <>
        <PublicMenuView 
          businessIdParam={menuIdParam} 
          onBackToPortal={currentUser || isDemoAdmin ? () => navigateTo("/") : undefined} 
        />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  if (isPayRoute || isIntlRoute) {
    if (singleClientLoading) {
      return (
        <div className="min-h-screen bg-[#0C0E14] flex flex-col items-center justify-center text-white font-mono text-xs gap-3">
          <RefreshCw className="animate-spin text-[#1B32FF]" size={28} />
          <span>Searching Gera Flow Merchants...</span>
        </div>
      );
    }

    if (!singleClient) {
      return (
        <div id="qr-error-screen" className="min-h-screen bg-[#0C0E14] flex items-center justify-center text-slate-200 p-4 font-sans select-none relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,#ef44440a_0%,transparent_50%)] pointer-events-none" />
          
          <div className="w-full max-w-sm bg-[#11141C] border border-white/10 p-8 rounded-[32px] text-center space-y-6 shadow-2xl relative z-10 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 flex items-center justify-center mx-auto">
              <AlertCircle size={32} className="animate-pulse" />
            </div>
            
            <div className="space-y-2">
              <span className="text-[10px] font-mono text-[#FFC107] uppercase tracking-widest font-extrabold mb-1 block">Gera Flow Gateway</span>
              
              <h2 className="text-[#FFC107] text-md font-black tracking-tight uppercase">Invalid QR Connection</h2>
              
              <p className="text-xs text-slate-400 leading-normal mt-2 leading-relaxed">
                The QR link you scanned or navigated to could not be matched with an active merchant inside our Firestore registry.
              </p>

              <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-4 text-center mt-3 space-y-2">
                <span className="text-[10px] font-mono text-slate-500 block uppercase font-bold tracking-wider">Diagnostic Reason:</span>
                <span id="qr-error-reason" className="text-rose-400 font-sans text-xs font-black block uppercase tracking-wide">
                  {qrValidationError || "merchant not found"}
                </span>
              </div>

              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 text-left space-y-1 mt-3">
                <span className="text-[9px] font-mono text-slate-500 block uppercase font-bold tracking-wider font-semibold">Searched Terminal ID:</span>
                <span id="searched-merchant-id-label" className="text-slate-300 font-mono text-xs font-bold block select-all break-all">{searchedQrClientId || "UNKNOWN"}</span>
              </div>
            </div>
            
            <div className="pt-2">
              <button 
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-white/5 border border-white/10 hover:bg-white/10 active:scale-[0.98] transition-all rounded-xl text-xs font-bold font-mono text-white cursor-pointer"
              >
                🔄 Retry Handshake Connection
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <>
        <PayPage 
          client={singleClient} 
          onAdminBack={currentUser || isDemoAdmin ? () => navigateTo("/") : undefined} 
          forceInternationalMode={isIntlRoute}
        />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  // Show a visible safe loading screen while Firebase/Authentication is setting up (only for private dashboard paths)
  if (authLoading && !isPublicPath(routePath)) {
    if (hasLoadTimeout) {
      return (
        <div id="auth-loading-screen" className="min-h-screen bg-[#0C0E14] text-slate-200 flex flex-col items-center justify-center p-4 font-sans select-none relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#ef44440a_0%,transparent_60%)] pointer-events-none" />
          <div className="w-full max-w-sm bg-[#11141C] border border-white/10 p-6 rounded-[32px] text-center space-y-5 relative z-10 shadow-xl">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 flex items-center justify-center mx-auto shadow-md">
              <AlertCircle size={26} />
            </div>
            <div className="space-y-2">
              <h2 className="text-base font-black tracking-tight text-white uppercase font-sans">Handshake Timeout</h2>
              <p className="text-xs text-slate-400 leading-relaxed font-sans mt-2">
                Handshake took more than 8 seconds. Check your cellular data or proceed into offline sandbox demo panel directly.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button 
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-white/5 border border-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all active:scale-[0.98] cursor-pointer"
              >
                Retry
              </button>
              {((import.meta as any).env?.DEV === true) ? (
                <button 
                  onClick={() => {
                    setIsDemoAdmin(true);
                    setAuthLoading(false);
                  }}
                  className="w-full py-3 bg-[#FFC107] hover:brightness-110 text-[#0c0e14] rounded-xl text-xs font-black transition-all active:scale-[0.98] cursor-pointer"
                >
                  Demo Bypass
                </button>
              ) : (
                <div className="w-full text-center text-[10px] uppercase font-mono text-slate-500 py-3 bg-zinc-950/40 rounded-xl border border-white/5 flex items-center justify-center">
                  Production Lock
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div id="auth-loading-screen" className="min-h-screen bg-[#0C0E14] text-slate-200 flex flex-col items-center justify-center p-4 font-sans select-none relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#1b32ff10_0%,transparent_60%)] pointer-events-none" />
        
        <div className="w-full max-w-sm text-center space-y-6 relative z-10 flex flex-col items-center">
          <div className="relative">
            <img src="/gera-pay-qr-logo.svg" alt="Gera Flow" className="w-16 h-16 object-contain rounded-2xl shadow-xl animate-pulse" />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-[#1B32FF] shadow">
              <RefreshCw size={10} className="animate-spin" />
            </div>
          </div>
          
          <div className="space-y-1.5">
            <h1 className="text-lg font-black text-white tracking-tight uppercase">GERA FLOW</h1>
            <p className="text-xs text-slate-400 font-semibold leading-normal font-sans">
              Securing terminal connection node...
            </p>
          </div>
          
          <div className="w-24 h-0.5 bg-white/5 rounded-full overflow-hidden relative">
            <div className="absolute top-0 left-0 h-full w-1/3 bg-[#1B32FF] rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // Admin and Login Views
  const isAuthenticated = !!currentUser || isDemoAdmin;
  const activeClient = currentUser?.isCustomSession 
    ? clients.find(c => c.clientId === currentUser.businessId) 
    : simulationClient;

  return (
    <div className="bg-[#0C0E14] min-h-screen text-slate-200 antialiased selection:bg-indigo-500/30">
      <AnimatePresence mode="wait">
        {!isAuthenticated ? (
          /* LOGIN OR LANDING SCREENS */
          (isBusinessAccessRoute && bizAccessId) || routePath === "/client-login" || routePath.startsWith("/client-login?") ? (
            <div className="min-h-screen flex items-center justify-center p-4 relative bg-[#0C0E14]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#1B32FF08_0%,transparent_60%)] pointer-events-none" />
              <LoginPage
                user={authState.user}
                userProfile={authState.userProfile}
                businessProfile={authState.businessProfile}
                role={authState.role}
                businessId={authState.businessId}
                loading={authState.loading}
                error={authState.error}
                errorCode={authState.errorCode}
                onLoginSuccess={(profile, bizProfile) => {
                  const unified = {
                    uid: profile.uid,
                    email: profile.email,
                    role: profile.role,
                    businessId: profile.businessId,
                    businessName: bizProfile?.name || bizProfile?.businessName || profile.businessName || "",
                    active: profile.active,
                    isCustomSession: true
                  };
                  safeLocalStorage.setItem("gerapay_custom_session", JSON.stringify(unified));
                  if (typeof window !== "undefined") {
                    sessionStorage.setItem("businessId", profile.businessId);
                    sessionStorage.setItem("businessRole", profile.role);
                    sessionStorage.setItem("businessUsername", profile.username || profile.email);
                  }
                  setCurrentUser(unified);
                  navigateTo("/client");
                }}
                toast={addToast}
              />
            </div>
          ) : routePath === "/admin-login" || routePath.startsWith("/admin-login?") ? (
            /* DEDICATED GERA TECH ADMIN ACCESS POINT */
            <motion.div 
              key="admin-login"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="min-h-screen flex items-center justify-center p-4 relative"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#FFC10705_0%,transparent_60%)] pointer-events-none" />
              
              <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-6 relative z-10 my-8">
                
                {/* LOGIN FORM AND DEVELOPMENT CONTROLS */}
                <div className="md:col-span-6 bg-[#11141C] border border-white/10 rounded-3xl p-6 space-y-6 shadow-2xl flex flex-col justify-between">
                  <div className="space-y-6">
                    <div className="text-center space-y-2">
                      <div className="w-14 h-14 mx-auto mb-2 flex items-center justify-center bg-[#FFC107]/10 border border-[#FFC107]/20 text-[#FFC107] rounded-2xl">
                        <Lock size={22} className="animate-pulse" />
                      </div>
                      <div>
                        <h1 className="text-base font-bold tracking-tight text-white uppercase font-sans">Gera Tech Admin Portal</h1>
                        <p className="text-[10px] text-slate-500 font-mono tracking-widest mt-0.5 font-bold">SYSTEM BACKEND SYSTEM ENTRY</p>
                      </div>
                    </div>

                    {adminLoginError && (
                      <div id="admin-login-error" className="p-3.5 bg-rose-500/5 border border-rose-500/25 rounded-2xl flex items-start gap-2.5 text-rose-400 font-sans">
                        <AlertCircle size={14} className="shrink-0 mt-0.5 text-rose-400" />
                        <span className="text-[10.5px] font-bold leading-normal uppercase font-mono tracking-wide">{adminLoginError}</span>
                      </div>
                    )}

                    <form onSubmit={handleSuperAdminLogin} className="space-y-4 text-xs text-left">
                      <div className="space-y-1">
                        <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Super Admin Email</label>
                        <input
                          type="email"
                          placeholder="e.g. ishimwecharles2525@gmail.com"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          required
                          className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white placeholder-slate-800 focus:outline-none focus:border-[#FFC107] transition-all font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Super Admin Password</label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          required
                          className="w-full p-2.5 bg-zinc-950 border border-[#FFC107]/20 rounded-xl text-white placeholder-slate-800 focus:outline-none focus:border-[#FFC107] transition-all font-mono"
                        />
                      </div>

                      <button 
                        type="submit"
                        disabled={loginLoading}
                        className="w-full py-3 bg-[#FFC107] text-[#0C0E14] hover:brightness-110 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer disabled:opacity-50 tracking-wider font-sans uppercase"
                      >
                        {loginLoading ? <RefreshCw size={12} className="animate-spin" /> : <Lock size={12} />}
                        {loginLoading ? "ESTABLISHING TRUST SHIELDS..." : "AUTHORIZE SYSADMIN"}
                      </button>
                    </form>

                    {/* Development One-time Setup Helper */}
                    {((import.meta as any).env?.DEV === true) && (
                      <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl space-y-3">
                        <div className="flex items-center gap-1.5 text-amber-400 text-[10px] font-bold font-sans uppercase tracking-wider">
                          <Sparkles size={12} />
                          Local Development Setup Helper
                        </div>
                        
                        <p className="text-[9.5px] text-slate-400 leading-snug">
                          Use the button below to bootstrap or repair the `users/{'{uid}'}` Firestore profile once you verify Firebase Auth is enabled.
                        </p>

                        <button 
                          onClick={handleCreateSuperAdminProfile}
                          disabled={!auth.currentUser}
                          className="w-full py-2 bg-[#FFC107] disabled:bg-zinc-900 disabled:text-slate-600 disabled:border-white/5 disabled:cursor-not-allowed text-[#0C0E14] font-bold text-[10px] font-mono rounded-xl transition-all uppercase tracking-wide cursor-pointer flex items-center justify-center gap-1.5 border border-amber-500/10"
                        >
                          🛠️ Create Super Admin Profile
                        </button>
                        
                        {!auth.currentUser && (
                          <p className="text-[8px] text-rose-400/85 font-mono uppercase text-center">
                            * Sign in successfully with credentials first (or active session) to enable profile builder
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-white/5 flex flex-col items-center gap-3">
                    {((import.meta as any).env?.DEV === true) && (
                      <button 
                        onClick={handleDemoBypass}
                        className="w-full py-2 bg-zinc-900 border border-white/10 hover:bg-zinc-850 text-amber-500 hover:text-amber-400 font-mono text-[10px] font-bold rounded-xl transition-all uppercase tracking-wide cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        🚀 Bypass with Demo Admin Sandbox
                      </button>
                    )}
                    <button 
                      onClick={() => navigateTo("/")}
                      className="text-[10px] text-indigo-400 hover:text-white font-bold transition-all uppercase font-sans tracking-wide"
                    >
                      ← Back to Gateway Selector
                    </button>
                    <div className="text-center text-[9px] text-slate-500 font-mono uppercase">
                      ADMIN TERMINAL AREA • SECURED BY GERA PAY
                    </div>
                  </div>
                </div>

                {/* STATUS CHECKER & SYSTEM SETUP INSTRUCTIONS */}
                <div className="md:col-span-6 bg-[#11141C] border border-white/10 rounded-3xl p-6 space-y-6 shadow-2xl flex flex-col justify-between">
                  <div className="space-y-5">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={18} className="text-[#FFC107]" />
                        <span className="text-xs font-black uppercase text-white tracking-wider font-sans">Super Admin setup checker</span>
                      </div>
                      <button 
                        onClick={runSetupCheck}
                        disabled={setupCheckResult.checking}
                        className="p-1 px-2.5 bg-white/5 border border-white/5 hover:bg-white/10 rounded-lg text-[9px] font-bold uppercase font-mono text-slate-300 flex items-center gap-1 transition-all"
                      >
                        <RefreshCw size={10} className={setupCheckResult.checking ? "animate-spin" : ""} />
                        {setupCheckResult.checking ? "Auditing..." : "Re-Check"}
                      </button>
                    </div>

                    {/* LIVE DIAGNOSTICS */}
                    <div className="grid grid-cols-1 gap-2 text-xs font-mono">
                      
                      {/* Check 1: Firebase Auth enabled */}
                      <div className="p-2.5 bg-zinc-950/60 rounded-xl border border-white/5 flex items-center justify-between font-sans">
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase">Firebase Auth Integration</p>
                          <p className="text-[9px] text-slate-600 font-mono">Email/Password sign-in method</p>
                        </div>
                        <div>
                          {setupCheckResult.authEnabled === true ? (
                            <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-md text-[9px] font-mono font-bold uppercase">Enabled</span>
                          ) : setupCheckResult.authEnabled === false ? (
                            <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-md text-[9px] font-mono font-bold uppercase">Disabled</span>
                          ) : (
                            <span className="text-slate-600 animate-pulse text-[9px] font-mono">Analyzing...</span>
                          )}
                        </div>
                      </div>

                      {/* Check 2: Current Admin Email profile exists */}
                      <div className="p-2.5 bg-zinc-950/60 rounded-xl border border-white/5 flex items-center justify-between font-sans">
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase">Current Admin Email Exists</p>
                          <p className="text-[9px] text-slate-600 font-mono">Checking email in users Firestore collection</p>
                        </div>
                        <div>
                          {setupCheckResult.adminEmailExists === true ? (
                            <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-md text-[9px] font-mono font-bold uppercase">Found</span>
                          ) : setupCheckResult.adminEmailExists === false ? (
                            <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-md text-[9px] font-mono font-bold uppercase">Missing</span>
                          ) : (
                            <span className="text-slate-600 animate-pulse text-[9px] font-mono">Analyzing...</span>
                          )}
                        </div>
                      </div>

                      {/* Check 3: users/{uid} profile exists */}
                      <div className="p-2.5 bg-zinc-950/60 rounded-xl border border-white/5 flex items-center justify-between font-sans">
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase">Profile Matching UID</p>
                          <p className="text-[9px] text-slate-600 font-mono">Verified document users/{auth.currentUser?.uid || "uid"}</p>
                        </div>
                        <div>
                          {setupCheckResult.profileExists === true ? (
                            <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-md text-[9px] font-mono font-bold uppercase">Valid</span>
                          ) : setupCheckResult.profileExists === false ? (
                            <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-md text-[9px] font-mono font-bold uppercase">Missing</span>
                          ) : (
                            <span className="text-slate-600 animate-pulse text-[9px] font-mono">Analyzing...</span>
                          )}
                        </div>
                      </div>

                      {/* Check 4: role == super_admin */}
                      <div className="p-2.5 bg-zinc-950/60 rounded-xl border border-white/5 flex items-center justify-between font-sans">
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase">Role Verification</p>
                          <p className="text-[9px] text-slate-600 font-mono">Verifying role == super_admin</p>
                        </div>
                        <div>
                          {setupCheckResult.roleSuperAdmin === true ? (
                            <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-md text-[9px] font-mono font-bold uppercase">Verified</span>
                          ) : setupCheckResult.roleSuperAdmin === false ? (
                            <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-md text-[9px] font-mono font-bold uppercase">Failed</span>
                          ) : (
                            <span className="text-slate-600 animate-pulse text-[9px] font-mono">Analyzing...</span>
                          )}
                        </div>
                      </div>

                      {/* Check 5: active == true */}
                      <div className="p-2.5 bg-zinc-950/60 rounded-xl border border-white/5 flex items-center justify-between font-sans">
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase">Account Status</p>
                          <p className="text-[9px] text-slate-600 font-mono">Verifying state active == true</p>
                        </div>
                        <div>
                          {setupCheckResult.activeTrue === true ? (
                            <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-md text-[9px] font-mono font-bold uppercase">Active</span>
                          ) : setupCheckResult.activeTrue === false ? (
                            <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-md text-[9px] font-mono font-bold uppercase">Inactive</span>
                          ) : (
                            <span className="text-slate-600 animate-pulse text-[9px] font-mono">Analyzing...</span>
                          )}
                        </div>
                      </div>

                    </div>

                    {/* SETUP INSTRUCTIONS AND ACTIONS PANEL */}
                    <div className="p-4 bg-zinc-950/85 border border-white/5 rounded-2xl text-xs space-y-3.5">
                      <div className="flex items-center gap-1.5 text-white text-[10px] font-bold font-sans uppercase tracking-wide">
                        <ShieldAlert size={13} className="text-[#FFC107]" />
                        Setup Instructions screen when admin login is not configured
                      </div>

                      <div className="space-y-2.5 font-sans text-slate-400 text-[10px] leading-relaxed">
                        <div className="flex gap-2">
                          <span className="w-5 h-5 bg-zinc-900 border border-white/10 rounded flex items-center justify-center text-amber-500 text-[9px] font-mono font-bold shrink-0">1</span>
                          <div>
                            <p className="font-bold text-white uppercase text-[9px]">STEP 1: Enable Email/Password in Firebase Authentication</p>
                            <p className="mt-0.5">Go to Firebase Console → Authentication → Sign-in method, select Email/Password, select Enable, and click Save.</p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <span className="w-5 h-5 bg-zinc-900 border border-white/10 rounded flex items-center justify-center text-amber-500 text-[9px] font-mono font-bold shrink-0">2</span>
                          <div>
                            <p className="font-bold text-white uppercase text-[9px]">STEP 2: Create admin user in Firebase Authentication</p>
                            <p className="mt-0.5">Go to Users tab under Authentication and add user with email <code className="text-amber-500 font-mono text-[9px] bg-white/5 p-0.5 px-1 rounded">ishimwecharles2525@gmail.com</code>.</p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <span className="w-5 h-5 bg-zinc-900 border border-white/10 rounded flex items-center justify-center text-amber-500 text-[9px] font-mono font-bold shrink-0">3</span>
                          <div>
                            <p className="font-bold text-white uppercase text-[9px]">STEP 3: Create users/{'{uid}'} profile in Firestore</p>
                            <p className="mt-0.5">Create a Firestore document path: <code className="text-amber-500 font-mono text-[9px] bg-white/5 p-0.5 px-1 rounded">users/&lt;firebase_auth_uid&gt;</code>.</p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <span className="w-5 h-5 bg-zinc-900 border border-white/10 rounded flex items-center justify-center text-amber-500 text-[9px] font-mono font-bold shrink-0">4</span>
                          <div>
                            <p className="font-bold text-white uppercase text-[9px]">STEP 4: Set role = super_admin and active = true</p>
                            <p className="mt-0.5">Add field values: <code className="text-amber-500 font-mono text-[9px]">role: "super_admin"</code> and <code className="text-amber-500 font-mono text-[9px]">active: true</code> to enable full secure admin clearance.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-center text-[9px] text-slate-600 font-mono italic">
                    SYSTEM STATUS AND RECOVERY CONTROLS
                  </div>
                </div>

              </div>
            </motion.div>
          ) : (
            /* HOME LANDING SCREEN WITH GATEWAY SELECTION (DEVELOPER VS BUSINESS) */
            <motion.div 
              key="landing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-screen flex items-center justify-center p-4 relative"
            >
              {/* background flows */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_30%,#1b32ff14_0%,transparent_50%)] pointer-events-none" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,#ff3b3f02_0%,transparent_50%)] pointer-events-none" />

              <div className="w-full max-w-sm bg-[#11141C] border border-white/10 rounded-3xl p-6 relative z-10 space-y-7 shadow-2xl">
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 mx-auto mb-2 flex items-center justify-center">
                    <img src="/gera-pay-qr-logo.svg" alt="Gera Flow" className="w-14 h-14 object-contain rounded-2xl" />
                  </div>
                  <div>
                    <h1 className="text-base font-bold tracking-tight text-white uppercase font-sans">Gera Flow Rwanda</h1>
                    <p className="text-[10px] text-slate-500 font-mono tracking-widest mt-0.5 font-bold">TERMS & SYSTEM GATEWAYS</p>
                  </div>
                </div>

                {/* Big clear selection buttons */}
                <div className="space-y-3.5">
                  <div className="p-3 bg-white/[0.01] border border-white/5 rounded-2xl space-y-1.5 text-xs text-slate-300 text-left">
                    <span className="font-bold flex items-center gap-1 text-[#FFC107]">
                      <Sparkles size={12} /> Secure Portal Entrance
                    </span>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Select your system entrance channel below. Customers scanning physical standee QR codes pay automatically without registering.
                    </p>
                  </div>

                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigateTo("/client-login");
                    }}
                    className="w-full py-4 bg-[#1B32FF] text-white hover:brightness-110 font-black text-xs rounded-2xl flex items-center justify-center gap-2.5 shadow-xl transition-all active:scale-[0.98] uppercase tracking-wide border border-blue-500/10"
                    style={{ cursor: "pointer", position: "relative", zIndex: 99999, pointerEvents: "auto" }}
                  >
                    <Briefcase size={14} /> Business Login
                  </button>

                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigateTo("/admin-login");
                    }}
                    className="w-full py-4 bg-[#121624] text-slate-300 hover:brightness-115 hover:text-white font-bold text-xs rounded-2xl flex items-center justify-center gap-2.5 border border-white/10 transition-all active:scale-[0.98] uppercase tracking-wide"
                    style={{ cursor: "pointer", position: "relative", zIndex: 9999, pointerEvents: "auto" }}
                  >
                    <CodeXML size={14} className="text-purple-400" /> Developer Login
                  </button>
                </div>

                <div className="text-center border-t border-white/5 pt-4 text-[9px] text-slate-500 font-mono">
                  TERMS DEPLOYED BY GERA TECHNOLOGY CO.
                </div>
              </div>
            </motion.div>
          )
        ) : !isActivated ? (
          /* BILLING FIRST ONBOARDING PAYWALL ACTIVATION BARRIER */
          <motion.div
            key="activation-onboarding"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full"
          >
            <OnboardingActivation 
              currentUser={currentUser} 
              currentDeviceId={currentDeviceId} 
              onActivated={(act) => {
                setIsActivated(true);
                setActivePlan(act.planId);
                navigateTo("/");
              }}
              onLogout={handleLogout}
            />
          </motion.div>
        ) : (
          /* WORKSPACE INTERFACES */
          <motion.div 
            key="workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col"
          >
            {/* -------------------- GERA PAY SIMULATION DECK (FOR DEMO REVIEWERS) -------------------- */}
            <div className="bg-[#121624] border-b border-[#1B32FF]/20 px-6 py-2.5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></div>
                <span className="font-bold text-white uppercase tracking-wider font-mono text-[10px]">Developer Sandbox Simulation Console</span>
              </div>
              
              <div className="flex flex-wrap items-center gap-4">
                {/* Simulated Role Selection */}
                <div className="flex items-center gap-1 bg-zinc-900 border border-white/5 p-1 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-mono pl-1 pr-1">ROLE:</span>
                  {[
                    { id: "super_admin", label: "Super Admin (Dev)" },
                    { id: "business_admin", label: "Biz Admin" },
                    { id: "cashier", label: "Cashier" },
                    { id: "waiter", label: "Waiter" }
                  ].map(r => (
                    <button
                      key={r.id}
                      onClick={() => handleUpdateSimulatedRole(r.id as any)}
                      className={`px-2 py-1 rounded-lg font-bold text-[9px] uppercase transition-all whitespace-nowrap cursor-pointer ${
                        simulationRole === r.id 
                          ? "bg-[#1B32FF] text-white" 
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>

                {/* Simulated Active Store Selection */}
                {simulationRole !== "super_admin" && (
                  <div className="flex items-center gap-1.5 bg-zinc-900 border border-white/5 px-2 py-1 rounded-xl text-[10px] h-8">
                    <span className="text-[9px] text-slate-500 font-mono uppercase">Store:</span>
                    <select
                      value={simulationClient?.clientId || ""}
                      onChange={(e) => {
                        const cli = clients.find(c => c.clientId === e.target.value);
                        if (cli) {
                          setSimulationClient(cli);
                          addToast(`Simulation active client: ${cli.businessName}`, "info");
                        }
                      }}
                      className="bg-transparent text-white font-bold select-none focus:outline-none cursor-pointer max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap text-[10px]"
                    >
                      {clients.map(c => (
                        <option key={c.clientId} value={c.clientId} className="bg-[#11141C] text-white">
                          {c.businessName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Simulated Route Navigator */}
                <div className="flex items-center gap-1 bg-zinc-900 border border-white/5 p-1 rounded-xl">
                  <button
                    onClick={() => {
                      navigateTo("/admin");
                      if (simulationRole !== "super_admin") {
                        handleUpdateSimulatedRole("super_admin");
                      }
                    }}
                    className={`px-3 py-1 rounded-lg font-bold text-[9px] uppercase transition-all whitespace-nowrap cursor-pointer ${
                      routePath === "/admin" 
                        ? "bg-[#FFC107] text-[#0C0E14]" 
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    /admin (Admin Side)
                  </button>
                  <button
                    onClick={() => {
                      navigateTo("/client");
                      if (simulationRole === "super_admin") {
                        handleUpdateSimulatedRole("business_admin");
                      }
                    }}
                    className={`px-3 py-1 rounded-lg font-bold text-[9px] uppercase transition-all whitespace-nowrap cursor-pointer ${
                      routePath === "/client" 
                        ? "bg-[#FFC107] text-[#0C0E14]" 
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    /client (Client Side)
                  </button>
                </div>
              </div>
            </div>

            {/* MAIN ROUTE CONTENT RENDERING OR BINDINGS */}
            <div className="flex flex-col md:flex-row flex-grow">
              {routePath.startsWith("/client") ? (
                /* -------------------- CLIENT AREA WORKSPACE -------------------- */
                <>
                  {/* Client Side sidebar */}
                  <aside className="w-full md:w-64 bg-[#11141C] border-r border-white/5 flex flex-col justify-between text-xs p-5 space-y-6 md:h-[calc(100vh-53px)] md:sticky md:top-[53px]">
                    <div className="space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl relative overflow-hidden flex-shrink-0">
                          <img src="/gera-pay-qr-logo.svg" alt="Gera Flow" className="w-10 h-10 object-contain rounded-xl" />
                        </div>
                        <div>
                          <span className="font-bold text-white block uppercase tracking-wider text-xs font-sans">Client Billing</span>
                          <span className="text-[10px] text-slate-500 font-mono tracking-widest">RW SERVICES TERM</span>
                        </div>
                      </div>

                      {/* Active Merchant Card */}
                      {(currentUser?.isCustomSession ? clients.find(c => c.clientId === currentUser.businessId) : simulationClient) ? (
                        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl space-y-2">
                          <span className="text-[9px] uppercase tracking-wider font-mono text-slate-500 block">Logged-in Business Entity</span>
                          <div className="flex items-center gap-2">
                            {(currentUser?.isCustomSession ? clients.find(c => c.clientId === currentUser.businessId) : simulationClient)?.logoUrl ? (
                              <img src={(currentUser?.isCustomSession ? clients.find(c => c.clientId === currentUser.businessId) : simulationClient)?.logoUrl} className="w-7 h-7 rounded-lg object-cover border border-white/10" referrerPolicy="no-referrer" alt="" />
                            ) : (
                              <div className="w-7 h-7 bg-indigo-500/15 text-indigo-400 rounded-lg flex items-center justify-center font-bold font-mono">
                                {(currentUser?.isCustomSession ? clients.find(c => c.clientId === currentUser.businessId) : simulationClient)?.businessName[0]?.toUpperCase()}
                              </div>
                            )}
                            <div className="overflow-hidden">
                              <span className="font-bold text-white block truncate text-[11px]">{(currentUser?.isCustomSession ? clients.find(c => c.clientId === currentUser.businessId) : simulationClient)?.businessName}</span>
                              <span className="text-[9px] font-mono text-slate-400 block uppercase">ID: {(currentUser?.isCustomSession ? clients.find(c => c.clientId === currentUser.businessId) : simulationClient)?.clientId}</span>
                            </div>
                          </div>

                          {/* International QR condition */}
                          <div className="border-t border-white/5 pt-1.5 flex flex-col gap-1">
                            <span className="text-[9px] text-slate-500 font-mono uppercase block">Capabilities</span>
                            {(currentUser?.isCustomSession ? clients.find(c => c.clientId === currentUser.businessId) : simulationClient)?.qrType === "international" ? (
                              <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-500/10 text-emerald-400 font-bold px-1.5 py-0.5 rounded font-mono">
                                <Globe size={10} /> International QR (Enabled)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] bg-yellow-500/10 text-yellow-500 font-bold px-1.5 py-0.5 rounded font-mono">
                                <Lock size={10} /> Local QR (Internal Only)
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-2xl text-[10px] text-slate-400 leading-normal">
                          No active business store selected in Simulator Control Panel.
                        </div>
                      )}

                      {/* Active Nav Tab */}
                      <nav className="space-y-1">
                        <button
                          onClick={() => {
                            setClientTabView("bills");
                            navigateTo("/client");
                          }}
                          className={`w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl font-bold text-left cursor-pointer transition-all ${
                            clientTabView === "bills" 
                              ? "bg-[#1B32FF]/10 text-white border-l-2 border-[#1B32FF]" 
                              : "text-[#C4C9DC]/60 hover:text-white hover:bg-white/[0.02]"
                          }`}
                        >
                          <Utensils size={14} className={clientTabView === "bills" ? "text-[#1B32FF]" : ""} />
                          <span>Restaurant Bills QR</span>
                        </button>

                        {((currentUser?.isCustomSession ? (currentUser?.clientType !== "qr_only") : (simulationClient?.clientType !== "qr_only")) || !simulationClient) && (
                          <button
                            onClick={() => {
                              setClientTabView("menu");
                              navigateTo("/client/menu");
                            }}
                            className={`w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl font-bold text-left cursor-pointer transition-all ${
                              clientTabView === "menu" 
                                ? "bg-[#1B32FF]/10 text-white border-l-2 border-[#1B32FF]" 
                                : "text-[#C4C9DC]/60 hover:text-white hover:bg-white/[0.02]"
                            }`}
                          >
                            <Sparkles size={14} className={clientTabView === "menu" ? "text-[#FFC107]" : ""} />
                            <span>Digital Menu Builder</span>
                          </button>
                        )}

                        {(currentUser?.role === "business_admin" || simulationRole === "business_admin" || currentUser?.role === "super_admin") && (
                          <button
                            onClick={() => {
                              setClientTabView("access");
                              navigateTo("/client/users");
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-left cursor-pointer transition-all ${
                              clientTabView === "access" 
                                ? "bg-[#1B32FF]/10 text-white border-l-2 border-[#1B32FF]" 
                                : "text-[#C4C9DC]/60 hover:text-white hover:bg-white/[0.02]"
                            }`}
                          >
                            <div className="flex items-center gap-3.5">
                              <Users size={14} className={clientTabView === "access" ? "text-indigo-400" : ""} />
                              <span>Staff & Devices Access</span>
                            </div>
                            {pendingDevicesCount > 0 && (
                              <span className="bg-amber-500 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-full select-none animate-pulse shrink-0">
                                {pendingDevicesCount} NEW
                              </span>
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => {
                            const bizId = currentUser?.isCustomSession ? currentUser.businessId : (simulationClient?.clientId || "");
                            safeLocalStorage.setItem(`gerapay_last_viewed_feedback_${bizId}`, new Date().toISOString());
                            setNewFeedbackCount(0);
                            setClientTabView("feedback");
                            navigateTo("/client/feedback");
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-left cursor-pointer transition-all ${
                            clientTabView === "feedback" 
                              ? "bg-[#1B32FF]/10 text-white border-l-2 border-[#1B32FF]" 
                              : "text-[#C4C9DC]/60 hover:text-white hover:bg-white/[0.02]"
                          }`}
                        >
                          <div className="flex items-center gap-3.5">
                            <MessageSquare size={14} className={clientTabView === "feedback" ? "text-indigo-400" : ""} />
                            <span>Customer Feedback</span>
                          </div>
                          {newFeedbackCount > 0 && (
                            <span className="bg-amber-500 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-full select-none animate-pulse shrink-0">
                              {newFeedbackCount} NEW
                            </span>
                          )}
                        </button>
                      </nav>
                    </div>

                    <div className="space-y-4 pt-5 border-t border-white/5 text-[11px] text-slate-400">
                      <div className="flex gap-2 items-center">
                        <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-indigo-400 font-bold font-mono uppercase">
                          {(currentUser?.role || simulationRole)[0]}
                        </div>
                        <div className="overflow-hidden">
                          <span className="font-bold text-white block truncate capitalize">{(currentUser?.role || simulationRole).replace("_", " ")}</span>
                          <span className="text-[10px] text-slate-500 font-semibold block uppercase font-mono">
                            {currentUser?.isCustomSession ? "AUTHORIZED MERCHANT SESSION" : "SIMULATED MODE ACTIVE"}
                          </span>
                        </div>
                      </div>

                      <button 
                        onClick={handleLogout}
                        className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold border border-red-500/15 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors font-sans"
                      >
                        <LogOut size={12} /> Sign Out Client
                      </button>
                      <div className="text-[9px] text-center text-slate-600 font-mono tracking-wide mt-1 uppercase">
                        Terminal Utility • v-mobile-fix-1
                      </div>
                    </div>
                  </aside>

                  {/* Main Billing Canvas */}
                  <main className="flex-grow flex flex-col min-h-[calc(100vh-53px)]">
                    <header className="h-14 border-b border-white/5 px-6 flex items-center justify-between bg-[#11141C]/30 backdrop-blur">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-xs uppercase font-bold tracking-widest font-mono">
                          Merchant Billing Console • Client Workspace Only
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-3 py-1 bg-white/5 rounded-full text-slate-300 font-bold flex items-center gap-1.5 border border-white/5">
                        <Clock size={11} className="text-[#FFC107]" /> 
                        KIGALI TIME: {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                      </span>
                    </header>

                    {activeClient?.clientType === "qr_only" ? (
                      <div className="flex-grow flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto space-y-5">
                        <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 text-[#FFC107] flex items-center justify-center shadow-lg">
                          <Lock size={20} className="animate-pulse" />
                        </div>
                        <div className="space-y-1.5">
                          <h2 className="text-sm font-extrabold text-white tracking-tight uppercase">Terminal Restricted</h2>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            This store (<strong>{activeClient?.businessName || "QR Only Store"}</strong>) is registered as a <strong>QR Only Client</strong>. QR-Only clients are restricted from utilizing the interactive billing console and device terminal management.
                          </p>
                        </div>

                        <div className="w-full bg-white/[0.02] border border-white/5 p-4 rounded-xl text-left text-[10px] text-slate-400 space-y-1.5">
                          <span className="font-bold text-[#FFC107] uppercase tracking-wider block">System Access Disabled:</span>
                          <ul className="list-disc list-inside space-y-0.5">
                            <li>Interactive Restaurant Bill Tracking</li>
                            <li>Client Dashboard Management</li>
                            <li>Local Waiter & Cashier Accounts</li>
                            <li>Device Terminals Registration</li>
                          </ul>
                        </div>

                        <div className="text-[9px] text-slate-500 font-mono">
                          STATUS: SYSTEM BLOCKED • CODE: R-QR-ONLY-PLAN
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 flex-grow overflow-y-auto">
                        {clientTabView === "bills" ? (
                          <RestaurantBillsView 
                            clients={clients} 
                            toast={addToast} 
                            userRole={currentUser?.role || simulationRole}
                            forcedClient={currentUser?.isCustomSession 
                              ? clients.find(c => c.clientId === currentUser.businessId) 
                              : simulationClient
                            }
                          />
                        ) : clientTabView === "menu" ? (
                          <MenuManagerView
                            currentBusinessId={currentUser?.isCustomSession ? currentUser.businessId : (simulationClient?.clientId || "")}
                            toast={addToast}
                            userRole={currentUser?.role || simulationRole}
                          />
                        ) : clientTabView === "feedback" ? (
                          <CustomerFeedbackView
                            currentBusinessId={currentUser?.isCustomSession ? currentUser.businessId : (simulationClient?.clientId || "")}
                            toast={addToast}
                          />
                        ) : (
                          <ClientAccessView
                            currentBusinessId={currentUser?.isCustomSession ? currentUser.businessId : (simulationClient?.clientId || "")}
                            businessName={currentUser?.isCustomSession ? currentUser.businessName : (simulationClient?.businessName || "")}
                            maxStaffAllowed={currentUser?.maxStaff || 5}
                            maxDevicesAllowed={currentUser?.maxDevices || 3}
                            toast={addToast}
                          />
                        )}
                      </div>
                    )}
                  </main>
                </>
              ) : (
                /* -------------------- DEV/ADMIN AREA WORKSPACE -------------------- */
                <>
                  {/* AI diagnostic helper panel */}
                  <GeraAIMonitor toast={addToast} isAdmin={currentUser?.role === "super_admin" || isDemoAdmin || simulationRole === "super_admin"} />

                  {/* Developer Sidebar */}
                  <aside className="w-full md:w-64 bg-[#11141C] border-r border-white/5 flex flex-col justify-between text-xs p-5 space-y-6 md:h-[calc(100vh-53px)] md:sticky md:top-[53px]">
                    <div className="space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl relative overflow-hidden flex-shrink-0">
                          <img src="/gera-pay-qr-logo.svg" alt="Gera Flow" className="w-10 h-10 object-contain rounded-xl" />
                        </div>
                        <div>
                          <span className="font-bold text-white block uppercase tracking-wider text-xs font-sans">Gera Flow Admin</span>
                          <span className="text-[10px] text-slate-500 font-mono tracking-widest">RW SERVICES TERM</span>
                        </div>
                      </div>

                      <nav className="space-y-1">
                        {[
                          { id: "dashboard", label: "Control Center", icon: LayoutDashboard },
                          { id: "clients", label: "Store Registry", icon: Users },
                          { id: "transactions", label: "Transaction Checks", icon: TrendingUp },
                          { id: "access", label: "Access Controls", icon: ShieldAlert },
                          ...((currentUser?.email === ADMIN_EMAIL || isDemoAdmin) ? [{ id: "subscriptions-admin", label: "Licensing Admin", icon: ShieldCheck }] : [])
                        ].map((nav) => {
                          const IconComponent = nav.icon;
                          return (
                            <button
                              key={nav.id}
                              onClick={() => {
                                setAdminView(nav.id);
                                setViewedClient(null);
                                if (nav.id === "access") {
                                  navigateTo("/admin/access");
                                } else if (nav.id === "dashboard") {
                                  navigateTo("/admin");
                                }
                              }}
                              className={`w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl font-bold transition-all text-left cursor-pointer ${
                                adminView === nav.id 
                                  ? "bg-[#1B32FF]/10 text-white border-l-2 border-[#1B32FF]" 
                                  : "text-[#C4C9DC]/60 hover:text-white hover:bg-white/[0.02]"
                              }`}
                            >
                              <IconComponent size={14} className={adminView === nav.id ? "text-[#1B32FF]" : ""} />
                              <span>{nav.label}</span>
                            </button>
                          );
                        })}
                      </nav>
                    </div>

                    <div className="space-y-4 pt-5 border-t border-white/5 text-[11px] text-slate-400">
                      <div className="flex gap-2 items-center">
                        <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-indigo-400 font-bold font-mono">
                          SA
                        </div>
                        <div className="overflow-hidden">
                          <span className="font-bold text-white block truncate">{currentUser?.email || "Super Admin Bypass"}</span>
                          <span className="text-[10px] text-[#FFC107] font-semibold flex items-center gap-1">
                            <ShieldCheck size={10} /> Supervisor Root
                          </span>
                        </div>
                      </div>

                      {clients.length > 0 && (
                        <button 
                          onClick={() => navigateTo(`/pay/${clients[0].clientId}`)}
                          className="w-full py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/15 rounded-xl flex items-center justify-center gap-1 px-1 transition-all cursor-pointer font-sans"
                        >
                          Quick Launch Customer Pay <ExternalLink size={11} />
                        </button>
                      )}

                      {/* PWA offline installation button temporarily hidden */}

                      <button 
                        onClick={handleLogout}
                        className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold border border-red-500/15 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors font-sans"
                      >
                        <LogOut size={12} /> Sign Out Supervision
                      </button>
                      <div className="text-[9px] text-center text-slate-600 font-mono tracking-wide mt-1 uppercase">
                        Terminal Utility • v-mobile-fix-1
                      </div>
                    </div>
                  </aside>

                  {/* Workspace Dashboard Frame */}
                  <main className="flex-grow flex flex-col min-h-screen">
              <header className="h-14 border-b border-white/5 px-6 flex items-center justify-between bg-[#11141C]/30 backdrop-blur">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-xs uppercase font-bold tracking-widest font-mono">
                    {adminView === "dashboard" ? "System Core Overview" : adminView === "clients" ? "Merchant Databases" : adminView === "client-detail" ? "Diagnostic Profiles" : adminView === "subscriptions-admin" ? "SaaS Agreements Hub" : "Operational Feeds"}
                  </span>
                </div>
                
                <span className="text-[10px] font-mono px-3 py-1 bg-white/5 rounded-full text-slate-300 font-bold flex items-center gap-1.5 border border-white/5">
                  <span className="bg-yellow-500 text-slate-900 px-1.5 py-0.5 rounded text-[8.5px] uppercase font-black tracking-tight">{activePlan} plan</span>
                  <Clock size={11} className="text-[#FFC107]" /> 
                  KIGALI TIME: {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                </span>
              </header>

              <div className="p-6 flex-grow overflow-y-auto">
                {adminView === "dashboard" && (
                  <DashboardView 
                    clients={clients} 
                    txns={transactions} 
                    setView={setAdminView} 
                    onViewClient={handleViewClientDetails} 
                  />
                )}
                
                {adminView === "clients" && (
                  <ClientsView 
                    clients={clients} 
                    toast={addToast} 
                    onViewClient={handleViewClientDetails}
                    onBack={() => setAdminView("dashboard")}
                  />
                )}

                {adminView === "transactions" && (
                  <TransactionsView 
                    txns={transactions} 
                    toast={addToast} 
                    mtnMomoActive={mtnMomoActive}
                    isAdmin={currentUser?.email === ADMIN_EMAIL || isDemoAdmin || currentUser?.role === "super_admin"}
                  />
                )}

                {adminView === "restaurant-bills" && (
                  <RestaurantBillsView 
                    clients={clients} 
                    toast={addToast} 
                  />
                )}

                {adminView === "subscriptions-admin" && (
                  <SubscriptionsAdminView 
                    toast={addToast} 
                  />
                )}

                {adminView === "client-detail" && viewedClient && (
                  <div className="space-y-6 animate-fade-in font-mono">
                    <button 
                      onClick={() => setAdminView("clients")}
                      className="px-3.5 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs font-bold hover:bg-white/10 flex items-center gap-1.5 transition-colors cursor-pointer text-slate-300"
                    >
                      <ArrowLeft size={13} /> Back to Store List
                    </button>

                    <div className="bg-[#11141C] border border-white/5 p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center gap-5 justify-between">
                      <div className="flex items-center gap-4">
                        {viewedClient.logoUrl ? (
                          <img src={viewedClient.logoUrl} className="w-16 h-16 rounded-2xl object-cover border border-white/10 referrerPolicy='no-referrer'" alt=""/>
                        ) : (
                          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold text-2xl">
                            {viewedClient.businessName[0]?.toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h2 className="text-xl font-bold text-white font-sans">{viewedClient.businessName}</h2>
                          <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5 block">TEMPORAL ID: {viewedClient.clientId}</span>
                        </div>
                      </div>

                      <button 
                        onClick={() => navigateTo(`/pay/${viewedClient.clientId}`)}
                        className="px-4 py-2.5 bg-[#1B32FF] hover:brightness-110 font-bold text-xs rounded-xl flex items-center gap-1.5 text-white shadow-lg active:scale-95 cursor-pointer"
                      >
                        Launch Direct Pay Link <ExternalLink size={12} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="lg:col-span-1 p-5 bg-[#11141C] border border-white/5 rounded-2xl space-y-4">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Supervisor Registry Specifications</span>
                        
                        <div className="grid grid-cols-1 gap-4 text-xs font-sans">
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase text-slate-500 tracking-wider font-bold">Store Registered Title</span>
                            <span className="text-slate-200 block truncate font-bold">{viewedClient.businessName}</span>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase text-slate-500 tracking-wider font-bold">Contact Representative</span>
                            <span className="text-slate-200 block truncate font-semibold">{viewedClient.ownerName}</span>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase text-slate-500 tracking-wider font-bold">Store Location Address</span>
                            <span className="text-slate-200 block truncate">{viewedClient.location}</span>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase text-slate-500 tracking-wider font-bold">Contact Telephone</span>
                            <span className="text-slate-300 block font-mono">{viewedClient.phone}</span>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase text-slate-500 tracking-wider font-bold">MTN MoMo Merchant Channel</span>
                            <span className="text-[#FFC107] block font-mono font-bold">{viewedClient.momoCode}</span>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase text-slate-500 tracking-wider font-bold">Assigned Category</span>
                            <span className="text-slate-300 block">{viewedClient.category}</span>
                          </div>
                          
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase text-slate-500 tracking-wider font-bold">Client Permissions Category</span>
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] uppercase font-bold mt-1 ${
                              viewedClient.clientType === "qr_only" ? "bg-amber-400/10 text-amber-500" : "bg-teal-400/10 text-teal-400"
                            }`}>
                              {viewedClient.clientType === "qr_only" ? "QR Only" : "System Access"}
                            </span>
                          </div>

                          {viewedClient.clientType === "system_access" && (
                            <>
                              <div className="space-y-1">
                                <span className="text-[10px] uppercase text-slate-500 tracking-wider font-bold">Active Service Plan</span>
                                <span className="text-slate-300 block uppercase font-mono text-[11px] font-bold text-indigo-400">{viewedClient.plan || "restaurant"}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <span className="text-[9px] uppercase text-slate-500 tracking-wider font-bold">Max Staff</span>
                                  <span className="text-slate-300 block font-mono font-bold">{viewedClient.maxStaff !== undefined ? viewedClient.maxStaff : 5}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[9px] uppercase text-slate-500 tracking-wider font-bold">Max Devices</span>
                                  <span className="text-slate-300 block font-mono font-bold">{viewedClient.maxDevices !== undefined ? viewedClient.maxDevices : 3}</span>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="lg:col-span-2 p-6 bg-[#11141C] border border-white/5 rounded-[24px] space-y-5 font-sans">
                        <div>
                          <span className="text-xs font-bold text-[#FFC107] uppercase tracking-wider block">Gera Flow Multi-Terminal Mode Hub</span>
                          <p className="text-[11px] text-slate-400 mt-0.5">Deploy, copy, or print standard local, offline dial, or tourist international QR configurations effortlessly.</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                          
                          {/* Online Mode Card */}
                          <div className="p-5 bg-[#151922] border border-white/5 rounded-2xl flex flex-col items-center justify-between text-center space-y-4 min-h-[370px] shadow-sm">
                            <div className="space-y-1.5 w-full">
                              <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/15 rounded-full text-[10px] font-bold uppercase inline-block font-sans">
                                Online Payment QR
                              </span>
                              <p className="text-[11.5px] text-emerald-400 font-extrabold font-sans">Best for automatic RequestToPay</p>
                              <p className="text-[10px] text-slate-400 leading-normal max-w-[180px] mx-auto font-sans">
                                Customers scan with their phone camera to open the instant billing page.
                              </p>
                            </div>

                            <div className="bg-white p-3.5 rounded-[20px] mx-auto flex items-center justify-center shadow-md border border-slate-100">
                              <QRStickerGenerator text={getPaymentUrl(viewedClient.clientId, "standard")} size={135} />
                            </div>

                            <div className="space-y-2.5 w-full pt-1">
                              <p className="text-[10px] text-slate-400 font-mono break-all max-w-[200px] mx-auto line-clamp-1 bg-white/5 py-1 px-2.5 rounded-lg">
                                /pay/{viewedClient.clientId}
                              </p>
                              
                              <div className="flex gap-2 w-full font-sans">
                                <button 
                                  onClick={() => {
                                    safeCopyToClipboard(getPaymentUrl(viewedClient.clientId, "standard"));
                                    addToast("Online QR payment link copied to clipboard", "success");
                                  }}
                                  className="flex-1 px-3 py-2 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 rounded-xl text-slate-300 font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Copy size={12} /> Copy URL
                                </button>
                                <button 
                                  onClick={() => {
                                    QRCode.toDataURL(
                                      getPaymentUrl(viewedClient?.clientId, "standard"),
                                      {
                                        width: 600,
                                        margin: 4,
                                        color: {
                                          dark: "#000000",
                                          light: "#FFFFFF",
                                        },
                                      },
                                      (err, base64Url) => {
                                        if (err) {
                                          addToast("Failed to generate QR PNG", "error");
                                          return;
                                        }
                                        const link = document.createElement("a");
                                        link.href = base64Url;
                                        link.download = `GeraPay_OnlinePaymentQR_${viewedClient?.businessName.replace(/[^a-z0-9]/gi, "_")}-${viewedClient?.clientId}.png`;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                        addToast("Online Payment QR PNG Downloaded Successfully", "success");
                                      }
                                    );
                                  }}
                                  className="flex-1 px-3 py-2 bg-gradient-to-r from-blue-600 to-[#1B32FF] hover:brightness-110 active:scale-95 rounded-xl text-white font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Download size={12} /> Download
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Offline USSD Mode Card */}
                          <div className="p-5 bg-[#151922] border border-white/5 rounded-2xl flex flex-col items-center justify-between text-center space-y-4 min-h-[370px] shadow-sm font-sans">
                            <div className="space-y-1.5 w-full">
                              <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/15 rounded-full text-[10px] font-bold uppercase inline-block font-sans">
                                Offline USSD Payment QR
                              </span>
                              <p className="text-[11.5px] text-[#FFC107] font-extrabold font-sans">Best for areas with weak internet</p>
                              <p className="text-[10px] text-slate-400 leading-normal max-w-[180px] mx-auto font-sans">
                                {viewedClient.clientType === "qr_only" && viewedClient.mtnPaymentType === "phone_number" 
                                  ? "Automatically dials peer-to-peer mobile transfer sequence to the merchant handset."
                                  : "Automatically dials merchant code USSD sequence on push-button and smartphone devices."}
                              </p>
                            </div>

                            <div className="bg-white p-3.5 rounded-[20px] mx-auto flex items-center justify-center shadow-md border border-slate-100">
                              <QRStickerGenerator text={`tel:*182*${viewedClient.clientType === "qr_only" && viewedClient.mtnPaymentType === "phone_number" ? "1*1" : "8*1"}*${viewedClient.momoCode}#`} size={135} />
                            </div>

                            <div className="space-y-2.5 w-full pt-1 font-mono">
                              <p className="text-[10.5px] text-[#FFC107] max-w-[200px] mx-auto font-bold truncate bg-white/5 py-1 px-2.5 rounded-lg text-center">
                                *182*{viewedClient.clientType === "qr_only" && viewedClient.mtnPaymentType === "phone_number" ? "1*1" : "8*1"}*{viewedClient.momoCode}#
                              </p>
                              
                              <div className="flex gap-2 w-full">
                                <button 
                                  onClick={() => {
                                    safeCopyToClipboard(`*182*${viewedClient.clientType === "qr_only" && viewedClient.mtnPaymentType === "phone_number" ? "1*1" : "8*1"}*${viewedClient.momoCode}#`);
                                    addToast("USSD Pay Code copied to clipboard", "success");
                                  }}
                                  className="flex-1 px-3 py-2 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 rounded-xl text-slate-300 font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer font-sans"
                                >
                                  <Copy size={12} /> Copy Code
                                </button>
                                <button 
                                  onClick={() => {
                                    QRCode.toDataURL(
                                      `tel:*182*${viewedClient.clientType === "qr_only" && viewedClient.mtnPaymentType === "phone_number" ? "1*1" : "8*1"}*${viewedClient?.momoCode}#`,
                                      {
                                        width: 600,
                                        margin: 4,
                                        color: {
                                          dark: "#000000",
                                          light: "#FFFFFF",
                                        },
                                      },
                                      (err, base64Url) => {
                                        if (err) {
                                          addToast("Failed to generate USSD QR PNG", "error");
                                          return;
                                        }
                                        const link = document.createElement("a");
                                        link.href = base64Url;
                                        link.download = `GeraPay_OfflineUSSDQR_${viewedClient?.businessName.replace(/[^a-z0-9]/gi, "_")}-${viewedClient?.clientId}.png`;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                        addToast("Offline USSD QR PNG Downloaded Successfully", "success");
                                      }
                                    );
                                  }}
                                  className="flex-1 px-3 py-2 bg-gradient-to-r from-yellow-500 to-[#FFC107] hover:brightness-110 active:scale-95 rounded-xl text-[#0C0E14] font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer font-sans"
                                >
                                  <Download size={12} /> Download
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* International Premium QR Mode Card */}
                          <div className="p-5 bg-[#151922] border border-white/5 rounded-2xl flex flex-col items-center justify-between text-center space-y-4 min-h-[370px] shadow-sm font-sans border-yellow-500/10 relative overflow-hidden">
                            {(activePlan !== "international" && activePlan !== "enterprise") && (
                              <div className="absolute inset-0 bg-[#0C0E14]/90 backdrop-blur-[3px] z-20 flex flex-col items-center justify-center p-4 text-center space-y-3">
                                <div className="w-10 h-10 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 flex items-center justify-center animate-pulse">
                                  <Lock size={16} />
                                </div>
                                <span className="text-[11px] font-black text-white uppercase tracking-wider block font-sans">International Cards Locked</span>
                                <p className="text-[9.5px] text-slate-400 max-w-[170px] leading-relaxed mx-auto font-sans">
                                  Requires standard subscription upgrade to the "International Payments" or "Enterprise" plan tier.
                                </p>
                              </div>
                            )}
                            <div className="space-y-1.5 w-full font-sans">
                              <span className="px-2.5 py-1 bg-gradient-to-r from-yellow-500/10 to-[#FFC107]/10 text-[#FFC107] border border-[#FFC107]/20 rounded-full text-[10px] font-black uppercase inline-block">
                                International Payment QR
                              </span>
                              <p className="text-[11.5px] text-[#FFC107] font-extrabold pb-1 border-b border-white/5">Visa, MC, Apple/GPay</p>
                              <p className="text-[10px] text-slate-400 leading-normal max-w-[180px] mx-auto pt-1 font-sans">
                                Guests checkout in multiple currencies with secure debit/credit card protocols.
                              </p>
                            </div>

                            <div className="bg-white p-3.5 rounded-[20px] mx-auto flex items-center justify-center shadow-md border border-slate-100 my-2">
                              <QRStickerGenerator text={getPaymentUrl(viewedClient.clientId, "international")} size={130} />
                            </div>

                            <div className="space-y-2.5 w-full pt-1">
                              <p className="text-[10px] text-slate-400 break-all max-w-[180px] mx-auto line-clamp-1 bg-white/5 py-1 px-2.5 rounded-lg text-center font-mono">
                                /international/{viewedClient.clientId}
                              </p>
                              
                              <div className="flex gap-2 w-full font-sans">
                                <button 
                                  onClick={() => {
                                    safeCopyToClipboard(getPaymentUrl(viewedClient.clientId, "international"));
                                    addToast("International URL copied to clipboard", "success");
                                  }}
                                  className="flex-1 px-2 py-2 bg-white/5 hover:bg-white/10 active:scale-95 border border-[#1b32ff]/15 rounded-xl text-indigo-400 hover:text-white font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Copy size={12} /> Copy URL
                                </button>
                                <button 
                                  onClick={() => {
                                    QRCode.toDataURL(
                                      getPaymentUrl(viewedClient?.clientId, "international"),
                                      {
                                        width: 600,
                                        margin: 4,
                                        color: {
                                          dark: "#000000",
                                          light: "#FFFFFF",
                                        },
                                      },
                                      (err, base64Url) => {
                                        if (err) {
                                          addToast("Failed to generate Intl QR PNG", "error");
                                          return;
                                        }
                                        const link = document.createElement("a");
                                        link.href = base64Url;
                                        link.download = `GeraPay_InternationalPaymentQR_${viewedClient?.businessName.replace(/[^a-z0-9]/gi, "_")}-${viewedClient?.clientId}.png`;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                        addToast("International Payment QR PNG Downloaded Successfully", "success");
                                      }
                                    );
                                  }}
                                  className="flex-1 px-2 py-2 bg-gradient-to-r from-yellow-500 to-[#FFC107] hover:brightness-110 active:scale-95 rounded-xl text-[#0C0E14] font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Download size={12} /> Download
                                </button>
                              </div>
                            </div>
                          </div>

                        </div>

                        <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl text-center">
                          <p className="text-[11px] text-slate-300 leading-normal">
                            💡 <strong>Works with MTN Rwanda USSD:</strong> Customer scans the Offline USSD QR to directly dial on their device, then approves inside official system prompt.
                          </p>
                        </div>

                        {/* Business Client Login Access Card */}
                        {viewedClient.clientType === "system_access" && (
                          <div className="p-6 bg-[#161a25] border border-blue-500/20 rounded-[20px] space-y-4 shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
                            
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/5 pb-3">
                              <div className="space-y-0.5">
                                <span className="px-2.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-[10px] font-bold uppercase inline-block">
                                  Business Terminal Login Portal
                                </span>
                                <h3 className="text-sm font-bold text-white uppercase tracking-wide font-sans">Business Access & Direct Login</h3>
                                <p className="text-[10.5px] text-slate-400">
                                  Generate desktop terminal QR codes and copy secure direct login URLs. Bypasses standard camera scanning bottlenecks.
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-col md:flex-row gap-5 items-center bg-zinc-950/40 p-4 rounded-xl border border-white/5">
                              {/* QR Preview Column */}
                              <div className="flex flex-col items-center gap-2 shrink-0">
                                <div className="bg-white p-3 rounded-lg flex items-center justify-center shadow-md border border-slate-100">
                                  {businessAccessQrData ? (
                                    <img src={businessAccessQrData} alt="Business Access QR" className="w-28 h-28 object-contain" referrerPolicy="no-referrer" />
                                  ) : (
                                    <div className="w-28 h-28 bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-[10px]">
                                      LOADING QR...
                                    </div>
                                  )}
                                </div>
                                <span className="text-[9px] text-[#00D68F] font-mono uppercase tracking-wider font-extrabold">SECURE HANDSHAKE QR</span>
                              </div>

                              {/* Credentials & Copy Column */}
                              <div className="flex-grow space-y-3.5 text-xs w-full">
                                <div className="space-y-1.5">
                                  <span className="text-[9px] uppercase text-zinc-500 tracking-wider font-black block">Business Access Login Link</span>
                                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                                    <input 
                                      type="text" 
                                      readOnly 
                                      value={getBusinessAccessUrl(viewedClient.clientId)}
                                      className="flex-grow bg-zinc-950 px-3 py-2 border border-white/10 rounded-lg text-[11px] text-slate-300 font-mono focus:outline-none min-w-0"
                                    />
                                    <button 
                                      onClick={() => {
                                        safeCopyToClipboard(getBusinessAccessUrl(viewedClient.clientId));
                                        addToast("Business Access Link copied to clipboard!", "success");
                                      }}
                                      className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10 font-bold text-xs cursor-pointer transition-all active:scale-95 flex items-center gap-1 shrink-0"
                                      title="Copy Link URL"
                                    >
                                      <Copy size={13} /> Copy Link
                                    </button>
                                    <a 
                                      href={getBusinessAccessUrl(viewedClient.clientId)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded-lg border border-blue-500/20 font-bold text-xs cursor-pointer transition-all flex items-center gap-1 shrink-0 text-center"
                                    >
                                      Open Login Link
                                    </a>
                                  </div>
                                  <p className="text-[10px] text-zinc-400 italic leading-normal">
                                    “Use this link on PC/tablet when scanning QR is not possible.”
                                  </p>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                  <div className="p-2 bg-zinc-950/60 rounded-lg border border-white/5">
                                    <span className="text-slate-500 block text-[9px] uppercase font-bold">Terminal Username</span>
                                    <span className="text-slate-200 font-bold font-mono text-[11px]">{viewedClient.businessUsername || generateBusinessUsername(viewedClient.businessName)}</span>
                                  </div>
                                  <div className="p-2 bg-zinc-950/60 rounded-lg border border-white/5">
                                    <span className="text-slate-500 block text-[9px] uppercase font-bold">Security Password</span>
                                    <span className="text-slate-400 italic">•••••••• [Secure]</span>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2 pt-1.5">
                                  <button 
                                    onClick={() => {
                                      if (businessAccessQrData) {
                                        const link = document.createElement("a");
                                        link.href = businessAccessQrData;
                                        link.download = `GeraPay_AccessQR_${viewedClient.clientId}_${viewedClient.businessName.replace(/[^a-z0-9]/gi, "_")}.png`;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                        addToast("Business Access QR downloaded successfully!", "success");
                                      } else {
                                        addToast("QR Code data is still loading or unavailable", "error");
                                      }
                                    }}
                                    className="px-3.5 py-1.5 bg-[#1B32FF] hover:brightness-110 text-white font-bold text-[11.5px] rounded-lg cursor-pointer transition-all flex items-center gap-1.5"
                                  >
                                    <Download size={12} /> Download Business Access QR PNG
                                  </button>

                                  <button 
                                    onClick={() => {
                                      setShowPrintAccessCardModal(viewedClient);
                                    }}
                                    className="px-3.5 py-1.5 bg-emerald-600 hover:brightness-110 text-white font-bold text-[11.5px] rounded-lg cursor-pointer transition-all flex items-center gap-1.5"
                                  >
                                    <Printer size={12} /> Print Access Card
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </main>
          </>
        )}
      </div>
    </motion.div>
  )}
      </AnimatePresence>

      <ToastContainer toasts={toasts} />

      {/* MODAL: PRINTABLE ACCESS CARD */}
      <AnimatePresence>
        {showPrintAccessCardModal && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur-md overflow-y-auto">
            <style>{`
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #printable-access-card, #printable-access-card * {
                  visibility: visible !important;
                }
                #printable-access-card {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  max-width: 100% !important;
                  background: white !important;
                  color: #0F1428 !important;
                  border: none !important;
                  box-shadow: none !important;
                  margin: 0 !important;
                  padding: 2.5cm !important;
                  display: flex !important;
                  flex-direction: column !important;
                  align-items: center !important;
                  justify-content: center !important;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}</style>

            <div className="w-full max-w-md flex flex-col gap-4 my-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                id="printable-access-card"
                className="bg-white text-[#0F1428] w-full rounded-[24px] overflow-hidden shadow-2xl p-8 border-4 border-double border-indigo-600/20 relative flex flex-col items-center justify-between min-h-[520px] font-sans"
              >
                {/* Print watermark badge design */}
                <div className="text-center space-y-2 mt-2 w-full">
                  <div className="text-[10px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100/50 rounded-full px-3 py-1 inline-block uppercase tracking-widest font-mono">
                    ★ GERA FLOW • ACCESS CARD ★
                  </div>
                  
                  {/* Business Logo or Fallback */}
                  <div className="pt-2 text-center">
                    {showPrintAccessCardModal.logoUrl ? (
                      <img 
                        src={showPrintAccessCardModal.logoUrl} 
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200/50 mx-auto" 
                        alt="" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 border border-indigo-200 flex items-center justify-center font-bold text-lg mx-auto font-sans">
                        {showPrintAccessCardModal.businessName[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>

                  <h2 className="text-2xl font-black tracking-tight text-[#0F1428] uppercase mt-2">
                    {showPrintAccessCardModal.businessName}
                  </h2>
                  <p className="text-[11px] text-slate-500 font-semibold tracking-wider font-sans uppercase">
                    Terminal Hardware Authorization Node
                  </p>
                </div>

                {/* Main QR Code for scanning */}
                <div className="my-6 p-5 bg-slate-50 rounded-[20px] shadow-sm flex flex-col items-center justify-center border border-slate-200/60">
                  {businessAccessQrData ? (
                    <img 
                      src={businessAccessQrData} 
                      alt="Business Access QR" 
                      className="w-44 h-44 object-contain bg-white p-2.5 rounded-xl border border-slate-200 shadow-inner"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-44 h-44 bg-slate-200 animate-pulse rounded-xl flex items-center justify-center text-xs text-slate-500">
                      GENERATING SECURE QR...
                    </div>
                  )}
                  
                  <div className="text-center mt-4 space-y-1 bg-white px-5 py-3 rounded-xl border border-slate-200/80 shadow-sm w-full max-w-[240px]">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">ADMIN ID CODE</span>
                    <span className="text-sm font-mono font-black tracking-wider text-indigo-700 block select-all">
                      {showPrintAccessCardModal.clientId}
                    </span>
                  </div>
                </div>

                {/* Access instructions & printable credentials */}
                <div className="w-full space-y-3.5 border-t border-slate-100 pt-4 font-sans text-center">
                  <p className="text-[10.5px] text-slate-600 leading-relaxed max-w-[320px] mx-auto">
                    Scan the code above or enter the direct link below from your phone/tablet/POS browser to register the device.
                  </p>

                  <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200/65 font-mono text-[10px] break-all select-all text-slate-800">
                    {getBusinessAccessUrl(showPrintAccessCardModal.clientId)}
                  </div>

                  <div className="flex justify-center gap-4 text-[10px] text-slate-400 font-semibold uppercase tracking-wider font-mono">
                    <span>SYS: {showPrintAccessCardModal.plan || "restaurant"}</span> • <span>VERIFIED SECURE BY GERA</span>
                  </div>
                </div>
              </motion.div>

              {/* Action Toolbar underneath */}
              <div className="flex gap-3 justify-center w-full no-print">
                <button 
                  onClick={() => {
                    window.print();
                  }}
                  className="flex-grow py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
                >
                  <Printer size={14} /> Send to System Printer
                </button>
                <button 
                  onClick={() => setShowPrintAccessCardModal(null)}
                  className="px-5 py-3.5 bg-white/10 hover:bg-white/15 border border-white/10 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Close Card
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* PWA INSTALLATION GUIDANCE DIALOG */}
      <AnimatePresence>
        {showInstallGuide && (() => {
          const isIOSUser = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
          const isAndroidUser = /Android/i.test(navigator.userAgent);
          return (
            <div className="fixed inset-0 bg-[#0C0E14]/85 backdrop-blur-sm z-[300] flex items-center justify-center p-4 font-mono">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-[#11141C] border border-white/10 rounded-3xl p-6 text-center space-y-4"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#FFC107]/10 border border-[#FFC107]/30 text-[#FFC107] flex items-center justify-center mx-auto">
                  <QrCode size={24} />
                </div>

                <div className="space-y-1.5">
                  <h3 className="font-extrabold text-white text-sm uppercase">PWA Installation Hub</h3>
                  <p className="text-[11px] text-slate-400 leading-normal font-sans">
                    Gera Flow works on Android, Tecno, Infinix, Samsung, iPhone, and PC desktops. Choose your platform below for step-by-step guidance:
                  </p>
                </div>

                <div className="space-y-3.5 text-left text-[11px] font-sans text-slate-300 py-1.5 border-t border-b border-white/5 max-h-[220px] overflow-y-auto w-full">
                  
                  <div className={`p-3 rounded-xl space-y-1 ${
                    isAndroidUser 
                      ? "bg-indigo-500/10 border border-indigo-500/30 ring-1 ring-indigo-500/10" 
                      : "bg-white/[0.01] border border-white/5"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-400 block font-mono text-[10px] uppercase">📱 Android, Tecno, Infinix, Samsung & Chrome</span>
                      {isAndroidUser && (
                        <span className="text-[8px] bg-indigo-500 text-white font-bold px-1.5 py-0.5 rounded uppercase leading-none font-mono">
                          Detected Device
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 leading-normal font-sans pt-0.5">
                      Tap the standard browser options menu (three tiny dots in top-right), search and select <strong>"Install App"</strong> or <strong>"Add to Home screen"</strong>.
                    </p>
                  </div>

                  <div className={`p-3 rounded-xl space-y-1 ${
                    isIOSUser 
                      ? "bg-yellow-500/10 border border-yellow-500/30 ring-1 ring-yellow-500/10" 
                      : "bg-white/[0.01] border border-white/5"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-yellow-500 block font-mono text-[10px] uppercase">🍏 Apple iPhones & iPads</span>
                      {isIOSUser && (
                        <span className="text-[8px] bg-yellow-500 text-[#0c0e14] font-bold px-1.5 py-0.5 rounded uppercase leading-none font-mono">
                          Detected Device
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 leading-normal font-sans pt-0.5">
                      Launch via the Safari browser, click the <strong>"Share" icon</strong> (raised box with an arrow), swipe up and choose <strong>"Add to Home Screen"</strong>.
                    </p>
                  </div>

                  <div className={`p-3 rounded-xl space-y-1 ${
                    (!isAndroidUser && !isIOSUser) 
                      ? "bg-[#1B32FF]/10 border border-[#1b32ff]/30 ring-1 ring-[#1b32ff]/10" 
                      : "bg-white/[0.01] border border-white/5"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#1B32FF] block font-mono text-[10px] uppercase">💻 Windows, macOS & Desktop PCs</span>
                      {(!isAndroidUser && !isIOSUser) && (
                        <span className="text-[8px] bg-[#1B32FF] text-white font-bold px-1.5 py-0.5 rounded uppercase leading-none font-mono">
                          Detected Desktop
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 leading-normal font-sans pt-0.5">
                      Click the small computer screen/download icon located inside the right side of your Chrome/Edge address bar to install Gera Flow natively on your computer.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowInstallGuide(false)}
                  className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer capitalize font-sans"
                >
                  Close Guide Panel
                </button>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  const icoMapping = {
    success: <CheckCircle size={15} className="text-[#00D68F]" />,
    error: <AlertCircle size={15} className="text-red-400" />,
    info: <Clock size={15} className="text-indigo-400" />,
    warning: <AlertCircle size={15} className="text-yellow-400" />
  };

  const borderMapping = {
    success: "border-l-4 border-l-emerald-400",
    error: "border-l-4 border-l-red-400",
    info: "border-l-4 border-l-indigo-400",
    warning: "border-l-4 border-l-yellow-400"
  };

  return (
    <div className="fixed bottom-5 right-5 z-[500] flex flex-col gap-2 pointer-events-none font-mono">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`min-w-[210px] max-w-sm bg-[#11141C]/95 backdrop-blur border border-white/10 p-3 rounded-xl flex items-center gap-2.5 shadow-2xl pointer-events-auto ${borderMapping[t.type]}`}
          >
            {icoMapping[t.type]}
            <p className="text-[10px] font-bold text-slate-200 uppercase tracking-tight leading-normal">{t.message}</p>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Dev Reset Button (Phase 10) */}
      {typeof window !== "undefined" && (window.location.hostname.includes("run.app") || window.location.hostname.includes("localhost") || window.location.hostname.includes("127.0.0.1")) && (
        <div className="fixed bottom-4 left-4 z-[9999] flex flex-col items-start gap-1">
          <div className="bg-[#11141C]/95 backdrop-blur border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold text-slate-400 shadow-lg select-text">
            Connected Firebase projectId: {firebaseConfig.projectId}
          </div>
          <button
            onClick={async () => {
              if (window.confirm("Are you sure you want to clear your local session, local storage, session storage, and sign out of Firebase?")) {
                if (typeof window !== "undefined") {
                  window.localStorage.clear();
                  window.sessionStorage.clear();
                }
                try {
                  await signOut(auth);
                } catch (e) {
                  console.warn("Failed to clear auth session: ", e);
                }
                window.location.href = "/";
              }
            }}
            className="px-3 py-1.5 bg-red-600/95 hover:bg-red-600 text-white font-mono text-[10px] font-bold rounded-lg border border-red-500/20 shadow-lg transition-all flex items-center gap-1 cursor-pointer active:scale-95 animate-pulse"
          >
            Clear Local Session
          </button>
        </div>
      )}
    </div>
  );
}

// Google SVG icon
function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.23-.63-.35-1.3-.35-2.09z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
    </svg>
  );
}

function ArrowLeft(props: any) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="16" 
      height="16" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      {...props}
    >
      <line x1="19" y1="12" x2="5" y2="12"></line>
      <polyline points="12 19 5 12 12 5"></polyline>
    </svg>
  );
}
