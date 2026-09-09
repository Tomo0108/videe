// Adapted from Spell UI (MIT) https://github.com/xxtomm/spell-ui
import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'rounded-sm font-medium text-xs leading-none inline-flex items-center justify-center',
  {
    variants: {
      variant: {
        default: 'bg-neutral-700 text-neutral-100 dark:bg-neutral-200 dark:text-neutral-800',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border border-input bg-background',
        destructive: 'bg-destructive dark:text-destructive-foreground text-primary-foreground',
        red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
      },
      size: {
        default: 'px-1.5 py-1',
        sm: 'p-1',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'span';
  return <Comp className={cn(badgeVariants({ variant, size }), className)} ref={ref} {...props} />;
});
Badge.displayName = 'Badge';

export { Badge, badgeVariants };
