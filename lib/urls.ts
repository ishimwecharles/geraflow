export const PUBLIC_APP_URL = "https://gera-pay-qr-963704237663.europe-west2.run.app";

/**
 * Gets a production-safe URL for any route/path.
 * 1. Generate URLs using window.location.origin only if origin is on the production domain.
 * 2. If origin contains aistudio.google.com, localhost or dev preview terms, replace it with the production domain.
 */
export function getPublicUrl(path: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const productionDomain = PUBLIC_APP_URL;

  // Clean path to remove leading/trailing slashes
  const cleanPath = path.replace(/^\/+|\/+$/g, "");

  // If origin is exactly production, use origin
  if (origin && origin.includes("gera-pay-qr-963704237663.europe-west2.run.app")) {
    return `${origin}/${cleanPath}`;
  }

  // If origin is preview/localhost, use production URL
  if (
    origin && 
    (origin.includes("aistudio.google.com") || 
     origin.includes("googleusercontent") || 
     origin.includes("ais-dev") || 
     origin.includes("ais-pre") ||
     origin.includes("localhost") ||
     origin.includes("127.0.0.1"))
  ) {
    return `${productionDomain}/${cleanPath}`;
  }

  // Fallback to production URL for safety to comply with instructions
  return `${productionDomain}/${cleanPath}`;
}

/**
 * Business Access QR: /client-login?businessId={businessId}
 */
export function getBusinessAccessUrl(businessId: string): string {
  return getPublicUrl(`client-login?businessId=${businessId}`);
}

/**
 * Payment QR: /pay/{businessId} or /international/{businessId}
 */
export function getPaymentUrl(businessId: string, type: "standard" | "international" = "standard"): string {
  const pathPrefix = type === "international" ? "international" : "pay";
  return getPublicUrl(`${pathPrefix}/${businessId}`);
}

/**
 * Menu QR: /menu/{businessId}
 */
export function getMenuUrl(businessId: string): string {
  return getPublicUrl(`menu/${businessId}`);
}

/**
 * Bill QR: /bill/{billId}
 */
export function getBillUrl(billId: string): string {
  return getPublicUrl(`bill/${billId}`);
}
