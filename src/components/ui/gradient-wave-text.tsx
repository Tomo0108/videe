// Adapted from Spell UI (MIT) https://github.com/xxtomm/spell-ui
import { useRef, useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';

type Align = 'left' | 'center' | 'right';
const defaultColors = ['#8d6869', '#5a8ea6', '#b9c96e', '#c7c571', '#cb706f', '#7e5e5f'];

interface GradientWaveTextProps {
  children?: React.ReactNode;
  align?: Align;
  className?: string;
  speed?: number;
  paused?: boolean;
  delay?: number;
  repeat?: boolean;
  bottomOffset?: number;
  bandGap?: number;
  bandCount?: number;
  customColors?: string[];
}

export function GradientWaveText({
  children,
  align = 'center',
  className,
  speed = 1,
  paused = false,
  delay = 0,
  repeat = false,
  bottomOffset = 8,
  bandGap = 4,
  bandCount = 8,
  customColors,
}: GradientWaveTextProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const tRef = useRef(0);
  const cyclesDoneRef = useRef(0);
  const finishedRef = useRef(false);
  const startedRef = useRef(false);
  const startAtRef = useRef(0);
  const [isInView] = useState(true);
  const cycles = repeat ? 0 : 1;
  const resolvedColors = useMemo(() => customColors?.length ? customColors : defaultColors, [customColors]);
  const stops = useMemo(() => {
    const arr: string[] = [];
    const baseColor = 'var(--gradient-wave-base, rgb(29,29,31))';
    arr.push(`${baseColor} calc((var(--gi) + 0) * 1%)`);
    for (let i = 0; i < bandCount && i < resolvedColors.length * 2; i++) {
      arr.push(`${resolvedColors[i % resolvedColors.length]} calc((var(--gi) + ${(i + 2) * bandGap}) * 1%)`);
    }
    arr.push(`${baseColor} calc((var(--gi) + ${(bandCount + 2) * bandGap}) * 1%)`);
    return arr.join(', ');
  }, [resolvedColors, bandGap, bandCount]);
  const gradient = useMemo(() => `radial-gradient(circle at 50% bottom, ${stops})`, [stops]);

  useEffect(() => {
    const node = elRef.current;
    if (node) node.style.setProperty('--gi', '-25');
  }, []);

  useEffect(() => {
    if (!isInView) return;
    const node = elRef.current;
    if (!node) return;
    tRef.current = -25;
    cyclesDoneRef.current = 0;
    finishedRef.current = false;
    startedRef.current = false;
    startAtRef.current = performance.now() + Math.max(0, delay * 1000);
    node.style.setProperty('--gi', '-25');
  }, [isInView, delay]);

  useEffect(() => {
    const node = elRef.current;
    if (!node || !isInView) return;
    const RANGE = 200;
    let last = performance.now();
    const tick = (now: number) => {
      if (finishedRef.current) return;
      if (!startedRef.current) {
        if (now >= startAtRef.current) { startedRef.current = true; last = now; }
        else { rafRef.current = requestAnimationFrame(tick); return; }
      }
      const dt = Math.min(64, now - last);
      last = now;
      if (!paused) {
        let next = tRef.current + dt * speed / 16.6667;
        if (cycles === 0) {
          tRef.current = next % RANGE;
          node.style.setProperty('--gi', String(tRef.current));
        } else {
          while (next >= RANGE && cyclesDoneRef.current < cycles) { next -= RANGE; cyclesDoneRef.current += 1; }
          if (cyclesDoneRef.current >= cycles) {
            tRef.current = RANGE;
            node.style.setProperty('--gi', String(RANGE));
            finishedRef.current = true;
            return;
          }
          tRef.current = next;
          node.style.setProperty('--gi', String(next));
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [speed, paused, cycles, isInView]);

  return (
    <div
      ref={elRef}
      className={cn('flex w-full items-center [--gradient-wave-base:rgb(29,29,31)] dark:[--gradient-wave-base:rgb(255,255,255)]', className)}
      style={{ justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center', '--gi': -25 } as React.CSSProperties}
    >
      <span
        style={{
          textAlign: align,
          backgroundImage: gradient,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
          whiteSpace: 'pre-wrap',
          display: 'inline-block',
          paddingBottom: `${bottomOffset}%`,
          marginBottom: `-${bottomOffset}%`,
        }}
      >
        {children}
      </span>
    </div>
  );
}

export default GradientWaveText;
