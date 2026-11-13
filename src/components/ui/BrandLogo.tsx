import { motion } from 'motion/react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

export function BrandLogo({ size = 'md', animated = false }: BrandLogoProps) {
  const iconDim = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-9 w-9';
  const textSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <div className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <motion.div
        className={`${iconDim} relative flex items-center justify-center rounded-xl bg-gradient-to-br from-[#00A86B]/15 to-[#008F5B]/5 dark:from-[#00D68F]/20 dark:to-[#00B87A]/5 border border-[#00A86B]/30 dark:border-[#00D68F]/35 shadow-[0_0_20px_-4px_rgba(0,214,143,0.35)]`}
        animate={animated ? { rotate: [0, 6, -6, 0], scale: [1, 1.04, 1] } : undefined}
        transition={animated ? { duration: 4, repeat: Infinity, ease: 'easeInOut' } : undefined}
      >
        <svg viewBox="0 0 36 36" className="w-6 h-6" fill="none" aria-hidden="true">
          <rect
            x="3"
            y="3"
            width="30"
            height="30"
            rx="6"
            stroke="#00B87A"
            strokeWidth="1.75"
            strokeOpacity="0.85"
          />
          <circle cx="8.5" cy="8.5" r="2.2" fill="#00B87A" fillOpacity="0.55" />
          <circle cx="27.5" cy="8.5" r="2.2" fill="#00B87A" fillOpacity="0.55" />
          <circle cx="8.5" cy="27.5" r="2.2" fill="#00B87A" fillOpacity="0.55" />
          <circle cx="27.5" cy="27.5" r="2.2" fill="#00B87A" fillOpacity="0.55" />
          <circle cx="18" cy="18" r="5.5" fill="#E11D48" stroke="#FDA4AF" strokeWidth="1.2" />
          <circle cx="18" cy="18" r="2" fill="#FFF1F2" />
        </svg>
      </motion.div>
      <span className={`${textSize} font-display font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap`}>
        CARROM <span className="text-[#00A86B] dark:text-[#00D68F]">HUB</span>
      </span>
    </div>
  );
}
