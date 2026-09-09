// Adapted from Spell UI (MIT) https://github.com/xxtomm/spell-ui
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

interface ShimmerTextProps {
  children: React.ReactNode;
  className?: string;
  duration?: number;
  delay?: number;
}

export function ShimmerText({ children, className, duration = 1.5, delay = 1.5 }: ShimmerTextProps) {
  return (
    <div className="group overflow-hidden">
      <motion.div
        className={cn('inline-block [--shimmer-contrast:rgba(255,255,255,0.6)] dark:[--shimmer-contrast:rgba(0,0,0,0.5)]', className)}
        style={{
          WebkitTextFillColor: 'transparent',
          background: 'currentColor linear-gradient(to right, currentColor 0%, var(--shimmer-contrast) 40%, var(--shimmer-contrast) 60%, currentColor 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '50% 200%',
        } as React.CSSProperties}
        initial={{ backgroundPositionX: '250%' }}
        animate={{ backgroundPositionX: ['-100%', '250%'] }}
        transition={{ duration, delay, repeat: Infinity, repeatDelay: 1.5, ease: 'linear' }}
      >
        <span>{children}</span>
      </motion.div>
    </div>
  );
}

export default ShimmerText;
