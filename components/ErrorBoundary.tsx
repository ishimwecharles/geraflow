import React from "react";
import { QrCode, AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[GeraPay Custom Crash Gate] Caught react render crash:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleResetCache = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/";
    } catch (e) {
      console.error("Failed to safely reset browser storage cache:", e);
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      const ua = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
      const isWhatsApp = /WhatsApp/i.test(ua);

      return (
        <div className="min-h-screen bg-[#0C0E14] text-slate-200 flex flex-col items-center justify-center p-4 font-sans select-none relative overflow-hidden">
          {/* Ambient background accent */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,#1b32ff18_0%,transparent_50%)] pointer-events-none" />

          <div className="w-full max-w-md bg-[#11141C] border border-white/10 rounded-[32px] p-6 text-center space-y-6 shadow-2xl relative z-10 animate-fade-in">
            {/* Error header icon banner */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center">
                  <AlertTriangle size={28} className="animate-pulse" />
                </div>
                <span className="absolute -bottom-1 -right-1 bg-yellow-500 text-slate-900 border-2 border-[#11141C] w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black font-mono">
                  ⚠️
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-base font-extrabold text-white uppercase tracking-tight">System Crash Recovered</h2>
              <p className="text-xs text-slate-400 leading-relaxed font-sans max-w-sm mx-auto">
                An unexpected user interface exception was handled. This usually occurs under strict iOS Safari cookie containment or when third-party embedded webviews (like WhatsApp) restrict features.
              </p>
            </div>

            {/* Diagnostic Information */}
            <div className="p-3 bg-[#151922] border border-white/5 rounded-2xl text-left space-y-2.5">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 uppercase tracking-wider border-b border-white/5 pb-1.5">
                <span>📱 Device Signatures</span>
                <span className="text-indigo-400 font-bold">{isIOS ? "iOS Safari" : "Standard Web"}</span>
              </div>
              <div className="space-y-1 font-mono text-[9px] text-slate-400 leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-24">
                <p><strong>UA:</strong> {ua}</p>
                <p><strong>WhatsApp Webview:</strong> {isWhatsApp ? "DETECTED" : "NO"}</p>
                <p><strong>Error:</strong> {this.state.error?.toString() || "Unknown rendering exception"}</p>
              </div>
            </div>

            {/* Actions for user recovery */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-[#1B32FF] hover:brightness-110 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer font-sans"
              >
                <RefreshCw size={13} className="animate-spin" style={{ animationDuration: "3s" }} /> Retry Application Initialization
              </button>

              <button
                type="button"
                onClick={this.handleResetCache}
                className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 font-bold border border-red-500/15 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer font-sans"
              >
                <Trash2 size={13} /> Reset Browser Storage Cache & Purge State
              </button>
            </div>

            <div className="flex items-center justify-center gap-2 text-[9px] text-slate-500 font-mono pt-2 border-t border-white/5">
              <QrCode size={11} />
              <span>GERA PAY EMERGENCY FAILSAFE SYSTEM</span>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
