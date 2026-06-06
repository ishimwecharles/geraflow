import React, { useState, useEffect } from "react";
import { db, auth } from "../lib/firebase";
import { sha256 } from "../lib/security";
import { collection, query, where, getDocs, addDoc, updateDoc, doc, setDoc, getDoc } from "firebase/firestore";
import { Lock, RefreshCw, AlertCircle, User, Award, Shield, Building, CheckCircle2, Laptop, Info, Settings, ServerCrash } from "lucide-react";
import { motion } from "motion/react";

interface BusinessAccessLoginViewProps {
  businessId?: string | null;
  onLoginSuccess: (unifiedUser: any) => void;
  toast: (m: string, t?: "success" | "error" | "info" | "warning") => void;
  currentDeviceId: string;
}

export default function BusinessAccessLoginView({
  businessId,
  onLoginSuccess,
  toast,
  currentDeviceId
}: BusinessAccessLoginViewProps) {
  // Extract businessId from props or query parameter: ?businessId=GP-XXX
  const getQueryBusinessId = () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("businessId") || "";
    }
    return "";
  };

  const initialBizId = (businessId || getQueryBusinessId()).trim().toUpperCase();

  const [enteredBusinessId, setEnteredBusinessId] = useState(initialBizId);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Quick Demo Access Mode & Bypasses
  const [activeTab, setActiveTab] = useState<"standard" | "demo">("standard");
  const [selectedPresetId, setSelectedPresetId] = useState<string>("preset-mizerwa-admin");

  // Business brand details
  const [matchedBusinessName, setMatchedBusinessName] = useState<string | null>(null);
  const [matchedLogoUrl, setMatchedLogoUrl] = useState<string | null>(null);
  const [matchedPlan, setMatchedPlan] = useState<string>("restaurant");
  const [resolvingStore, setResolvingStore] = useState(false);

  // Portal Diagnostics Panel
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(true);
  const [firebaseAuthStatus, setFirebaseAuthStatus] = useState<string>("Checking...");
  const [firestoreStatus, setFirestoreStatus] = useState<string>("Idle");
  const [permissionStatus, setPermissionStatus] = useState<string>("Unknown");
  const [queryResultCount, setQueryResultCount] = useState<number | null>(null);

  // Debug context tracking
  const [debugCollectionQueried, setDebugCollectionQueried] = useState<string | null>(null);
  const [debugDocIdQueried, setDebugDocIdQueried] = useState<string | null>(null);
  const [lastFirestoreErrorCode, setLastFirestoreErrorCode] = useState<string | null>(null);
  const [lastFirestoreErrorMessage, setLastFirestoreErrorMessage] = useState<string | null>(null);

  // Auto-listen to FirebaseAuth to accurately populate diagnostics in real-time
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) {
        setFirebaseAuthStatus(`Active (UID: ${user.uid.slice(0, 8)}..., Email: ${user.email || "No email"})`);
        setPermissionStatus("Authenticated");
      } else {
        setFirebaseAuthStatus("Null - Session Unauthenticated");
        // Don't override if there was a explicit DB error already set
        setPermissionStatus(prev => prev.includes("Denied") ? prev : "No permission - Signed out");
      }
    });
    return () => unsub();
  }, []);

  // Live lookup of store name based on typed Business ID
  useEffect(() => {
    const lookupStore = async () => {
      const bid = enteredBusinessId.trim().toUpperCase();
      if (!bid || bid.length < 3) {
        setMatchedBusinessName(null);
        setMatchedLogoUrl(null);
        return;
      }
      setResolvingStore(true);
      try {
        const res = await fetch(`/api/business/metadata?businessId=${encodeURIComponent(bid)}`);
        if (res.ok) {
          const data = await res.json();
          setMatchedBusinessName(data.businessName || null);
          setMatchedPlan(data.plan || "restaurant");
          setMatchedLogoUrl(data.logoUrl || null);
        } else {
          setMatchedBusinessName(null);
          setMatchedLogoUrl(null);
        }
      } catch (err) {
        console.error("Live lookup store error:", err);
        setMatchedBusinessName(null);
        setMatchedLogoUrl(null);
      } finally {
        setResolvingStore(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      lookupStore();
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [enteredBusinessId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    // Reset diagnostics properties for new action
    setFirestoreStatus("Querying...");
    setPermissionStatus("Checking...");
    setQueryResultCount(null);
    setLastFirestoreErrorCode(null);
    setLastFirestoreErrorMessage(null);

    const targetId = enteredBusinessId.trim().toUpperCase();
    const inputUsername = username.trim();
    const inputPassword = password.trim();

    if (!targetId || !inputUsername || !inputPassword) {
      setErrorMessage("Please complete all required fields.");
      setLoading(false);
      return;
    }

    // 4. Before any business lookup:
    console.log("Current Firebase User context:", auth.currentUser);

    let isLoggedAndResolved = false;
    let userDataObject: any = null;

    // 1. Attempt login via Express server-side API route
    try {
      console.log("[Business Portal] Attempting server-side validation handshake...");
      const response = await fetch("/api/auth/business-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: targetId,
          username: inputUsername,
          password: inputPassword,
          currentDeviceId
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          userDataObject = data.user;
          isLoggedAndResolved = true;
          setFirestoreStatus("Server Auth Active");
          setPermissionStatus("Granted");
          console.log("[Business Portal] Server handshake succeeded:", userDataObject);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        const sError = errorData.error || "";
        console.warn("[Business Portal] Server endpoint returned error status:", response.status, sError);
        
        // Match specific known server errors and present them immediately to prevent fall-through masked error confusion
        if (sError) {
          if (sError === "Business not found" || sError === "Business does not exist" || sError.toLowerCase().includes("business does not exist")) {
            setErrorMessage("Business does not exist");
            toast("Business does not exist", "error");
            setLoading(false);
            return;
          }
          if (sError === "Password incorrect" || sError === "Incorrect password") {
            setErrorMessage("Incorrect password");
            toast("Incorrect password", "error");
            setLoading(false);
            return;
          }
          if (response.status === 400 || response.status === 403 || response.status === 404) {
            setErrorMessage(sError);
            toast(sError, "error");
            setLoading(false);
            return;
          }
        }
      }
    } catch (gateErr) {
      console.warn("[Business Portal] Express backend connection warning - switching to client-side direct failover...", gateErr);
    }

    // 2. Client-Side fallback for bulletproof cross-device access
    if (!isLoggedAndResolved) {
      setDebugCollectionQueried("users");
      setDebugDocIdQueried(`username:${inputUsername}, businessId:${targetId}`);

      try {
        console.log("[Business Portal Failover] Initializing direct Firestore client validation keys query...");

        // Match user record from firestore directly with robust fallback filters (username, usernameLower, email)
        const qUsers = query(
          collection(db, "users"),
          where("username", "==", inputUsername),
          where("businessId", "==", targetId)
        );
        let snapUsers = await getDocs(qUsers);

        if (snapUsers.empty) {
          const qUsersLower = query(
            collection(db, "users"),
            where("usernameLower", "==", inputUsername.toLowerCase()),
            where("businessId", "==", targetId)
          );
          snapUsers = await getDocs(qUsersLower);
        }

        if (snapUsers.empty) {
          const qUsersEmail = query(
            collection(db, "users"),
            where("email", "==", inputUsername.toLowerCase()),
            where("businessId", "==", targetId)
          );
          snapUsers = await getDocs(qUsersEmail);
        }
        
        const hashedPassword = sha256(inputPassword);

        // Update Diagnostics Success state
        setQueryResultCount(snapUsers.size);
        setFirestoreStatus("Query Succeeded");
        setPermissionStatus("Granted");

        // 3. Check if empty and determine whether business lacks registry completely or user mismatch
        if (snapUsers.empty) {
          console.log("No matching user documents found. Verifying business entity existence...");
          // Check if the business exists in businesses collection
          try {
            const bizSnap = await getDoc(doc(db, "businesses", targetId));
            if (!bizSnap.exists()) {
              setErrorMessage("Business does not exist");
              toast("Business does not exist", "error");
            } else {
              setErrorMessage("Incorrect username");
              toast("Incorrect username", "error");
            }
          } catch (bizErr) {
            console.warn("Direct business verification check restricted or failed:", bizErr);
            // Default to "Incorrect credentials" if we have partial access or fallback
            setErrorMessage("Incorrect username");
            toast("Incorrect username", "error");
          }
          setLoading(false);
          return;
        }

        let authenticatedUserDoc: any = null;
        const userDoc = snapUsers.docs[0];
        const uData = userDoc.data();
        const savedPass = uData.password || uData.passwordHash || "";

        if (savedPass === inputPassword || savedPass === hashedPassword) {
          authenticatedUserDoc = { uid: userDoc.id, ...uData };
        } else {
          console.error("[Business Portal Mismatch] Password hash check failed");
          toast("Incorrect password", "error");
          setErrorMessage("Incorrect password");
          setLoading(false);
          return;
        }

        if (authenticatedUserDoc) {
          if (!authenticatedUserDoc.role) {
            toast("User role not assigned.", "error");
            setErrorMessage("User role not assigned.");
            setLoading(false);
            return;
          }
          if (authenticatedUserDoc.active !== true) {
            toast("Business inactive", "error");
            setErrorMessage("Business inactive");
            setLoading(false);
            return;
          }

          userDataObject = {
            uid: authenticatedUserDoc.uid,
            email: authenticatedUserDoc.email || `${inputUsername}@gerapay.qr`,
            username: authenticatedUserDoc.username || inputUsername,
            role: authenticatedUserDoc.role || "business_admin",
            businessId: authenticatedUserDoc.businessId || targetId,
            businessName: authenticatedUserDoc.businessName || "Mizerwa Shop",
            plan: authenticatedUserDoc.plan || "restaurant"
          };
          isLoggedAndResolved = true;
          console.log("[Business Portal Failover] Direct credentials verification succeeded:", userDataObject);
        }
      } catch (clientErr: any) {
        // Detailed console trace
        console.error("Firestore Error Code:", clientErr?.code);
        console.error("Firestore Error Message:", clientErr?.message);
        console.error("User Auth State:", auth.currentUser);
        console.error("Collection Queried: users");

        // Save trace in state
        const eCode = clientErr?.code || "unknown";
        const eMsg = clientErr?.message || String(clientErr);
        setLastFirestoreErrorCode(eCode);
        setLastFirestoreErrorMessage(eMsg);
        setFirestoreStatus("Error: " + eMsg);

        // Map errors exactly
        if (eCode === "permission-denied" || eMsg.toLowerCase().includes("permission")) {
          setPermissionStatus("Denied (permission-denied)");
          setErrorMessage("Database permission denied");
          toast("Database permission denied", "error");
        } else if (eCode === "not-found") {
          setErrorMessage("Business does not exist");
          toast("Business does not exist", "error");
        } else if (eCode === "wrong-password" || eCode === "auth/wrong-password" || eCode === "invalid-credential" || eCode === "auth/invalid-credential") {
          setErrorMessage("Incorrect password");
          toast("Incorrect password", "error");
        } else if (eCode === "user-disabled" || eCode === "auth/user-disabled") {
          setErrorMessage("Account disabled");
          toast("Account disabled", "error");
        } else if (eCode === "unavailable" || eCode === "network-error" || eCode === "auth/network-request-failed" || eMsg.toLowerCase().includes("network")) {
          setErrorMessage("Connection problem");
          toast("Connection problem", "error");
        } else {
          setPermissionStatus("Error (" + eCode + ")");
          setErrorMessage("Unexpected system error");
          toast("Unexpected system error", "error");
        }

        setLoading(false);
        return; // Halt so they can review the diagnostic details
      }
    }

    if (isLoggedAndResolved && userDataObject) {
      toast(`Successfully logged into ${userDataObject.businessName}`, "success");
      onLoginSuccess(userDataObject);
    } else {
      toast("Gateway secure node error. Check connections.", "error");
      setErrorMessage("Gateway secure node error. Check connections.");
    }

    setLoading(false);
  };


  // Preconfigured Demo Credentials for instantaneous cross-device testing & sandbox presentation
  const demoPresets = [
    {
      id: "preset-mizerwa-admin",
      label: "Mizerwa Restaurant",
      roleLabel: "Business Admin",
      businessId: "MIZERWA",
      businessName: "Mizerwa Restaurant",
      username: "admin",
      role: "business_admin",
      plan: "restaurant",
      active: true,
      description: "Manage table layouts, menu catalogs, and checkout registers."
    },
    {
      id: "preset-kigali-cashier",
      label: "Kigali Premier Cafe",
      roleLabel: "Store Cashier",
      businessId: "KIGALI-CAFE",
      businessName: "Kigali Premier Cafe",
      username: "nema-cashier",
      role: "cashier",
      plan: "grocery",
      active: true,
      description: "Fast bill generators, scanning receipt QRs and MOMO orders."
    },
    {
      id: "preset-lounge-waiter",
      label: "Spices Food & Lounge",
      roleLabel: "Table Waiter",
      businessId: "LUNCH-SPOT",
      businessName: "Spices Food & Lounge",
      username: "john-waiter",
      role: "waiter",
      plan: "restaurant",
      active: true,
      description: "Interactive waiter orders, menu previews, and table dispatches."
    },
    {
      id: "preset-gera-super",
      label: "Gera Tech Admin Console",
      roleLabel: "Super Admin Developer",
      businessId: "SYSTEM",
      businessName: "Gera Tech Admin Console",
      username: "ishimwecharles2525@gmail.com",
      role: "super_admin",
      plan: "restaurant",
      active: true,
      description: "Inspect system logs, subscription states, and client databases."
    }
  ];

  const handleDemoPresetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    const preset = demoPresets.find(p => p.id === selectedPresetId);
    if (!preset) {
      setLoading(false);
      return;
    }

    const userPayload = {
      uid: "GP-UID-DEMO-" + preset.businessId + "-" + Math.floor(1000 + Math.random() * 9000),
      email: preset.username.includes("@") ? preset.username : `${preset.username}@gerapay.qr`,
      username: preset.username,
      role: preset.role,
      businessId: preset.businessId,
      businessName: preset.businessName,
      plan: preset.plan,
      active: true,
      isCustomSession: true
    };

    toast(`Successfully authenticated as ${preset.roleLabel} (${preset.businessName})`, "success");

    setTimeout(() => {
      onLoginSuccess(userPayload);
      setLoading(false);
    }, 400);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-sm bg-[#11141C] border border-white/10 rounded-3xl p-6 shadow-2xl relative z-10 text-left space-y-6"
    >
      <div className="absolute top-0 right-0 w-44 h-44 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Info */}
      <div className="text-center space-y-2">
        <div className="w-14 h-14 mx-auto mb-1 flex items-center justify-center relative">
          {matchedLogoUrl ? (
            <img 
              src={matchedLogoUrl} 
              alt={matchedBusinessName || "Merchant Logo"} 
              className="w-14 h-14 object-cover rounded-2xl shadow-lg border border-white/10" 
              referrerPolicy="no-referrer"
            />
          ) : (
            <img src="/gera-pay-qr-logo.svg" alt="Gera Flow" className="w-14 h-14 object-contain rounded-2xl shadow-lg" />
          )}
        </div>
        <div>
          <h1 className="text-base font-black tracking-tight text-white uppercase font-sans">Gera Flow Business Portal</h1>
          <p className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase font-bold">Secure Merchant Terminal</p>
        </div>
      </div>

      {/* TABS SELECTOR */}
      <div className="grid grid-cols-2 p-1 bg-zinc-950/80 border border-white/5 rounded-2xl">
        <button
          type="button"
          onClick={() => setActiveTab("standard")}
          className={`py-2 text-[10px] font-bold rounded-xl transition-all uppercase tracking-wide cursor-pointer text-center ${
            activeTab === "standard"
              ? "bg-blue-600/15 text-blue-400 border border-blue-500/20"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Secured DB Auth
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("demo")}
          className={`py-2 text-[10px] font-bold rounded-xl transition-all uppercase tracking-wide cursor-pointer text-center ${
            activeTab === "demo"
              ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Quick Demo Bypass
        </button>
      </div>

      {activeTab === "standard" && matchedBusinessName && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3 animate-pulse">
          <Building size={16} className="text-emerald-400 shrink-0" />
          <div className="text-left">
            <span className="text-[9px] text-[#00D68F] font-mono uppercase tracking-widest font-black block">Merchant Node Certified</span>
            <span className="text-[11px] text-white font-sans font-bold block">{matchedBusinessName}</span>
          </div>
        </div>
      )}

      {activeTab === "standard" && (
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-500/5 border border-rose-500/25 rounded-2xl flex items-start gap-2.5 text-rose-400 font-sans">
              <AlertCircle size={14} className="shrink-0 mt-0.5 text-rose-400" />
              <span className="text-[10.5px] font-semibold leading-normal">{errorMessage}</span>
            </div>
          )}

          {/* Business ID Field - Shown only when not provided in URL */}
          {!initialBizId && (
            <div className="space-y-1">
              <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Store ID / Business ID</label>
              <div className="relative">
                <Building size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600" />
                <input
                  type="text"
                  placeholder="e.g. GP-XXXX"
                  value={enteredBusinessId}
                  onChange={(e) => setEnteredBusinessId(e.target.value)}
                  required
                  className="w-full pl-9.5 pr-3 py-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white placeholder-slate-700 font-mono text-xs focus:outline-none focus:border-blue-500/70 transition-all uppercase"
                />
                {matchedBusinessName && (
                  <CheckCircle2 size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-400" />
                )}
              </div>
            </div>
          )}

          {/* Username Field */}
          <div className="space-y-1">
            <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Business Client Username</label>
            <div className="relative">
              <User size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                type="text"
                placeholder="e.g. nema-shop"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full pl-9.5 pr-3 py-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white placeholder-slate-700 font-mono text-xs focus:outline-none focus:border-blue-500/70 transition-all"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Security Password / PIN</label>
            <div className="relative">
              <Lock size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-9.5 pr-3 py-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white placeholder-slate-700 font-mono text-xs focus:outline-none focus:border-blue-500/70 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || (resolvingStore && !matchedBusinessName)}
            className="w-full py-3 bg-[#1B32FF] hover:brightness-110 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-blue-500/10 transition-all active:scale-[0.97] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <RefreshCw size={12} className="animate-spin" /> : <Shield size={12} />}
            {loading ? "CHECKING CRYPTO LOCKS..." : "AUTHENTICATE SYSTEM CODES"}
          </button>
        </form>
      )}

      {activeTab === "demo" && (
        <form onSubmit={handleDemoPresetSubmit} className="space-y-4 text-xs">
          <div className="text-[10px] text-zinc-400 leading-relaxed font-sans mb-1 p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl">
            Choose a demo persona to instantly bypass cloud database checks and explore full multi-agent workspaces instantly on any device!
          </div>

          <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 select-none">
            {demoPresets.map((p) => {
              const isSelected = selectedPresetId === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPresetId(p.id)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer text-left relative ${
                    isSelected
                      ? "bg-indigo-500/10 border-indigo-500/40 shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]"
                      : "bg-zinc-950 border-white/5 hover:border-white/15"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-bold text-white font-sans text-[11px] block">{p.label}</span>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-mono uppercase tracking-wider font-semibold ${
                      p.role === "super_admin" 
                        ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" 
                        : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                    }`}>
                      {p.roleLabel}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-normal mb-1">{p.description}</p>
                  <div className="flex items-center gap-4 text-[9px] font-mono text-zinc-500">
                    <span>ID: <strong className="text-zinc-400">{p.businessId}</strong></span>
                    <span>USER: <strong className="text-zinc-400">{p.username}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-indigo-500/10 transition-all active:scale-[0.97] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <RefreshCw size={12} className="animate-spin" /> : <Award size={12} />}
            {loading ? "INITIALIZING SECURE SESSION..." : "ENTER WORKSPACE INSTANTLY"}
          </button>
        </form>
      )}

      {/* LOGIN DIAGNOSTICS PANEL */}
      <div className="bg-zinc-950/90 border border-white/5 rounded-2xl p-4.5 space-y-3 shadow-xl">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div className="flex items-center gap-1.5">
            <Settings size={12} className="text-blue-400 animate-pulse" />
            <h3 className="text-[10px] font-black tracking-widest text-slate-300 uppercase font-mono">
              Portal Diagnostics
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setDiagnosticsVisible(!diagnosticsVisible)}
            className="px-2 py-0.5 bg-white/5 hover:bg-white/10 rounded font-mono text-[8px] uppercase tracking-wider text-slate-400 font-bold transition-all cursor-pointer"
          >
            {diagnosticsVisible ? "Hide Panel" : "Show Panel"}
          </button>
        </div>

        {diagnosticsVisible && (
          <div className="space-y-2 font-mono text-[9px] text-zinc-400 select-all">
            {/* Firebase Auth Status */}
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.03] pb-1.5">
              <span className="text-slate-500 font-sans font-bold uppercase text-[8px] tracking-wider">Firebase Auth status</span>
              <span className="text-right font-semibold text-white break-all">
                {firebaseAuthStatus}
              </span>
            </div>

            {/* Firestore Status */}
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.03] pb-1.5">
              <span className="text-slate-500 font-sans font-bold uppercase text-[8px] tracking-wider">Firestore status</span>
              <span className={`text-right font-bold ${
                firestoreStatus.includes("Error") 
                  ? "text-rose-400 font-extrabold" 
                  : firestoreStatus.includes("Succeeded") 
                    ? "text-emerald-400" 
                    : "text-zinc-300"
              }`}>
                {firestoreStatus}
              </span>
            </div>

            {/* Permission Status */}
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.03] pb-1.5">
              <span className="text-slate-500 font-sans font-bold uppercase text-[8px] tracking-wider">Permission status</span>
              <span className={`text-right font-bold uppercase tracking-wider ${
                permissionStatus.includes("Denied") || permissionStatus.includes("Unauthenticated")
                  ? "text-rose-400 font-extrabold" 
                  : permissionStatus.includes("Authenticated") || permissionStatus.includes("Granted")
                    ? "text-emerald-400" 
                    : "text-amber-400"
              }`}>
                {permissionStatus}
              </span>
            </div>

            {/* Query Result Count */}
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.03] pb-1.5">
              <span className="text-slate-500 font-sans font-bold uppercase text-[8px] tracking-wider">Query result count</span>
              <span className="text-right font-bold text-white">
                {queryResultCount === null ? "—" : queryResultCount}
              </span>
            </div>

            {/* Detail Logs when error or queried */}
            {debugCollectionQueried && (
              <div className="pt-2 mt-2 border-t border-dashed border-white/5 space-y-1.5 text-zinc-500 text-[8px] leading-relaxed">
                <div>
                  <span className="text-slate-600 font-sans font-bold">COLLECTION:</span>{" "}
                  <code className="text-zinc-400 bg-white/5 px-1 py-0.5 rounded">{debugCollectionQueried}</code>
                </div>
                {debugDocIdQueried && (
                  <div>
                    <span className="text-slate-600 font-sans font-bold">QUERY FILTERS:</span>{" "}
                    <code className="text-zinc-400 bg-white/5 px-1 py-0.5 rounded break-all">{debugDocIdQueried}</code>
                  </div>
                )}
                {lastFirestoreErrorCode && (
                  <div>
                    <span className="text-rose-500 font-sans font-bold">FIRESTORE ERROR CODE:</span>{" "}
                    <code className="text-rose-400 bg-rose-500/10 px-1 py-0.5 rounded">{lastFirestoreErrorCode}</code>
                  </div>
                )}
                {lastFirestoreErrorMessage && (
                  <div className="break-words">
                    <span className="text-rose-500 font-sans font-bold block mb-0.5">FIRESTORE ERROR MESSAGE:</span>
                    <span className="text-rose-300 font-mono text-[8px] leading-relaxed block p-1.5 bg-rose-950/20 rounded border border-rose-500/10">{lastFirestoreErrorMessage}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-white/5 pt-4 flex flex-col items-center gap-2">
        <button
          onClick={() => {
            if (typeof window !== "undefined") {
              window.location.href = "/";
            }
          }}
          className="text-[10px] text-zinc-400 hover:text-white font-bold transition-all uppercase tracking-wide"
        >
          ← Return to Gateway Hub
        </button>
      </div>

      <div className="text-center text-[9px] text-slate-500 font-mono uppercase tracking-widest flex items-center justify-center gap-1.5 pt-1">
        <Laptop size={11} className="text-slate-600" /> KYC SECURED • GERA PAY LTD
      </div>
    </motion.div>
  );
}
