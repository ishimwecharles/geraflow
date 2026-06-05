const memoryStore: Record<string, string> = {};

export const safeLocalStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn(`[GeraPay Storage] Reading key "${key}" from localStorage failed, using memory in-fallback:`, e);
      return memoryStore[key] || null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[GeraPay Storage] Writing key "${key}" to localStorage failed, using memory fallback:`, e);
      memoryStore[key] = value;
    }
  },

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[GeraPay Storage] Removing key "${key}" from localStorage failed, using memory fallback:`, e);
      delete memoryStore[key];
    }
  }
};

export function safeCopyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text)
      .then(() => true)
      .catch((err) => {
        console.warn("[GeraPay Storage] Standard clipboard system failed, trying fallback:", err);
        return fallbackCopyToClipboard(text);
      });
  }
  return Promise.resolve(fallbackCopyToClipboard(text));
}

function fallbackCopyToClipboard(text: string): boolean {
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    // Position fixed and off-screen
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error("[GeraPay Storage] Fallback copy failed:", err);
    return false;
  }
}

