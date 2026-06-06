import React, { useState, useEffect } from "react";
import { 
  Plus, 
  Key, 
  Trash2, 
  ToggleLeft, 
  ToggleRight, 
  Smartphone, 
  UserPlus, 
  ShieldAlert, 
  Search, 
  RefreshCw, 
  Laptop, 
  Tablet, 
  Smartphone as Phone, 
  CheckCircle, 
  XCircle,
  Edit,
  Sliders,
  Users,
  Settings,
  BarChart3,
  TrendingUp,
  MapPin,
  Tag,
  Building,
  CreditCard,
  Lock,
  MessageSquare,
  AlertTriangle,
  FileCheck,
  Check
} from "lucide-react";
import { 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy,
  onSnapshot,
  getDoc
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";

interface ClientAccessViewProps {
  currentBusinessId: string;
  businessName: string;
  maxStaffAllowed: number;
  maxDevicesAllowed: number;
  toast: (message: string, type?: "success" | "error" | "info" | "warning") => void;
  initialTab?: "staff" | "devices" | "reports" | "settings";
}

const CATEGORIES = [
  "Retail / Merchant Shop",
  "Food & Beverage / Restaurant",
  "Pharmacy & Cosmetics",
  "Electronics & Hardware",
  "Farming & Agriculture",
  "Transport & Logistics",
  "Service Provider / Consultancy",
  "Education & Tutoring",
  "Other Services"
];

export default function ClientAccessView({ 
  currentBusinessId, 
  businessName, 
  maxStaffAllowed = 5, 
  maxDevicesAllowed = 3, 
  toast,
  initialTab = "staff"
}: ClientAccessViewProps) {
  // Main Sub-tabs: staff, devices, reports, settings
  const [activeTab, setActiveTab] = useState<"staff" | "devices" | "reports" | "settings">(initialTab);

  const [staff, setStaff] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [clientProfile, setClientProfile] = useState<any | null>(null);

  const [loadingStaff, setLoadingStaff] = useState(true);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Create Staff Form State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "", // password / PIN
    role: "waiter", // waiter or cashier
    active: true,
  });

  // Edit/Rename Device Label States
  const [editingDevice, setEditingDevice] = useState<any | null>(null);
  const [showEditDeviceModal, setShowEditDeviceModal] = useState(false);

  // Settings form states
  const [settingsName, setSettingsName] = useState("");
  const [settingsOwner, setSettingsOwner] = useState("");
  const [settingsPhone, setSettingsPhone] = useState("");
  const [settingsLocation, setSettingsLocation] = useState("");
  const [settingsCategory, setSettingsCategory] = useState("");
  const [settingsQrType, setSettingsQrType] = useState<"local" | "international">("local");

  // Filter device lists
  const [deviceFilter, setDeviceFilter] = useState<"all" | "approved" | "pending" | "blocked">("all");

  // Keep internal standard states synced
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Load staff belonging to this business ID
  useEffect(() => {
    if (!currentBusinessId) return;
    setLoadingStaff(true);
    const path = "users";
    
    const q = query(
      collection(db, path), 
      where("businessId", "==", currentBusinessId)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        const d = doc.data();
        if (d.role !== "business_admin" && d.role !== "super_admin") {
          list.push({ id: doc.id, ...d });
        }
      });
      setStaff(list);
      setLoadingStaff(false);
    }, (err) => {
      console.error("Error loading staff:", err);
      handleFirestoreError(err, OperationType.LIST, path);
      setLoadingStaff(false);
    });

    return () => unsub();
  }, [currentBusinessId]);

  // Load devices belonging to this business ID
  useEffect(() => {
    if (!currentBusinessId) return;
    setLoadingDevices(true);
    const path = "devices";
    
    const q = query(
      collection(db, path), 
      where("businessId", "==", currentBusinessId)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setDevices(list);
      setLoadingDevices(false);
    }, (err) => {
      console.error("Error loading devices:", err);
      handleFirestoreError(err, OperationType.LIST, path);
      setLoadingDevices(false);
    });

    return () => unsub();
  }, [currentBusinessId]);

  // Load bill list for Reports aggregations
  useEffect(() => {
    if (!currentBusinessId) return;
    setLoadingReports(true);
    const path = "bills";
    
    const q = query(
      collection(db, path), 
      where("clientId", "==", currentBusinessId)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setBills(list);
      setLoadingReports(false);
    }, (err) => {
      console.error("Error loading bills for reports:", err);
      handleFirestoreError(err, OperationType.LIST, path);
      setLoadingReports(false);
    });

    return () => unsub();
  }, [currentBusinessId]);

  // Load exact business client settings profile from Firestore
  useEffect(() => {
    if (!currentBusinessId) return;
    setLoadingSettings(true);
    
    const fetchProfile = async () => {
      try {
        const q = query(collection(db, "clients"), where("clientId", "==", currentBusinessId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          const data = docSnap.data();
          setClientProfile({ id: docSnap.id, ...data });
          
          // Pre-populate fields
          setSettingsName(data.businessName || "");
          setSettingsOwner(data.ownerName || "");
          setSettingsPhone(data.phone || "");
          setSettingsLocation(data.location || "");
          setSettingsCategory(data.category || CATEGORIES[0]);
          setSettingsQrType(data.qrType || "local");
        }
        setLoadingSettings(false);
      } catch (err) {
        console.error("Error settings profile fetch:", err);
        setLoadingSettings(false);
      }
    };

    fetchProfile();
  }, [currentBusinessId]);

  // Total pending notification count
  const pendingDevicesCount = devices.filter(d => d.status === "pending_approval" || d.status === "pending").length;

  // Handle staff creation
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.password || !formData.fullName) {
      toast("Please complete all required fields", "warning");
      return;
    }

    if (staff.length >= maxStaffAllowed) {
      toast(`Staff limit reached (${maxStaffAllowed} allowed). Upgrade plan to add more.`, "error");
      return;
    }

    const emailExists = staff.some(s => s.email.toLowerCase() === formData.email.toLowerCase());
    if (emailExists) {
      toast("This email is already registered", "error");
      return;
    }

    try {
      const path = "users";
      await addDoc(collection(db, path), {
        uid: "GP-UID-STAFF-" + Math.floor(100000 + Math.random() * 900000),
        fullName: formData.fullName.trim(),
        displayName: formData.fullName.trim(),
        email: formData.email.trim(),
        password: formData.password.trim(),
        role: formData.role,
        businessId: currentBusinessId,
        businessName: businessName,
        active: formData.active,
        createdAt: new Date().toISOString()
      });

      toast(`Staff member ${formData.email} registered successfully!`, "success");
      setShowCreateModal(false);
      resetForm();
    } catch (err) {
      toast("Failed to register staff member", "error");
      handleFirestoreError(err, OperationType.CREATE, "users");
    }
  };

  const resetForm = () => {
    setFormData({
      fullName: "",
      email: "",
      password: "",
      role: "waiter",
      active: true,
    });
  };

  // Staff state manipulation
  const handleToggleStaffStatus = async (member: any) => {
    try {
      const staffRef = doc(db, "users", member.id);
      await updateDoc(staffRef, {
        active: !member.active
      });
      toast(`Staff account ${member.email} status toggled.`, "success");
    } catch (err) {
      toast("Status update failed", "error");
      handleFirestoreError(err, OperationType.UPDATE, `users/${member.id}`);
    }
  };

  const handleDeleteStaff = async (member: any) => {
    if (!window.confirm(`Warning: Permanently delete ${member.fullName || member.email}?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, "users", member.id));
      toast("Staff access credentials removed successfully.", "success");
    } catch (err) {
      toast("De-allocation failure", "error");
      handleFirestoreError(err, OperationType.DELETE, `users/${member.id}`);
    }
  };

  const handleResetPIN = async (member: any, newPIN: string) => {
    if (!newPIN) return;
    try {
      const staffRef = doc(db, "users", member.id);
      await updateDoc(staffRef, {
        password: newPIN
      });
      toast(`Credential updated. New Code: ${newPIN}`, "success");
    } catch (err) {
      toast("Update failed", "error");
      handleFirestoreError(err, OperationType.UPDATE, `users/${member.id}`);
    }
  };

  // Device status approvals actions
  const handleApproveDevice = async (device: any) => {
    const activeDevicesCount = devices.filter(d => d.status === "approved" || d.active === true).length;
    if (activeDevicesCount >= maxDevicesAllowed) {
      toast(`Device limit reached. Contact your Business Administrator. Limit is ${maxDevicesAllowed} devices.`, "error");
      return;
    }

    try {
      const devRef = doc(db, "devices", device.id);
      await updateDoc(devRef, {
        status: "approved",
        active: true,
        approvedAt: new Date().toISOString()
      });
      toast(`Device ${device.deviceName} has been approved and bound.`, "success");
    } catch (err) {
      toast("Action failed", "error");
      handleFirestoreError(err, OperationType.UPDATE, `devices/${device.id}`);
    }
  };

  const handleRejectDevice = async (device: any) => {
    try {
      const devRef = doc(db, "devices", device.id);
      await updateDoc(devRef, {
        status: "rejected",
        active: false,
        rejectedAt: new Date().toISOString()
      });
      toast(`Device node request rejected.`, "info");
    } catch (err) {
      toast("Action failed", "error");
    }
  };

  const handleBlockDevice = async (device: any) => {
    try {
      const devRef = doc(db, "devices", device.id);
      await updateDoc(devRef, {
        status: "blocked",
        active: false,
        blockedAt: new Date().toISOString()
      });
      toast(`Device bound terminal status set to BLOCKED.`, "warning");
    } catch (err) {
      toast("Action failed", "error");
    }
  };

  const handleRemoveDevice = async (device: any) => {
    if (!window.confirm(`Deregister device ${device.deviceName}? This releases this hardware seat immediately.`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, "devices", device.id));
      toast("Hardware device registry cleared.", "success");
    } catch (err) {
      toast("Clearance failed", "error");
    }
  };

  const handleUpdateDeviceName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice) return;
    const nameInput = (document.getElementById("edit-device-input-name") as HTMLInputElement)?.value;
    if (!nameInput) return;

    try {
      const devRef = doc(db, "devices", editingDevice.id);
      await updateDoc(devRef, {
        deviceName: nameInput.trim()
      });
      toast("Terminal moniker updated successfully.", "success");
      setShowEditDeviceModal(false);
      setEditingDevice(null);
    } catch (err) {
      toast("Renaming failed", "error");
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientProfile?.id) {
      toast("Settings loaded improperly. Please refresh page.", "error");
      return;
    }

    setSavingSettings(true);
    try {
      const clientRef = doc(db, "clients", clientProfile.id);
      await updateDoc(clientRef, {
        businessName: settingsName.trim(),
        ownerName: settingsOwner.trim(),
        phone: settingsPhone.trim(),
        location: settingsLocation.trim(),
        category: settingsCategory,
        qrType: settingsQrType,
        updatedAt: new Date().toISOString()
      });

      toast("Business profile settings successfully synced!", "success");
    } catch (err) {
      toast("Error saving business profile", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  // Reports Computations
  const totalInvoiced = bills.length;
  const paidBills = bills.filter(b => b.status === "paid");
  const unpaidBills = bills.filter(b => b.status === "unpaid");
  const cancelledBills = bills.filter(b => b.status === "cancelled");
  const expiredBills = bills.filter(b => b.status === "expired");

  const totalRevenue = paidBills.reduce((acc, current) => acc + (current.totalAmount || 0), 0);
  const receivableLedger = unpaidBills.reduce((acc, current) => acc + (current.totalAmount || 0), 0);
  const collectionRate = totalInvoiced > 0 ? Math.round((paidBills.length / totalInvoiced) * 100) : 0;

  // Format money helper
  const fmtRWF = (amt: number) => {
    return `FRW ${amt.toLocaleString()}`;
  };

  return (
    <div className="space-y-6 animate-fade-in font-sans pb-12">
      
      {/* Top Notification Banner if Pending Devices exist */}
      {pendingDevicesCount > 0 && activeTab !== "devices" && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-pulse">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle size={16} />
            <span className="font-bold">
              Notice: There are {pendingDevicesCount} terminal hardware login requests waiting for manual approval.
            </span>
          </div>
          <button 
            onClick={() => setActiveTab("devices")}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[10px] rounded-lg transition-transform cursor-pointer shadow active:scale-95 text-center shrink-0"
          >
            RESOLVE NOW
          </button>
        </div>
      )}

      {/* Header Visual Plate */}
      <div className="bg-[#11141C] border border-white/5 p-5 rounded-3xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-5 shadow">
        <div className="absolute top-0 right-0 w-80 h-44 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="space-y-1 z-10">
          <span className="text-[9px] font-mono text-[#FFC107] uppercase tracking-widest font-bold">Kigali Secure Terminal</span>
          <h2 className="text-xl font-black text-white tracking-tight">{businessName} Console</h2>
          <p className="text-xs text-slate-400">
            Assign waiter & cashier security PIN authorization cards, manage terminal hardware registrations, audit revenues and settings.
          </p>
        </div>
        
        {/* Tab Selection */}
        <div className="bg-zinc-950 p-1 rounded-xl flex items-center border border-white/5 z-10 shrink-0 select-none">
          <button
            onClick={() => setActiveTab("staff")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "staff" ? "bg-[#1B32FF] text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <Users size={12} /> Staff
          </button>
          <button
            onClick={() => setActiveTab("devices")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 relative ${
              activeTab === "devices" ? "bg-[#1B32FF] text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <Smartphone size={12} /> Devices
            {pendingDevicesCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 border-2 border-zinc-950 rounded-full animate-ping" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "reports" ? "bg-[#1B32FF] text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <BarChart3 size={12} /> Reports
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "settings" ? "bg-[#1B32FF] text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <Settings size={12} /> Settings
          </button>
        </div>
      </div>

      {/* RENDER ACTIVE TAB */}
      <div className="animate-fade-in block">
        
        {/* TAB 1: STAFF DIRECTORY */}
        {activeTab === "staff" && (
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-[#11141C] border border-white/5 rounded-[24px] p-5 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div>
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                    Staff Accounts & Security PINs
                  </span>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Waiters create invoices and receipts. Cashiers can log and mark payments as paid.
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-[#1B32FF] hover:bg-blue-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow cursor-pointer transition-all active:scale-95 uppercase tracking-wide shrink-0"
                >
                  <UserPlus size={13} /> Add Waiter / Cashier
                </button>
              </div>

              {/* staff metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1">
                {[
                  { label: "Licensed Limit", val: `${maxStaffAllowed} Seats`, desc: "Plan ceiling limit" },
                  { label: "Active Team Size", val: `${staff.length} Users`, desc: "Registered on roster", highlight: true },
                  { label: "Waiters On Call", val: `${staff.filter(s => s.role === "waiter").length} Operators`, desc: "Invoicing permissions" },
                  { label: "Cashiers Bound", val: `${staff.filter(s => s.role === "cashier").length} Operators`, desc: "Settlement permission" }
                ].map((st, i) => (
                  <div key={i} className="p-3 bg-white/[0.01] border border-white/5 rounded-2xl flex flex-col justify-between text-xs">
                    <span className="text-slate-500 font-medium text-[10px] uppercase truncate">{st.label}</span>
                    <span className={`text-[#FFC107] font-bold font-mono text-base block mt-1 ${st.highlight ? "text-indigo-400" : ""}`}>
                      {st.val}
                    </span>
                    <span className="text-[9px] text-slate-500 mt-0.5">{st.desc}</span>
                  </div>
                ))}
              </div>

              {/* staff directories table */}
              <div className="overflow-x-auto pt-3">
                {loadingStaff ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                    <RefreshCw size={14} className="animate-spin text-indigo-500" />
                    <span>Checking staffing rosters...</span>
                  </div>
                ) : staff.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs leading-relaxed max-w-sm mx-auto">
                    No custom waiter or cashier access profiles on file. Click the button above to register a new team member.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/5 text-slate-500 uppercase font-mono text-[9px]">
                        <th className="pb-3 font-semibold pl-2">Staff Member / Name</th>
                        <th className="pb-3 font-semibold text-center">In-App Role</th>
                        <th className="pb-3 font-semibold">Authorized Password/PIN</th>
                        <th className="pb-3 font-semibold text-center">Status</th>
                        <th className="pb-3 font-semibold text-right pr-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {staff.map((member) => (
                        <tr key={member.id} className="hover:bg-white/[0.01] transition-colors">
                          <td className="py-3 pl-2">
                            <span className="font-bold text-white block">{member.fullName || "Unnamed Associate"}</span>
                            <span className="text-[10px] text-slate-400 block font-mono">{member.email}</span>
                          </td>
                          <td className="py-3 text-center">
                            <span className={`inline-block text-[9px] px-2 py-0.5 rounded font-mono uppercase font-black ${
                              member.role === "cashier" ? "bg-indigo-500/10 text-indigo-400" : "bg-emerald-500/10 text-emerald-400"
                            }`}>
                              {member.role === "cashier" ? "Cashier" : "Waiter"}
                            </span>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-[#FFC107] font-black">{member.password}</span>
                              <button
                                onClick={() => {
                                  const pin = window.prompt("Submit string security credential or 4-digit PIN for this member:", member.password);
                                  if (pin) handleResetPIN(member, pin);
                                }}
                                className="text-[9px] text-[#1B32FF] hover:underline font-extrabold cursor-pointer uppercase transition-colors"
                              >
                                Edit PIN
                              </button>
                            </div>
                          </td>
                          <td className="py-3 text-center">
                            <button
                              onClick={() => handleToggleStaffStatus(member)}
                              className="mx-auto block active:scale-95 cursor-pointer text-[10px]"
                            >
                              {member.active ? (
                                <span className="text-[9px] bg-emerald-500/10 text-emerald-400 font-extrabold font-mono px-2 py-0.5 rounded-full border border-emerald-500/15">
                                  ACTIVE
                                </span>
                              ) : (
                                <span className="text-[9px] bg-red-400/10 text-red-500 font-extrabold font-mono px-2 py-0.5 rounded-full border border-red-500/15">
                                  DEACTIVATED
                                </span>
                              )}
                            </button>
                          </td>
                          <td className="py-3 text-right pr-2">
                            <button
                              onClick={() => handleDeleteStaff(member)}
                              className="p-1.5 text-red-500/70 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors"
                              title="Delete Account"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DEVICE TERMINAL LOCKS */}
        {activeTab === "devices" && (
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-[#11141C] border border-white/5 rounded-[24px] p-5 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div>
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                    Bound Terminal Registry Locks
                  </span>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Secure hardlock system. Only approved devices with validated hardware fingerprints may authenticate and logs invoice states.
                  </p>
                </div>
                
                {/* Status Segment controls */}
                <div className="flex bg-zinc-950 p-1 border border-white/5 rounded-lg text-[10px] font-bold select-none shrink-0">
                  {(["all", "approved", "pending", "blocked"] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setDeviceFilter(filter)}
                      className={`px-2.5 py-1 rounded capitalize cursor-pointer transition-colors ${
                        deviceFilter === filter ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {filter} {filter === "pending" && pendingDevicesCount > 0 && `(${pendingDevicesCount})`}
                    </button>
                  ))}
                </div>
              </div>

              {/* device quotas warning */}
              <div className="p-3.5 bg-[#171A24] border border-[#1B32FF]/10 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs leading-normal">
                <div className="space-y-0.5">
                  <span className="text-[#FFC107] font-bold uppercase block text-[10px] tracking-wider font-mono">
                    Device Capacity quota: {devices.filter(d => d.status === "approved" || d.active === true).length} / {maxDevicesAllowed} Active Hardware Slots Busy
                  </span>
                  <p className="text-slate-400 text-[10.5px]">
                    To approve a pending terminal request if your license limit is reached, you must release / delete an old active card below.
                  </p>
                </div>
                <div className="text-indigo-400 font-mono font-extrabold px-3 py-1 bg-indigo-500/10 rounded-lg text-[9px] border border-indigo-500/15 uppercase tracking-wider shrink-0 select-none">
                  Plan Limit: {maxDevicesAllowed} Terminal slots
                </div>
              </div>

              {/* device block directory */}
              <div className="space-y-3 pt-2">
                {loadingDevices ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                    <RefreshCw size={14} className="animate-spin text-indigo-500" />
                    <span>Querying browser token arrays...</span>
                  </div>
                ) : devices.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    No hardware browser logins mapped in database. Let staff log in from their tablets/phones.
                  </div>
                ) : (
                  devices
                    .filter(d => {
                      if (deviceFilter === "all") return true;
                      if (deviceFilter === "pending") return d.status === "pending_approval" || d.status === "pending";
                      if (deviceFilter === "approved") return d.status === "approved" || d.active === true;
                      if (deviceFilter === "blocked") return d.status === "blocked" || d.status === "rejected";
                      return true;
                    })
                    .map((dev) => {
                      const isPending = dev.status === "pending_approval" || dev.status === "pending";
                      const isBlocked = dev.status === "blocked" || dev.status === "rejected";
                      const isApproved = dev.status === "approved" || dev.active === true;

                      return (
                        <div 
                          key={dev.id} 
                          className={`p-4 bg-zinc-950/40 border rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors ${
                            isPending 
                              ? "border-amber-500/30 bg-amber-500/[0.01]" 
                              : isBlocked 
                                ? "border-red-500/20 bg-red-500/[0.01]" 
                                : "border-white/5 hover:border-white/10"
                          }`}
                        >
                          <div className="space-y-1 overflow-hidden">
                            <div className="flex items-center gap-2">
                              {dev.deviceType === "pc" ? <Laptop size={14} className="text-blue-400" /> : dev.deviceType === "tablet" ? <Tablet size={14} className="text-indigo-400" /> : <Smartphone size={14} className="text-emerald-400" />}
                              <span className="font-bold text-white text-xs truncate block">{dev.deviceName}</span>
                              
                              {/* status tag */}
                              {isPending && (
                                <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[8.5px] font-black uppercase font-mono rounded">
                                  Awaiting approval
                                </span>
                              )}
                              {isBlocked && (
                                <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-500 text-[8.5px] font-black uppercase font-mono rounded">
                                  Blocked
                                </span>
                              )}
                              {isApproved && (
                                <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[8.5px] font-black uppercase font-mono rounded">
                                  Approved / Bound
                                </span>
                              )}
                            </div>

                            <p className="text-[10px] text-slate-500 font-mono tracking-normal leading-relaxed">
                              UUID FINGERPRINT: <span className="text-slate-300 font-bold">{dev.deviceId}</span> <br/>
                              IP ADDRESSED: <span className="text-indigo-300 font-semibold">{dev.ipAddress || dev.ip || "197.243.35.41"}</span> • Browser: <span className="lowercase">{dev.operatingSystem || dev.os || "Mac"} • {dev.browser?.slice(0, 40) || "Mobile WebView"}</span>
                            </p>

                            <div className="text-[9.5px] text-slate-400 font-medium font-mono pt-0.5">
                              FIRST RECORDED: {new Date(dev.firstSeen || dev.createdAt || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 z-10">
                            {/* Action Approve / Reject */}
                            {isPending && (
                              <>
                                <button
                                  onClick={() => handleApproveDevice(dev)}
                                  className="flex-1 sm:flex-initial px-3.5 py-1.5 bg-[#1B32FF] hover:bg-blue-600 text-white font-black text-[10px] rounded-lg tracking-wider transition-all cursor-pointer shadow active:scale-95"
                                >
                                  APPROVE DEVICE
                                </button>
                                <button
                                  onClick={() => handleRejectDevice(dev)}
                                  className="flex-1 sm:flex-initial px-3.5 py-1.5 bg-zinc-900 border border-white/10 text-slate-300 hover:text-white font-bold text-[10px] rounded-lg tracking-wider transition-colors cursor-pointer"
                                >
                                  REJECT
                                </button>
                              </>
                            )}

                            {isApproved && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingDevice(dev);
                                    setShowEditDeviceModal(true);
                                  }}
                                  className="p-2 text-slate-400 hover:text-white rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
                                  title="Rename terminal label"
                                >
                                  <Edit size={13} />
                                </button>
                                <button
                                  onClick={() => handleBlockDevice(dev)}
                                  className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/15 hover:bg-amber-500/20 text-amber-500 font-bold text-[9.5px] rounded-lg cursor-pointer transition-colors"
                                  title="Block terminal temporary"
                                >
                                  BLOCK
                                </button>
                                <button
                                  onClick={() => handleRemoveDevice(dev)}
                                  className="p-2 text-red-500/70 hover:bg-red-500/10 hover:text-red-500 rounded-lg cursor-pointer transition-colors"
                                  title="Delete & Release hardware seat"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}

                            {isBlocked && (
                              <>
                                <button
                                  onClick={() => handleApproveDevice(dev)}
                                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] rounded-lg tracking-wider cursor-pointer"
                                >
                                  UNBLOCK / VERIFY
                                </button>
                                <button
                                  onClick={() => handleRemoveDevice(dev)}
                                  className="p-2 text-red-500/70 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors"
                                  title="Delete hardware seat"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: REPORTS & ANALYTICS */}
        {activeTab === "reports" && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Aggregate indicators */}
            <div className="md:col-span-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: "Gross Receipts Cleaned", val: fmtRWF(totalRevenue), color: "text-emerald-400", desc: "Total paid bills cleared today" },
                  { label: "Pending Receivables", val: fmtRWF(receivableLedger), color: "text-yellow-400", desc: "Unpaid invoices on customer tables" },
                  { label: "Completed Rate", val: `${collectionRate}%`, color: "text-indigo-400", desc: "Paid out percentage ratio" }
                ].map((ind, idx) => (
                  <div key={idx} className="bg-[#11141C] border border-white/5 p-4 rounded-2xl space-y-1 shadow">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block font-sans">{ind.label}</span>
                    <span className={`text-base font-black font-mono block ${ind.color}`}>
                      {ind.val}
                    </span>
                    <span className="text-[9.5px] text-slate-400 leading-normal block">{ind.desc}</span>
                  </div>
                ))}
              </div>

              {/* invoices counts breakdowns */}
              <div className="bg-[#11141C] border border-white/5 rounded-[24px] p-5 space-y-4">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Invoices Flow Distribution</span>
                
                {loadingReports ? (
                  <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                    <RefreshCw size={13} className="animate-spin text-indigo-500" />
                    <span>Crunching ledger balances...</span>
                  </div>
                ) : bills.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs leading-relaxed max-w-sm mx-auto">
                    No historic bills found on the registry for {businessName}. Generated invoices will report aggregates automatically.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Progress bars visualizer bar */}
                    <div className="h-2.5 bg-zinc-950 border border-white/5 rounded-full overflow-hidden flex select-none">
                      <div style={{ width: `${(paidBills.length / totalInvoiced) * 100}%` }} className="h-full bg-emerald-500" title="Paid" />
                      <div style={{ width: `${(unpaidBills.length / totalInvoiced) * 100}%` }} className="h-full bg-amber-500" title="Unpaid" />
                      <div style={{ width: `${(cancelledBills.length / totalInvoiced) * 100}%` }} className="h-full bg-rose-500" title="Cancelled" />
                      <div style={{ width: `${(expiredBills.length / totalInvoiced) * 100}%` }} className="h-full bg-slate-600" title="Expired" />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                      <div className="flex items-center gap-1.5 p-2.5 bg-[#141822] border border-white/5 rounded-xl">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <div>
                          <span className="text-slate-500 text-[9.5px] block font-sans font-bold">PAID</span>
                          <span className="font-extrabold text-white text-[11px]">{paidBills.length} Invoices</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 p-2.5 bg-[#141822] border border-white/5 rounded-xl">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                        <div>
                          <span className="text-slate-500 text-[9.5px] block font-sans font-bold">UNPAID / ACTIVE</span>
                          <span className="font-extrabold text-white text-[11px]">{unpaidBills.length} Invoices</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 p-2.5 bg-[#141822] border border-white/5 rounded-xl">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                        <div>
                          <span className="text-slate-500 text-[9.5px] block font-sans font-bold">CANCELLED</span>
                          <span className="font-extrabold text-white text-[11px]">{cancelledBills.length} Invoices</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 p-2.5 bg-[#141822] border border-white/5 rounded-xl">
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                        <div>
                          <span className="text-slate-500 text-[9.5px] block font-sans font-bold">EXPIRED</span>
                          <span className="font-extrabold text-white text-[11px]">{expiredBills.length} Invoices</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Side column: recent payments audits */}
            <div className="md:col-span-4 bg-[#11141C] border border-white/5 rounded-[24px] p-5 space-y-4">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Recent Terminal Payments</span>
              
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1 text-xs">
                {loadingReports ? (
                  <div className="py-8 text-center text-slate-500">Scanning ledger callbacks...</div>
                ) : paidBills.length === 0 ? (
                  <div className="py-8 text-center text-slate-600 leading-normal leading-relaxed text-[10.5px]">
                    No cleared receipts logged on-chain. Customers must settle active invoices via MOMO.
                  </div>
                ) : (
                  paidBills.slice(0, 8).map((p) => {
                    const payDate = p.paidAt?.toDate ? p.paidAt.toDate() : new Date(p.paidAt || Date.now());
                    return (
                      <div key={p.id} className="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-1">
                        <div className="flex items-center justify-between font-mono">
                          <span className="font-black text-white text-[11px]">{p.billId}</span>
                          <span className="text-emerald-400 font-bold">{fmtRWF(p.totalAmount)}</span>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          Table: <span className="text-slate-300 font-semibold">{p.tableNumber}</span> • Customer: <span className="text-slate-300">{p.customerName || "Walk-In customer"}</span>
                        </p>
                        <div className="text-[8.5px] text-slate-400 font-semibold uppercase font-mono bg-zinc-950 py-0.5 px-2 rounded-md flex justify-between">
                          <span>Settle: Mtn MoMo Push</span>
                          <span className="text-slate-500">{payDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        )}

        {/* TAB 4: STORE PROFILE & SETTINGS */}
        {activeTab === "settings" && (
          <div className="grid grid-cols-1 gap-6 max-w-xl">
            <div className="bg-[#11141C] border border-white/5 rounded-[24px] p-6 space-y-5">
              <div>
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Store Profile & Payments Setup
                </span>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Configure merchant credentials, billing settings, categorizations, and international payment setups.
                </p>
              </div>

              {loadingSettings ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                  <RefreshCw size={14} className="animate-spin text-indigo-500" />
                  <span>Loading storefront options...</span>
                </div>
              ) : (
                <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Business/Storefront Name</label>
                      <input
                        type="text"
                        value={settingsName}
                        onChange={(e) => setSettingsName(e.target.value)}
                        required
                        className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#1B32FF] transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Owner/Manager Name</label>
                      <input
                        type="text"
                        value={settingsOwner}
                        onChange={(e) => setSettingsOwner(e.target.value)}
                        required
                        className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#1B32FF] transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Store Contact Phone</label>
                      <input
                        type="tel"
                        value={settingsPhone}
                        onChange={(e) => setSettingsPhone(e.target.value)}
                        required
                        className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#1B32FF] transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-400 font-bold block uppercase tracking-wider text-[10px] tracking-wide flex items-center gap-1">
                        <Tag size={12} className="text-indigo-400" /> Category
                      </label>
                      <select 
                        value={settingsCategory}
                        onChange={(e) => setSettingsCategory(e.target.value)}
                        className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white cursor-pointer focus:outline-none focus:border-[#1B32FF]"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Shop Physical Address & Location</label>
                    <input
                      type="text"
                      value={settingsLocation}
                      onChange={(e) => setSettingsLocation(e.target.value)}
                      required
                      className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#1B32FF] transition-all"
                    />
                  </div>

                  <div className="border-t border-white/5 pt-4 space-y-2">
                    <label className="text-slate-300 font-bold block uppercase tracking-wider text-[9px] tracking-widest flex items-center gap-1.5">
                      <Lock size={12} className="text-amber-500" /> QR Standard Configuration Setup
                    </label>
                    
                    <select
                      value={settingsQrType}
                      onChange={(e) => setSettingsQrType(e.target.value as "local" | "international")}
                      className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white cursor-pointer focus:outline-none focus:border-[#1B32FF]"
                    >
                      <option value="local">Local QR Only (Callbacks for Rwandan MTN MoMo)</option>
                      <option value="international">International Tourist Plan (Gateway supports Credit Cards & Apple Pay)</option>
                    </select>
                    
                    <span className="text-[10px] text-slate-500 block leading-tight">
                      {settingsQrType === "international" 
                        ? "★ Deployed mode: Global checkout is active! Foreign cardholders pay using card forms and digital wallets on scanned pages."
                        : "Kigali local mode: Strict callback codes for MTN Rwanda mobile money only."}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-white/5 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="px-5 py-2.5 bg-[#1B32FF] hover:brightness-110 active:scale-95 text-white font-black rounded-xl cursor-pointer shadow flex items-center gap-1.5 disabled:opacity-50 transition-all uppercase tracking-wider text-xs"
                    >
                      {savingSettings ? <RefreshCw className="animate-spin" size={12} /> : <FileCheck size={13} />}
                      {savingSettings ? "SAVING CHANGES..." : "SAVE PROFILE CHANGES"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

      </div>

      {/* CREATE STAFF ACCOUNT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-[#11141C] border border-white/10 rounded-[32px] p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1">
                <UserPlus size={14} className="text-indigo-400" /> Add New Waitstaff Profile
              </span>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer text-[10px]"
              >
                CLOSE
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Staff Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Marie Keza"
                  value={formData.fullName}
                  onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                  required
                  className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#1B32FF]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Staff Log-In Email *</label>
                <input
                  type="email"
                  placeholder="e.g. marie.k@gera.local"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  required
                  className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#1B32FF]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Temporary Password / PIN *</label>
                <input
                  type="text"
                  placeholder="Raw credentials PIN (e.g., 2931)"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  required
                  className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-[#1B32FF]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Access Role Tier *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white cursor-pointer font-bold"
                >
                  <option value="waiter">Waiter (Create Bills Only)</option>
                  <option value="cashier">Cashier (Full Billing & Mark Paid)</option>
                </select>
                <span className="text-[8.5px] text-slate-500 block leading-tight">
                  {formData.role === "waiter" 
                    ? "★ Waiters can only create bills on tables. They are restricted from marking invoices paid." 
                    : "★ Cashiers manage daily billing logs and confirm manual cash/MoMo settlements."}
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-[#1B32FF] text-white font-black rounded-xl cursor-pointer shadow-lg hover:brightness-115 active:scale-95 transition-all text-xs uppercase tracking-wider"
                >
                  REGISTER STAFF MEMBER
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT DEVICE NAME MODAL */}
      {showEditDeviceModal && editingDevice && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-[#11141C] border border-white/10 rounded-[32px] p-5 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Configure Terminal Label</span>
              <button 
                onClick={() => {
                  setEditingDevice(null);
                  setShowEditDeviceModal(false);
                }}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                CLOSE
              </button>
            </div>

            <form onSubmit={handleUpdateDeviceName} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[#FFC107] font-bold block uppercase tracking-wider text-[9px] font-mono">
                  Hardware Signature: {editingDevice.deviceId.slice(0, 16)}...
                </label>
                <input
                  id="edit-device-input-name"
                  type="text"
                  defaultValue={editingDevice.deviceName}
                  placeholder="e.g. Cashier Main iPad"
                  required
                  className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-[#1B32FF]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white rounded-xl shadow cursor-pointer active:scale-95 transition-all"
              >
                RENAME IN DATABASE
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
