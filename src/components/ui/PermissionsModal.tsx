import {
  Bell,
  Camera,
  CheckCircle2,
  Mic,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { usePreferences } from '../../lib/i18n';
import { type AppPermissionStatus, type DevicePermissionState } from '../../lib/permissions';
import { ModalDialog } from './ToastAndDialogs';

interface PermissionsModalProps {
  open: boolean;
  onClose: () => void;
  status: AppPermissionStatus;
  onRequestMic: () => Promise<DevicePermissionState>;
  onRequestCamera: () => Promise<DevicePermissionState>;
  onRequestNotifications: () => Promise<DevicePermissionState>;
  onDone?: () => void;
  onToast: (kind: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export function PermissionsModal({
  open,
  onClose,
  status,
  onRequestMic,
  onRequestCamera,
  onRequestNotifications,
  onDone,
  onToast,
}: PermissionsModalProps) {
  const { t } = usePreferences();
  const [busy, setBusy] = useState<'mic' | 'camera' | 'notif' | 'all' | null>(null);

  const handleRequestAll = async () => {
    setBusy('all');
    try {
      const mic = await onRequestMic();
      const cam = await onRequestCamera();
      await onRequestNotifications();
      onDone?.();
      if (mic === 'granted' && cam === 'granted') {
        onToast('success', t('appPermissions'), t('grantedLabel'));
        onClose();
      } else {
        onToast('info', t('appPermissions'), t('permissionsBannerDesc'));
      }
    } finally {
      setBusy(null);
    }
  };

  const renderBadge = (state: DevicePermissionState) => {
    if (state === 'granted') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#00A86B] dark:text-[#00D68F]">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {t('grantedLabel')}
        </span>
      );
    }
    if (state === 'denied') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-500 dark:text-rose-400">
          <ShieldAlert className="w-3.5 h-3.5" />
          {t('blockedLabel')}
        </span>
      );
    }
    return null;
  };

  return (
    <ModalDialog
      open={open}
      onClose={() => {
        onDone?.();
        onClose();
      }}
      title={t('appPermissions')}
      subtitle={t('permissionsSubtitle')}
      maxWidth="max-w-md"
    >
      <div className="space-y-3">
        {/* Microphone / Voice */}
        <div className="p-3.5 rounded-2xl inset-surface flex items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-[#00A86B]/15 dark:bg-[#00D68F]/15 text-[#00A86B] dark:text-[#00D68F] flex items-center justify-center shrink-0">
              <Mic className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{t('micPermTitle')}</p>
              <p className="text-xs text-slate-500 dark:text-[#A5B5AC] leading-snug mt-0.5">
                {t('micPermDesc')}
              </p>
              <div className="mt-1">{renderBadge(status.microphone)}</div>
            </div>
          </div>
          {status.microphone !== 'granted' && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy('mic');
                const res = await onRequestMic();
                setBusy(null);
                if (res === 'granted') onToast('success', t('micPermTitle'), t('grantedLabel'));
              }}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] text-xs font-semibold shrink-0 disabled:opacity-50"
            >
              {busy === 'mic' ? '...' : t('allowBtn')}
            </button>
          )}
        </div>

        {/* Camera & Photos */}
        <div className="p-3.5 rounded-2xl inset-surface flex items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-[#00A86B]/15 dark:bg-[#00D68F]/15 text-[#00A86B] dark:text-[#00D68F] flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{t('cameraPermTitle')}</p>
              <p className="text-xs text-slate-500 dark:text-[#A5B5AC] leading-snug mt-0.5">
                {t('cameraPermDesc')}
              </p>
              <div className="mt-1">{renderBadge(status.camera)}</div>
            </div>
          </div>
          {status.camera !== 'granted' && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy('camera');
                const res = await onRequestCamera();
                setBusy(null);
                if (res === 'granted') onToast('success', t('cameraPermTitle'), t('grantedLabel'));
              }}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] text-xs font-semibold shrink-0 disabled:opacity-50"
            >
              {busy === 'camera' ? '...' : t('allowBtn')}
            </button>
          )}
        </div>

        {/* Notifications */}
        <div className="p-3.5 rounded-2xl inset-surface flex items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-[#00A86B]/15 dark:bg-[#00D68F]/15 text-[#00A86B] dark:text-[#00D68F] flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{t('notifPermTitle')}</p>
              <p className="text-xs text-slate-500 dark:text-[#A5B5AC] leading-snug mt-0.5">
                {t('notifPermDesc')}
              </p>
              <div className="mt-1">{renderBadge(status.notifications)}</div>
            </div>
          </div>
          {status.notifications !== 'granted' && status.notifications !== 'unsupported' && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy('notif');
                const res = await onRequestNotifications();
                setBusy(null);
                if (res === 'granted') onToast('success', t('notifPermTitle'), t('grantedLabel'));
              }}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] text-xs font-semibold shrink-0 disabled:opacity-50"
            >
              {busy === 'notif' ? '...' : t('allowBtn')}
            </button>
          )}
        </div>

        {(status.microphone === 'denied' || status.camera === 'denied') && (
          <p className="text-[11px] text-amber-600 dark:text-amber-300 px-1 leading-relaxed">
            If a permission shows &ldquo;{t('blockedLabel')}&rdquo;, open your browser Site Settings or Phone App Permissions for Carrom Hub and set Microphone &amp; Camera to Allow.
          </p>
        )}

        <div className="pt-2 flex items-center gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void handleRequestAll()}
            className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <ShieldCheck className="w-4 h-4" />
            {busy === 'all' ? '...' : t('allowAllPerms')}
          </button>
          <button
            type="button"
            onClick={() => {
              onDone?.();
              onClose();
            }}
            className="px-4 py-2.5 rounded-xl inset-surface text-xs font-medium text-slate-700 dark:text-white"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}

interface CameraCaptureModalProps {
  open: boolean;
  onClose: () => void;
  onCaptureFile: (file: File) => void;
  onFallbackGallery: () => void;
}

export function CameraCaptureModal({
  open,
  onClose,
  onCaptureFile,
  onFallbackGallery,
}: CameraCaptureModalProps) {
  const { t } = usePreferences();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (!open) {
      stopStream();
      setErrorMsg(null);
      return;
    }

    let cancelled = false;
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMsg('Live camera preview is unavailable on this browser. Please select a photo from gallery.');
        return;
      }
      setStarting(true);
      setErrorMsg(null);
      stopStream();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setErrorMsg('Camera permission denied or camera not available. Allow camera permission or pick from gallery.');
      } finally {
        if (!cancelled) setStarting(false);
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, facingMode]);

  const handleSnap = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `carrom_cam_${Date.now()}.jpg`, { type: 'image/jpeg' });
        stopStream();
        onCaptureFile(file);
        onClose();
      },
      'image/jpeg',
      0.88
    );
  };

  return (
    <ModalDialog open={open} onClose={onClose} title={t('takePhotoTitle')} maxWidth="max-w-md">
      <div className="space-y-3">
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center">
          {errorMsg ? (
            <div className="p-5 text-center space-y-3">
              <Camera className="w-9 h-9 text-slate-400 mx-auto" />
              <p className="text-xs text-slate-300 leading-relaxed">{errorMsg}</p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onFallbackGallery();
                }}
                className="px-4 py-2 rounded-xl bg-[#00D68F] text-[#080D0B] text-xs font-semibold"
              >
                {t('galleryPhoto')}
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {starting && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-xs text-white">
                  Starting camera...
                </div>
              )}
            </>
          )}
        </div>

        {!errorMsg && (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
              className="px-3.5 py-2.5 rounded-xl inset-surface text-xs font-medium text-slate-700 dark:text-white inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              {t('switchCamera')}
            </button>
            <button
              type="button"
              onClick={handleSnap}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] text-xs font-bold inline-flex items-center justify-center gap-1.5"
            >
              <Camera className="w-4 h-4" />
              {t('snapPhoto')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-xl inset-surface text-slate-600 dark:text-[#A5B5AC]"
              aria-label="Close camera"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </ModalDialog>
  );
}
