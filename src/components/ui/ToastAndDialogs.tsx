import { AlertTriangle, BadgeCheck, CheckCircle2, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import type { ToastItem } from '../../types';

export function PlayerAvatar({
  src,
  name,
  size = 'md',
  online,
}: {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
}) {
  const dims =
    size === 'xs'
      ? 'h-7 w-7 text-[11px]'
      : size === 'sm'
        ? 'h-8 w-8 text-xs'
        : size === 'lg'
          ? 'h-14 w-14 text-lg'
          : size === 'xl'
            ? 'h-24 w-24 text-2xl'
            : 'h-9 w-9 text-sm';

  const initials = (name || 'P')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <div className={`relative shrink-0 ${dims}`}>
      {src ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          className="h-full w-full rounded-full object-cover border border-[#00A86B]/25 dark:border-[#00D68F]/25 bg-slate-100 dark:bg-[#101A15]"
        />
      ) : (
        <div className="h-full w-full rounded-full bg-gradient-to-br from-[#00A86B]/20 to-[#008F5B]/10 dark:from-[#00D68F]/30 dark:to-[#00B87A]/10 border border-[#00A86B]/30 dark:border-[#00D68F]/30 flex items-center justify-center font-display font-semibold text-emerald-900 dark:text-white">
          {initials}
        </div>
      )}
      {online !== undefined && (
        <span
          title={online ? 'Online' : 'Offline'}
          className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-[#080D0B] ${
            online ? 'bg-[#00B87A] dark:bg-[#00D68F]' : 'bg-slate-400 dark:bg-[#64746B]'
          }`}
        />
      )}
    </div>
  );
}

export function VerifiedIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return <BadgeCheck className={`${className} text-[#00A86B] dark:text-[#00D68F] inline-block shrink-0`} aria-label="Verified Player" />;
}

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed top-4 right-4 z-[90] flex flex-col gap-2.5 w-[calc(100vw-2rem)] max-w-sm pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto glass-surface rounded-2xl p-3.5 shadow-2xl flex items-start gap-3"
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-[#00A86B] dark:text-[#00D68F] shrink-0 mt-0.5" />
            ) : t.kind === 'error' ? (
              <AlertTriangle className="w-5 h-5 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-5 h-5 text-sky-500 dark:text-sky-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{t.title}</p>
              {t.description && (
                <p className="text-xs text-slate-600 dark:text-[#A5B5AC] mt-0.5 leading-relaxed">
                  {t.description}
                </p>
              )}
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className="p-1 rounded-lg text-slate-500 dark:text-[#A5B5AC] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ModalDialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.18 }}
            className={`relative z-10 w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#101A15] border border-slate-200 dark:border-[#00D68F]/20 shadow-2xl p-6`}
          >
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#00D68F]/15">
              <div>
                <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white">{title}</h2>
                {subtitle && <p className="text-xs text-slate-600 dark:text-[#A5B5AC] mt-1">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 dark:text-[#A5B5AC] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="pt-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalDialog open={open} onClose={onCancel} title={title} maxWidth="max-w-md">
      <p className="text-sm text-slate-600 dark:text-[#A5B5AC] leading-relaxed">{description}</p>
      <div className="flex items-center justify-end gap-3 mt-6">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-[#A5B5AC] hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
            danger
              ? 'bg-rose-600 hover:bg-rose-500 text-white'
              : 'bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] hover:brightness-110'
          }`}
        >
          {loading ? 'Processing...' : confirmLabel}
        </button>
      </div>
    </ModalDialog>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="card-surface rounded-2xl p-7 text-center flex flex-col items-center justify-center gap-2.5">
      <div className="h-11 w-11 rounded-2xl bg-[#00A86B]/10 dark:bg-[#00D68F]/10 border border-[#00A86B]/20 dark:border-[#00D68F]/20 flex items-center justify-center text-[#00A86B] dark:text-[#00D68F]">
        {icon}
      </div>
      <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="text-sm text-slate-600 dark:text-[#A5B5AC] max-w-sm leading-relaxed">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="card-surface rounded-2xl p-3.5 animate-pulse space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-white/10" />
            <div className="space-y-1.5 flex-1">
              <div className="h-3 w-32 rounded bg-slate-200 dark:bg-white/10" />
              <div className="h-2 w-20 rounded bg-slate-100 dark:bg-white/5" />
            </div>
          </div>
          <div className="h-3.5 w-4/5 rounded bg-slate-200 dark:bg-white/10" />
          <div className="h-36 w-full rounded-xl bg-slate-100 dark:bg-white/5" />
        </div>
      ))}
    </div>
  );
}
