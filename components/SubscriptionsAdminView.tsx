import React, { useState, useEffect } from "react";
import { Activation, SubscriptionPlan } from "../types";
import { 
  ShieldCheck, 
  RefreshCw, 
  Trash2, 
  Search, 
  CreditCard, 
  Smartphone, 
  Terminal, 
  Calendar, 
  Clock, 
  AlertCircle,
  Coins,
  Cpu,
  UserX,
  Plus
} from "lucide-react";
import { collection, onSnapshot, query, updateDoc, doc, deleteDoc, orderBy, where, getDocs, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import QRCode from "qrcode";
import { getPaymentUrl } from "../lib/urls";

const PLANS_MAPPING: Record<string, string> = {
  starter: "Starter Basic",
  restaurant: "Restaurant & Bar",
  international: "Intl Commerce Card",
  enterprise: "Enterprise Pro"
};

const PLAN_PRICES: Record<string, number> = {
  starter: 15000,
  restaurant: 35000,
  international: 55000,
  enterprise: 95000
};

interface SubscriptionsAdminViewProps {
  toast: (msg: string, type: "success" | "error" | "info" | "warning") => void;
}

export default function SubscriptionsAdminView({ toast }: SubscriptionsAdminViewProps) {
  const [activations, setActivations] = useState<Activation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Verify Merchant QR States
  const [verifyMerchantId, setVerifyMerchantId] = useState("");
  const [verificationResult, setVerificationResult] = useState<{
    existsInBusinesses: boolean;
    existsInClients: boolean;
    isActive: boolean;
    status: string;
    message: string;
    checkedId: string;
  } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [activating, setActivating] = useState(false);
  const [qrcodeDataUrl, setQrcodeDataUrl] = useState<string | null>(null);

  const runVerifyWithId = async (idOfMerchant: string) => {
    try {
      const targetId = idOfMerchant.trim().toUpperCase();
      const [bizDocSnap, cliDocSnap, bizSnap, cliSnap, bizByIdSnap, bizByMerchSnap, cliByIdSnap, cliByMerchSnap] = await Promise.all([
        getDocs(query(collection(db, "businesses"), where("__name__", "==", targetId))),
        getDocs(query(collection(db, "clients"), where("__name__", "==", targetId))),
        getDocs(query(collection(db, "businesses"), where("businessId", "==", targetId))),
        getDocs(query(collection(db, "clients"), where("clientId", "==", targetId))),
        getDocs(query(collection(db, "businesses"), where("id", "==", targetId))),
        getDocs(query(collection(db, "businesses"), where("merchantId", "==", targetId))),
        getDocs(query(collection(db, "clients"), where("id", "==", targetId))),
        getDocs(query(collection(db, "clients"), where("merchantId", "==", targetId))),
      ]);

      const existsInBusinesses = !bizDocSnap.empty || !bizSnap.empty || !bizByIdSnap.empty || !bizByMerchSnap.empty;
      const existsInClients = !cliDocSnap.empty || !cliSnap.empty || !cliByIdSnap.empty || !cliByMerchSnap.empty;

      let isActive = false;
      let status = "not_found";
      let matchedData: any = null;

      if (!bizDocSnap.empty) matchedData = bizDocSnap.docs[0].data();
      else if (!bizSnap.empty) matchedData = bizSnap.docs[0].data();
      else if (!bizByIdSnap.empty) matchedData = bizByIdSnap.docs[0].data();
      else if (!bizByMerchSnap.empty) matchedData = bizByMerchSnap.docs[0].data();
      else if (!cliDocSnap.empty) matchedData = cliDocSnap.docs[0].data();
      else if (!cliSnap.empty) matchedData = cliSnap.docs[0].data();
      else if (!cliByIdSnap.empty) matchedData = cliByIdSnap.docs[0].data();
      else if (!cliByMerchSnap.empty) matchedData = cliByMerchSnap.docs[0].data();

      if (matchedData) {
        status = matchedData.status || "inactive";
        isActive = (matchedData.active === true) || (status === "active");
      }

      const isRouteValid = existsInBusinesses || existsInClients;

      setVerificationResult({
        existsInBusinesses,
        existsInClients,
        isActive,
        status,
        message: !isRouteValid 
          ? `Mismatched: Merchant ID '${targetId}' was not found in either businesses or clients registry.` 
          : isActive 
            ? `Verified: Merchant is validated, active (Status: ${status}), and the customer-facing QR route is valid.` 
            : `Suspended: Merchant exists but is inactive (Status: ${status}). CUSTOMERS SCANNING THE QR WILL RECEIVE AN INACTIVE ACCOUNT WARNING.`,
        checkedId: targetId
      });
    } catch (err) {
      console.error("[Verify Internal Error]", err);
    }
  };

  const handleVerifyQR = async () => {
    if (!verifyMerchantId.trim()) {
      toast("Please enter a merchant ID to verify", "warning");
      return;
    }
    const targetId = verifyMerchantId.trim().toUpperCase();
    setVerifying(true);
    setVerificationResult(null);
    setQrcodeDataUrl(null);

    console.log(`[Admin Verifier Handshake] Commencing verification audit for QR Merchant ID: ${targetId}`);

    try {
      const [bizDocSnap, cliDocSnap, bizSnap, cliSnap, bizByIdSnap, bizByMerchSnap, cliByIdSnap, cliByMerchSnap] = await Promise.all([
        getDocs(query(collection(db, "businesses"), where("__name__", "==", targetId))),
        getDocs(query(collection(db, "clients"), where("__name__", "==", targetId))),
        getDocs(query(collection(db, "businesses"), where("businessId", "==", targetId))),
        getDocs(query(collection(db, "clients"), where("clientId", "==", targetId))),
        getDocs(query(collection(db, "businesses"), where("id", "==", targetId))),
        getDocs(query(collection(db, "businesses"), where("merchantId", "==", targetId))),
        getDocs(query(collection(db, "clients"), where("id", "==", targetId))),
        getDocs(query(collection(db, "clients"), where("merchantId", "==", targetId))),
      ]);

      const existsInBusinesses = !bizDocSnap.empty || !bizSnap.empty || !bizByIdSnap.empty || !bizByMerchSnap.empty;
      const existsInClients = !cliDocSnap.empty || !cliSnap.empty || !cliByIdSnap.empty || !cliByMerchSnap.empty;

      let isActive = false;
      let status = "not_found";
      let matchedData: any = null;

      if (!bizDocSnap.empty) matchedData = bizDocSnap.docs[0].data();
      else if (!bizSnap.empty) matchedData = bizSnap.docs[0].data();
      else if (!bizByIdSnap.empty) matchedData = bizByIdSnap.docs[0].data();
      else if (!bizByMerchSnap.empty) matchedData = bizByMerchSnap.docs[0].data();
      else if (!cliDocSnap.empty) matchedData = cliDocSnap.docs[0].data();
      else if (!cliSnap.empty) matchedData = cliSnap.docs[0].data();
      else if (!cliByIdSnap.empty) matchedData = cliByIdSnap.docs[0].data();
      else if (!cliByMerchSnap.empty) matchedData = cliByMerchSnap.docs[0].data();

      if (matchedData) {
        status = matchedData.status || "inactive";
        isActive = (matchedData.active === true) || (status === "active");
      }

      const qrRouteValue = `/pay/${targetId}`;
      const isRouteValid = existsInBusinesses || existsInClients;

      const result = {
        existsInBusinesses,
        existsInClients,
        isActive,
        status,
        message: !isRouteValid 
          ? `Mismatched: Merchant ID '${targetId}' was not found in either businesses or clients registry.` 
          : isActive 
            ? `Verified: Merchant is validated, active (Status: ${status}), and the customer-facing QR route is valid.` 
            : `Suspended: Merchant exists but is inactive (Status: ${status}). CUSTOMERS SCANNING THE QR WILL RECEIVE AN INACTIVE ACCOUNT WARNING.`,
        checkedId: targetId
      };

      setVerificationResult(result);

      console.log("Logged Diagnostic Details for Security Verify:", {
        merchantId: targetId,
        existsInBusinessesCollection: existsInBusinesses,
        existsInClientsCollection: existsInClients,
        rawStatusField: status,
        rawActiveField: matchedData?.active ?? null,
        isVerifiedActive: isActive,
        expectedQrRoute: qrRouteValue,
        isQrRouteResolvable: isRouteValid,
        verifiedAt: new Date().toISOString()
      });

      if (isActive) {
        toast("Merchant verification successful! Account is live & scannable.", "success");
      } else if (isRouteValid) {
        toast("Warning: Merchant exists but is inactive.", "warning");
      } else {
        toast("Error: Merchant QR code not resolved.", "error");
      }

    } catch (err: any) {
      console.error("[Admin Verifier Error]", err);
      toast("Query transaction error: " + (err.message || String(err)), "error");
    } finally {
      setVerifying(false);
    }
  };

  const handleActivateMerchant = async () => {
    if (!verificationResult) return;
    const targetId = verificationResult.checkedId;
    setActivating(true);
    try {
      const qBiz = query(collection(db, "businesses"), where("businessId", "==", targetId));
      const qCli = query(collection(db, "clients"), where("clientId", "==", targetId));

      const [bizSnap, cliSnap] = await Promise.all([
        getDocs(qBiz),
        getDocs(qCli)
      ]);

      const batchPromises: Promise<any>[] = [];

      // Update matching docs in businesses
      if (!bizSnap.empty) {
        bizSnap.docs.forEach((d) => {
          batchPromises.push(updateDoc(doc(db, "businesses", d.id), { active: true, status: "active" }));
        });
      }
      // Set/merge directly on document ID as well
      batchPromises.push(setDoc(doc(db, "businesses", targetId), {
        active: true,
        status: "active",
        businessId: targetId
      }, { merge: true }));

      // Update matching docs in clients
      if (!cliSnap.empty) {
        cliSnap.docs.forEach((d) => {
          batchPromises.push(updateDoc(doc(db, "clients", d.id), { active: true, status: "active" }));
        });
      }
      // Set/merge directly on document ID as well
      batchPromises.push(setDoc(doc(db, "clients", targetId), {
        active: true,
        status: "active",
        clientId: targetId
      }, { merge: true }));

      await Promise.all(batchPromises);
      toast(`Successfully activated merchant ${targetId}`, "success");
      await runVerifyWithId(targetId);
    } catch (err: any) {
      console.error("[Admin Activation Error]", err);
      toast("Error activating merchant: " + (err.message || String(err)), "error");
    } finally {
      setActivating(false);
    }
  };

  const handleRegenerateQR = async () => {
    if (!verificationResult) return;
    const targetId = verificationResult.checkedId;
    try {
      const correctUrl = getPaymentUrl(targetId, "standard");
      const dataUrl = await QRCode.toDataURL(correctUrl, {
        width: 320,
        margin: 2,
        color: { dark: "#0c0e14", light: "#ffffff" }
      });
      setQrcodeDataUrl(dataUrl);
      toast("QR Code regenerated with correct businessId!", "success");
    } catch (err: any) {
      console.error("[Regenerate QR Error]", err);
      toast("Error generating QR code: " + (err.message || String(err)), "error");
    }
  };

  const fmtRWF = (amt: number) => {
    return new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(amt);
  };

  // 1. Subscribe to activations collection
  useEffect(() => {
    const q = query(collection(db, "activations"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: Activation[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Activation);
      });
      setActivations(list);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "activations");
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleDeauthorize = async (act: Activation) => {
    if (!window.confirm(`Are you sure you want to de-authorize and reset device binding for license ${act.licenseCode}? This will log the user out on that device.`)) {
      return;
    }
    try {
      if (!act.id) return;
      await updateDoc(doc(db, "activations", act.id), {
        deviceId: "",
        deviceName: "Unassigned Device Node",
        status: "reset"
      });
      toast(`License ${act.licenseCode} de-authorized and device binding cleared.`, "success");
    } catch (err: any) {
      toast(err.message || "Failed to clear hardware lock.", "error");
    }
  };

  const handleToggleStatus = async (act: Activation) => {
    try {
      if (!act.id) return;
      const nextStatus = act.status === "active" ? "expired" : "active";
      await updateDoc(doc(db, "activations", act.id), {
        status: nextStatus
      });
      toast(`License status toggled to ${nextStatus.toUpperCase()}`, "info");
    } catch (err: any) {
      toast(err.message || "Status toggle failed.", "error");
    }
  };

  const handleDeleteLicense = async (act: Activation) => {
    if (!window.confirm(`Permanently destroy license key ${act.licenseCode}? This is irreversible.`)) {
      return;
    }
    try {
      if (!act.id) return;
      await deleteDoc(doc(db, "activations", act.id));
      toast(`License ${act.licenseCode} purged from Firestore permanently.`, "success");
    } catch (err: any) {
      toast("Purge failed: " + err.message, "error");
    }
  };

  // Derived metrics
  const activeSubs = activations.filter((a) => a.status === "active");
  const expiredSubs = activations.filter((a) => a.status === "expired" || (a.expiresAt && new Date(a.expiresAt.toDate ? a.expiresAt.toDate() : a.expiresAt) < new Date()));
  const totalVolume = activations.reduce((sum, a) => sum + (a.amountPaid || 0), 0);
  
  const filtered = activations.filter((a) => 
    a.licenseCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.planName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.deviceId && a.deviceId.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      
      {/* Top statistics cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            title: "Active Licenses",
            value: activeSubs.length.toString(),
            sub: "Unlocked hardware terminals",
            icon: ShieldCheck,
            color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/15"
          },
          {
            title: "Expired Subscriptions",
            value: expiredSubs.length.toString(),
            sub: "Requires billing renewal",
            icon: AlertCircle,
            color: "text-red-400 bg-red-500/10 border-red-500/15"
          },
          {
            title: "Total SaaS Revenue",
            value: fmtRWF(totalVolume),
            sub: "MTN, USSD & Cards processed",
            icon: Coins,
            color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/15"
          },
          {
            title: "Binding Terminals",
            value: activations.filter((a) => a.deviceId).length.toString(),
            sub: "Mac/iOS/Android fingers",
            icon: Cpu,
            color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/15"
          }
        ].map((item, id) => {
          const IconComponent = item.icon;
          return (
            <div key={id} className="p-5 bg-[#11141C] border border-white/5 rounded-2xl flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{item.title}</span>
                <span className="text-xl font-bold font-mono text-white block">{item.value}</span>
                <span className="text-[11px] text-[#FFC107] font-medium block">{item.sub}</span>
              </div>
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${item.color}`}>
                <IconComponent size={20} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Verify Merchant QR Admin Panel */}
      <div className="bg-[#11141C] border border-white/5 rounded-[24px] p-6 space-y-4">
        <div>
          <h3 className="text-base font-extrabold text-white uppercase font-sans flex items-center gap-2">
            <ShieldCheck className="text-[#FFC107]" size={18} /> Verify Merchant QR
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Audit merchant registry existences, verify QR route validity, and read live active status signatures.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Enter Merchant ID (e.g., GP-D1XF)..."
            value={verifyMerchantId}
            onChange={(e) => setVerifyMerchantId(e.target.value)}
            className="flex-1 bg-[#151922] border border-white/10 rounded-xl py-2.5 px-4 text-xs text-white outline-none focus:border-[#FFC107] transition-colors font-mono"
          />
          <button
            onClick={handleVerifyQR}
            disabled={verifying}
            className="px-5 py-2.5 bg-[#1B32FF] hover:brightness-110 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 font-sans"
          >
            {verifying ? <RefreshCw className="animate-spin" size={13} /> : <Terminal size={13} />}
            {verifying ? "Auditing..." : "Verify QR"}
          </button>
        </div>

        {verificationResult && (
          <div id="admin-qr-verify-result" className="p-4 bg-white/[0.01] border border-white/5 rounded-xl space-y-3.5 animate-fade-in text-xs">
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
              <span className="font-mono text-[10px] uppercase text-slate-500 font-bold tracking-wider">Audit Result Summary</span>
              <span className={`font-bold px-2 py-0.5 rounded text-[9.5px] uppercase ${
                verificationResult.isActive 
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15" 
                  : "bg-red-500/10 text-red-500 border border-red-500/15"
              }`}>
                {verificationResult.isActive ? "Live & active" : "Inactive / Error"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] font-mono">
              <div className="p-2.5 bg-white/[0.01] border border-white/5 rounded-lg">
                <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Firestore businesses:</span>
                <span className={`font-bold block mt-1 ${verificationResult.existsInBusinesses ? "text-emerald-400" : "text-red-400"}`}>
                  {verificationResult.existsInBusinesses ? "● Found" : "○ Not Found"}
                </span>
              </div>
              
              <div className="p-2.5 bg-white/[0.01] border border-white/5 rounded-lg">
                <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Firestore clients:</span>
                <span className={`font-bold block mt-1 ${verificationResult.existsInClients ? "text-emerald-400" : "text-red-400"}`}>
                  {verificationResult.existsInClients ? "● Found" : "○ Not Found"}
                </span>
              </div>

              <div className="p-2.5 bg-white/[0.01] border border-white/5 rounded-lg">
                <span className="text-slate-500 block text-[9px] uppercase tracking-wider">QR Route Route:</span>
                <span className={`font-bold block mt-1 ${verificationResult.existsInBusinesses || verificationResult.existsInClients ? "text-[#00D68F]" : "text-rose-500"}`}>
                  {verificationResult.existsInBusinesses || verificationResult.existsInClients ? "✓ Valid (/pay/" + verificationResult.checkedId + ")" : "✗ Invalid Route"}
                </span>
              </div>
            </div>

            <p className="text-[11px] leading-relaxed font-sans font-semibold text-slate-300 bg-white/[0.02] p-3 rounded-lg border border-white/5">
              {verificationResult.message}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                id="btn-admin-activate-merchant"
                onClick={handleActivateMerchant}
                disabled={activating}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer font-sans"
              >
                {activating ? <RefreshCw className="animate-spin" size={13} /> : <ShieldCheck size={13} />}
                Activate Merchant
              </button>

              <button
                id="btn-admin-regenerate-qr"
                onClick={handleRegenerateQR}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer font-sans"
              >
                Regenerate QR with correct businessId
              </button>
            </div>

            {qrcodeDataUrl && (
              <div id="regenerated-qr-preview" className="mt-4 p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center justify-center space-y-3 animate-fade-in text-center">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-widest block">Regenerated High-Res QR Code</span>
                <div className="bg-white p-3 rounded-2xl inline-block shadow-lg">
                  <img src={qrcodeDataUrl} alt="Regenerated QR Code" className="w-[180px] h-[180px]" referrerPolicy="no-referrer" />
                </div>
                <div className="text-center space-y-1.5">
                  <p className="text-[11px] text-slate-400 font-mono tracking-wide break-all">
                    Route: <span className="text-[#FFC107] font-semibold">{window.location.origin}/pay/{verificationResult.checkedId}</span>
                  </p>
                  <a
                    href={qrcodeDataUrl}
                    download={`QR_GeraPay_${verificationResult.checkedId}.png`}
                    className="inline-block px-4 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg text-[10px] font-mono font-bold transition-all"
                  >
                    📥 Download QR Stamp PNG
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Database section */}
      <div className="bg-[#11141C] border border-white/5 rounded-[24px] p-6 space-y-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-base font-extrabold text-white uppercase font-sans">Licensing & Hardware locks registry</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Administer subscription tokens and break hardware associations for offline stores.</p>
          </div>
          
          <div className="relative w-full md:w-72">
            <span className="absolute left-3 top-2.5 text-slate-500">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder="Filter by License, Email or Device ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#151922] border border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs text-white outline-none focus:border-[#FFC107] transition-colors font-mono"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500 font-mono flex items-center justify-center gap-2">
            <RefreshCw className="animate-spin text-[#1B32FF]" size={15} /> Loading Gera Flow Licences Registry...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 bg-white/[0.01] rounded-2xl border border-white/5 text-center text-xs text-slate-500">
            No active or unassigned licensing agreements matching query was found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 font-mono border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                  <th className="py-3 px-2">License Key</th>
                  <th className="py-3 px-2">Subscriber Email</th>
                  <th className="py-3 px-2">Plan Details</th>
                  <th className="py-3 px-2">Hardware Binding</th>
                  <th className="py-3 px-2">Validity Lock</th>
                  <th className="py-3 px-2">Licence Code Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {filtered.map((act) => {
                  const createdDate = act.createdAt?.toDate ? act.createdAt.toDate() : new Date(act.createdAt);
                  const expiresAt = act.expiresAt?.toDate ? act.expiresAt.toDate() : new Date(act.expiresAt);
                  const isExpired = expiresAt < new Date() || act.status === "expired";

                  // Method indicator icon
                  let MethodIcon = Smartphone;
                  if (act.paymentMethod === "ussd") MethodIcon = Terminal;
                  if (act.paymentMethod === "card") MethodIcon = CreditCard;

                  return (
                    <tr key={act.id} className="hover:bg-white/[0.01] transition-colors">
                      {/* License */}
                      <td className="py-3.5 px-2">
                        <span className="font-black text-[#FFC107] tracking-wider block">{act.licenseCode}</span>
                        <span className="text-[9px] text-slate-500 block">Is: {act.billingCycle} cycle</span>
                      </td>

                      {/* User email */}
                      <td className="py-3.5 px-2">
                        <span className="text-white block font-sans truncate max-w-[150px]">{act.userEmail}</span>
                        <span className="text-[9px] text-slate-500 block">UID: {act.userId.slice(0, 8)}...</span>
                      </td>

                      {/* Plan */}
                      <td className="py-3.5 px-2">
                        <span className="text-[#1B32FF] font-bold block">{act.planName}</span>
                        <span className="text-[9px] text-[#00D68F] font-semibold flex items-center gap-1">
                          <MethodIcon size={11} /> {fmtRWF(act.amountPaid)} Paid
                        </span>
                      </td>

                      {/* Hard lock */}
                      <td className="py-3.5 px-2">
                        {act.deviceId ? (
                          <div>
                            <span className="text-slate-200 block truncate max-w-[120px] font-bold">{act.deviceName}</span>
                            <span className="text-[9px] text-indigo-400 font-bold tracking-wide">LOCK_ID: {act.deviceId}</span>
                          </div>
                        ) : (
                          <span className="p-1 px-1.5 bg-yellow-500/10 text-yellow-500 rounded text-[9px] font-black uppercase">
                            UNBOUND DESKTOP
                          </span>
                        )}
                      </td>

                      {/* Validity Lock */}
                      <td className="py-3.5 px-2">
                        <div className="space-y-0.5">
                          <span className={`text-[9.5px] uppercase font-bold px-1.5 py-0.5 rounded leading-none inline-block ${
                            isExpired 
                              ? "bg-red-500/10 text-red-400 border border-red-500/15" 
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
                          }`}>
                            {isExpired ? "EXPIRED" : "ACTIVE"}
                          </span>
                          <span className="text-[9px] text-slate-500 block">
                            EXP: {expiresAt.toLocaleDateString()}
                          </span>
                        </div>
                      </td>

                      {/* Control buttons */}
                      <td className="py-3.5 px-2">
                        <div className="flex gap-2">
                          <button
                            title="Remote Reset Binding (Unbind Phone)"
                            onClick={() => handleDeauthorize(act)}
                            disabled={!act.deviceId}
                            className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/15 rounded-lg active:scale-95 transition-all text-xs disabled:opacity-40"
                          >
                            <UserX size={13} />
                          </button>
                          
                          <button
                            title="Toggle Expired/Active State"
                            onClick={() => handleToggleStatus(act)}
                            className="p-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-[#FFC107] border border-yellow-500/15 rounded-lg active:scale-95 transition-all text-xs"
                          >
                            <Clock size={13} />
                          </button>

                          <button
                            title="Delete License Permanently"
                            onClick={() => handleDeleteLicense(act)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/15 rounded-lg active:scale-95 transition-all text-xs"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
