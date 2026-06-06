import React, { useState, useEffect } from "react";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  doc 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { 
  Star, 
  MessageSquare, 
  Trash2, 
  Filter, 
  TrendingUp, 
  Search, 
  Calendar, 
  Receipt, 
  ArrowUpDown,
  RefreshCw,
  UtensilsCrossed 
} from "lucide-react";

interface CustomerFeedbackViewProps {
  currentBusinessId: string;
  toast: (message: string, type?: "success" | "error" | "info" | "warning") => void;
}

export default function CustomerFeedbackView({ currentBusinessId, toast }: CustomerFeedbackViewProps) {
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ratingFilter, setRatingFilter] = useState<number | "all">("all");
  const [sortOrder, setSortOrder] = useState<"latest" | "highest" | "lowest">("latest");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!currentBusinessId) return;

    // Load active reviews for the business
    const q = query(
      collection(db, "customerFeedback"),
      where("businessId", "==", currentBusinessId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setFeedbacks(list);
      setLoading(false);
    }, (err) => {
      console.error("Error subscribing to customer feedback:", err);
      toast("Could not load customer feedbacks. Check database connections.", "error");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentBusinessId]);

  // Handle deleting a feedback log
  const handleDeleteFeedback = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this customer feedback? This action is irreversible.")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "customerFeedback", id));
      toast("Customer feedback deleted successfully.", "success");
    } catch (err) {
      console.error("Delete feedback error:", err);
      toast("Failed to delete feedback entry. Unauthorized access.", "error");
    }
  };

  // Aggregated calculations
  const totalCount = feedbacks.length;
  
  const averageRating = totalCount > 0 
    ? parseFloat((feedbacks.reduce((sum, item) => sum + item.rating, 0) / totalCount).toFixed(1)) 
    : 0.0;

  // Star distribution counts (5, 4, 3, 2, 1)
  const distribution = {
    5: feedbacks.filter((f) => f.rating === 5).length,
    4: feedbacks.filter((f) => f.rating === 4).length,
    3: feedbacks.filter((f) => f.rating === 3).length,
    2: feedbacks.filter((f) => f.rating === 2).length,
    1: feedbacks.filter((f) => f.rating === 1).length,
  };

  const getPercentage = (count: number) => {
    if (totalCount === 0) return 0;
    return Math.round((count / totalCount) * 100);
  };

  // Filter & Sort Feedbacks
  const filteredFeedbacks = feedbacks
    .filter((item) => {
      // Rating filter
      if (ratingFilter !== "all" && item.rating !== ratingFilter) {
        return false;
      }
      // Text search (Table number, comment message, or billId)
      if (searchQuery.trim() !== "") {
        const queryLower = searchQuery.toLowerCase();
        const msgMatch = (item.feedbackMessage || "").toLowerCase().includes(queryLower);
        const tblMatch = (item.tableNumber || "").toLowerCase().includes(queryLower);
        const billMatch = (item.billId || "").toLowerCase().includes(queryLower);
        const nameMatch = (item.customerName || "").toLowerCase().includes(queryLower);
        return msgMatch || tblMatch || billMatch || nameMatch;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortOrder === "latest") {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA; // Newest first
      } else if (sortOrder === "highest") {
        return b.rating - a.rating; // Highest rating first
      } else {
        return a.rating - b.rating; // Lowest rating first
      }
    });

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return "-";
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
    } catch {
      return isoString;
    }
  };

  const formatAmount = (amt?: number) => {
    if (amt === undefined || amt === null) return "-";
    return `FRW ${amt.toLocaleString()}`;
  };

  return (
    <div id="customer-feedback-section" className="space-y-6">
      
      {/* Overview Aggregates Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Rating Star Score Grid */}
        <div className="bg-[#11141C] border border-white/10 rounded-2xl p-6 flex flex-col justify-center items-center text-center space-y-3 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-tr from-[#1B32FF]/5 to-transparent pointer-events-none" />
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider font-sans">Corporate Average Index</span>
          <div className="space-y-1">
            <h2 className="text-5xl font-black text-white tracking-tight leading-none flex items-baseline justify-center gap-1 font-sans">
              {averageRating > 0 ? averageRating.toFixed(1) : "0.0"}
              <span className="text-xs text-slate-500 font-semibold uppercase">/ 5.0</span>
            </h2>
          </div>

          {/* Golden Stars graphic and total Reviews count */}
          <div className="flex items-center gap-1 relative z-10">
            {[1, 2, 3, 4, 5].map((s) => {
              const isActive = s <= Math.round(averageRating);
              return (
                <Star 
                  key={s} 
                  size={18} 
                  className={isActive ? "text-amber-400 fill-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.3)]" : "text-slate-700"} 
                />
              );
            })}
          </div>

          <p className="text-xs text-[#FFC107] font-semibold bg-[#FFC107]/5 px-3 py-1 rounded-full border border-amber-500/10 inline-block font-sans">
            Based on {totalCount} Customer Reviews
          </p>
        </div>

        {/* Rating Breakdown Distribution Card */}
        <div className="bg-[#11141C] border border-white/10 rounded-2xl p-6 col-span-2 space-y-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest font-sans flex items-center gap-1.5 pb-1.5 border-b border-white/5">
            <TrendingUp size={12} className="text-[#1B32FF]" /> Satisfaction Profile Breakdown
          </h3>

          <div className="space-y-2.5 font-sans">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = distribution[star as keyof typeof distribution] || 0;
              const percent = getPercentage(count);
              return (
                <div key={star} className="flex items-center gap-4 text-xs">
                  <span className="w-12 text-slate-400 font-bold space-x-1 flex items-center shrink-0">
                    <span>{star} Stars</span>
                  </span>
                  
                  {/* Progress track */}
                  <div className="flex-grow h-2.5 bg-zinc-950 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        star >= 4 
                          ? "bg-emerald-500" 
                          : star === 3 
                            ? "bg-amber-400" 
                            : "bg-red-500"
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  {/* Percentage label */}
                  <span className="w-14 text-right text-slate-300 font-mono font-bold shrink-0">
                    {percent}% <span className="text-[10px] text-slate-500">({count})</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Feedback Explorer section */}
      <div className="bg-[#11141C] border border-white/10 rounded-3xl overflow-hidden shadow-xl">
        
        {/* Navigation, search and filter toolbar */}
        <div className="p-4 bg-white/[0.01] border-b border-white/5 gap-4 flex flex-col md:flex-row md:items-center md:justify-between">
          
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Rating Filter Pills */}
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2 font-mono flex items-center gap-1">
              <Filter size={10} className="text-[#1B32FF]" /> Filter Rating:
            </span>

            <button
              onClick={() => setRatingFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-all ${
                ratingFilter === "all"
                  ? "bg-[#1B32FF] text-white"
                  : "bg-white/5 text-slate-300 hover:bg-white/15"
              }`}
            >
              All
            </button>
            {[5, 4, 3, 2, 1].map((star) => (
              <button
                key={star}
                onClick={() => setRatingFilter(star)}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-all flex items-center gap-1 ${
                  ratingFilter === star
                    ? "bg-[#1B32FF] text-white"
                    : "bg-white/5 text-slate-300 hover:bg-white/15"
                }`}
              >
                {star} ★
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            
            {/* Interactive text search filter */}
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search table, message, bill..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-60 pl-9 pr-3 py-1.5 bg-zinc-950 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#1B32FF] font-sans"
              />
            </div>

            {/* Sorting controls */}
            <div className="flex items-center gap-2">
              <ArrowUpDown size={12} className="text-indigo-400 shrink-0" />
              <select
                value={sortOrder}
                onChange={(e: any) => setSortOrder(e.target.value)}
                className="px-2.5 py-1.5 bg-zinc-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none font-bold"
              >
                <option value="latest">Latest Feedback</option>
                <option value="highest">Highest Star Rating</option>
                <option value="lowest">Lowest Star Rating</option>
              </select>
            </div>
          </div>
        </div>

        {/* FEEDBACK LIST SECTION */}
        {loading ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-2">
            <RefreshCw size={24} className="animate-spin text-indigo-400" />
            <span className="text-xs font-mono uppercase">Syncing Live Customer Ratings...</span>
          </div>
        ) : filteredFeedbacks.length === 0 ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center space-y-4 max-w-sm mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-slate-500">
              <MessageSquare size={18} />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-black uppercase text-white tracking-wider">No Feedbacks Found</h4>
              <p className="text-[11px] text-slate-500 leading-normal">
                {searchQuery || ratingFilter !== "all" 
                  ? "No reviews match your filter parameters. Try expanding your filters or search terms." 
                  : "We haven't received any reviews yet. Customer feedback appears dynamically here after payment verification."}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {filteredFeedbacks.map((item) => (
              <div 
                key={item.id} 
                className="p-5 flex flex-col md:flex-row md:items-start md:justify-between gap-4 transition-all hover:bg-white/[0.01]"
              >
                {/* Review Metadata card */}
                <div className="space-y-2.5 max-w-2xl font-sans">
                  <div className="flex items-center gap-3">
                    
                    {/* Stars render */}
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star 
                          key={s} 
                          size={13} 
                          className={s <= item.rating ? "text-amber-400 fill-amber-400" : "text-slate-800"} 
                        />
                      ))}
                    </div>

                    <span className="text-[10px] text-slate-600 font-mono">•</span>

                    {/* Meta info tags */}
                    <span className="text-[11px] font-black text-[#FFC107] uppercase bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/15">
                      {item.tableNumber || "No Table"}
                    </span>

                    <span className="text-[10px] text-slate-600 font-mono">•</span>

                    <span className="text-[11px] font-bold text-indigo-300 block truncate max-w-[120px]">
                      By {item.customerName || "Anonymous Customer"}
                    </span>
                  </div>

                  {/* Feedback description - visual display priority */}
                  {item.feedbackMessage ? (
                    <blockquote className="text-slate-200 text-xs italic font-medium leading-relaxed pl-3 border-l-2 border-slate-700 font-sans">
                      "{item.feedbackMessage}"
                    </blockquote>
                  ) : (
                    <span className="text-[11px] text-slate-500 italic uppercase tracking-wider block font-mono pl-3 border-l-2 border-slate-800">
                      No feedback comment added
                    </span>
                  )}

                  {/* Timestamp & Bill links */}
                  <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-[10.5px] text-slate-500 font-mono pt-1">
                    <span className="flex items-center gap-1 font-semibold">
                      <Calendar size={11} className="text-slate-500 shrink-0" /> {formatDateTime(item.createdAt)}
                    </span>
                    <span className="text-slate-800 select-none">|</span>
                    <span className="flex items-center gap-1">
                      <Receipt size={11} className="text-slate-500 shrink-0" /> {item.billId}
                    </span>
                    {item.billAmount !== undefined && (
                      <>
                        <span className="text-slate-800 select-none">|</span>
                        <span className="text-emerald-400 font-bold">
                          Paid: {formatAmount(item.billAmount)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Operations column */}
                <div className="flex items-center md:self-stretch justify-end min-w-[70px]">
                  <button
                    onClick={() => handleDeleteFeedback(item.id)}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer border border-transparent hover:border-red-500/15 shrink-0"
                    title="Delete feedback log item"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

              </div>
            ))}
          </div>
        )}

        {/* List items count footnote info */}
        <div className="p-4 bg-white/[0.01] border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span>Showing {filteredFeedbacks.length} of {totalCount} reviews</span>
          <span className="flex items-center gap-1 font-bold">
            <UtensilsCrossed size={11} className="text-[#1B32FF]" /> RATING LEDGER v-1.0
          </span>
        </div>

      </div>

    </div>
  );
}
