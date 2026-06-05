import React, { useState, useEffect } from "react";
import { doc, getDoc, collection, query, where, getDocs, onSnapshot, addDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Bill } from "../types";
import { 
  Utensils, 
  MapPin, 
  Receipt, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Phone, 
  Check, 
  Copy, 
  ExternalLink,
  Star
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { safeCopyToClipboard } from "../lib/storage";

interface CustomerBillPageProps {
  billIdParam: string;
  onAdminBack?: () => void;
}

export default function CustomerBillPage({ billIdParam, onAdminBack }: CustomerBillPageProps) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [merchantMomoCode, setMerchantMomoCode] = useState("223344");
  const [copied, setCopied] = useState(false);

  // Customer Feedback States
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // Sync and check if customer already gave feedback on this bill
  useEffect(() => {
    if (bill?.billId) {
      const isSubmitted = localStorage.getItem(`gerapay_feedback_submitted_${bill.billId}`) === "true";
      setFeedbackSubmitted(isSubmitted);
      if (isSubmitted) {
        const savedRating = localStorage.getItem(`gerapay_feedback_rating_${bill.billId}`);
        if (savedRating) {
          setRating(parseInt(savedRating, 10));
        }
      }
    }
  }, [bill?.billId]);

  const handleSubmitFeedback = async () => {
    if (!bill) return;
    if (rating < 1) {
      return; // Rating is mandatory
    }

    setSubmittingFeedback(true);
    try {
      await addDoc(collection(db, "customerFeedback"), {
        rating,
        feedbackMessage: feedbackMessage.trim(),
        billId: bill.billId,
        businessId: bill.clientId,
        businessName: bill.businessName,
        tableNumber: bill.tableNumber,
        customerName: bill.customerName || "Anonymous",
        paymentStatus: "paid",
        billAmount: bill.totalAmount,
        createdAt: new Date().toISOString()
      });

      localStorage.setItem(`gerapay_feedback_submitted_${bill.billId}`, "true");
      localStorage.setItem(`gerapay_feedback_rating_${bill.billId}`, String(rating));
      setFeedbackSubmitted(true);
    } catch (err) {
      console.error("Error submitting customer feedback to database:", err);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // Poll or set up a listener on the current bill document with robust retry logic for unstable mobile networks
  useEffect(() => {
    let unsubscribe: () => void = () => {};
    setError("");
    setLoading(true);

    const loadBillWithRetry = async (retriesLeft = 3, delayMs = 1500): Promise<void> => {
      console.log(`[GeraPay Bill Lookup] Fetching bill details: "${billIdParam}" (Attempts left: ${retriesLeft})`);
      try {
        // 1. Try to fetch as direct Firestore document ID
        const directRef = doc(db, "bills", billIdParam);
        const directSnap = await getDoc(directRef);
        
        if (directSnap.exists()) {
          console.log(`[GeraPay Bill Lookup] SUCCESS: Found matching bill by direct Firestore doc ID: "${billIdParam}"`);
          unsubscribe = onSnapshot(directRef, (snapshot) => {
            if (snapshot.exists()) {
              setBill({ id: snapshot.id, ...snapshot.data() } as Bill);
            }
          });
          setLoading(false);
          return;
        }

        // 2. Otherwise search by billId custom string field (e.g. "BILL-123456")
        console.log(`[GeraPay Bill Lookup] Direct doc ID mapping returned empty. Querying fallback fields for "${billIdParam}"...`);
        const q = query(collection(db, "bills"), where("billId", "==", billIdParam));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
          const docId = snap.docs[0].id;
          console.log(`[GeraPay Bill Lookup] SUCCESS: Found matching bill via query map, resolving doc: "${docId}"`);
          
          unsubscribe = onSnapshot(doc(db, "bills", docId), (snapshot) => {
            if (snapshot.exists()) {
              setBill({ id: snapshot.id, ...snapshot.data() } as Bill);
            }
          });
          setLoading(false);
          return;
        }

        // Neither direct ID nor custom fields mapped to a document
        console.warn(`[GeraPay Bill Lookup] FAILED: No record matches identifier "${billIdParam}" inside Firestore.`);
        setError("bill not found - This bill does not exist or has been archived. Please request a new QR from your cashier.");
        if (typeof window !== "undefined" && (window as any).triggerAIMonitorLog) {
          (window as any).triggerAIMonitorLog(
            "bill_missing",
            `Requested bill ID "${billIdParam}" was scanned by customer but not resolved inside Firestore bills collection.`,
            "high"
          );
        }
        setLoading(false);
      } catch (err: any) {
        console.error(`[GeraPay Bill Lookup] Error occurred during attempt for "${billIdParam}":`, err);
        const errMsg = err?.message || String(err);
        const isPermissionDenied = errMsg.includes("permission") || err?.code === "permission-denied";
        const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

        if (isPermissionDenied) {
          setError(`FIRESTORE PERMISSION DENIED: Restricted access on collection 'bills' for identifier '${billIdParam}'. Access rules audit failed.`);
          if (typeof window !== "undefined" && (window as any).triggerAIMonitorLog) {
            (window as any).triggerAIMonitorLog(
              "firestore_error",
              `Firestore read denied on collection 'bills' for bill ID "${billIdParam}". Context: public bill scanner.`,
              "critical"
            );
          }
          setLoading(false);
          return;
        }

        if (retriesLeft > 1) {
          console.log(`[GeraPay Bill Lookup] Retrying connection in ${delayMs}ms to overcome packet loss...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return loadBillWithRetry(retriesLeft - 1, delayMs * 1.5);
        }

        if (isOffline) {
          setError("network timeout - Offline mode detected. Please enable your cellular data (3G/4G/5G) or Wi-Fi to load your bill.");
          if (typeof window !== "undefined" && (window as any).triggerAIMonitorLog) {
            (window as any).triggerAIMonitorLog(
              "network_timeout",
              "Offline state detected on cellular network during bill scan lookup sequence.",
              "low"
            );
          }
        } else {
          setError(`network timeout - A connection timeout occurred with Google Firestore servers. Detail: ${errMsg}`);
          if (typeof window !== "undefined" && (window as any).triggerAIMonitorLog) {
            (window as any).triggerAIMonitorLog(
              "firestore_error",
              `Firestore server connection timed out while querying bill ID "${billIdParam}". Detail: ${errMsg}`,
              "medium"
            );
          }
        }
        setLoading(false);
      }
    };

    loadBillWithRetry();
    return () => unsubscribe();
  }, [billIdParam]);

  // Dynamically resolve merchant's real MoMo Code from clients collection
  useEffect(() => {
    if (!bill || !bill.clientId) return;
    const fetchClientMomo = async () => {
      try {
        const q = query(collection(db, "clients"), where("clientId", "==", bill.clientId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const clientData = snap.docs[0].data();
          if (clientData && clientData.momoCode) {
            setMerchantMomoCode(clientData.momoCode);
          }
        }
      } catch (e) {
        console.warn("Error fetching merchant momoCode", e);
      }
    };
    fetchClientMomo();
  }, [bill]);

  const fmtRWF = (amt: number) => {
    return `FRW ${amt.toLocaleString()}`;
  };

  if (loading) {
    return (
      <div id="bill-loading-screen" className="min-h-screen bg-[#0C0E14] text-slate-200 flex flex-col items-center justify-center p-4 font-sans select-none relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#1b32ff12_0%,transparent_60%)] pointer-events-none" />
        
        <div className="w-full max-w-sm text-center space-y-6 relative z-10 flex flex-col items-center animate-fade-in">
          <div className="relative">
            <img src="/gera-pay-qr-logo.svg" alt="Gera Flow" className="w-16 h-16 object-contain rounded-2xl shadow-xl animate-pulse" />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-[#1B32FF] shadow">
              <RefreshCw size={10} className="animate-spin" />
            </div>
          </div>
          
          <div className="space-y-1.5 animate-pulse">
            <h1 className="text-lg font-black text-white tracking-tight uppercase">GERA FLOW BILLS</h1>
            <p className="text-xs text-[#FFC107] font-semibold leading-normal font-sans">
              Retrieving billing node specifications...
            </p>
            <p className="text-[10px] text-slate-500 font-mono">
              Resolving id: {billIdParam}
            </p>
          </div>
          
          <div className="w-24 h-0.5 bg-white/5 rounded-full overflow-hidden relative">
            <div className="absolute top-0 left-0 h-full w-1/3 bg-[#1B32FF] rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="min-h-screen bg-[#0C0E14] flex items-center justify-center text-white p-4 font-sans select-none relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#f43f5e08_0%,transparent_60%)] pointer-events-none" />
        
        <div className="w-full max-w-sm bg-[#11141C] border border-white/15 p-6 rounded-3xl text-center space-y-5 relative z-10 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 flex items-center justify-center mx-auto shadow-md">
            <AlertTriangle size={26} />
          </div>
          <div className="space-y-2">
            <h2 className="text-base font-black tracking-tight text-white uppercase font-sans">Bill Unavailable</h2>
            <div className="p-3.5 bg-zinc-950/50 border border-white/5 rounded-xl font-mono text-[11px] text-slate-300 leading-normal text-left break-words">
              {error || "Unknown system failure syncing remote billing document fields."}
            </div>
            <p className="text-[10.5px] text-slate-500 font-medium leading-relaxed font-sans mt-2">
              Please double check that the QR is clear and retry when signal restores, or ask your server/clerk to re-generate the receipt sticker.
            </p>
          </div>
          {onAdminBack && (
            <button 
              onClick={onAdminBack}
              className="w-full py-3 bg-[#1B32FF] hover:bg-[#1B32FF]/90 text-white rounded-xl text-xs font-bold transition-all active:scale-[0.98] cursor-pointer"
            >
              Return to Supervision Console
            </button>
          )}
        </div>
      </div>
    );
  }

  const isExpired = bill.status === "expired" || (bill.expiresAt && new Date(bill.expiresAt.toDate ? bill.expiresAt.toDate() : bill.expiresAt).getTime() < Date.now());

  return (
    <div className="min-h-screen bg-[#0C0E14] flex items-center justify-center p-4 relative antialiased text-slate-200 selection:bg-[#1B32FF] selection:text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,#1b32ff12_0%,transparent_50%)] pointer-events-none" />
      
      <div className="w-full max-w-md bg-[#11141C] border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative z-10">
        
        {/* Top Header representing Bar / Restaurant Identity */}
        <div className="p-5 bg-gradient-to-b from-[#151922] to-[#11141C] border-b border-white/5 text-center space-y-2 relative">
          {onAdminBack && (
            <button 
              onClick={onAdminBack}
              className="absolute left-4 top-5 px-2.5 py-1 bg-white/5 border border-white/5 hover:bg-white/15 rounded-lg text-[9px] font-mono font-bold uppercase cursor-pointer"
            >
              ← Back
            </button>
          )}

          <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-400/20 flex items-center justify-center text-[#FFC107] mx-auto shadow-sm">
            <Utensils size={18} />
          </div>
          <div>
            <span className="text-[9px] font-mono text-[#FFC107] font-black uppercase tracking-widest">ONE-TIME BILL CUSTOMER QR</span>
            <h2 className="text-base font-bold text-white mt-0.5">{bill.businessName}</h2>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/[0.02] border border-white/5 rounded-full text-[10px] text-slate-400 font-mono">
            <MapPin size={11} className="text-indigo-400" />
            <span>Kigali Branch</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-300 font-bold">{bill.tableNumber}</span>
          </div>
        </div>

        <AnimatePresence mode="wait">
          
          {/* SUCCESS SCREEN */}
          {bill.status === "paid" && (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 text-center space-y-6"
            >
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 text-[#00D68F] rounded-full flex items-center justify-center mx-auto animate-bounce mt-4">
                <CheckCircle size={36} />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-white font-sans uppercase">Bill Paid Successfully!</h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                  Thank you! Your payment of <strong className="text-emerald-400">{fmtRWF(bill.totalAmount)}</strong> has been processed securely. The waitstaff device has been updated.
                </p>
              </div>

              {/* Receipt metadata for audit */}
              <div className="p-4 bg-white/[0.01] border border-white/x rounded-2xl space-y-2 text-xs font-mono text-left">
                <div className="flex justify-between">
                  <span className="text-slate-500">Receipt Invoice:</span>
                  <span className="text-slate-300 font-bold">{bill.billId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Settlement:</span>
                  <span className="text-[#00D68F] font-bold">{fmtRWF(bill.totalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Method Authorized:</span>
                  <span className="text-slate-300 capitalize font-bold">MTN MoMo Offline</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Audit Status:</span>
                  <span className="text-emerald-400 font-bold">● CONFIRMED PAID</span>
                </div>
              </div>

              {/* FEEDBACK SECTION */}
              <div className="border-t border-white/5 pt-4 text-left">
                {!feedbackSubmitted ? (
                  <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl space-y-4 font-sans">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-black uppercase text-indigo-400 tracking-wider">How was your experience?</h4>
                      <p className="text-[10.5px] text-slate-400">We appreciate your feedback to help us serve you better.</p>
                    </div>

                    {/* Rating stars */}
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          className="p-1 focus:outline-none cursor-pointer transition-transform active:scale-90"
                        >
                          <Star
                            size={26}
                            className={`transition-all duration-150 ${
                              star <= (hoverRating || rating)
                                ? "text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.35)]"
                                : "text-slate-600 hover:text-slate-400"
                            }`}
                          />
                        </button>
                      ))}
                    </div>

                    {/* Comment text box */}
                    <div className="space-y-1">
                      <textarea
                        placeholder="Say something about our food, service, cleaniness..."
                        value={feedbackMessage}
                        onChange={(e) => setFeedbackMessage(e.target.value)}
                        rows={2.5}
                        className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-[#1B32FF] transition-all placeholder:text-slate-600 block resize-none"
                      />
                    </div>

                    {/* Submit Button */}
                    <button
                      type="button"
                      disabled={rating < 1 || submittingFeedback}
                      onClick={handleSubmitFeedback}
                      className={`w-full py-2.5 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 select-none ${
                        rating >= 1 
                          ? "bg-[#1B32FF] hover:bg-indigo-600 text-white shadow-md active:scale-95" 
                          : "bg-white/5 text-slate-500 cursor-not-allowed"
                      }`}
                    >
                      {submittingFeedback ? (
                        <>
                          <RefreshCw size={12} className="animate-spin text-white" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        "Submit Feedback"
                      )}
                    </button>
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-emerald-500/5 border border-emerald-500/15 p-4 rounded-xl text-center space-y-1"
                  >
                    <CheckCircle size={18} className="text-emerald-400 mx-auto" />
                    <h4 className="text-[11px] font-black uppercase text-emerald-400 tracking-wider">Thank you!</h4>
                    <p className="text-[10px] text-slate-300">
                      We've directly shared your rating with the supervisors. Have a nice day!
                    </p>
                  </motion.div>
                )}
              </div>

              <div className="pt-2 text-[10px] text-slate-500 font-mono italic">
                You can now close this payment window. Have a great day!
              </div>
            </motion.div>
          )}

          {/* EXPIRED OR CANCELLED BILLS */}
          {(isExpired || bill.status === "cancelled") && bill.status !== "paid" && (
            <motion.div 
              key="inactive"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-8 text-center space-y-5"
            >
              <div className="w-14 h-14 bg-red-500/10 border border-red-500/30 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <XCircle size={28} />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white uppercase">Invoice Out of Service</h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-[280px] mx-auto">
                  {bill.status === "cancelled" 
                    ? "This checkout transaction has been cancelled by the bar supervisor." 
                    : "This QR code contains an expired session lease. Please request the barista to generate a new billing QR."}
                </p>
              </div>
            </motion.div>
          )}

          {/* ACTIVE PAYMENT FLOW */}
          {bill.status === "unpaid" && !isExpired && (() => {
            const dialerURI = `tel:*182*8*1*${merchantMomoCode}*${bill.totalAmount}%23`;

            return (
              <motion.div 
                key="active-form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-5 space-y-5 font-sans"
              >
                {/* Consumed Products List */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      <Receipt size={11} className="text-indigo-400" /> Bill Summary
                    </span>
                    <span className="text-[9px] font-mono text-[#FFC107] uppercase font-bold bg-[#FFC107]/10 px-2.5 py-1 rounded-full border border-amber-500/15 animate-pulse">
                      Pending Payment
                    </span>
                  </div>

                  <div className="border border-white/5 bg-white/[0.01] rounded-2xl overflow-hidden font-mono text-[11px] divide-y divide-white/[0.03]">
                    {bill.items.map((item, index) => (
                      <div key={item.id || index} className="p-3.5 flex items-center justify-between gap-3 font-sans">
                        <div className="space-y-0.5 max-w-[210px]">
                          <span className="text-slate-200 block truncate font-bold text-xs">{item.name}</span>
                          <span className="text-slate-500 block text-[10px]">Qty: {item.qty} × {fmtRWF(item.price)}</span>
                        </div>
                        <span className="text-white font-mono font-bold text-xs">{fmtRWF(item.subtotal)}</span>
                      </div>
                    ))}

                    {/* Total lock amount box */}
                    <div className="p-4 bg-white/[0.02] space-y-1 font-sans">
                      <div className="flex justify-between items-center text-xs text-slate-400">
                        <span>Subtotal:</span>
                        <span className="font-mono text-xs">{fmtRWF(bill.subtotal)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-slate-400 pb-2 border-b border-white/5">
                        <span>Tax / VAT (inclusive):</span>
                        <span className="font-mono text-xs">FRW 0</span>
                      </div>
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Total Amount:</span>
                        <span className="text-lg font-black text-[#FFC107] font-mono leading-none">{fmtRWF(bill.totalAmount)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* MTN MoMo Action Section */}
                <div className="space-y-4 pt-1 border-t border-white/5 font-sans">
                  
                  {/* Single large primary button for both Android & iPhone */}
                  <a
                    href={dialerURI}
                    className="w-full py-4.5 bg-gradient-to-r from-yellow-400 to-[#FFC107] hover:brightness-110 active:scale-[0.98] text-black font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2.5 transition-all shadow-lg text-center cursor-pointer font-sans"
                  >
                    <Phone size={14} className="animate-pulse" /> Pay with MTN MoMo
                  </a>

                  {/* Brand Premium Security Warning Note */}
                  <div className="p-3.5 bg-yellow-500/[0.02] border border-yellow-500/10 rounded-2xl flex gap-2.5 items-start">
                    <AlertTriangle size={14} className="text-[#FFC107] flex-shrink-0 mt-0.5" />
                    <p className="text-[10.5px] text-slate-400 leading-relaxed font-sans font-medium">
                      Confirm payment only inside official MTN MoMo. Never share your PIN.
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })()}

        </AnimatePresence>

        {/* Brand footer bar inside frame */}
        <div className="py-4 border-t border-white/5 px-6 bg-zinc-900 flex justify-between items-center text-[10px] text-slate-500 font-mono">
          <span className="flex items-center gap-1.5 font-bold">
            <img src="/gera-pay-qr-logo.svg" alt="Gera Flow" className="w-4 h-4 object-contain rounded-[4px]" />
            SECURED BY GERA FLOW CO. Ltd
          </span>
          <span>© 2026 SERVICES • v-mobile-fix-1</span>
        </div>

      </div>
    </div>
  );
}
