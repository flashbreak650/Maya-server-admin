import { useCallback, useEffect, useState } from 'react';

export type DevicePermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

export interface AppPermissionStatus {
  microphone: DevicePermissionState;
  camera: DevicePermissionState;
  notifications: DevicePermissionState;
}

const PERM_REVIEWED_KEY = 'carrom_app_permissions_reviewed';

async function queryBrowserPermission(name: 'microphone' | 'camera'): Promise<DevicePermissionState> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'unsupported';
  }
  try {
    if (navigator.permissions?.query) {
      const result = await navigator.permissions.query({ name: name as PermissionName });
      if (result.state === 'granted' || result.state === 'denied' || result.state === 'prompt') {
        return result.state;
      }
    }
  } catch {
    // Safari / some mobile WebViews throw on camera/microphone query; fall back to prompt
  }
  return 'prompt';
}

function queryNotificationPermission(): DevicePermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

export function getBestAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/aac',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function useAppPermissions() {
  const [status, setStatus] = useState<AppPermissionStatus>({
    microphone: 'prompt',
    camera: 'prompt',
    notifications: 'prompt',
  });
  const [reviewed, setReviewed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PERM_REVIEWED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const refreshPermissions = useCallback(async (): Promise<AppPermissionStatus> => {
    const [microphone, camera] = await Promise.all([
      queryBrowserPermission('microphone'),
      queryBrowserPermission('camera'),
    ]);
    const notifications = queryNotificationPermission();
    const next = { microphone, camera, notifications };
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  const markReviewed = useCallback(() => {
    setReviewed(true);
    try {
      localStorage.setItem(PERM_REVIEWED_KEY, '1');
    } catch {
      // ignore storage errors
    }
  }, []);

  const requestMicrophone = useCallback(async (): Promise<DevicePermissionState> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus((prev) => ({ ...prev, microphone: 'unsupported' }));
      return 'unsupported';
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((tr) => tr.stop());
      setStatus((prev) => ({ ...prev, microphone: 'granted' }));
      return 'granted';
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      const next: DevicePermissionState =
        name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'prompt';
      setStatus((prev) => ({ ...prev, microphone: next }));
      return next;
    }
  }, []);

  const requestCamera = useCallback(async (): Promise<DevicePermissionState> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus((prev) => ({ ...prev, camera: 'unsupported' }));
      return 'unsupported';
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((tr) => tr.stop());
      setStatus((prev) => ({ ...prev, camera: 'granted' }));
      return 'granted';
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      const next: DevicePermissionState =
        name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'prompt';
      setStatus((prev) => ({ ...prev, camera: next }));
      return next;
    }
  }, []);

  const requestNotifications = useCallback(async (): Promise<DevicePermissionState> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setStatus((prev) => ({ ...prev, notifications: 'unsupported' }));
      return 'unsupported';
    }
    try {
      const res = await Notification.requestPermission();
      const mapped: DevicePermissionState =
        res === 'granted' ? 'granted' : res === 'denied' ? 'denied' : 'prompt';
      setStatus((prev) => ({ ...prev, notifications: mapped }));
      return mapped;
    } catch {
      return queryNotificationPermission();
    }
  }, []);

  return {
    status,
    reviewed,
    markReviewed,
    refreshPermissions,
    requestMicrophone,
    requestCamera,
    requestNotifications,
  };
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}
