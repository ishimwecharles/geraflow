import React, { useState, useEffect } from "react";
import { 
  Plus, 
  Key, 
  Trash2, 
  ToggleLeft, 
  ToggleRight, 
  Smartphone, 
  Users, 
  CheckCircle, 
  XCircle, 
  Search, 
  RefreshCw, 
  Settings, 
  Lock, 
  Unlock,
  ShieldAlert,
  Edit2
} from "lucide-react";
import { 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  query, 
  where, 
  orderBy,
  onSnapshot,
  serverTimestamp 
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Client } from "../types";
import { sha256, logSecurityEvent } from "../lib/security";

interface AdminAccessViewProps {
  clients: Client[];
  toast: (message: string, type?: "success" | "error" | "info" | "warning") => void;
}

export default function AdminAccessView({ clients, toast }: AdminAccessViewProps) {
  const [users, setUsers] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingDevices, setLoadingDevices] = useState(true);
  
  // Search & Filters
  const [userSearch, setUserSearch] = useState("");
  const [deviceSearch, setDeviceSearch] = useState("");
  const [selectedBusinessFilter, setSelectedBusinessFilter] = useState("");

  // Create User Form State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    businessId: "",
    businessName: "",
    plan: "restaurant",
    active: true,
    maxDevices: 3,
    maxStaff: 5,
  });

  // Edit / Action User States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  // Repair Business Login Profiles Tool State
  const [showRepairForm, setShowRepairForm] = useState(false);
  const [repairUid, setRepairUid] = useState("");
  const [repairEmail, setRepairEmail] = useState("");
  const [repairUsername, setRepairUsername] = useState("");
  const [repairRole, setRepairRole] = useState("business_admin");
  const [repairBusinessId, setRepairBusinessId] = useState("");
  const [repairBusinessName, setRepairBusinessName] = useState("");
  const [repairActive, setRepairActive] = useState(true);

  // Load registered user sessions
  useEffect(() => {
    setLoadingUsers(true);
    const path = "users";
    const q = query(collection(db, path), orderBy("createdAt", "desc"));
    
    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setUsers(list);
      setLoadingUsers(false);
    }, (err) => {
      console.error("Error fetching users:", err);
      handleFirestoreError(err, OperationType.LIST, path);
      setLoadingUsers(false);
    });

    return () => unsub();
  }, []);

  // Load all registered devices
  useEffect(() => {
    setLoadingDevices(true);
    const path = "devices";
    const q = query(collection(db, path), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setDevices(list);
      setLoadingDevices(false);
    }, (err) => {
      console.error("Error fetching devices:", err);
      handleFirestoreError(err, OperationType.LIST, path);
      setLoadingDevices(false);
    });

    return () => unsub();
  }, []);

  // Auto-fill businessName in create user form when businessId matches
  useEffect(() => {
    if (formData.businessId) {
      const selectedClient = clients.find(c => c.clientId === formData.businessId);
      if (selectedClient) {
        setFormData(prev => ({
          ...prev,
          businessName: selectedClient.businessName
        }));
      }
    }
  }, [formData.businessId, clients]);

  // Handle Create User Account
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.password || !formData.businessId) {
      toast("Please complete all required fields", "warning");
      return;
    }

    // Check if email already registered locally in mock user system
    const emailExists = users.some(u => u.email.toLowerCase() === formData.email.toLowerCase());
    if (emailExists) {
      toast("An account with this email already exists", "error");
      return;
    }

    try {
      const path = "users";
      const userRef = await addDoc(collection(db, path), {
        uid: "GP-UID-" + Math.floor(100000 + Math.random() * 900000), // Custom internal unique id for easy local simulation auth
        email: formData.email,
        password: sha256(formData.password.trim()),
        passwordHash: sha256(formData.password.trim()),
        role: "business_admin", // Super admin registers business admin accounts
        businessId: formData.businessId,
        businessName: formData.businessName,
        plan: formData.plan,
        active: formData.active,
        maxDevices: Number(formData.maxDevices),
        maxStaff: Number(formData.maxStaff),
        createdAt: new Date().toISOString()
      });

      // Synchronize/Register Business ID in "businesses" and "clients" collections so business login is flawless
      const normalizedBizId = formData.businessId.trim().toUpperCase();
      const pName = formData.businessName.trim() || `${normalizedBizId} Merchant`;
      const pPass = sha256(formData.password.trim());
      const bizPayload = {
        businessId: normalizedBizId,
        clientId: normalizedBizId,
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
        maxStaff: Number(formData.maxStaff),
        maxDevices: Number(formData.maxDevices),
        plan: formData.plan,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        businessAdminName: "Merchant Owner",
        businessUsername: formData.email.split("@")[0].toLowerCase(),
        businessPassword: pPass,
        passwordHash: pPass,
        role: "business_admin"
      };

      await setDoc(doc(db, "businesses", normalizedBizId), bizPayload, { merge: true });
      await setDoc(doc(db, "clients", normalizedBizId), bizPayload, { merge: true });

      await logSecurityEvent({
        eventType: "admin_user_created",
        action: `Super Admin registered business admin account: ${formData.email} for business: ${formData.businessName}`,
        resourceId: formData.businessId,
        metadata: { role: "business_admin", plan: formData.plan, email: formData.email }
      });

      toast(`Business admin account registered for ${formData.businessName}!`, "success");
      setShowCreateModal(false);
      resetForm();
    } catch (err) {
      toast("Failed to create credential profile", "error");
      handleFirestoreError(err, OperationType.CREATE, "users");
    }
  };

  const resetForm = () => {
    setFormData({
      email: "",
      password: "",
      businessId: "",
      businessName: "",
      plan: "restaurant",
      active: true,
      maxDevices: 3,
      maxStaff: 5,
    });
  };

  // Toggle user status active/inactive
  const handleToggleUserStatus = async (user: any) => {
    try {
      const userRef = doc(db, "users", user.id);
      await updateDoc(userRef, {
        active: !user.active
      });

      await logSecurityEvent({
        eventType: "admin_user_status_toggled",
        action: `Super Admin toggled active status for ${user.email} as ${!user.active ? "ACTIVE" : "DISABLED"}`,
        resourceId: user.businessId || null,
        metadata: { email: user.email, targetStatus: !user.active }
      });

      toast(`Account ${user.email} is now ${!user.active ? "ACTIVE" : "DISABLED"}`, "success");
    } catch (err) {
      toast("Failed to update status", "error");
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.id}`);
    }
  };

  // Reset User Password
  const handleResetPassword = async (user: any, newPass: string) => {
    if (!newPass) return;
    try {
      const userRef = doc(db, "users", user.id);
      await updateDoc(userRef, {
        password: sha256(newPass.trim()),
        passwordHash: sha256(newPass.trim())
      });

      await logSecurityEvent({
        eventType: "admin_password_reset",
        action: `Super Admin reset password of user: ${user.email}`,
        resourceId: user.businessId || null,
        metadata: { email: user.email }
      });

      toast(`Credential reset successfully to: ${newPass}`, "success");
      setShowEditModal(false);
    } catch (err) {
      toast("Reset failed", "error");
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.id}`);
    }
  };

  // Delete User Completely
  const handleDeleteUser = async (user: any) => {
    if (!window.confirm(`Warning: This will permanently delete the access profile for ${user.email}. Action is irreversible.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, "users", user.id));

      await logSecurityEvent({
        eventType: "admin_user_deleted",
        action: `Super Admin deleted user account completely: ${user.email}`,
        resourceId: user.businessId || null,
        metadata: { email: user.email, deletedId: user.id }
      });

      toast("Access user profile cleared successfully", "success");
    } catch (err) {
      toast("Deletion failed", "error");
      handleFirestoreError(err, OperationType.DELETE, `users/${user.id}`);
    }
  };

  // Repair manual save
  const handleSaveRepair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repairUid.trim()) {
      toast("Auth UID is required", "error");
      return;
    }
    if (!repairEmail.trim()) {
      toast("Email is required", "error");
      return;
    }
    if (!repairBusinessId.trim()) {
      toast("Business Client is required", "error");
      return;
    }

    try {
      const userRef = doc(db, "users", repairUid.trim());
      const selectedClient = clients.find(c => c.clientId === repairBusinessId);
      const bizName = repairBusinessName.trim() || selectedClient?.businessName || "Store Client";
      
      const payload = {
        uid: repairUid.trim(),
        email: repairEmail.trim().toLowerCase(),
        username: repairUsername.trim(),
        usernameLower: repairUsername.trim().toLowerCase(),
        role: repairRole,
        businessId: repairBusinessId,
        businessName: bizName,
        active: repairActive,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(userRef, payload);

      // Save business document dynamically in both collections too just in case it was missing
      const normId = repairBusinessId.trim().toUpperCase();
      const fallbackPass = sha256("Admin123!"); // Default mock password if they have to reset
      const bizPayload = {
        businessId: normId,
        clientId: normId,
        businessName: bizName,
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
        plan: "restaurant",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        businessAdminName: "Merchant Owner",
        businessUsername: repairUsername.trim().toLowerCase() || repairEmail.split("@")[0].toLowerCase(),
        businessPassword: fallbackPass,
        passwordHash: fallbackPass,
        role: "business_admin"
      };

      await setDoc(doc(db, "businesses", normId), bizPayload, { merge: true });
      await setDoc(doc(db, "clients", normId), bizPayload, { merge: true });

      toast(`Successfully created/repaired users/${repairUid.trim()} profile!`, "success");
      
      // Reset form fields
      setRepairUid("");
      setRepairEmail("");
      setRepairUsername("");
      setRepairBusinessId("");
      setRepairBusinessName("");
      setRepairActive(true);
      setShowRepairForm(false);
    } catch (err: any) {
      console.error("[GeraPay Repair Save Error]:", err);
      toast(`Repair failed: ${err.message}`, "error");
    }
  };

  // Toggle or Reset Device Status
  const handleToggleDevice = async (device: any) => {
    try {
      const devRef = doc(db, "devices", device.id);
      await updateDoc(devRef, {
        active: !device.active
      });

      await logSecurityEvent({
        eventType: "admin_device_status_toggled",
        action: `Super Admin toggled terminal: ${device.deviceName} status to ${!device.active ? "ACTIVE" : "BLOCKED"}`,
        resourceId: device.businessId || null,
        metadata: { deviceId: device.deviceId, deviceName: device.deviceName, targetStatus: !device.active }
      });

      toast(`Terminal binding ${device.deviceId} is now ${!device.active ? "ACTIVE" : "BLOCKED"}`, "success");
    } catch (err) {
      toast("Status change failed", "error");
      handleFirestoreError(err, OperationType.UPDATE, `devices/${device.id}`);
    }
  };

  // Reset Any Device completely (deletes it from devices registries)
  const handleResetDevice = async (device: any) => {
    if (!window.confirm(`Are you sure you want to completely deregister and wipe terminal ${device.deviceName}?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, "devices", device.id));

      await logSecurityEvent({
        eventType: "admin_device_reset",
        action: `Super Admin deleted and reset terminal registration: ${device.deviceName} (ID: ${device.deviceId})`,
        resourceId: device.businessId || null,
        metadata: { deviceId: device.deviceId, deviceName: device.deviceName }
      });

      toast("Terminal record reset successfully. Ready for new activation slot.", "success");
    } catch (err) {
      toast("Reset failed", "error");
      handleFirestoreError(err, OperationType.DELETE, `devices/${device.id}`);
    }
  };

  // Filter lists
  const filteredUsers = users.filter(u => {
    const matchesSearch = u.email?.toLowerCase().includes(userSearch.toLowerCase()) || 
                          u.businessName?.toLowerCase().includes(userSearch.toLowerCase()) ||
                          u.businessId?.toLowerCase().includes(userSearch.toLowerCase());
    const matchesBiz = selectedBusinessFilter ? u.businessId === selectedBusinessFilter : true;
    return matchesSearch && matchesBiz;
  });

  const filteredDevices = devices.filter(d => {
    const matchesSearch = d.deviceName?.toLowerCase().includes(deviceSearch.toLowerCase()) || 
                          d.deviceId?.toLowerCase().includes(deviceSearch.toLowerCase()) ||
                          d.businessId?.toLowerCase().includes(deviceSearch.toLowerCase());
    const matchesBiz = selectedBusinessFilter ? d.businessId === selectedBusinessFilter : true;
    return matchesSearch && matchesBiz;
  });

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      
      {/* Visual Hub Header */}
      <div className="bg-[#11141C] border border-white/5 p-6 rounded-3xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="absolute top-0 right-0 w-80 h-44 bg-[#1B32FF]/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="space-y-1 z-10">
          <span className="text-[10px] font-mono text-[#FFC107] uppercase tracking-widest font-bold">Secure Gate Hub</span>
          <h2 className="text-xl font-bold text-white tracking-tight">Enterprise Access & Terminal Control</h2>
          <p className="text-xs text-slate-400">Manage client business credentials, plan parameters, staff capacities, and multi-tenant terminal device locks.</p>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4.5 py-2.5 bg-[#1B32FF] hover:bg-blue-600 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg hover:shadow-[#1B32FF]/20 transition-all cursor-pointer z-10"
        >
          <Plus size={14} /> Create Business Login
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex gap-2 items-center flex-wrap w-full md:w-auto">
          <select
            value={selectedBusinessFilter}
            onChange={(e) => setSelectedBusinessFilter(e.target.value)}
            className="bg-[#11141C] border border-white/5 py-2 px-3 text-xs font-bold text-slate-300 rounded-xl focus:outline-none focus:border-[#1B32FF] cursor-pointer"
          >
            <option value="">All Registered Stores</option>
            {clients.map(c => (
              <option key={c.clientId} value={c.clientId}>{c.businessName} ({c.clientId})</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Users Accounts Board */}
        <div className="lg:col-span-7 bg-[#11141C] border border-white/5 rounded-[24px] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Users size={14} className="text-blue-500" /> Business Admins Registry ({filteredUsers.length})
            </span>
            
            <div className="relative">
              <Search size={12} className="absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search accounts..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="bg-zinc-950 border border-white/5 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#1B32FF] placeholder-slate-600 w-44 transition-all focus:w-56"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {loadingUsers ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                <RefreshCw size={18} className="animate-spin text-indigo-500" />
                <span>Synchronizing accounts ledger...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No active credentials profiles match criteria.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-slate-500 uppercase font-mono text-[10px]">
                    <th className="pb-3 font-semibold pl-2">Merchant Client</th>
                    <th className="pb-3 font-semibold">User Login Credentials</th>
                    <th className="pb-3 font-semibold text-center">Plan Limits</th>
                    <th className="pb-3 font-semibold text-center">Status</th>
                    <th className="pb-3 font-semibold text-right pr-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-white/[0.01] transition-colors group">
                      <td className="py-3.5 pl-2">
                        <span className="font-bold text-white block">{user.businessName}</span>
                        <span className="text-[10px] text-slate-500 font-mono block uppercase">{user.businessId}</span>
                      </td>
                      <td className="py-3.5 pr-2">
                        <span className="font-mono text-slate-300 block">{user.email}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] bg-slate-800 text-slate-400 font-bold px-1.5 py-0.5 rounded uppercase font-mono">
                            {user.role}
                          </span>
                          <span className="text-[10px] text-indigo-400 font-mono flex items-center gap-0.5" title="Custom Password">
                            <Key size={10} /> {user.password && user.password.length > 20 ? "•••••••• (Hashed)" : user.password}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 text-center font-mono">
                        <span className="px-1.5 py-0.5 bg-[#FFC107]/10 text-[#FFC107] font-semibold text-[9px] rounded uppercase block w-max mx-auto mb-1">
                          {user.plan}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          📳{user.maxDevices} | 👥{user.maxStaff}
                        </span>
                      </td>
                      <td className="py-3.5 text-center">
                        <button
                          onClick={() => handleToggleUserStatus(user)}
                          className="mx-auto block transition-transform active:scale-95 cursor-pointer"
                        >
                          {user.active ? (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-bold font-mono">
                              <CheckCircle size={10} /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded font-bold font-mono">
                              <XCircle size={10} /> Disabled
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 text-right pr-2">
                        <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingUser(user);
                              setShowEditModal(true);
                            }}
                            className="p-1 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                            title="Edit Password / Limits"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user)}
                            className="p-1 text-red-500/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 size={13} fill="none" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Devices Registry Control Board */}
        <div className="lg:col-span-5 bg-[#11141C] border border-white/5 rounded-[24px] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Smartphone size={14} className="text-indigo-500" /> Active Devices Hardware Locks ({filteredDevices.length})
            </span>
            
            <div className="relative">
              <Search size={12} className="absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search hardware ID..."
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
                className="bg-zinc-950 border border-white/5 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#1B32FF] placeholder-slate-600 w-32 transition-all focus:w-44"
              />
            </div>
          </div>

          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
            {loadingDevices ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                <RefreshCw size={18} className="animate-spin text-indigo-500" />
                <span>Checking hardware bindings...</span>
              </div>
            ) : filteredDevices.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No active browser hardware nodes validated.
              </div>
            ) : (
              filteredDevices.map((device) => (
                <div 
                  key={device.id} 
                  className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between gap-3 hover:bg-white/[0.04] transition-colors"
                >
                  <div className="space-y-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-xs block truncate">{device.deviceName}</span>
                      <span className="text-[9px] bg-indigo-500/10 text-indigo-400 px-1 py-0.5 rounded uppercase font-mono">
                        {device.deviceType}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono tracking-wide">
                      <span className="text-indigo-400 uppercase tracking-normal pr-1 font-bold">{device.businessId}</span>
                      ID: {device.deviceId}
                    </div>
                    <span className="text-[9px] text-slate-500 block font-mono">
                      Last Seen: {new Date(device.lastSeen).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleToggleDevice(device)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                      title={device.active ? "Temporarily Block Device" : "Activate Device"}
                    >
                      {device.active ? <Unlock size={13} className="text-emerald-400" /> : <Lock size={13} className="text-red-400" />}
                    </button>
                    <button
                      onClick={() => handleResetDevice(device)}
                      className="p-1.5 text-red-500/80 hover:bg-red-500/10 rounded-lg cursor-pointer"
                      title="Clear / Deregister Device Node"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* PHASE 4 - REPAIR BUSINESS LOGIN PROFILES TOOL */}
      <div id="repair-tool-section" className="bg-[#11141C] border border-white/5 rounded-[24px] p-6 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-tight">
              <ShieldAlert size={16} className="text-[#FFC107]" /> Repair Business Login Profiles
            </h3>
            <p className="text-[11px] text-slate-400">
              Audit the registry for registered stores that are missing their corresponding <code>users/{"{uid}"}</code> node in the logins ledger.
            </p>
          </div>
          <button
            onClick={() => setShowRepairForm(!showRepairForm)}
            className="px-4 py-1.5 bg-[#FFC107]/10 hover:bg-[#FFC107]/20 text-[#FFC107] font-bold text-xs rounded-xl border border-[#FFC107]/20 transition-all cursor-pointer active:scale-95"
          >
            {showRepairForm ? "Collapse Form" : "Open Manual Form"}
          </button>
        </div>

        {/* Missing profile report list */}
        <div className="space-y-2.5">
          <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold block tracking-wider">
            Detected Out-of-sync Client profiles ({clients.filter(c => {
              if (c.clientType !== "system_access" && !c.hasClientLogin) return false;
              return !users.some(u => u.businessId === c.clientId);
            }).length})
          </span>

          {clients.filter(c => {
            if (c.clientType !== "system_access" && !c.hasClientLogin) return false;
            return !users.some(u => u.businessId === c.clientId);
          }).length === 0 ? (
            <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 text-emerald-400 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle size={14} />
              <span>All active login stores have a properly matched users/{"{uid}"} profile node! Database is entirely in sync.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {clients.filter(c => {
                if (c.clientType !== "system_access" && !c.hasClientLogin) return false;
                return !users.some(u => u.businessId === c.clientId);
              }).map(c => (
                <div key={c.clientId} className="p-3.5 bg-zinc-950/60 border border-white/5 rounded-2xl flex items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-bold text-stone-200 block">{c.businessName}</span>
                    <span className="text-[10px] text-yellow-500 font-mono">Missing user credential mapping node</span>
                  </div>
                  <button
                    onClick={() => {
                      setRepairBusinessId(c.clientId);
                      setRepairBusinessName(c.businessName);
                      setRepairEmail(c.businessUsername ? `${c.businessUsername.toLowerCase()}@gerapay.local` : `${c.clientId.toLowerCase()}@gerapay.local`);
                      setRepairUsername(c.businessUsername || c.businessAdminName || c.businessName.toLowerCase().replace(/\s+/g, ""));
                      setShowRepairForm(true);
                      toast(`Affinities filled for ${c.businessName}. Input the UID!`, "info");
                    }}
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg cursor-pointer"
                  >
                    Quick Repair
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Repaired Manual Placement form */}
        {showRepairForm && (
          <form onSubmit={handleSaveRepair} className="p-4 bg-zinc-950/70 border border-white/5 rounded-2xl space-y-4 text-xs animate-fade-in">
            <div className="text-[11px] text-indigo-300 font-semibold border-b border-white/5 pb-1 flex items-center gap-1.5 uppercase">
              <Lock size={12} /> Manual Ledger Mapping Form
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Firebase Auth UID</label>
                <input
                  type="text"
                  placeholder="Insert current firebase auth.uid of the user profile"
                  value={repairUid}
                  onChange={(e) => setRepairUid(e.target.value)}
                  required
                  className="w-full p-2.5 bg-zinc-900 border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Affinitive Business / Client ID</label>
                <select
                  value={repairBusinessId}
                  onChange={(e) => {
                    const cid = e.target.value;
                    setRepairBusinessId(cid);
                    const chosen = clients.find(cl => cl.clientId === cid);
                    if (chosen) {
                      setRepairBusinessName(chosen.businessName);
                    }
                  }}
                  required
                  className="w-full p-2.5 bg-zinc-900 border border-white/10 rounded-xl text-white cursor-pointer"
                >
                  <option value="">Link matching store client...</option>
                  {clients.map(c => (
                    <option key={c.clientId} value={c.clientId}>{c.businessName} ({c.clientId})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Registered Email Address</label>
                <input
                  type="email"
                  placeholder="Enter email mapped in auth credentials"
                  value={repairEmail}
                  onChange={(e) => setRepairEmail(e.target.value)}
                  required
                  className="w-full p-2.5 bg-zinc-900 border border-white/10 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Unique Username</label>
                <input
                  type="text"
                  placeholder="Enter custom lower-case login nickname"
                  value={repairUsername}
                  onChange={(e) => setRepairUsername(e.target.value)}
                  required
                  className="w-full p-2.5 bg-zinc-900 border border-white/10 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Administrative Access Role</label>
                <select
                  value={repairRole}
                  onChange={(e) => setRepairRole(e.target.value)}
                  className="w-full p-2.5 bg-zinc-900 border border-white/10 rounded-xl text-white cursor-pointer"
                >
                  <option value="business_admin">Business Administrator</option>
                  <option value="cashier">Cashier</option>
                  <option value="waiter">Waiter</option>
                  <option value="kitchen">Kitchen Monitor</option>
                  <option value="super_admin">Gera Tech Super_Admin</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Business Name</label>
                <input
                  type="text"
                  placeholder="Auto-populated upon store client selection"
                  value={repairBusinessName}
                  onChange={(e) => setRepairBusinessName(e.target.value)}
                  className="w-full p-2.5 bg-zinc-900 border border-white/10 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 text-slate-300 font-bold uppercase tracking-wider text-[9px] cursor-pointer" style={{ userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={repairActive}
                  onChange={(e) => setRepairActive(e.target.checked)}
                  className="scale-125 focus:ring-0 checked:bg-indigo-600 rounded cursor-pointer"
                />
                Active Permission Status
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRepairForm(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl active:scale-95 transition-all text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl active:scale-[0.97] transition-all text-xs cursor-pointer"
                >
                  Apply Profile Repair
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* CREATE CREDENTIAL PROFILE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#11141C] border border-white/10 rounded-3xl p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <span className="text-sm font-bold text-white font-sans uppercase tracking-tight">Register Store Login Entity</span>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Affinitive Business / Client</label>
                <select
                  value={formData.businessId}
                  onChange={(e) => setFormData(prev => ({ ...prev, businessId: e.target.value }))}
                  required
                  className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white font-semibold cursor-pointer"
                >
                  <option value="">Choose Store Registry link...</option>
                  {clients.map(c => (
                    <option key={c.clientId} value={c.clientId}>{c.businessName} ({c.clientId})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Administrator Email Address</label>
                <input
                  type="email"
                  placeholder="admin@restaurant.rw"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  required
                  className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#1B32FF]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Administrative Password / Access PIN</label>
                <input
                  type="text"
                  placeholder="Input custom secure string"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  required
                  className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#1B32FF] font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Licensing Plan Tier</label>
                  <select
                    value={formData.plan}
                    onChange={(e) => setFormData(prev => ({ ...prev, plan: e.target.value }))}
                    className="w-full p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white cursor-pointer"
                  >
                    <option value="starter">Starter Plan</option>
                    <option value="restaurant">Restaurant & Bar</option>
                    <option value="enterprise">Enterprise VIP</option>
                  </select>
                </div>

                <div className="space-y-1 pt-4.5 flex items-center justify-end">
                  <span className="text-slate-400 font-bold mr-2 uppercase tracking-wider text-[9px]">Active Status</span>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, active: !prev.active }))}
                    className="text-white scale-125 cursor-pointer"
                  >
                    {formData.active ? <ToggleRight className="text-indigo-400" size={24} /> : <ToggleLeft className="text-slate-600" size={24} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-white/5 pt-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Max Allowed Terminals</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={formData.maxDevices}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxDevices: Number(e.target.value) }))}
                    className="w-full p-2 bg-zinc-950 border border-white/10 rounded-xl text-white text-center font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Max Valid Waitstaff</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={formData.maxStaff}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxStaff: Number(e.target.value) }))}
                    className="w-full p-2 bg-zinc-950 border border-white/10 rounded-xl text-white text-center font-bold"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-[#1B32FF] hover:brightness-110 text-white font-bold rounded-xl shadow-lg cursor-pointer"
              >
                Register Credentials Entity
              </button>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PASSWORD & CAPACITY LIMITS MODAL */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#11141C] border border-white/10 rounded-3xl p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div>
                <span className="text-sm font-bold text-white block">Credential Tuning Console</span>
                <span className="text-[10px] text-slate-500 font-mono block">{editingUser.email}</span>
              </div>
              <button 
                onClick={() => {
                  setEditingUser(null);
                  setShowEditModal(false);
                }}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1 bg-zinc-950/40 p-3 border border-white/5 rounded-2xl flex items-center gap-3">
                <ShieldAlert className="text-yellow-500" size={16} />
                <div>
                  <span className="font-bold text-white block">Reset Secret Credentials password</span>
                  <p className="text-[10px] text-slate-500">Provide a new password or security PIN string. Updates instantly across servers.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">New Secret Access Password / PIN</label>
                <div className="flex gap-2">
                  <input
                    id="reset-pass-input"
                    type="text"
                    defaultValue={editingUser.password}
                    className="flex-grow p-2.5 bg-zinc-950 border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-[#1B32FF]"
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById("reset-pass-input") as HTMLInputElement;
                      if (input) {
                        handleResetPassword(editingUser, input.value);
                      }
                    }}
                    className="px-4 bg-[#1B32FF] hover:bg-blue-600 text-white font-bold rounded-xl cursor-pointer"
                  >
                    Update Pass
                  </button>
                </div>
              </div>

              <div className="border-t border-white/5 pt-3 space-y-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Plan & Hardware Caps</span>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-slate-500 tracking-wider text-[9px] font-bold block uppercase">Max Device Nodes</span>
                    <input
                      id="edit-max-devices"
                      type="number"
                      defaultValue={editingUser.maxDevices}
                      className="w-full p-2 bg-zinc-950 border border-white/10 rounded-xl text-white text-center font-bold font-mono text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-500 tracking-wider text-[9px] font-bold block uppercase">Max Valid Staff</span>
                    <input
                      id="edit-max-staff"
                      type="number"
                      defaultValue={editingUser.maxStaff}
                      className="w-full p-2 bg-zinc-950 border border-white/10 rounded-xl text-white text-center font-bold font-mono text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <span className="text-slate-500 tracking-wider text-[9px] font-bold block uppercase">Subscription Tier</span>
                    <select
                      id="edit-plan-tier"
                      defaultValue={editingUser.plan}
                      className="w-full p-2 bg-zinc-950 border border-white/10 rounded-xl text-white font-semibold cursor-pointer text-xs"
                    >
                      <option value="starter">Starter Plan</option>
                      <option value="restaurant">Restaurant & Bar</option>
                      <option value="enterprise">Enterprise VIP</option>
                    </select>
                  </div>

                  <div className="pt-4 flex items-center justify-end">
                    <button
                      onClick={async () => {
                        const maxD = Number((document.getElementById("edit-max-devices") as HTMLInputElement)?.value || 3);
                        const maxS = Number((document.getElementById("edit-max-staff") as HTMLInputElement)?.value || 5);
                        const pTier = (document.getElementById("edit-plan-tier") as HTMLSelectElement)?.value || "restaurant";
                        
                        try {
                          await updateDoc(doc(db, "users", editingUser.id), {
                            maxDevices: maxD,
                            maxStaff: maxS,
                            plan: pTier,
                          });
                          toast(`Capacities for ${editingUser.businessName} updated.`, "success");
                          setEditingUser(null);
                          setShowEditModal(false);
                        } catch (err) {
                          toast("Update failed", "error");
                        }
                      }}
                      className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-black text-xs rounded-xl shadow cursor-pointer uppercase transition-colors"
                    >
                      Apply Limits
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
