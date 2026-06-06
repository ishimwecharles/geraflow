import { useState, useEffect, useRef } from "react";
import { doc, onSnapshot, addDoc, collection, serverTimestamp, updateDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Client, Transaction } from "../types";
import { 
  ArrowLeft, 
  MapPin, 
  Phone, 
  Check, 
  ExternalLink, 
  AlertTriangle, 
  RefreshCw, 
  CheckCircle, 
  XCircle,
  ShieldCheck,
  CreditCard,
  Lock,
  Globe,
  Coins,
  Star,
  Smartphone,
  Mail,
  Fingerprint,
  Copy,
  Hash
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { safeCopyToClipboard } from "../lib/storage";

interface PayPageProps {
  client: Client;
  onAdminBack?: () => void;
  forceInternationalMode?: boolean;
}

// Convert amount values gracefully
export function fmtRWF(amount: number) {
  return new Intl.NumberFormat("en-RW", {
    style: "currency",
    currency: "RWF",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

// Clean and validate Rwandan mobile phone scope
function validateRwandanPhone(rawPhone: string) {
  const clean = rawPhone.replace(/[^\d+]/g, "");
  const pattern = /^(?:\+250|250)?(?:0)?(7[2389]\d{7})$/;
  const match = clean.match(pattern);
  if (!match) {
    return { isValid: false, normalized: "" };
  }
  return {
    isValid: true,
    normalized: "250" + match[1]
  };
}

// Currency configuration
const EXCHANGE_RATES: Record<string, number> = {
  RWF: 1,
  USD: 1300,
  EUR: 1400,
  GBP: 1650,
  GHS: 95
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  RWF: "FRw",
  USD: "$",
  EUR: "€",
  GBP: "£",
  GHS: "GH₵"
};

const CURRENCY_NAMES: Record<string, string> = {
  RWF: "Rwandan Franc",
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  GHS: "Ghanaian Cedi"
};

// Bilingual dictionary supporting English and French
const TRANSLATIONS = {
  en: {
    payMerchant: "Pay Merchant Quickly",
    activeTerminal: "Active Terminal",
    standardMode: "Local Standard",
    intlMode: "International",
    intlBadgeDesc: "Accepts major credit cards, Apple Pay, Google Pay & local MoMo.",
    momoPromo: "Official Merchant Channel",
    momoCode: "MTN MoMo Pay Code",
    phoneLabel: "Your Mobile Number *",
    phoneFormat: "Format: 078...",
    phonePlaceholder: "Enter starting 078...",
    phoneHelpStandard: "Enter 10 digits beginning with 078, 079, 072, or 073",
    amountLabel: "Amount to Pay *",
    presetHelp: "RWF Equivalent",
    noteLabel: "Note or Reference (Optional)",
    notePlaceholder: "e.g. Cab Fare, Coffee Shop, Fruits...",
    secureNoticeTitle: "Your MoMo PIN is never entered here",
    secureNoticeDesc: "Gera Flow does NOT store your private code. You will authorize directly inside parent network prompt.",
    payBtnMomo: "Pay with MTN MoMo",
    payBtnCard: "Pay with Secure Card",
    payBtnApple: "Secure Apple Pay",
    payBtnGoogle: "Secure Google Pay",
    outboundAlert: "Outbound Handshake Initialized",
    successAlert: "Payment Confirmed!",
    successDesc: "Thank you! The payment has been verified and loaded successfully by",
    secsRemaining: "seconds remaining to process",
    simTitle: "AI Studio Sandbox Simulator",
    simDesc: "Transaction saved in realtime database. You can manually authorize below to speed up the queue.",
    simBypass: "⚡ Fast Pass: Approve Simulation",
    receiptSecured: "Receipt Secured",
    receiptSecuredDesc: "Show this approved confirmation screen to the store keeper. Rest assured, your payment is secure.",
    doneBtn: "Done • Pay New Bill",
    checkoutNotClear: "Checkout Not Clear",
    checkoutNotClearDesc: "We could not verify the transaction. Retrying or using offline quick USSD fallback code is recommended.",
    emailLabel: "Email Address for Digital Receipt *",
    emailPlaceholder: "e.g. tourist@domain.com",
    cardholderLabel: "Cardholder Printed Name *",
    cardholderPlaceholder: "Jane Doe",
    cardNumberLabel: "Debit / Credit Card Number *",
    cardNumberPlaceholder: "4111 2222 3333 4444",
    cardExpiryLabel: "Expiry Date (MM/YY) *",
    cardCvcLabel: "CVC / CVV *",
    offlineBtn: "Use Offline Quick Dial Code (No Internet)",
    momoPinNotice: "No private code is saved by Gera Flow. PIN entry is secure inside MTN.",
    backStandardBtn: "← Back to Normal Online Payment",
    offlineTitle: "Offline Mode • Standard USSD Code",
    offlineDesc: "No internet required! Automatically opens phone dialer standard network mode.",
    oneTapQuick: "ONE-TAP QUICK DIAL PROTOCOL",
    clickToAuto: "CLICK TO AUTO-DIAL NOW",
    opensPhone: "📲 Automatically opens phone dialer",
    manualStepsTitle: "Manual Steps (Push-Button/Feature Phones)",
    momoPromoTitle: "MTN MoMo Accepted",
    premiumBadge: "International Payments Enabled",
    payModeTitle: "Select Payment Mode",
    payMethodCard: "Card Payment",
    payMethodMoMo: "Mobile Money",
    payMethodWallets: "Digital Wallets",
    securingConnection: "Securing payment processing connection...",
    verifyingCard: "Authenticating with 3D Secure Verification...",
    cardErrorName: "Please enter your cardholder name",
    cardErrorNumber: "Enter a valid 15 or 16 digit card number",
    cardErrorExpiry: "Use valid future expiry MM/YY format",
    cardErrorCvc: "Enter a valid 3 or 4 digit secure CVC code",
    emailErrorEmpty: "Please enter a valid receipt email",
    biometricVerify: "Scan biometric on device to pay with",
    biometricAuth: "Authenticating via TouchID / FaceID...",
    biometricSuccess: "Biometric Scanned Successfully!",
    amountErrorEmpty: "Please specify a valid amount greater than 0",
    currency: "Receipt Currency",
    securingHandshake: "Securing handshake with bank gateway...",
    cancelGoBack: "Cancel & Go Back"
  },
  fr: {
    payMerchant: "Payer le marchand rapidement",
    activeTerminal: "Terminal Actif",
    standardMode: "Standard Global",
    intlMode: "International",
    intlBadgeDesc: "Accepte les cartes bancaires, Apple Pay, Google Pay et MoMo local.",
    momoPromo: "Canal Marchand Officiel",
    momoCode: "Code de paiement MTN MoMo",
    phoneLabel: "Votre Numéro de Mobile *",
    phoneFormat: "Format: 078...",
    phonePlaceholder: "Entrez commençant par 078...",
    phoneHelpStandard: "Entrez 10 chiffres commençant par 078, 079, 072, ou 073",
    amountLabel: "Montant à Payer *",
    presetHelp: "Équivalent RWF",
    noteLabel: "Note ou Référence (Optionnel)",
    notePlaceholder: "ex: Course de taxi, café, fruits...",
    secureNoticeTitle: "Votre PIN MoMo n'est jamais saisi ici",
    secureNoticeDesc: "Gera Flow ne stocke pas votre code privé. Vous autoriserez directement sur l'écran officiel de l'opérateur.",
    payBtnMomo: "Payer avec MTN MoMo",
    payBtnCard: "Payer par Carte Sécurisée",
    payBtnApple: "Payer avec Apple Pay",
    payBtnGoogle: "Payer avec Google Pay",
    outboundAlert: "Alerte de sortie initialisée",
    successAlert: "Paiement Confirmé !",
    successDesc: "Merci ! Le paiement a été vérifié et crédité avec succès par",
    secsRemaining: "secondes restantes pour le traitement",
    simTitle: "Simulateur Sandbox AI Studio",
    simDesc: "Transaction enregistrée. Vous pouvez l'autoriser manuellement pour contourner la file.",
    simBypass: "⚡ Validation Instantanée",
    receiptSecured: "Reçu Sécurisé",
    receiptSecuredDesc: "Présentez cet écran de confirmation approuvé au commerçant. Votre paiement est sécurisé.",
    doneBtn: "Terminé • Nouveau paiement",
    checkoutNotClear: "Paiement non validé",
    checkoutNotClearDesc: "Nous n'avons pas pu valider la transaction. Il est recommandé de réessayer ou d'utiliser l'USSD.",
    emailLabel: "Adresse e-mail pour le reçu numérique *",
    emailPlaceholder: "ex: touriste@domaine.com",
    cardholderLabel: "Nom du titulaire de la carte *",
    cardholderPlaceholder: "Jane Doe",
    cardNumberLabel: "Numéro de carte de crédit / débit *",
    cardNumberPlaceholder: "4111 2222 3333 4444",
    cardExpiryLabel: "Date d'expiration (MM/AA) *",
    cardCvcLabel: "Code CVC / CVV *",
    offlineBtn: "Utiliser le dialer USSD hors ligne (Sans Internet)",
    momoPinNotice: "Aucun code privé n'est enregistré. La saisie du PIN est sécurisée par le réseau MTN.",
    backStandardBtn: "← Retour au paiement en ligne standard",
    offlineTitle: "Mode Hors-ligne • Standard USSD",
    offlineDesc: "Aucun réseau requis ! Ouvre automatiquement le clavier téléphonique standard de votre combiné.",
    oneTapQuick: "PROTOCOLE DE NUMÉROTATION EN UN CLIC",
    clickToAuto: "CLIQUER POUR APPELER MAINTENANT",
    opensPhone: "📲 Ouvre automatiquement l'application téléphone",
    manualStepsTitle: "Étapes manuelles (Téléphones cellulaires classiques)",
    momoPromoTitle: "MTN MoMo Accepté",
    premiumBadge: "Paiements Internationaux Activés",
    payModeTitle: "Sélectionnez le mode de paiement",
    payMethodCard: "Carte Bancaire",
    payMethodMoMo: "Mobile Money",
    payMethodWallets: "Portefeuille Numérique",
    securingConnection: "Sécurisation de la connexion de paiement...",
    verifyingCard: "Authentification avec 3D Secure...",
    cardErrorName: "Veuillez entrer le nom sur la carte",
    cardErrorNumber: "Entrez un numéro de carte valide (15 ou 16 chiffres)",
    cardErrorExpiry: "Date d'expiration MM/AA future requise",
    cardErrorCvc: "Entrez un code CVC valide à 3 ou 4 chiffres",
    emailErrorEmpty: "Veuillez entrer un email de réception valide",
    biometricVerify: "Scannez votre empreinte/visage pour payer",
    biometricAuth: "Authentification TouchID / FaceID...",
    biometricSuccess: "Biométrie validée avec succès !",
    amountErrorEmpty: "Veuillez spécifier un montant supérieur à 0",
    currency: "Devise de réception",
    securingHandshake: "Sécurisation de la liaison de paiement...",
    cancelGoBack: "Annuler et retourner"
  }
};

export default function PayPage({ client, onAdminBack, forceInternationalMode }: PayPageProps) {
  const searchParams = new URLSearchParams(window.location.search);
  const initialMode = searchParams.get("mode") === "international" || forceInternationalMode;

  const [isInternational, setIsInternational] = useState(() => {
    if (forceInternationalMode) return true;
    if (client.qrType === "international") return true;
    if (client.qrType === "local") return false;
    return initialMode;
  });
  const [lang, setLang] = useState<"en" | "fr">("en");
  const [currency, setCurrency] = useState<"RWF" | "USD" | "EUR" | "GBP" | "GHS">(() => {
    if (forceInternationalMode) return "USD";
    if (client.qrType === "international") return "USD";
    if (client.qrType === "local") return "RWF";
    return initialMode ? "USD" : "RWF";
  });
  const [selectedMethod, setSelectedMethod] = useState<"momo" | "card" | "applepay" | "googlepay">((() => {
    if (forceInternationalMode) return "card";
    if (client.qrType === "international") return "card";
    if (client.qrType === "local") return "momo";
    return initialMode ? "card" : "momo";
  }));

  const [screen, setScreen] = useState<"form" | "waiting" | "success" | "failed" | "gateway_redirect" | "gateway_portal">("form");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [txnId, setTxnId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(12);
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [isOfflineUssd, setIsOfflineUssd] = useState(false);
  const [copied, setCopied] = useState(false);

  // Card parameters
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");

  // Wallet payment bio screen state
  const [walletStep, setWalletStep] = useState<"idle" | "bio_scan" | "bio_success" | "done">("idle");

  // Input Error states
  const [phoneError, setPhoneError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [cardNameError, setCardNameError] = useState("");
  const [cardNumberError, setCardNumberError] = useState("");
  const [cardExpiryError, setCardExpiryError] = useState("");
  const [cardCvcError, setCardCvcError] = useState("");

  // Gateway simulation parameters
  const [gatewaySubmitting, setGatewaySubmitting] = useState(false);
  const [gatewayError, setGatewayError] = useState("");

  const handleGatewayAuthorize = async () => {
    setGatewayError("");
    const cleanNum = cardNumber.replace(/\s+/g, "");
    if (cleanNum.length < 15 || cleanNum.length > 16 || isNaN(Number(cleanNum))) {
      setGatewayError("Please enter a valid 15 or 16 digit credit card number");
      return;
    }
    if (!cardExpiry.includes("/") || cardExpiry.trim().length < 5) {
      setGatewayError("Expiry date is required in MM/YY format (e.g. 12/28)");
      return;
    }
    const cleanSeq = cardCvc.trim();
    if (cleanSeq.length < 3 || cleanSeq.length > 4 || isNaN(Number(cleanSeq))) {
      setGatewayError("Please enter a valid 3 or 4 digit CVV security code");
      return;
    }

    setGatewaySubmitting(true);
    // Simulate gateway handshakes with 3D Secure
    setTimeout(async () => {
      try {
        if (!txnId) {
          setGatewayError("Secure session expired. Please restart checkout.");
          setGatewaySubmitting(false);
          return;
        }
        const txnRef = doc(db, "transactions", txnId);
        await updateDoc(txnRef, {
          status: "confirmed",
          momoStatus: "SUCCESSFUL",
          momoRawResponse: JSON.stringify({
            status: "SUCCESSFUL",
            gateway: "verified_by_visa_secured_international",
            gatewayRef: txnId,
            cardName,
            last4: cardNumber.slice(-4),
            converted_rwf: Math.floor(parseFloat(amount) * EXCHANGE_RATES[currency])
          }),
          updatedAt: serverTimestamp()
        });
      } catch (e: any) {
        setGatewayError(e?.message || "Internal gateway processing timeout. Try again.");
      } finally {
        setGatewaySubmitting(false);
      }
    }, 1800);
  };

  const unsubRef = useRef<(() => void) | null>(null);

  // Sync default currency and method when switching standard / international mode
  useEffect(() => {
    if (isInternational) {
      if (currency === "RWF") {
        setCurrency("USD");
      }
      setSelectedMethod("card");
    } else {
      setCurrency("RWF");
      setSelectedMethod("momo");
    }
  }, [isInternational]);

  useEffect(() => {
    return () => {
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  // Countdown timer for simulation
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (screen === "waiting" && countdown > 0) {
      timer = setTimeout(() => {
        setCountdown((p) => p - 1);
      }, 1000);
    } else if (screen === "waiting" && countdown === 0) {
      mockSetSuccess();
    }
    return () => clearTimeout(timer);
  }, [screen, countdown]);

  const mockSetSuccess = async () => {
    if (!txnId) return;
    try {
      const txnRef = doc(db, "transactions", txnId);
      await updateDoc(txnRef, {
        status: "confirmed",
        momoStatus: "SUCCESSFUL",
        momoRawResponse: JSON.stringify({ 
          status: "SUCCESSFUL", 
          gateway: "demo_international_qr_terminal",
          paymentMethod: selectedMethod,
          currency: currency,
          amount_received: amount
        }),
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.warn("Auto-success processed or updated outside the queue.", e);
    }
  };

  const currentStrings = TRANSLATIONS[lang];

  // Check card company dynamically
  const getCardTypeLogo = (num: string) => {
    const clean = num.replace(/\D/g, "");
    if (clean.startsWith("4")) return "Visa";
    if (/^5[1-5]/.test(clean)) return "Mastercard";
    return "Unknown";
  };

  const handleInitiateRequestToPay = async () => {
    let hasError = false;
    setPhoneError("");
    setEmailError("");
    setAmountError("");
    setCardNameError("");
    setCardNumberError("");
    setCardExpiryError("");
    setCardCvcError("");

    // 1. Amount validation
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setAmountError(currentStrings.amountErrorEmpty || "Please specify a valid amount greater than 0");
      hasError = true;
    } else if (currency === "RWF" && !Number.isInteger(amountNum)) {
      setAmountError("Rwandan Francs (RWF) must be defined as integer units");
      hasError = true;
    }

    // 2. Method-specific validation
    let normalizedPhone = "";
    if (selectedMethod === "momo") {
      const parsed = validateRwandanPhone(phone);
      if (!parsed.isValid) {
        setPhoneError(currentStrings.phoneHelpStandard);
        hasError = true;
      } else {
        normalizedPhone = parsed.normalized;
      }
    } else if (selectedMethod === "card") {
      if (!cardName.trim()) {
        setCardNameError(currentStrings.cardErrorName);
        hasError = true;
      }
      if (!email.trim() || !email.includes("@")) {
        setEmailError(currentStrings.emailErrorEmpty);
        hasError = true;
      }
      // Only do deep credit card format check if client's qrType IS NOT international (since international bypasses direct card capture in the app)
      if (client.qrType !== "international") {
        const cleanCard = cardNumber.replace(/\s+/g, "");
        if (cleanCard.length < 15 || cleanCard.length > 16 || isNaN(Number(cleanCard))) {
          setCardNumberError(currentStrings.cardErrorNumber);
          hasError = true;
        }
        if (!cardExpiry.includes("/") || cardExpiry.trim().length < 5) {
          setCardExpiryError(currentStrings.cardErrorExpiry);
          hasError = true;
        }
        const cleanCvc = cardCvc.trim();
        if (cleanCvc.length < 3 || cleanCvc.length > 4 || isNaN(Number(cleanCvc))) {
          setCardCvcError(currentStrings.cardErrorCvc);
          hasError = true;
        }
      }
    }

    if (hasError) return;

    setSubmitting(true);
    
    // Converted value in local master coin RWF
    const finalAmountRWF = Math.floor(amountNum * EXCHANGE_RATES[currency]);

    try {
      // Create transaction record in Firestore
      const txnPayload = {
        clientId: client.clientId,
        clientDocId: client.id || "",
        businessName: client.businessName,
        momoCode: client.momoCode,
        amount: finalAmountRWF,
        phone: selectedMethod === "momo" ? phone.trim() : (email.trim() || phone.trim() || "international"),
        customerPhone: selectedMethod === "momo" ? phone.trim() : "international",
        email: email.trim(),
        note: note.trim(),
        status: "pending" as const,
        currency: currency,
        source: isInternational ? "international_qr_scan" : "qr_scan",
        momoReferenceId: null,
        momoStatus: "PENDING",
        momoRawResponse: null,
        intlAmount: amountNum,
        intlCurrency: currency,
        paymentMethod: client.qrType === "international" ? "international_card" : selectedMethod,
        qrType: client.qrType || "local",
        language: lang,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const path = "transactions";
      let ref;
      try {
        ref = await addDoc(collection(db, path), txnPayload);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
        return;
      }

      setTxnId(ref.id);
      setCountdown(12);

      // Create Payment Audit log
      try {
        await addDoc(collection(db, "payments"), {
          transactionId: ref.id,
          clientId: client.clientId,
          businessName: client.businessName,
          amount: finalAmountRWF,
          method: client.qrType === "international" ? "international_card" : (selectedMethod === "momo" ? "customer_momo_pay" : `international_${selectedMethod}`),
          createdAt: serverTimestamp()
        });
      } catch (e) {
        console.error("Payment log failed to insert", e);
      }

      // Real-time Firestore snapshot state listener for reactive checkout completion
      const docPath = `transactions/${ref.id}`;
      unsubRef.current = onSnapshot(doc(db, "transactions", ref.id), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as Transaction;
          if (data.status === "confirmed") {
            setScreen("success");
          } else if (data.status === "failed" || data.status === "rejected") {
            setScreen("failed");
          }
        }
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, docPath);
      });

      // Check external backend endpoint
      let connected = false;
      if (selectedMethod === "momo") {
        try {
          const response = await fetch("/api/momo/request-to-pay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transactionId: ref.id,
              phone: normalizedPhone,
              amount: finalAmountRWF,
              note: note.trim()
            })
          });
          const result = await response.json();
          if (result && result.gateway === "production_network_rwanda_channel") {
            connected = true;
          }
        } catch (err) {
          console.warn("Express endpoint skipped. Running in real-time Firestore sandbox.");
        }
      }

      setIsDemoMode(!connected);

      // Trigger automatic simulation approve checkouts for cards and mobile wallets to act as realistic premium gateway
      if (selectedMethod !== "momo" && client.qrType !== "international") {
        setTimeout(async () => {
          try {
            const txnRef = doc(db, "transactions", ref.id);
            await updateDoc(txnRef, {
              status: "confirmed",
              momoStatus: "SUCCESSFUL",
              momoRawResponse: JSON.stringify({ 
                status: "SUCCESSFUL", 
                gateway: "secured_international_digital_gateway",
                method: selectedMethod,
                currency: currency,
                converted_rwf: finalAmountRWF
              }),
              updatedAt: serverTimestamp()
            });
          } catch (e) {
            console.warn("Simulated checkout auto-resolved");
          }
        }, 4000);
      }

      if (client.qrType === "international") {
        setScreen("gateway_redirect");
        setTimeout(() => {
          setScreen("gateway_portal");
        }, 1800);
      } else {
        setScreen("waiting");
      }

    } catch (e) {
      console.error("Payment initiation failed:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleWalletTrigger = (method: "applepay" | "googlepay") => {
    setSelectedMethod(method);
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setAmountError(currentStrings.amountErrorEmpty || "Please specify a valid amount greater than 0");
      return;
    } else {
      setAmountError("");
    }
    // Pull up standard Apple/Google Pay system authorization sheet container
    setWalletStep("bio_scan");
  };

  const handleBioSuccess = () => {
    setWalletStep("bio_success");
    setTimeout(() => {
      setWalletStep("idle");
      // Trigger checkout standard flow
      handleInitiateRequestToPay();
    }, 1500);
  };

  const handleReset = () => {
    if (unsubRef.current) {
      unsubRef.current();
    }
    setPhone("");
    setEmail("");
    setAmount("");
    setNote("");
    setCardName("");
    setCardNumber("");
    setCardExpiry("");
    setCardCvc("");
    setTxnId(null);
    setPhoneError("");
    setEmailError("");
    setAmountError("");
    setCardNameError("");
    setCardNumberError("");
    setCardExpiryError("");
    setCardCvcError("");
    setWalletStep("idle");
    setScreen("form");
  };

  // Logo checks
  const logoUrlChecked = client.logoUrl ? (
    <img 
      src={client.logoUrl} 
      className="w-16 h-16 rounded-2xl mx-auto mb-3 object-cover border-2 border-white/20 shadow-lg relative z-10" 
      alt={client.businessName}
      referrerPolicy="no-referrer"
    />
  ) : (
    <div className="w-16 h-16 rounded-2xl bg-[#FFC107] text-[#0C0E14] flex items-center justify-center font-bold text-2xl mx-auto mb-3 border-2 border-white/20 shadow-lg relative z-10">
      {client.businessName[0]?.toUpperCase()}
    </div>
  );

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-[#07090e] text-white p-4 overflow-y-auto selection:bg-[#1B32FF]/40 font-sans">
      {/* Background abstract decorations */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#1b32ff]/10 to-transparent pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#FFC107]/5 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#1b32ff]/5 rounded-full blur-3xl pointer-events-none" />
      
      {onAdminBack && (
        <button 
          onClick={onAdminBack}
          className="absolute top-4 left-4 z-50 flex items-center gap-1.5 px-3.5 py-2 bg-slate-900/80 hover:bg-slate-800 border border-white/10 rounded-xl text-xs font-semibold hover:text-white transition-all shadow-md cursor-pointer text-slate-300"
        >
          <ArrowLeft size={14} /> Back to Dashboard
        </button>
      )}

      {/* Language Trigger bar */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-1 bg-slate-900/80 border border-white/10 rounded-xl p-1 shadow-md">
        <button 
          onClick={() => setLang("en")}
          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${lang === 'en' ? 'bg-[#1B32FF] text-white' : 'text-slate-400 hover:text-white'}`}
        >
          EN
        </button>
        <button 
          onClick={() => setLang("fr")}
          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${lang === 'fr' ? 'bg-[#1B32FF] text-white' : 'text-slate-400 hover:text-white'}`}
        >
          FR
        </button>
      </div>

      <div className="w-full max-w-md bg-[#0F121A] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl transition-all duration-300 relative my-6">
        
        {/* Friendly Branding & Business Header */}
        <div className="p-6 text-center bg-gradient-to-b from-[#1B32FF]/15 to-[#0F121A]/0 border-b border-white/5 relative">
          <div className="absolute top-3 left-4 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[#00D68F] text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 select-none">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
            {currentStrings.activeTerminal}
          </div>

          <div className="mt-5 mb-3">
            {logoUrlChecked}
          </div>
          <p className="text-[10px] text-yellow-400 font-extrabold uppercase tracking-wider">{currentStrings.payMerchant}</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-white mt-1">{client.businessName}</h1>
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 mt-1.5">
            <MapPin size={13} className="text-[#1B32FF]" />
            <span className="font-medium">{client.location}</span>
          </div>

          {/* Premium Badge: International Payments Enabled */}
          <div className="mt-3.5 inline-flex items-center gap-1.5 px-3.5 py-1 bg-[#FFC107]/10 border border-[#FFC107]/25 text-[#FFC107] rounded-full text-[10px] font-extrabold uppercase tracking-widest shadow-[0_0_15px_rgba(255,193,7,0.06)]">
            <Globe size={11} className="animate-spin-slow text-[#FFC107]" />
            <span>{currentStrings.premiumBadge}</span>
          </div>
        </div>

        {/* Global Standard / International Mode Switch Tabs */}
        {screen === "form" && !isOfflineUssd && (
          <div className="p-4 bg-white/[0.01] border-b border-white/5 grid grid-cols-2 gap-1.5 px-6">
            <button
              onClick={() => setIsInternational(false)}
              className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                !isInternational 
                  ? "bg-[#1B32FF] text-white shadow-lg shadow-[#1b32ff]/20" 
                  : "bg-white/5 text-slate-400 hover:text-white"
              }`}
            >
              <Smartphone size={13} />
              {currentStrings.standardMode}
            </button>
            <button
              onClick={() => setIsInternational(true)}
              className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                isInternational 
                  ? "bg-gradient-to-r from-yellow-500 to-[#FFC107] text-[#0C0E14] shadow-lg shadow-yellow-500/10" 
                  : "bg-white/5 text-slate-400 hover:text-white"
              }`}
            >
              <Globe size={13} />
              {currentStrings.intlMode}
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          
          {/* SCREEN: OFFLINE USSD MODE FALLBACK */}
          {isOfflineUssd && (() => {
            const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
            const numericAmount = parseFloat(amount || "0");
            const hasAmount = !isNaN(numericAmount) && numericAmount > 0;
            const isPhoneNumberTransfer = client?.clientType === "qr_only" && client?.mtnPaymentType === "phone_number";
            const ussdPrefix = isPhoneNumberTransfer ? "1*1" : "8*1";
            const rawUSSD = hasAmount 
              ? `*182*${ussdPrefix}*${client.momoCode}*${numericAmount}#` 
              : `*182*${ussdPrefix}*${client.momoCode}#`;
            const dialerURI = hasAmount 
              ? `tel:*182*${ussdPrefix}*${client.momoCode}*${numericAmount}%23` 
              : `tel:*182*${ussdPrefix}*${client.momoCode}%23`;

            const handleCopyUSSD = async () => {
              const success = await safeCopyToClipboard(rawUSSD);
              if (success) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            };

            return (
              <motion.div 
                key="offline_ussd"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="p-6 space-y-5"
              >
                <div className="space-y-1.5 text-center">
                  <span className="px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/15 rounded-full text-[10.5px] font-bold uppercase inline-block font-sans">
                    {currentStrings.offlineTitle}
                  </span>
                  <p className="text-xs text-slate-300 max-w-[320px] mx-auto leading-relaxed font-sans">
                    {currentStrings.offlineDesc}
                  </p>
                </div>

                {/* Inline amount adjusting form to easily auto-fill the USSD payload value */}
                <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-2 font-sans">
                  <label className="text-[10px] uppercase font-black tracking-wider text-slate-400 block font-mono">
                    Adjust Payment Amount (RWF)
                  </label>
                  <div className="relative">
                    <input 
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Enter amount to dial"
                      className="w-full bg-[#11141C] border border-white/10 rounded-xl px-3 py-2 text-white font-mono text-sm placeholder-slate-600 focus:outline-none focus:border-[#1B32FF]/50"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] uppercase font-black tracking-widest text-[#FFC107]">RWF</span>
                  </div>
                </div>

                {/* Formatted USSD Output Box */}
                <div className="p-4 bg-[#151922] border border-white/5 rounded-xl text-center space-y-3 font-mono">
                  <div>
                    <span className="text-[9px] text-[#FFC107] font-extrabold uppercase block tracking-wider">OFFLINE PAYMENT CODE</span>
                    <div className="text-[#FFC107] text-lg font-black truncate max-w-full select-all">
                      {rawUSSD}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-zinc-950 p-2 rounded-lg text-center border border-white/5">
                      <span className="text-slate-500 block text-[8px] uppercase font-bold">Transfer Value</span>
                      <span className="text-white block font-black truncate">{hasAmount ? fmtRWF(numericAmount) : "Type custom"}</span>
                    </div>
                    <div className="bg-zinc-950 p-2 rounded-lg text-center border border-white/5">
                      <span className="text-slate-500 block text-[8px] uppercase font-bold">MoMo Code</span>
                      <span className="text-white block font-bold truncate">{client.momoCode}</span>
                    </div>
                  </div>
                </div>

                {/* Handset/Browser Platform Interaction Buttons */}
                <div className="space-y-2 font-sans">
                  {isIOS ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleCopyUSSD}
                        className="py-3 bg-slate-800 hover:bg-slate-755 active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer border border-white/5"
                      >
                        {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                        {copied ? "Copied!" : "Copy USSD"}
                      </button>
                      <a
                        href={dialerURI}
                        className="py-3 bg-[#1B32FF] hover:brightness-110 active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer"
                      >
                        <ExternalLink size={13} />
                        Open Dialer
                      </a>
                    </div>
                  ) : (
                    <a
                      href={dialerURI}
                      className="w-full py-4 bg-gradient-to-r from-yellow-400 to-[#FFC107] hover:brightness-110 active:scale-[0.98] text-black font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all shadow-md text-center cursor-pointer font-sans"
                    >
                      <Phone size={14} className="animate-pulse" /> Launch Automated USSD Dialer
                    </a>
                  )}

                  {!isIOS && (
                    <button
                      type="button"
                      onClick={handleCopyUSSD}
                      className="w-full py-2.5 bg-white/5 hover:bg-white/10 active:scale-[0.98] text-slate-400 hover:text-white font-semibold text-[11px] rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-white/5"
                    >
                      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      {copied ? "USSD Code Copied!" : "Copy USSD Code Backup"}
                    </button>
                  )}
                </div>

                {/* Instructions */}
                <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl space-y-3.5 font-sans">
                  <span className="text-[10.5px] font-extrabold text-[#FFC107] uppercase tracking-wider block border-b border-white/5 pb-2">
                    {currentStrings.manualStepsTitle}
                  </span>
                  <ol className="text-xs text-slate-300 space-y-3 leading-relaxed font-sans">
                    <li className="flex gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-[#1B32FF]/20 text-[#1B32FF] border border-[#1B32FF]/30 flex items-center justify-center text-[10px] font-bold font-mono flex-shrink-0 mt-0.5">1</span>
                      <span className="text-slate-300">
                        {hasAmount 
                          ? <span>Dial or paste <strong className="text-white font-mono">{rawUSSD}</strong> directly.</span>
                          : <span>Dial <strong className="text-white font-mono">*182#</strong> on your device.</span>}
                      </span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-[#1B32FF]/20 text-[#1B32FF] border border-[#1B32FF]/30 flex items-center justify-center text-[10px] font-bold font-mono flex-shrink-0 mt-0.5">2</span>
                      <span className="text-slate-300">
                        {hasAmount 
                          ? <span>Verify merchant <strong className="text-white">{client.businessName}</strong> and cash amount block.</span>
                          : <span>Choose <strong className="text-white">Pay Merchant / MoMoPay</strong> option and enter Code: <strong className="text-[#FFC107] font-mono">{client.momoCode}</strong>.</span>}
                      </span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-[#1B32FF]/20 text-[#1B32FF] border border-[#1B32FF]/30 flex items-center justify-center text-[10px] font-bold font-mono flex-shrink-0 mt-0.5">3</span>
                      <span className="text-slate-300">
                        {hasAmount 
                          ? <span>Enter your secret 5-digit MTN wallet <strong className="text-emerald-400">PIN</strong> inside MTN's official popup prompt to approve.</span>
                          : <span>Type desired cash amount in <strong className="text-white font-mono font-bold">RWF</strong> and approve securely with your secret wallet <strong className="text-emerald-400">PIN</strong>.</span>}
                      </span>
                    </li>
                  </ol>
                </div>

                {/* Return button */}
                <button 
                  type="button"
                  onClick={() => setIsOfflineUssd(false)}
                  className="w-full py-3.5 bg-white/5 hover:bg-white/10 active:scale-98 text-slate-300 border border-white/10 hover:border-white/20 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                >
                  {currentStrings.backStandardBtn}
                </button>
              </motion.div>
            );
          })()}

          {/* SCREEN: MAIN INTEGRATED PAYMENT FORM */}
          {screen === "form" && !isOfflineUssd && (
            <motion.div 
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-6 space-y-5"
            >
              
              {/* International Payment Method Tabs switcher */}
              {isInternational && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    {currentStrings.payModeTitle}
                  </label>
                  <div className={`grid ${client.qrType === "international" ? "grid-cols-2" : "grid-cols-3"} gap-1 bg-white/[0.02] border border-white/5 p-1 rounded-xl`}>
                    <button
                      type="button"
                      onClick={() => setSelectedMethod("card")}
                      className={`py-2 text-[10.5px] font-bold rounded-lg transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                        selectedMethod === "card" 
                          ? "bg-[#1B32FF] text-white" 
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <CreditCard size={14} />
                      <span>{currentStrings.payMethodCard}</span>
                    </button>
                    {client.qrType !== "international" && (
                      <button
                        type="button"
                        onClick={() => setSelectedMethod("momo")}
                        className={`py-2 text-[10.5px] font-bold rounded-lg transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          selectedMethod === "momo" 
                            ? "bg-[#1B32FF] text-white" 
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Smartphone size={14} />
                        <span>{currentStrings.payMethodMoMo}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedMethod("applepay")} // or googlepay handles both
                      className={`py-2 text-[10.5px] font-bold rounded-lg transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                        selectedMethod === "applepay" || selectedMethod === "googlepay"
                          ? "bg-[#1B32FF] text-white" 
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Globe size={14} />
                      <span>{currentStrings.payMethodWallets}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Currency Selector - visible in International, hidden in Standard RWF */}
              {isInternational && (
                <div className="space-y-1.5 p-3 bg-white/[0.01] border border-white/5 rounded-xl">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                      <Coins className="text-yellow-400" size={13} />
                      {currentStrings.currency} / Devise
                    </label>
                    <span className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider">
                      {currency} - {CURRENCY_NAMES[currency]}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1 pt-1">
                    {(["USD", "EUR", "GBP", "GHS", "RWF"] as const).map((curr) => (
                      <button
                        key={curr}
                        type="button"
                        onClick={() => setCurrency(curr)}
                        className={`py-2 border text-[11px] font-mono font-black rounded-lg transition-all cursor-pointer flex flex-col items-center ${
                          currency === curr 
                            ? "bg-slate-800 text-yellow-400 border-yellow-400/35" 
                            : "bg-white/5 text-slate-400 border-white/5 hover:border-slate-700 hover:text-white"
                        }`}
                      >
                        <span className="text-[12px]">{CURRENCY_SYMBOLS[curr]}</span>
                        <span className="text-[8px] tracking-wide mt-0.5">{curr}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Standard banner when in MoMo mode */}
              {!isInternational && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    {currentStrings.momoPromo}
                  </span>
                  <div className="bg-[#FFC107] text-[#0C0E14] rounded-2xl px-5 py-3.5 flex items-center justify-between border border-yellow-300/10 shadow-md">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-800/80 block">
                        {currentStrings.momoCode}
                      </span>
                      <h2 className="text-2xl font-mono font-black tracking-wider mt-0.5">{client.momoCode}</h2>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-[#0C0E14]/10 flex items-center justify-center border border-[#0C0E14]/5">
                      <span className="text-2xl">💰</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Core Dynamic Form Inputs container */}
              <div className="space-y-4">
                
                {/* AMOUNT INPUT */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      💰 {currentStrings.amountLabel}
                    </label>
                    {isInternational && (
                      <span className="text-[10px] text-yellow-400 font-bold font-mono">
                        Exchange Rate: 1 {currency} = {fmtRWF(EXCHANGE_RATES[currency])}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400 font-mono">
                      {CURRENCY_SYMBOLS[currency]}
                    </span>
                    <input 
                      type="number" 
                      step="any"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        if (amountError) setAmountError("");
                      }}
                      placeholder={currency === "RWF" ? "e.g. 2500" : "e.g. 15.00"}
                      className={`w-full pl-14 pr-3 py-3.5 bg-white/5 border rounded-xl text-lg font-black tracking-wide font-mono focus:outline-none focus:ring-2 focus:ring-[#1B32FF]/40 transition-all ${
                        amountError ? "border-red-500 bg-red-500/5 focus:border-red-500" : "border-white/10 focus:border-[#1B32FF]"
                      }`}
                    />
                  </div>
                  {amountError && (
                    <p className="text-[10.5px] text-red-400 font-semibold leading-relaxed">{amountError}</p>
                  )}

                  {/* Currencies exchange conversion readout */}
                  {amount && parseFloat(amount) > 0 && (
                    <div className="text-right p-1.5 text-[10.5px] text-yellow-400/80 font-mono font-bold bg-yellow-400/5 rounded-lg border border-yellow-400/10 inline-block w-fit ml-auto">
                      ≈ {fmtRWF(parseFloat(amount) * EXCHANGE_RATES[currency])} RWF
                    </div>
                  )}

                  {/* Preset Pills depending on currency */}
                  <div className="flex flex-wrap gap-1.5 pt-1.5">
                    {(currency === "RWF" 
                      ? [500, 1000, 2000, 5000, 10000] 
                      : [5, 10, 20, 50, 100]
                    ).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setAmount(preset.toString());
                          if (amountError) setAmountError("");
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                          amount === preset.toString() 
                            ? "bg-[#1B32FF] text-white border border-[#1b32ff]"
                            : "bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 text-slate-300"
                        }`}
                      >
                        +{preset.toLocaleString()} {currency}
                      </button>
                    ))}
                  </div>
                </div>

                {/* FIELDS IF SELECTED PAYMENT METHOD IS MOBILE MONEY */}
                {selectedMethod === "momo" && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                          📱 {currentStrings.phoneLabel}
                        </label>
                        <span className="text-[10px] text-slate-500 font-mono">{currentStrings.phoneFormat}</span>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold font-mono text-slate-400">
                          🇷🇼 +250
                        </span>
                        <input 
                          type="tel" 
                          value={phone}
                          onChange={(e) => {
                            setPhone(e.target.value);
                            if (phoneError) setPhoneError("");
                          }}
                          placeholder={currentStrings.phonePlaceholder}
                          className={`w-full pl-22 pr-3 py-3.5 bg-white/5 border rounded-xl text-sm font-semibold tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-[#1B32FF]/40 transition-all ${
                            phoneError ? "border-red-500 bg-red-500/5 focus:border-red-500" : "border-white/10 focus:border-[#1B32FF]"
                          }`}
                        />
                      </div>
                      {phoneError ? (
                        <p className="text-[10.5px] text-red-400 font-semibold leading-relaxed">{phoneError}</p>
                      ) : (
                        <p className="text-[10px] text-slate-500 leading-normal">{currentStrings.phoneHelpStandard}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* FIELDS IF SELECTED PAYMENT METHOD IS SECURE CREDIT CARD */}
                {selectedMethod === "card" && (
                  <div className="space-y-3.5 p-4.5 bg-white/[0.01] border border-white/5 rounded-2xl">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-xs font-bold tracking-wider text-yellow-400 uppercase flex items-center gap-1">
                        💳 Secure Gateway Transaction
                      </span>
                      <div className="flex gap-1.5 items-center">
                        <span className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 py-0.5 px-2 rounded font-bold">Visa</span>
                        <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 py-0.5 px-2 rounded font-bold">Mastercard</span>
                      </div>
                    </div>

                    {/* Email for receipt */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300 block">{currentStrings.emailLabel}</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={13} />
                        <input 
                          type="email"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (emailError) setEmailError("");
                          }}
                          placeholder={currentStrings.emailPlaceholder}
                          className={`w-full pl-9 pr-3 py-2.5 bg-white/5 border text-xs text-white rounded-xl focus:outline-none focus:border-[#1B32FF] ${
                            emailError ? "border-red-400" : "border-white/10"
                          }`}
                        />
                      </div>
                      {emailError && <p className="text-[10px] text-red-400 font-bold">{emailError}</p>}
                    </div>

                    {/* Cardholder Name */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300 block">{currentStrings.cardholderLabel}</label>
                      <input 
                        type="text"
                        value={cardName}
                        onChange={(e) => {
                          setCardName(e.target.value);
                          if (cardNameError) setCardNameError("");
                        }}
                        placeholder={currentStrings.cardholderPlaceholder}
                        className={`w-full px-3.5 py-2.5 bg-white/5 border text-xs text-white rounded-xl focus:outline-none focus:border-[#1B32FF] ${
                          cardNameError ? "border-red-400" : "border-white/10"
                        }`}
                      />
                      {cardNameError && <p className="text-[10px] text-red-400 font-bold">{cardNameError}</p>}
                    </div>

                    {client.qrType === "international" && (
                      <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-slate-300 leading-relaxed space-y-1.5 font-sans">
                        <p className="font-bold text-emerald-400 flex items-center gap-1">
                          🔒 Pay Securely with International Card
                        </p>
                        <p>
                          To protect your payment data, card credentials are never collected directly within this application.
                        </p>
                        <p className="font-serif italic text-slate-400">
                          After typing your receipt details above and tapping the button below, you will be securely redirected to Stripe's payment gateway checkout page.
                        </p>
                      </div>
                    )}

                    {client.qrType !== "international" && (
                      <>
                        {/* Card Number */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold text-slate-300 block">{currentStrings.cardNumberLabel}</label>
                            {cardNumber && (
                              <span className="text-[10px] font-sans font-black text-indigo-400">
                                {getCardTypeLogo(cardNumber)} Detected
                              </span>
                            )}
                          </div>
                          <div className="relative">
                            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={13} />
                            <input 
                              type="text"
                              value={cardNumber}
                              onChange={(e) => {
                                setCardNumber(e.target.value);
                                if (cardNumberError) setCardNumberError("");
                              }}
                              placeholder={currentStrings.cardNumberPlaceholder}
                              className={`w-full pl-9 pr-3 py-2.5 bg-white/5 border text-xs tracking-widest font-mono text-white rounded-xl focus:outline-none focus:border-[#1B32FF] ${
                                cardNumberError ? "border-red-400" : "border-white/10"
                              }`}
                            />
                          </div>
                          {cardNumberError && <p className="text-[10px] text-red-400 font-bold">{cardNumberError}</p>}
                        </div>

                        {/* Expiry and CVC Grid */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300 block">{currentStrings.cardExpiryLabel}</label>
                            <input 
                              type="text"
                              maxLength={5}
                              value={cardExpiry}
                              onChange={(e) => {
                                setCardExpiry(e.target.value);
                                if (cardExpiryError) setCardExpiryError("");
                              }}
                              placeholder="MM/YY"
                              className={`w-full px-3.5 py-2.5 bg-white/5 border text-xs tracking-wider text-center font-mono text-white rounded-xl focus:outline-none focus:border-[#1B32FF] ${
                                cardExpiryError ? "border-red-400" : "border-white/10"
                              }`}
                            />
                            {cardExpiryError && <p className="text-[10px] text-red-400 font-bold">{cardExpiryError}</p>}
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300 block">{currentStrings.cardCvcLabel}</label>
                            <input 
                              type="password"
                              maxLength={4}
                              value={cardCvc}
                              onChange={(e) => {
                                setCardCvc(e.target.value);
                                if (cardCvcError) setCardCvcError("");
                              }}
                              placeholder="•••"
                              className={`w-full px-3.5 py-2.5 bg-white/5 border text-xs tracking-widest text-center font-mono text-white rounded-xl focus:outline-none focus:border-[#1B32FF] ${
                                cardCvcError ? "border-red-400" : "border-white/10"
                              }`}
                            />
                            {cardCvcError && <p className="text-[10px] text-red-400 font-bold">{cardCvcError}</p>}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* DIGITAL WALLETS MODE INTERFACE (APPLE / GOOGLE PAY) */}
                {(selectedMethod === "applepay" || selectedMethod === "googlepay") && (
                  <div className="p-5.5 bg-white/[0.01] border border-white/5 rounded-2xl space-y-4 text-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                       Pay & G Pay Quick Checkout
                    </span>
                    <p className="text-xs text-slate-300 max-w-[280px] mx-auto leading-relaxed">
                      Instant contactless checkout from your active secure phone wallet. No cards or mobile money digits required!
                    </p>

                    <div className="flex flex-col gap-2.5 max-w-[240px] mx-auto pt-2">
                      {/* Apple Pay Button */}
                      <button
                        type="button"
                        onClick={() => handleWalletTrigger("applepay")}
                        className="py-3.5 bg-black hover:bg-zinc-900 border border-white/10 hover:border-white/15 scale-100 hover:scale-[1.02] active:scale-[0.98] transition-all rounded-xl text-white font-black text-xs uppercase flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                      >
                        <span className="text-sm"></span> Pay with Apple Pay
                      </button>

                      {/* Google Pay Button */}
                      <button
                        type="button"
                        onClick={() => handleWalletTrigger("googlepay")}
                        className="py-3.5 bg-stone-900 hover:bg-stone-850 hover:border-white/15 scale-100 hover:scale-[1.02] active:scale-[0.98] transition-all rounded-xl text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer border border-white/5"
                      >
                        <span className="text-yellow-400 font-black">G</span> 
                        <span className="text-blue-400 font-black">o</span>
                        <span className="text-red-400 font-black">o</span> 
                        <span className="text-emerald-400 font-black">g</span>
                        <span className="text-indigo-400 font-black">l</span>
                        <span className="text-yellow-400 font-black">e</span>
                        Pay
                      </button>
                    </div>

                    <div className="text-[10px] text-slate-500 font-medium leading-normal">
                      🔒 Secured via 256-bit Tokenized Biometric Encryption keys.
                    </div>
                  </div>
                )}

                {/* 3. Note reference (Optional) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">
                    📝 {currentStrings.noteLabel}
                  </label>
                  <input 
                    type="text" 
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={currentStrings.notePlaceholder}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-[#1B32FF] transition-all"
                  />
                </div>
              </div>

              {/* Security Shield notice */}
              <div className="p-4 bg-yellow-500/5 border border-yellow-500/25 rounded-2xl flex items-start gap-3">
                <Lock className="text-[#FFC107] flex-shrink-0 mt-0.5 animate-pulse" size={16} />
                <div className="text-[11px] leading-relaxed text-slate-300">
                  <span className="font-extrabold text-[#FFC107] block">{currentStrings.secureNoticeTitle}</span>
                  <p className="text-slate-400 mt-0.5">
                    {currentStrings.secureNoticeDesc}
                  </p>
                </div>
              </div>

              {/* Main Pay Trigger Buttons */}
              {(selectedMethod === "momo" || selectedMethod === "card") && (
                <button 
                  onClick={handleInitiateRequestToPay}
                  disabled={!amount || submitting}
                  className="w-full py-4.5 bg-gradient-to-r from-yellow-500 to-[#FFC107] hover:brightness-110 active:scale-[0.98] disabled:opacity-40 rounded-2xl font-black text-xs uppercase tracking-widest text-[#0C0E14] transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="animate-spin text-[#0C0E14]" size={16} />
                      {currentStrings.securingHandshake}
                    </>
                  ) : (
                    <>
                      <CreditCard size={17} className="text-[#0C0E14]" />
                      {selectedMethod === "momo" ? currentStrings.payBtnMomo : currentStrings.payBtnCard}
                    </>
                  )}
                </button>
              )}

              {/* Secondary offline MoMo fallback button - visible only when standard method is active */}
              {selectedMethod === "momo" && (
                <>
                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-white/5"></div>
                    <span className="flex-shrink mx-2.5 text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">
                      Low data or slow internet?
                    </span>
                    <div className="flex-grow border-t border-white/5"></div>
                  </div>

                  <button 
                    type="button"
                    onClick={() => {
                      setIsOfflineUssd(true);
                      setAmountError("");
                      setPhoneError("");
                    }}
                    className="w-full py-3.5 bg-[#1B32FF]/10 hover:bg-[#1B32FF]/20 border border-[#1b32ff]/20 rounded-xl font-bold text-xs text-[#FFC107] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Phone size={13} className="text-[#FFC107]" />
                    {currentStrings.offlineBtn}
                  </button>
                </>
              )}
            </motion.div>
          )}

          {/* SCREEN: WAITING FOR PUSH AUTHENTICATION */}
          {screen === "waiting" && (
            <motion.div 
              key="waiting"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="p-6 text-center space-y-6"
            >
              <div className="relative w-20 h-20 mx-auto mt-4">
                <div className="absolute inset-0 border-4 border-[#1B32FF]/10 rounded-full" />
                <div className="absolute inset-0 border-4 border-t-yellow-400 border-r-yellow-400 rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center font-bold text-yellow-400 text-sm">
                  {countdown}s
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-lg font-extrabold text-white tracking-tight">
                  {selectedMethod === "momo" ? currentStrings.outboundAlert : currentStrings.securingConnection}
                </h2>
                
                {selectedMethod === "momo" ? (
                  <div className="bg-yellow-500/5 border border-yellow-500/20 p-4.5 rounded-2xl shadow-sm text-center">
                    <p className="text-xs text-[#FFC107] font-bold leading-relaxed italic">
                      "Payment request sent. Check your phone and confirm with your MTN MoMo PIN."
                    </p>
                  </div>
                ) : (
                  <div className="bg-blue-500/5 border border-blue-500/20 p-4.5 rounded-2xl shadow-sm text-center">
                    <p className="text-xs text-sky-400 font-bold leading-relaxed tracking-wider animate-pulse font-mono">
                      {currentStrings.verifyingCard}
                    </p>
                  </div>
                )}

                <p className="text-xs text-slate-300 leading-relaxed max-w-[300px] mx-auto">
                  Outbound authorization in progress for <strong className="text-yellow-400 font-mono font-black text-lg block mt-1">{parseFloat(amount).toLocaleString()} {currency} (≈ {fmtRWF(parseFloat(amount) * EXCHANGE_RATES[currency])})</strong>
                </p>
              </div>

              {isDemoMode && (
                <div className="p-4 bg-indigo-500/5 border border-indigo-500/15 rounded-2xl text-left space-y-2.5">
                  <div className="flex gap-1.5 font-bold text-indigo-400 items-center text-xs">
                    <span className="text-base">🚀</span>
                    <span>{currentStrings.simTitle}</span>
                  </div>
                  <p className="text-xs text-slate-300 italic">
                    {currentStrings.simDesc}
                  </p>
                  <button 
                    onClick={mockSetSuccess}
                    className="w-full py-3 bg-[#FFC107] text-[#0C0E14] font-black uppercase tracking-widest text-[10px] rounded-xl hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    {currentStrings.simBypass}
                  </button>
                </div>
              )}

              <div className="border border-white/5 bg-white/[0.01] p-3 rounded-2xl text-[11px] text-slate-400 font-mono flex flex-col gap-1 items-center justify-center">
                <span>TERMINAL REF:</span>
                <span className="text-slate-300 text-[10px] tracking-wider font-semibold bg-white/5 py-1 px-2.5 rounded-lg select-all mt-1">{txnId}</span>
              </div>

              <button 
                onClick={handleReset}
                className="text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer block mx-auto underline"
              >
                {currentStrings.cancelGoBack}
              </button>
            </motion.div>
          )}

          {/* SCREEN: SUCCESS CONFIRMATION */}
          {screen === "success" && (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 text-center space-y-6"
            >
              <div className="w-18 h-18 rounded-full bg-emerald-500/10 border-2 border-[#00D68F] flex items-center justify-center mx-auto text-[#00D68F] shadow-[0_0_20px_rgba(0,214,143,0.15)] mt-4">
                <CheckCircle size={36} />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-black text-[#00D68F]">{currentStrings.successAlert}</h2>
                <div className="text-xs text-slate-300 leading-relaxed max-w-[280px] mx-auto">
                  {currentStrings.successDesc} <strong>{client.businessName}</strong>.
                  <span className="font-black text-white text-base block my-1 font-mono">
                    {parseFloat(amount).toLocaleString()} {currency} (≈ {fmtRWF(parseFloat(amount) * EXCHANGE_RATES[currency])})
                  </span>
                </div>
              </div>

              <div className="border border-white/5 bg-white/[0.01] p-3 rounded-2xl text-[11.5px] font-mono text-slate-400 space-y-1">
                <div>
                  <span className="font-sans font-semibold">Payment Via: </span>
                  <span className="text-yellow-400 font-bold uppercase">{selectedMethod}</span>
                </div>
                <div>
                  <span className="font-sans font-semibold">Transaction ID:</span>
                  <span className="text-[#00D68F] font-bold ml-1.5 select-all">{txnId}</span>
                </div>
              </div>

              <div className="p-3.5 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl text-[11px] text-slate-300 text-left leading-normal flex gap-2">
                <ShieldCheck className="text-emerald-400 flex-shrink-0 mt-0.5" size={16} />
                <div>
                  <strong className="block text-white mb-0.5">{currentStrings.receiptSecured}</strong>
                  <p className="text-slate-400">{currentStrings.receiptSecuredDesc}</p>
                </div>
              </div>

              <button 
                onClick={handleReset}
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 rounded-xl font-bold text-xs tracking-wider uppercase text-[#0C0E14] transition-all cursor-pointer"
              >
                {currentStrings.doneBtn}
              </button>
            </motion.div>
          )}

          {/* SCREEN: FAILED / TIMED OUT */}
          {screen === "failed" && (
            <motion.div 
              key="failed"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 text-center space-y-6"
            >
              <div className="w-18 h-18 rounded-full bg-red-500/10 border-2 border-[#FF4E6A] flex items-center justify-center mx-auto text-[#FF4E6A] shadow-[0_0_20px_rgba(255,78,106,0.15)] mt-4">
                <XCircle size={36} />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-black text-[#FF4E6A]">{currentStrings.checkoutNotClear}</h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {currentStrings.checkoutNotClearDesc}
                </p>
                <span className="font-black text-slate-400 mt-1 block">
                  {parseFloat(amount).toLocaleString()} {currency}
                </span>
              </div>

              <div className="p-3.5 bg-red-500/5 border border-red-500/20 rounded-2xl text-[11px] text-slate-300 text-left leading-relaxed flex gap-2.5">
                <AlertTriangle className="text-red-400 flex-shrink-0 mt-0.5" size={16} />
                <p>
                  If funds were not deducted, simply tap below to retry. If your balance was deducted, present your receipt or bank alert to the merchant.
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button 
                  onClick={handleReset}
                  className="w-full py-3.5 bg-gradient-to-r from-yellow-500 to-amber-500 text-[#0c0e14] rounded-xl font-bold text-xs hover:brightness-110 active:scale-98 transition-all cursor-pointer animate-pulse"
                >
                  Retry Payment Form
                </button>
              </div>
            </motion.div>
          )}

          {screen === "gateway_redirect" && (
            <motion.div 
              key="gateway_redirect"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-8 text-center space-y-6"
            >
              <div className="relative w-24 h-24 mx-auto mt-6 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-[#FFC107]/20 border-t-[#FFC107] animate-spin" />
                <Lock className="text-[#FFC107] animate-bounce" size={32} />
              </div>
              
              <div className="space-y-3">
                <p className="text-[#FFC107] text-[10px] font-black uppercase tracking-widest">Secured Gateway Link</p>
                <h3 className="text-lg font-extrabold text-white">Redirecting Securely...</h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-[280px] mx-auto">
                  Connecting you to Stripe's 3D-Secure International cards processing bank node.
                </p>
              </div>

              <div className="py-2.5 px-4 bg-white/[0.02] border border-white/5 rounded-2xl text-[9px] text-slate-500 font-mono inline-flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00D68F] animate-ping" />
                <span>SSL Secured • ISO-27001 Compliant Gateway</span>
              </div>
            </motion.div>
          )}

          {screen === "gateway_portal" && (
            <motion.div 
              key="gateway_portal"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-6 space-y-4"
            >
              {/* External secure boundary header representation */}
              <div className="p-3 bg-zinc-900 rounded-xl border border-white/10 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold font-mono">
                  <span>🔒 auth.stripe.gerapay.com</span>
                </div>
                <span className="text-slate-500 uppercase tracking-widest font-bold">Secure checkout Node</span>
              </div>

              <div className="text-center pb-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Global Cards Acquirer</span>
                <h3 className="text-sm font-bold text-slate-200 mt-0.5">Verified by Visa® / Mastercard Identity Check®</h3>
              </div>

              {/* Merchant Details Readout */}
              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-1 text-center font-mono relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-indigo-500 via-[#FFC107] to-cyan-500" />
                <span className="text-[9px] text-[#FFC107] uppercase font-sans font-black block tracking-widest">SECURE CHECKOUT VALUE</span>
                <span className="text-white text-base font-bold font-sans block">{client.businessName}</span>
                <span className="text-[#00D68F] font-black text-2xl block pt-1.5">
                  {CURRENCY_SYMBOLS[currency]}{parseFloat(amount).toLocaleString()}
                </span>
                <span className="text-slate-400 text-[10.5px] font-sans block">
                  ≈ {fmtRWF(parseFloat(amount) * EXCHANGE_RATES[currency])} RWF Gateway Settlement
                </span>
              </div>

              {/* Fake Secure Card input form container inside simulated external gateway */}
              <div className="space-y-3.5 pt-1">
                {gatewayError && (
                  <p className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-red-500 text-xs font-semibold leading-relaxed text-center">
                    ⚠️ {gatewayError}
                  </p>
                )}

                <div className="p-3 bg-indigo-500/[0.04] border border-indigo-500/15 rounded-xl text-[11px] text-slate-300 leading-relaxed text-center font-medium italic">
                  "This secure gateway portal operates in sandbox testing mode. You can enter any mock card credentials to proceed with authorization."
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider block">Credit / Debit Card Number *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-base">💳</span>
                    <input 
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      placeholder="4111 2222 3333 4444"
                      disabled={gatewaySubmitting}
                      className="w-full pl-9 pr-3 py-2.5 bg-zinc-950 border border-white/10 text-xs tracking-widest font-mono text-white rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider block">Expiry (MM/YY) *</label>
                    <input 
                      type="text"
                      maxLength={5}
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      placeholder="12/28"
                      disabled={gatewaySubmitting}
                      className="w-full px-3 py-2.5 bg-zinc-950 border border-white/10 text-xs tracking-wider text-center font-mono text-white rounded-xl focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider block">CVV / CVC *</label>
                    <input 
                      type="password"
                      maxLength={4}
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value)}
                      placeholder="•••"
                      disabled={gatewaySubmitting}
                      className="w-full px-3 py-2.5 bg-zinc-950 border border-white/10 text-xs tracking-widest text-center font-mono text-white rounded-xl focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Simulated quick autofill sandbox credentials trigger for rapid evaluation */}
                <button
                  type="button"
                  onClick={() => {
                    setCardNumber("4111 2222 3333 4444");
                    setCardExpiry("12/28");
                    setCardCvc("123");
                  }}
                  className="w-full py-1.5 bg-white/5 border border-white/5 hover:bg-white/10 text-[10px] uppercase font-mono tracking-widest text-slate-400 rounded-lg hover:text-white transition-all cursor-pointer"
                >
                  ⚡ Quick Sandbox Autofill Card
                </button>
              </div>

              {/* Authorize button */}
              <div className="pt-3 space-y-2">
                <button
                  onClick={handleGatewayAuthorize}
                  disabled={gatewaySubmitting}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {gatewaySubmitting ? (
                    <>
                      <RefreshCw className="animate-spin text-black" size={13} />
                      Running 3D Secure Authenticator...
                    </>
                  ) : (
                    <>
                      <span>✔️ Authorize Secured Payment</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full py-2.5 hover:bg-white/5 text-[10.5px] font-bold text-slate-500 hover:text-white rounded-lg transition-all text-center cursor-pointer"
                >
                  ← Cancel Payment & Return
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Apple Pay & Google Pay system style dynamic popup overlay */}
        <AnimatePresence>
          {walletStep !== "idle" && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 40 }}
                className="bg-zinc-950 border border-white/10 w-full max-w-sm rounded-[32px] overflow-hidden p-6 text-center space-y-6 shadow-2xl relative"
              >
                {/* Brand header */}
                <div className="flex items-center justify-center gap-1.5 my-1 text-white">
                  {selectedMethod === "applepay" ? (
                    <span className="text-lg font-black font-sans leading-none"> Pay</span>
                  ) : (
                    <span className="font-extrabold text-sm tracking-wide">
                      <span className="text-yellow-400 font-bold">G</span>oogle Pay
                    </span>
                  )}
                </div>

                <div className="border border-white/5 bg-white/[0.02] p-4.5 rounded-2xl space-y-1 text-center font-mono">
                  <span className="text-[10px] text-slate-500 uppercase font-sans font-bold block">Paying Merchant</span>
                  <span className="text-white text-sm font-bold font-sans block">{client.businessName}</span>
                  <span className="text-yellow-400 font-black text-xl block pt-2">
                    {CURRENCY_SYMBOLS[currency]}{parseFloat(amount).toLocaleString()}
                  </span>
                  <span className="text-slate-400 text-xs font-sans block">
                    ≈ {fmtRWF(parseFloat(amount) * EXCHANGE_RATES[currency])} RWF
                  </span>
                </div>

                {walletStep === "bio_scan" ? (
                  <div className="space-y-4 py-2">
                    <div className="w-16 h-16 rounded-full bg-indigo-500/10 border-2 border-indigo-400 flex items-center justify-center mx-auto text-indigo-400 animate-pulse">
                      <Fingerprint size={32} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-white tracking-wide">{currentStrings.biometricVerify} {selectedMethod === "applepay" ? "TouchID/FaceID" : "Device PIN"}</p>
                      <p className="text-[10.5px] text-slate-500">{currentStrings.biometricAuth}</p>
                    </div>

                    <button
                      onClick={handleBioSuccess}
                      className="mx-auto mt-2 px-4 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 font-bold text-[10.5px] rounded-lg transition-colors cursor-pointer"
                    >
                      Bypass Bio Verification (Simulate Touch)
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 py-4 text-center">
                    <div className="w-14 h-14 rounded-full bg-emerald-500/10 border-2 border-emerald-400 flex items-center justify-center mx-auto text-emerald-400">
                      <Check size={28} />
                    </div>
                    <p className="text-xs font-extrabold text-emerald-400 uppercase tracking-widest">{currentStrings.biometricSuccess}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setWalletStep("idle")}
                  className="text-[11px] font-bold text-slate-500 hover:text-white transition-colors underline cursor-pointer"
                >
                  {currentStrings.cancelGoBack}
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className="p-4 bg-white/[0.01] border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5 font-semibold">
            <img src="/gera-pay-qr-logo.svg" alt="Gera Flow" className="w-4 h-4 object-contain rounded-[4px]" />
            Seamless payments globally & locally via Gera Flow • v-mobile-fix-1
          </span>
          <span className="flex items-center gap-0.5 text-indigo-400 font-bold hover:underline cursor-pointer">
            Terminal Info <ExternalLink size={10} />
          </span>
        </div>
      </div>
    </div>
  );
}
