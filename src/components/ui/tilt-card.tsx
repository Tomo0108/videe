// Adapted from Spell UI (MIT) https://github.com/xxtomm/spell-ui
import { useRef, useState, useCallback } from 'react';
import { cn } from '../../lib/utils';

export interface TiltCardProps {
  tiltLimit?: number;
  scale?: number;
  perspective?: number;
  effect?: 'gravitate' | 'evade';
  spotlight?: boolean;
  enabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export function TiltCard({
  tiltLimit = 15,
  scale = 1.05,
  perspective = 1200,
  effect = 'evade',
  spotlight = true,
  enabled = true,
  className,
  style,
  children,
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState(`perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`);
  const [spotlightPos, setSpotlightPos] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);
  const dir = effect === 'evade' ? -1 : 1;

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setTransform(`perspective(${perspective}px) rotateX(${(py - 0.5) * (tiltLimit * 2) * dir}deg) rotateY(${(px - 0.5) * -(tiltLimit * 2) * dir}deg) scale3d(${scale}, ${scale}, ${scale})`);
    if (spotlight) setSpotlightPos({ x: px * 100, y: py * 100 });
  }, [tiltLimit, scale, perspective, dir, spotlight]);

  if (!enabled) return <div className={cn('relative', className)} style={style}>{children}</div>;

  return (
    <div
      ref={cardRef}
      onPointerEnter={() => setIsHovered(true)}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        setTransform(`perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`);
        setIsHovered(false);
      }}
      className={cn('will-change-transform relative overflow-hidden', className)}
      style={{ transform, transition: 'transform 0.2s ease-out', transformStyle: 'preserve-3d', ...style }}
    >
      {children}
      {spotlight && (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" style={{ opacity: isHovered ? 1 : 0, transition: 'opacity 0.3s' }}>
          <div
            className="absolute w-[200%] h-[200%] rounded-full opacity-100 dark:opacity-50"
            style={{
              left: `${spotlightPos.x}%`,
              top: `${spotlightPos.y}%`,
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 40%)',
            }}
          />
        </div>
      )}
    </div>
  );
}
