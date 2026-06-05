import React, { useState, useEffect } from "react";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  getDoc 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { Menu, MenuSection, MenuProduct } from "../types";
import { 
  UtensilsCrossed, 
  Phone, 
  MapPin, 
  AlertTriangle, 
  ChevronRight, 
  Globe, 
  Clock, 
  ArrowLeft,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface PublicMenuViewProps {
  businessIdParam: string;
  onBackToPortal?: () => void;
}

const ALLERGEN_MAP: { [key: string]: { label: string; icon: string; desc: string } } = {
  gluten: { label: "Gluten", icon: "🌾", desc: "Wheat, barley, rye" },
  crustaceans: { label: "Crustaceans", icon: "🦐", desc: "Crab, prawns, lobsters" },
  eggs: { label: "Eggs", icon: "🥚", desc: "Whole eggs or egg derivatives" },
  fish: { label: "Fish", icon: "🐟", desc: "All finfish" },
  peanuts: { label: "Peanuts", icon: "🥜", desc: "Ground peanuts and oil" },
  soy: { label: "Soy", icon: "🫘", desc: "Soybeans, tofu, soy sauce" },
  milk: { label: "Milk", icon: "🥛", desc: "Dairy, milk, cheese, lactose" },
  nuts: { label: "Nuts", icon: "🌰", desc: "Almonds, walnuts, cashew, hazelnuts" },
  celery: { label: "Celery", icon: "🌿", desc: "Celery stalks, seeds, leaves" },
  mustard: { label: "Mustard", icon: "🟡", desc: "Mustard seeds, powder, paste" },
  sesame: { label: "Sesame", icon: "🥯", desc: "Sesame seeds and oils" },
  sulphites: { label: "Sulphites", icon: "🍷", desc: "Dried foodstuffs, wines" },
  lupin: { label: "Lupin", icon: "🪻", desc: "Lupin flour, seeds, breads" },
  molluscs: { label: "Molluscs", icon: "🦪", desc: "Clams, oysters, mussels, snails" }
};

export default function PublicMenuView({ businessIdParam, onBackToPortal }: PublicMenuViewProps) {
  const [menuProfile, setMenuProfile] = useState<Menu | null>(null);
  const [sections, setSections] = useState<MenuSection[]>([]);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  
  // Allergen guide tooltip state
  const [selectedAllergenFocus, setSelectedAllergenFocus] = useState<typeof ALLERGEN_MAP[string] | null>(null);

  // Fullscreen interactive product preview states
  const [expandedProduct, setExpandedProduct] = useState<MenuProduct | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [touchStartDist, setTouchStartDist] = useState<number | null>(null);

  // Auto-reset state when product selection transitions
  useEffect(() => {
    if (!expandedProduct) {
      setZoomLevel(1);
      setPanOffset({ x: 0, y: 0 });
      setTouchStartDist(null);
    }
  }, [expandedProduct]);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Gesture handling for mobile pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setTouchStartDist(dist);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDist !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scaleFactor = dist / touchStartDist;
      const nextZoom = Math.min(Math.max(1, zoomLevel * scaleFactor), 4);
      setZoomLevel(nextZoom);
      setTouchStartDist(dist);
    }
  };

  const handleTouchEnd = () => {
    setTouchStartDist(null);
  };

  useEffect(() => {
    const businessId = businessIdParam;
    console.log("Public menu businessId:", businessId);

    if (!businessId) {
      setErrorStatus("Menu not found for this business.");
      setLoading(false);
      return;
    }

    setLoading(true);

    let resolvedMenu = false;
    let resolvedSections = false;
    let resolvedProducts = false;
    let sectionsList: MenuSection[] = [];
    let productsList: MenuProduct[] = [];

    // Timeout after 6 seconds to avoid infinite loading
    const timeoutId = setTimeout(() => {
      console.warn("Public Menu fetch timed out after 6 seconds.");
      if (sectionsList.length === 0 && productsList.length === 0) {
        if (!resolvedMenu) {
          setErrorStatus("Menu not found for this business.");
        } else {
          setErrorStatus("Menu is empty. Please add products in Menu Manager.");
        }
      } else {
        setErrorStatus(null);
      }
      setLoading(false);
    }, 6000);

    const handleError = (err: any, colName: string, idVal: string) => {
      console.error(`[Public Menu Diagnostic Error] Fetch error in listener for collection '${colName}' [${idVal}]:`, err);
      clearTimeout(timeoutId);
      const errMsg = err?.message || String(err);
      if (errMsg.includes("permission-denied") || errMsg.includes("Missing or insufficient permissions") || errMsg.includes("permission")) {
        setErrorStatus(`FIRESTORE PERMISSION DENIED: Restricted access on collection '${colName}' for identifier '${idVal}'. Access rules audit failed.`);
      } else {
        setErrorStatus(`Could not fetch active ${colName} data from database server.`);
      }
      setLoading(false);
    };

    const checkLoadingComplete = () => {
      if (resolvedMenu && resolvedSections && resolvedProducts) {
        clearTimeout(timeoutId);
        if (sectionsList.length === 0 && productsList.length === 0) {
          setErrorStatus("Menu is empty. Please add products in Menu Manager.");
        } else {
          setErrorStatus(null);
        }
        setLoading(false);
      }
    };

    const getFallbackClientDoc = async (bId: string) => {
      try {
        const clientDoc = await getDoc(doc(db, "clients", bId));
        resolvedMenu = true;
        if (clientDoc.exists()) {
          const cData = clientDoc.data();
          setMenuProfile({
            businessId: bId,
            restaurantName: cData.businessName || "Registered Merchant",
            phone: cData.phone || "",
            location: cData.location || "",
            active: true,
            category: cData.category || "International Cuisine"
          });
          checkLoadingComplete();
        } else {
          clearTimeout(timeoutId);
          setErrorStatus("Menu not found for this business.");
          setLoading(false);
        }
      } catch (err: any) {
        handleError(err, "clients", bId);
      }
    };

    // 1. Listen to Menu Profile in real-time
    const menuDocRef = doc(db, "menus", businessId);
    const unsubMenu = onSnapshot(menuDocRef, (snap) => {
      if (snap.exists()) {
        const menuData = snap.data() as Menu;
        resolvedMenu = true;
        if (!menuData.active) {
          clearTimeout(timeoutId);
          setErrorStatus("This restaurant menu is currently in offline maintenance mode.");
          setLoading(false);
        } else {
          setMenuProfile(menuData);
          checkLoadingComplete();
        }
      } else {
        // Fallback: Check if client exists so we can auto-display at least basic info
        getFallbackClientDoc(businessId);
      }
    }, (err) => handleError(err, "menus", businessId));

    // 2. Fetch sections ordered by sortOrder
    const qSections = query(
      collection(db, "menuSections"),
      where("businessId", "==", businessId),
      orderBy("sortOrder", "asc")
    );
    const unsubSec = onSnapshot(qSections, (snap) => {
      resolvedSections = true;
      const list: MenuSection[] = [];
      snap.forEach(d => {
        const data = d.data() as MenuSection;
        if (data.active !== false) {
          list.push({ id: d.id, ...data });
        }
      });
      sectionsList = list;
      setSections(list);
      checkLoadingComplete();
    }, (err) => handleError(err, "menuSections", `query businessId == ${businessId}`));

    // 3. Fetch products ordered by sortOrder
    const qProducts = query(
      collection(db, "menuProducts"),
      where("businessId", "==", businessId),
      orderBy("sortOrder", "asc")
    );
    const unsubProd = onSnapshot(qProducts, (snap) => {
      resolvedProducts = true;
      const list: MenuProduct[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as MenuProduct);
      });
      productsList = list;
      setProducts(list);
      checkLoadingComplete();
    }, (err) => handleError(err, "menuProducts", `query businessId == ${businessId}`));

    return () => {
      clearTimeout(timeoutId);
      unsubMenu();
      unsubSec();
      unsubProd();
    };
  }, [businessIdParam]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0C0E14] text-slate-400 flex flex-col items-center justify-center p-4 font-mono text-xs gap-3">
        <div className="w-10 h-10 border-2 border-[#1B32FF] border-t-transparent rounded-full animate-spin" />
        <span className="uppercase tracking-widest text-[#FFC107] animate-pulse">Syncing Chef's Pantry...</span>
      </div>
    );
  }

  if (errorStatus) {
    return (
      <div className="min-h-screen bg-[#0C0E14] flex items-center justify-center p-4 font-sans text-white">
        <div className="w-full max-w-sm bg-[#11141C] border border-white/10 p-6 rounded-3xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 text-[#FFC107] flex items-center justify-center mx-auto">
            <AlertTriangle size={24} />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-extrabold text-white tracking-widest uppercase">Menu Unavailable</h2>
            <p className="text-[12px] text-slate-400 leading-relaxed">
              {errorStatus}
            </p>
          </div>
          {onBackToPortal ? (
            <button
              onClick={onBackToPortal}
              className="w-full py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold font-mono rounded-xl cursor-pointer"
            >
              Return to Landing Portal
            </button>
          ) : (
            <div className="text-[10px] text-slate-600 font-mono">GERA PAY QR • KIGALI DIGITAL AGENT</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0C0E14] text-slate-200 flex flex-col relative overflow-hidden font-sans pb-12 selection:bg-[#FFE082] selection:text-[#0C0E14]">
      {/* Decorative background radial glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-96 bg-[radial-gradient(ellipse_at_top,#1b32ff15_0%,transparent_70%)] pointer-events-none" />

      {/* HEADER: Restaurant Presentation banner */}
      <header className="relative bg-[#11141C] border-b border-white/5 pt-10 pb-6 px-4 md:px-6 shrink-0 relative z-10 shadow-lg">
        {onBackToPortal && (
          <button
            onClick={onBackToPortal}
            className="absolute top-4 left-4 p-2 bg-white/5 hover:bg-white/10 text-white rounded-full flex items-center gap-1.5 text-[10px] font-bold font-mono border border-white/5 transition-all active:scale-95 cursor-pointer"
          >
            <ArrowLeft size={12} /> Dashboard Back
          </button>
        )}

        <div className="max-w-xl mx-auto flex flex-col items-center text-center space-y-3.5">
          
          {/* Chef logo display */}
          <div className="w-20 h-20 rounded-[28px] bg-white/5 border border-white/10 overflow-hidden relative shadow-2xl flex items-center justify-center">
            {menuProfile?.logoUrl ? (
              <img src={menuProfile.logoUrl} className="w-full h-full object-cover" alt={menuProfile.restaurantName} referrerPolicy="no-referrer" />
            ) : (
              <UtensilsCrossed size={32} className="text-[#FFC107] animate-pulse" />
            )}
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-extrabold text-white tracking-tight uppercase font-sans md:text-2xl">
              {menuProfile?.restaurantName}
            </h1>
            <span className="inline-flex items-center gap-1 px-3 py-0.5 bg-indigo-500/10 text-indigo-400 font-bold text-[10px] rounded-full uppercase tracking-wider font-mono">
              <Globe size={10} /> {menuProfile?.category || "Table Digital Menu"}
            </span>
          </div>

          {menuProfile?.description && (
            <p className="text-xs text-slate-400 max-w-sm leading-relaxed font-sans">
              {menuProfile.description}
            </p>
          )}

          {/* Details footer */}
          <div className="flex flex-wrap justify-center items-center gap-x-5 gap-y-2 text-[10px] text-slate-500 font-mono pt-1.5 border-t border-white/5 w-full">
            {menuProfile?.phone && (
              <a href={`tel:${menuProfile.phone}`} className="flex items-center gap-1.5 hover:text-white transition-colors">
                <Phone size={11} className="text-slate-600" /> {menuProfile.phone}
              </a>
            )}
            {menuProfile?.location && (
              <span className="flex items-center gap-1.5">
                <MapPin size={11} className="text-slate-600" /> {menuProfile.location}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock size={11} className="text-slate-600" /> 24/7 Real-Time Sync
            </span>
          </div>

        </div>
      </header>


      {/* NAVIGATION TABS: Horizontal Categories */}
      <div className="bg-[#0C0E14] sticky top-0 z-30 border-b border-white/5 py-3.5 backdrop-blur-md bg-opacity-95 shadow shrink-0">
        <div className="max-w-xl mx-auto px-4 flex gap-2 overflow-x-auto scrollbar-none font-mono text-[10px]">
          <button
            onClick={() => setActiveCategory("all")}
            className={`px-4 py-2.5 rounded-xl font-black shrink-0 transition-all cursor-pointer ${
              activeCategory === "all"
                ? "bg-[#FFC107] text-[#0C0E14] font-black shadow-lg shadow-amber-500/10"
                : "bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/5 border border-white/5"
            }`}
          >
            🍽️ ALL CATEGORIES
          </button>

          {sections.map(s => (
            <button
              key={s.sectionId}
              onClick={() => setActiveCategory(s.sectionId)}
              className={`px-4 py-2.5 rounded-xl font-black shrink-0 transition-all uppercase cursor-pointer ${
                activeCategory === s.sectionId
                  ? "bg-[#FFC107] text-[#0C0E14] font-black shadow-lg shadow-amber-500/10"
                  : "bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/5 border border-white/5"
              }`}
            >
              🥗 {s.sectionName}
            </button>
          ))}
        </div>
      </div>


      {/* MAIN CONTAINER: Gastronomy Listing feeds */}
      <main className="flex-grow max-w-xl w-full mx-auto px-4 pt-6 space-y-6">
        
        {/* Allergen Interactive Key Help Guide */}
        <div className="bg-[#11141C] border border-white/5 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex gap-2 items-start">
            <span className="text-base">⚠️</span>
            <div>
              <span className="font-bold text-white block">Allergen Safety Guard</span>
              <p className="text-[10px] text-slate-400">Scan allergen caution tags on items. Tap tag icon to focus description details.</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-1.5 font-mono text-[9px] text-slate-400">
            {Object.keys(ALLERGEN_MAP).slice(0, 5).map(k => (
              <span key={k} className="px-1.5 py-0.5 bg-red-500/5 border border-red-500/10 rounded-md">
                {ALLERGEN_MAP[k].icon} {ALLERGEN_MAP[k].label}
              </span>
            ))}
            <span className="px-1.5 py-0.5 bg-white/5 rounded-md text-[8px] uppercase">+{Object.keys(ALLERGEN_MAP).length - 5} more</span>
          </div>
        </div>

        {/* Display sections & associated products */}
        <div className="space-y-6 pb-20">
          {sections
            .filter(sec => activeCategory === "all" || sec.sectionId === activeCategory)
            .map(sec => {
              const sectProducts = products.filter(p => p.sectionId === sec.sectionId);
              if (sectProducts.length === 0) return null;

              return (
                <div key={sec.sectionId} className="space-y-3">
                  
                  {/* Category Title bar details */}
                  <div className="flex items-baseline justify-between border-b border-white/5 pb-1 font-mono">
                    <h2 className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">
                      {sec.sectionName}
                    </h2>
                    {sec.description && (
                      <span className="text-[9px] text-slate-500 italic font-sans">{sec.description}</span>
                    )}
                  </div>

                  {/* List of dishes */}
                  <div className="space-y-3">
                    {sectProducts.map(p => {
                      const hasImage = !!(p.productImageUrl || p.imageUrl);

                      return (
                        <div
                          key={p.productId}
                          className={`p-4 bg-[#11141C]/90 hover:bg-[#11141C] border border-white/5 hover:border-indigo-500/30 shadow-[0_4px_24px_rgba(0,0,0,0.35)] hover:shadow-[0_12px_32px_rgba(27,51,255,0.08)] rounded-2xl flex gap-4 sm:gap-5 items-stretch relative transition-all duration-300 ${
                            !p.available ? "opacity-60" : ""
                          }`}
                        >
                          {/* Food layout image (110px to 140px) */}
                          <div 
                            onClick={() => {
                              if (hasImage) {
                                setExpandedProduct(p);
                              }
                            }}
                            className={`w-[110px] h-[110px] xs:w-[125px] xs:h-[125px] sm:w-[140px] sm:h-[140px] rounded-2xl bg-[#0C0E14] overflow-hidden shrink-0 relative border border-white/10 flex items-center justify-center select-none shadow-inner group transition-all duration-300 ${
                              hasImage ? "cursor-pointer hover:border-[#FFC107]/40 active:scale-95" : ""
                            }`}
                          >
                            {hasImage ? (
                              <>
                                <img 
                                  src={p.productImageUrl || p.imageUrl} 
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                                  alt={p.productName} 
                                  loading="lazy" 
                                  referrerPolicy="no-referrer" 
                                />
                                {/* Tap to enlarge indicator overlay */}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300 backdrop-blur-[1px]">
                                  <span className="text-[9px] font-mono font-bold tracking-widest text-[#FFC107] uppercase bg-[#0C0E14]/90 px-2 py-1 rounded-lg border border-[#FFC107]/20 flex items-center gap-1 shadow-lg">
                                    🔍 Zoom
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 to-[#11141C] text-slate-700">
                                <UtensilsCrossed size={20} className="text-slate-600 mb-1" />
                                <span className="text-[8px] text-slate-500 uppercase tracking-widest font-mono font-bold">No Photo</span>
                              </div>
                            )}

                            {!p.available && (
                              <div className="absolute inset-0 bg-red-950/80 backdrop-blur-[1px] flex flex-col items-center justify-center text-[10px] text-red-400 uppercase font-black tracking-widest font-mono text-center leading-none">
                                <span>Sold</span>
                                <span className="mt-0.5 text-[8px]">Out</span>
                              </div>
                            )}
                          </div>

                          {/* Dish specifications */}
                          <div className="flex-grow flex flex-col justify-between py-0.5 overflow-hidden">
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-start gap-2">
                                <h3 className="font-extrabold text-white text-[13px] sm:text-[14px] leading-snug tracking-tight uppercase">
                                  {p.productName}
                                </h3>
                                <span className="text-[#FFC107] font-extrabold text-[12px] sm:text-[13px] font-mono shrink-0 bg-[#0C0E14] border border-white/5 px-2 py-0.5 rounded-lg shadow-sm">
                                  {p.price.toLocaleString()} RWF
                                </span>
                              </div>

                              {p.translatedName && (
                                <span className="text-[9.5px] text-[#FFC107]/80 block italic font-medium leading-none font-sans">
                                  ({p.translatedName})
                                </span>
                              )}

                              {p.description ? (
                                <p className="text-[10px] sm:text-[11px] text-slate-400 font-sans leading-relaxed line-clamp-3">
                                  {p.description}
                                </p>
                              ) : (
                                <p className="text-[9.5px] text-slate-600 font-sans italic">
                                  No details specified.
                                </p>
                              )}
                            </div>

                            {/* Tags & Availability indicators */}
                            <div className="space-y-2 pt-2">
                              {/* Allergen warn tags */}
                              {p.allergens && p.allergens.length > 0 && (
                                <div className="flex flex-wrap gap-1 text-[8px] font-mono text-slate-400">
                                  {p.allergens.map(al => {
                                    const allergyMatch = ALLERGEN_MAP[al];
                                    if (!allergyMatch) return null;
                                    return (
                                      <button
                                        key={al}
                                        type="button"
                                        onClick={() => setSelectedAllergenFocus(allergyMatch)}
                                        className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded-md flex items-center gap-1 border border-red-500/10 hover:bg-red-500/25 active:scale-95 transition-all text-left cursor-pointer"
                                      >
                                        <span>{allergyMatch.icon}</span>
                                        <span>{allergyMatch.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Availability line badge */}
                              <div className="flex items-center gap-1 text-[8.5px] font-mono">
                                {p.available ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-400/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                                    <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" /> Available
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-red-400 bg-red-400/10 border border-red-500/20 px-1.5 py-0.5 rounded-md">
                                    <span className="w-1 h-1 rounded-full bg-red-500" /> Out of stock
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                        </div>
                      );
                    })}
                  </div>

                </div>
              );
          })}

          {products.length === 0 && (
            <div className="text-center py-20 border border-dashed border-white/5 rounded-3xl">
              <span className="text-xs text-slate-500 block">No dishes have been declared inside this digital menu workspace yet.</span>
            </div>
          )}

        </div>

      </main>


      {/* FOOTER BRACE */}
      <footer className="mt-auto py-6 border-t border-white/5 bg-[#11141C] text-center space-y-1 shrink-0 relative z-10 text-[9px] font-mono text-slate-600 uppercase tracking-widest">
        <div>Powered by Gera Flow • Safe Table Utility</div>
        <div>Nyarugenge District, Kigali, Rwanda</div>
      </footer>


      {/* INTERACTIVE ALLERGENS FOCUS DIALOG */}
      <AnimatePresence>
        {selectedAllergenFocus && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-[#11141C] border border-white/10 p-5 rounded-3xl space-y-4 shadow-2xl relative text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-2xl shadow-lg">
                {selectedAllergenFocus.icon}
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-mono font-bold text-red-400 uppercase tracking-wider block">Allergen Highlight</span>
                <h3 className="text-base font-black text-white uppercase tracking-tight">{selectedAllergenFocus.label}</h3>
                <p className="text-xs text-slate-400 font-sans leading-relaxed">
                  Products with this tag contains ingredients derived from <strong>{selectedAllergenFocus.desc}</strong> which can trigger immunological responses.
                </p>
              </div>

              <button
                onClick={() => setSelectedAllergenFocus(null)}
                className="w-full py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl text-xs font-bold font-mono transition-colors cursor-pointer"
              >
                Got it, close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FULLSCREEN PHOTO ZOOM VIEWER WITH GESTURES */}
      <AnimatePresence>
        {expandedProduct && (
          <div 
            className="fixed inset-0 bg-black/95 z-50 flex flex-col justify-between select-none overflow-hidden touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Top Bar with actions */}
            <div className="absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/85 to-transparent flex items-center justify-between z-10">
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-mono text-[#FFC107] uppercase tracking-widest font-extrabold flex items-center gap-1">
                  <Sparkles size={10} className="text-[#FFC107] animate-pulse" /> HD Culinary Viewer
                </span>
                <span className="text-white text-xs font-bold truncate max-w-[150px] sm:max-w-xs">{expandedProduct.productName}</span>
              </div>
              
              {/* Interaction Zoom Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  title="Zoom Out"
                  onClick={() => {
                    setZoomLevel(prev => Math.max(1, prev - 0.5));
                    if (zoomLevel <= 1.5) {
                      setPanOffset({ x: 0, y: 0 });
                    }
                  }}
                  className="p-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all active:scale-95 cursor-pointer flex items-center justify-center"
                >
                  <ZoomOut size={13} />
                </button>
                <div className="text-[9px] font-mono text-slate-300 min-w-[34px] text-center bg-white/5 py-1 px-1 rounded-lg border border-white/10">
                  {Math.round(zoomLevel * 100)}%
                </div>
                <button
                  type="button"
                  title="Zoom In"
                  onClick={() => setZoomLevel(prev => Math.min(4, prev + 0.5))}
                  className="p-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all active:scale-95 cursor-pointer flex items-center justify-center"
                >
                  <ZoomIn size={13} />
                </button>
                <button
                  type="button"
                  title="Reset Scale"
                  onClick={() => {
                    setZoomLevel(1);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  className="p-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all active:scale-95 cursor-pointer flex items-center justify-center"
                >
                  <RotateCcw size={12} />
                </button>
                <div className="w-[1px] h-6 bg-white/15 mx-0.5" />
                <button
                  type="button"
                  title="Close Media"
                  onClick={() => setExpandedProduct(null)}
                  className="p-2 rounded-full bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 text-red-400 transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-lg"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Immersive Center Content Area */}
            <div 
              className="flex-grow flex items-center justify-center relative p-4"
              onMouseDown={(e) => {
                if (zoomLevel > 1) {
                  setIsDragging(true);
                  setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
                }
              }}
              onMouseMove={(e) => {
                if (isDragging && zoomLevel > 1) {
                  setPanOffset({
                    x: e.clientX - dragStart.x,
                    y: e.clientY - dragStart.y
                  });
                }
              }}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
            >
              <div className="relative overflow-visible">
                <motion.img
                  initial={{ scale: 0.94, opacity: 0 }}
                  animate={{ 
                    scale: zoomLevel,
                    x: panOffset.x, 
                    y: panOffset.y,
                    opacity: 1
                  }}
                  exit={{ scale: 0.94, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 350, damping: 32 }}
                  src={expandedProduct.productImageUrl || expandedProduct.imageUrl}
                  alt={expandedProduct.productName}
                  className="max-h-[55vh] max-w-[88vw] sm:max-h-[60vh] md:max-h-[66vh] object-contain rounded-3xl select-none pointer-events-auto shadow-[0_12px_60px_rgba(0,0,0,0.85)] border border-white/15"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Drag instruction overlay */}
              {zoomLevel > 1 && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 px-3 py-1 bg-black/70 backdrop-blur-md rounded-full border border-white/10 text-[9px] font-mono text-slate-300 flex items-center gap-1.5 uppercase tracking-wider animate-bounce shadow-xl">
                  <span>🖐️ Drag or swipe to pan around image details</span>
                </div>
              )}
            </div>

            {/* Modern Bottom Detail Panel Sheet */}
            <div className="w-full bg-[#11141C]/95 border-t border-white/10 p-5 pb-8 sm:p-6 backdrop-blur-md text-left z-10 shadow-2xl space-y-3.5">
              <div className="max-w-xl mx-auto space-y-3">
                
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1 overflow-hidden flex-grow">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-indigo-500/10 text-indigo-400 text-[8.5px] font-bold tracking-wider font-mono uppercase rounded-full border border-indigo-500/15">
                      Chef Recommendation Selection
                    </span>
                    <h2 className="text-base sm:text-lg font-black text-white tracking-tight uppercase leading-none mt-1 truncate">
                      {expandedProduct.productName}
                    </h2>
                    {expandedProduct.translatedName && (
                      <p className="text-[#FFC107] text-[11px] font-semibold italic mt-0.5">
                        ({expandedProduct.translatedName})
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[8px] font-mono text-slate-500 block uppercase font-black tracking-widest">Standard Price</span>
                    <span className="text-[#FFC107] font-black text-base font-mono block">
                      {expandedProduct.price.toLocaleString()} RWF
                    </span>
                  </div>
                </div>

                {expandedProduct.description ? (
                  <p className="text-xs text-slate-300 leading-relaxed font-sans max-h-24 overflow-y-auto pr-1">
                    {expandedProduct.description}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 font-sans italic">
                    No culinary description has been declared for this dish selection.
                  </p>
                )}

                {/* Extended Details Banner info */}
                <div className="pt-3.5 border-t border-[#11141C] sm:border-white/5 flex flex-wrap gap-2 items-center justify-between text-[10px] font-mono">
                  {/* Allergens tags list */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 uppercase tracking-wider text-[9px] font-bold">Allergens:</span>
                    {expandedProduct.allergens && expandedProduct.allergens.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {expandedProduct.allergens.map(al => {
                          const tag = ALLERGEN_MAP[al];
                          return tag ? (
                            <span key={al} className="px-1.5 py-0.5 bg-red-400/10 text-red-400 border border-red-500/20 rounded-md text-[8px]" title={tag.desc}>
                              {tag.icon} {tag.label}
                            </span>
                          ) : null;
                        })}
                      </div>
                    ) : (
                      <span className="text-emerald-400 bg-emerald-400/5 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[8px]">
                        🌿 Allergen Safe Choice
                      </span>
                    )}
                  </div>

                  {/* Status Indicator inside detail block */}
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500 uppercase tracking-wider text-[9px] font-bold">Kitchen:</span>
                    {expandedProduct.available ? (
                      <span className="text-emerald-400 font-bold bg-emerald-400/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        🟢 IN STOCK
                      </span>
                    ) : (
                      <span className="text-red-400 font-bold bg-red-400/10 px-1.5 py-0.5 rounded border border-red-500/20">
                        🔴 SOLD OUT
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedProduct(null)}
                  className="w-full mt-2 py-2.5 bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 text-white rounded-xl text-[11px] font-bold font-mono transition-transform duration-100 hover:scale-[1.01] cursor-pointer mt-2"
                >
                  Return to Menu Layout
                </button>

              </div>
            </div>

          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
