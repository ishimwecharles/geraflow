import { Client, Transaction } from "../types";
import { fmtRWF } from "./PayPage";
import { 
  Users, 
  CreditCard, 
  Award, 
  Activity, 
  Clock, 
  ShieldAlert, 
  CircleDollarSign,
  ArrowRight
} from "lucide-react";
import { motion } from "motion/react";

interface DashboardViewProps {
  clients: Client[];
  txns: Transaction[];
  setView: (v: string) => void;
  onViewClient: (c: Client) => void;
}

export default function DashboardView({ clients, txns, setView, onViewClient }: DashboardViewProps) {
  const totalClients = clients.length;
  const activeClients = clients.filter((c) => c.status === "active").length;
  
  // Calculate total transactions value
  const confirmedTxns = txns.filter((t) => t.status === "confirmed");
  const totalVolume = confirmedTxns.reduce((acc, t) => acc + t.amount, 0);

  const localTxns = confirmedTxns.filter((t) => !t.qrType || t.qrType === "local");
  const localVolume = localTxns.reduce((acc, t) => acc + t.amount, 0);

  const intlTxns = confirmedTxns.filter((t) => t.qrType === "international");
  const intlVolumeUSD = intlTxns.filter((t) => t.currency === "USD").reduce((acc, t) => acc + t.amount, 0);
  const intlVolumeRWF = intlTxns.filter((t) => t.currency === "RWF").reduce((acc, t) => acc + t.amount, 0);
  
  const pendingTxns = txns.filter((t) => t.status === "pending" || t.status === "processing");
  const pendingCount = pendingTxns.length;

  // Custom visual list for top and recent actions
  const recentTransactions = txns.slice(0, 5);
  const recentClients = clients.slice(0, 5);

  // Group transactions for simple trend visualization
  const trendDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const trendValues = [25000, 48000, 15000, 89000, 60000, 31000, 115000]; // Dummy seed values for Rwanda context
  const maxTrend = Math.max(...trendValues);

  return (
    <div className="space-y-6">
      {/* Sandbox connection warning banner if MTN is running inside mock server */}
      <div className="flex gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-xs text-slate-300">
        <Clock className="text-[#FFC107] flex-shrink-0" size={16} />
        <div>
          <span className="font-bold text-white block">MTN MoMo Sandbox Node Enabled</span>
          All payment triggers trigger push confirmation alerts to Rwanda client systems. Demoweb callbacks handle instant state approvals.
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            title: "Total Registered Clients",
            value: totalClients.toString(),
            sub: `${activeClients} currently active`,
            icon: Users,
            color: "text-blue-400 bg-blue-500/10 border-blue-500/15"
          },
          {
            title: "Processed Vol (RWF)",
            value: fmtRWF(totalVolume),
            sub: `${confirmedTxns.length} successful payments`,
            icon: CircleDollarSign,
            color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/15"
          },
          {
            title: "MTN QR Terminal Codes",
            value: totalClients.toString(),
            sub: "Generated merchant stickers",
            icon: CreditCard,
            color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/15"
          },
          {
            title: "Pending Confirmations",
            value: pendingCount.toString(),
            sub: "USSD confirmation queue",
            icon: ShieldAlert,
            color: pendingCount > 0 
              ? "text-red-400 bg-red-500/15 border-red-500/20 animate-pulse" 
              : "text-slate-400 bg-white/5 border-white/5"
          }
        ].map((item, idx) => {
          const IconComponent = item.icon;
          return (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="p-5 bg-[#11141C] border border-white/5 rounded-2xl flex items-center justify-between"
            >
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{item.title}</span>
                <span className="text-xl font-bold font-mono text-white block">{item.value}</span>
                <span className="text-[11px] text-[#FFC107] font-medium block">{item.sub}</span>
              </div>
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${item.color}`}>
                <IconComponent size={20} />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Analytics Partitions by QR Connection Type */}
      <h3 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-widest pt-2">Analytics by Connection Gateway</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Local Payments Analytics */}
        <div className="p-5 bg-[#11141C] border border-[#1b32ff]/10 hover:border-[#1b32ff]/20 rounded-2xl relative overflow-hidden transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#1b32ff]/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-start justify-between mb-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-white block">Local Payments (MTN MoMo)</span>
              <span className="text-[10px] text-slate-500 font-mono block">Gateway: MTN MoMo Callback Channel</span>
            </div>
            <span className="px-2 py-0.5 bg-[#1b32ff]/10 text-indigo-400 rounded-md text-[9px] font-extrabold uppercase font-mono border border-indigo-500/10">
              RWF Only
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-1 font-mono">
            <div className="space-y-0.5">
              <span className="text-slate-500 text-[9px] uppercase font-bold block">Confirmed Volume</span>
              <span className="text-base font-black text-white block">{fmtRWF(localVolume)}</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-slate-500 text-[9px] uppercase font-bold block">Approved Transactions</span>
              <span className="text-base font-black text-[#1b32ff] block">{localTxns.length} TXs</span>
            </div>
          </div>
          <div className="border-t border-white/5 mt-4 pt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>Instant push-to-pay conversion rate</span>
            <span className="text-indigo-400 font-bold">100.0% Verified</span>
          </div>
        </div>

        {/* International Card Payments Analytics */}
        <div className="p-5 bg-[#11141C] border border-yellow-500/10 hover:border-yellow-500/20 rounded-2xl relative overflow-hidden transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-start justify-between mb-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-white block">International Cards Gateway</span>
              <span className="text-[10px] text-slate-500 font-mono block">Gateway: Visa / MasterCard Processing</span>
            </div>
            <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-500 rounded-md text-[9px] font-extrabold uppercase font-mono border border-yellow-500/15">
              USD / RWF Multi-Currency
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-1 font-mono">
            <div className="space-y-1">
              <span className="text-slate-500 text-[9px] uppercase font-bold block">Confirmed Volume</span>
              <div className="space-y-0.5">
                <span className="text-base font-black text-yellow-500 block">${intlVolumeUSD.toFixed(2)} USD</span>
                <span className="text-[10px] text-slate-400 block">{fmtRWF(intlVolumeRWF)} RWF</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-slate-500 text-[9px] uppercase font-bold block">Secure checkouts</span>
              <span className="text-base font-black text-yellow-500 block">{intlTxns.length} TXs</span>
              <span className="text-[9px] text-slate-500 block">no in-app card storage</span>
            </div>
          </div>
          <div className="border-t border-white/5 mt-4 pt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>International travellers / tourists traffic</span>
            <span className="text-yellow-500 font-bold">Secure Redirect</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend chart */}
        <div className="lg:col-span-2 p-5 bg-[#11141C] border border-white/5 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Processed Transaction Volume Trend</span>
              <span className="text-xs text-slate-400 font-medium">Daily summary on Rwandatel MTN Gateway connectivity</span>
            </div>
            <span className="px-2.5 py-0.5 text-[9px] font-bold text-[#FFC107] bg-yellow-500/10 border border-yellow-500/20 rounded-full flex items-center gap-1">
              <Activity size={10} className="animate-pulse" /> Live Metrics
            </span>
          </div>

          {/* Render clean, beautiful custom SVG bar chart */}
          <div className="h-44 w-full flex items-end justify-between gap-2.5 pb-2 pt-4 px-2 font-mono">
            {trendValues.map((val, i) => {
              const pct = (val / maxTrend) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                  <div className="relative w-full flex items-end justify-center group h-full">
                    {/* Hover text label */}
                    <span className="absolute -top-4 text-[9px] text-[#00D68F] bg-[#11141C] border border-white/5 rounded px-1.5 py-0.5 font-bold shadow opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {fmtRWF(val)}
                    </span>
                    <div 
                      style={{ height: `${pct}%` }}
                      className="w-full bg-gradient-to-t from-[#1b32ffcc] to-[#1B32FF] border-t-2 border-indigo-400 rounded-t-lg group-hover:brightness-110 active:brightness-90 transition-all duration-300 relative"
                    >
                      {/* Glow element */}
                      <div className="absolute inset-0 bg-[#FFC107]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 font-bold">{trendDays[i]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Short summary right block */}
        <div className="p-5 bg-[#11141C] border border-white/5 rounded-2xl flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Super Admin Credentials</span>
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#1B32FF] to-[#FFC107] text-[#0C0E14] flex items-center justify-center font-bold font-mono">
                SA
              </div>
              <div>
                <span className="text-xs font-bold text-white block">ishimwecharles2525@gmail.com</span>
                <span className="text-[10px] text-slate-400 font-mono block">Terminal Node Authority</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-indigo-500/[0.03] border border-indigo-500/10 rounded-xl space-y-2 text-xs">
            <span className="font-bold text-white block">Instant Link Testing</span>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Generate clients and share their pay links. Customers can pay locally from any browser tab instantly.
            </p>
            <button 
              onClick={() => setView("clients")}
              className="text-[#1B32FF] hover:text-[#2A45FF] font-bold inline-flex items-center gap-1 mt-1 transition-colors hover:underline cursor-pointer"
            >
              View Client List <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent clients */}
        <div className="p-5 bg-[#11141C] border border-white/5 rounded-2xl">
          <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
            <h3 className="text-sm font-bold tracking-tight">Recent Client Deployments</h3>
            <button 
              onClick={() => setView("clients")}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
            >
              Manage
            </button>
          </div>
          {recentClients.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">No active clients found. Add one in Clients menu.</div>
          ) : (
            <div className="divide-y divide-white/5 font-mono">
              {recentClients.map((c) => (
                <div 
                  key={c.id} 
                  onClick={() => onViewClient(c)}
                  className="py-2.5 flex items-center justify-between text-xs hover:bg-white/[0.02] cursor-pointer transition-colors px-1"
                >
                  <div className="flex items-center gap-2">
                    {c.logoUrl ? (
                      <img src={c.logoUrl} className="w-6 h-6 rounded object-cover referrerPolicy='no-referrer'" alt=""/>
                    ) : (
                      <div className="w-6 h-6 rounded bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold">
                        {c.businessName[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="font-semibold text-slate-300">{c.businessName}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-bold">{c.clientId}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent transactions */}
        <div className="p-5 bg-[#11141C] border border-white/5 rounded-2xl">
          <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
            <h3 className="text-sm font-bold tracking-tight">Recent Transaction Checks</h3>
            <button 
              onClick={() => setView("transactions")}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
            >
              Details
            </button>
          </div>
          {recentTransactions.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">No logs processed in this session.</div>
          ) : (
            <div className="divide-y divide-white/5 font-mono">
              {recentTransactions.map((t) => (
                <div 
                  key={t.id} 
                  className="py-2.5 flex items-center justify-between text-xs hover:bg-white/[0.01] px-1"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-slate-300">{t.businessName}</span>
                    <span className="text-[9px] text-slate-500">{t.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">{fmtRWF(t.amount)}</span>
                    <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-extrabold ${
                      t.status === "confirmed" 
                        ? "bg-emerald-500/10 text-emerald-400" 
                        : t.status === "failed" || t.status === "rejected"
                        ? "bg-red-500/15 text-red-400"
                        : "bg-yellow-500/10 text-yellow-400 animate-pulse"
                    }`}>
                      {t.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
