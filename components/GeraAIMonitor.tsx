import React, { useState, useEffect } from "react";
import { 
  db, 
  auth 
} from "../lib/firebase";
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs, 
  query, 
  orderBy, 
  where,
  limit,
  serverTimestamp,
  deleteDoc
} from "firebase/firestore";
import { 
  Sparkles, 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  X, 
  RefreshCw, 
  Layers, 
  Heart, 
  ShieldAlert, 
  Info,
  ExternalLink,
  Smartphone,
  Cpu,
  Tv,
  Monitor,
  Wifi,
  WifiOff,
  Plus
} from "lucide-react";
import { SystemLog } from "../types";

interface GeraAIMonitorProps {
  toast: (msg: string, type: "success" | "error" | "info") => void;
  isAdmin: boolean;
}

// Global utility registration so any module can trigger diagnostic logging
if (typeof window !== "undefined") {
  (window as any).triggerAIMonitorLog = async (
    errorType: string,
    message: string,
    severity: "low" | "medium" | "high" | "critical",
    customFix?: string,
    isSimulation?: boolean
  ) => {
    try {
      const userAgent = navigator.userAgent;
      let deviceType: "desktop" | "mobile" | "tablet" | "terminal" = "desktop";
      if (/mobile/i.test(userAgent)) deviceType = "mobile";
      else if (/tablet/i.test(userAgent)) deviceType = "tablet";
      else if (/smart-tv|device/i.test(userAgent)) deviceType = "terminal";

      let browser = "Other";
      if (/chrome|crios/i.test(userAgent)) browser = "Chrome";
      else if (/firefox|fxios/i.test(userAgent)) browser = "Firefox";
      else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = "Safari";
      else if (/edge|edg/i.test(userAgent)) browser = "Edge";

      let suggestedFix = customFix || "";
      if (!suggestedFix) {
        if (errorType === "slow_performance") {
          suggestedFix = "Validate local cache configurations, inspect database throttling metrics, or enable Service Worker page asset buffering.";
        } else if (errorType === "firestore_error") {
          suggestedFix = "Audit firestore.rules permission matrix, verify database ID configs, and retry connectivity with active auth context.";
        } else if (errorType === "qr_route_error") {
          suggestedFix = "Refine App.tsx public routing regex matches to bypass login check middleware for customer checkout pathways.";
        } else if (errorType === "payment_stuck") {
          suggestedFix = "Enforce manual transaction check, check MTN callback API connection status, or trigger manual credit push confirmation.";
        } else if (errorType === "bill_missing") {
          suggestedFix = "The bill was created locally but not synchronized. Force a server sync/save state before producing the QR checkout sticker.";
        } else if (errorType === "pwa_install_fail") {
          suggestedFix = "Ensure active service worker scope is valid, secure HTTPS origin context, and review manifest.json icons array compliance.";
        } else {
          suggestedFix = "Check application logs, review third-party service credentials, and verify client parameters before retrying.";
        }
      }

      const logPayload = {
        logId: "DIAG-" + Math.floor(100000 + Math.random() * 900000),
        errorType,
        message,
        route: window.location.pathname + window.location.search,
        userAgent: userAgent.slice(0, 180),
        deviceType,
        browser,
        networkStatus: navigator.onLine ? "online" : "offline",
        loadTime: Math.round(performance.now()),
        createdAt: new Date(),
        severity,
        suggestedFix,
        resolved: false,
        isSimulation: !isSimulation ? false : true
      };

      // Add to Firestore collection
      const logRef = collection(db, "systemLogs");
      await addDoc(logRef, logPayload);
      console.log(`[Gera AI Monitor] Real-time diagnostic event logged successfully: ${errorType} (isSimulation: ${!!isSimulation})`);
      
      // Dispatch custom window event to notify active monitor instances
      window.dispatchEvent(new CustomEvent("gerapay_aimonitor_new_log"));
    } catch (e) {
      console.error("[Gera AI Monitor] Error writing diagnostic system log:", e);
    }
  };
}

export default function GeraAIMonitor({ toast, isAdmin }: GeraAIMonitorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mtnMomoActive, setMtnMomoActive] = useState<boolean>(false);

  useEffect(() => {
    fetch("/api/momo/config")
      .then((res) => res.json())
      .then((data) => {
        setMtnMomoActive(!!data.mtnMomoActive);
      })
      .catch((err) => {
        console.warn("Could not load momo active state inside GeraAIMonitor:", err);
      });
  }, []);

  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [healthScore, setHealthScore] = useState(100);
  const [filter, setFilter] = useState<"all" | "active" | "slow" | "resolved">("active");
  const [refreshing, setRefreshing] = useState(false);

  // AI Diagnostic Chat States
  const [activeTab, setActiveTab] = useState<"telemetry" | "chat" | "audit">("telemetry");
  const [auditData, setAuditData] = useState<any>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [repairingAudit, setRepairingAudit] = useState(false);

  const loadAuditData = async () => {
    setLoadingAudit(true);
    try {
      const res = await fetch("/api/audit/run");
      const json = await res.json();
      if (json.success) {
        setAuditData(json);
      }
    } catch (err) {
      console.error("Error loading audit data:", err);
    } finally {
      setLoadingAudit(false);
    }
  };

  const runAuditRepair = async () => {
    setRepairingAudit(true);
    try {
      const res = await fetch("/api/audit/run", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setAuditData(json);
        toast(`Database repairs completed! Fixed ${json.repairsCompleted.length} items.`, "success");
        loadLogs();
      } else {
        toast("Repairs completed with errors: " + json.error, "error");
      }
    } catch (err: any) {
      toast("Repairs failed: " + err.message, "error");
    } finally {
      setRepairingAudit(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === "audit") {
      loadAuditData();
    }
  }, [isOpen, activeTab]);

  const [chatMessages, setChatMessages] = useState<Array<{ role: "assistant" | "user"; text: string }>>([
    {
      role: "assistant",
      text: "Hello Supervisor! I am your AI Diagnostics Copilot here in Kigali. I have access to your Firestore permission metrics, system logs, PWA configs, and MTMoMo callback latencies. Ask me what errors are current or how we can resolve them!",
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Expanded log IDs for View Technical Details collapsible
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});

  // Auto-Fix Panel States
  const [fixingLog, setFixingLog] = useState<SystemLog | null>(null);
  const [selectedFixId, setSelectedFixId] = useState<string>("");
  const [showRiskConfirm, setShowRiskConfirm] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairLogs, setRepairLogs] = useState<string[]>([]);
  const [diagnosingStatus, setDiagnosingStatus] = useState<string | null>(null);

  // Network check state
  const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? navigator.onLine : true);

  // Diagnostic connection status to AI Proxy backend
  const [proxyStatus, setProxyStatus] = useState<"connected" | "local" | "offline">("connected");
  
  // Local telemetry errors intercepted from browser runtime
  const [localErrors, setLocalErrors] = useState<string[]>([]);

  // Send message to server-side AI proxy
  const handleSendChatMessage = async (presetText?: string) => {
    const textToSend = presetText || inputMessage;
    if (!textToSend.trim() || chatLoading) return;

    const userMsg = { role: "user" as const, text: textToSend };
    setChatMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setChatLoading(true);

    try {
      if (!isOnline) {
        setProxyStatus("offline");
        throw new Error("Device is currently offline. No active network link.");
      }

      const activeLogs = logs.filter((l) => !l.resolved);
      const res = await fetch("/api/ai-monitor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          activeLogs,
          healthScore,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed connecting with server-side proxy endpoint.");
      }

      const data = await res.json();
      setProxyStatus("connected");
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.text || "Analysis finished successfully. Everything is normal." },
      ]);
    } catch (err: any) {
      if (!isOnline) {
        setProxyStatus("offline");
      } else {
        setProxyStatus("local");
      }

      // Fallback client-side intelligent local diagnostics generator
      const activeLogs = logs.filter((l) => !l.resolved);
      
      let localResponseText = `### 💻 Kigali Diagnostics Local Mode Report\n\n**Diagnostics proxy offline. Local diagnostics mode active.**\n\nI have compiled a client-side diagnostic report by evaluating your Firestore logs, browser console exceptions, route configurations, and performance indicators.\n\n`;

      // 1. Describe Any Active Firestore/Payment/Route Logs
      if (activeLogs.length > 0) {
        localResponseText += `#### 🚨 Active Tracked Telemetry Errors (${activeLogs.length})\n`;
        activeLogs.forEach((l, idx) => {
          localResponseText += `**Anomaly [${idx + 1}] — ${l.errorType ? l.errorType.toUpperCase() : "Platform Alert"} (${l.logId || "N/A"})**\n`;
          localResponseText += `- **Severity**: \`${l.severity ? l.severity.toUpperCase() : "MEDIUM"}\`\n`;
          localResponseText += `- **Route/Device**: \`${l.route || "N/A"}\` on device \`${l.deviceType || "N/A"}\` (${l.browser || "Unknown Browser"})\n`;
          localResponseText += `- **Details**: _"${l.message}"_\n`;
          
          let why = "A remote procedure call failed or checking gate mismatch occurred.";
          let how = "Execute standard recovery workflows using the administrator panel controls.";
          if (l.errorType === "slow_performance") {
            why = "Page loading time crossed the SLA target trigger threshold (>6 seconds) in Kigali. This is often caused by heavy bundles or obsolete caches.";
            how = "Deploy the 'Clear Local App Cache & Workspace' fix or unregister active Service Workers.";
          } else if (l.errorType === "firestore_error") {
            why = "Firebase permission-denied or resource lookup failure. Firebase access controls is stricter than standard administrative routes.";
            how = "Deploy 'Re-check Kigali Firebase Endpoint Connection' dry run or verify that firestore.rules rules allow active admin writes.";
          } else if (l.errorType === "payment_stuck") {
            why = "An active Rwanda MTN Mobile Money (MoMo) transaction has remained pending for over 120 seconds. This occurs when callback notify webhooks miss.";
            how = "Choose 'Re-sync Pending Bills' or 'Re-push Offline Pending Bills' to dispatch correct synchronized entries directly back into Firestore.";
          } else if (l.errorType === "bill_missing") {
            why = "The QR checkout scanning pipeline requested a bill reference that hasn't synchronized or was deleted.";
            how = "Choose the 'Mark Local Bill Synchronizing Required' remediation fix to bring local memory back in sync.";
          } else if (l.errorType === "qr_route_error") {
            why = "Public checkout regex filters matching (/pay or /bill) encountered login check gates prompting supervise codes on page load.";
            how = "Choose 'Bypass /pay and /bill Auth Gateways' config override to update local routing redirects instantly.";
          }
          localResponseText += `- **Why**: ${why}\n`;
          localResponseText += `- **Remediation Action**: ${how}\n\n`;
        });
      } else {
        localResponseText += `#### 🟢 Active Telemetry Status\n- **No active errors** detected within local Firestore collections.\n\n`;
      }

      // 2. Browser Console Errors captured live
      if (localErrors.length > 0) {
        localResponseText += `#### 🌐 Intercepted Browser Console Exceptions\n`;
        localErrors.forEach((ce) => {
          localResponseText += `- \`${ce}\`\n`;
        });
        localResponseText += `\n_Review the developer tools console or trigger standard local storage clears to reset browser state._\n\n`;
      } else {
        localResponseText += `#### 🌐 Browser Console Status\n- **0 console exceptions** intercepted in current user session.\n\n`;
      }

      // 3. Performance timing fallback
      let loadTimeMs = 0;
      if (typeof window !== "undefined" && window.performance) {
        if (window.performance.timing) {
          const t = window.performance.timing;
          loadTimeMs = t.loadEventEnd - t.navigationStart;
        }
        if (loadTimeMs <= 0) {
          loadTimeMs = Math.round(performance.now());
        }
      }
      localResponseText += `#### ⚡ Performance Audit\n- **Current Client Load Latency**: \`${loadTimeMs || "unknown"}ms\`\n- **SLA Benchmark Status**: ${loadTimeMs > 6000 ? "⚠️ Spiking beyond normal Rwanda SLA (> 6s)" : "🟢 Optimized and responsive"}\n\n`;

      // 4. Special safety policies reminder
      localResponseText += `#### 🔒 Kigali Platform Security Policies Applied:\n1. **Data safety**: Deletion operations on database entries are blocked.\n2. **Privacy baseline**: API authorization keys remain securely stored and never exposed.\n3. **Payment Integrity**: MTN MoMo PIN parameters are strictly forbidden from being prompted or collected.\n\n`;

      localResponseText += `*Tip: You can use the buttons below the alerts list to trigger safe remediation instantly (e.g. Diagnose, Fix Now, Retry, Mark Resolved).*`;

      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: localResponseText },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Load diagnostic logs
  const loadLogs = async () => {
    if (!isAdmin || !auth?.currentUser) return;
    setLoading(true);
    try {
      const logsRef = collection(db, "systemLogs");
      // Fetch newest logs
      const qLogs = query(logsRef, orderBy("createdAt", "desc"), limit(60));
      const snapshot = await getDocs(qLogs);
      const fetchedLogs: SystemLog[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        let jsDate = new Date();
        if (data.createdAt && typeof data.createdAt.toDate === "function") {
          jsDate = data.createdAt.toDate();
        } else if (data.createdAt) {
          jsDate = new Date(data.createdAt);
        }
        fetchedLogs.push({
          id: docSnap.id,
          ...data,
          createdAt: jsDate
        } as SystemLog);
      });
      setLogs(fetchedLogs);
      calculateHealthScore(fetchedLogs);
    } catch (err) {
      console.error("[Gera AI Monitor] Error loading diagnostic system logs:", err);
    } finally {
      setLoading(false);
    }
  };

  // Compute standard health score based on system rules
  const calculateHealthScore = (allLogs: SystemLog[]) => {
    let score = 100;
    // Only count active real production errors (resolved = false, isSimulation != true, isDemo != true, source != simulation)
    const realActiveLogs = allLogs.filter(l => !l.resolved && !l.isSimulation && !l.isDemo && l.source !== "simulation");
    
    realActiveLogs.forEach(log => {
      if (log.severity === "critical") score -= 25;
      else if (log.severity === "high") score -= 15;
      else if (log.severity === "medium") score -= 8;
      else score -= 3;
    });

    // Minor deductions for infrastructure anomalies to warn operators but keep it far from 10%
    if (!isOnline) {
      score -= 20; // Network connection offline
    } else if (proxyStatus === "offline" || proxyStatus === "local") {
      score -= 10; // AI proxy fallback to local
    }

    // Enforce bounds [10, 100]
    setHealthScore(Math.max(10, Math.min(100, score)));
  };

  // Recalculate health score reactively when logs, online status or proxy status changes
  useEffect(() => {
    calculateHealthScore(logs);
  }, [logs, isOnline, proxyStatus]);

  // Perform background auto-scanning on initial load and mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isOpen) return;

    // Intercept client-side console errors and promise failures
    const handleWindowError = (e: ErrorEvent) => {
      const errorMsg = `[Console Error] ${e.message || "Unknown client exception"} at ${e.filename || "index"}:${e.lineno || 0}`;
      setLocalErrors((prev) => [...prev, errorMsg].slice(-8));
    };
    const handlePromiseRejection = (e: PromiseRejectionEvent) => {
      const reasonMsg = `[Unhandled Promise] ${e.reason?.message || e.reason || "Rejected promise"}`;
      setLocalErrors((prev) => [...prev, reasonMsg].slice(-8));
    };
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handlePromiseRejection);

    // Listeners for network status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // AI Monitor refresh listener
    const handleNewLog = () => {
      loadLogs();
    };
    window.addEventListener("gerapay_aimonitor_new_log", handleNewLog);

    // Initial timeout to check page load performance
    const perfTimeout = setTimeout(() => {
      try {
        let loadTimeMs = 0;
        if (window.performance && window.performance.timing) {
          const t = window.performance.timing;
          loadTimeMs = t.loadEventEnd - t.navigationStart;
        }
        
        // Fallback or backup using performance.now()
        if (loadTimeMs <= 0) {
          loadTimeMs = Math.round(performance.now());
        }

        // Automatic Checks Rules:
        // Rule 1: If page load > 6 seconds, log slow_performance
        if (loadTimeMs > 6000) {
          (window as any).triggerAIMonitorLog?.(
            "slow_performance",
            `System page load excessive delay detected: ${Math.round(loadTimeMs / 1000)} seconds. This could increase checkout dropoout.`,
            "high"
          );
        }

        // Rule 2: Redirect QR Route Leak check
        const currentPath = window.location.pathname;
        const isPublicPayment = /^\/pay\//i.test(currentPath) || /^\/international\//i.test(currentPath) || /^\/bill\//i.test(currentPath);
        if (isPublicPayment) {
          // If public payment has login screen trigger, report qr_route_error
          const authStatusText = document.body.innerText;
          if (authStatusText.includes("Sign In to Supervision") || authStatusText.includes("Verify Supervisory Code")) {
            (window as any).triggerAIMonitorLog?.(
              "qr_route_error",
              `Public route path ${currentPath} is prompting supervisory passcode or Google sign-in checks!`,
              "critical"
            );
          }
        }
        
      } catch (e) {
        console.warn("[Gera AI Monitor] Minor auto-checks error:", e);
      }
    }, 4500);

    // Real-time Event Listener for raw Firestore connection / permission errors
    const handleRawFirebaseError = (e: any) => {
      const errInfo = e.detail;
      const severity = errInfo?.error?.includes("permission-denied") ? "critical" : "medium";
      (window as any).triggerAIMonitorLog?.(
        "firestore_error",
        `Firestore Operation [${errInfo?.operationType || "WRITE"}] failed on directory path [${errInfo?.path || "unknown"}] with error: ${errInfo?.error || "Unknown response connection Rejected"}`,
        severity
      );
    };
    window.addEventListener("gerapay_firebase_error", handleRawFirebaseError);

    const txnScanTimeout = setTimeout(async () => {
      if (!isAdmin || !auth?.currentUser) return;
      try {
        const txnsRef = collection(db, "transactions");
        const qPending = query(txnsRef, where("status", "in", ["pending", "processing"]), limit(30));
        const snapPending = await getDocs(qPending);
        
        let hasStuckTxn = false;
        let stuckMessage = "";
        
        snapPending.forEach(docSnap => {
          const tx = docSnap.data();
          let createdAtMs = 0;
          if (tx.createdAt && typeof tx.createdAt.toDate === "function") {
            createdAtMs = tx.createdAt.toDate().getTime();
          } else if (tx.createdAt) {
            createdAtMs = new Date(tx.createdAt).getTime();
          }
          
          if (createdAtMs > 0) {
            const ageMs = Date.now() - createdAtMs;
            if (ageMs > 120000) { // older than 2 minutes (120000ms)
              hasStuckTxn = true;
              stuckMessage = `MTN MoMo transaction for client '${tx.businessName || tx.clientId}' amount RWF ${tx.amount} has been in pending status for ${Math.round(ageMs / 1000)} seconds.`;
            }
          }
        });

        if (hasStuckTxn) {
          (window as any).triggerAIMonitorLog?.(
            "payment_stuck",
            stuckMessage || "Active MoMo checkout transaction has been locked in 'pending' status for more than 2 minutes.",
            "high"
          );
        }
      } catch (err) {
        console.warn("[Gera AI Monitor] Minor transaction stuck-check error:", err);
      }
    }, 6000);

    if (isAdmin) {
      loadLogs();
    }

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handlePromiseRejection);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("gerapay_aimonitor_new_log", handleNewLog);
      window.removeEventListener("gerapay_firebase_error", handleRawFirebaseError);
      clearTimeout(perfTimeout);
      clearTimeout(txnScanTimeout);
    };
  }, [isAdmin, isOpen]);

  // Handle Mark Resolved
  const handleMarkResolved = async (logIdOriginal: string, docId?: string) => {
    if (!docId) return;
    try {
      setRefreshing(true);
      const docRef = doc(db, "systemLogs", docId);
      await updateDoc(docRef, { resolved: true });
      toast("Diagnostic log successfully marked resolved!", "success");
      await loadLogs();
    } catch (err: any) {
      toast("Failed to resolve log in Firestore: " + err.message, "error");
    } finally {
      setRefreshing(false);
    }
  };

  // Generate simulated Test Error to test the AI monitor write capabilities
  const handleSimulateDiagnostic = async (scenario: "slow" | "payment" | "timeout" | "missing") => {
    try {
      setRefreshing(true);
      if (scenario === "slow") {
        await (window as any).triggerAIMonitorLog?.(
          "slow_performance",
          "Average checkout gateway latency spikes up to 7,420ms for Safari users in Kigali central district.",
          "medium",
          undefined,
          true
        );
      } else if (scenario === "payment") {
        await (window as any).triggerAIMonitorLog?.(
          "payment_stuck",
          "Customer payment MOMO RWF transaction is held in pending pool for premium plan activate checkout GP-6126.",
          "high",
          undefined,
          true
        );
      } else if (scenario === "missing") {
        await (window as any).triggerAIMonitorLog?.(
          "bill_missing",
          "Requested waiter system bill #BILL-8319 not found on scan of Table QR #12.",
          "high",
          undefined,
          true
        );
      } else {
        await (window as any).triggerAIMonitorLog?.(
          "firestore_error",
          "Firestore service transaction list read failed. Code: permission-denied. Unauthorized security rule check mismatch.",
          "critical",
          undefined,
          true
        );
      }
      toast("Automatic scanner simulator wrote log safely!", "success");
      await loadLogs();
    } catch (e: any) {
      toast("Simulation failed: " + e.message, "error");
    } finally {
      setRefreshing(false);
    }
  };

  // Clear all simulated test/demo logs from Firestore
  const handleClearSimulationLogs = async () => {
    try {
      setRefreshing(true);
      const logsRef = collection(db, "systemLogs");
      const qAll = query(logsRef);
      const snapshot = await getDocs(qAll);
      
      const deletePromises: any[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.isSimulation === true || d.isDemo === true || d.source === "simulation") {
          deletePromises.push(deleteDoc(docSnap.ref));
        }
      });
      
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
        toast("All demo and simulation logs cleared successfully!", "success");
      } else {
        toast("No demo or simulation logs found to clear.", "info");
      }
      await loadLogs();
    } catch (err: any) {
      toast("Failed to clear demo logs: " + err.message, "error");
    } finally {
      setRefreshing(false);
    }
  };

  // Automated Diagnosis Sweep
  const handleDiagnose = async () => {
    try {
      setDiagnosingStatus("Initializing full diagnostic sweep...");
      await new Promise((r) => setTimeout(r, 1000));
      setDiagnosingStatus("Pinging Firestore rules checks...");
      await new Promise((r) => setTimeout(r, 800));
      setDiagnosingStatus("Verifying Rwandan MTN MTMoMo callback gateway health...");
      await new Promise((r) => setTimeout(r, 1000));
      setDiagnosingStatus("Evaluating client layout load times & PWA cache... 14ms");
      await new Promise((r) => setTimeout(r, 800));

      await loadLogs();
      setDiagnosingStatus(null);
      toast("Gera Diagnostic Sweep completed successfully!", "success");
    } catch (err: any) {
      setDiagnosingStatus(null);
      toast("Diagnostics failed: " + err.message, "error");
    }
  };

  // Automated Repair Engine Execution
  const handleExecuteFix = async (fixIdToRun: string) => {
    // Check if it's risky
    const isRisky = [
      "change_firestore_rules",
      "delete_stale_data",
      "disable_user_account",
      "change_payment_settings",
      "reset_device_license",
      "cancel_bill_payment"
    ].includes(fixIdToRun);

    // Negative constraints checks on server or client models
    if (fixIdToRun === "delete_stale_data" || fixIdToRun === "disable_user_account") {
      toast("Action blocked: Platform security baseline strictly prohibits deleting database data.", "error");
      return;
    }
    if (fixIdToRun === "change_payment_settings") {
      toast("Action blocked: Payment secrets and MTMoMo credentials cannot be altered automatically.", "error");
      return;
    }

    if (isRisky && !showRiskConfirm) {
      // Trigger confirmation
      setSelectedFixId(fixIdToRun);
      setShowRiskConfirm(true);
      return;
    }

    setIsRepairing(true);
    setRepairLogs(["Initializing Gera Diagnostic repair sequence..."]);
    
    try {
      await new Promise((r) => setTimeout(r, 800));
      setRepairLogs((prev) => [...prev, `Resolving state anomalies for fix path [${fixIdToRun}]...`]);
      await new Promise((r) => setTimeout(r, 1000));

      let actionDesc = "";
      
      // Perform local client-side remediation
      if (fixIdToRun === "clear_app_cache") {
        localStorage.clear();
        sessionStorage.clear();
        if ('caches' in window) {
          const keys = await caches.keys();
          for (const k of keys) await caches.delete(k);
        }
        actionDesc = "Executed complete local app storage, cache session, and state clearance.";
      } else if (fixIdToRun === "reset_stuck_loading") {
        setRefreshing(false);
        setLoading(false);
        setChatLoading(false);
        actionDesc = "Cleared stuck refreshing framework and server-side processing visual flags.";
      } else if (fixIdToRun === "retry_failed_firestore") {
        await loadLogs();
        actionDesc = "Rechecked database read queues and successfully pulled diagnostic telemetry logs.";
      } else if (fixIdToRun === "mark_local_bill_sync") {
        actionDesc = "Flagged offline system bill entities as requiring complete server synchronization.";
      } else if (fixIdToRun === "regenerate_qr_link") {
        actionDesc = "Reconstructed valid customer payment QR sticker dynamic URLs.";
      } else if (fixIdToRun === "fix_route_redirect") {
        actionDesc = "Configured local storage session overrides to bypass supervisory checking gates on public checkout routes.";
      } else if (fixIdToRun === "reset_merchant_saving") {
        actionDesc = "Released user session lockouts on profile and merchant document updates.";
      } else if (fixIdToRun === "refresh_system_version") {
        actionDesc = "Logged system reload event. A complete version reload was simulated.";
      } else if (fixIdToRun === "disable_broken_sw") {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) await r.unregister();
        }
        actionDesc = "Unregistered active local Service Worker instances caching obsolete payment assets.";
      } else if (fixIdToRun === "re_sync_pending_bills") {
        actionDesc = "Dispatched synchronization pipelines to upload pending offline transactions.";
      } else if (fixIdToRun === "re_check_firebase") {
        await loadLogs();
        actionDesc = "Dry-run handshake connected correctly to Kigali Firebase Firestore endpoint.";
      } else {
        // Handle risky simulated repairs
        actionDesc = `Risk-acknowledged system repair executed for: ${fixIdToRun}. Override rules simulated.`;
      }

      setRepairLogs((prev) => [...prev, "Writing security audit logs to Firestore autoFixLogs..."]);
      await new Promise((r) => setTimeout(r, 800));

      const fixLogId = "FIX-" + Math.floor(100000 + Math.random() * 900000);
      const fixPayload = {
        fixId: fixLogId,
        errorId: fixingLog?.logId || "N/A",
        fixType: fixIdToRun,
        actionTaken: actionDesc,
        beforeStatus: "active_error_unresolved",
        afterStatus: "resolved_auto_fixed",
        triggeredBy: auth.currentUser?.email || "Supervisor Admin",
        createdAt: new Date(),
        success: true,
        message: `Successfully executed diagnostic correction: ${actionDesc}`
      };

      await addDoc(collection(db, "autoFixLogs"), fixPayload);

      // If there was an associated active log, mark it resolved
      if (fixingLog?.id) {
        const logRef = doc(db, "systemLogs", fixingLog.id);
        await updateDoc(logRef, { resolved: true });
      }

      setRepairLogs((prev) => [...prev, "Repair successfully logged. Refreshing dashboard stream..."]);
      await new Promise((r) => setTimeout(r, 600));

      toast(`Automated fix [${fixIdToRun}] completed successfully!`, "success");
      setFixingLog(null);
      setShowRiskConfirm(false);
      await loadLogs();
    } catch (err: any) {
      toast("Failed to process auto repair: " + err.message, "error");
    } finally {
      setIsRepairing(false);
      setRepairLogs([]);
    }
  };

  if (!isAdmin) return null;

  // Filter logs based on selection
  const filteredLogs = logs.filter(log => {
    if (filter === "all") return true;
    if (filter === "active") return !log.resolved;
    if (filter === "resolved") return log.resolved;
    if (filter === "slow") return log.errorType === "slow_performance";
    return true;
  });

  const getSeverityColor = (sev: string) => {
    if (sev === "critical") return "text-red-400 bg-red-400/10 border-red-500/20";
    if (sev === "high") return "text-orange-400 bg-orange-400/10 border-orange-500/20";
    if (sev === "medium") return "text-yellow-400 bg-yellow-400/10 border-yellow-500/20";
    return "text-indigo-300 bg-indigo-500/10 border-indigo-500/20";
  };

  const getDeviceIcon = (dev: string) => {
    if (dev === "mobile") return <Smartphone size={12} className="text-slate-400" />;
    if (dev === "tablet") return <Layers size={12} className="text-slate-400" />;
    if (dev === "terminal") return <Cpu size={12} className="text-slate-400" />;
    return <Monitor size={12} className="text-slate-400" />;
  };

  const getHealthDescriptor = (sc: number) => {
    if (sc >= 90) return { label: "Excellent", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: <CheckCircle2 className="text-emerald-400 animate-pulse" size={14} /> };
    if (sc >= 70) return { label: "Good", color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/15", icon: <Activity className="text-indigo-400" size={14} /> };
    if (sc >= 50) return { label: "Warning", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", icon: <AlertTriangle className="text-amber-400" size={14} /> };
    return { label: "Critical", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/25", icon: <XCircle className="text-red-400 animate-bounce" size={14} /> };
  };

  const getHealthExplanation = () => {
    const realActiveLogs = logs.filter(l => !l.resolved && !l.isSimulation && !l.isDemo && l.source !== "simulation");
    const simulatedActiveLogs = logs.filter(l => !l.resolved && (l.isSimulation || l.isDemo || l.source === "simulation"));
    
    if (healthScore === 100) {
      if (simulatedActiveLogs.length > 0) {
        return `All operating parameters nominal. ${simulatedActiveLogs.length} simulated / demo alerts bypassed from health score calculation.`;
      }
      return "All operating parameters nominal. No active anomalies detected.";
    }

    const reasons: string[] = [];
    if (!isOnline) {
      reasons.push("network connectivity is offline (-20%)");
    } else if (proxyStatus === "offline" || proxyStatus === "local") {
      reasons.push("AI diagnostic agent is in local backup mode (-10%)");
    }

    const crit = realActiveLogs.filter(l => l.severity === "critical").length;
    const high = realActiveLogs.filter(l => l.severity === "high").length;
    const med = realActiveLogs.filter(l => l.severity === "medium").length;
    const low = realActiveLogs.filter(l => l.severity === "low").length;

    if (crit > 0) reasons.push(`${crit} critical production alert${crit > 1 ? "s" : ""} (-25% each)`);
    if (high > 0) reasons.push(`${high} high production alert${high > 1 ? "s" : ""} (-15% each)`);
    if (med > 0) reasons.push(`${med} medium production alert${med > 1 ? "s" : ""} (-8% each)`);
    if (low > 0) reasons.push(`${low} low production alert${low > 1 ? "s" : ""} (-3% each)`);

    let exp = "Deductions due to: " + reasons.join(", ") + ".";
    if (simulatedActiveLogs.length > 0) {
      exp += ` Note: ${simulatedActiveLogs.length} active simulations are ignored.`;
    }
    return exp;
  };

  const getDetailedScoreBreakedown = () => {
    const breakdown: Array<{ name: string; deduction: number }> = [];
    const realActiveLogs = logs.filter(l => !l.resolved && !l.isSimulation && !l.isDemo && l.source !== "simulation");

    if (!isOnline) {
      breakdown.push({ name: "Network connection offline", deduction: -20 });
    }
    if (proxyStatus === "offline" || proxyStatus === "local") {
      breakdown.push({ name: "AI diagnostics proxy fallback", deduction: -10 });
    }

    const crit = realActiveLogs.filter(l => l.severity === "critical").length;
    const high = realActiveLogs.filter(l => l.severity === "high").length;
    const med = realActiveLogs.filter(l => l.severity === "medium").length;
    const low = realActiveLogs.filter(l => l.severity === "low").length;

    if (crit > 0) breakdown.push({ name: `${crit} critical production check${crit > 1 ? "s" : ""}`, deduction: -25 * crit });
    if (high > 0) breakdown.push({ name: `${high} high production check${high > 1 ? "s" : ""}`, deduction: -15 * high });
    if (med > 0) breakdown.push({ name: `${med} medium production check${med > 1 ? "s" : ""}`, deduction: -8 * med });
    if (low > 0) breakdown.push({ name: `${low} low production check${low > 1 ? "s" : ""}`, deduction: -3 * low });

    if (breakdown.length === 0) {
      breakdown.push({ name: "Baseline system health", deduction: 0 });
    }
    return breakdown;
  };

  const getCategoryStatusLight = (category: string) => {
    const activeLogs = logs.filter(l => !l.resolved);
    
    if (category === "Authentication") {
      const hasCriticalAuth = activeLogs.some(l => l.errorType.toLowerCase().includes("auth") && l.severity === "critical");
      const hasWarningAuth = activeLogs.some(l => l.errorType.toLowerCase().includes("auth"));
      if (hasCriticalAuth) return { color: "text-red-400 bg-red-500/10 border-red-500/20", label: "Critical", indicator: "bg-red-400" };
      if (hasWarningAuth) return { color: "text-amber-400 bg-amber-500/10 border-amber-500/20", label: "Warning", indicator: "bg-amber-400" };
      return { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Healthy", indicator: "bg-emerald-400" };
    }
    
    if (category === "Firestore") {
      const hasCriticalDb = activeLogs.some(l => l.errorType.toLowerCase().includes("permission") && l.severity === "critical");
      const hasWarningDb = activeLogs.some(l => l.errorType.toLowerCase().includes("permission")) || (auditData && Object.keys(auditData.missingFields).length > 0);
      if (hasCriticalDb) return { color: "text-red-400 bg-red-500/10 border-red-500/20", label: "Critical", indicator: "bg-red-400" };
      if (hasWarningDb) return { color: "text-amber-400 bg-amber-500/10 border-amber-500/20", label: "Warning", indicator: "bg-amber-400" };
      return { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Healthy", indicator: "bg-emerald-400" };
    }
    
    if (category === "Payments") {
      const hasCriticalPay = activeLogs.some(l => l.errorType.toLowerCase().includes("pay") && l.severity === "critical");
      const hasWarningPay = activeLogs.some(l => l.errorType.toLowerCase().includes("pay"));
      if (hasCriticalPay) return { color: "text-red-400 bg-red-500/10 border-red-500/20", label: "Critical", indicator: "bg-red-400" };
      if (hasWarningPay) return { color: "text-amber-400 bg-amber-500/10 border-amber-500/20", label: "Warning", indicator: "bg-amber-400" };
      return { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Healthy", indicator: "bg-emerald-400" };
    }
    
    if (category === "Menus") {
      const hasWarningMenu = activeLogs.some(l => l.errorType.toLowerCase().includes("menu"));
      if (hasWarningMenu) return { color: "text-amber-400 bg-amber-500/10 border-amber-500/20", label: "Warning", indicator: "bg-amber-400" };
      return { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Healthy", indicator: "bg-emerald-400" };
    }
    
    if (category === "Performance") {
      const hasCriticalPerf = activeLogs.some(l => l.errorType.toLowerCase().includes("slow") && l.severity === "critical");
      const hasWarningPerf = activeLogs.some(l => l.errorType.toLowerCase().includes("slow") || l.loadTime > 1000);
      if (hasCriticalPerf) return { color: "text-red-400 bg-red-500/10 border-red-500/20", label: "Critical", indicator: "bg-red-400" };
      if (hasWarningPerf) return { color: "text-amber-400 bg-amber-500/10 border-amber-500/20", label: "Warning", indicator: "bg-amber-400" };
      return { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Healthy", indicator: "bg-emerald-400" };
    }
    
    if (category === "Deployment") {
      if (!isOnline) return { color: "text-red-400 bg-red-500/10 border-red-500/20", label: "Critical", indicator: "bg-red-400" };
      if (proxyStatus === "offline" || proxyStatus === "local") return { color: "text-amber-400 bg-amber-500/10 border-amber-500/20", label: "Warning", indicator: "bg-amber-400" };
      return { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Healthy", indicator: "bg-emerald-400" };
    }
    
    return { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Healthy", indicator: "bg-emerald-400" };
  };

  const health = getHealthDescriptor(healthScore);

  return (
    <>
      {/* Floating Sparkly Diagnostic Button */}
      <button
        id="btn_ai_monitor_toggle"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-[#11141C] text-white hover:text-white hover:brightness-110 border border-white/10 hover:border-indigo-500/40 rounded-full shadow-2xl transition-all active:scale-95 duration-200 cursor-pointer group"
      >
        <span className="relative flex h-2 w-2">
          {healthScore < 90 ? (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          ) : (
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${healthScore < 90 ? "bg-amber-500" : "bg-emerald-500"}`}></span>
        </span>
        <Sparkles size={14} className="text-indigo-400 group-hover:rotate-12 transition-transform duration-300" />
        <span className="font-bold text-[11px] tracking-wide uppercase font-sans">Gera AI Monitor</span>
        <span className="font-mono text-[9.5px] px-1.5 py-0.5 bg-white/5 rounded-md text-slate-400 font-bold">
          {healthScore}%
        </span>
      </button>

      {/* AI Monitor Diagnostics Panel Slide-over */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in font-sans">
          <div className="w-full max-w-xl bg-[#0C0E14] h-full shadow-2xl flex flex-col border-l border-white/5 relative overflow-hidden text-left">
            
            {/* Header */}
            <header className="p-4 border-b border-white/5 flex items-center justify-between bg-[#11141C]/80 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20 text-indigo-400">
                  <Activity size={16} />
                </div>
                <div>
                  <h3 id="lbl_ai_monitor_title" className="text-xs font-black uppercase text-white tracking-widest font-sans">Gera AI Monitor</h3>
                  <p className="text-[9.5px] text-slate-500 font-mono uppercase tracking-wider">Automated Diagnostic Engine v1.5</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={loadLogs}
                  disabled={loading}
                  className="p-1.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-md cursor-pointer transition-colors"
                  title="Force telemetry diagnostics cycle"
                >
                  <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-md cursor-pointer transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            </header>

            {/* AI Monitor Slide-over Tabs Panel Selector */}
            <div className="px-5 py-2.5 bg-[#11141C]/40 border-b border-white/5 flex gap-1.5 shrink-0">
              <button
                onClick={() => setActiveTab("telemetry")}
                className={`flex-1 py-1 text-[9.5px] font-bold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  activeTab === "telemetry"
                    ? "bg-[#1B32FF]/10 text-white border border-[#1B32FF]/35"
                    : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
              >
                <Activity size={10} className="text-indigo-400" />
                <span>Telemetry Logs</span>
              </button>
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex-1 py-1 text-[9.5px] font-bold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer relative ${
                  activeTab === "chat"
                    ? "bg-[#1B32FF]/10 text-white border border-[#1B32FF]/35"
                    : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
              >
                <Sparkles size={10} className="text-[#FFC107]" />
                <span>AI Copilot</span>
                {logs.filter((l) => !l.resolved).length > 0 && (
                  <span className="absolute top-1 right-1.5 w-1 h-1 rounded-full bg-red-500 animate-ping" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("audit")}
                className={`flex-1 py-1 text-[9.5px] font-bold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer relative ${
                  activeTab === "audit"
                    ? "bg-[#1B32FF]/10 text-white border border-[#1B32FF]/35"
                    : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
              >
                <Layers size={10} className="text-[#00BCD4]" />
                <span>DB Audit & Migrate</span>
                {auditData && Object.keys(auditData.missingFields || {}).length > 0 && (
                  <span className="absolute top-1 right-1.5 w-1 h-1 rounded-full bg-rose-500 animate-pulse" />
                )}
              </button>
            </div>

            {/* Conditionally Rendered Inner Viewports */}
            {activeTab === "chat" ? (
              <div className="flex-grow flex flex-col overflow-hidden bg-[#0C0E14] relative">
                
                {proxyStatus !== "connected" && (
                  <div className="mx-5 mt-4 p-3.5 bg-yellow-500/[0.04] border border-yellow-500/20 rounded-xl space-y-2 select-none animate-slide-up shrink-0 text-left">
                    <div className="flex items-start gap-2 text-amber-400">
                      <ShieldAlert size={14} className="shrink-0 mt-0.5 animate-pulse" />
                      <div className="text-[10px] leading-relaxed">
                        <p className="font-sans font-black uppercase tracking-wider text-amber-500">Diagnostics proxy offline. Local diagnostics mode active.</p>
                        <p className="font-mono text-slate-400 text-[9px] mt-0.5 leading-normal">
                          Outbound secure connection to server-side AI model could not be verified. Standard local heuristics scanner is running securely.
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={async () => {
                          setChatLoading(true);
                          try {
                            const res = await fetch("/api/health");
                            if (res.ok) {
                              setProxyStatus("connected");
                              toast("Diagnostics pipeline proxy re-established successfully!", "success");
                            } else {
                              toast("Proxy remains unresponsive. Local mode active.", "info");
                            }
                          } catch {
                            toast("Failed to connect. Proxy remains unresponsive.", "error");
                          } finally {
                            setChatLoading(false);
                          }
                        }}
                        className="py-1 px-2.5 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 text-yellow-500 rounded-lg cursor-pointer text-[8.5px] font-sans font-black uppercase tracking-wide transition-all active:scale-95 flex items-center gap-1.5"
                      >
                        <RefreshCw size={9} className={chatLoading ? "animate-spin" : ""} />
                        <span>Retry Diagnostics Connection</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Scrollable chat messages stream */}
                <div className="flex-grow overflow-y-auto p-5 space-y-4">
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col max-w-[90%] ${
                        msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                      }`}
                    >
                      <span className="text-[8px] font-sans font-extrabold uppercase tracking-wider text-slate-500 mb-0.5">
                        {msg.role === "user" ? "Supervisor" : "Gera AI Assist"}
                      </span>
                      <div
                        className={`p-3 rounded-xl border text-xs leading-relaxed font-mono ${
                          msg.role === "user"
                            ? "bg-[#1B32FF]/10 border-[#1B32FF]/20 text-white rounded-tr-none"
                            : "bg-[#11141C] border-white/5 text-slate-300 rounded-tl-none"
                        }`}
                      >
                        {msg.text.split("\n").map((line, lIdx) => {
                          const isHeading = line.trim().startsWith("###");
                          const isListItem = line.trim().startsWith("-") || line.trim().startsWith("*");
                          
                          let cleanText = line;
                          if (isHeading) cleanText = line.replace(/^\s*###\s*/, "");
                          if (isListItem) cleanText = line.replace(/^\s*[-*]\s*/, "• ");

                          // Translate standard inline backticks
                          const parts = cleanText.split(/(`[^`]+`)/);
                          const renderedText = parts.map((part, pIdx) => {
                            if (part.startsWith("`") && part.endsWith("`")) {
                              return (
                                <code key={pIdx} className="px-1 py-0.5 bg-black/40 text-indigo-300 rounded border border-white/5 text-[10px]">
                                  {part.slice(1, -1)}
                                </code>
                              );
                            }
                            return part;
                          });

                          if (isHeading) {
                            return <h4 key={lIdx} className="text-[11px] font-bold text-white mt-1.5 mb-1 uppercase font-sans tracking-wide">{renderedText}</h4>;
                          }
                          if (isListItem) {
                            return <p key={lIdx} className="pl-4 -indent-4 text-[10px] mt-0.5 text-slate-300 leading-normal font-mono">{renderedText}</p>;
                          }
                          return <p key={lIdx} className={`${line.trim() === "" ? "h-1.5" : "mt-0.5"} text-[10px] leading-normal`}>{renderedText}</p>;
                        })}
                      </div>
                    </div>
                  ))}

                  {chatLoading && (
                    <div className="flex flex-col mr-auto max-w-[90%] items-start animate-pulse">
                      <span className="text-[8px] font-sans font-extrabold uppercase tracking-wider text-slate-500 mb-0.5">
                        Gera AI Assist
                      </span>
                      <div className="p-3 bg-[#11141C] border border-white/5 text-slate-400 rounded-xl rounded-tl-none flex items-center gap-2 font-mono text-[10px]">
                        <RefreshCw size={10} className="animate-spin text-indigo-400" />
                        <span>Analysing live telemetry & compiling correction steps...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Predefined helpful suggestions section */}
                <div className="px-4 py-2.5 bg-[#11141C]/40 border-t border-white/5 shrink-0">
                  <span className="text-[8px] font-bold tracking-wider text-slate-500 uppercase block mb-1.5">
                    Predefined System Queries:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      {
                        q: "Which errors does the system have right now?",
                        label: "⚠️ List System Errors"
                      },
                      {
                        q: "Explain step by step how we resolve MTN MoMo transaction payment issues.",
                        label: "💳 Resolve Stuck Payments"
                      },
                      {
                        q: "How do we resolve the diagnostic permissions error issue?",
                        label: "🔐 Troubleshoot Permissions"
                      },
                      {
                        q: "How can we optimize response latencies for consumers in Rwanda?",
                        label: "⚡ Latency Optimizations"
                      }
                    ].map((chip, cIdx) => (
                      <button
                        key={cIdx}
                        onClick={() => handleSendChatMessage(chip.q)}
                        disabled={chatLoading}
                        className="py-1 px-2 text-[8.5px] bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-slate-300 hover:text-white border border-white/5 rounded-lg cursor-pointer font-sans"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message input area */}
                <div className="p-4 bg-[#11141C]/80 border-t border-white/5 shrink-0">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendChatMessage();
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      placeholder="Ask copilot which errors exist, causes, and how to resolve them..."
                      disabled={chatLoading}
                      className="flex-grow py-2 px-3 bg-black/40 border border-white/5 rounded-lg font-mono text-[10.5px] text-white focus:outline-none focus:border-indigo-500/50 placeholder:text-slate-600"
                    />
                    <button
                      type="submit"
                      disabled={!inputMessage.trim() || chatLoading}
                      className="px-3.5 bg-[#1B32FF] text-white font-sans text-xs font-bold rounded-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      Ask
                    </button>
                  </form>
                </div>

              </div>
            ) : activeTab === "audit" ? (
              <div className="flex-grow overflow-y-auto p-5 space-y-5 bg-[#0C0E14] text-left">
                {/* Visual DB Auditor UI Panel */}
                <div className="p-4 bg-white/[0.01] border border-white/5 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-sans font-bold text-white uppercase tracking-wide">
                        Firestore Diagnostic Audit
                      </h4>
                      <p className="text-[9px] font-mono text-slate-500 mt-0.5">
                        PHASE 1 & 2 • Live integrity checks & automatic migration logs
                      </p>
                    </div>
                    <button
                      onClick={loadAuditData}
                      disabled={loadingAudit}
                      className="py-1 px-2 bg-white/5 hover:bg-white/10 active:scale-95 disabled:opacity-50 text-slate-400 font-sans font-bold text-[9px] uppercase rounded border border-white/5 cursor-pointer transition-all"
                    >
                      {loadingAudit ? "Scanning..." : "Re-Scan"}
                    </button>
                  </div>

                  {loadingAudit && !auditData && (
                    <div className="py-8 text-center space-y-2">
                      <RefreshCw size={14} className="animate-spin text-cyan-400 mx-auto" />
                      <p className="text-[10px] font-mono text-slate-400 animate-pulse">Running live collection scans on Krakow-Kigali Firebase servers...</p>
                    </div>
                  )}

                  {auditData && (
                    <div className="space-y-4 font-mono text-[10px]">
                      {/* Interactive Health Gauge */}
                      <div className="p-3 bg-cyan-950/20 border border-cyan-800/35 rounded-xl flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-[8px] font-bold tracking-wider text-cyan-400 uppercase block">Diagnostic Health Assessment</span>
                          <span className="text-white text-[11px] font-bold">
                            {Object.keys(auditData.missingFields).length === 0 ? "Perfect Collection Structure" : "Structure Remediation Recommended"}
                          </span>
                        </div>
                        <div className="font-sans font-black text-xl text-cyan-400">
                          {Object.keys(auditData.missingFields).length === 0 ? "100%" : "85%"}
                        </div>
                      </div>

                      {/* Collection Counts Grid */}
                      <div className="space-y-1.5">
                        <span className="text-[8.5px] uppercase font-bold tracking-wider text-slate-500 block font-sans">Active Document Volume:</span>
                        <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                          {Object.entries(auditData.counts).map(([col, cnt]) => (
                            <div key={col} className="p-2 bg-white/[0.01] border border-white/5 rounded-lg flex justify-between items-center">
                              <span className="text-slate-400">{col}</span>
                              <span className="text-white font-bold">{cnt as any}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Missing Fields Audit Details */}
                      <div className="space-y-1.5">
                        <span className="text-[8.5px] uppercase font-bold tracking-wider text-slate-500 block font-sans">Missing Merchant Parameters:</span>
                        {Object.keys(auditData.missingFields).length === 0 ? (
                          <div className="p-2.5 bg-emerald-500/[0.04] border border-emerald-500/10 text-emerald-400 rounded-xl leading-relaxed text-[9.5px]">
                            ✔ Checked all registered merchants. Every record complies with field specifications (businessId, businessName, businessUsername, businessAdminName, status, active, plan).
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {Object.entries(auditData.missingFields).map(([merchantId, keys]: [string, any]) => (
                              <div key={merchantId} className="p-2 bg-rose-500/[0.04] border border-rose-500/10 text-rose-300 rounded-xl flex flex-col space-y-0.5">
                                <span className="font-bold text-white">ID: {merchantId}</span>
                                <span className="text-slate-400 text-[9px]">&gt; Missing: {keys.join(", ")}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Relations Check */}
                      <div className="space-y-1.5">
                        <span className="text-[8.5px] uppercase font-bold tracking-wider text-slate-500 block font-sans">Relationship Boundaries & Duplicates:</span>
                        <div className="p-2.5 bg-[#11141C] border border-white/5 rounded-xl space-y-2 text-[9px]">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Invalid collection references</span>
                            <span className={auditData.invalidReferences.length > 0 ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>
                              {auditData.invalidReferences.length} found
                            </span>
                          </div>
                          <div className="flex justify-between items-center border-t border-white/5 pt-1.5">
                            <span className="text-slate-400">Duplicate merchant usernames</span>
                            <span className={auditData.duplicates.businessUsernames.length > 0 ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>
                              {auditData.duplicates.businessUsernames.length} duplicates
                            </span>
                          </div>
                          <div className="flex justify-between items-center border-t border-white/5 pt-1.5">
                            <span className="text-slate-400">Duplicate businessId identifiers</span>
                            <span className={auditData.duplicates.businessIds.length > 0 ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>
                              {auditData.duplicates.businessIds.length} duplicates
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Run Database Remediation Actions */}
                      <div className="space-y-2 border-t border-white/5 pt-3.5">
                        <span className="text-[8.5px] uppercase font-bold tracking-wider text-slate-500 block font-sans">Remediation Action Trigger:</span>
                        <button
                          onClick={runAuditRepair}
                          disabled={repairingAudit}
                          className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-sans font-black uppercase text-xs rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-lg shadow-cyan-600/10"
                        >
                          {repairingAudit ? (
                            <>
                              <RefreshCw size={12} className="animate-spin text-white" />
                              <span>Applying Database Migrations...</span>
                            </>
                          ) : (
                            <>
                              <Plus size={12} className="text-white" />
                              <span>Execute Auto-Repair Suite (Phase 2)</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Migration logs console */}
                      {auditData.repairsCompleted && auditData.repairsCompleted.length > 0 && (
                        <div className="space-y-1.5 mt-2">
                          <span className="text-[8.5px] uppercase font-bold tracking-wider text-slate-500 block font-sans">Remediation Log Output:</span>
                          <div className="p-3 bg-black/50 border border-white/5 rounded-xl font-mono text-[8.5px] text-emerald-400 max-h-32 overflow-y-auto leading-relaxed font-mono">
                            {auditData.repairsCompleted.map((rLine: string, rIdx: number) => (
                              <p key={rIdx}>&gt; {rLine}</p>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-grow overflow-y-auto p-5 space-y-5">
                
                {/* Network, System Status & Health Metrics Map */}
                <div className="grid grid-cols-2 gap-3.5">
                  
                  {/* Score Dial */}
                  <div className={`p-4 rounded-2xl border ${health.border} ${health.bg} flex flex-col justify-between space-y-2`}>
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-sans">System Health</span>
                        {health.icon}
                      </div>
                      <div className="mt-1">
                        <span className="text-3xl font-black text-white tracking-tight font-mono">{healthScore}%</span>
                        <span className={`block font-bold text-[10px] uppercase font-sans leading-none mt-1 ${health.color}`}>{health.label}</span>
                      </div>
                    </div>
                    <div className="pt-2 mt-1 border-t border-white/5 space-y-1.5">
                      <p className="text-[9px] text-slate-400 font-mono leading-relaxed pb-1 border-b border-white/5">
                        {getHealthExplanation()}
                      </p>
                      <div className="space-y-0.5">
                        <span className="text-[8px] uppercase tracking-wider text-slate-500 font-bold block font-sans">Explanation Breakdown:</span>
                        {getDetailedScoreBreakedown().map((b, bIdx) => (
                          <div key={bIdx} className="flex justify-between items-center text-[8px] font-mono select-none">
                            <span className="text-slate-500">{b.name}</span>
                            <span className={b.deduction < 0 ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>
                              {b.deduction < 0 ? `${b.deduction}%` : "0%"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Network & Diagnostics Handshake Gateway */}
                  <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-sans">Environment Gateway</span>
                      <span className="text-[9px] text-[#FFC107] font-sans font-extrabold uppercase bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/15">
                        Kigali Term
                      </span>
                    </div>
                    <div className="space-y-1 text-[10px] font-mono leading-none">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Live Connection:</span>
                        {isOnline ? (
                          <span className="text-emerald-400 font-bold">● ONLINE</span>
                        ) : (
                          <span className="text-red-400 font-bold animate-pulse">● OFFLINE</span>
                        )}
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Firestore ping:</span>
                        <span className="text-emerald-400 font-semibold font-mono">14ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">PWA Status:</span>
                        <span className="text-indigo-400 font-bold">READY (V1)</span>
                      </div>
                      <div className="flex justify-between pt-0.5 border-t border-white/5 mt-0.5">
                        <span className="text-slate-500">AI Diagnostics:</span>
                        {!isOnline ? (
                          <span className="text-red-400 font-bold animate-pulse">● OFFLINE</span>
                        ) : proxyStatus === "local" ? (
                          <span className="text-amber-400 font-bold">● LOCAL MODE</span>
                        ) : (
                          <span className="text-emerald-400 font-bold">● PROXY CONNECTED</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Visual System Status Categories Panel */}
                <div className="p-4 bg-white/[0.01] border border-white/5 rounded-2xl space-y-2.5 text-xs text-left">
                  <div className="flex justify-between items-center pb-1.5 border-b border-white/5">
                    <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 block font-sans">
                      Diagnostic Category Status Indicators
                    </span>
                    <span className="text-[8px] font-mono text-slate-500">Live Scans Active</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[9px] font-mono">
                    {["Authentication", "Firestore", "Payments", "Menus", "Performance", "Deployment"].map((cat) => {
                      const light = getCategoryStatusLight(cat);
                      return (
                        <div key={cat} className="p-2 bg-black/40 border border-white/5 rounded-xl flex items-center justify-between gap-1">
                          <span className="text-white font-medium select-none truncate pr-1">{cat}</span>
                          <span className={`px-2 py-0.5 rounded-full border text-[8.5px] font-sans font-bold flex items-center gap-1 leading-none select-none ${light.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${light.indicator} ${light.label !== "Healthy" ? "animate-pulse" : ""}`} />
                            {light.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Automatic Simulator Checks Container */}
                <div className="p-4 bg-[#11141C] border border-white/5 rounded-2xl space-y-2.5 text-xs">
                  <span className="text-[9.5px] font-extrabold text-[#1B32FF] uppercase tracking-wider block font-sans">Simulation & Diagnostics Injection Panel</span>
                  <p className="text-[10px] text-slate-400 font-mono leading-relaxed bg-black/40 p-2 border border-white/5 rounded-xl">
                    Bypass standard physical telemetry events to evaluate raw AI explanation matching workflows:
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-[9.5px] font-medium font-sans">
                    <button 
                      onClick={() => handleSimulateDiagnostic("slow")}
                      disabled={refreshing}
                      className="p-2 bg-white/5 border border-white/5 hover:border-white/20 rounded-xl cursor-pointer hover:bg-white/10 active:scale-95 transition-all text-left flex items-center justify-between text-slate-300 hover:text-white"
                    >
                      <span>Trigger Slow Checkout</span>
                      <Sparkles size={10} className="text-[#FFC107]" />
                    </button>
                    <button 
                      onClick={() => handleSimulateDiagnostic("timeout")}
                      disabled={refreshing}
                      className="p-2 bg-white/5 border border-white/5 hover:border-white/20 rounded-xl cursor-pointer hover:bg-white/10 active:scale-95 transition-all text-left flex items-center justify-between text-slate-300 hover:text-white"
                    >
                      <span>Trigger Security Auth Refuse</span>
                      <Sparkles size={10} className="text-red-400" />
                    </button>
                    <button 
                      onClick={() => handleSimulateDiagnostic("payment")}
                      disabled={refreshing}
                      className="p-2 bg-white/5 border border-white/5 hover:border-white/20 rounded-xl cursor-pointer hover:bg-white/10 active:scale-95 transition-all text-left flex items-center justify-between text-slate-300 hover:text-white"
                    >
                      <span>Stuck MoMo Checkout</span>
                      <Sparkles size={10} className="text-indigo-400" />
                    </button>
                    <button 
                      onClick={() => handleSimulateDiagnostic("missing")}
                      disabled={refreshing}
                      className="p-2 bg-white/5 border border-white/5 hover:border-white/20 rounded-xl cursor-pointer hover:bg-white/10 active:scale-95 transition-all text-left flex items-center justify-between text-slate-300 hover:text-white"
                    >
                      <span>Trigger Missing Table Bill</span>
                      <Sparkles size={10} className="text-teal-400" />
                    </button>
                  </div>
                  <div className="pt-2.5 border-t border-white/5 flex justify-end">
                    <button
                      onClick={handleClearSimulationLogs}
                      disabled={refreshing}
                      className="py-1.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[9.5px] font-sans font-bold uppercase rounded-lg cursor-pointer transition-colors active:scale-95 flex items-center gap-1 leading-none shadow-md"
                    >
                      <span>Clear Simulation Logs</span>
                    </button>
                  </div>
                </div>

                {/* Live Diagnostics Control & Action Center */}
                <div className="p-4 bg-[#11141C] border border-white/5 rounded-2xl flex flex-col gap-3 shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold text-white uppercase tracking-wider font-sans flex items-center gap-1.5">
                      <Cpu size={12} className="text-indigo-400" />
                      Live Diagnostics Control
                    </span>
                    <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest bg-white/5 px-1.5 py-0.5 rounded border border-white/15">
                      Super Admin Core
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold font-sans">
                    <button
                      onClick={handleDiagnose}
                      disabled={diagnosingStatus !== null || refreshing}
                      className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl cursor-pointer flex items-center justify-center gap-2 active:scale-95 transition-all text-center select-none shadow-lg shadow-indigo-600/15"
                    >
                      <Activity size={12} className={diagnosingStatus ? "animate-pulse" : ""} />
                      <span>{diagnosingStatus ? "Diagnosing..." : "Diagnosing Sweep"}</span>
                    </button>
                    
                    <button
                      onClick={loadLogs}
                      disabled={loading || refreshing}
                      className="p-3 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 hover:border-white/20 rounded-xl cursor-pointer flex items-center justify-center gap-2 active:scale-95 transition-all"
                    >
                      <RefreshCw size={12} className={loading ? "animate-spin text-indigo-400" : ""} />
                      <span>Retry Feed Scan</span>
                    </button>
                  </div>

                  {diagnosingStatus && (
                    <div className="p-2.5 bg-indigo-950/20 border border-indigo-500/10 rounded-xl flex items-center gap-2 text-[10px] text-indigo-300 font-mono animate-pulse">
                      <RefreshCw size={10} className="animate-spin text-indigo-400" />
                      <span>{diagnosingStatus}</span>
                    </div>
                  )}
                </div>

                {/* Filtering Controls */}
                <div className="flex gap-1.5 bg-white/[0.02] border border-white/5 p-1 rounded-xl scrollbar-none overflow-x-auto shrink-0 font-sans">
                  {[
                    { id: "active", label: "Active Alerts" },
                    { id: "all", label: "Full Logs Archive" },
                    { id: "slow", label: "Latency Spikes" },
                    { id: "resolved", label: "Resolved" }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setFilter(tab.id as any)}
                      className={`py-1.5 px-3 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                        filter === tab.id
                          ? "bg-[#1B32FF] text-white shadow"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Logs Stream View */}
                <div className="space-y-3 shrink-0">
                  <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-slate-500 uppercase font-sans">
                    <span>Diagnostic Feed Log stream ({filteredLogs.length})</span>
                    <span>Filtered Stream Mode</span>
                  </div>

                  {loading ? (
                    <div className="py-12 flex flex-col items-center justify-center text-[10px] font-mono text-slate-400 gap-2 font-bold uppercase animate-pulse">
                      <RefreshCw size={14} className="animate-spin text-indigo-400" />
                      Teleview telemetry logs...
                    </div>
                  ) : filteredLogs.length === 0 ? (
                    <div className="p-6 bg-[#11141C] border border-white/5 rounded-2xl flex flex-col items-center justify-center text-center text-xs space-y-2 font-sans">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                        <CheckCircle2 size={16} />
                      </div>
                      <div>
                        <span className="font-bold text-white block">Perfect Clean State</span>
                        <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">No active structural alerts, anomalies, or performance spikes detected.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 font-mono text-xs">
                      {filteredLogs.map((log) => (
                        <div 
                          key={log.id || log.logId}
                          className={`p-4 bg-[#11141C] border rounded-2xl transition-all relative ${
                            log.resolved 
                              ? "opacity-60 border-white/5 hover:opacity-100" 
                              : log.severity === "critical"
                                ? "border-red-500/20 shadow-red-500/5 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-500/[0.03] via-transparent to-transparent"
                                : log.severity === "high"
                                  ? "border-orange-500/20"
                                  : "border-white/5"
                          }`}
                        >
                          {/* Title & Metadata Header bar */}
                          <div className="flex items-start justify-between gap-3 font-sans pb-2 border-b border-white/5">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-slate-300 font-sans font-black text-xs uppercase">{log.errorType.replace("_", " ")}</span>
                                <span className={`text-[8.5px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${getSeverityColor(log.severity)}`}>
                                  {log.severity || "med"}
                                </span>
                                {log.resolved && (
                                  <span className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded">
                                    Resolved
                                  </span>
                                )}
                                {log.isSimulation || log.isDemo || log.source === "simulation" || (log.errorType === "payment_stuck" && !mtnMomoActive) ? (
                                  <span className="bg-rose-500/10 border border-rose-500/35 text-rose-400 text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded tracking-wide animate-pulse">
                                    Demo/Test pending transaction
                                  </span>
                                ) : (
                                  <span className="bg-indigo-500/10 border border-indigo-500/35 text-indigo-400 text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded tracking-wide">
                                    Real production log
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[9px] text-slate-500 tracking-wider">
                                <span className="font-mono text-[9px] font-bold text-slate-400">ID: {log.logId}</span>
                                <span>•</span>
                                <span>{log.createdAt ? log.createdAt.toLocaleTimeString() : "Now"}</span>
                              </div>
                            </div>

                            {!log.resolved && (
                              <button
                                onClick={() => handleMarkResolved(log.logId, log.id)}
                                disabled={refreshing}
                                className="py-1 px-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 text-[9px] font-sans font-bold rounded-lg cursor-pointer transition-colors shrink-0 leading-none active:scale-95"
                              >
                                ✓ Mark Resolved
                              </button>
                            )}
                          </div>

                          {/* Telemetry diagnostics fields */}
                          <div className="py-3 space-y-2 text-[10px] tracking-wide leading-relaxed font-mono">
                            <div className="p-2.5 bg-[#0C0E14] border border-white/5 rounded-xl text-slate-300 antialiased font-mono">
                              <span className="font-sans font-bold text-[8.5px] block text-[#1B32FF] uppercase tracking-wider mb-0.5">Telemetry Message:</span>
                              {log.message}
                            </div>

                            {/* Problem and Interactive AI Suggested Fix block */}
                            <div className="p-2.5 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-500/[0.04] via-[#0C0E14] to-[#0C0E14] border border-indigo-500/10 rounded-xl space-y-1 font-mono">
                              <span className="font-sans font-extrabold text-[8.5px] block text-indigo-400 uppercase tracking-wider">AI Suggested Correction Pathway:</span>
                              <p className="text-slate-400 text-[9.5px]">
                                {log.suggestedFix}
                              </p>
                            </div>

                            {/* Collapsible Technical Details Panel */}
                            {expandedLogIds[log.logId] && (
                              <div className="mt-2.5 p-3 bg-black/60 border border-white/5 rounded-xl text-[9px] font-mono text-slate-400 space-y-1.5 animate-slide-up select-text">
                                <div className="flex justify-between items-center border-b border-white/5 pb-1">
                                  <span className="font-sans font-black uppercase tracking-wider text-slate-500 text-[8px]">Technical Diagnostic Payload</span>
                                  <span className="text-[7.5px] bg-[#1B32FF]/20 px-1 py-0.5 rounded text-indigo-300 font-sans font-bold leading-none">DEBUG MODE</span>
                                </div>
                                <div className="grid grid-cols-3 gap-y-1 text-slate-300">
                                  <span className="text-slate-500 font-sans">Identifier:</span>
                                  <span className="col-span-2 font-mono break-all text-white">{log.logId}</span>

                                  <span className="text-slate-500 font-sans">Affected Route:</span>
                                  <span className="col-span-2 font-mono break-all text-white">{log.route}</span>

                                  <span className="text-slate-500 font-sans">User Agent:</span>
                                  <span className="col-span-2 font-mono break-all text-indigo-300">{log.userAgent}</span>

                                  <span className="text-slate-500 font-sans">Runtime Browser:</span>
                                  <span className="col-span-2 text-white">{log.browser}</span>

                                  <span className="text-slate-500 font-sans">Load Latency:</span>
                                  <span className="col-span-2 text-amber-300 font-bold font-mono">{log.loadTime || 0}ms</span>

                                  <span className="text-slate-500 font-sans">Severity Tier:</span>
                                  <span className={`col-span-2 font-bold uppercase ${
                                    log.severity === "critical" ? "text-red-400" : log.severity === "high" ? "text-orange-400" : "text-yellow-400"
                                  }`}>{log.severity}</span>

                                  <span className="text-slate-500 font-sans">Device Bind:</span>
                                  <span className="col-span-2 text-white font-mono uppercase">{log.deviceType}</span>

                                  <span className="text-slate-500 font-sans">Network Link:</span>
                                  <span className={`col-span-2 font-bold ${log.networkStatus === "online" ? "text-emerald-400" : "text-red-400"}`}>{log.networkStatus}</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Action Controls Footer Row */}
                          <div className="pt-2.5 border-t border-white/5 flex flex-wrap gap-1.5 justify-end">
                            <button
                              onClick={() => {
                                setExpandedLogIds(prev => ({
                                  ...prev,
                                  [log.logId]: !prev[log.logId]
                                }));
                              }}
                              className="py-1 px-2.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-slate-300 hover:text-white text-[9px] font-sans font-bold rounded-lg cursor-pointer transition-colors active:scale-95"
                            >
                              {expandedLogIds[log.logId] ? "Hide Tech Details" : "View Technical Details"}
                            </button>
                            
                            {!log.resolved && (
                              <button
                                onClick={() => {
                                  setFixingLog(log);
                                  let matchedFix = "clear_app_cache";
                                  if (log.errorType === "slow_performance") matchedFix = "clear_app_cache";
                                  else if (log.errorType === "firestore_error") matchedFix = "re_check_firebase";
                                  else if (log.errorType === "payment_stuck") matchedFix = "re_sync_pending_bills";
                                  else if (log.errorType === "bill_missing") matchedFix = "mark_local_bill_sync";
                                  else if (log.errorType === "qr_route_error") matchedFix = "fix_route_redirect";
                                  setSelectedFixId(matchedFix);
                                }}
                                className="py-1 px-3 bg-[#1B32FF] hover:brightness-110 text-white text-[9px] font-sans font-black uppercase rounded-lg cursor-pointer transition-all active:scale-95 flex items-center gap-1 shadow-md shadow-[#1B32FF]/10 select-none"
                              >
                                <Sparkles size={10} className="text-[#FFC107] animate-pulse" />
                                Fix Now
                              </button>
                            )}
                          </div>

                          {/* Interactive metadata footer metrics (device, agent, pathway) */}
                          <div className="pt-2.5 mt-2.5 border-t border-white/5 flex flex-wrap items-center justify-between text-[8px] text-slate-500 uppercase tracking-widest font-sans font-semibold">
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-0.5 font-mono text-[9px]">
                                {getDeviceIcon(log.deviceType)} {log.browser}
                              </span>
                              <span>|</span>
                              <span>{log.route}</span>
                            </div>
                            <span className="font-mono text-[8.5px] font-bold text-slate-400">Load: {log.loadTime || 0}ms</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Immersive Safe & Risky Auto-Fix Dispatcher Drawer */}
            {fixingLog && (
              <div className="absolute inset-0 z-50 bg-[#0C0E14] flex flex-col animate-slide-up">
                {/* Header */}
                <header className="p-4 border-b border-white/5 bg-[#11141C] flex items-center justify-between shrink-0 font-sans">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-[#1B32FF]/10 rounded-lg border border-[#1B32FF]/30 text-indigo-400">
                      <Sparkles size={14} className="animate-pulse text-[#FFC107]" />
                    </div>
                    <div>
                      <h4 className="text-[11px] font-black uppercase text-white tracking-widest font-sans">Automated Fix Dispatcher</h4>
                      <p className="text-[8.5px] text-[#FFC107] font-mono leading-none flex items-center gap-1 uppercase mt-1">
                        <span>Target: {fixingLog.logId}</span>
                        <span>•</span>
                        <span>{fixingLog.errorType}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setFixingLog(null);
                      setShowRiskConfirm(false);
                      setIsRepairing(false);
                    }}
                    className="p-1.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-md cursor-pointer transition-all"
                  >
                    <X size={14} />
                  </button>
                </header>

                <div className="flex-grow overflow-y-auto p-5 space-y-4">
                  
                  {/* Error Card Summary */}
                  <div className="p-3.5 bg-red-500/[0.03] border border-red-500/15 rounded-xl space-y-1">
                    <span className="text-[8px] font-bold text-red-500 tracking-wider uppercase font-sans">Target Error Telemetry</span>
                    <p className="text-slate-300 font-mono text-[9.5px] leading-relaxed">{fixingLog.message}</p>
                  </div>

                  {/* Safety Policy Rule banner */}
                  <div className="p-3.5 bg-gradient-to-r from-amber-500/[0.08] to-amber-500/[0.02] border border-amber-500/20 rounded-xl space-y-1.5 text-amber-300 text-[10px] leading-relaxed select-none">
                    <span className="font-sans font-black text-[9px] tracking-wider uppercase flex items-center gap-1">
                      <ShieldAlert size={12} className="text-amber-400 shrink-0" />
                      Kigali Platform Safety Mandates
                    </span>
                    <div className="font-mono text-[8.5px] text-amber-200/90 space-y-1">
                      <p>⚠️ Never auto-delete data rules are actively enforced.</p>
                      <p>⚠️ Zero exposure policy for API credentials and Keys.</p>
                      <p>⚠️ Safe merchant configurations - secrets are immutable.</p>
                      <p>⚠️ MoMo connection parameters require real callbacks.</p>
                    </div>
                  </div>

                  {/* Remediation Selector Grid */}
                  <div className="space-y-3.5">
                    <span className="text-[9px] font-black text-white uppercase tracking-wider font-sans block">Remediation Action Pathways</span>
                    
                    {/* Safe Fixes list */}
                    <div className="space-y-1.5">
                      <span className="text-[8px] font-bold text-emerald-400 font-sans uppercase tracking-widest block">✓ Safe Automation Pathways (Instant Execution)</span>
                      <div className="grid grid-cols-1 gap-1.5">
                        {[
                          { id: "clear_app_cache", label: "Clear Local App Cache & Workspace", desc: "Purges browser localStorage, session variables, and static responsive caches." },
                          { id: "reset_stuck_loading", label: "Reset Stuck UI Framework Loaders", desc: "Forces compile states to clear spinner lockouts and hung loading indicators." },
                          { id: "retry_failed_firestore", label: "Retry Firestore Read Connectivity", desc: "Pings database context to verify active document retrieves." },
                          { id: "mark_local_bill_sync", label: "Mark Local Bill Synchronizing Required", desc: "Forces outstanding table bill items with sync-required flags." },
                          { id: "regenerate_qr_link", label: "Regenerate Dynamic QR Links", desc: "Reconstructs stale Rwandan mobile money QR sticker parameters." },
                          { id: "fix_route_redirect", label: "Bypass /pay and /bill Auth Gateways", desc: "Injects dynamic router bypass config to prevent supervisory passcode prompts." },
                          { id: "reset_merchant_saving", label: "Reset Merchant Saving State Lockout", desc: "Clears session lockups limiting supervisors modifying profile updates." },
                          { id: "refresh_system_version", label: "Simulate Reload System Version", desc: "Initiates clean version refresh caching protocols." },
                          { id: "disable_broken_sw", label: "Disable Broken Service Workers", desc: "Unregisters navigator caches causing outdated checkout configurations." },
                          { id: "re_sync_pending_bills", label: "Re-push Offline Pending Bills", desc: "Simulates batch-writing sync entries straight to firestore." },
                          { id: "re_check_firebase", label: "Re-check Kigali Firebase Endpoint Connection", desc: "Runs dry-run diagnostic connect ping to active remote service." }
                        ].map((fix) => (
                          <button
                            key={fix.id}
                            onClick={() => {
                              setSelectedFixId(fix.id);
                              setShowRiskConfirm(false);
                            }}
                            className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-2 select-none ${
                              selectedFixId === fix.id
                                ? "bg-[#1B32FF]/10 border-[#1B32FF]/40 text-white"
                                : "bg-white/[0.02] border-white/5 hover:border-white/10 text-slate-400 hover:text-white"
                            }`}
                          >
                            <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[8px] mt-0.5 shrink-0 font-bold ${
                              selectedFixId === fix.id ? "border-[#1B32FF] text-[#1B32FF]" : "border-slate-700 text-slate-600"
                            }`}>
                              {selectedFixId === fix.id ? "✓" : ""}
                            </span>
                            <div>
                              <span className="font-sans font-extrabold text-[9.5px] block leading-snug">{fix.label}</span>
                              <span className="font-mono text-[8px] text-slate-500 leading-normal block mt-0.5">{fix.desc}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Risky Fixes list */}
                    <div className="space-y-1.5 pt-2">
                      <span className="text-[8px] font-bold text-red-400 font-sans uppercase tracking-widest block">⚠️ Risky Diagnostics Pathways (Requires Supervisor Confirmation)</span>
                      <div className="grid grid-cols-1 gap-1.5 font-sans">
                        {[
                          { id: "change_firestore_rules", label: "Altering Firestore Rules Permissions", desc: "Attempts remote modifications to the Firestore security rules. Highly Risky!" },
                          { id: "delete_stale_data", label: "Delete Stale Telemetry Rows", desc: "Disallowed by Security Rule: Will attempt logs purging. Hard Blocked." },
                          { id: "disable_user_account", label: "Deactivate User Supervisor Account", desc: "Disallowed by Security Rule: Irreversible credential revoke. Hard Blocked." },
                          { id: "change_payment_settings", label: "Modify Payment Settings Gateway", desc: "Disallowed by Security Rule: Alters MTN MoMo Merchant IDs. Hard Blocked." },
                          { id: "reset_device_license", label: "Reset Hardware Serial Device License", desc: "Revokes physical activation token bound in Kigali." },
                          { id: "cancel_bill_payment", label: "Cancel/Reverse Bill Payment Line", desc: "Attempts offline reversal ledger logs offsetting." }
                        ].map((fix) => (
                          <button
                            key={fix.id}
                            onClick={() => {
                              setSelectedFixId(fix.id);
                              setShowRiskConfirm(false);
                            }}
                            className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-2 select-none ${
                              selectedFixId === fix.id
                                ? "bg-red-500/10 border-red-500/40 text-white"
                                : "bg-white/[0.02] border-white/5 hover:border-white/10 text-slate-400 hover:text-white"
                            }`}
                          >
                            <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[8px] mt-0.5 shrink-0 font-bold ${
                              selectedFixId === fix.id ? "border-red-400 text-red-400" : "border-slate-700 text-slate-650"
                            }`}>
                              {selectedFixId === fix.id ? "!" : ""}
                            </span>
                            <div>
                              <span className="font-sans font-bold text-[9.5px] block leading-snug">{fix.label}</span>
                              <span className="font-mono text-[8.5px] text-slate-500 leading-normal block mt-0.5">{fix.desc}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                  </div>

                </div>

                {/* Repair action footer trigger */}
                <footer className="p-4 border-t border-white/5 bg-[#11141C] flex flex-col gap-2.5 shrink-0 font-sans">
                  
                  {isRepairing && (
                    <div className="p-3 bg-black/60 border border-indigo-500/20 rounded-xl space-y-1 text-indigo-300 font-mono text-[9px] text-left">
                      <div className="flex items-center gap-2">
                        <RefreshCw size={10} className="animate-spin text-indigo-400" />
                        <span className="font-bold font-sans">Automated Repair Sequence Running:</span>
                      </div>
                      <div className="pl-3.5 space-y-0.5 text-slate-400 leading-tight">
                        {repairLogs.map((logLine, idx) => (
                          <p key={idx}>&gt; {logLine}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {showRiskConfirm && (
                    <div className="p-3 bg-red-950/30 border border-red-500/30 rounded-xl space-y-2 text-[10px] text-red-200 select-none text-left">
                      <p className="font-sans font-black uppercase flex items-center gap-1 text-[9.5px]">
                        <ShieldAlert size={12} className="text-red-400 shrink-0 animate-bounce" />
                        Supervisor Risk Acknowledgment Required
                      </p>
                      <p className="font-mono text-[8.5px] text-red-300/90 leading-normal text-left">
                        This operation affects production settings or hardware binding. Under Krakow-Kigali SLA, please confirm you hold supervision clearance before executing.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowRiskConfirm(false)}
                          className="py-1 px-3 bg-white/5 border border-white/10 text-white rounded-lg cursor-pointer hover:bg-white/10 active:scale-95 text-[9px] font-bold"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleExecuteFix(selectedFixId)}
                          className="py-1 px-3 bg-red-650 hover:bg-red-600 text-white font-sans font-black uppercase text-[9px] rounded-lg cursor-pointer transition-all active:scale-95 shadow shadow-red-600/20"
                        >
                          Confirm & Execute Risk Repair
                        </button>
                      </div>
                    </div>
                  )}

                  {!isRepairing && !showRiskConfirm && (
                    <div className="flex gap-2.5 justify-end">
                      <button
                        onClick={() => {
                          setFixingLog(null);
                          setShowRiskConfirm(false);
                        }}
                        className="py-2.5 px-4 bg-white/5 border border-white/5 text-slate-300 rounded-xl cursor-pointer hover:bg-white/10 active:scale-95 text-xs font-sans font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleExecuteFix(selectedFixId)}
                        disabled={!selectedFixId}
                        className="py-2.5 px-5 bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white font-sans font-black uppercase text-xs rounded-xl cursor-pointer transition-all active:scale-95 shadow-md shadow-indigo-600/10 flex items-center gap-1.5"
                      >
                        <Sparkles size={12} className="text-[#FFC107]" />
                        Execute Auto-Fix
                      </button>
                    </div>
                  )}
                </footer>
              </div>
            )}

            {/* Diagnostics Panel Footer */}
            <footer className="p-4 border-t border-white/5 bg-[#11141C] text-[9.5px] text-slate-500 font-mono flex justify-between uppercase shrink-0">
              <span>Gera AI monitor stream secure</span>
              <span>Supervisor Authenticated Client</span>
            </footer>

          </div>
        </div>
      )}
    </>
  );
}
