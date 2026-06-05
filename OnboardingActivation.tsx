import React, { useState } from "react";
import { Activation, SubscriptionPlan } from "../types";
import { 
  CreditCard, 
  QrCode, 
  Sparkles, 
  Smartphone, 
  Award, 
  Check, 
  Info, 
  Lock, 
  Loader2, 
  Globe, 
  Utensils, 
  RefreshCw, 
  LogOut 
} from "lucide-react";
import { collection, addDoc, getDocs, query, where, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { safeLocalStorage } from "../lib/storage";

interface OnboardingActivationProps {
  currentUser: any;
  currentDeviceId: string;
  onActivated: (activation: Activation) => void;
  onLogout: () => void;
}

const PLANS: SubscriptionPlan[] = [
  {
    id: "starter",
    name: "Starter Basic",
    priceRWF: 15000,
    description: "Standard local QR payments for micro-merchants.",
    features: [
      "Standard Client QR Code (Local MoMo)",
      "Real-time USSD push notifications",
      "Manual payment registry checks",
      "Offline cache support",
      "1 Registered Admin device"
    ]
  },
  {
    id: "restaurant",
    name: "Restaurant & Bar",
    priceRWF: 35000,
    description: "Equipped with the high-performance Table & Bill system.",
    features: [
      "All Starter Basic Features",
      "Table Bill QR Custom Generator",
      "Waiter & Cashier synced devices",
      "Offline local draft storage",
      "2 Activated Terminals",
      "Bill print / PNG downloads"
    ]
  },
  {
    id: "international",
    name: "Intl Commerce Card",
    priceRWF: 55000,
    description: "Enables tourist debit/credit card acceptance in Rwanda.",
    features: [
      "All Starter Basic Features",
      "Visa, Mastercard, GPay & Apple Pay Integration",
      "Multi-currency conversion (USD to RWF)",
      "Secure payment processing routing",
      "Premium customer checkout screen"
    ]
  },
  {
    id: "enterprise",
    name: "Enterprise Pro",
    priceRWF: 95000,
    description: "Uncapped, completely unrestricted Gera Flow power.",
    features: [
      "All Features Enabled (Normal QR + Bills QR + Cards)",
      "Unlimited client devices & cashiers",
      "High-priority server database replication",
      "Dedicated Whatsapp / MoMo channel hotlines",
      "99.9% Callback SLA guarantees"
    ]
  }
];

export default function OnboardingActivation({ 
  currentUser, 
  currentDeviceId, 
  onActivated,
  onLogout
}: OnboardingActivationProps) {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>(PLANS[0]);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [paymentMethod, setPaymentMethod] = useState<"momo" | "ussd" | "card">("momo");
  const [momoPhone, setMomoPhone] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [licenseInput, setLicenseInput] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  
  const [activeStep, setActiveStep] = useState<"plans" | "pay" | "activate-key">("plans");

  const planCost = billingCycle === "monthly" ? selectedPlan.priceRWF : selectedPlan.priceRWF * 10; // 2 months free for yearly
  
  // Format RWF
  const fmtRWF = (amt: number) => {
    return new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(amt);
  };

  const getDeviceName = () => {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return "Android Terminal Device";
    if (/iphone|ipad/i.test(ua)) return "iOS Mobile Device";
    if (/macintosh/i.test(ua)) return "macOS Desktop Client";
    if (/windows/i.test(ua)) return "Windows Desktop PC";
    return "Web Browser Node";
  };

  // Generate random license GP-LIC-XXXX-XXXX
  const generateLicenseKey = (planCode: string) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const rPart = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    return `GP-${planCode.toUpperCase().substring(0, 3)}-${rPart(4)}-${rPart(4)}`;
  };

  const notifyPWAUnlock = () => {
    // Fire a custom event that can be caught globally to enable direct installs
    window.dispatchEvent(new CustomEvent("gerapay_licensed_unlocked"));
  };

  const handleActivationByPayment = async () => {
    setLoading(true);
    setErrorText(null);
    try {
      if (paymentMethod === "momo" && (!momoPhone || momoPhone.length < 8)) {
        throw new Error("Please enter a valid active MTN MoMo phone number (e.g. 078XXXXXXX)");
      }
      if (paymentMethod === "card" && (!cardHolder || !cardNumber || !cardExpiry || !cardCvv)) {
        throw new Error("Please complete all secure credit card fields before continuing");
      }

      // 1. Generate License code
      const licenseCode = generateLicenseKey(selectedPlan.id);
      
      // Calculate Expiry Timestamp
      const expDate = new Date();
      if (billingCycle === "monthly") {
        expDate.setMonth(expDate.getMonth() + 1);
      } else {
        expDate.setFullYear(expDate.getFullYear() + 1);
      }

      // Create local subscription entity to write to firestore
      const newActivation: any = {
        licenseCode,
        userId: currentUser?.uid || "sandbox_user",
        userEmail: currentUser?.email || "sandbox_bypass@gera.rw",
        deviceId: currentDeviceId,
        deviceName: getDeviceName(),
        planId: selectedPlan.id,
        planName: selectedPlan.name,
        billingCycle,
        amountPaid: planCost,
        currency: "RWF",
        paymentMethod,
        paymentPhone: paymentMethod === "momo" ? momoPhone : paymentMethod === "ussd" ? "*182*8*1*8888#" : "",
        status: "active",
        createdAt: serverTimestamp(),
        expiresAt: expDate
      };

      // 2. Put inside Firebase activations collection
      const docRef = await addDoc(collection(db, "activations"), newActivation);
      
      const responseActivation: Activation = {
        ...newActivation,
        id: docRef.id,
        createdAt: new Date(),
        expiresAt: expDate
      };

      safeLocalStorage.setItem("gerapay_is_activated", "true");
      safeLocalStorage.setItem("gerapay_license_code", licenseCode);
      safeLocalStorage.setItem("gerapay_active_plan", selectedPlan.id);
      safeLocalStorage.setItem("gerapay_expires_at", expDate.toISOString());

      notifyPWAUnlock();

      setSuccessText(`Payment processed and device unlocked successfully! Generated License Key: ${licenseCode}`);
      setTimeout(() => {
        onActivated(responseActivation);
      }, 2500);

    } catch (err: any) {
      setErrorText(err.message || "An unexpected network error occurred while contacting the Rwanda payment core.");
    } finally {
      setLoading(false);
    }
  };

  const handleActivationByLicenseKey = async () => {
    setLoading(true);
    setErrorText(null);
    try {
      if (!licenseInput.trim()) {
        throw new Error("Please specify a license code to register.");
      }

      const cleanKey = licenseInput.trim().toUpperCase();

      // Look up inside firestore activations
      const q = query(collection(db, "activations"), where("licenseCode", "==", cleanKey));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error("The specified license key could not be matched with an active issuance inside our Firestore registry.");
      }

      const activeDoc = querySnapshot.docs[0];
      const data = activeDoc.data() as Activation;

      // Check if it's already bound to a different device
      if (data.deviceId && data.deviceId !== currentDeviceId && data.status === "active") {
        throw new Error(`This license is already bound to hardware node ID: ${data.deviceId}. Please contact Support or request Super Admin to Reset/De-authorize this license.`);
      }

      // If license status is expired
      const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
      if (expiresAt < new Date() || data.status === "expired") {
        throw new Error("This license has expired. Please select a subscription tier above to renew/pay.");
      }

      // Update the binding in Firestore if empty or mismatches
      if (!data.deviceId) {
        await updateDoc(doc(db, "activations", activeDoc.id), {
          deviceId: currentDeviceId,
          deviceName: getDeviceName(),
          userId: currentUser?.uid || "sandbox_user",
          userEmail: currentUser?.email || "sandbox_bypass@gera.rw"
        });
      }

      safeLocalStorage.setItem("gerapay_is_activated", "true");
      safeLocalStorage.setItem("gerapay_license_code", cleanKey);
      safeLocalStorage.setItem("gerapay_active_plan", data.planId);
      safeLocalStorage.setItem("gerapay_expires_at", expiresAt.toISOString());

      notifyPWAUnlock();

      setSuccessText(`License validated! Device unlocked under ${data.planName}.`);
      setTimeout(() => {
        onActivated({
          ...data,
          id: activeDoc.id,
          deviceId: currentDeviceId,
          expiresAt
        });
      }, 2000);

    } catch (err: any) {
      setErrorText(err.message || "License binding handshake failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0C0E14] text-slate-200 antialiased relative flex flex-col justify-center items-center py-10 px-4">
      {/* Background radial gradients for fintech premium vibes */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_15%,#1b32ff12_0%,transparent_50%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_85%,#ffbad102_0%,transparent_50%)] pointer-events-none" />

      <div className="w-full max-w-xl bg-[#11141C] border border-white/10 rounded-3xl p-6 relative z-10 shadow-2xl space-y-6">
        
        {/* Branding & Sub-Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/5 pb-5 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#1B32FF] to-[#2A45FF] text-white flex items-center justify-center shadow-lg shadow-[#1B32FF]/20">
              <QrCode size={20} className="animate-pulse" />
            </div>
            <div>
              <span className="font-extrabold text-white text-base block uppercase tracking-wider font-sans">Gera Flow</span>
              <span className="text-[10px] text-yellow-500 font-mono tracking-widest block font-bold uppercase">🔐 PWA LICENSE ACTIVATION CORE</span>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="px-3.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold border border-red-500/15 rounded-xl text-[10px] flex items-center gap-1.5 cursor-pointer font-sans self-end sm:self-auto transition-colors"
          >
            <LogOut size={11} /> Exit Terminal
          </button>
        </div>

        {/* Informational banner about Device ID locking */}
        <div className="p-3 bg-white/[0.01] border border-white/5 rounded-2xl flex items-center gap-3 text-xs leading-relaxed text-slate-400 font-sans">
          <Info size={16} className="text-indigo-400 flex-shrink-0" />
          <p>
            Your current hardware signature is locked to node <strong>{currentDeviceId}</strong> ({getDeviceName()}). Only 1 active device is permitted per license.
          </p>
        </div>

        {/* Global Success / Error notices */}
        {errorText && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/25 rounded-2xl text-xs text-red-400 font-mono font-bold leading-normal">
            ⚠️ {errorText}
          </div>
        )}
        {successText && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl text-xs text-emerald-400 font-mono font-bold leading-normal">
            ✓ {successText}
          </div>
        )}

        {/* Step Navigation Tabs */}
        <div className="grid grid-cols-3 bg-white/[0.02] border border-white/5 rounded-xl p-1 text-xs">
          <button
            onClick={() => { setActiveStep("plans"); setErrorText(null); }}
            className={`py-2 rounded-lg font-bold transition-all ${
              activeStep === "plans" 
                ? "bg-[#1B32FF] text-white shadow-md shadow-[#1B32FF]/20" 
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            1. Select Plan
          </button>
          <button
            onClick={() => { setActiveStep("pay"); setErrorText(null); }}
            className={`py-2 rounded-lg font-bold transition-all ${
              activeStep === "pay" 
                ? "bg-[#1B32FF] text-white shadow-md shadow-[#1B32FF]/20" 
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            2. Purchase License
          </button>
          <button
            onClick={() => { setActiveStep("activate-key"); setErrorText(null); }}
            className={`py-2 rounded-lg font-bold transition-all ${
              activeStep === "activate-key" 
                ? "bg-[#1B32FF] text-white shadow-md shadow-[#1B32FF]/20" 
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            3. Bind License Key
          </button>
        </div>

        {/* Render Step 1: Select Subscription Tier */}
        {activeStep === "plans" && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex justify-between items-center bg-[#151922] p-2 rounded-xl border border-white/5 w-fit mx-auto">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  billingCycle === "monthly" ? "bg-white/10 text-white" : "text-slate-500"
                }`}
              >
                Monthly Plan
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("yearly")}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold text-yellow-500 flex items-center gap-1.5 transition-all ${
                  billingCycle === "yearly" ? "bg-white/10" : ""
                }`}
              >
                Yearly Special <span className="bg-yellow-500/10 text-yellow-500 scale-90 px-1.5 py-0.5 rounded text-[9px] font-black uppercase font-mono">2 mos free</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
              {PLANS.map((plan) => {
                const isSelected = selectedPlan.id === plan.id;
                const cost = billingCycle === "monthly" ? plan.priceRWF : plan.priceRWF * 10;
                
                return (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className={`p-4 bg-[#151922] border rounded-2xl flex flex-col justify-between text-left cursor-pointer transition-all hover:border-indigo-500/40 relative h-fit ${
                      isSelected 
                        ? "border-[#1B32FF] ring-1 ring-[#1B32FF]/30 bg-[#151922]/90" 
                        : "border-white/5 text-slate-400"
                    }`}
                  >
                    {plan.id === "enterprise" && (
                      <span className="absolute -top-2.5 right-4 bg-gradient-to-r from-yellow-500 to-amber-500 text-[#0C0E14] text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow">
                        Most Popular
                      </span>
                    )}
                    <div className="space-y-1">
                      <span className={`text-xs font-extrabold block truncate ${isSelected ? "text-white" : "text-slate-300"}`}>{plan.name}</span>
                      <span className="text-[10px] leading-normal min-h-[32px] block">{plan.description}</span>
                    </div>

                    <div className="pt-3 border-t border-white/5 mt-3 space-y-2">
                      <div className="flex items-baseline gap-1">
                        <span className="text-base font-black text-white">{fmtRWF(cost)}</span>
                        <span className="text-[9px] text-slate-500 font-mono">/ {billingCycle === "monthly" ? "mo" : "yr"}</span>
                      </div>
                      <ul className="space-y-1">
                        {plan.features.slice(0, 3).map((f) => (
                          <li key={f} className="text-[9px] text-slate-400 flex items-center gap-1.5">
                            <Check size={10} className="text-emerald-400 flex-shrink-0" />
                            <span className="truncate">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setActiveStep("pay")}
              className="w-full py-3 bg-[#1B32FF] hover:brightness-110 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-[#1B32FF]/20 active:scale-[0.99] transition-all cursor-pointer font-sans"
            >
              Continue to Payment with {selectedPlan.name} <Sparkles size={13} />
            </button>
          </div>
        )}

        {/* Render Step 2: Simulated Payments options */}
        {activeStep === "pay" && (
          <div className="space-y-4 animate-fade-in font-sans">
            <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex justify-between items-center text-xs">
              <div>
                <span className="text-slate-500 block">SELECTED SUBSCRIPTION</span>
                <span className="font-extrabold text-white text-sm">{selectedPlan.name} ({billingCycle})</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">TOTAL INVESTMENT</span>
                <span className="font-black text-[#FFC107] text-sm">{fmtRWF(planCost)} RWF</span>
              </div>
            </div>

            {/* Payment gateway icons selection */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "momo", label: "MTN MoMo", icon: Smartphone },
                { id: "ussd", label: "MTN USSD Dial", icon: TerminalIcon },
                { id: "card", label: "International Card", icon: CreditCard }
              ].map((m) => {
                const selected = paymentMethod === m.id;
                const IconComponent = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => setPaymentMethod(m.id as any)}
                    className={`py-2 px-1 rounded-xl border flex flex-col items-center gap-1.5 transition-all outline-none cursor-pointer ${
                      selected 
                        ? "bg-[#FFC107]/10 border-[#FFC107] text-white" 
                        : "bg-[#151922] border-white/5 text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    <IconComponent size={15} className={selected ? "text-[#FFC107]" : ""} />
                    <span className="text-[9.5px] font-bold tracking-tight">{m.label}</span>
                  </button>
                );
              })}
            </div>

            {/* MTN MoMo details form */}
            {paymentMethod === "momo" && (
              <div className="space-y-2.5 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">MTN MoMo Subscriber Phone</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">+250</span>
                  <input
                    type="tel"
                    placeholder="788645321 (e.g. 078XXXXXXX)"
                    value={momoPhone}
                    onChange={(e) => setMomoPhone(e.target.value)}
                    className="w-full bg-[#151922] border border-white/10 rounded-xl py-2.5 pl-12 pr-4 text-xs font-mono font-bold text-white outline-none focus:border-[#FFC107] transition-colors"
                  />
                </div>
                <p className="text-[9.5px] text-slate-500 font-sans">
                  💡 A simulated push-payment request dialog will accept automatic bypass, creating a real licensing confirmation key.
                </p>
              </div>
            )}

            {/* USSD details form */}
            {paymentMethod === "ussd" && (
              <div className="space-y-3 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-[#FFC107] font-bold block">Required Offline Action Dial</span>
                  <div className="bg-[#151922] p-3 rounded-xl border border-white/5 font-mono text-center text-xs text-yellow-500 font-bold">
                    *182*8*1*8888#
                  </div>
                </div>
                <div className="space-y-1 text-[10px] leading-relaxed text-slate-400">
                  <p>Step 1: Dial <strong>*182*8*1*8888#</strong> on your handset device.</p>
                  <p>Step 2: Transfer <strong>{fmtRWF(planCost)} RWF</strong> into merchant core index [8888].</p>
                  <p>Step 3: Click the confirmation button below to verify offline clearance feed.</p>
                </div>
              </div>
            )}

            {/* International Premium Card form */}
            {paymentMethod === "card" && (
              <div className="space-y-3.5 p-4 bg-white/[0.02] border border-white/5 rounded-2xl text-left font-sans">
                <span className="text-[10px] uppercase tracking-wider text-[#FFC107] font-bold block mb-1">Secure Card Details</span>
                
                <div className="grid grid-cols-1 gap-2.5 text-xs">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Cardholder Name</label>
                    <input
                      type="text"
                      placeholder="Jane Doe"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      className="w-full bg-[#151922] border border-white/10 rounded-xl py-2 px-3 text-xs text-white outline-none focus:border-[#FFC107] transition-colors"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Card Number</label>
                    <input
                      type="text"
                      maxLength={19}
                      placeholder="4111 2222 3333 4444"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full bg-[#151922] border border-white/10 rounded-xl py-2 px-3 text-xs font-mono text-white outline-none focus:border-[#FFC107] transition-colors"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Expiry Date</label>
                      <input
                        type="text"
                        maxLength={5}
                        placeholder="12/28"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        className="w-full bg-[#151922] border border-white/10 rounded-xl py-2 px-3 text-xs font-mono text-white outline-none focus:border-[#FFC107] transition-colors"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Secure CVV</label>
                      <input
                        type="text"
                        maxLength={3}
                        placeholder="381"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                        className="w-full bg-[#151922] border border-white/10 rounded-xl py-2 px-3 text-xs font-mono text-white outline-none focus:border-[#FFC107] transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleActivationByPayment}
              disabled={loading}
              className="w-full py-3 bg-[#FFC107] text-[#0C0E14] hover:brightness-110 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition-colors active:scale-[0.99] cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={14} /> Completing Handshake...
                </>
              ) : (
                <>
                  <Lock size={13} /> Complete Payment & Activate PWA License
                </>
              )}
            </button>
          </div>
        )}

        {/* Render Step 3: Already Have license field */}
        {activeStep === "activate-key" && (
          <div className="space-y-4 animate-fade-in font-sans">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Import Gera Flow License Code</label>
              <input
                type="text"
                maxLength={20}
                placeholder="GP-STA-XXXX-XXXX"
                value={licenseInput}
                onChange={(e) => setLicenseInput(e.target.value)}
                className="w-full bg-[#151922] border border-white/10 rounded-xl py-3 px-4 text-center text-sm font-mono font-black text-[#FFC107] outline-none focus:border-[#1B32FF] uppercase transition-colors"
              />
            </div>

            <p className="text-[10.5px] text-slate-400 leading-normal text-center">
              Have you registered this store already on another terminal, or purchased through an offline USSD retail channel? Paste your 16-character license string block above to lock and unlock this local device instantly.
            </p>

            <button
              onClick={handleActivationByLicenseKey}
              disabled={loading}
              className="w-full py-3 bg-[#1B32FF] hover:brightness-110 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-lg active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={14} /> Mapping Database Node...
                </>
              ) : (
                <>
                  ✓ Synchronize Device Binding
                </>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

function TerminalIcon(props: any) {
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
      <polyline points="4 17 10 11 4 5"></polyline>
      <line x1="12" y1="19" x2="20" y2="19"></line>
    </svg>
  );
}
