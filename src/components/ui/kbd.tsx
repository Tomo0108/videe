// Adapted from Spell UI (MIT) https://github.com/xxtomm/spell-ui
import { cn } from '../../lib/utils';

const keySymbolMap = {
  command: '⌘',
  cmd: '⌘',
  control: '⌃',
  ctrl: '⌃',
  alt: '⌥',
  option: '⌥',
  space: '␣',
  arrowleft: '←',
  left: '←',
  arrowdown: '↓',
  down: '↓',
  arrowup: '↑',
  up: '↑',
  arrowright: '→',
  right: '→',
} as const;

interface KbdProps {
  keys: string[];
  className?: string;
}

export function Kbd({ keys = [], className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'box-border align-text-top whitespace-nowrap select-none cursor-default tracking-tight rounded-[0.35em] min-w-[1.75em] shrink-0 justify-center items-center pb-[0.05em] px-[0.5em] text-[0.75em] font-normal leading-[1.7em] inline-flex relative -top-[0.03em] bg-background text-foreground shadow-[inset_0_-0.05em_0.5em_rgba(0,0,0,0.034),inset_0_0.05em_rgba(255,255,255,0.95),inset_0_0.25em_0.5em_rgba(0,0,0,0.034),inset_0_-0.05em_rgba(0,0,0,0.172),0_0_0_0.05em_rgba(0,0,0,0.134),0_0.08em_0.17em_rgba(0,0,0,0.231)] dark:shadow-[inset_0_-0.05em_0.5em_rgba(255,255,255,0.034),inset_0_0.05em_rgba(255,255,255,0.1),inset_0_0.25em_0.5em_rgba(255,255,255,0.034),inset_0_-0.05em_rgba(255,255,255,0.172),0_0_0_0.05em_rgba(255,255,255,0.134),0_0.08em_0.17em_rgba(255,255,255,0.231)]',
        className,
      )}
    >
      {keys.map((key, index) => {
        const mapped = keySymbolMap[key.toLowerCase() as keyof typeof keySymbolMap];
        return <span key={index} className={index > 0 ? 'ml-0.5' : ''}>{mapped || key}</span>;
      })}
    </kbd>
  );
}
