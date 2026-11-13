import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Languages,
  Loader2,
  Lock,
  Mail,
  Moon,
  Phone,
  RefreshCw,
  Sun,
  User,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { auth, googleProvider } from '../../lib/firebase';
import { usePreferences } from '../../lib/i18n';
import { compressImageToDataUrl } from '../../lib/media';
import { ensureUserProfileExists } from '../../services/firestoreService';
import { BrandLogo } from '../ui/BrandLogo';
import { ModalDialog } from '../ui/ToastAndDialogs';

const DEMO_ACCOUNT_EMAIL = 'indhassan6050@gmail.com';

interface AuthScreenProps {
  pendingVerificationEmail?: string | null;
  onRefreshVerification: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onWelcomeSuccess: (name: string) => void;
}

function generateSafeUsername(fullName: string, email: string): string {
  const fromName = fullName
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '');
  const fromEmail = (email.split('@')[0] || '')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '');
  const base = (fromName.length >= 3 ? fromName : fromEmail.length >= 3 ? fromEmail : 'player').slice(0, 20);
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${base}_${suffix}`.slice(0, 32);
}

export function AuthScreen({
  pendingVerificationEmail,
  onRefreshVerification,
  onSignOut,
  onWelcomeSuccess,
}: AuthScreenProps) {
  const { lang, theme, toggleTheme, toggleLang, t } = usePreferences();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConsoleGuide, setShowConsoleGuide] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState(() => localStorage.getItem('carrom_remember_email') || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem('carrom_remember_email')));

  // Recovery / Forgot password fields
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(false);

  // Registration fields (Name, Phone Number, Email, Password, Confirm Password, Optional Photo)
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [verifyingCheck, setVerifyingCheck] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(false);

  const handleAvatarChange = async (file: File | undefined) => {
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file, 420, 0.82);
      setAvatarPreview(compressed);
    } catch {
      setErrorMsg(
        lang === 'bn'
          ? 'ছবিটি প্রসেস করা যায়নি। অনুগ্রহ করে JPG বা PNG ছবি দিন।'
          : 'Could not process profile picture. Try a standard JPG or PNG.'
      );
    }
  };

  const handleGoogleLogin = async (loginHintEmail?: string) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const provider = loginHintEmail ? new GoogleAuthProvider() : googleProvider;
      if (loginHintEmail) {
        provider.setCustomParameters({ login_hint: loginHintEmail });
      }
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      await ensureUserProfileExists({
        uid: user.uid,
        email: user.email || loginHintEmail || '',
        fullName: user.displayName || 'Carrom Player',
        avatarUrl: user.photoURL || undefined,
        rememberMe: true,
      });
      onWelcomeSuccess(user.displayName || 'Player');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      if (!msg.includes('popup-closed-by-user')) {
        setErrorMsg(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const cleanEmail = loginEmail.trim();
      if (rememberMe) {
        localStorage.setItem('carrom_remember_email', cleanEmail);
      } else {
        localStorage.removeItem('carrom_remember_email');
      }
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, loginPassword);
      if (cred.user.emailVerified) {
        await ensureUserProfileExists({
          uid: cred.user.uid,
          email: cred.user.email || cleanEmail,
          fullName: cred.user.displayName || cleanEmail.split('@')[0] || 'Carrom Player',
          rememberMe,
        });
        onWelcomeSuccess(cred.user.displayName || 'Player');
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setShowConsoleGuide(true);
        setErrorMsg(
          lang === 'bn'
            ? 'Firebase Console-এ Email/Password চালু নেই। আপাতত Google দিয়ে লগইন করতে পারেন।'
            : 'Email/Password sign-in is not yet enabled in your Firebase Console.'
        );
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setErrorMsg(
          lang === 'bn'
            ? 'ইমেইল বা পাসওয়ার্ড ভুল হয়েছে। পাসওয়ার্ড ভুলে গেলে "রিকভারি" ট্যাব ব্যবহার করুন।'
            : 'Invalid email or password. Use Recovery if you forgot your password.'
        );
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Login failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanName = fullName.trim();
    const cleanPhone = phoneNumber.trim();
    const digitsOnly = cleanPhone.replace(/\D/g, '');
    if (cleanName.length < 2) {
      setErrorMsg(lang === 'bn' ? 'অনুগ্রহ করে আপনার সঠিক নাম লিখুন।' : 'Please enter your full name.');
      return;
    }
    if (digitsOnly.length < 6 || cleanPhone.length > 30) {
      setErrorMsg(
        lang === 'bn'
          ? 'অনুগ্রহ করে সঠিক মোবাইল নাম্বার দিন (কমপক্ষে ৬ ডিজিট)।'
          : 'Please enter a valid phone number (at least 6 digits).'
      );
      return;
    }
    if (regPassword.length < 6) {
      setErrorMsg(
        lang === 'bn' ? 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' : 'Password must be at least 6 characters.'
      );
      return;
    }
    if (regPassword !== confirmPassword) {
      setErrorMsg(lang === 'bn' ? 'দুটি পাসওয়ার্ড একরকম নয়।' : 'Passwords do not match.');
      return;
    }
    if (!acceptedTerms) {
      setErrorMsg(
        lang === 'bn'
          ? 'অ্যাকাউন্ট খুলতে শর্তাবলীতে টিক দিন।'
          : 'Please accept the Terms & Conditions to create your account.'
      );
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = regEmail.trim();
      const generatedUsername = generateSafeUsername(cleanName, cleanEmail);
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, regPassword);
      await updateProfile(cred.user, { displayName: cleanName });
      localStorage.setItem(
        `carrom_pending_profile_${cred.user.uid}`,
        JSON.stringify({
          fullName: cleanName,
          username: generatedUsername,
          phoneNumber: cleanPhone,
          avatarUrl: avatarPreview || '',
        })
      );
      await sendEmailVerification(cred.user);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setShowConsoleGuide(true);
        setErrorMsg(
          lang === 'bn'
            ? 'Firebase Console-এ Email/Password চালু নেই। Google লগইন ব্যবহার করুন অথবা Console থেকে চালু করুন।'
            : 'Email/Password registration is disabled in Firebase Console. Use Google Login or enable Email/Password.'
        );
      } else if (code === 'auth/email-already-in-use') {
        setErrorMsg(
          lang === 'bn'
            ? 'এই ইমেইলে আগেই অ্যাকাউন্ট খোলা আছে। সাইন ইন বা রিকভারি ব্যবহার করুন।'
            : 'An account with this email already exists. Try signing in or recovering your password.'
        );
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Registration failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const triggerPasswordReset = async (targetEmail: string) => {
    const cleanEmail = targetEmail.trim();
    if (!cleanEmail) return;
    setErrorMsg(null);
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setResetSent(true);
      setResetCooldown(true);
      window.setTimeout(() => setResetCooldown(false), 30000);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/user-not-found') {
        setErrorMsg(
          lang === 'bn'
            ? 'এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।'
            : 'No account found with this email address.'
        );
      } else if (code === 'auth/invalid-email') {
        setErrorMsg(
          lang === 'bn' ? 'অনুগ্রহ করে সঠিক ইমেইল ঠিকানা দিন।' : 'Please enter a valid email address.'
        );
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg(
          lang === 'bn'
            ? 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।'
            : 'Too many requests. Please try again in a few minutes.'
        );
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Could not send reset email.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handlePasswordResetSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await triggerPasswordReset(resetEmail);
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser || resendCooldown) return;
    setResendCooldown(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setTimeout(() => setResendCooldown(false), 30000);
    } catch {
      setResendCooldown(false);
    }
  };

  const prefControls = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleLang}
        className="min-h-[40px] px-3 rounded-xl bg-white/80 hover:bg-white dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-[#00D68F]/20 text-xs font-semibold text-slate-700 dark:text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
      >
        <Languages className="w-3.5 h-3.5 text-[#00A86B] dark:text-[#00D68F]" />
        {t('languageLabel')}
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        className="min-h-[40px] px-3 rounded-xl bg-white/80 hover:bg-white dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-[#00D68F]/20 text-xs font-semibold text-slate-700 dark:text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')}
      >
        {theme === 'dark' ? (
          <>
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span>{t('lightMode')}</span>
          </>
        ) : (
          <>
            <Moon className="w-3.5 h-3.5 text-slate-700" />
            <span>{t('darkMode')}</span>
          </>
        )}
      </button>
    </div>
  );

  // Pending Email Verification Screen
  if (pendingVerificationEmail) {
    return (
      <div className="min-h-screen bg-[#F6F8F7] dark:bg-[#080D0B] flex flex-col relative overflow-hidden">
        <header className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <BrandLogo size="md" animated />
          {prefControls}
        </header>

        <div className="flex-1 flex items-center justify-center p-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md glass-surface rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl"
          >
            <div className="mx-auto h-14 w-14 rounded-2xl bg-[#00A86B]/12 dark:bg-[#00D68F]/15 border border-[#00A86B]/30 dark:border-[#00D68F]/30 flex items-center justify-center text-[#00A86B] dark:text-[#00D68F]">
              <Mail className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
                {t('verifyEmailTitle')}
              </h1>
              <p className="text-sm text-slate-600 dark:text-[#A5B5AC] leading-relaxed">
                {t('verifyEmailDesc', { email: pendingVerificationEmail })}
              </p>
            </div>
            <div className="space-y-3 pt-2">
              <button
                onClick={async () => {
                  setVerifyingCheck(true);
                  await onRefreshVerification();
                  setVerifyingCheck(false);
                }}
                disabled={verifyingCheck}
                className="w-full min-h-[46px] py-3 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] hover:brightness-110 transition-all flex items-center justify-center gap-2"
              >
                {verifyingCheck ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {t('verifiedContinueBtn')}
              </button>
              <button
                onClick={handleResendVerification}
                disabled={resendCooldown}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl text-sm font-medium text-slate-800 dark:text-white bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                {resendCooldown ? t('resendWaitBtn') : t('resendVerifyBtn')}
              </button>
              <button
                onClick={onSignOut}
                className="w-full py-2 text-xs text-slate-500 hover:text-slate-900 dark:text-[#A5B5AC] dark:hover:text-white transition-colors"
              >
                {t('useAnotherAccount')}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F8F7] text-slate-900 dark:bg-[#080D0B] dark:text-white flex flex-col relative overflow-hidden">
      {/* Subtle Ambient Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[420px] w-[620px] rounded-full bg-[#00A86B]/12 dark:bg-[#00D68F]/14 blur-[130px]" />
        <div className="absolute -bottom-36 right-0 h-[360px] w-[360px] rounded-full bg-[#008F5B]/10 dark:bg-[#00B87A]/12 blur-[120px]" />
      </div>

      {/* Clean Minimal Top Bar */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <BrandLogo size="md" animated />
        {prefControls}
      </header>

      {/* Centered Focused Auth & Registration Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-6 sm:py-10">
        <div className="w-full max-w-md glass-surface rounded-3xl p-6 sm:p-8 shadow-2xl">
          {/* 3-Mode Switcher: Sign In / Create Account / Recovery */}
          <div className="grid grid-cols-3 p-1 rounded-2xl inset-surface mb-6 gap-1">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
              }}
              className={`min-h-[42px] px-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] shadow-md'
                  : 'text-slate-600 hover:text-slate-900 dark:text-[#A5B5AC] dark:hover:text-white'
              }`}
            >
              {t('signInTab')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg(null);
              }}
              className={`min-h-[42px] px-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] shadow-md'
                  : 'text-slate-600 hover:text-slate-900 dark:text-[#A5B5AC] dark:hover:text-white'
              }`}
            >
              {t('createAccountTab')}
            </button>
            <button
              type="button"
              onClick={() => {
                setResetEmail(loginEmail || resetEmail);
                setResetSent(false);
                setMode('forgot');
                setErrorMsg(null);
              }}
              className={`min-h-[42px] px-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                mode === 'forgot'
                  ? 'bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] shadow-md'
                  : 'text-slate-600 hover:text-slate-900 dark:text-[#A5B5AC] dark:hover:text-white'
              }`}
            >
              {t('recoverTab')}
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="leading-relaxed">{errorMsg}</p>
                {showConsoleGuide && (
                  <button
                    type="button"
                    onClick={() => setShowConsoleGuide(true)}
                    className="underline text-[#00A86B] dark:text-[#00D68F] font-medium"
                  >
                    How to enable Email/Password in Firebase Console
                  </button>
                )}
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {mode === 'login' && (
              <motion.form
                key="login-form"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                onSubmit={handleLoginSubmit}
                className="space-y-4"
              >
                <div>
                  <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
                    {t('welcomeBack')}
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-[#A5B5AC] mt-1">
                    {t('welcomeBackSub')}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-[#A5B5AC]">
                    {t('emailLabel')}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 dark:text-[#A5B5AC] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="name@email.com"
                      className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#64746B] focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-[#A5B5AC]">
                    {t('passwordLabel')}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 dark:text-[#A5B5AC] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full min-h-[46px] pl-10 pr-11 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#64746B] focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-900 dark:text-[#A5B5AC] dark:hover:text-white"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-0.5">
                  <label className="inline-flex items-center gap-2 text-slate-600 dark:text-[#A5B5AC] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-slate-300 dark:border-[#00D68F]/30 accent-[#00D68F]"
                    />
                    {t('rememberMe')}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(loginEmail);
                      setResetSent(false);
                      setErrorMsg(null);
                      setMode('forgot');
                    }}
                    className="text-[#008F5B] dark:text-[#00D68F] hover:underline font-semibold"
                  >
                    {t('forgotPassword')}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-sm hover:brightness-110 transition-all emerald-glow flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {t('signInBtn')}
                </button>

                <div className="relative py-1.5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200 dark:border-[#00D68F]/15" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white dark:bg-[#101A15] px-3 text-slate-500 dark:text-[#A5B5AC]">
                      {t('orContinueWith')}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleGoogleLogin()}
                  disabled={loading}
                  className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-[#14221B] dark:hover:bg-[#1A2D24] border border-slate-200 dark:border-[#00D68F]/25 text-slate-900 dark:text-white font-medium text-sm transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"
                    />
                  </svg>
                  <span className="whitespace-nowrap">{t('continueGoogle')}</span>
                </button>

                {/* Demo Account Quick Access */}
                <div className="pt-3 border-t border-slate-200/80 dark:border-[#00D68F]/15 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-700 dark:text-[#A5B5AC]">
                      {t('demoSectionTitle')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLoginEmail(DEMO_ACCOUNT_EMAIL)}
                      className="text-[#008F5B] dark:text-[#00D68F] hover:underline font-semibold whitespace-nowrap"
                    >
                      {t('fillDemoEmail')}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleGoogleLogin(DEMO_ACCOUNT_EMAIL)}
                    disabled={loading}
                    className="w-full min-h-[44px] py-2.5 px-3.5 rounded-xl bg-[#00A86B]/10 hover:bg-[#00A86B]/16 dark:bg-[#00D68F]/12 dark:hover:bg-[#00D68F]/20 border border-[#00A86B]/30 dark:border-[#00D68F]/30 text-[#007A4D] dark:text-[#00D68F] font-semibold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <KeyRound className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t('demoGoogleBtn')}</span>
                  </button>
                </div>
              </motion.form>
            )}

            {mode === 'register' && (
              <motion.form
                key="register-form"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                onSubmit={handleRegisterSubmit}
                className="space-y-3.5"
              >
                <div>
                  <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
                    {t('joinCarromHub')}
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-[#A5B5AC] mt-1">
                    {t('joinCarromHubSub')}
                  </p>
                </div>

                {/* Optional Profile Picture */}
                <div className="flex items-center gap-3.5 py-0.5">
                  <label className="relative cursor-pointer group shrink-0">
                    <div className="h-14 w-14 rounded-full inset-surface border border-[#00A86B]/35 dark:border-[#00D68F]/35 flex items-center justify-center overflow-hidden">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
                      ) : (
                        <Camera className="w-5 h-5 text-[#00A86B] dark:text-[#00D68F]" />
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleAvatarChange(e.target.files?.[0])}
                      className="hidden"
                    />
                  </label>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">{t('optionalPhoto')}</p>
                    <p className="text-[11px] text-slate-500 dark:text-[#A5B5AC]">{t('tapToUploadPhoto')}</p>
                  </div>
                </div>

                {/* Full Name */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-[#A5B5AC]">
                    {t('fullNameLabel')}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 dark:text-[#A5B5AC] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={lang === 'bn' ? 'আরিফ রহমান' : 'Arif Rahman'}
                      className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#64746B] focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
                    />
                  </div>
                </div>

                {/* Phone Number + Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-[#A5B5AC]">
                      {t('phoneLabel')}
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 dark:text-[#A5B5AC] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        required
                        maxLength={30}
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder={t('phonePlaceholder')}
                        className="w-full min-h-[44px] pl-9 pr-3 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#64746B] focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-[#A5B5AC]">
                      {t('emailLabel')}
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 dark:text-[#A5B5AC] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="name@email.com"
                        className="w-full min-h-[44px] pl-9 pr-3 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#64746B] focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
                      />
                    </div>
                  </div>
                </div>

                {/* Password + Confirm Password */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-[#A5B5AC]">
                      {t('passwordLabel')}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder={lang === 'bn' ? 'কমপক্ষে ৬ অক্ষর' : 'Min 6 chars'}
                        className="w-full min-h-[44px] px-3 pr-9 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#64746B] focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 dark:text-[#A5B5AC] dark:hover:text-white"
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-[#A5B5AC]">
                      {t('confirmPasswordLabel')}
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={lang === 'bn' ? 'আবার লিখুন' : 'Repeat password'}
                        className="w-full min-h-[44px] px-3 pr-9 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#64746B] focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 dark:text-[#A5B5AC] dark:hover:text-white"
                        aria-label="Toggle confirm password visibility"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-[#A5B5AC] cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 dark:border-[#00D68F]/30 accent-[#00D68F]"
                  />
                  <span className="leading-relaxed">{t('termsAccept')}</span>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-sm hover:brightness-110 transition-all emerald-glow flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {t('createAccountTab')}
                </button>
              </motion.form>
            )}

            {mode === 'forgot' && (
              <motion.div
                key="forgot-form"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                {resetSent ? (
                  <div className="space-y-4 text-center py-2">
                    <div className="mx-auto h-14 w-14 rounded-2xl bg-[#00A86B]/12 dark:bg-[#00D68F]/15 border border-[#00A86B]/30 dark:border-[#00D68F]/30 flex items-center justify-center text-[#00A86B] dark:text-[#00D68F]">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <div className="space-y-1.5">
                      <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                        {t('resetSentTitle')}
                      </h2>
                      <p className="text-sm text-slate-600 dark:text-[#A5B5AC] leading-relaxed">
                        {t('resetSentDesc', { email: resetEmail.trim() })}
                      </p>
                    </div>
                    <div className="space-y-2.5 pt-2">
                      <button
                        type="button"
                        disabled={resetCooldown || resetLoading}
                        onClick={() => void triggerPasswordReset(resetEmail)}
                        className="w-full min-h-[44px] py-2.5 px-4 rounded-xl text-sm font-medium text-slate-800 dark:text-white bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {resetLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        {resetCooldown ? t('resendWaitBtn') : t('resendResetBtn')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('login');
                          setErrorMsg(null);
                        }}
                        className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-sm flex items-center justify-center gap-2"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        {t('backToSignIn')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handlePasswordResetSubmit} className="space-y-4">
                    <div>
                      <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
                        {t('recoverTitle')}
                      </h1>
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-[#A5B5AC] mt-1 leading-relaxed">
                        {t('recoverSub')}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-700 dark:text-[#A5B5AC]">
                        {t('emailLabel')}
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 dark:text-[#A5B5AC] absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          placeholder="name@email.com"
                          className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#64746B] focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-sm hover:brightness-110 transition-all emerald-glow flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {resetLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <KeyRound className="w-4 h-4" />
                      )}
                      {t('sendResetBtn')}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setErrorMsg(null);
                      }}
                      className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-[#A5B5AC] dark:hover:text-white flex items-center justify-center gap-1.5"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      {t('backToSignIn')}
                    </button>
                  </form>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Firebase Email/Password Enablement Guide Modal */}
      <ModalDialog
        open={showConsoleGuide}
        onClose={() => setShowConsoleGuide(false)}
        title="Enable Email/Password Sign-In"
        subtitle="Google Sign-In works immediately. To also enable Email/Password login:"
        maxWidth="max-w-md"
      >
        <ol className="space-y-2.5 text-sm text-slate-600 dark:text-[#A5B5AC] list-decimal pl-5">
          <li>Open your Firebase Console and select your project.</li>
          <li>
            Go to <span className="text-slate-900 dark:text-white font-medium">Authentication → Sign-in method</span>.
          </li>
          <li>
            Click <span className="text-slate-900 dark:text-white font-medium">Add new provider → Email/Password</span>{' '}
            and toggle Enable ON.
          </li>
        </ol>
        <button
          onClick={() => {
            setShowConsoleGuide(false);
            void handleGoogleLogin(DEMO_ACCOUNT_EMAIL);
          }}
          className="mt-5 w-full min-h-[44px] py-2.5 rounded-xl bg-[#00D68F] text-[#080D0B] font-semibold text-sm"
        >
          {t('demoGoogleBtn')}
        </button>
      </ModalDialog>
    </div>
  );
}
