# Security Specification & Payload-First TDD

## 1. Data Invariants
1. **User Profiles (`/users/{userId}`)**: A user profile can only be read, created, or updated by the authenticated owner (`request.auth.uid == userId`) with a verified email. Users cannot inject arbitrary fields or change their `uid` or `createdAt`.
2. **Domains (`/domains/{domainId}`)**: Every domain record must belong to the authenticated creator (`userId == request.auth.uid`). Only the owner can list, read, update (Cloudflare connection fields, status, or autoRenew), or delete their domain. `userId`, `domain`, `id`, and `createdAt` are immutable after creation.
3. **Shop Orders (`/orders/{orderId}`)**: Orders must belong to `request.auth.uid` and strictly validate `amountLabel`, `status`, and server timestamps (`request.time`).
4. **Support Tickets (`/tickets/{ticketId}`)**: Tickets must belong to `request.auth.uid`. Users can create open tickets and close their own tickets, with strict string length bounds.

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Read**: Anonymous read of `/domains/{domainId}` -> Denied.
2. **Cross-Tenant List**: Authenticated User A querying `/domains` without `where('userId', '==', uid)` -> Denied by `resource.data.userId == request.auth.uid`.
3. **Identity Spoofing on Create**: User A creating `/domains/evil1` with `userId: 'user_B'` -> Denied.
4. **Shadow Field Injection**: Creating `/users/{uid}` with extra `isAdmin: true` field -> Denied by `keys().hasOnly(...)`.
5. **Immutable Field Mutation**: Updating `userId` or `createdAt` on an existing `/domains/{domainId}` -> Denied.
6. **Client Timestamp Forgery**: Creating a document with `createdAt` not equal to `request.time` -> Denied.
7. **Oversized String Poisoning (DoW)**: Creating a ticket with a 50KB `message` -> Denied by `size() <= 2000`.
8. **ID Path Poisoning**: Creating `/domains/bad!@#id` -> Denied by `isValidId()`.
9. **Unbounded Array Poisoning**: Setting `cloudflareNameservers` with > 10 entries -> Denied by `size() <= 10`.
10. **Invalid Status Transition**: Creating a ticket directly with `status: 'answered'` -> Denied.
11. **PII Cross-Read**: User A calling `get(/users/user_B)` -> Denied.
12. **Terminal State Bypass**: Re-opening a `closed` ticket from client -> Denied.
