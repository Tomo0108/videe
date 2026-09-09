// Liquid glass control for icon-only actions.
import * as React from 'react';
import { cn } from '../../lib/utils';

interface LiquidButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  label: string;
}

export function LiquidButton({ href, label, className, children, ...props }: LiquidButtonProps) {
  return (
    <a href={href} className={cn('liquid-button', className)} aria-label={label} title={label} {...props}>
      <span className="liquid-button-fill" aria-hidden="true"/>
      <span className="liquid-button-caustic" aria-hidden="true"/>
      <span className="liquid-button-spec" aria-hidden="true"/>
      <span className="liquid-button-icon">{children}</span>
    </a>
  );
}
