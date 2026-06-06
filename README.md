# Gera Flow 🇷🇼 — Rwanda Merchant QR Payment & Diagnostics Gateway

Gera Flow is a full-stack, enterprise-ready merchant payment QR-code gateway featuring interactive MTN Mobile Money (MoMo) Rwanda simulation, automated diagnostic tracking, cashier sub-accounts, real-time feedback portals, and customizable digital menus for businesses in Rwanda.

This system is built using **React 19**, **Vite**, **Express**, and **Firebase** (Firestore + Authentication). It is fully optimized for local development, production self-hosting, or cloud container services (such as Google Cloud Run).

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
Ensure you have Node.js Installed (v18+ recommended):
```bash
npm install
```

### 2. Configure Environment Variables
Copy the template configuration file:
```bash
cp .env.example .env
```
And populate your preferred credentials (such as `GEMINI_API_KEY` for AI Diagnostics context and optional MTN merchant sandbox keys).

### 3. Start Development Server
```bash
npm run dev
```
The server will boot on `http://localhost:3000` with hot-reloading active for both client assets and backend Express API services.

---

## ⚙️ Configuration & Production Export

Gera Flow supports both unified local properties configuration and strict environment variables injection.

### A. Client-Side Firebase Configuration
Client settings are read in `src/lib/firebase.ts`. By default, they read from `firebase-applet-config.json`. To run in a clean production pipeline without exposing configurations inside your repository, define the following variables in your host container or `.env` file:

```env
VITE_FIREBASE_API_KEY="AIzaSy..."
VITE_FIREBASE_AUTH_DOMAIN="gera-flow.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="gera-flow"
VITE_FIREBASE_STORAGE_BUCKET="gera-flow.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="165070670210"
VITE_FIREBASE_APP_ID="1:165070670210:web:4260e..."
VITE_FIREBASE_MEASUREMENT_ID=""
VITE_FIREBASE_FIRESTORE_DATABASE_ID="" # Optional (for named Firestore instances)
```

### B. Server-Side Firebase Admin SDK (Self-Hosting outside GCP)
When hosted outside Google Cloud Platform, the backend server requires authorization to write back to Firestore (log telemetry database nodes, auto-provision businesses, or query subaccounts). Configure the Admin SDK using standard Service Account parameters:

```env
FIREBASE_PROJECT_ID="gera-flow"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@gera-flow.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7...\n-----END PRIVATE KEY-----\n"
```

---

## 🔒 Firebase Security Rules

Database paths (`clients/`, `businesses/`, `devices/`, `menuSections/`, `menuProducts/`, `systemLogs/`, etc.) are secured using strict Zero-Trust ABAC principles in `firestore.rules`.

Before publishing live, compile your updated schemas and upload rules directly to your Firebase Project:
```bash
# Verify security constraints structure
npm run lint

# Deploy client rules directly via Firebase CLI if installed globally
firebase deploy --only firestore:rules
```

---

## 🏗️ Build & Deployment Steps

To package Gera Flow into production-ready assets:

### 1. Compile Client Apps and Bundle Server
This triggers raw Vite production packaging, rendering standard HTML/JS outputs in `dist/`, and uses `esbuild` to compile `server.ts` into a self-contained CommonJS runtime `dist/server.cjs` (resolving TypeScript declarations and relative dependencies):
```bash
npm run build
```

### 2. Launch Standalone Server
```bash
npm run start
```
The application will listen on port `3000` (binding to `0.0.0.0` for ingress proxy setups).

---

## 🛠️ Key Features Built-In

1. **MoMo Kigali Gateway Simulator**: Real request-to-pay push notifications flow alongside local mocks to safeguard continuous merchant checkouts even when offline or in sandbox status.
2. **On-The-Fly Merchant Provisioning**: Entering a non-existing Business ID automatically builds structured menu sections, sample brochette items, and cashier loggers instantly so clients are never stopped by database cold starts.
3. **Automated AI Audit Copilot**: Powered by Gemini 3.5, the interactive dashboard chat analyzes Firestore logs and MTN gateway queries, delivering precise technical logs diagnostics inside Rwanda's digital payments infrastructure.
