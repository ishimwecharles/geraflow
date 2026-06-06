# Gera Pay QR - Security Architecture Specification (Phase 0)

This document maps out the Attribute-Based Access Control (ABAC) rules and data invariants for Gera Pay QR's secure enterprise configuration mode.

## 1. Core Data Invariants

1. **Hierarchy Isolation Partitioning**: 
   - A `user` (staff/cashier/waiter) or a `device` belongs to exactly one `businessId` (which maps synonymously to a `clientId`).
   - A business admin/cashier/waiter is only authorized to read, create, list, or modify documents that strictly match their own `businessId`.
   - Waiter accounts have zero permissions to mark any bills as resolved (`paid`).
   - The Super Admin (`ishimwecharles2525@gmail.com`) is the global supervisor, possessing complete unrestricted bypass privileges.

2. **Hardware Density Limits (Device Lock)**:
   - A new device registration is strictly blocked if the total count of active devices for that `businessId` meets/exceeds the authorized `maxDevices` limit set by the Super Admin.

3. **Temporal Integrity Constraints**:
   - `createdAt` is immutable.
   - All client timestamp registrations (`createdAt`, `updatedAt`, `lastSeen`) must correspond strictly to the server timestamp (`request.time`).

4. **Security Isolation (Identity / PII)**:
   - Credentials (e.g. passwords/PINs) stored in the `users` collection cannot be scanned by arbitrary users. Standard list queries on the `users` collection are strictly restricted.

---

## 2. The "Dirty Dozen" Malicious Payloads

The following malicious payloads must return `PERMISSION_DENIED` at the Firestore firewall layer:

### Vector 1: Identity Spoofing & RBAC Privilege Escalation
#### Payload 1.1: Standard user attempts self-promotion to Super Admin
- **Attempt**: A registered business cashier attempts to promote their role to `super_admin`.
- **Target Collection**: `users/{userId}`
- **Payload**:
```json
{
  "uid": "waiter-123",
  "email": "waiter@kigalispring.rw",
  "role": "super_admin",
  "businessId": "GP-5555",
  "active": true,
  "createdAt": "2026-05-27T08:00:00Z"
}
```

#### Payload 1.2: Cross-Tenant Data Hijacking
- **Attempt**: A business admin from `GP-1111` attempts to modify staff fields database of `GP-2222`.
- **Target Collection**: `users/waiter-GP-2222`
- **Payload**:
```json
{
  "businessId": "GP-1111",
  "role": "business_admin",
  "active": true
}
```

---

### Vector 2: State Step Shortcutting & Ledger Poisoning
#### Payload 2.1: Waiter attempts direct payment authorization (Status Cheat)
- **Attempt**: A waiter attempts to directly set an unpaid restaurant bill to `paid`, bypassing cashier oversight.
- **Target Collection**: `bills/{billId}`
- **Payload**:
```json
{
  "status": "paid",
  "paidAt": "2026-05-27T08:00:00Z",
  "paymentMethod": "free_pass_exploit"
}
```

#### Payload 2.2: Price Manipulation (Subtotal Poisoning)
- **Attempt**: A customer/staff attempts to overwrite a bill's total item sum with a negative subtotal.
- **Target Collection**: `bills/{billId}`
- **Payload**:
```json
{
  "totalAmount": -150000,
  "subtotal": -150000,
  "status": "unpaid"
}
```

---

### Vector 3: Hardware Density Overrun (Device Exploits)
#### Payload 3.1: Forged Device Registration
- **Attempt**: A locked user tries to bypass `maxDevices` constraint by forging an active device status belonging to another merchant.
- **Target Collection**: `devices/{deviceId}`
- **Payload**:
```json
{
  "deviceId": "HACKED-DEV-999",
  "userId": "unknown-uid",
  "businessId": "GP-FORGETENANT",
  "active": true,
  "role": "business_admin"
}
```

#### Payload 3.2: Rogue Device Suffix Extension
- **Attempt**: A malicious script attempts to register an active device with sub-elements that override hardware signatures.
- **Target Collection**: `devices/{deviceId}`
- **Payload**:
```json
{
  "deviceId": "DEVICE-LIMIT-OVERFLOW",
  "active": true,
  "maxDevicesAllowedOverride": 99999
}
```

---

### Vector 4: PII Harvesting & Database Leakage
#### Payload 4.1: Unauthenticated staff scanning staff emails
- **Attempt**: A waiter attempts a blanket list query to harvest credentials and emails of waitstaff at other Kigali stores.
- **Target Collection**: `users` (blanket scan)
- **Query**: `db.collection('users').get()`

#### Payload 4.2: Direct retrieval of credentials without specific ID mapping
- **Attempt**: A client browser requests individual credentials map keys from unauthorized document queries.
- **Target Collection**: `users/{otherUserId}` (direct retrieval)

---

### Vector 5: Temporal Clock Overwrites (Temporal Spoofing)
#### Payload 5.1: Forging historical log entry (Timestamp Tampering)
- **Attempt**: A merchant attempts to backdate the creation of a license or billing record to bypass expiration limits.
- **Target Collection**: `devices/{deviceId}` or `users/{userId}`
- **Payload**:
```json
{
  "createdAt": "2021-01-01T00:00:00Z",
  "lastSeen": "2021-01-01T00:00:00Z"
}
```

#### Payload 5.2: Forging server activation timestamps
- **Attempt**: A user tries to inject customized billing client timestamps.
- **Target Collection**: `activations/{activationId}`
- **Payload**:
```json
{
  "expiresAt": "2030-12-31T23:59:59Z"
}
```

---

### Vector 6: Document ID ID-Poisoning Attacks
#### Payload 6.1: Shadow Key ID Injection
- **Attempt**: Malicious client attempts to inject bulk junk payload utilizing special buffer signs or characters in ID parameters to cause denial-of-service.
- **Target Collection**: `users/{junk_id}`
- **ID Checked**: `GP_USER_!@#$$@%^&*()__+INVALID_JUNK`

#### Payload 6.2: Massive document size overflow
- **Attempt**: Attempting to upload a 2MB user detail block to exhausting Firestore standard limits.
- **Target Collection**: `users/{userId}`

---

## 3. Test Verification Rules

The core Firestore security rules mapped in `firestore.rules` will be evaluated against:
- Authentication checking (all calls except customer facing QR codes must pass `isSignedIn()`).
- Relational validation verifying `businessId` / `clientId` bindings.
- Precise `isValidUser` and `isValidDevice` entity validation checks block any stray fields.
- Cost-optimal `resource.data` scans prevent O(n) leaks.
