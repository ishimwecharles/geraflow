import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import { 
  db 
} from "../lib/firebase";
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  doc, 
  setDoc,
  updateDoc, 
  serverTimestamp 
} from "firebase/firestore";
import { Bill, BillItem, BillStatus, DeviceMode, Client } from "../lib/types";
import { safeLocalStorage } from "../lib/storage";
import { getBillUrl } from "../lib/urls";
import { 
  addToOfflineQueue, 
  getOfflineQueue, 
  syncOfflineQueue 
} from "../lib/offlineQueue";
import { 
  Utensils, 
  Plus, 
  Trash2, 
  Smartphone, 
  Monitor, 
  Tag, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Printer, 
  AlertCircle, 
  CloudLightning, 
  CloudOff, 
  RefreshCw, 
  Check, 
  ChevronRight, 
  User, 
  Hash, 
  DollarSign,
  Download,
  Flame,
  Lock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface QtyNumericInputProps {
  value: number | "";
  onChange: (val: number | "") => void;
  className?: string;
  placeholder?: string;
}

function QtyNumericInput({ value, onChange, className, placeholder }: QtyNumericInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState<string>("");

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(value === "" ? "" : String(value));
    }
  }, [value, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    setLocalValue(value === "" ? "" : String(value));
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (localValue === "") {
      onChange("");
    } else {
      const parsed = parseInt(localValue, 10);
      if (isNaN(parsed) || parsed < 1) {
        onChange(1);
      } else {
        onChange(parsed);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    
    if (/\D/.test(rawVal)) {
      console.warn("Price formatting validation failed");
    }

    const digitsOnly = rawVal.replace(/\D/g, "");
    setLocalValue(digitsOnly);
    
    if (digitsOnly === "") {
      onChange("");
    } else {
      onChange(parseInt(digitsOnly, 10));
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder={placeholder || "1"}
      value={localValue}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      className={className}
    />
  );
}

interface PriceNumericInputProps {
  value: number | "";
  onChange: (val: number | "") => void;
  className?: string;
  placeholder?: string;
}

function PriceNumericInput({ value, onChange, className, placeholder }: PriceNumericInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState<string>("");

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(value === "" ? "" : String(value));
    }
  }, [value, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    setLocalValue(value === "" || value === 0 ? "" : String(value));
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (localValue === "") {
      onChange("");
    } else {
      const priceRaw = localValue.replace(/[^0-9]/g, "");
      const parsed = parseInt(priceRaw, 10);
      if (isNaN(parsed) || parsed < 0) {
        onChange(0);
      } else {
        onChange(parsed);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    
    if (/[^0-9]/.test(rawVal) && rawVal !== "") {
      console.warn("Price formatting validation failed");
    }

    const priceRaw = rawVal.replace(/[^0-9]/g, "");
    setLocalValue(priceRaw);
    
    if (priceRaw === "") {
      onChange("");
    } else {
      onChange(parseInt(priceRaw, 10));
    }
  };

  const displayValue = isFocused 
    ? localValue 
    : (value === "" ? "" : `FRW ${value.toLocaleString()}`);

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder={placeholder || "Price"}
      value={displayValue}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      className={className}
    />
  );
}

interface RestaurantBillsViewProps {
  clients: Client[];
  toast: (msg: string, type: "success" | "error" | "info" | "warning") => void;
  userRole?: "super_admin" | "business_admin" | "cashier" | "waiter";
  forcedClient?: Client | null;
}

export default function RestaurantBillsView({ clients, toast, userRole = "super_admin", forcedClient = null }: RestaurantBillsViewProps) {
  // Device mode & Offline states
  const [deviceMode, setDeviceMode] = useState<DeviceMode>(() => {
    return (safeLocalStorage.getItem("gerapay_device_mode") as DeviceMode) || "admin";
  });

  // Keep deviceMode locked to specific roles
  useEffect(() => {
    if (userRole === "waiter") {
      setDeviceMode("waiter");
    } else if (userRole === "cashier") {
      setDeviceMode("cashier");
    }
  }, [userRole]);
  
  const [isOfflineTesting, setIsOfflineTesting] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  // Firestore & local UI states
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<BillStatus>("unpaid");

  // Load menu products for Quick Selector / Product image thumbnails
  const [menuProducts, setMenuProducts] = useState<any[]>([]);

  useEffect(() => {
    if (!selectedClient?.clientId) {
      setMenuProducts([]);
      return;
    }
    const qProducts = query(
      collection(db, "menuProducts"),
      where("businessId", "==", selectedClient.clientId)
    );
    const unsub = onSnapshot(qProducts, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      // Sort alphabetically by productName
      list.sort((a, b) => (a.productName || "").localeCompare(b.productName || ""));
      setMenuProducts(list);
    }, (err) => {
      console.error("Error fetching menuProducts in bills:", err);
    });
    return () => unsub();
  }, [selectedClient?.clientId]);

  // Create bill form states
  const [tableNumber, setTableNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [billItems, setBillItems] = useState<any[]>([
    { id: "1", name: "", qty: 1, price: 0, subtotal: 0 }
  ]);
  const [expiryMinutes, setExpiryMinutes] = useState("30"); // expiry length in minutes
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sticker QR print representation
  const [qrModalBill, setQrModalBill] = useState<Bill | null>(null);
  const [qrBase64, setQrBase64] = useState("");

  // Synchronize dynamic offline queue indicators
  const updateQueueCount = () => {
    setOfflineQueueCount(getOfflineQueue().length);
  };

  useEffect(() => {
    updateQueueCount();
    
    // Periodically sync if online
    const interval = setInterval(() => {
      if (navigator.onLine && !isOfflineTesting) {
        syncOfflineQueue(db, (msg) => {
          toast(msg, "success");
          updateQueueCount();
        });
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [isOfflineTesting]);

  // Handle local internet online dynamic registration
  useEffect(() => {
    const handleOnline = () => {
      if (!isOfflineTesting) {
        toast("Device network re-established. Syncing background transactions...", "info");
        syncOfflineQueue(db, (msg) => {
          toast(msg, "success");
          updateQueueCount();
        });
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [isOfflineTesting]);

  // Keep locally configured device state synced
  const handleDeviceModeChange = (mode: DeviceMode) => {
    setDeviceMode(mode);
    safeLocalStorage.setItem("gerapay_device_mode", mode);
    toast(`Device mode updated: ${mode.toUpperCase()} terminal active`, "success");
  };

  // Default select first store client profile if none chosen
  useEffect(() => {
    if (forcedClient) {
      setSelectedClient(forcedClient);
    } else if (clients.length > 0 && !selectedClient) {
      setSelectedClient(clients[0]);
    }
  }, [clients, selectedClient, forcedClient]);

  // Bind real-time bills listener for chosen Store Client
  useEffect(() => {
    if (!selectedClient) return;
    setLoading(true);

    const q = query(
      collection(db, "bills"),
      where("clientId", "==", selectedClient.clientId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: Bill[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Bill);
      });
      // Merge with any offline pending items in local cache queue for robust Optimistic UI
      const offlineItems = getOfflineQueue()
        .filter(act => act.type === "create_bill" && act.payload.clientId === selectedClient.clientId)
        .map(act => act.payload);

      // Filter out duplicates if they synchronized in background recently
      const merged = [...offlineItems, ...list].filter((value, index, self) =>
        index === self.findIndex((t) => t.billId === value.billId)
      );

      setBills(merged);
      setLoading(false);
    }, (err) => {
      console.error("Error loading bills from Firestore:", err);
      // Fallback: load offline cache
      const offlineItems = getOfflineQueue()
        .filter(act => act.type === "create_bill" && act.payload.clientId === selectedClient.clientId)
        .map(act => act.payload);
      setBills(offlineItems);
      setLoading(false);
    });

    return () => unsub();
  }, [selectedClient, offlineQueueCount]);

  // Bill items calculations
  const handleItemFieldChange = (index: number, field: string, val: any) => {
    const updated = [...billItems];
    const item = updated[index];
    
    if (field === "name") {
      item.name = val;
    } else if (field === "qty") {
      item.qty = val;
    } else if (field === "price") {
      item.price = val;
    }
    
    const qtyNum = item.qty === "" ? 0 : Number(item.qty);
    const priceNum = item.price === "" ? 0 : Number(item.price);
    item.subtotal = qtyNum * priceNum;
    setBillItems(updated);
  };

  const handleAddField = () => {
    setBillItems([
      ...billItems,
      { id: `${Date.now()}`, name: "", qty: 1, price: 0, subtotal: 0 }
    ]);
  };

  const handleRemoveField = (index: number) => {
    if (billItems.length === 1) return;
    setBillItems(billItems.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const subtotal = billItems.reduce((acc, current) => acc + current.subtotal, 0);
    return {
      subtotal,
      totalAmount: subtotal
    };
  };

  const handleCreateBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Blur active input so that local state finishes updating
    if (document.activeElement && typeof (document.activeElement as any).blur === "function") {
      (document.activeElement as any).blur();
    }

    if (!selectedClient) {
      toast("Define store registry client profile beforehand", "error");
      return;
    }

    if (!tableNumber.trim()) {
      toast("Table identification designation required", "warning");
      return;
    }

    // Clean and normalize all item prices and quantities
    const cleanedBillItems = billItems.map((item, index) => {
      const rawPriceStr = String(item.price === undefined || item.price === null ? "" : item.price);
      // Clean price: priceRaw = value.replace(/[^0-9]/g, "")
      const priceRaw = rawPriceStr.replace(/[^0-9]/g, "");
      // Convert price: priceNumber = Number(priceRaw)
      const priceNumber = priceRaw === "" ? 0 : Number(priceRaw);
      
      const rawQtyStr = String(item.qty === undefined || item.qty === null ? "" : item.qty);
      const qtyRaw = rawQtyStr.replace(/[^0-9]/g, "");
      const quantityNumber = qtyRaw === "" ? 1 : Number(qtyRaw);

      const isValid = priceNumber > 0 && quantityNumber > 0;

      // Console/debug status: price raw value, cleaned price, validation passed/failed
      console.log(`[Diagnostic] Item #${index + 1} ("${item.name || 'Unnamed'}") price raw value: "${rawPriceStr}", cleaned price: ${priceNumber}, validation passed: ${isValid}`);

      return {
        ...item,
        price: priceNumber,
        qty: quantityNumber,
        subtotal: priceNumber * quantityNumber
      };
    });

    // Filter out blank rows
    const activeItemsRaw = cleanedBillItems.filter(i => i.name.trim() !== "");
    if (activeItemsRaw.length === 0) {
      toast("Declare at least one food or beverage product", "warning");
      return;
    }

    // Validate that all active items have valid quantities (>= 1) and prices (>= 1)
    for (const item of activeItemsRaw) {
      if (item.qty <= 0) {
        toast(`Please specify a valid quantity for "${item.name}"`, "warning");
        return;
      }
      if (item.price <= 0) {
        toast("Please enter a valid price.", "warning");
        return;
      }
    }

    // Convert keys to strictly typesafe numbers for database integrity
    const activeItems: BillItem[] = activeItemsRaw.map(item => ({
      id: item.id,
      name: item.name.trim(),
      qty: item.qty,
      price: item.price,
      subtotal: item.subtotal
    }));

    setIsSubmitting(true);
    const subtotal = activeItems.reduce((acc, current) => acc + current.subtotal, 0);
    const totalAmount = subtotal;
    const uniqueBillNum = `BILL-${Math.floor(100000 + Math.random() * 900000)}`;

    const leaseMs = Number(expiryMinutes) * 60 * 1000;
    const expiresAtDate = new Date(Date.now() + leaseMs);

    // Document schema representation
    const billDoc: Bill = {
      billId: uniqueBillNum,
      clientId: selectedClient.clientId,
      businessName: selectedClient.businessName,
      tableNumber: tableNumber,
      customerName: customerName.trim() || undefined,
      items: activeItems,
      subtotal,
      totalAmount,
      currency: "RWF",
      status: "unpaid",
      createdAt: new Date(), // Local fallback
      expiresAt: expiresAtDate,
      paidAt: null,
      createdByDeviceMode: deviceMode,
      isOfflinePending: (isOfflineTesting || !navigator.onLine)
    };

    try {
      if (isOfflineTesting || !navigator.onLine) {
        // Queue action for offline syncing
        addToOfflineQueue("create_bill", "bills", billDoc);
        toast(`Offline Mode: ${uniqueBillNum} saved to local queue for table ${tableNumber}`, "info");
        updateQueueCount();
        setIsSubmitting(false);
        setShowCreateModal(false);
        resetForm();
      } else {
        // Save to Firebase directly
        const firebasePayload = {
          ...billDoc,
          createdAt: serverTimestamp(),
          expiresAt: expiresAtDate
        };
        delete firebasePayload.isOfflinePending;
        
        // Save to Firebase directly using the unique human-readable billId as the document identifier
        const billRef = doc(db, "bills", uniqueBillNum);
        await setDoc(billRef, firebasePayload);
        toast(`Invoice ${uniqueBillNum} issued in real-time for table ${tableNumber}!`, "success");
        setIsSubmitting(false);
        setShowCreateModal(false);
        resetForm();
      }
    } catch (err) {
      console.error("Failed to create bill", err);
      toast("Error synchronizing billing transaction. Saving offline standard payload.", "warning");
      addToOfflineQueue("create_bill", "bills", billDoc);
      updateQueueCount();
      setIsSubmitting(false);
      setShowCreateModal(false);
      resetForm();
    }
  };

  const resetForm = () => {
    setTableNumber("");
    setCustomerName("");
    setBillItems([{ id: "1", name: "", qty: 1, price: 0, subtotal: 0 }]);
    setExpiryMinutes("30");
  };

  // Change individual bill status (paid, cancelled)
  const handleUpdateStatus = async (billItem: Bill, status: BillStatus) => {
    // Permission check for high-compliance staff roles
    if (deviceMode === "waiter" && status !== "unpaid") {
      toast("Waiter terminal is restricted from modifying ledger authorization", "error");
      return;
    }

    const payload = {
      billDocId: billItem.id,
      billId: billItem.billId,
      status,
      paidAt: status === "paid" ? new Date().toISOString() : null,
      paymentMethod: status === "paid" ? "manually_marked_by_cashier" : null
    };

    try {
      if (isOfflineTesting || !navigator.onLine) {
        addToOfflineQueue("update_bill_status", "bills", payload);
        toast(`Offline Status Update: Set ${billItem.billId} to ${status.toUpperCase()}`, "info");
        updateQueueCount();
        
        // Optimistically update local bills view state
        setBills(prev => 
          prev.map(b => b.billId === billItem.billId ? { ...b, status, paidAt: status === "paid" ? new Date() : null, paymentMethod: payload.paymentMethod } : b)
        );
      } else {
        if (!billItem.id) {
          toast("Selected bill missing Firestore ID link. Re-trying using custom attributes.", "warning");
          return;
        }
        const billRef = doc(db, "bills", billItem.id);
        const updates: any = { status };
        if (status === "paid") {
          updates.paidAt = serverTimestamp();
          updates.paymentMethod = "manually_marked_by_cashier";
        }
        await updateDoc(billRef, updates);
        toast(`Bill ${billItem.billId} ledger status updated to ${status.toUpperCase()}`, "success");
      }
    } catch (err) {
      console.error("Status update failed:", err);
      addToOfflineQueue("update_bill_status", "bills", payload);
      updateQueueCount();
    }
  };

  // Print receipt QR sticker trigger
  const handleOpenQRSticker = async (billItem: Bill) => {
    setQrModalBill(billItem);
    const checkoutUrl = getBillUrl(billItem.billId);
    try {
      const b64 = await QRCode.toDataURL(checkoutUrl, {
        width: 400,
        margin: 2,
        color: {
          dark: "#0C0E14",
          light: "#FFFFFF"
        }
      });
      setQrBase64(b64);
    } catch (err) {
      console.error("Failed to compile sticker QR base64", err);
      toast("Sticker QR generation failed", "error");
    }
  };

  // Trigger manual sync override
  const handleForceManualSync = async () => {
    if (!navigator.onLine) {
      toast("Your web browser is offline. Check networking cables.", "error");
      return;
    }
    
    toast("Sync engine triggered manually. Consolidating database tables...", "info");
    await syncOfflineQueue(db, (msg) => {
      toast(msg, "success");
    });
    updateQueueCount();
  };

  const fmtRWF = (amt: number) => {
    return `FRW ${amt.toLocaleString()}`;
  };

  // Helper colors for status
  const getStatusBadge = (status: BillStatus) => {
    switch (status) {
      case "paid":
        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15";
      case "unpaid":
        return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/15";
      case "cancelled":
        return "bg-white/5 text-slate-400 border border-white/5";
      case "expired":
        return "bg-red-500/10 text-red-400 border border-red-500/15";
    }
  };

  const filteredBills = bills.filter(b => b.status === activeTab);

  if (!selectedClient) {
    return (
      <div className="p-8 text-center bg-[#11141C] border border-white/5 rounded-3xl space-y-4">
        <AlertCircle className="mx-auto text-[#FFC107]" size={36} />
        <div>
          <h3 className="text-white font-bold text-sm">No Registered Merchants Found</h3>
          <p className="text-xs text-slate-400 leading-normal max-w-sm mx-auto mt-2">
            Please register at least one Store Registry Client profile inside the "Store Registry" tab beforehand to authorize billing generators.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono text-xs">
      
      {/* Dynamic Network Connectivity + Device configuration Header panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Connection status tracker */}
        <div className="p-4 bg-[#11141C] border border-white/5 rounded-2xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-slate-500 text-[10px] uppercase font-bold block">PWA Network Gateway</span>
            <div className="flex items-center gap-2">
              {isOfflineTesting ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse" />
                  <span className="text-xs font-black text-yellow-400 uppercase font-sans">Sandbox Offline Mode</span>
                </>
              ) : navigator.onLine ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#00D68F] animate-ping" />
                  <span className="text-xs font-black text-emerald-400 uppercase font-sans">Firebase Online Synced</span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-black text-red-500 uppercase font-sans">No Network Connection</span>
                </>
              )}
            </div>
          </div>

          {/* Test toggle to let supervisors simulate offline scenarios */}
          <button
            onClick={() => {
              setIsOfflineTesting(!isOfflineTesting);
              toast(isOfflineTesting ? "Switched to live automatic Firebase network listening" : "Simulated offline sandbox model enabled. Updates will queue.", "info");
            }}
            className={`px-3 py-1.5 rounded-xl border text-[10px] uppercase font-bold transition-all cursor-pointer ${
              isOfflineTesting 
                ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" 
                : "bg-white/5 border-white/5 text-slate-400 hover:text-white"
            }`}
          >
            {isOfflineTesting ? <CloudOff size={13} className="inline mr-1" /> : <CloudLightning size={13} className="inline mr-1" />}
            Test {isOfflineTesting ? "Online" : "Offline"}
          </button>
        </div>

        {/* Offline cache indicators */}
        <div className="p-4 bg-[#11141C] border border-white/5 rounded-2xl flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-slate-500 text-[10px] uppercase font-bold block">Offline Pending Syncs</span>
            <span className="text-sm font-black text-white">{offlineQueueCount} queued actions</span>
          </div>

          {offlineQueueCount > 0 && (
            <button
              onClick={handleForceManualSync}
              className="px-3 py-1.5 bg-[#1B32FF] hover:brightness-110 text-white font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-sans"
            >
              <RefreshCw className="animate-spin" size={12} /> Sync Ledger
            </button>
          )}
        </div>

        {/* Device Mode controller (Waiters, Cashiers, Admins) */}
        <div className="p-4 bg-[#11141C] border border-white/5 rounded-2xl flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-slate-500 text-[10px] uppercase font-bold block">Active Terminal Role</span>
            <div className="flex items-center gap-1.5 text-xs text-slate-300 font-bold capitalize pt-0.5">
              {deviceMode === "admin" && <Monitor size={13} className="text-[#FFC107]" />}
              {deviceMode === "cashier" && <Smartphone size={13} className="text-indigo-400" />}
              {deviceMode === "waiter" && <Utensils size={13} className="text-emerald-400" />}
              <span>{deviceMode} Device</span>
            </div>
          </div>

          {(userRole === "waiter" || userRole === "cashier") ? (
            <span className="px-2.5 py-1.5 bg-zinc-950/40 text-slate-500 rounded-xl text-[10px] uppercase font-bold tracking-wider font-mono border border-white/5 flex items-center gap-1">
              <Lock size={10} className="text-indigo-400" /> LOCKED BY ROLE
            </span>
          ) : (
            <select
              value={deviceMode}
              onChange={(e) => handleDeviceModeChange(e.target.value as DeviceMode)}
              className="px-2.5 py-1.5 bg-[#1B1E28] border border-white/10 rounded-xl font-bold text-white focus:outline-none cursor-pointer"
            >
              <option value="admin">Admin Panel</option>
              <option value="cashier">Cashier Mode</option>
              <option value="waiter">Waiter Device</option>
            </select>
          )}
        </div>

      </div>

      {/* Primary Store Selection Toolbar */}
      <div className="p-4 bg-[#11141C] border border-white/5 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-500/10 text-indigo-400 rounded-xl flex items-center justify-center font-bold">
            <Utensils size={16} />
          </div>
          <div className="space-y-0.5">
            <span className="text-white font-bold text-sm">Restaurant & Bar Bill QR Engine</span>
            <p className="text-[10px] text-slate-500 font-sans">
              {forcedClient ? `Logged in to store: ${selectedClient?.businessName}` : "Create customer item listings, locking totals for instant USSD or online MoMo QR checkout."}
            </p>
          </div>
        </div>

        <div className="flex gap-2 items-center w-full md:w-auto">
          {forcedClient ? (
            <div className="px-4 py-2.5 bg-[#1B32FF]/10 text-indigo-400 border border-indigo-500/15 font-bold rounded-xl text-xs flex items-center gap-1.5 font-mono">
              <CheckCircle size={12} className="text-indigo-400" />
              <span>{selectedClient?.businessName}</span>
            </div>
          ) : (
            <select
              value={selectedClient?.clientId || ""}
              onChange={(e) => {
                const cli = clients.find(c => c.clientId === e.target.value);
                if (cli) setSelectedClient(cli);
              }}
              className="px-3.5 py-2.5 bg-zinc-950 border border-white/10 rounded-xl font-bold text-white focus:outline-none cursor-pointer w-full md:w-56"
            >
              {clients.map(c => (
                <option key={c.clientId} value={c.clientId}>{c.businessName} (GP-{c.clientId.split("-")[1]})</option>
              ))}
            </select>
          )}

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-[#1B32FF] hover:brightness-110 font-bold rounded-xl text-white flex items-center gap-1.5 cursor-pointer flex-shrink-0"
          >
            <Plus size={14} /> Create Bill
          </button>
        </div>
      </div>

      {/* Bills display table categorized by active check states */}
      <div className="space-y-4">
        <div className="flex border-b border-white/5 gap-1 overflow-x-auto pb-0.5">
          {(["unpaid", "paid", "expired", "cancelled"] as BillStatus[]).map(st => (
            <button
              key={st}
              onClick={() => setActiveTab(st)}
              className={`px-4 py-2 font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer capitalize text-[11px] ${
                activeTab === st 
                  ? "border-indigo-500 text-white" 
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {st} ({bills.filter(b => b.status === st).length})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500 font-mono flex flex-col items-center gap-2">
            <RefreshCw className="animate-spin" size={18} />
            <span>Synchronizing table bills list...</span>
          </div>
        ) : filteredBills.length === 0 ? (
          <div className="py-12 bg-[#11141C] rounded-2xl border border-white/5 text-center space-y-2 text-slate-500">
            <AlertCircle size={24} className="mx-auto text-indigo-400" />
            <p>No recorded {activeTab} bill models found for {selectedClient?.businessName}.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBills.map((b) => (
              <div 
                key={b.billId} 
                className={`p-5 bg-[#11141C] border rounded-2xl space-y-4 hover:border-white/10 transition-colors relative ${
                  b.isOfflinePending ? "border-dashed border-yellow-500/30" : "border-white/5"
                }`}
              >
                
                {b.isOfflinePending && (
                  <span className="absolute top-3 right-3 px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 font-sans font-bold rounded-full text-[8.5px] uppercase tracking-wider flex items-center gap-1 animate-pulse">
                    ⚠️ Saved Offline
                  </span>
                )}

                {/* Bill Header */}
                <div className="flex justify-between items-start">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-[#FFC107] font-mono tracking-widest block">{b.billId}</span>
                    <h4 className="text-white font-bold text-sm tracking-tight font-sans">{b.tableNumber} {b.customerName ? `(${b.customerName})` : ""}</h4>
                  </div>
                  
                  <span className={`px-2 py-0.5 rounded text-[8.5px] font-black uppercase ${getStatusBadge(b.status)}`}>
                    {b.status}
                  </span>
                </div>

                {/* Items Summarized list */}
                <div className="space-y-1.5 py-1.5 border-t border-b border-white/5">
                  {b.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between text-[11px] text-slate-400">
                      <span className="truncate max-w-[150px]">{it.name} <span className="text-slate-600">x{it.qty}</span></span>
                      <span className="font-mono text-slate-300 font-bold">{fmtRWF(it.subtotal)}</span>
                    </div>
                  ))}
                </div>

                {/* Bill Math readout */}
                <div className="flex justify-between items-end">
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-slate-500 uppercase tracking-widest block">LOCKED BILL TOTAL</span>
                    <span className="text-base font-black text-[#FFC107] font-mono leading-none">{fmtRWF(b.totalAmount)}</span>
                  </div>

                  <span className="text-[9.5px] text-slate-500 font-mono">
                    By Device: <strong className="text-slate-300 capitalize">{b.createdByDeviceMode}</strong>
                  </span>
                </div>

                {/* Action buttons (waiter has read-only restrict or manual markings depending on specifications) */}
                <div className="pt-2 flex gap-1.5 border-t border-white/5 justify-between">
                  
                  <button
                    onClick={() => handleOpenQRSticker(b)}
                    className="px-2.5 py-2 bg-white/5 text-slate-200 border border-white/10 hover:bg-white/10 rounded-xl flex-1 flex items-center justify-center gap-1.5 transition-all text-[11px] cursor-pointer"
                  >
                    <Printer size={12} /> Sticker QR
                  </button>

                  {b.status === "unpaid" && (
                    <>
                      {deviceMode !== "waiter" && (
                        <button
                          onClick={() => handleUpdateStatus(b, "paid")}
                          className="px-2.5 py-2 bg-[#00D68F]/10 border border-[#00D68F]/20 text-[#00D68F] hover:bg-[#00D68F]/20 rounded-xl transition-all text-center text-[11px] cursor-pointer font-bold"
                        >
                          Mark Paid
                        </button>
                      )}

                      {deviceMode !== "waiter" && (
                        <button
                          onClick={() => handleUpdateStatus(b, "cancelled")}
                          className="px-2.5 py-2 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-xl transition-all text-center text-[11px] cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </>
                  )}
                  
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

      {/* CREATE NEW BILL MODAL FRAME */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-[#0C0E14]/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-[#11141C] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
            >
              
              <div className="p-5 border-b border-white/5 bg-[#151922] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Utensils size={15} className="text-[#FFC107]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white">Issue One-Time Bill Invoice</span>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                  <XCircle size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateBillSubmit} className="p-5 space-y-4 font-mono max-h-[75vh] overflow-y-auto" noValidate>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9.5px] text-slate-500 uppercase font-black tracking-widest block">Table Location Designation *</label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={12} />
                      <input
                        type="text"
                        required
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                        placeholder="Table 4"
                        className="w-full pl-8 pr-3 py-2 bg-zinc-950 border border-white/10 text-xs text-white rounded-xl focus:outline-none focus:border-indigo-500 font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9.5px] text-slate-500 uppercase font-black tracking-widest block">Guest Name (Optional)</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={12} />
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Charles"
                        className="w-full pl-8 pr-3 py-2 bg-zinc-950 border border-white/10 text-xs text-slate-300 rounded-xl focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Expiry lease settings */}
                <div className="space-y-1">
                  <label className="text-[9.5px] text-slate-500 uppercase font-black tracking-widest block">Session Expiration Lease Time *</label>
                  <select
                    value={expiryMinutes}
                    onChange={(e) => setExpiryMinutes(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-white/10 text-xs text-white rounded-xl focus:outline-none cursor-pointer font-bold"
                  >
                    <option value="15">15 Minutes (Fast turnover coffees/drafts)</option>
                    <option value="30">30 Minutes (Regular dining checkout)</option>
                    <option value="60">1 Hour (Lounge bar / dynamic table lease)</option>
                    <option value="120">2 Hours (Vip business feeds)</option>
                  </select>
                </div>

                {/* Searchable / Quick Product Grid Selection */}
                {menuProducts.length > 0 && (
                  <div className="space-y-2 border-t border-white/5 pt-3">
                    <span className="text-[9.5px] text-slate-500 uppercase font-black tracking-widest block">Quick Menu Selector (Tap to Add)</span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[140px] overflow-y-auto pr-1">
                      {menuProducts.map(p => {
                        const isSelected = billItems.some(item => item.name === p.productName);
                        const countSelected = billItems.filter(item => item.name === p.productName).reduce((acc, curr) => acc + (curr.qty || 0), 0);

                        return (
                          <button
                            key={p.productId}
                            type="button"
                            onClick={() => {
                              // Add to bill items or increment quantity
                              const existingIndex = billItems.findIndex(item => item.name === p.productName);
                              if (existingIndex !== -1) {
                                const updated = [...billItems];
                                updated[existingIndex].qty = (updated[existingIndex].qty || 0) + 1;
                                updated[existingIndex].subtotal = updated[existingIndex].qty * updated[existingIndex].price;
                                setBillItems(updated);
                                toast(`Quantities updated for ${p.productName} (x${updated[existingIndex].qty})`, "info");
                              } else {
                                // Put into the first empty row if there is one, else append
                                const firstEmptyIndex = billItems.findIndex(item => item.name.trim() === "" && item.price === 0);
                                if (firstEmptyIndex !== -1) {
                                  const updated = [...billItems];
                                  updated[firstEmptyIndex] = {
                                    id: billItems[firstEmptyIndex].id,
                                    name: p.productName.trim(),
                                    qty: 1,
                                    price: p.price,
                                    subtotal: p.price,
                                    imageUrl: p.productImageUrl || p.imageUrl || ""
                                  };
                                  setBillItems(updated);
                                } else {
                                  setBillItems([
                                    ...billItems,
                                    {
                                      id: `${Date.now()}`,
                                      name: p.productName.trim(),
                                      qty: 1,
                                      price: p.price,
                                      subtotal: p.price,
                                      imageUrl: p.productImageUrl || p.imageUrl || ""
                                    }
                                  ]);
                                }
                                toast(`"${p.productName}" added to bill list!`, "success");
                              }
                            }}
                            className={`p-2 rounded-xl border flex items-center gap-2 text-left hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer ${
                              isSelected
                                ? "bg-indigo-600/10 border-indigo-500/40 text-indigo-300"
                                : "bg-zinc-950 border-white/5 text-slate-300 hover:border-white/10"
                            }`}
                          >
                            <div className="w-8 h-8 rounded-lg bg-white/5 overflow-hidden shrink-0 relative border border-white/10 flex items-center justify-center">
                              {(p.productImageUrl || p.imageUrl) ? (
                                <img src={p.productImageUrl || p.imageUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                              ) : (
                                <Utensils size={12} className="text-slate-500" />
                              )}
                              {countSelected > 0 && (
                                <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-indigo-600 border border-[#11141C] text-[8px] font-bold text-white rounded-full flex items-center justify-center leading-none">
                                  {countSelected}
                                </div>
                              )}
                            </div>
                            <div className="overflow-hidden leading-tight flex-grow">
                              <p className="font-bold truncate text-[10px] text-white">{p.productName}</p>
                              <p className="text-[8.5px] text-[#FFC107] font-mono">{p.price.toLocaleString()} RWF</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Dynamic Item list generator */}
                <div className="space-y-2 pt-2.5 border-t border-white/5">
                  <div className="flex justify-between items-center text-slate-400 capitalize">
                    <span>Menu Consumed Products</span>
                    <button
                      type="button"
                      onClick={handleAddField}
                      className="px-2.5 py-1 bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/30 font-bold text-[10px] uppercase rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Plus size={11} /> Add Item
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {billItems.map((item, index) => (
                      <div key={item.id} className="grid grid-cols-12 gap-2 items-center bg-white/[0.01] p-2.5 border border-white/5 rounded-2xl">
                        
                        {/* 1. Thumbnail Column */}
                        <div className="col-span-2 flex justify-center">
                          <div className="w-9 h-9 rounded-lg bg-zinc-950 border border-white/10 overflow-hidden relative shrink-0 flex items-center justify-center">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-slate-900 border border-white/5">
                                <Utensils size={13} className="text-slate-600" />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 2. Selection Dropdown Column with fallback for custom name editing */}
                        <div className="col-span-5">
                          {menuProducts.length > 0 ? (
                            <div className="space-y-1">
                              <select
                                value={menuProducts.some(p => p.productName === item.name) ? item.name : ""}
                                onChange={(e) => {
                                  const selectedName = e.target.value;
                                  if (!selectedName) {
                                    // Reset to manual text input
                                    const updated = [...billItems];
                                    updated[index] = {
                                      ...updated[index],
                                      name: "",
                                      imageUrl: ""
                                    };
                                    setBillItems(updated);
                                    return;
                                  }
                                  const selectedProduct = menuProducts.find(p => p.productName === selectedName);
                                  if (selectedProduct) {
                                    const updated = [...billItems];
                                    updated[index] = {
                                      ...updated[index],
                                      name: selectedProduct.productName,
                                      price: selectedProduct.price,
                                      subtotal: selectedProduct.price * (updated[index].qty || 1),
                                      imageUrl: selectedProduct.productImageUrl || selectedProduct.imageUrl || ""
                                    };
                                    setBillItems(updated);
                                  }
                                }}
                                className="w-full px-2 py-1.5 bg-zinc-950 border border-white/10 text-[11px] text-white rounded-lg focus:outline-none focus:border-indigo-500 font-bold cursor-pointer"
                              >
                                <option value="">-- custom / type manual --</option>
                                {menuProducts.map(p => (
                                  <option key={p.productId} value={p.productName}>
                                    {p.productName} ({p.price.toLocaleString()} RWF)
                                  </option>
                                ))}
                              </select>
                              {/* Show direct text input overlay if user selected manual custom state */}
                              {(!menuProducts.some(p => p.productName === item.name)) && (
                                <input
                                  type="text"
                                  required={index === 0}
                                  placeholder="Type manual product..."
                                  value={item.name}
                                  onChange={(e) => handleItemFieldChange(index, "name", e.target.value)}
                                  className="w-full px-2 py-1 bg-zinc-950 border border-indigo-500/10 text-[10px] text-white rounded focus:outline-none"
                                />
                              )}
                            </div>
                          ) : (
                            <input
                              type="text"
                              required={index === 0}
                              placeholder="Aperol Spritz, Pizza..."
                              value={item.name}
                              onChange={(e) => handleItemFieldChange(index, "name", e.target.value)}
                              className="w-full px-3 py-1.5 bg-zinc-950 border border-white/10 text-xs text-white rounded-lg focus:outline-none"
                            />
                          )}
                        </div>

                        {/* 3. Quantity input Column */}
                        <div className="col-span-2">
                          <QtyNumericInput
                            value={item.qty}
                            onChange={(val) => handleItemFieldChange(index, "qty", val)}
                            className="w-full px-1 py-1.5 bg-zinc-950 border border-white/10 text-xs text-white rounded-lg focus:outline-none text-center font-bold"
                            placeholder="1"
                          />
                        </div>

                        {/* 4. Price numeric Column */}
                        <div className="col-span-2">
                          <PriceNumericInput
                            value={item.price}
                            onChange={(val) => handleItemFieldChange(index, "price", val)}
                            className="w-[#11141C] min-w-full px-1 py-1.5 bg-[#0e111a] border border-white/10 text-[10px] text-white rounded-lg focus:outline-none font-bold text-center"
                            placeholder="Price"
                          />
                        </div>

                        {/* 5. Delete item button Column */}
                        <div className="col-span-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveField(index)}
                            disabled={billItems.length === 1}
                            className="text-slate-500 hover:text-red-400 disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                      </div>
                    ))}
                  </div>
                </div>

                {/* Subtotal preview block */}
                <div className="p-4 bg-white/[0.01]/30 border border-white/5 rounded-2xl flex justify-between items-center">
                  <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Total Invoice Value (FRW Lock):</span>
                  <span className="text-base font-black text-[#FFC107] font-mono">{fmtRWF(calculateTotals().totalAmount)}</span>
                </div>

                {/* Trigger buttons */}
                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-3 border border-white/15 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all cursor-pointer font-bold text-xs uppercase"
                  >
                    Close Drawer
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase rounded-xl shadow-lg cursor-pointer transition-all flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="animate-spin text-white" size={13} />
                        Writing ledger...
                      </>
                    ) : (
                      <>
                        <span>✔️ {isOfflineTesting || !navigator.onLine ? "Save Locally (Offline)" : "Issue Live Bill QR"}</span>
                      </>
                    )}
                  </button>
                </div>

              </form>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* STICKER QR PRINT MODAL */}
      <AnimatePresence>
        {qrModalBill && (
          <div className="fixed inset-0 bg-[#0C0E14]/85 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
             className="w-full max-w-[380px] max-h-[90vh] overflow-y-auto bg-white text-[#0C0E14] rounded-3xl p-6 font-mono text-center space-y-5"
            ><div className="flex justify-end">
  <button
    onClick={() => setQrModalBill(null)}
    className="px-3 py-1 bg-red-500 text-white rounded-lg"
  >
    ✕ Close
  </button>
</div>
              
              {/* Sticker Content Area for easy printing and scan */}
              <div id="qr-sticker-printable" className="p-4 border-2 border-[#0C0E14] rounded-2xl bg-white space-y-4">
                
                <div className="space-y-1">
                  <div className="w-10 h-10 rounded-xl bg-[#1B32FF] text-white flex items-center justify-center mx-auto shadow-md mb-2">
                    <Utensils size={18} />
                  </div>
                  <div className="text-[10px] font-black text-indigo-600 bg-[#1B32FF]/5 border border-indigo-100 rounded-full px-3 py-1 inline-block uppercase tracking-wider mb-1 font-sans">
                    ★ Bill QR ★
                  </div>
                  <h3 className="font-extrabold text-xs uppercase tracking-widest font-sans">{qrModalBill.businessName}</h3>
                  <p className="text-[10px] text-slate-500 font-sans tracking-wide">Kigali Arena Branch</p>
                </div>

                {/* Table representation */}
                <div className="py-2.5 border-t border-b border-dashed border-slate-300 font-bold space-y-0.5 text-[#0C0E14]">
                  <p className="text-xl font-sans uppercase font-black">{qrModalBill.tableNumber}</p>
                  {qrModalBill.customerName && <p className="text-[10.5px] font-sans">Guest: {qrModalBill.customerName}</p>}
                </div>

                {/* Large QR Display */}
                {qrBase64 ? (
                  <div className="p-2 border border-slate-100 rounded-xl bg-white inline-block shadow-sm">
                   <img src={qrBase64} className="w-[120px] h-[120px] mx-auto" alt="Order QR" />
                  </div>
                ) : (
                  <div className="py-12 text-slate-400 font-bold">Creating Code Matrix...</div>
                )}

                {/* Bill Amount representation */}
                <div className="space-y-1 bg-slate-50 p-3 rounded-xl border border-dashed border-slate-200">
                  <span className="text-[8.5px] text-slate-500 uppercase tracking-wider block">Exclusive Bill Amount</span>
                  <span className="text-lg font-black block font-sans text-indigo-700">{fmtRWF(qrModalBill.totalAmount)}</span>
                  <p className="text-[8px] text-slate-400 font-sans leading-tight">Amount is locked. Scan to see consumed foods & pay safely instantly.</p>
                </div>

                {/* Footer instructions */}
                <div className="text-[8.5px] text-slate-500 font-sans pt-1 leading-normal max-w-[220px] mx-auto">
                  Scan QR with phone camera • Open web link to checkout securely using standard MTN MoMo or Offline USSD prompts safely.
                </div>
              </div>

              {/* Action buttons (Print and Close) */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setQrModalBill(null)}
                  className="flex-1 py-3 bg-[#0C0E14]/10 hover:bg-[#0C0E14]/15 rounded-xl font-bold font-sans text-xs uppercase text-slate-800 transition-colors cursor-pointer"
                >
                  Close Sticker
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const link = document.createElement("a");
                    link.href = qrBase64;
                    link.download = `GeraPay_BillSticker_${qrModalBill.tableNumber.replace(/[^a-z0-9]/gi, "_")}-${qrModalBill.billId}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast("QR Sticker downloaded for printing successfully", "success");
                  }}
                  className="flex-1 py-3 bg-[#1B32FF] hover:brightness-110 text-white font-extrabold font-sans text-xs uppercase rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Download size={13} /> Save Image
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
