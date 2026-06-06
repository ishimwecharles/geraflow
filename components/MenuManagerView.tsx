import React, { useState, useEffect, useRef } from "react";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  addDoc, 
  writeBatch,
  getDoc
} from "firebase/firestore";
import { db, storage } from "../lib/firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { Menu, MenuSection, MenuProduct } from "../types";

// Utility to compress image to a specified dimensions and quality
const compressImage = (base64Str: string, maxWidth = 350, maxHeight = 350, quality = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    // If it is already a web-hosted URL, resolve immediately without compression
    if (base64Str.startsWith("http://") || base64Str.startsWith("https://")) {
      resolve(base64Str);
      return;
    }
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve(compressedDataUrl);
    };
    img.onerror = (err) => {
      resolve(base64Str); // Fallback to original on error
    };
  });
};
import QRCode from "qrcode";
import { getMenuUrl } from "../lib/urls";
import { 
  Save, 
  Plus, 
  Trash2, 
  ChevronUp, 
  ChevronDown, 
  Eye, 
  QrCode, 
  Image as ImageIcon, 
  Check, 
  Edit, 
  Sparkles, 
  Copy, 
  Download, 
  Smartphone, 
  AlertCircle,
  HelpCircle,
  CheckCircle,
  FolderPlus,
  ArrowUpDown,
  UtensilsCrossed,
  RefreshCw
} from "lucide-react";

interface MenuManagerViewProps {
  currentBusinessId: string;
  toast: (message: string, type?: "success" | "error" | "info" | "warning") => void;
  userRole: "super_admin" | "business_admin" | "cashier" | "waiter";
}

// 14 Allergen keys with user friendly display labels and emojis
const ALLERGENS_LIST = [
  { id: "gluten", label: "Gluten", icon: "🌾", desc: "Wheat, barley, rye" },
  { id: "crustaceans", label: "Crustaceans", icon: "🦐", desc: "Crab, prawns, lobsters" },
  { id: "eggs", label: "Eggs", icon: "🥚", desc: "Whole eggs or egg derivatives" },
  { id: "fish", label: "Fish", icon: "🐟", desc: "All fresh and saltwater finfish" },
  { id: "peanuts", label: "Peanuts", icon: "🥜", desc: "Ground peanuts and peanut oil" },
  { id: "soy", label: "Soy", icon: "🫘", desc: "Soybeans, tofu, soy sauce" },
  { id: "milk", label: "Milk", icon: "🥛", desc: "Dairy products, lactose, cheese" },
  { id: "nuts", label: "Nuts", icon: "🌰", desc: "Almonds, walnuts, cashew, hazelnuts" },
  { id: "celery", label: "Celery", icon: "🌿", desc: "Celery stalks, seeds, leaves" },
  { id: "mustard", label: "Mustard", icon: "🟡", desc: "Mustard seeds, powder, paste" },
  { id: "sesame", label: "Sesame", icon: "🥯", desc: "Sesame seeds and oils" },
  { id: "sulphites", label: "Sulphites", icon: "🍷", desc: "Preservatives in dried foods or wine" },
  { id: "lupin", label: "Lupin", icon: "🪻", desc: "Lupin flour, seeds, lupin breads" },
  { id: "molluscs", label: "Molluscs", icon: "🦪", desc: "Clams, oysters, mussels, snails" }
];

// Preset cover/logo food photos for simple, zero-hassle selections
const PRESET_FOOD_IMAGES = [
  "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&auto=format&fit=crop&q=60", // Pizza
  "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=60", // Burger
  "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=500&auto=format&fit=crop&q=60", // Dessert
  "https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=60", // Ribs
  "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=500&auto=format&fit=crop&q=60", // General Food
  "https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=500&auto=format&fit=crop&q=60"  // Salad / Breakfast
];

const PRESET_LOGOS = [
  "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=100&auto=format&fit=crop&q=60",
  "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=100&auto=format&fit=crop&q=60",
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=100&auto=format&fit=crop&q=60"
];

export default function MenuManagerView({ currentBusinessId, toast, userRole }: MenuManagerViewProps) {
  const isReadOnly = userRole === "cashier" || userRole === "waiter";

  // State definitions matching Firestore collections
  const [menuProfile, setMenuProfile] = useState<Menu>({
    businessId: currentBusinessId,
    restaurantName: "",
    description: "",
    logoUrl: "",
    category: "International",
    phone: "",
    location: "",
    active: true
  });

  const [sections, setSections] = useState<MenuSection[]>([]);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Active UI Controls
  const [rightPanelTab, setRightPanelTab] = useState<"preview" | "qr">("preview");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const publicMenuUrl = getMenuUrl(currentBusinessId);

  // Section and Product Form builders
  const [activeCollapsedSections, setActiveCollapsedSections] = useState<{ [key: string]: boolean }>({});
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionDesc, setNewSectionDesc] = useState("");

  // Product editor modals/form overlays
  const [productFormSectionId, setProductFormSectionId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<MenuProduct | null>(null);
  const [productName, setProductName] = useState("");
  const [productTranslation, setProductTranslation] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [productPrice, setProductPrice] = useState<number | "">("");
  const [productImage, setProductImage] = useState("");
  const [productAllergens, setProductAllergens] = useState<string[]>([]);
  const [productAvailable, setProductAvailable] = useState(true);

  // Mobile Mockup live preview states
  const [mockActiveSectionId, setMockActiveSectionId] = useState<string>("all");

  const logoFileRef = useRef<HTMLInputElement>(null);
  const prodImgFileRef = useRef<HTMLInputElement>(null);

  // Load and Subscribe to Menu Profile, Sections & Products
  useEffect(() => {
    if (!currentBusinessId) return;

    setLoading(true);

    // 1. Subscribe to Menu Profile
    const menuDocRef = doc(db, "menus", currentBusinessId);
    const unsubMenu = onSnapshot(menuDocRef, (snap) => {
      if (snap.exists()) {
        setMenuProfile(snap.data() as Menu);
      } else {
        // Doc doesn't exist, retrieve temporary name from client collection if available
        const qC = query(collection(db, "clients"), where("clientId", "==", currentBusinessId));
        getDocsFromClient(currentBusinessId);
      }
    });

    // Helper to retrieve fallback details from Clients collection
    const getDocsFromClient = async (bizId: string) => {
      try {
        const clientSnap = await getDoc(doc(db, "clients", bizId));
        if (clientSnap.exists()) {
          const data = clientSnap.data();
          setMenuProfile(prev => ({
            ...prev,
            restaurantName: data.businessName || prev.restaurantName,
            phone: data.phone || prev.phone,
            location: data.location || prev.location,
            category: data.category || prev.category,
            logoUrl: data.logoUrl || prev.logoUrl || ""
          }));
        }
      } catch (err) {
        console.warn("Client fallback fetch failed", err);
      }
    };

    // 2. Subscribe to Menu Sections
    const qSec = query(
      collection(db, "menuSections"),
      where("businessId", "==", currentBusinessId),
      orderBy("sortOrder", "asc")
    );
    const unsubSections = onSnapshot(qSec, (snapshot) => {
      const list: MenuSection[] = [];
      snapshot.forEach((snapDoc) => {
        list.push({ id: snapDoc.id, ...snapDoc.data() } as MenuSection);
      });
      setSections(list);
    }, (err) => {
      console.error("Error reading menu sections:", err);
    });

    // 3. Subscribe to Menu Products
    const qProd = query(
      collection(db, "menuProducts"),
      where("businessId", "==", currentBusinessId),
      orderBy("sortOrder", "asc")
    );
    const unsubProducts = onSnapshot(qProd, (snapshot) => {
      const list: MenuProduct[] = [];
      snapshot.forEach((snapDoc) => {
        list.push({ id: snapDoc.id, ...snapDoc.data() } as MenuProduct);
      });
      setProducts(list);
      setLoading(false);
    }, (err) => {
      console.error("Error reading menu products:", err);
      setLoading(false);
    });

    // 4. Generate QR code
    QRCode.toDataURL(publicMenuUrl, { width: 400, margin: 2, color: { dark: "#0c0e14", light: "#ffffff" } })
      .then((url) => setQrCodeDataUrl(url))
      .catch((err) => console.error("Error generating public QR:", err));

    return () => {
      unsubMenu();
      unsubSections();
      unsubProducts();
    };
  }, [currentBusinessId]);

  // Save/Update Menu Info
  const handleSaveMenuProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      toast("Access restricted: Waiters/Cashiers can only view menus.", "warning");
      return;
    }
    if (!menuProfile.restaurantName.trim()) {
      toast("Restaurant Name is required.", "warning");
      return;
    }

    try {
      await setDoc(doc(db, "menus", currentBusinessId), {
        ...menuProfile,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      toast("Restaurant Profile updated successfully!", "success");
    } catch (err) {
      console.error("Error saving menu profile:", err);
      toast("Failed to update profile. Insufficient permissions.", "error");
    }
  };

  // Drag-and-drop or manual Base64 converter for files with immediate canvas compression
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, target: "logo" | "product") => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Support up to 5MB file inputs now, because we automatically compress it on the canvas!
    if (file.size > 5 * 1024 * 1024) {
      toast("Image limit is 5MB. Please choose a smaller file.", "warning");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      if (target === "logo") {
        try {
          const compressed = await compressImage(base64, 200, 200, 0.7);
          setMenuProfile(prev => ({ ...prev, logoUrl: compressed }));
          toast("Logo attached and optimized successfully! Remember to click Save.", "success");
        } catch (err) {
          setMenuProfile(prev => ({ ...prev, logoUrl: base64 }));
          toast("Logo attached! Remember to click Save.", "info");
        }
      } else {
        try {
          toast("Compressing photo for instant mobile loading...", "info");
          const compressed = await compressImage(base64, 350, 350, 0.65);
          setProductImage(compressed);
          toast("Item photo uploaded and auto-compressed successfully!", "success");
        } catch (err) {
          setProductImage(base64);
          toast("Item photo uploaded successfully!", "info");
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // Section builders
  const handleAddSectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      toast("Access denied.", "error");
      return;
    }
    if (!newSectionName.trim()) {
      toast("Section Category Name is required.", "warning");
      return;
    }

    try {
      const secId = "SEC-" + Math.floor(100000 + Math.random() * 900000);
      const nextOrder = sections.length > 0 ? sections[sections.length - 1].sortOrder + 1 : 0;

      await setDoc(doc(db, "menuSections", secId), {
        sectionId: secId,
        businessId: currentBusinessId,
        sectionName: newSectionName.trim(),
        description: newSectionDesc.trim(),
        sortOrder: nextOrder,
        active: true
      });

      setNewSectionName("");
      setNewSectionDesc("");
      setIsAddingSection(false);
      toast(`Category "${newSectionName}" added successfully.`, "success");
    } catch (err) {
      console.error("Error adding category:", err);
      toast("Unauthorized operation or error adding section.", "error");
    }
  };

  const handleDeleteSection = async (sec: MenuSection) => {
    if (isReadOnly) return;
    const count = products.filter(p => p.sectionId === sec.sectionId).length;
    
    if (!window.confirm(`Delete "${sec.sectionName}" category? This will orphan ${count} product(s) in this category.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, "menuSections", sec.id || sec.sectionId));
      toast("Category removed successfully.", "success");
    } catch (err) {
      toast("Could not delete category. Insufficient permissions.", "error");
    }
  };

  const handleMoveSection = async (index: number, direction: "up" | "down") => {
    if (isReadOnly) return;
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === sections.length - 1) return;

    const swapWithIndex = direction === "up" ? index - 1 : index + 1;
    const currentList = [...sections];
    const sec1 = currentList[index];
    const sec2 = currentList[swapWithIndex];

    try {
      // Temporarily swap order values
      const order1 = sec1.sortOrder;
      const order2 = sec2.sortOrder;

      await updateDoc(doc(db, "menuSections", sec1.id || sec1.sectionId), { sortOrder: order2 });
      await updateDoc(doc(db, "menuSections", sec2.id || sec2.sectionId), { sortOrder: order1 });
    } catch (err) {
      toast("Sorting swap failed. Firebase rules restricted.", "error");
    }
  };

  // Toggle category collapse
  const toggleSectionCollapse = (secId: string) => {
    setActiveCollapsedSections(prev => ({
      ...prev,
      [secId]: !prev[secId]
    }));
  };

  // Product Builders
  const openAddProductModal = (secId: string) => {
    setProductFormSectionId(secId);
    setEditingProduct(null);
    setProductName("");
    setProductTranslation("");
    setProductDesc("");
    setProductPrice("");
    setProductImage("");
    setProductAllergens([]);
    setProductAvailable(true);
  };

  const openEditProductModal = (prod: MenuProduct) => {
    setProductFormSectionId(null);
    setEditingProduct(prod);
    setProductName(prod.productName);
    setProductTranslation(prod.translatedName || "");
    setProductDesc(prod.description || "");
    setProductPrice(prod.price);
    setProductImage(prod.imageUrl || "");
    setProductAllergens(prod.allergens || []);
    setProductAvailable(prod.available);
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!productName.trim()) {
      toast("Product name is required", "warning");
      return;
    }
    if (productPrice === "" || Number(productPrice) <= 0) {
      toast("Valid price is required.", "warning");
      return;
    }

    try {
      let finalImageUrl = productImage || null;

      // Upload one product photo to Firebase Storage if storage bucket exists and it's a data URL
      if (storage && productImage && productImage.startsWith("data:image/")) {
        try {
          toast("Storing product photo in secure cloud Storage bucket...", "info");
          const fileExtension = productImage.substring(productImage.indexOf('/') + 1, productImage.indexOf(';'));
          const pId = editingProduct ? (editingProduct.id || editingProduct.productId) : ("PROD-" + Math.floor(100000 + Math.random() * 900000));
          const filename = `${pId}.${fileExtension || 'jpg'}`;
          const storageRef = ref(storage, `menuProducts/${currentBusinessId}/${filename}`);
          const uploadResult = await uploadString(storageRef, productImage, "data_url");
          finalImageUrl = await getDownloadURL(uploadResult.ref);
          toast("Photo stored securely on the Cloud!", "success");
        } catch (storageErr) {
          console.warn("Firebase Storage failed, saving directly in Firestore instead.", storageErr);
        }
      }

      if (editingProduct) {
        // Update product
        await updateDoc(doc(db, "menuProducts", editingProduct.id || editingProduct.productId), {
          productName: productName.trim(),
          translatedName: productTranslation.trim() || null,
          description: productDesc.trim() || null,
          price: Number(productPrice),
          imageUrl: finalImageUrl,
          productImageUrl: finalImageUrl, // Include productImageUrl
          allergens: productAllergens,
          available: productAvailable
        });
        toast("Product details adjusted successfully.", "success");
      } else if (productFormSectionId) {
        // Add new product
        const pId = "PROD-" + Math.floor(100000 + Math.random() * 900000);
        const sectionProds = products.filter(p => p.sectionId === productFormSectionId);
        const nextOrder = sectionProds.length > 0 ? sectionProds[sectionProds.length - 1].sortOrder + 1 : 0;

        // Recheck if we uploaded under editingProduct's filename instead
        let finalCreateUrl = finalImageUrl;
        if (storage && productImage && productImage.startsWith("data:image/") && finalImageUrl === productImage) {
          try {
            toast("Storing product photo in secure cloud Storage bucket...", "info");
            const fileExtension = productImage.substring(productImage.indexOf('/') + 1, productImage.indexOf(';'));
            const filename = `${pId}.${fileExtension || 'jpg'}`;
            const storageRef = ref(storage, `menuProducts/${currentBusinessId}/${filename}`);
            const uploadResult = await uploadString(storageRef, productImage, "data_url");
            finalCreateUrl = await getDownloadURL(uploadResult.ref);
            toast("Photo stored securely on the Cloud!", "success");
          } catch (storageErr) {
            console.warn("Storage upload failed, fallback to direct Base64 string.", storageErr);
          }
        }

        await setDoc(doc(db, "menuProducts", pId), {
          productId: pId,
          businessId: currentBusinessId,
          sectionId: productFormSectionId,
          productName: productName.trim(),
          translatedName: productTranslation.trim() || null,
          description: productDesc.trim() || null,
          price: Number(productPrice),
          imageUrl: finalCreateUrl,
          productImageUrl: finalCreateUrl, // Include productImageUrl
          allergens: productAllergens,
          available: productAvailable,
          sortOrder: nextOrder,
          createdAt: new Date().toISOString()
        });
        toast(`"${productName}" added to category list.`, "success");
      }

      // Reset modal triggers
      setProductFormSectionId(null);
      setEditingProduct(null);
    } catch (err) {
      console.error("Product submit error:", err);
      toast("Error storing product data. Permission restricted.", "error");
    }
  };

  const handleDeleteProduct = async (prod: MenuProduct) => {
    if (isReadOnly) return;
    if (!window.confirm(`Delete product "${prod.productName}" permanently?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, "menuProducts", prod.id || prod.productId));
      toast("Product deleted successfully.", "success");
    } catch (err) {
      toast("Could not delete product. Denied.", "error");
    }
  };

  const handleMoveProduct = async (prod: MenuProduct, direction: "up" | "down") => {
    if (isReadOnly) return;
    const sameSectionProds = products.filter(p => p.sectionId === prod.sectionId);
    const index = sameSectionProds.findIndex(p => p.productId === prod.productId);

    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === sameSectionProds.length - 1) return;

    const swapWithIndex = direction === "up" ? index - 1 : index + 1;
    const prod1 = sameSectionProds[index];
    const prod2 = sameSectionProds[swapWithIndex];

    try {
      const order1 = prod1.sortOrder;
      const order2 = prod2.sortOrder;

      await updateDoc(doc(db, "menuProducts", prod1.id || prod1.productId), { sortOrder: order2 });
      await updateDoc(doc(db, "menuProducts", prod2.id || prod2.productId), { sortOrder: order1 });
    } catch (err) {
      toast("Sorting failed.", "error");
    }
  };

  const toggleAllergen = (key: string) => {
    setProductAllergens(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleCopyMenuLink = () => {
    navigator.clipboard.writeText(publicMenuUrl);
    toast("Public Customer Menu page URL copied to clipboard!", "success");
  };

  return (
    <div id="gerapay-menu-manager" className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-screen pb-10">
      
      {/* LEFT COLUMN: BUILDERS & CONTROLS (8 cols) */}
      <div className="lg:col-span-7 space-y-6">
        
        {/* SECTION 1: Restaurant Information card */}
        <div className="bg-[#11141C] border border-white/5 rounded-[24px] overflow-hidden p-6 relative">
          <div className="absolute top-0 right-0 p-4 font-mono text-[9px] text-[#FFC107] uppercase">
            {isReadOnly ? "READ-ONLY VIEW" : "Rest. Profile Node"}
          </div>

          <h2 className="text-sm font-black text-white tracking-widest uppercase flex items-center gap-2 mb-6">
            <UtensilsCrossed size={16} className="text-[#FFC107]" />
            1. Restaurant Information
          </h2>

          <form onSubmit={handleSaveMenuProfile} className="space-y-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Logo upload block */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                  Restaurant Branding Logo
                </label>
                
                <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-white/[0.01] border border-white/5 rounded-2xl">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center relative overflow-hidden shrink-0 border border-white/10">
                    {menuProfile.logoUrl ? (
                      <img src={menuProfile.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <ImageIcon size={22} className="text-slate-500" />
                    )}
                  </div>
                  
                  <div className="space-y-1.5 text-center sm:text-left flex-grow">
                    <span className="text-[11px] text-slate-300 block font-semibold">
                      Drag and drop small png or select cover preset below
                    </span>
                    <span className="text-[9px] text-[#FFC107] font-mono block">
                      Max file size: 250KB for base64 compilation
                    </span>
                    
                    {!isReadOnly && (
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => logoFileRef.current?.click()}
                          className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-white rounded-lg text-[10px] font-bold font-mono border border-white/10 cursor-pointer"
                        >
                          Attach Photo
                        </button>
                        <input
                          ref={logoFileRef}
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileChange(e, "logo")}
                          className="hidden"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Cover Preset Selection grids */}
                {!isReadOnly && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-[#FFC107] block">Branding presets quick-select:</span>
                    <div className="grid grid-cols-6 gap-2">
                      {PRESET_LOGOS.map((logo, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setMenuProfile(p => ({ ...p, logoUrl: logo }))}
                          className="w-full aspect-square rounded-xl bg-white/5 border border-white/10 overflow-hidden hover:scale-105 active:scale-95 transition-all cursor-pointer relative"
                        >
                          <img src={logo} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                          {menuProfile.logoUrl === logo && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] text-emerald-400 font-bold font-mono">✓</div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Text inputs */}
              <div className="space-y-1.5col">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block font-bold">Restaurant Name *</label>
                <input
                  type="text"
                  required
                  disabled={isReadOnly}
                  value={menuProfile.restaurantName}
                  onChange={(e) => setMenuProfile(p => ({ ...p, restaurantName: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/[0.02] border border-white/5 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-sans"
                  placeholder="E.g., Kigali Spice Palace"
                />
              </div>

              <div className="space-y-1.5col">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block font-bold">Category Cuisine / Food Type</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={menuProfile.category}
                  onChange={(e) => setMenuProfile(p => ({ ...p, category: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/[0.02] border border-white/5 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-sans"
                  placeholder="E.g., Asian Fusion, Italian Cafe"
                />
              </div>

              <div className="space-y-1.5col">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block font-bold">Contact Phone Number</label>
                <input
                  type="tel"
                  disabled={isReadOnly}
                  value={menuProfile.phone || ""}
                  onChange={(e) => setMenuProfile(p => ({ ...p, phone: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/[0.02] border border-white/5 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-sans"
                  placeholder="E.g., +250 788 123 456"
                />
              </div>

              <div className="space-y-1.5col">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block font-bold">Location Address</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={menuProfile.location || ""}
                  onChange={(e) => setMenuProfile(p => ({ ...p, location: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/[0.02] border border-white/5 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-sans"
                  placeholder="E.g., KN 2 Rd, Nyarugenge, Kigali"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block font-bold">Slogan or Short Description</label>
                <textarea
                  rows={2}
                  disabled={isReadOnly}
                  value={menuProfile.description || ""}
                  onChange={(e) => setMenuProfile(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/[0.02] border border-white/5 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-sans resize-none"
                  placeholder="Write a warm greeting or description..."
                />
              </div>

            </div>

            {!isReadOnly && (
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#1B32FF] hover:brightness-110 active:scale-[0.98] transition-all text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer font-sans"
                >
                  <Save size={13} /> Save Restaurant Info
                </button>
              </div>
            )}

          </form>
        </div>


        {/* SECTION 2 & 3: MENU CATEGORIES & PRODUCTS CONSOLE */}
        <div className="bg-[#11141C] border border-white/5 rounded-[24px] p-6 space-y-6 relative">
          <div className="absolute top-6 right-6 flex items-center gap-2">
            {!isReadOnly && (
              <button
                onClick={() => setIsAddingSection(true)}
                className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 text-[10px] font-bold font-mono rounded-lg transition-all flex items-center gap-1 cursor-pointer"
              >
                <Plus size={12} /> Make Category
              </button>
            )}
          </div>

          <h2 className="text-sm font-black text-white tracking-widest uppercase flex items-center gap-2">
            <FolderPlus size={16} className="text-[#FFC107]" />
            2. Menu Section & Product Builder
          </h2>

          {/* Inline Add Category Section Block */}
          {isAddingSection && (
            <form onSubmit={handleAddSectionSubmit} className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-4 font-mono">
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="text-[11px] font-bold text-[#FFC107] uppercase">Add New Menu Category Section</span>
                <button type="button" onClick={() => setIsAddingSection(false)} className="text-slate-500 hover:text-white">✕</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-400 uppercase">Category Title *</span>
                  <input
                    type="text"
                    required
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    placeholder="E.g., Breakfast, Pizza, Grill"
                    className="w-full px-3 py-2 bg-black border border-white/10 rounded-xl text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[9px] text-slate-400 uppercase">Description (Optional)</span>
                  <input
                    type="text"
                    value={newSectionDesc}
                    onChange={(e) => setNewSectionDesc(e.target.value)}
                    placeholder="E.g., Served between 7 AM to 11 AM"
                    className="w-full px-3 py-2 bg-black border border-white/10 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingSection(false)}
                  className="px-3 py-1.5 bg-white/5 text-slate-400 hover:text-white rounded-lg text-[10px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-[10px] flex items-center gap-1.5"
                >
                  <Check size={12} /> Create Section
                </button>
              </div>
            </form>
          )}

          {/* Listed Categories Node */}
          {loading ? (
            <div className="flex py-10 items-center justify-center font-mono text-xs text-slate-500 gap-2">
              <RefreshCw size={14} className="animate-spin text-indigo-400" /> LOADING PRODUCTS DATABASE...
            </div>
          ) : sections.length === 0 ? (
            <div className="text-center py-10 px-4 border border-dashed border-white/5 rounded-2xl">
              <span className="text-xs text-slate-500 block leading-relaxed max-w-sm mx-auto font-sans">
                You haven't declared any menu category sections yet. Create categories like "Appetizers" or "Beverages" to start structuring dishes/drinks.
              </span>
            </div>
          ) : (
            <div className="space-y-4">
              {sections.map((sec, secIdx) => {
                const sectProducts = products.filter(p => p.sectionId === sec.sectionId);
                const isCollapsed = !!activeCollapsedSections[sec.sectionId];

                return (
                  <div key={sec.sectionId} className="border border-white/5 rounded-2xl overflow-hidden bg-white/[0.01]">
                    
                    {/* Section Header bar */}
                    <div className="p-3 bg-white/[0.02] border-b border-white/5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleSectionCollapse(sec.sectionId)}
                          className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                        >
                          <ChevronDown size={14} className={`transform transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                        </button>
                        
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-white text-xs">{sec.sectionName}</span>
                            <span className="text-[9px] font-mono px-2 py-0.2 bg-white/5 rounded-full text-indigo-400 font-bold border border-white/5">
                              {sectProducts.length} Items
                            </span>
                          </div>
                          {sec.description && (
                            <span className="text-[10px] text-slate-500 block truncate max-w-xs sm:max-w-md">{sec.description}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {!isReadOnly && (
                          <>
                            <button
                              title="Move Category Up"
                              onClick={() => handleMoveSection(secIdx, "up")}
                              disabled={secIdx === 0}
                              className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 disabled:opacity-20 cursor-pointer"
                            >
                              <ChevronUp size={12} />
                            </button>
                            <button
                              title="Move Category Down"
                              onClick={() => handleMoveSection(secIdx, "down")}
                              disabled={secIdx === sections.length - 1}
                              className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 disabled:opacity-20 cursor-pointer"
                            >
                              <ChevronDown size={12} />
                            </button>
                            <button
                              title="Add Product to this section"
                              onClick={() => openAddProductModal(sec.sectionId)}
                              className="p-1 h-5 w-14 bg-[#1B32FF]/20 text-white rounded text-[9px] font-bold font-mono tracking-wider text-center uppercase hover:brightness-110"
                            >
                              + Add
                            </button>
                            <button
                              title="Delete Category"
                              onClick={() => handleDeleteSection(sec)}
                              className="p-1 text-red-400 hover:bg-red-500/10 rounded cursor-pointer"
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Section Body items */}
                    {!isCollapsed && (
                      <div className="p-3 space-y-2">
                        {sectProducts.length === 0 ? (
                          <div className="text-center py-6 text-[11px] text-slate-500 font-sans italic">
                            No food or beverage items in this category yet. Click "+ Add" to construct dishes.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {sectProducts.map((prod, prodIdx) => (
                              <div key={prod.productId} className="flex items-center justify-between p-2.5 bg-white/[0.02] border border-white/5 rounded-xl gap-3">
                                
                                <div className="flex items-center gap-3 overflow-hidden">
                                  <div className="w-11 h-11 rounded-lg bg-white/5 relative overflow-hidden border border-white/5 shrink-0">
                                    {prod.imageUrl ? (
                                      <img src={prod.imageUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                    ) : (
                                      <ImageIcon size={16} className="text-slate-600 absolute inset-0 m-auto" />
                                    )}
                                    {!prod.available && (
                                      <div className="absolute inset-0 bg-red-950/80 flex items-center justify-center text-[7px] text-red-400 uppercase font-black tracking-widest font-mono text-center leading-none">
                                        Sold Out
                                      </div>
                                    )}
                                  </div>

                                  <div className="overflow-hidden space-y-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold text-white text-[11px] truncate block">{prod.productName}</span>
                                      {prod.translatedName && (
                                        <span className="text-[9px] text-[#FFC107] italic truncate block font-sans">({prod.translatedName})</span>
                                      )}
                                    </div>
                                    
                                    <div className="flex items-center gap-1.5 font-mono text-[10px]">
                                      <span className="text-white font-extrabold">{prod.price.toLocaleString()} RWF</span>
                                      {prod.allergens && prod.allergens.length > 0 && (
                                        <div className="flex items-center gap-0.5 text-[8px]" title="Contains allergens">
                                          {prod.allergens.map(al => {
                                            const match = ALLERGENS_LIST.find(a => a.id === al);
                                            return <span key={al} className="p-0.5 bg-red-500/10 text-red-400 rounded" title={match?.label}>{match?.icon}</span>;
                                          })}
                                        </div>
                                      )}
                                    </div>
                                    {prod.description && (
                                      <span className="text-[9px] text-slate-500 block truncate font-sans">{prod.description}</span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {!isReadOnly && (
                                    <>
                                      <button
                                        title="Move Product Up"
                                        onClick={() => handleMoveProduct(prod, "up")}
                                        disabled={prodIdx === 0}
                                        className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 disabled:opacity-20 flex"
                                      >
                                        <ChevronUp size={11} />
                                      </button>
                                      <button
                                        title="Move Product Down"
                                        onClick={() => handleMoveProduct(prod, "down")}
                                        disabled={prodIdx === sectProducts.length - 1}
                                        className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 disabled:opacity-20 flex"
                                      >
                                        <ChevronDown size={11} />
                                      </button>
                                      <button
                                        title="Configure Product"
                                        onClick={() => openEditProductModal(prod)}
                                        className="p-1 text-slate-300 hover:text-white hover:bg-white/5 rounded flex"
                                      >
                                        <Edit size={11} />
                                      </button>
                                      <button
                                        title="Delete Dish"
                                        onClick={() => handleDeleteProduct(prod)}
                                        className="p-1 text-red-400 hover:bg-red-500/10 rounded flex"
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    </>
                                  )}
                                </div>

                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>


      {/* RIGHT COLUMN: PREVIEW + QR CODE SWITCH PANEL (5 cols) */}
      <div className="lg:col-span-5 space-y-6">
        
        {/* Switch Control Tabs */}
        <div className="bg-[#11141C] border border-white/5 rounded-[22px] p-2 flex gap-1 font-mono">
          <button
            onClick={() => setRightPanelTab("preview")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
              rightPanelTab === "preview"
                ? "bg-[#1B32FF] text-white shadow-lg"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Smartphone size={13} /> Live Customer View
          </button>
          
          <button
            onClick={() => setRightPanelTab("qr")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
              rightPanelTab === "qr"
                ? "bg-[#1B32FF] text-white shadow-lg"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <QrCode size={13} /> Menu QR Code Generator
          </button>
        </div>


        {/* TAB 1 CONTENT: Live Customer Mockup View */}
        {rightPanelTab === "preview" ? (
          <div className="flex justify-center">
            
            {/* Elegant Smartphone Mock-up Wrapper */}
            <div className="w-[305px] h-[610px] rounded-[42px] border-[5px] border-[#2E313D] bg-[#0C0E14] shadow-2xl relative flex flex-col overflow-hidden relative font-sans">
              
              {/* Smartphone Notch design */}
              <div className="absolute top-0 inset-x-0 w-24 h-4 bg-[#2E313D] rounded-b-2xl mx-auto z-40 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-[#11141C] absolute right-4" />
                <div className="w-6 h-1 rounded-full bg-[#0C0E14]" />
              </div>

              {/* Mockup Header Navigation */}
              <div className="pt-6 pb-2 px-4 border-b border-white/5 bg-[#11141C] shrink-0 text-center flex flex-col items-center">
                
                {/* Logo or placeholder display */}
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 overflow-hidden mt-1 text-center shrink-0">
                  {menuProfile.logoUrl ? (
                    <img src={menuProfile.logoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-black text-[#FFC107] font-mono">GP</div>
                  )}
                </div>

                <h3 className="font-bold text-white text-[12px] truncate w-full mt-1.5">{menuProfile.restaurantName || "My Restaurant"}</h3>
                <span className="text-[8px] px-2 py-0.2 bg-indigo-500/10 text-indigo-400 font-bold rounded-full font-mono mt-1">
                  {menuProfile.category || "International Cuisine"}
                </span>

                {menuProfile.description && (
                  <span className="text-[9px] text-slate-400 mt-1 block truncate w-full leading-snug">{menuProfile.description}</span>
                )}
              </div>

              {/* Category selector on device mock */}
              <div className="bg-black/40 border-b border-white/5 py-1.5 px-3 flex gap-1.5 overflow-x-auto shrink-0 scrollbar-none font-mono text-[8px]">
                <button
                  onClick={() => setMockActiveSectionId("all")}
                  className={`px-2.5 py-1.5 rounded-lg font-bold shrink-0 ${
                    mockActiveSectionId === "all" ? "bg-[#FFC107] text-slate-950 font-black" : "bg-white/5 text-slate-400"
                  }`}
                >
                  ALL ITEMS
                </button>
                {sections.map(s => (
                  <button
                    key={s.sectionId}
                    onClick={() => setMockActiveSectionId(s.sectionId)}
                    className={`px-2.5 py-1.5 rounded-lg font-bold shrink-0 uppercase ${
                      mockActiveSectionId === s.sectionId ? "bg-[#FFC107] text-slate-950 font-black" : "bg-white/5 text-slate-400"
                    }`}
                  >
                    {s.sectionName}
                  </button>
                ))}
              </div>

              {/* Items feed list on mobile */}
              <div className="flex-grow p-3 space-y-3.5 overflow-y-auto style-scrollbar select-none py-4 bg-[#0A0C10]">
                
                {sections
                  .filter(sec => mockActiveSectionId === "all" || sec.sectionId === mockActiveSectionId)
                  .map(sec => {
                    const sectProducts = products.filter(p => p.sectionId === sec.sectionId);
                    if (sectProducts.length === 0) return null;

                    return (
                      <div key={sec.sectionId} className="space-y-2">
                        <span className="text-[9px] font-mono font-black text-indigo-400 uppercase tracking-widest block">{sec.sectionName}</span>
                        
                        <div className="space-y-1.5">
                          {sectProducts.map(p => (
                            <div key={p.productId} className={`p-2 bg-[#11141C] border border-white/5 rounded-xl flex gap-2.5 items-start ${!p.available ? "opacity-50" : ""}`}>
                              <div className="w-12 h-12 rounded-lg bg-white/5 relative overflow-hidden shrink-0 border border-white/10">
                                {p.imageUrl ? (
                                  <img src={p.imageUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full bg-slate-900 flex items-center justify-center text-[10px] text-slate-700">🍛</div>
                                )}
                              </div>

                              <div className="flex-grow overflow-hidden space-y-0.5">
                                <div className="flex justify-between items-start gap-1">
                                  <span className="text-[10px] font-bold text-white truncate block">{p.productName}</span>
                                  <span className="text-[9px] font-black text-[#FFC107] font-mono shrink-0">{p.price.toLocaleString()} RWF</span>
                                </div>
                                {p.translatedName && (
                                  <span className="text-[8px] text-[#FFC107] block italic leading-none font-sans mt-0.5">({p.translatedName})</span>
                                )}
                                {p.description && (
                                  <span className="text-[8px] text-slate-400 block font-sans line-clamp-2 leading-relaxed">{p.description}</span>
                                )}
                                
                                {p.allergens && p.allergens.length > 0 && (
                                  <div className="flex flex-wrap gap-0.5 pt-1 text-[7px] font-mono text-slate-400">
                                    {p.allergens.map(al => {
                                      const allergyMatch = ALLERGENS_LIST.find(a => a.id === al);
                                      return (
                                        <span key={al} className="px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded-full flex items-center gap-0.5 border border-red-500/10">
                                          <span>{allergyMatch?.icon}</span> {allergyMatch?.label}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                })}

                {products.length === 0 && (
                  <div className="flex h-48 items-center justify-center font-mono text-[9px] text-slate-500 text-center">
                    NO DRAFT MENU PRODUCTS<br/>DECLARED IN PANEL
                  </div>
                )}
              </div>

              {/* Smartphone footer lock screen */}
              <div className="h-8 border-t border-white/5 bg-[#11141C] shrink-0 flex items-center justify-center relative z-40">
                <div className="w-20 h-1 bg-white/40 rounded-full" />
              </div>

            </div>

          </div>
        ) : (
          
          /* TAB 2 CONTENT: Public QR Code generator views */
          <div className="bg-[#11141C] border border-white/5 rounded-[24px] p-6 text-center space-y-5">
            
            <div className="text-[10px] font-black text-indigo-400 bg-[#1B32FF]/10 border border-[#1B32FF]/20 rounded-full px-3 py-1.5 inline-block uppercase tracking-wider mx-auto">
              ★ Menu QR Code ★
            </div>

            <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
              <span className="text-[10px] font-mono font-bold text-[#FFC107] uppercase tracking-wider block mb-1">Public Menu URL Route</span>
              <div className="flex items-center gap-2 p-1.5 bg-black rounded-lg border border-white/5">
                <span className="text-[10px] text-indigo-400 font-mono truncate flex-grow text-left pl-1 select-all">{publicMenuUrl}</span>
                
                <button
                  onClick={handleCopyMenuLink}
                  className="p-1 text-slate-400 hover:text-white hover:bg-white/5 rounded-md cursor-pointer"
                  title="Copy Route Path"
                >
                  <Copy size={12} />
                </button>
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl mx-auto w-48 h-48 flex items-center justify-center relative border border-white/10 group">
              {qrCodeDataUrl ? (
                <img src={qrCodeDataUrl} className="w-full h-full object-contain" alt="Customer Menu QR Code" />
              ) : (
                <div className="text-slate-500 font-mono text-[10px]">CREATING QR GRAPHIC NODE...</div>
              )}
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FFC107]/10 text-[#FFC107] text-[10px] font-bold tracking-wide uppercase mx-auto">
              <Sparkles size={11} className="animate-pulse" />
              <span>Dynamic Menu QR — updates automatically online.</span>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-black text-white uppercase tracking-tight">Generate Public Menu QR</h3>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
                Customers scan this high-resolution QR graphic directly at tables. <strong>No login account whatsoever is requested.</strong> It serves as a secure, real-time read-only digital restaurant interface.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                onClick={handleCopyMenuLink}
                className="py-2.5 bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] border border-white/10 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer font-sans"
              >
                <Copy size={11} /> Copy Shareable URL
              </button>

              <a
                href={qrCodeDataUrl}
                download={`GeraPay-${menuProfile.restaurantName || "Restaurant"}-MenuQR.png`}
                className="py-2.5 bg-[#1B32FF] hover:brightness-110 text-white font-bold text-[10px] rounded-xl flex items-center justify-center gap-1.5 cursor-pointer font-sans"
              >
                <Download size={11} /> Download Image
              </a>
            </div>

            <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl text-left text-[10px] text-slate-400 leading-normal flex gap-2">
              <AlertCircle size={14} className="text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white block uppercase text-[9px] mb-0.5">Table Integration Note</span>
                You can print this QR code and affix it directly to tables. Updates to menus, products, pricing, and ingredients synchronize instantly!
              </div>
            </div>

          </div>
        )}

      </div>


      {/* FORM OVERLAYS: PRODUCTS ADD & MODIFY MODAL SHEET */}
      {(productFormSectionId !== null || editingProduct !== null) && (
        <div id="product-editor-modal" className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleProductSubmit}
            className="w-full max-w-md bg-[#11141C] border border-white/10 rounded-[30px] p-6 space-y-4 shadow-2xl relative"
          >
            <div className="flex justify-between items-center pb-2.5 border-b border-white/5">
              <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 font-sans">
                <Sparkles size={14} className="text-[#FFC107]" />
                {editingProduct ? `Edit ${editingProduct.productName}` : "Create Restaurant Menu Product"}
              </h3>
              
              <button
                type="button"
                onClick={() => {
                  setProductFormSectionId(null);
                  setEditingProduct(null);
                }}
                className="text-slate-500 hover:text-white font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              
              {/* Image Input field for Product item */}
              <div className="space-y-2">
                <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 font-bold block">Product Image Upload / Presets</span>
                
                <div className="flex items-center gap-3.5 p-3 bg-white/[0.01] border border-white/5 rounded-xl">
                  <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center relative overflow-hidden border border-white/10">
                    {productImage ? (
                      <img src={productImage} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <ImageIcon size={20} className="text-slate-500" />
                    )}
                  </div>
                  
                  <div className="text-[10px] space-y-1">
                    <span className="text-slate-300 block font-semibold">Select cover presets or upload custom photos</span>
                    <div className="flex gap-1.5 items-center">
                      <button
                        type="button"
                        onClick={() => prodImgFileRef.current?.click()}
                        className="px-2.5 py-1 bg-[#1B32FF]/20 hover:bg-[#1B32FF]/45 text-white rounded border border-indigo-500/30 text-[9px] font-mono cursor-pointer transition-colors"
                      >
                        {productImage ? "Replace Image" : "Browse Image"}
                      </button>
                      
                      {productImage && (
                        <button
                          type="button"
                          onClick={() => {
                            setProductImage("");
                            toast("Product image removed.", "info");
                          }}
                          className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded border border-red-500/20 text-[9px] font-mono cursor-pointer transition-colors"
                        >
                          Remove Image
                        </button>
                      )}
                    </div>
                    <input
                      ref={prodImgFileRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange(e, "product")}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Preset quick picker */}
                <div className="space-y-1">
                  <span className="text-[8px] font-mono uppercase tracking-widest text-[#FFC107] block">Gastro presets quick-select:</span>
                  <div className="grid grid-cols-6 gap-1.5">
                    {PRESET_FOOD_IMAGES.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setProductImage(img);
                          toast(`Preset dish photo chosen successfully!`, "info");
                        }}
                        className="w-full aspect-square rounded-lg bg-slate-900 border border-white/5 overflow-hidden hover:scale-105 active:scale-95 transition-all cursor-pointer relative"
                      >
                        <img src={img} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                        {productImage === img && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[8px] text-emerald-400">✓</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Name Details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[9px] font-mono uppercase text-slate-400 font-bold block">Product Name *</span>
                  <input
                    type="text"
                    required
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="E.g., Margherita Pizza"
                    className="w-full px-3 py-2 bg-black border border-white/10 rounded-xl text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[9px] font-mono uppercase text-slate-400 block">French / Kinyarwanda Translation</span>
                  <input
                    type="text"
                    value={productTranslation}
                    onChange={(e) => setProductTranslation(e.target.value)}
                    placeholder="E.g., Pizza au Fromage"
                    className="w-full px-3 py-2 bg-black border border-white/10 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              {/* Pricing & Description */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[9px] font-mono uppercase text-slate-400 font-bold block">Price in RWF *</span>
                  <input
                    type="number"
                    required
                    value={productPrice}
                    onChange={(e) => setProductPrice(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="E.g., 6500"
                    className="w-full px-3 py-2 bg-black border border-white/10 rounded-xl text-xs font-mono text-white"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[9px] font-mono uppercase text-slate-400 block font-bold">Status Availability</span>
                  <div className="flex items-center gap-2 h-7.5">
                    <button
                      type="button"
                      onClick={() => setProductAvailable(!productAvailable)}
                      className={`w-full py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase transition-all select-none border cursor-pointer ${
                        productAvailable
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/10"
                          : "bg-red-500/10 text-red-500 border-red-500/10"
                      }`}
                    >
                      {productAvailable ? "Available" : "Unavailable (Sold Out)"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] font-mono uppercase text-slate-400 block">Short Ingredients Description</span>
                <textarea
                  rows={2}
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                  placeholder="E.g., Fresh mozzarella, heirloom tomato, wild basil, extra virgin olive oil."
                  className="w-full px-3 py-2 bg-black border border-white/10 rounded-xl text-xs text-white font-sans resize-none"
                />
              </div>

              {/* ALLERGEN CHECKBOXES MULTI-SELECT SELECTOR */}
              <div className="space-y-1.5 border-t border-white/5 pt-3">
                <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 font-bold block select-none">
                  Select Allergen Warn tags:
                </span>
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {ALLERGENS_LIST.map(al => {
                    const isChecked = productAllergens.includes(al.id);
                    return (
                      <button
                        key={al.id}
                        type="button"
                        onClick={() => toggleAllergen(al.id)}
                        className={`py-1 px-1.5 rounded-lg border text-[9px] flex items-center justify-start gap-1 font-sans cursor-pointer transition-all ${
                          isChecked
                            ? "bg-red-500/10 text-red-400 border-red-500/20 shadow"
                            : "bg-white/[0.01] text-slate-400 border-white/5 hover:bg-white/5"
                        }`}
                        title={al.desc}
                      >
                        <span className="text-xs">{al.icon}</span>
                        <span className="truncate">{al.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>

            <div className="flex justify-end gap-2.5 pt-3.5 border-t border-white/5 font-mono">
              <button
                type="button"
                onClick={() => {
                  setProductFormSectionId(null);
                  setEditingProduct(null);
                }}
                className="px-4 py-2 bg-white/5 text-slate-400 hover:text-white rounded-xl text-[10px] font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#1B32FF] hover:brightness-110 text-white font-bold rounded-xl text-[10px] flex items-center gap-1.5"
              >
                <Check size={12} /> Save Product
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
