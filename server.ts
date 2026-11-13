import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import dotenv from 'dotenv';

dotenv.config();

interface FirebaseConfig {
  projectId: string;
  firestoreDatabaseId?: string;
}

interface VerifiedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

interface AuditLogEntry {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  timestamp: string;
}

interface AuthenticatedRequest extends Request {
  authUser?: VerifiedUser;
}

const PORT = Number(process.env.PORT || 3000);
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'emonvai4894@gmail.com').toLowerCase();
const ADMIN_EMAILS = new Set([ADMIN_EMAIL, 'emonvai4894@gmail.com', 'indhassan6050@gmail.com']);
const UPLOADS_DIR = path.resolve(process.cwd(), '.carrom_uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
let firebaseProjectId = '';
let firestoreDatabaseId = '(default)';

if (fs.existsSync(firebaseConfigPath)) {
  const rawConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8')) as FirebaseConfig;
  firebaseProjectId = rawConfig.projectId || '';
  firestoreDatabaseId = rawConfig.firestoreDatabaseId || '(default)';
}

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedUser | null> {
  if (!idToken || !firebaseProjectId) return null;
  try {
    const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${firebaseProjectId}`,
      audience: firebaseProjectId,
    });
    const uid = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    const emailVerified = payload.email_verified === true;
    const name = typeof payload.name === 'string' ? payload.name : undefined;
    if (!uid) return null;
    return { uid, email, emailVerified, name };
  } catch {
    return null;
  }
}

// Server-side registry of delegated admin UIDs (persisted in memory + synced from bootstrapped admin)
const delegatedAdminUids = new Set<string>();
const auditLogs: AuditLogEntry[] = [];

function isServerAdmin(user: VerifiedUser): boolean {
  if (!user.emailVerified) return false;
  if (ADMIN_EMAILS.has(user.email)) return true;
  return delegatedAdminUids.has(user.uid);
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const verified = await verifyFirebaseIdToken(token);
  if (!verified || !verified.emailVerified) {
    res.status(401).json({ error: 'Authentication with a verified email is required.' });
    return;
  }
  req.authUser = verified;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser || !isServerAdmin(req.authUser)) {
    res.status(403).json({ error: 'Forbidden: Verified administrator privileges required.' });
    return;
  }
  next();
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json({ limit: '16mb' }));

  // Health endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      projectId: firebaseProjectId,
      databaseId: firestoreDatabaseId,
      onlineConnections: onlineSockets.size,
    });
  });

  // Server-side Admin Role Verification
  app.get('/api/admin/verify', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const admin = isServerAdmin(user);
    res.json({
      isAdmin: admin,
      uid: user.uid,
      email: user.email,
      role: ADMIN_EMAILS.has(user.email) ? 'super_admin' : admin ? 'moderator' : 'player',
    });
  });

  app.get('/api/admin/stats', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
    res.json({
      onlineUsersCount: onlineSockets.size,
      onlineUserIds: Array.from(onlineSockets.keys()),
      auditLogsCount: auditLogs.length,
      serverUptimeSeconds: Math.floor(process.uptime()),
    });
  });

  app.get('/api/admin/audit-logs', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
    res.json({ logs: auditLogs.slice(0, 100) });
  });

  app.post('/api/admin/audit-log', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const { action, targetType, targetId, details } = req.body as {
      action?: string;
      targetType?: string;
      targetId?: string;
      details?: string;
    };
    if (!action || !targetType || !targetId) {
      res.status(400).json({ error: 'Missing required audit log fields.' });
      return;
    }
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      actorUid: req.authUser!.uid,
      actorEmail: req.authUser!.email,
      action: String(action).slice(0, 80),
      targetType: String(targetType).slice(0, 40),
      targetId: String(targetId).slice(0, 128),
      details: String(details || '').slice(0, 300),
      timestamp: new Date().toISOString(),
    };
    auditLogs.unshift(entry);
    if (auditLogs.length > 500) auditLogs.pop();
    res.json({ ok: true, entry });
  });

  app.post('/api/admin/delegates', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    if (!ADMIN_EMAILS.has(req.authUser!.email)) {
      res.status(403).json({ error: 'Only the super admin can manage delegated moderators.' });
      return;
    }
    const { uid, grant } = req.body as { uid?: string; grant?: boolean };
    if (!uid || typeof uid !== 'string') {
      res.status(400).json({ error: 'Valid uid is required.' });
      return;
    }
    if (grant) {
      delegatedAdminUids.add(uid);
    } else {
      delegatedAdminUids.delete(uid);
    }
    res.json({ ok: true, delegatedAdminUids: Array.from(delegatedAdminUids) });
  });

  // Media Upload Endpoint (Images, Videos, Voice Notes)
  const ALLOWED_EXT: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'audio/3gpp': '3gp',
  };

  app.post('/api/upload', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { dataUrl, mimeType } = req.body as { dataUrl?: string; mimeType?: string };
    if (!dataUrl || typeof dataUrl !== 'string') {
      res.status(400).json({ error: 'Missing media dataUrl.' });
      return;
    }
    const match = /^data:([a-zA-Z0-9/+.-]+)(?:;[^,]*)?;base64,(.+)$/.exec(dataUrl);
    const resolvedMime = (match?.[1] || mimeType || '').toLowerCase();
    const base64Payload = match?.[2] || '';
    const ext = ALLOWED_EXT[resolvedMime];
    if (!ext || !base64Payload) {
      res.status(400).json({ error: 'Unsupported or malformed media format.' });
      return;
    }
    const buffer = Buffer.from(base64Payload, 'base64');
    if (buffer.byteLength > 14 * 1024 * 1024) {
      res.status(413).json({ error: 'File exceeds 14MB upload limit.' });
      return;
    }
    const filename = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    res.json({ url: `/api/uploads/${filename}`, mimeType: resolvedMime, size: buffer.byteLength });
  });

  app.get('/api/uploads/:filename', (req: Request, res: Response) => {
    const safeName = path.basename(String(req.params.filename || ''));
    if (!/^[a-zA-Z0-9_.\-]+$/.test(safeName)) {
      res.status(400).json({ error: 'Invalid filename.' });
      return;
    }
    const filePath = path.join(UPLOADS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    res.sendFile(filePath);
  });

  // Real-time WebSocket Server for Online Presence, Typing Indicators, & Live Signals
  const wss = new WebSocketServer({ server, path: '/ws' });
  const onlineSockets = new Map<string, Set<WebSocket>>();
  const socketToUid = new Map<WebSocket, string>();

  function broadcastPresence() {
    const payload = JSON.stringify({
      type: 'presence:state',
      onlineUserIds: Array.from(onlineSockets.keys()),
    });
    for (const sockets of onlineSockets.values()) {
      for (const sock of sockets) {
        if (sock.readyState === WebSocket.OPEN) {
          sock.send(payload);
        }
      }
    }
  }

  function sendToUsers(uids: string[], payloadObj: Record<string, unknown>) {
    const serialized = JSON.stringify(payloadObj);
    for (const targetUid of uids) {
      const sockets = onlineSockets.get(targetUid);
      if (!sockets) continue;
      for (const sock of sockets) {
        if (sock.readyState === WebSocket.OPEN) {
          sock.send(serialized);
        }
      }
    }
  }

  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(String(rawData)) as {
          type: string;
          token?: string;
          conversationId?: string;
          targetUserIds?: string[];
          senderName?: string;
          notification?: Record<string, unknown>;
        };

        if (msg.type === 'auth' && msg.token) {
          const verified = await verifyFirebaseIdToken(msg.token);
          if (!verified || !verified.emailVerified) {
            ws.send(JSON.stringify({ type: 'auth:error', message: 'Invalid token' }));
            ws.close();
            return;
          }
          socketToUid.set(ws, verified.uid);
          if (!onlineSockets.has(verified.uid)) {
            onlineSockets.set(verified.uid, new Set());
          }
          onlineSockets.get(verified.uid)!.add(ws);
          ws.send(JSON.stringify({
            type: 'auth:ok',
            uid: verified.uid,
            onlineUserIds: Array.from(onlineSockets.keys()),
          }));
          broadcastPresence();
          return;
        }

        const uid = socketToUid.get(ws);
        if (!uid) return;

        if ((msg.type === 'typing:start' || msg.type === 'typing:stop') && msg.conversationId && Array.isArray(msg.targetUserIds)) {
          const recipients = msg.targetUserIds.filter((id) => id !== uid);
          sendToUsers(recipients, {
            type: msg.type,
            conversationId: msg.conversationId,
            uid,
            senderName: msg.senderName || 'Player',
          });
          return;
        }

        if (msg.type === 'signal:notification' && Array.isArray(msg.targetUserIds) && msg.notification) {
          const recipients = msg.targetUserIds.filter((id) => id !== uid);
          sendToUsers(recipients, {
            type: 'notification:live',
            notification: msg.notification,
          });
        }
      } catch {
        // Ignore malformed websocket frames
      }
    });

    ws.on('close', () => {
      const uid = socketToUid.get(ws);
      socketToUid.delete(ws);
      if (uid && onlineSockets.has(uid)) {
        const set = onlineSockets.get(uid)!;
        set.delete(ws);
        if (set.size === 0) {
          onlineSockets.delete(uid);
        }
        broadcastPresence();
      }
    });
  });

  // Vite Dev Middleware or Static Production Build
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Carrom Hub server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Carrom Hub server:', err);
  process.exit(1);
});
