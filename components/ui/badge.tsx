import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors',
  {
    variants: {
      variant: {
        default: 'border-primary/30 bg-primary/10 text-primary',
        muted: 'border-border bg-secondary/60 text-muted-foreground',
        danger: 'border-destructive/40 bg-destructive/10 text-destructive',
        warn: 'border-warn/40 bg-warn/10 text-warn',
        coil: 'border-coil/40 bg-coil/10 text-coil',
        trap: 'border-trap/40 bg-trap/10 text-trap',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
