# Carrom Hub Security Specification

## 1. Data Invariants
1. **PII Isolation**: Private user emails and blocklists live strictly in `/users/{userId}/private/info` and are only readable/writable by the owner or a verified Admin. Public profiles in `/users/{userId}` never store PII (`email`, `phone`, `address`).
2. **No Self-Assigned Privileges**: Users cannot set `isVerified`, `isSuspended`, `isBanned`, or `tournamentsWon` to elevated values on creation, nor alter their own verification/ban status on update. Admin access requires either verified bootstrapped admin email (`emonvai4894@gmail.com` with `email_verified == true`) or existence in `/admins/{uid}`.
3. **Private Chat Confidentiality**: Conversations and messages in `/conversations/{conversationId}` and `/conversations/{conversationId}/messages/{messageId}` enforce `request.auth.uid in resource.data.participantIds` on both `get` and `list`, preventing unauthorized reading or query scraping without `get()` inside `allow list`.
4. **Ownership Integrity**: Only the `authorId` (or an Admin) can edit post captions or delete posts; only the `senderId` can delete/edit their own message; only the group `adminId` can remove members or change group settings.
5. **Verified Tournament Results**: Tournament `winnerId` and `winnerVerified: true` cannot be set by regular participants; only verified Admins can set `winnerVerified: true` and `status: 'completed'`, preventing automatic or unverified winner spoofing.
6. **Temporal Integrity**: `createdAt` and `updatedAt` are strictly validated against `request.time`, and `createdAt` / `authorId` / `creatorId` / `senderId` are immutable after creation.

## 2. The "Dirty Dozen" Attack Payloads
1. **Identity Spoofing on Post**: `{ "id": "p1", "authorId": "victim_uid", "caption": "spoofed" }` -> `PERMISSION_DENIED`.
2. **Shadow Privilege Escalation on Profile Create**: `{ "uid": "attacker", "isVerified": true, "isBanned": false, "tournamentsWon": 99 }` -> `PERMISSION_DENIED`.
3. **Shadow Role Field Injection**: `{ "uid": "attacker", "role": "admin", "fullName": "Hack" }` -> `PERMISSION_DENIED`.
4. **PII Cross-User Read**: Non-owner attempting `get(/users/victim_uid/private/info)` -> `PERMISSION_DENIED`.
5. **Private Chat Eavesdropping (`list` scrape)**: Non-participant attempting `list(/conversations)` or `list(/conversations/c1/messages)` -> `PERMISSION_DENIED`.
6. **Unauthorized Post Edit**: Non-author attempting to update `caption` on someone else's post -> `PERMISSION_DENIED`.
7. **Unauthorized Post Delete**: Non-author, non-admin attempting `delete(/posts/p1)` -> `PERMISSION_DENIED`.
8. **Fake Timestamp Injection**: Creating a post with backdated `createdAt` != `request.time` -> `PERMISSION_DENIED`.
9. **ID Poisoning / DoW**: Creating a document with a 2KB ID string or non-alphanumeric ID `../../admin` -> `PERMISSION_DENIED`.
10. **Unverified Tournament Winner Spoofing**: Participant updating `/tournaments/t1` with `winnerVerified: true, status: "completed"` -> `PERMISSION_DENIED`.
11. **Terminal State Mutation**: Modifying a `completed` tournament as non-admin -> `PERMISSION_DENIED`.
12. **Unverified Email Spoof**: Request with `email: "emonvai4894@gmail.com"` and `email_verified: false` -> `PERMISSION_DENIED`.
