import { auth } from './firebase';

export type WsEventHandler = (event: {
  type: string;
  onlineUserIds?: string[];
  conversationId?: string;
  uid?: string;
  senderName?: string;
  notification?: Record<string, unknown>;
}) => void;

class RealtimeSocketManager {
  private ws: WebSocket | null = null;
  private listeners = new Set<WsEventHandler>();
  private reconnectTimer: number | null = null;
  private shouldRun = false;

  connect() {
    this.shouldRun = true;
    this.openSocket();
  }

  disconnect() {
    this.shouldRun = false;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  subscribe(handler: WsEventHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  private async openSocket() {
    if (!this.shouldRun) return;
    const user = auth.currentUser;
    if (!user || !user.emailVerified) return;

    try {
      const token = await user.getIdToken();
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${proto}//${window.location.host}/ws`);
      this.ws = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'auth', token }));
      };

      socket.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(String(evt.data));
          for (const listener of this.listeners) {
            listener(parsed);
          }
        } catch {
          // Ignore malformed server frame
        }
      };

      socket.onclose = () => {
        if (this.ws === socket) {
          this.ws = null;
        }
        if (this.shouldRun && auth.currentUser) {
          this.reconnectTimer = window.setTimeout(() => {
            void this.openSocket();
          }, 3000);
        }
      };
    } catch {
      // Retry silently
    }
  }

  sendTyping(conversationId: string, targetUserIds: string[], senderName: string, isTyping: boolean) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: isTyping ? 'typing:start' : 'typing:stop',
        conversationId,
        targetUserIds,
        senderName,
      })
    );
  }

  pushLiveNotification(targetUserIds: string[], notification: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: 'signal:notification',
        targetUserIds,
        notification,
      })
    );
  }
}

export const realtimeSocket = new RealtimeSocketManager();
