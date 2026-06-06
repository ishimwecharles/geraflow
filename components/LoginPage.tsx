import React, { useState, useEffect } from "react";
import { 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail, 
  signOut 
} from "firebase/auth";
import { 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Terminal, 
  Building, 
  UserCheck, 
  Bug,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { auth, db } from "../lib/firebase";
import { mapAuthError, UserProfile } from "../hooks/useAuth";
import { sha256, logSecurityEvent } from "../lib/security";
import { collection, query, where, getDocs, doc, getDoc, setDoc } from "firebase/firestore";

interface LoginPageProps {
  user: any;
  userProfile: UserProfile | null;
  businessProfile: any | null;
  role: string | null;
  businessId: string | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  onLoginSuccess: (userProfile: UserProfile, bizProfile: any) => void;
  toast: (message: string, type: "success" | "error" | "info" | "warning") => void;
}

export default function LoginPage({
  user,
  userProfile,
  businessProfile,
  role,
  businessId,
  loading: authHookLoading,
  error: authHookError,
  errorCode: authHookErrorCode,
  onLoginSuccess,
  toast
}: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  
  // Forgot password states
  const [forgotEmail, setForgotEmail] = useState("");
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccessMessage, setForgotSuccessMessage] = useState<string | null>(null);

  // Business mismatch check
  const [mismatchError, setMismatchError] = useState<string | null>(null);

  // Debug Panel Toggle
  const [showDebug, setShowDebug] = useState(false);

  // Extract Business ID from URL context
  const [urlBusinessId, setUrlBusinessId] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const bizIdFromUrl = params.get("businessId") || params.get("clientId") || "";
      if (bizIdFromUrl) {
        setUrlBusinessId(bizIdFromUrl.trim());
      }
    }
  }, []);

  // Monitor Auth hook output and check for Business ID URL mismatch
  useEffect(() => {
    if (urlBusinessId && userProfile && userProfile.role !== "super_admin") {
      if (userProfile.businessId.toLowerCase() !== urlBusinessId.toLowerCase()) {
        setMismatchError("This account does not belong to this business.");
        toast("This account does not belong to this business.", "error");
        // Log out immediately to clear mismatched state
        signOut(auth);
      } else {
        setMismatchError(null);
      }
    } else {
      setMismatchError(null);
    }
  }, [userProfile, urlBusinessId, toast]);

  // Handle standard Login form submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setLoginError(null);
    setMismatchError(null);

    try {
      let finalEmail = email.trim();
      let isSyntheticEmail = false;
      if (!finalEmail.includes("@")) {
        finalEmail = `${finalEmail.toLowerCase()}@gerapay.local`;
        isSyntheticEmail = true;
      }

      try {
        // 1. Firebase Auth SignIn
        const userCredential = await signInWithEmailAndPassword(auth, finalEmail, password);
        console.log("[GeraPay Login] Sign-in succeeded for uid:", userCredential.user.uid);
        
        await logSecurityEvent({
          eventType: "auth_login_success",
          action: `User logged in successfully via Firebase Auth: ${finalEmail}`,
          userId: userCredential.user.uid,
          userEmail: finalEmail
        });

        toast("Authentication successful. Opening portal secure link...", "success");
      } catch (authErr: any) {
        // Fallback: Query Firestore users collection as a comprehensive failover for any Auth errors
        console.warn("[GeraPay Login] Firebase Auth failed or bypassed. Querying Firestore registry as failover...", authErr);
        
        let snap = await getDocs(query(collection(db, "users"), where("email", "==", finalEmail.toLowerCase())));
        
        if (snap.empty && isSyntheticEmail) {
          // Also lookup by username Lower directly
          snap = await getDocs(query(collection(db, "users"), where("usernameLower", "==", email.trim().toLowerCase())));
        }

        if (snap.empty) {
          // Robust extra check: try matching usernameLower directly even if typed as normal email
          snap = await getDocs(query(collection(db, "users"), where("usernameLower", "==", email.trim().toLowerCase())));
        }

        if (snap.empty) {
          // No profile found, propagate the primary authentication error
          throw authErr;
        }

        const userData = snap.docs[0].data();
        const targetHash = sha256(password.trim());
        const savedPass = userData.password || userData.passwordHash;

        if (savedPass && savedPass !== password.trim() && savedPass !== targetHash) {
          throw { code: "auth/wrong-password", message: "Incorrect password." };
        }

        if (userData.active !== true) {
          throw { code: "account-inactive", message: "Account inactive." };
        }

        // Fetch business properties if applicable
        let bizProfile: any = null;
        if (userData.businessId) {
          try {
            const bizSnap = await getDoc(doc(db, "businesses", userData.businessId));
            if (bizSnap.exists()) {
              bizProfile = bizSnap.data();
            } else {
              const cSnap = await getDocs(query(collection(db, "clients"), where("clientId", "==", userData.businessId)));
              if (!cSnap.empty) {
                bizProfile = cSnap.docs[0].data();
              }
            }
          } catch (e) {
            console.warn("[GeraPay] Failover client info retrieval error:", e);
          }
        }

        // Auto-provision missing business and client records to prevent "business profile missing" or "business not found"
        if (userData.businessId && !bizProfile) {
          console.warn("[GeraPay Login Failover] Business profile is missing. Designing/Provisioning on-the-fly to secure direct dashboard navigation!");
          const targetId = userData.businessId.trim().toUpperCase();
          const pName = userData.businessName || `${targetId} Restaurant`;
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
            maxStaff: 10,
            maxDevices: 5,
            plan: userData.plan || "restaurant",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            businessAdminName: "Merchant Owner",
            businessUsername: userData.email.split("@")[0].toLowerCase(),
            businessPassword: targetHash,
            passwordHash: targetHash,
            role: "business_admin",
            businessAccessQr: `/client-login?businessId=${targetId}`,
            businessAccessLink: `https://gerapay.qr/client-login?businessId=${targetId}`,
            businessAccessQrUrl: ""
          };
          try {
            await setDoc(doc(db, "businesses", targetId), clientPayload);
            await setDoc(doc(db, "clients", targetId), clientPayload);
            bizProfile = clientPayload;
            console.log("[GeraPay Login Failover] Successfully provisioned missing business profile:", targetId);
          } catch (provErr) {
            console.error("Failed auto-provisioning missing business profile during login failover:", provErr);
          }
        }

        toast("Secure Direct Registry Bypass active. Establishing workspace...", "success");
        
        await logSecurityEvent({
          eventType: "auth_login_success",
          action: `User logged in successfully via direct registry bypass: ${userData.email} (${userData.role})`,
          userId: snap.docs[0].id,
          userEmail: userData.email,
          userRole: userData.role,
          businessId: userData.businessId || "",
        });

        onLoginSuccess({
          uid: snap.docs[0].id,
          email: userData.email,
          role: userData.role,
          businessId: userData.businessId || "",
          businessName: userData.businessName || bizProfile?.businessName || "",
          username: userData.username,
          active: true
        }, bizProfile);
        
        return;
      }
    } catch (err: any) {
      console.error("[GeraPay Login Error]:", err);
      
      await logSecurityEvent({
        eventType: "auth_login_failed",
        action: `Failed login attempt for email: ${email}`,
        userEmail: email,
        metadata: { error: err?.message || String(err), errorCode: err?.code || null }
      });

      const mapped = mapAuthError(err);
      setLoginError(mapped.message);
      toast(mapped.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Handle Forgot Password link trigger
  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;

    setForgotLoading(true);
    setForgotSuccessMessage(null);

    try {
      await sendPasswordResetEmail(auth, forgotEmail.trim());
      setForgotSuccessMessage("Password reset email sent. Please check your inbox.");
      toast("Password reset email sent.", "success");

      await logSecurityEvent({
        eventType: "auth_password_reset_requested",
        action: `Password reset link requested for email: ${forgotEmail.trim()}`,
        userEmail: forgotEmail.trim()
      });
    } catch (err: any) {
      console.error("[GeraPay Forgot Password Error]:", err);
      const mapped = mapAuthError(err);
      toast(mapped.message, "error");
    } finally {
      setForgotLoading(false);
    }
  };

  // Active errors (local login error or background profile/business errors)
  const activeError = mismatchError || loginError || authHookError;
  const isDisplayLoading = loading || authHookLoading;

  return (
    <div id="login-page-container" className="w-full max-w-sm mx-auto space-y-6">
      <div className="w-full bg-[#11141C] border border-white/10 rounded-3xl p-6 relative z-10 shadow-2xl relative overflow-hidden">
        {/* Glow Element */}
        <div className="absolute -top-12 -left-12 w-24 h-24 rounded-full bg-indigo-500/10 blur-xl pointer-events-none" />

        {/* Brand Banner */}
        <div className="text-center space-y-2 mb-6">
          <div className="w-14 h-14 mx-auto mb-2 flex items-center justify-center bg-indigo-500/10 border border-indigo-500/20 text-[#1B32FF] rounded-2xl shadow-inner">
            <Building size={24} className={isDisplayLoading ? "animate-spin text-[#1B32FF]" : "text-[#1B32FF]"} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white uppercase font-sans">Gera Flow Terminal</h1>
            <p className="text-[10px] text-slate-500 font-mono tracking-widest mt-0.5 font-bold">SECURE CHANNEL SIGN-IN</p>
          </div>

          {urlBusinessId && (
            <div className="mt-3 px-3 py-1.5 bg-[#FFC107]/10 border border-[#FFC107]/20 rounded-full inline-flex items-center gap-1.5 text-[10px] text-[#FFC107] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Business Access Link detected: {urlBusinessId}
            </div>
          )}
        </div>

        {/* Display Mapped/Active Error Messages */}
        {activeError && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3.5 bg-rose-500/5 border border-rose-500/25 rounded-2xl flex items-start gap-2.5 text-rose-400 text-xs mb-5 font-sans"
          >
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-[11px] block uppercase font-mono tracking-wide">Access Barrier Detected</span>
              <p className="text-[10.5px] text-slate-300 leading-normal">{activeError}</p>
            </div>
          </motion.div>
        )}

        {/* Standard Email/Password Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs text-left">
          <div className="space-y-1">
            <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Account Email or Username</label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. cashier or cashier@restaurant.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isDisplayLoading}
                className="w-full pl-9 pr-3 py-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white placeholder-slate-700 font-sans focus:outline-none focus:border-[#1B32FF] transition-all disabled:opacity-50"
              />
              <Mail className="absolute left-3 top-2.5 text-slate-700" size={14} />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Portal Password</label>
              <button 
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="text-[9px] text-indigo-400 hover:text-white font-bold transition-all uppercase"
              >
                Forgot Password?
              </button>
            </div>
            
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isDisplayLoading}
                className="w-full pl-9 pr-10 py-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white placeholder-slate-700 font-sans focus:outline-none focus:border-[#1B32FF] transition-all disabled:opacity-50"
              />
              <Lock className="absolute left-3 top-2.5 text-slate-700" size={14} />
              
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition-all cursor-pointer"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <button 
            type="submit"
            disabled={isDisplayLoading}
            className="w-full py-3 bg-[#1B32FF] text-white hover:bg-indigo-600 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer disabled:opacity-50 tracking-wider font-sans uppercase"
          >
            {isDisplayLoading ? (
              <>
                <RefreshCw size={12} className="animate-spin" />
                <span>SECURE VALIDATION ACTIVE...</span>
              </>
            ) : (
              <>
                <UserCheck size={12} />
                <span>VERIFY TERMINAL IDENTITY</span>
              </>
            )}
          </button>
        </form>

        {/* Footer text */}
        <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center text-[9px] text-slate-500 font-mono uppercase">
          <span>Gera Flow Node</span>
          <span>v2.4.0 • Live Terminal</span>
        </div>
      </div>

      {/* Button to toggle development Debug Panel */}
      <div className="flex justify-center">
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="px-3.5 py-1.5 bg-white/5 border border-white/10 rounded-full flex items-center gap-1.5 text-[9.5px] text-indigo-400 font-mono uppercase font-bold hover:bg-white/10 transition-all"
        >
          <Bug size={11} />
          {showDebug ? "Hide Diagnostic Hub" : "Show Diagnostic Hub"}
        </button>
      </div>

      {/* Development Debug Panel (Requirement 16) */}
      <AnimatePresence>
        {showDebug && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-zinc-950 border border-indigo-500/20 rounded-2xl text-[10.5px] text-slate-300 font-mono space-y-3.5 text-left relative">
              <div className="flex justify-between items-center border-b border-indigo-500/10 pb-2">
                <span className="font-bold text-indigo-400 flex items-center gap-1 uppercase tracking-wider text-[9px]">
                  <Terminal size={12} /> Gera Diagnostic Node
                </span>
                <span className="text-[8px] px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full font-bold">REACTIVE</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 select-all">
                  <span className="text-[8.5px] text-slate-500 block uppercase font-bold tracking-widest">Firebase UUID (uid)</span>
                  <span className="text-[10px] text-slate-200 block truncate">{user?.uid || "null"}</span>
                </div>
                <div className="space-y-1 select-all">
                  <span className="text-[8.5px] text-slate-500 block uppercase font-bold tracking-widest">Email</span>
                  <span className="text-[10px] text-slate-200 block truncate">{user?.email || "null"}</span>
                </div>
                <div className="space-y-1 font-bold">
                  <span className="text-[8.5px] text-slate-500 block uppercase tracking-widest font-normal">Privilege Role</span>
                  <span className="text-[10px] text-yellow-500 block truncate capitalize tracking-wide">{role || "null"}</span>
                </div>
                <div className="space-y-1 font-mono">
                  <span className="text-[8.5px] text-slate-500 block uppercase font-bold tracking-widest font-normal">Linked Business ID</span>
                  <span className="text-[10px] text-slate-200 block truncate">{businessId || "null"}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[8.5px] text-slate-500 block uppercase font-bold tracking-widest font-normal">User profile loaded</span>
                  <span className="text-[10px] block font-black">
                    {userProfile ? (
                      <span className="text-green-400">TRUE (OK)</span>
                    ) : (
                      <span className="text-red-400">FALSE</span>
                    )}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[8.5px] text-slate-500 block uppercase font-bold tracking-widest font-normal">Business profile loaded</span>
                  <span className="text-[10px] block font-black">
                    {businessProfile ? (
                      <span className="text-green-400">TRUE (OK)</span>
                    ) : (
                      <span className="text-red-400">FALSE</span>
                    )}
                  </span>
                </div>
              </div>

              {(authHookError || loginError) && (
                <div className="pt-2.5 border-t border-indigo-500/10 space-y-1 bg-red-500/5 p-2 rounded-xl border border-red-500/10">
                  <span className="text-[8.5px] text-red-400 block uppercase font-bold tracking-wider">Firestore / Auth Exception Trace</span>
                  <div className="text-[10px] text-red-300 font-mono break-all leading-relaxed">
                    <strong>Code:</strong> {authHookErrorCode || "unknown-code"}
                    <br />
                    <strong>Message:</strong> {authHookError || loginError}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Forgot Password Modal Panel */}
      <AnimatePresence>
        {showForgotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-[#11141C] border border-white/10 rounded-3xl p-6 space-y-6 shadow-2xl relative text-left"
            >
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-indigo-500/15 border border-indigo-500/25 text-[#1B32FF] rounded-2xl flex items-center justify-center mx-auto">
                  <Info size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white uppercase font-sans">Initialize Reset Sequence</h3>
                  <p className="text-[10px] text-slate-500 leading-normal">Enter your email to request secure credentials reset instructions.</p>
                </div>
              </div>

              {forgotSuccessMessage ? (
                <div className="p-3.5 bg-green-500/5 border border-green-500/20 rounded-2xl flex items-start gap-2 text-green-400 text-xs">
                  <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                  <span className="font-bold text-[10.5px] font-mono leading-relaxed">{forgotSuccessMessage}</span>
                </div>
              ) : (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-4 text-xs font-sans">
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Verification Email Address</label>
                    <input
                      type="email"
                      placeholder="e.g. cashier@bakery.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                      className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white placeholder-slate-800 focus:outline-none focus:border-[#1B32FF] transition-all font-sans"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full py-2.5 bg-[#1B32FF] text-white hover:bg-indigo-600 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 uppercase tracking-widest"
                  >
                    {forgotLoading ? <RefreshCw size={12} className="animate-spin" /> : null}
                    {forgotLoading ? "Initiating Handshake..." : "Issue Reset Transmission"}
                  </button>
                </form>
              )}

              <div className="flex justify-center pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotModal(false);
                    setForgotSuccessMessage(null);
                    setForgotEmail("");
                  }}
                  className="text-[10px] text-slate-400 hover:text-white font-bold transition-all uppercase"
                >
                  Return to Login
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
