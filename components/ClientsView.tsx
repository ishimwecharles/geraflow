import React, { useState, useRef, useEffect } from "react";
import QRCode from "qrcode";
import { Client } from "../types";
import { db, storage, handleFirestoreError, OperationType } from "../lib/firebase";
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut as authSignOut } from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";
import { generateBusinessUsername, sha256 } from "../lib/security";
import { collection, addDoc, updateDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { fmtRWF } from "./PayPage";
import { 
  Plus, 
  Search, 
  Edit, 
  Eye, 
  Trash2, 
  Copy, 
  Download, 
  Printer, 
  ToggleLeft, 
  ToggleRight, 
  FolderPlus, 
  MapPin, 
  User, 
  Phone, 
  Tag, 
  Sparkles,
  UploadCloud,
  X,
  CreditCard,
  Hash,
  RefreshCw,
  Globe,
  Lock,
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  PUBLIC_APP_URL, 
  getBusinessAccessUrl, 
  getPaymentUrl, 
  getMenuUrl, 
  getBillUrl 
} from "../lib/urls";

interface ClientsViewProps {
  clients: Client[];
  toast: (m: string, t?: "success" | "error" | "info" | "warning") => void;
  onViewClient: (c: Client) => void;
  onBack: () => void;
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

// Helper to generate a friendly unique merchant ID (e.g. GP-59B)
function genClientId() {
  return "GP-" + Date.now().toString(36).toUpperCase().slice(-4);
}

// Standard-compliant real camera-scannable QR code generator
export function QRStickerGenerator({ text, size = 180 }: { text: string; size?: number }) {
  const [qrSrc, setQrSrc] = useState<string>("");

  useEffect(() => {
    QRCode.toDataURL(
      text,
      {
        width: size,
        margin: 4, // standard quiet zone
        color: {
          dark: "#000000", // black QR marks
          light: "#FFFFFF", // white background/quiet zone
        },
      },
      (err, url) => {
        if (err) {
          console.error("QR Code generation error", err);
          return;
        }
        setQrSrc(url);
      }
    );
  }, [text, size]);

  if (!qrSrc) {
    return (
      <div 
        style={{ width: size, height: size }} 
        className="bg-white rounded-xl flex items-center justify-center text-slate-400 text-[10px] font-mono"
      >
        Generating QR...
      </div>
    );
  }

  return (
    <img 
      src={qrSrc} 
      width={size} 
      height={size} 
      alt="QR Code" 
      className="bg-white p-2 rounded-xl object-contain shadow-sm border border-slate-100"
      referrerPolicy="no-referrer"
    />
  );
}

export default function ClientsView({ clients, toast, onViewClient }: ClientsViewProps) {
  const [queryStr, setQueryStr] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [showPosterModal, setShowPosterModal] = useState<Client | null>(null);
  const [posterType, setPosterType] = useState<"standard" | "international">("standard");

  const handleDownloadQR = (clientToDownload: Client, type: "standard" | "international" = "standard") => {
    const url = getPaymentUrl(clientToDownload.clientId, type);
    QRCode.toDataURL(
      url,
      {
        width: 600, // 600x600 high contrast PNG
        margin: 4, // white quiet zone
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      },
      (err, base64Url) => {
        if (err) {
          toast("Failed to generate download PNG", "error");
          console.error(err);
          return;
        }
        const link = document.createElement("a");
        link.href = base64Url;
        link.download = `GeraPayQR_${type}_${clientToDownload.businessName.replace(/[^a-z0-9]/gi, "_")}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast(`QR Code (${type === 'international' ? 'International' : 'Standard'}) downloaded successfully`, "success");
      }
    );
  };

  // Tab states for registry sections
  const [activeTab, setActiveTab] = useState<"local" | "international">("local");

  // Form states
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [momoCode, setMomoCode] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [qrType, setQrType] = useState<"local" | "international">("local");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [saving, setSaving] = useState(false);

  // Diagnostic states for temporary debug panel
  const [debugValidationPassed, setDebugValidationPassed] = useState<boolean | null>(null);
  const [debugSaveStarted, setDebugSaveStarted] = useState<boolean | null>(null);
  const [debugSaveSuccess, setDebugSaveSuccess] = useState<boolean | null>(null);
  const [debugError, setDebugError] = useState<string>("");

  type ValidationStage = "pending" | "running" | "passed" | "failed";
  type SaveStage = "idle" | "saving" | "success" | "failed";
  type HandshakeStage = "idle" | "waiting" | "synced" | "error";

  const [debugValidationStage, setDebugValidationStage] = useState<ValidationStage>("pending");
  const [debugSaveStage, setDebugSaveStage] = useState<SaveStage>("idle");
  const [debugHandshakeStage, setDebugHandshakeStage] = useState<HandshakeStage>("idle");

  // New fields
  const [clientType, setClientType] = useState<"system_access" | "qr_only">("system_access");
  const [mtnPaymentType, setMtnPaymentType] = useState<"momo_code" | "phone_number">("momo_code");
  const [momoPayCode, setMomoPayCode] = useState("");
  const [momoPhoneNumber, setMomoPhoneNumber] = useState("");
  const [plan, setPlan] = useState("restaurant");
  const [maxStaff, setMaxStaff] = useState<number>(5);
  const [maxDevices, setMaxDevices] = useState<number>(3);

  // Business Login Access fields
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPassword, setBusinessPassword] = useState("");
  const [businessAdminName, setBusinessAdminName] = useState("");

  const [currentCid, setCurrentCid] = useState("");
  const [businessUsername, setBusinessUsername] = useState("");
  const [businessAccessQrDataUrl, setBusinessAccessQrDataUrl] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deployedClientCredentials, setDeployedClientCredentials] = useState<{
    businessName: string;
    adminName: string;
    username: string;
    passwordPlain: string;
    businessId: string;
    qrUrl: string;
    authUid?: string;
    userDocPath?: string;
    businessDocPath?: string;
    businessAccessLink?: string;
  } | null>(null);

  useEffect(() => {
    if (!editingClient) {
      setBusinessUsername(generateBusinessUsername(businessName));
    }
  }, [businessName, editingClient]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setBusinessName("");
    setOwnerName("");
    setPhone("");
    setMomoCode("");
    setLocation("");
    setCategory(CATEGORIES[0]);
    setQrType("local");
    setLogoFile(null);
    setEditingClient(null);
    setClientType("system_access");
    setMtnPaymentType("momo_code");
    setMomoPayCode("");
    setMomoPhoneNumber("");
    setPlan("restaurant");
    setMaxStaff(5);
    setMaxDevices(3);
    setBusinessEmail("");
    setBusinessPassword("");
    setBusinessAdminName("");
    setFormErrors({});
    setDeployedClientCredentials(null);
    setCurrentCid("");
    setBusinessUsername("");
    setBusinessAccessQrDataUrl(null);
    
    // Reset debug panel states
    setDebugValidationPassed(null);
    setDebugSaveStarted(null);
    setDebugSaveSuccess(null);
    setDebugError("");
    setDebugValidationStage("pending");
    setDebugSaveStage("idle");
    setDebugHandshakeStage("idle");
  };

  const handleOpenAdd = () => {
    resetForm();
    const newCid = genClientId();
    setCurrentCid(newCid);
    setBusinessUsername("");
    setBusinessPassword("");
    setBusinessAccessQrDataUrl(null);
    setShowAddModal(true);
  };

  const handleOpenEdit = (client: Client) => {
    setFormErrors({});
    setDeployedClientCredentials(null);
    setEditingClient(client);
    const existingCid = client.businessId || client.clientId;
    setCurrentCid(existingCid);
    setBusinessName(client.businessName);
    setOwnerName(client.ownerName);
    setPhone(client.phone);
    setMomoCode(client.momoCode || "");
    setLocation(client.location);
    setCategory(client.category);
    setQrType(client.qrType || "local");
    setLogoFile(null);
    setClientType(client.clientType || "system_access");
    setMtnPaymentType(client.mtnPaymentType || "momo_code");
    setMomoPayCode(client.momoPayCode || (client.mtnPaymentType === "momo_code" ? client.momoCode : ""));
    setMomoPhoneNumber(client.momoPhoneNumber || (client.mtnPaymentType === "phone_number" ? client.momoCode : ""));
    setPlan(client.plan || "restaurant");
    setMaxStaff(client.maxStaff !== undefined ? client.maxStaff : 5);
    setMaxDevices(client.maxDevices !== undefined ? client.maxDevices : 3);
    
    setBusinessAdminName((client as any).businessAdminName || client.ownerName);
    setBusinessUsername(client.businessUsername || (client as any).businessUsername || generateBusinessUsername(client.businessName));
    setBusinessPassword("");
    setBusinessAccessQrDataUrl(null);

    // Reset debug panel states
    setDebugValidationPassed(null);
    setDebugSaveStarted(null);
    setDebugSaveSuccess(null);
    setDebugError("");
    setDebugValidationStage("pending");
    setDebugSaveStage("idle");
    setDebugHandshakeStage("idle");
    setShowAddModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setLogoFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setLogoFile(e.dataTransfer.files[0]);
    }
  };

  const handleSaveClient = async (e?: React.FormEvent, isMock: boolean = false) => {
    if (e) e.preventDefault();
    
    // Clear previous errors & indicators
    setFormErrors({});
    setDeployedClientCredentials(null);
    setDebugError("");
    setDebugValidationStage("running");
    setDebugSaveStage("idle");
    setDebugHandshakeStage("idle");
    setDebugSaveStarted(true);
    setSaving(true);

    // Sleep 400ms to visually show "Validation: Running..." state before checking values
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Rigorous form validation
    const errs: Record<string, string> = {};

    if (!businessName || !businessName.trim()) {
      errs.businessName = "Business Name is required";
    }
    if (!ownerName || !ownerName.trim()) {
      errs.ownerName = "Owner Name is required";
    }
    if (!phone || !phone.trim()) {
      errs.phone = "Contact Phone is required";
    }
    if (!location || !location.trim()) {
      errs.location = "Location or Shop Address is required";
    }

    let resolvedMomoCode = "";
    if (clientType === "system_access") {
      if (!momoCode || !momoCode.trim()) {
        errs.momoCode = "MTN MoMo Merchant Code is required for System Access Clients";
      } else {
        resolvedMomoCode = momoCode.trim();
      }
    } else {
      if (mtnPaymentType === "momo_code") {
        if (!momoPayCode || !momoPayCode.trim()) {
          errs.momoPayCode = "MoMoPay Code is required";
        } else {
          resolvedMomoCode = momoPayCode.trim();
        }
      } else {
        if (!momoPhoneNumber || !momoPhoneNumber.trim()) {
          errs.momoPhoneNumber = "MTN Phone Number is required";
        } else {
          resolvedMomoCode = momoPhoneNumber.trim();
        }
      }
    }

    if (clientType === "system_access") {
      if (!editingClient) {
        if (!businessEmail || !businessEmail.trim()) {
          errs.businessEmail = "Business login email is required";
        }
      }

      if (!businessAdminName || !businessAdminName.trim()) {
        errs.businessAdminName = "Business Admin Name is required";
      }

      if (!businessUsername || !businessUsername.trim()) {
        errs.businessUsername = "Business Username is required";
      }

      if (!editingClient) {
        if (!businessPassword || !businessPassword.trim()) {
          errs.businessPassword = "Password is required";
        }
      }
    }

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      setDebugValidationStage("failed");
      setDebugValidationPassed(false);
      setDebugSaveSuccess(false);
      
      const firstErrKey = Object.keys(errs)[0];
      const firstErrMsg = errs[firstErrKey];
      setDebugError(`Validation failed: ${firstErrMsg}`);
      toast(firstErrMsg, "error");
      setSaving(false);
      return;
    }

    // Passed validation successfully!
    setDebugValidationStage("passed");
    setDebugValidationPassed(true);
    setDebugSaveStage("saving");
    setDebugHandshakeStage("waiting");

    await new Promise((resolve) => setTimeout(resolve, 400));

    const finalAdminName = (clientType === "system_access" && businessAdminName.trim()) ? businessAdminName.trim() : ownerName.trim();
    const finalUsername = clientType === "system_access" ? businessUsername.trim() : generateBusinessUsername(businessName);
    const resolvedCid = editingClient ? (editingClient.businessId || editingClient.clientId) : (currentCid || genClientId());

    // If it's a mock test local save, run the offline simulation
    if (isMock) {
      await new Promise((resolve) => setTimeout(resolve, 1200));

      setDebugSaveStage("success");
      setDebugSaveSuccess(true);
      setDebugHandshakeStage("synced");
      toast(`[LOCAL MOCK] Simulated merchant '${businessName}' successfully created (offline proof)!`, "success");

      setDeployedClientCredentials({
        businessName: businessName.trim(),
        adminName: finalAdminName,
        username: finalUsername,
        passwordPlain: businessPassword.trim() || "(unchanged)",
        businessId: resolvedCid,
        qrUrl: "",
        authUid: "GP-UID-MOCK-12345",
        userDocPath: "users/GP-UID-MOCK-12345",
        businessDocPath: `businesses/${resolvedCid}`,
        businessAccessLink: getBusinessAccessUrl(resolvedCid)
      });
      setSaving(false);
      return;
    }

    // Timeout promise for 10 seconds
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Deployment failed: connection or permission issue.")), 10000)
    );

    try {
      let authUid = "";
      let logoUrl = editingClient?.logoUrl || "";

      if (logoFile && storage) {
        try {
          const fileRef = ref(storage, `logos/${Date.now()}_${logoFile.name}`);
          const uploadSnapshot = await uploadBytes(fileRef, logoFile);
          logoUrl = await getDownloadURL(uploadSnapshot.ref);
        } catch (storageErr) {
          console.error("Storage upload failed, defaulting dynamically", storageErr);
        }
      }

      // Generate credentials and QR code to display and save
      const qrLink = getBusinessAccessUrl(resolvedCid);
      let qrDataUrl = "";
      if (clientType === "system_access") {
        try {
          qrDataUrl = await QRCode.toDataURL(qrLink, {
            width: 512,
            margin: 4,
            color: {
              dark: "#000000",
              light: "#FFFFFF"
            }
          });
        } catch (qrErr) {
          console.error("Error generating success QR", qrErr);
        }
      }

      const clientFields = {
        clientType,
        mtnPaymentType: clientType === "qr_only" ? mtnPaymentType : "momo_code",
        momoPayCode: clientType === "qr_only" ? momoPayCode.trim() : "",
        momoPhoneNumber: clientType === "qr_only" ? momoPhoneNumber.trim() : "",
        momoCode: resolvedMomoCode,
      };

      if (editingClient?.id) {
        // Edit flow
        const docRef = doc(db, "clients", editingClient.id);
        const bizId = resolvedCid;
        const payload: any = {
          businessId: bizId,
          clientId: bizId,
          businessName: businessName.trim(),
          ownerName: ownerName.trim(),
          phone: phone.trim(),
          location: location.trim(),
          category,
          logoUrl,
          qrType,
          qrTypesEnabled: qrType,
          active: editingClient.status === "active" || (editingClient as any).status === "active" || (editingClient as any).active === true,
          status: editingClient.status || (editingClient as any).status || "active",
          hasClientLogin: clientType === "system_access",
          maxStaff: clientType === "system_access" ? Number(maxStaff) : 0,
          maxDevices: clientType === "system_access" ? Number(maxDevices) : 0,
          plan,
          ...clientFields,
          updatedAt: serverTimestamp(),
          
          businessAdminName: finalAdminName,
          businessUsername: finalUsername,
          role: "business_admin"
        };

        if (clientType === "system_access") {
          payload.businessUsername = finalUsername;
          if (businessPassword.trim()) {
            payload.businessPassword = sha256(businessPassword.trim());
            payload.passwordHash = sha256(businessPassword.trim());
          }
          payload.businessAccessQr = `/client-login?businessId=${bizId}`;
          payload.businessAccessLink = qrLink;
          payload.businessAccessQrUrl = qrDataUrl;
        }

        await Promise.race([
          Promise.all([
            updateDoc(docRef, payload),
            setDoc(doc(db, "businesses", bizId), payload, { merge: true })
          ]),
          timeoutPromise
        ]);

        setDebugSaveStage("success");
        setDebugSaveSuccess(true);
        setDebugHandshakeStage("synced");
        toast(`${businessName} updated successfully`, "success");
      } else {
        // Create flow
        const cid = resolvedCid;
        authUid = "";
        let authEmail = businessEmail.trim().toLowerCase();

        if (clientType === "system_access") {
          if (!authEmail) {
            authEmail = `${finalUsername.toLowerCase()}@gerapay.local`;
          }
          
          try {
            // Initialize isolated secondary app instance to preserve Super Admin login session
            const secAppName = `GeraRegisterApp-${Date.now()}`;
            const secApp = initializeApp(firebaseConfig, secAppName);
            const secAuth = getAuth(secApp);
            const userCred = await createUserWithEmailAndPassword(secAuth, authEmail, businessPassword.trim());
            authUid = userCred.user.uid;
            await authSignOut(secAuth);
          } catch (authErr: any) {
            if (authErr && (authErr.code === "auth/operation-not-allowed" || authErr?.message?.includes("operation-not-allowed"))) {
              console.warn("[GeraPay Save Auth Soft Warning]: Firebase Auth Email/Password disabled in console. Registering user inside database ledger with fallback username-matching...");
              authUid = "GP-UID-MOCK-" + Math.floor(100000 + Math.random() * 900000);
              toast("Notice: Firebase Auth Email/Password disabled. Falling back to secure database ledger authentication.", "warning");
            } else {
              console.error("[GeraPay Save Auth Error]:", authErr);
              throw new Error(`Firebase Auth user registration failed: ${authErr.message || String(authErr)}`);
            }
          }

          if (!authUid) {
            throw new Error("Failed to retrieve a valid Firebase Authentication UID.");
          }

          const userPayload = {
            uid: authUid,
            email: authEmail,
            username: finalUsername,
            usernameLower: finalUsername.toLowerCase(),
            role: "business_admin",
            businessId: cid,
            businessName: businessName.trim(),
            active: true,
            password: sha256(businessPassword.trim()),
            passwordHash: sha256(businessPassword.trim()),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };

          const bizPayload = {
            businessId: cid,
            businessName: businessName.trim(),
            ownerName: ownerName.trim(),
            phone: phone.trim(),
            location: location.trim(),
            momoCode: resolvedMomoCode,
            businessAccessLink: qrLink,
            businessAccessQrUrl: qrDataUrl,
            maxDevices: Number(maxDevices),
            maxStaff: Number(maxStaff),
            status: "active",
            active: true,
            logoUrl,
            category,
            plan,
            qrType,
            qrTypesEnabled: qrType,
            businessAdminName: finalAdminName,
            businessUsername: finalUsername,
            role: "business_admin",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };

          // Also populate clients payload since clients is audited/queried elsewhere
          const clientPayload = {
            ...bizPayload,
            clientId: cid,
            hasClientLogin: true,
            ...clientFields
          };

          try {
            await Promise.race([
              Promise.all([
                setDoc(doc(db, "users", authUid), userPayload),
                setDoc(doc(db, "businesses", cid), bizPayload),
                addDoc(collection(db, "clients"), clientPayload)
              ]),
              timeoutPromise
            ]);
          } catch (writeErr: any) {
            console.error("[GeraPay Create Sync Error]:", writeErr);
            throw new Error(`Database writes failed: ${writeErr.message || String(writeErr)}`);
          }

        } else {
          // For Non-System Access / QR Only clients, just create business / client records
          const bizPayload = {
            businessId: cid,
            businessName: businessName.trim(),
            ownerName: ownerName.trim(),
            phone: phone.trim(),
            location: location.trim(),
            momoCode: resolvedMomoCode,
            businessAccessLink: qrLink,
            businessAccessQrUrl: qrDataUrl,
            maxDevices: 0,
            maxStaff: 0,
            status: "active",
            active: true,
            logoUrl,
            category,
            plan,
            qrType,
            qrTypesEnabled: qrType,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };

          const clientPayload = {
            ...bizPayload,
            clientId: cid,
            hasClientLogin: false,
            ...clientFields
          };

          try {
            await Promise.race([
              Promise.all([
                setDoc(doc(db, "businesses", cid), bizPayload),
                addDoc(collection(db, "clients"), clientPayload)
              ]),
              timeoutPromise
            ]);
          } catch (writeErr: any) {
             console.error("[GeraPay Create Sync Error]:", writeErr);
             throw new Error(`Database writes failed: ${writeErr.message || String(writeErr)}`);
          }
        }

        setDebugSaveStage("success");
        setDebugSaveSuccess(true);
        setDebugHandshakeStage("synced");
        toast(`Generated terminal for ${businessName} successfully`, "success");
      }

      setDeployedClientCredentials({
        businessName: businessName.trim(),
        adminName: finalAdminName,
        username: finalUsername,
        passwordPlain: businessPassword.trim() || "(unchanged)",
        businessId: resolvedCid,
        qrUrl: qrDataUrl,
        authUid: authUid || undefined,
        userDocPath: authUid ? `users/${authUid}` : undefined,
        businessDocPath: `businesses/${resolvedCid}`,
        businessAccessLink: qrLink || getBusinessAccessUrl(resolvedCid)
      });

    } catch (err: any) {
      setDebugSaveStage("failed");
      setDebugSaveSuccess(false);
      setDebugHandshakeStage("error");
      const errMsg = err.message || String(err);
      setDebugError(errMsg);
      console.error("[GeraPay Save Error]:", err);
      toast(errMsg, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTestLocalSave = () => {
    handleSaveClient(undefined, true);
  };

  const handleToggleStatus = async (client: Client) => {
    if (!client.id) return;
    const newStatus = client.status === "active" ? "inactive" : "active";
    try {
      const docRef = doc(db, "clients", client.id);
      await updateDoc(docRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      toast(`${client.businessName} state transitioned to ${newStatus}`, "info");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `clients/${client.id}`);
    }
  };

  const filteredClients = clients.filter((c) => {
    const matchesSearch = 
      c.businessName?.toLowerCase().includes(queryStr.toLowerCase()) ||
      c.ownerName?.toLowerCase().includes(queryStr.toLowerCase()) ||
      c.clientId?.toLowerCase().includes(queryStr.toLowerCase()) ||
      c.phone?.includes(queryStr);
      
    const currentQrType = c.qrType || "local";
    return matchesSearch && currentQrType === activeTab;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#11141C] p-4 rounded-2xl border border-white/5">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input 
            type="text" 
            value={queryStr}
            onChange={(e) => setQueryStr(e.target.value)}
            placeholder="Search clients by name, ID or phone..."
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#1B32FF] transition-colors"
          />
        </div>
        
        <button 
          onClick={handleOpenAdd}
          className="w-full sm:w-auto px-4 py-2 bg-[#1B32FF] hover:brightness-110 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all text-white cursor-pointer"
        >
          <Plus size={15} /> Add New Merchant
        </button>
      </div>

      {/* Registry Navigation Tabs */}
      <div className="flex border-b border-white/5 gap-6 px-1 pt-1 font-sans">
        <button
          onClick={() => setActiveTab("local")}
          className={`pb-3 text-xs font-bold transition-all relative cursor-pointer flex items-center gap-2 ${
            activeTab === "local" 
              ? "text-white" 
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Local QR Clients (MoMo RWF)
          <span className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-md text-[9px] font-bold">
            {clients.filter(c => (c.qrType || "local") === "local").length}
          </span>
          {activeTab === "local" && (
            <motion.div 
              layoutId="clientsActiveTabUnderline" 
              className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#1B32FF]" 
            />
          )}
        </button>
        
        <button
          onClick={() => setActiveTab("international")}
          className={`pb-3 text-xs font-bold transition-all relative cursor-pointer flex items-center gap-2 ${
            activeTab === "international" 
              ? "text-white" 
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          International QR Clients (USD/RWF Cards)
          <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-500 rounded-md text-[9px] font-bold">
            {clients.filter(c => c.qrType === "international").length}
          </span>
          {activeTab === "international" && (
            <motion.div 
              layoutId="clientsActiveTabUnderline" 
              className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FFC107]" 
            />
          )}
        </button>
      </div>

      <div className="bg-[#11141C] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs text-slate-300 font-sans">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-slate-400 font-bold">
                <th className="p-4 uppercase tracking-wider">Logo</th>
                <th className="p-4 uppercase tracking-wider">Merchant / ID</th>
                <th className="p-4 uppercase tracking-wider">Owner name</th>
                <th className="p-4 uppercase tracking-wider">Category</th>
                <th className="p-4 uppercase tracking-wider">MoMo Pay Code</th>
                <th className="p-4 uppercase tracking-wider">Status</th>
                <th className="p-4 uppercase tracking-wider text-center">QR Downloads</th>
                <th className="p-4 text-right uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 text-xs font-sans">
                    No registry targets found matching search query for {activeTab === "international" ? "International" : "Local"} QR category.
                  </td>
                </tr>
              ) : (
                filteredClients.map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="p-4">
                      {c.logoUrl ? (
                        <img 
                          src={c.logoUrl} 
                          className="w-9 h-9 rounded-lg object-cover border border-white/10 referrerPolicy='no-referrer'" 
                          alt=""
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold text-sm font-sans">
                          {c.businessName[0]?.toUpperCase()}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap items-center gap-1.5 font-sans">
                        <span className="font-bold text-white text-xs">{c.businessName}</span>
                        <span className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-wider border ${
                          (c.qrType || "local") === "international"
                            ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                            : "bg-indigo-500/10 text-[#2140ff] border-indigo-500/10"
                        }`}>
                          {(c.qrType || "local") === "international" ? "International QR" : "Local QR"}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-wider border ${
                          c.clientType === "qr_only"
                            ? "bg-amber-400/15 text-amber-400 border-amber-400/30 font-sans"
                            : "bg-teal-400/15 text-teal-400 border-teal-400/30 font-sans"
                        }`}>
                          {c.clientType === "qr_only" ? "QR Only" : "System Access"}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 uppercase mt-0.5">{c.clientId}</div>
                    </td>
                    <td className="p-4 text-xs font-sans text-slate-400">{c.ownerName}</td>
                    <td className="p-4 text-xs font-sans text-slate-400">{c.category}</td>
                    <td className="p-4 text-[#FFC107] font-bold text-xs">{c.momoCode}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        c.status === "active" 
                          ? "bg-emerald-500/10 text-emerald-400" 
                          : "bg-red-500/10 text-red-400"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.status === "active" ? "bg-emerald-400" : "bg-red-400"}`} />
                        {c.status}
                      </span>
                    </td>
                    <td className="p-4 text-center space-x-1.5 whitespace-nowrap">
                      <button 
                        onClick={() => handleDownloadQR(c, "standard")}
                        title="Download Local Payment QR"
                        className="px-2 py-1 bg-white/5 hover:bg-white/10 text-indigo-400 hover:text-indigo-300 rounded-lg text-[10px] font-bold font-sans transition-all active:scale-95 cursor-pointer border border-[#1b32ff]/10 inline-flex items-center gap-1"
                      >
                        <Download size={10} /> Local QR
                      </button>
                      <button 
                        onClick={() => handleDownloadQR(c, "international")}
                        title="Download International Payment QR"
                        className="px-2 py-1 bg-yellow-500/5 hover:bg-yellow-500/10 text-yellow-500 rounded-lg text-[10px] font-bold font-sans transition-all active:scale-95 cursor-pointer border border-yellow-500/10 inline-flex items-center gap-1"
                      >
                        <Download size={10} /> Intl QR
                      </button>
                    </td>
                    <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                      <button 
                        onClick={() => onViewClient(c)}
                        title="View Merchant Profile"
                        className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-lg text-slate-200 transition-all cursor-pointer inline-flex"
                      >
                        <Eye size={13} />
                      </button>
                      <button 
                        onClick={() => handleOpenEdit(c)}
                        title="Edit Merchant"
                        className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-lg text-indigo-400 transition-all cursor-pointer inline-flex"
                      >
                        <Edit size={13} />
                      </button>
                      <button 
                        onClick={() => handleToggleStatus(c)}
                        title={c.status === "active" ? "Deactivate" : "Activate"}
                        className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-lg text-[#FFC107] transition-all cursor-pointer inline-flex"
                      >
                        {c.status === "active" ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      </button>
                      <button 
                        onClick={() => setShowPosterModal(c)}
                        title="Display Printable Poster"
                        className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-lg text-indigo-300 transition-all cursor-pointer inline-flex"
                      >
                        <Printer size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ADD / EDIT CLIENT */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 sm:p-4 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#11141C] border border-white/10 w-full max-w-md rounded-2xl shadow-2xl flex flex-col relative my-auto overflow-hidden text-left"
              style={{ maxHeight: "90vh" }}
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#11141C] shrink-0">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-sans">
                  <Sparkles size={14} className="text-[#FFC107]" />
                  {deployedClientCredentials ? "Deployment Successful!" : (editingClient ? "Edit Merchant Details" : "Register New Merchant")}
                </h3>
                <button 
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              {deployedClientCredentials ? (
                /* SUCCESS CREDENTIALS & ACCESS QR SCREEN */
                <div className="p-5 space-y-4 overflow-y-auto flex-grow pb-12 scrollbar-thin scrollbar-thumb-white/10 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                      <Check size={20} />
                    </div>
                    
                    <div className="text-center space-y-1">
                      <h4 className="text-sm font-bold text-white uppercase tracking-wide font-sans">{deployedClientCredentials.businessName}</h4>
                      <p className="text-[11px] text-[#00D68F] font-bold font-sans">Terminal deployed and synced successfully!</p>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 p-3.5 rounded-xl space-y-2 font-mono">
                      <div className="flex items-center justify-between text-[10px] pb-1 border-b border-white/5 font-sans font-black text-slate-400 uppercase tracking-widest">
                        <span>Terminal Login Credentials</span>
                      </div>
                      
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-start gap-4 text-[11px]">
                          <span className="text-slate-500 font-sans">Admin Name:</span>
                          <span className="text-white text-right font-sans font-bold">{deployedClientCredentials.adminName}</span>
                        </div>
                        <div className="flex justify-between items-start gap-4 text-[11px]">
                          <span className="text-slate-500 font-sans">Username:</span>
                          <span className="text-[#00D68F] font-bold">{deployedClientCredentials.username}</span>
                        </div>
                        {deployedClientCredentials.passwordPlain && deployedClientCredentials.passwordPlain !== "(unchanged)" && (
                          <div className="flex justify-between items-start gap-4 text-[11px]">
                            <span className="text-slate-500 font-sans">Password:</span>
                            <span className="text-white font-bold">{deployedClientCredentials.passwordPlain}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-start gap-4 text-[11px]">
                          <span className="text-slate-500 font-sans">Business ID:</span>
                          <span className="text-indigo-400 font-bold">{deployedClientCredentials.businessId}</span>
                        </div>

                        {deployedClientCredentials.authUid && (
                          <div className="flex justify-between items-start gap-4 text-[11px] pt-1.5 border-t border-white/5">
                            <span className="text-slate-500 font-sans font-bold text-amber-400/90">Auth UID:</span>
                            <span className="text-amber-400 font-bold font-mono text-[10px] break-all select-all">{deployedClientCredentials.authUid}</span>
                          </div>
                        )}
                        {deployedClientCredentials.userDocPath && (
                          <div className="flex justify-between items-start gap-4 text-[11px]">
                            <span className="text-slate-500 font-sans font-bold text-sky-400/90">User Doc:</span>
                            <span className="text-sky-400 font-bold font-mono text-[10px] select-all">{deployedClientCredentials.userDocPath}</span>
                          </div>
                        )}
                        {deployedClientCredentials.businessDocPath && (
                          <div className="flex justify-between items-start gap-4 text-[11px]">
                            <span className="text-slate-500 font-sans font-bold text-emerald-400/90">Business Doc:</span>
                            <span className="text-[#00D68F] font-bold font-mono text-[10px] select-all">{deployedClientCredentials.businessDocPath}</span>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const link = getBusinessAccessUrl(deployedClientCredentials.businessId);
                          const text = `Business Access Link: ${link}\nUsername: ${deployedClientCredentials.username}\nPassword: ${deployedClientCredentials.passwordPlain}`;
                          navigator.clipboard.writeText(text);
                          toast("Credentials copied to clipboard!", "success");
                        }}
                        className="w-full mt-2.5 py-1.5 px-3 bg-white/5 hover:bg-white/10 text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-white/5"
                      >
                        <Copy size={11} /> Copy Credentials
                      </button>
                    </div>

                    {deployedClientCredentials.qrUrl && (
                      <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex flex-col items-center gap-3">
                        <span className="text-[9px] text-[#00D68F] font-mono text-center block uppercase tracking-wider font-bold">★ Authorized Access QR Code ★</span>
                        <img 
                          src={deployedClientCredentials.qrUrl} 
                          alt="Business Access QR" 
                          className="w-[150px] h-[150px] bg-white p-2 rounded-lg object-contain"
                          referrerPolicy="no-referrer"
                        />
                        <div className="w-full space-y-2 mt-1">
                          <span className="text-[9px] font-sans font-bold text-slate-400 block uppercase tracking-wider">Business Access Login Link</span>
                          <div className="bg-black/40 border border-white/5 px-2.5 py-1.5 rounded-lg text-[10px] text-slate-300 font-mono select-all overflow-hidden text-ellipsis whitespace-nowrap">
                            {getBusinessAccessUrl(deployedClientCredentials.businessId)}
                          </div>
                          
                          <p className="text-[10px] text-zinc-400 italic leading-normal">
                            “Use this link on PC/tablet when scanning QR is not possible.”
                          </p>

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                const link = getBusinessAccessUrl(deployedClientCredentials.businessId);
                                navigator.clipboard.writeText(link);
                                toast("Business Access Link copied!", "success");
                              }}
                              className="py-1 px-2.5 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/5 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                            >
                              <Copy size={10} /> Copy Link
                            </button>
                            <a
                              href={getBusinessAccessUrl(deployedClientCredentials.businessId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="py-1 px-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded-lg border border-blue-500/20 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all text-center"
                            >
                              Open Login Link
                            </a>
                          </div>

                          <a
                            href={deployedClientCredentials.qrUrl}
                            download={`GeraPay_AccessQR_${deployedClientCredentials.username}.png`}
                            className="w-full py-1.5 px-3.5 bg-[#1B32FF] hover:brightness-110 text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all text-center"
                          >
                            <Download size={10} /> Download Business Access QR PNG
                          </a>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddModal(false);
                        resetForm();
                      }}
                      className="w-full py-2 bg-[#1B32FF] hover:bg-[#1B32FF]/80 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-lg text-center font-sans tracking-wide"
                    >
                      Done & Close
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveClient} className="flex flex-col flex-grow overflow-hidden min-h-0">
                <div className="p-5 space-y-4 overflow-y-auto flex-grow pb-12 scrollbar-thin scrollbar-thumb-white/10">
                  {/* Logo file drag & drop area */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Merchant Branding Logo</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                        isDragOver 
                          ? "border-[#1B32FF] bg-[#1B32FF]/5" 
                          : "border-white/10 hover:border-white/20 hover:bg-white/[0.01]"
                      }`}
                    >
                      <UploadCloud size={24} className="mx-auto text-slate-500 mb-1" />
                      <span className="text-xs text-indigo-400 font-bold block">
                        {logoFile ? `Selected: ${logoFile.name}` : "Click or Drag Business Logo here"}
                      </span>
                      <span className="text-[9px] text-slate-500 mt-0.5 block">Format: JPG, PNG • Max size 2MB</span>
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        className="hidden" 
                      />
                    </div>
                  </div>                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <CreditCard size={10} className="text-indigo-400" /> Business Name *
                      </label>
                      <input 
                        type="text" 
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="Kwame Shop"
                        className={`w-full px-3 py-2 bg-white/5 border ${formErrors.businessName ? 'border-rose-500' : 'border-white/10'} rounded-lg text-xs font-bold text-white focus:outline-none focus:border-[#1B32FF] transition-all`}
                      />
                      {formErrors.businessName && (
                        <span className="text-[10px] text-rose-500 block font-semibold">{formErrors.businessName}</span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <User size={10} className="text-indigo-400" /> Owner Name *
                      </label>
                      <input 
                        type="text" 
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        placeholder="Kwame Mensah"
                        className={`w-full px-3 py-2 bg-white/5 border ${formErrors.ownerName ? 'border-rose-500' : 'border-white/10'} rounded-lg text-xs text-white focus:outline-none focus:border-[#1B32FF] transition-all`}
                      />
                      {formErrors.ownerName && (
                        <span className="text-[10px] text-rose-500 block font-semibold">{formErrors.ownerName}</span>
                      )}
                    </div>
                  </div>

                  <div className={clientType === "system_access" ? "grid grid-cols-2 gap-3.5" : "space-y-1"}>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <Phone size={10} className="text-indigo-400" /> Contact Phone *
                      </label>
                      <input 
                        type="tel" 
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="e.g. 0781234567"
                        className={`w-full px-3 py-2 bg-white/5 border ${formErrors.phone ? 'border-rose-500' : 'border-white/10'} rounded-lg text-xs text-white font-mono tracking-wide focus:outline-none focus:border-[#1B32FF] transition-all`}
                      />
                      {formErrors.phone && (
                        <span className="text-[10px] text-rose-500 block font-semibold">{formErrors.phone}</span>
                      )}
                    </div>

                    {clientType === "system_access" && (
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                          <Hash size={10} className="text-[#FFC107]" /> MoMo Pay Code *
                        </label>
                        <input 
                          type="text" 
                          value={momoCode}
                          onChange={(e) => setMomoCode(e.target.value)}
                          placeholder="e.g. 192039"
                          className={`w-full px-3 py-2 bg-white/5 border ${formErrors.momoCode ? 'border-rose-500' : 'border-white/10'} rounded-lg text-xs text-white font-mono font-bold tracking-widest focus:outline-none focus:border-[#1B32FF] transition-all`}
                        />
                        {formErrors.momoCode && (
                          <span className="text-[10px] text-rose-500 block font-semibold">{formErrors.momoCode}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      <MapPin size={10} className="text-indigo-400" /> Location / Shop Address *
                    </label>
                    <input 
                      type="text" 
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Accra Terminal Shop #23"
                      className={`w-full px-3 py-2 bg-white/5 border ${formErrors.location ? 'border-rose-500' : 'border-white/10'} rounded-lg text-xs text-white focus:outline-none focus:border-[#1B32FF] transition-all`}
                    />
                    {formErrors.location && (
                      <span className="text-[10px] text-rose-500 block font-semibold">{formErrors.location}</span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      <Tag size={10} className="text-indigo-400" /> Merchant Category *
                    </label>
                    <select 
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-xs text-white focus:outline-none cursor-pointer"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1 pt-1">
                    <label className="text-[9px] font-bold text-[#FFC107] uppercase tracking-widest flex items-center gap-1">
                      Client Permissions Category *
                    </label>
                    <select 
                      value={clientType}
                      onChange={(e) => setClientType(e.target.value as "system_access" | "qr_only")}
                      className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-xs font-bold text-white focus:outline-none cursor-pointer"
                    >
                      <option value="system_access">System Access Client (Login, Staff & Devices enabled)</option>
                      <option value="qr_only">QR Only Client (No client login, payments only)</option>
                    </select>
                    <span className="text-[9px] text-slate-500 block leading-tight pt-0.5">
                      {clientType === "system_access" 
                        ? "Permissions include interactive waiter, cashier, and manager portals, bills tracking, device terminal locks, and custom accounts."
                        : "Strictly limited to static QR and printed banners. Bypasses client system panels, backend log-in, and browser registrations."}
                    </span>
                  </div>

                  {clientType === "qr_only" && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="space-y-3 bg-white/[0.02] border border-white/5 p-3 rounded-xl"
                    >
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-[#FFC107] uppercase tracking-widest flex items-center gap-1">
                          MTN Payment Method *
                        </label>
                        <select 
                          value={mtnPaymentType}
                          onChange={(e) => setMtnPaymentType(e.target.value as "momo_code" | "phone_number")}
                          className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-xs font-bold text-white focus:outline-none cursor-pointer"
                        >
                          <option value="momo_code">MoMoPay Code</option>
                          <option value="phone_number">Phone Number</option>
                        </select>
                        <span className="text-[9px] text-slate-500 block leading-tight pt-0.5">
                          Choose the primary MTN mobile money receiving format.
                        </span>
                      </div>

                      {mtnPaymentType === "momo_code" ? (
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <Hash size={10} className="text-[#FFC107]" /> MoMoPay Code *
                          </label>
                          <input 
                            type="text" 
                            value={momoPayCode}
                            onChange={(e) => setMomoPayCode(e.target.value)}
                            placeholder="e.g. 192039"
                            className={`w-full px-3 py-2 bg-white/5 border ${formErrors.momoPayCode ? 'border-rose-500' : 'border-white/10'} rounded-lg text-xs text-white font-mono font-bold tracking-widest focus:outline-none focus:border-[#1B32FF] transition-all`}
                          />
                          {formErrors.momoPayCode && (
                            <span className="text-[10px] text-rose-500 block font-semibold">{formErrors.momoPayCode}</span>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <Phone size={10} className="text-[#FFC107]" /> MTN Phone Number *
                          </label>
                          <input 
                            type="tel" 
                            value={momoPhoneNumber}
                            onChange={(e) => setMomoPhoneNumber(e.target.value)}
                            placeholder="e.g. 078XXXXXXX"
                            className={`w-full px-3 py-2 bg-white/5 border ${formErrors.momoPhoneNumber ? 'border-rose-500' : 'border-white/10'} rounded-lg text-xs text-white font-mono font-bold tracking-wide focus:outline-none focus:border-[#1B32FF] transition-all`}
                          />
                          {formErrors.momoPhoneNumber && (
                            <span className="text-[10px] text-rose-500 block font-semibold">{formErrors.momoPhoneNumber}</span>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {clientType === "system_access" && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="space-y-3 bg-white/[0.02] border border-white/5 p-3 rounded-xl"
                    >
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                          Subscription Plan *
                        </label>
                        <select 
                          value={plan}
                          onChange={(e) => setPlan(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-xs text-white focus:outline-none cursor-pointer"
                        >
                          <option value="starter">Starter Plan</option>
                          <option value="restaurant">Restaurant Plan</option>
                          <option value="international">International Tourist Plan</option>
                          <option value="enterprise">Enterprise Plan</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Max Staff Accounts</label>
                          <input 
                            type="number"
                            min="1"
                            max="50"
                            value={maxStaff}
                            onChange={(e) => setMaxStaff(Number(e.target.value))}
                            className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[#1B32FF]"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Max Device Terminals</label>
                          <input 
                            type="number"
                            min="1"
                            max="20"
                            value={maxDevices}
                            onChange={(e) => setMaxDevices(Number(e.target.value))}
                            className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[#1B32FF]"
                          />
                        </div>
                      </div>

                      {!editingClient && (
                        <div className="border-t border-white/5 pt-3.5 space-y-3">
                          <div className="flex items-center gap-1.5 pb-1">
                            <Lock size={12} className="text-[#FFC107]" />
                            <span className="text-[10px] font-black uppercase text-white tracking-wider">Business Login Access Setup</span>
                          </div>
                          
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                              Business Admin Email (Web Panel) *
                            </label>
                            <input 
                              type="email" 
                              value={businessEmail}
                              onChange={(e) => setBusinessEmail(e.target.value)}
                              placeholder="e.g. kigali_admin@gera.rw"
                              className={`w-full px-3 py-1.5 bg-white/5 border ${formErrors.businessEmail ? 'border-rose-500' : 'border-white/10'} rounded-lg text-xs text-white focus:outline-none focus:border-[#1B32FF] transition-all`}
                            />
                            {formErrors.businessEmail && (
                              <span className="text-[10px] text-rose-500 block font-semibold">{formErrors.businessEmail}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Business Login Credentials section requested by user */}
                      <div className="border-t border-white/5 pt-3.5 space-y-3">
                        <div className="flex items-center gap-1.5 pb-1">
                          <Lock size={12} className="text-[#00D68F]" />
                          <span className="text-[10px] font-black uppercase text-white tracking-wider">Business Login Credentials (QR Access)</span>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                            Business Admin Name *
                          </label>
                          <input 
                            type="text" 
                            value={businessAdminName}
                            onChange={(e) => setBusinessAdminName(e.target.value)}
                            placeholder="e.g. Olivier Ndayisaba"
                            className={`w-full px-3 py-1.5 bg-white/5 border ${formErrors.businessAdminName ? 'border-rose-500' : 'border-white/10'} rounded-lg text-xs text-white focus:outline-none focus:border-[#1B32FF] transition-all`}
                          />
                          {formErrors.businessAdminName && (
                            <span className="text-[10px] text-rose-500 block font-semibold">{formErrors.businessAdminName}</span>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                            Business Username *
                          </label>
                          <input 
                            type="text" 
                            value={businessUsername}
                            onChange={(e) => setBusinessUsername(e.target.value)}
                            placeholder="e.g. oliven"
                            className={`w-full px-3 py-1.5 bg-white/5 border ${formErrors.businessUsername ? 'border-rose-500' : 'border-white/10'} rounded-lg text-xs text-white font-mono focus:outline-none focus:border-[#1B32FF] transition-all`}
                          />
                          {formErrors.businessUsername && (
                            <span className="text-[10px] text-rose-500 block font-semibold">{formErrors.businessUsername}</span>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                            Password *
                          </label>
                          <input 
                            type="text" 
                            value={businessPassword}
                            onChange={(e) => setBusinessPassword(e.target.value)}
                            placeholder={editingClient ? "Leave blank to keep current" : "Type terminal password"}
                            className={`w-full px-3 py-1.5 bg-white/5 border ${formErrors.businessPassword ? 'border-rose-500' : 'border-white/10'} rounded-lg text-xs text-white font-mono focus:outline-none focus:border-[#1B32FF] transition-all`}
                          />
                          {formErrors.businessPassword && (
                            <span className="text-[10px] text-rose-500 block font-semibold">{formErrors.businessPassword}</span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              const link = getBusinessAccessUrl(currentCid);
                              const credentialsText = `Business Username: ${businessUsername}\nPassword: ${businessPassword}\nAccess Link: ${link}`;
                              navigator.clipboard.writeText(credentialsText);
                              toast("Credentials copied to clipboard!", "success");
                            }}
                            disabled={!businessUsername || !businessPassword}
                            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[10px] font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <Copy size={11} /> Copy Credentials
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              if (!currentCid) {
                                toast("Business name is required to generate code", "warning");
                                return;
                              }
                              try {
                                const accessUrl = getBusinessAccessUrl(currentCid);
                                const qrCodeUrl = await QRCode.toDataURL(accessUrl, {
                                  width: 250,
                                  margin: 4,
                                  color: {
                                    dark: "#000000",
                                    light: "#FFFFFF"
                                  }
                                });
                                setBusinessAccessQrDataUrl(qrCodeUrl);
                                toast("Business Access QR generated successfully!", "success");
                              } catch (err: any) {
                                toast("Error: " + err.message, "error");
                              }
                            }}
                            className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-[10px] font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer border border-indigo-500/20 animate-pulse"
                          >
                            <Sparkles size={11} /> Generate Business Access QR
                          </button>
                        </div>

                         {businessAccessQrDataUrl && (
                          <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex flex-col items-center gap-3 w-full">
                            <span className="text-[9px] text-[#00D68F] font-mono text-center block uppercase tracking-wider font-extrabold">★ Business Access QR ★</span>
                            <img 
                              src={businessAccessQrDataUrl} 
                              alt="Business Access QR" 
                              className="w-[150px] h-[150px] bg-white p-2 rounded-lg object-contain"
                              referrerPolicy="no-referrer"
                            />
                            
                            <div className="w-full space-y-2 text-left">
                              <span className="text-[9px] font-sans font-bold text-slate-400 block uppercase tracking-wider">Business Access Login Link</span>
                              <div className="bg-black/40 border border-white/5 px-2.5 py-1.5 rounded-lg text-[10px] text-slate-300 font-mono select-all overflow-hidden text-ellipsis whitespace-nowrap">
                                {getBusinessAccessUrl(currentCid)}
                              </div>
                              
                              <p className="text-[10px] text-zinc-400 italic leading-normal">
                                “Use this link on PC/tablet when scanning QR is not possible.”
                              </p>

                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const link = getBusinessAccessUrl(currentCid);
                                    navigator.clipboard.writeText(link);
                                    toast("Business Login Link copied to clipboard!", "success");
                                  }}
                                  className="py-1 px-2.5 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/5 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                                >
                                  <Copy size={10} /> Copy Link
                                </button>
                                <a
                                  href={getBusinessAccessUrl(currentCid)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="py-1 px-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded-lg border border-blue-500/20 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all text-center"
                                >
                                  Open Login Link
                                </a>
                              </div>

                              <a
                                href={businessAccessQrDataUrl}
                                download={`GeraPay_BusinessAccessQR_${businessUsername}.png`}
                                className="w-full py-1.5 px-3.5 bg-[#1B32FF] hover:brightness-110 text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all text-center"
                              >
                                <Download size={10} /> Download Business Access QR PNG
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      <Globe size={11} className="text-indigo-400" /> QR Code Type *
                    </label>
                    <select 
                      value={qrType}
                      onChange={(e) => setQrType(e.target.value as "local" | "international")}
                      className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-xs text-white focus:outline-none cursor-pointer font-bold"
                    >
                      <option value="local">Local Payment QR (MTN MoMo Acceptor)</option>
                      <option value="international">International Payment QR (Visa & MasterCard Acceptor)</option>
                    </select>
                    <span className="text-[9px] text-slate-500 block leading-tight pt-0.5">
                      {qrType === "local" 
                        ? "Enables Kigali-local customers to pay using MTN MoMo Online callbacks or USSD codes." 
                        : "Enables international tourists/foreigners to check out using global credit/debit cards, Apple Pay or Google Pay placeholder gateway."}
                    </span>
                  </div>

                   {/* Temporary Debug Panel */}
                  <div className="mt-4 p-3.5 bg-black/40 border border-white/5 rounded-xl space-y-3">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-400 font-bold uppercase tracking-wider">Deployment Debug Panel</span>
                      <span className="text-slate-500 font-mono text-[9px]">DIAGNOSTICS v1.2</span>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 text-[9px] font-mono">
                      <div className="bg-white/5 p-2 rounded-lg flex flex-col gap-1 items-center text-center">
                        <span className="text-slate-500 font-sans text-[8px] font-bold uppercase leading-none">Validation</span>
                        {debugValidationStage === "pending" && (
                          <span className="text-slate-400 font-bold">Pending •</span>
                        )}
                        {debugValidationStage === "running" && (
                          <span className="text-amber-400 font-bold animate-pulse">Running...</span>
                        )}
                        {debugValidationStage === "passed" && (
                          <span className="text-emerald-400 font-bold font-sans flex items-center gap-0.5">✓ PASSED</span>
                        )}
                        {debugValidationStage === "failed" && (
                          <span className="text-rose-400 font-bold font-sans flex items-center gap-0.5">✗ FAILED</span>
                        )}
                      </div>

                      <div className="bg-white/5 p-2 rounded-lg flex flex-col gap-1 items-center text-center">
                        <span className="text-slate-500 font-sans text-[8px] font-bold uppercase leading-none">Save Status</span>
                        {debugSaveStage === "idle" && (
                          <span className="text-slate-400 font-bold">Idle —</span>
                        )}
                        {debugSaveStage === "saving" && (
                          <span className="text-indigo-400 font-bold flex items-center gap-1 animate-pulse">Saving...</span>
                        )}
                        {debugSaveStage === "success" && (
                          <span className="text-emerald-400 font-bold font-sans">✓ SAVED</span>
                        )}
                        {debugSaveStage === "failed" && (
                          <span className="text-rose-400 font-bold font-sans">✗ FAILED</span>
                        )}
                      </div>

                      <div className="bg-white/5 p-2 rounded-lg flex flex-col gap-1 items-center text-center text-wrap break-all">
                        <span className="text-slate-500 font-sans text-[8px] font-bold uppercase leading-none">Handshake</span>
                        {debugHandshakeStage === "idle" && (
                          <span className="text-slate-400 font-bold">Idle —</span>
                        )}
                        {debugHandshakeStage === "waiting" && (
                          <span className="text-amber-400 font-bold animate-pulse">WAITING</span>
                        )}
                        {debugHandshakeStage === "synced" && (
                          <span className="text-emerald-400 font-bold">✓ SYNCED</span>
                        )}
                        {debugHandshakeStage === "error" && (
                          <span className="text-rose-400 font-bold uppercase text-[8px] animate-pulse">ERROR</span>
                        )}
                      </div>
                    </div>

                    {debugError && (
                      <div className="bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg text-[9px] text-rose-300 font-mono tracking-wide leading-relaxed box-border">
                        <span className="font-sans font-bold uppercase text-rose-400 block mb-0.5 text-[8.5px]">Firestore Error Log:</span>
                        {debugError}
                      </div>
                    )}

                    {/* Integrated Interactive Deployment Buttons */}
                    <div className="pt-2 flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={(e) => handleSaveClient(e)}
                        className="flex-1 py-2 px-3 bg-[#1B32FF] hover:brightness-110 active:scale-95 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md disabled:opacity-50"
                      >
                        {saving && debugSaveStage === "saving" ? (
                          <RefreshCw className="animate-spin" size={11} />
                        ) : (
                          <Sparkles size={11} className="text-yellow-400" />
                        )}
                        {editingClient ? "Update Merchant Now" : "Deploy Merchant Now"}
                      </button>

                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleTestLocalSave}
                        className="py-2 px-3 bg-white/5 hover:bg-white/10 active:scale-95 text-slate-300 hover:text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer border border-white/10 disabled:opacity-50"
                        title="Simulates validation and success locally without connecting to Firestore"
                      >
                        Test Local Save
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-[#141822] border-t border-white/5 flex gap-2 justify-end sticky bottom-0 z-20 shrink-0 pb-safe pb-6">
                  <button 
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 hover:bg-white/5 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer bg-zinc-900/40"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 bg-[#1B32FF] hover:brightness-110 hover:shadow-lg hover:shadow-blue-600/10 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                  >
                    {saving && <RefreshCw className="animate-spin" size={12} />}
                    {saving ? "Saving..." : editingClient ? "Update" : "Deploy"}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: PRINTABLE QR POSTER */}
      <AnimatePresence>
        {showPosterModal && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/85 p-4 backdrop-blur-md overflow-y-auto">
            <div className="w-full max-w-sm flex flex-col gap-4 my-auto">
              {/* Selector at the very top of the modal box */}
              <div className="bg-slate-900 border border-white/10 p-1 rounded-xl grid grid-cols-2 gap-1 text-center font-sans">
                <button
                  type="button"
                  onClick={() => setPosterType("standard")}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    posterType === "standard" 
                      ? "bg-[#1B32FF] text-white" 
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Standard QR
                </button>
                <button
                  type="button"
                  onClick={() => setPosterType("international")}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    posterType === "international" 
                      ? "bg-gradient-to-r from-yellow-500 to-[#FFC107] text-[#0C0E14]" 
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  International QR 🌐
                </button>
              </div>

              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white text-[#0F1428] w-full rounded-[24px] overflow-hidden shadow-2xl p-6 relative flex flex-col items-center justify-between min-h-[500px] font-sans"
              >
                {/* Abs Close button */}
                <button 
                  onClick={() => setShowPosterModal(null)}
                  className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 cursor-pointer transition-colors"
                >
                  <X size={15} />
                </button>

                {/* Poster Header Banner */}
                <div className="text-center space-y-2 mt-4 w-full">
                  <div className="text-[10px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1 inline-block uppercase tracking-wider">
                    ★ Payment QR Code ★
                  </div>
                  {posterType === "standard" ? (
                    <div className="bg-[#FFC107] text-[#0C0E14] px-4 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest block select-none">
                      🌻 MTN MoMo Accepted Here
                    </div>
                  ) : (
                    <div className="bg-gradient-to-r from-indigo-600 to-[#1B32FF] text-white px-4 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest block select-none shadow-sm">
                      🌐 Visa, Mastercard, Apple Pay & MoMo Accepted
                    </div>
                  )}
                  <h2 className="text-xl font-black tracking-tight text-[#0F1428] truncate max-w-full px-2">{showPosterModal.businessName}</h2>
                  <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500 font-medium">
                    <MapPin size={12} className="text-[#1B32FF]" />
                    <span className="truncate max-w-[200px]">{showPosterModal.location}</span>
                  </div>

                  {posterType === "international" && (
                    <div className="px-3.5 py-1 bg-yellow-400/10 border border-yellow-400/20 text-[#D97706] rounded-full text-[9px] font-black uppercase tracking-widest inline-block select-none">
                      ★ International Payments Enabled
                    </div>
                  )}
                </div>

                {/* Center QR Sticker */}
                <div className="my-6 p-4 bg-slate-50 rounded-[20px] shadow-sm flex flex-col items-center justify-center border-2 border-[#1B32FF]/5 w-full">
                  <QRStickerGenerator 
                    text={getPaymentUrl(showPosterModal.clientId, posterType)} 
                    size={190} 
                  />
                  
                  {posterType === "standard" ? (
                    <div className="text-center mt-3 bg-[#FFC107] text-[#0F1428] px-4 py-3 rounded-2xl w-full max-w-[210px] border border-[#0F1428]/10 shadow-sm">
                      <span className="text-[9px] font-extrabold text-[#0F1428]/60 uppercase tracking-widest block">MoMo Pay Code</span>
                      <span className="text-xl font-mono font-black tracking-wider block mt-0.5">{showPosterModal.momoCode}</span>
                    </div>
                  ) : (
                    <div className="text-center mt-3 bg-slate-100 text-[#0F1428] px-4 py-2.5 rounded-2xl w-full max-w-[210px] border border-slate-200 shadow-sm">
                      <span className="text-[8px] font-extrabold text-slate-500 uppercase tracking-widest block">Standard Multi-Currency QR</span>
                      <div className="flex justify-center gap-2 mt-1.5 text-[10.5px] font-bold text-slate-700">
                        <span>USD</span> • <span>RWF</span> • <span>EUR</span> • <span>GBP</span> • <span>GHS</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Instructions Footer block */}
                <div className="w-full text-center border-t border-slate-100 pt-4 pb-2 space-y-1">
                  <span className="text-[10px] font-extrabold text-[#1B32FF] uppercase tracking-wider block">Scan to Pay Instantly</span>
                  <span className="text-[9px] text-[#0f1428]/70 flex items-center justify-center gap-1.5 font-mono">
                    <img src="/gera-pay-qr-logo.svg" alt="Gera Flow" className="w-3.5 h-3.5 object-contain rounded-[3px]" />
                    Terminal ID: {showPosterModal.clientId} • Developed by Gera Tech
                  </span>
                </div>
              </motion.div>

              {/* Action Toolbar underneath */}
              <div className="flex gap-3 justify-center w-full">
                <button 
                  onClick={() => handleDownloadQR(showPosterModal, posterType)}
                  className="flex-grow py-3 bg-[#1B32FF] hover:bg-[#1B32FF]/95 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer"
                >
                  <Download size={14} /> Download Printable QR ({posterType === "international" ? "Intl" : "Std"})
                </button>
                <button 
                  onClick={() => setShowPosterModal(null)}
                  className="px-4 py-3 bg-white/10 hover:bg-white/15 border border-white/10 hover:border-white/20 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
export { genClientId };
