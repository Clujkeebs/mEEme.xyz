import Link from 'next/link';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/promo', label: 'Promo codes' },
  { href: '/admin/affiliates', label: 'Affiliates' },
  { href: '/admin/errors', label: 'Errors' },
];

export function AdminNav({ active }: { active: 'users' | 'promo' | 'affiliates' | 'errors' }) {
  return (
    <nav className="mt-4 flex gap-4 border-b border-border/60 pb-3 text-sm">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            'text-muted-foreground hover:text-foreground',
            link.href === `/admin/${active}` && 'font-semibold text-foreground',
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
