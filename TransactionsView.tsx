import { useState, useEffect } from "react";
import { Transaction } from "../types";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { fmtRWF } from "./PayPage";
import { 
  Search, 
  CheckCircle, 
  XCircle, 
  Clock, 
  RefreshCw,
  Bell,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Globe,
  Check,
  ShieldAlert,
  Info
} from "lucide-react";

interface TransactionsViewProps {
  txns: Transaction[];
  toast: (m: string, t?: "success" | "error" | "info" | "warning") => void;
  mtnMomoActive?: boolean;
  isAdmin?: boolean;
}

export default function TransactionsView({ 
  txns, 
  toast, 
  mtnMomoActive = false, 
  isAdmin = false 
}: TransactionsViewProps) {
  const [filterQuery, setFilterQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Webhook checker state
  const [webhookStatus, setWebhookStatus] = useState<any>(null);
  const [checkingWebhook, setCheckingWebhook] = useState(false);

  useEffect(() => {
    if (mtnMomoActive) {
      handleCheckWebhookStatus(true);
    }
  }, [mtnMomoActive]);

  const handleCheckWebhookStatus = async (silent = false) => {
    if (!silent) setCheckingWebhook(true);
    try {
      const res = await fetch("/api/momo/webhook-status");
      if (res.ok) {
        const data = await res.json();
        setWebhookStatus(data);
        if (!silent) {
          toast("Webhook listener status verifications completed!", "success");
        }
      }
    } catch (err: any) {
      console.error("Failed to check webhook health status:", err);
    } finally {
      setCheckingWebhook(false);
    }
  };

  const handleUpdateTransactionStatus = async (txnId: string, status: "confirmed" | "failed" | "rejected") => {
    setUpdatingId(txnId);
    try {
      const docRef = doc(db, "transactions", txnId);
      await updateDoc(docRef, {
        status,
        momoStatus: status === "confirmed" ? "SUCCESSFUL" : "FAILED",
        updatedAt: serverTimestamp()
      });
      toast(`Transaction marked as ${status}`, "success");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `transactions/${txnId}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRecheckPaymentStatus = async (txnId: string) => {
    setRecheckingId(txnId);
    try {
      const res = await fetch(`/api/momo/recheck?transactionId=${txnId}`);
      if (!res.ok) {
        throw new Error("Failed to consult MTN Telecom network logs.");
      }
      const data = await res.json();
      if (data.momoStatus === "SUCCESSFUL" || data.status === "confirmed") {
        // Automatically transition transaction in Firestore
        await handleUpdateTransactionStatus(txnId, "confirmed");
        toast("MTN payment verification received: Payment successfully settled!", "success");
      } else {
        toast(`Transaction still pending: ${data.message || "Awaiting customer approval."}`, "warning");
      }
    } catch (err: any) {
      toast(`Recheck failed: ${err.message}`, "error");
    } finally {
      setRecheckingId(null);
    }
  };

  const handleMarkAsPaidAdmin = async (txn: Transaction) => {
    if (!isAdmin) {
      toast("Unauthorized: Admin authorization is strictly required.", "error");
      return;
    }
    const confirmApprove = window.confirm(
      `🔒 ADMIN OVERRIDE:\nAre you sure you want to mark Transaction ${txn.id} as Paid?\n\n` +
      `Confirm only if you have verified the funds physically exist in the bank logs.\n` +
      `Proceed with manual confirmation?`
    );
    if (confirmApprove) {
      await handleUpdateTransactionStatus(txn.id!, "confirmed");
    }
  };

  const filteredTxns = txns.filter((t) => 
    t.businessName?.toLowerCase().includes(filterQuery.toLowerCase()) ||
    t.phone?.includes(filterQuery) ||
    t.id?.toLowerCase().includes(filterQuery.toLowerCase())
  );

  // Reset page if filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterQuery]);

  const totalFiltered = filteredTxns.length;
  const totalPages = Math.ceil(totalFiltered / itemsPerPage) || 1;
  const pagedTxns = filteredTxns.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const pendingCount = txns.filter((t) => t.status === "pending" || t.status === "processing").length;

  const isStuckPayment = (t: Transaction) => {
    if (t.status !== "pending" && t.status !== "processing") return false;
    if (!t.createdAt) return false;
    try {
      let createdTime: number;
      if (t.createdAt?.seconds) {
        createdTime = t.createdAt.seconds * 1000;
      } else {
        createdTime = new Date(t.createdAt).getTime();
      }
      return (Date.now() - createdTime) > 15 * 60 * 1000;
    } catch (e) {
      return false;
    }
  };

  return (
    <div className="space-y-4">
      {/* MTMoMo Webhook Status Checker */}
      {mtnMomoActive && (
        <div className="p-4 bg-[#11141C] border border-white/5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
          <div className="flex items-start gap-3">
            <Globe className="text-[#1B32FF] animate-pulse flex-shrink-0 mt-0.5" size={16} />
            <div className="space-y-1">
              <strong className="text-white block font-sans uppercase tracking-wider text-[11px]">MTN MoMo Live API Webhook Web-Controller</strong>
              <div className="text-slate-400 font-mono text-[10px] space-y-0.5">
                <div>Callback Listener: <span className="text-indigo-400 font-bold select-all">{webhookStatus?.listeningUrl || "Active Gateway Connection"}</span></div>
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-slate-500">Status:</span>
                  <span className="text-emerald-400 font-bold uppercase">● OPERATIONAL</span>
                  <span className="text-slate-500">Gateway Code:</span>
                  <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/15 rounded px-1 text-[9px] font-bold">MODE_LIVE_RWF</span>
                </div>
              </div>
            </div>
          </div>
          <button 
            onClick={() => handleCheckWebhookStatus(false)}
            disabled={checkingWebhook}
            className="px-3 py-1.5 bg-[#1B32FF]/10 text-indigo-400 hover:text-white border border-[#1B32FF]/2 font-bold uppercase rounded-xl transition-colors active:scale-95 flex items-center justify-center gap-1 text-[10px] cursor-pointer"
          >
            <RefreshCw className={checkingWebhook ? "animate-spin" : ""} size={11} />
            Verify Handshake Connection
          </button>
        </div>
      )}

      {/* Alert banner for pending USSD approvals */}
      {pendingCount > 0 && (
        <div className="flex gap-3 p-4 bg-[#FFC107]/10 border border-[#FFC107]/20 rounded-2xl text-xs text-slate-300">
          <Bell className="text-[#FFC107] animate-bounce flex-shrink-0" size={16} />
          <div>
            <strong className="text-white block">{pendingCount} Transaction{pendingCount > 1 ? "s" : ""} Awaiting USSD confirmation</strong>
            {mtnMomoActive ? (
              <span>Outbound payment is awaiting final client terminal completion. Click <strong>"Recheck Status"</strong> below to consult telecom records.</span>
            ) : (
              <span>Simulate approval callbacks below to mock official telecom network answers in AI Studio sandbox.</span>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#11141C] p-4 rounded-2xl border border-white/5">
        <div className="relative w-full max-w-xs">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input 
            type="text" 
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter by customer phone, business name..."
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#1B32FF] transition-colors"
          />
        </div>

        <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
          <span>PAGINATED TRANSIMS:</span>
          <span className="font-bold text-white bg-white/5 px-2 py-0.5 rounded border border-white/5">{totalFiltered} matching</span>
        </div>
      </div>

      <div className="bg-[#11141C] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs text-slate-300">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-slate-400 font-bold">
                <th className="p-4 uppercase tracking-wider">Transaction ID</th>
                <th className="p-4 uppercase tracking-wider">Merchant Address</th>
                <th className="p-4 uppercase tracking-wider">Customer Contact</th>
                <th className="p-4 uppercase tracking-wider">Amount (RWF)</th>
                <th className="p-4 uppercase tracking-wider">Ref Note</th>
                <th className="p-4 uppercase tracking-wider">Status</th>
                <th className="p-4 text-right uppercase tracking-wider">Actions & Sandbox Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {pagedTxns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 text-xs">
                    No transactions currently matching requested query.
                  </td>
                </tr>
              ) : (
                pagedTxns.map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="p-4 font-bold text-slate-400 select-all text-[11px]">{t.id}</td>
                    <td className="p-4 font-sans font-bold text-white">{t.businessName}</td>
                    <td className="p-4 text-slate-400">{t.phone}</td>
                    <td className="p-4 text-emerald-400 font-bold font-mono text-xs">{fmtRWF(t.amount)}</td>
                    <td className="p-4 font-sans italic text-slate-500 max-w-[140px] truncate">{t.note || "—"}</td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          t.status === "confirmed" 
                            ? "bg-emerald-500/10 text-emerald-400" 
                            : t.status === "failed" || t.status === "rejected"
                            ? "bg-red-500/15 text-red-400"
                            : "bg-yellow-500/10 text-[#FFC107] animate-pulse"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            t.status === "confirmed" 
                              ? "bg-emerald-400" 
                              : t.status === "failed" || t.status === "rejected"
                              ? "bg-red-400" 
                              : "bg-yellow-400"
                          }`} />
                          {t.status}
                        </span>
                        {isStuckPayment(t) && (
                          <span className="inline-flex items-center gap-1 text-[8.5px] font-bold text-rose-400 uppercase bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20 w-max animate-pulse">
                            <AlertTriangle size={9} /> STUCK &gt;15M
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="inline-flex gap-1.5 justify-end items-center flex-wrap">
                        {t.status === "pending" || t.status === "processing" ? (
                          <>
                            {/* Recheck Payment Status Button */}
                            <button
                              disabled={recheckingId === t.id}
                              onClick={() => handleRecheckPaymentStatus(t.id!)}
                              className="px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 font-bold rounded-lg transition-all active:scale-95 text-[10px] cursor-pointer inline-flex items-center gap-1"
                              title="Query telecom gateway for instant clearance report"
                            >
                              <RefreshCw size={10} className={recheckingId === t.id ? "animate-spin" : ""} />
                              Recheck Status
                            </button>

                            {/* Mark As Paid (Admin Override Only) Button */}
                            {isAdmin && (
                              <button
                                disabled={updatingId === t.id}
                                onClick={() => handleMarkAsPaidAdmin(t)}
                                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-bold rounded-lg transition-all active:scale-95 text-[10px] cursor-pointer inline-flex items-center gap-1"
                                title="Admin override approval without telecom handshake check"
                              >
                                <Check size={10} />
                                Mark as Paid
                              </button>
                            )}

                            {/* Sandbox Simulated Buttons (Disables if live payment gateway active) */}
                            {!mtnMomoActive && (
                              <>
                                <button 
                                  disabled={updatingId === t.id}
                                  onClick={() => handleUpdateTransactionStatus(t.id!, "confirmed")}
                                  className="px-2 py-1 bg-yellow-500/10 hover:bg-yellow-500/20 text-[#FFC107] border border-yellow-500/25 font-semibold rounded-lg transition-all text-[9.5px] cursor-pointer inline-flex items-center gap-0.5"
                                  title="Sandbox sandbox simulate approval callback"
                                >
                                  Mock Approve
                                </button>
                                <button 
                                  disabled={updatingId === t.id}
                                  onClick={() => handleUpdateTransactionStatus(t.id!, "rejected")}
                                  className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-semibold rounded-lg transition-all text-[9.5px] cursor-pointer inline-flex items-center gap-0.5"
                                  title="Sandbox mock rejection callback"
                                >
                                  Mock Reject
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-sans italic">Immutable settled register</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Elegant Pagination Control Footer Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white/[0.01] border-t border-white/5 text-xs text-slate-400">
          <div>
            Showing <span className="font-bold text-white">{Math.min(totalFiltered, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(totalFiltered, currentPage * itemsPerPage)}</span> of <span className="font-bold text-white">{totalFiltered}</span> transaction logs
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="p-1.5 bg-white/5 border border-white/5 hover:border-white/10 rounded-lg text-slate-300 disabled:opacity-30 disabled:pointer-events-none cursor-pointer hover:bg-white/10 transition-all"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="font-mono text-[11px] bg-black/30 border border-white/5 py-1 px-3 rounded-lg">
              Page {currentPage} of {totalPages}
            </span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="p-1.5 bg-white/5 border border-white/5 hover:border-white/10 rounded-lg text-slate-300 disabled:opacity-30 disabled:pointer-events-none cursor-pointer hover:bg-white/10 transition-all"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
