import { redirect } from 'next/navigation';

/** No admin page bare-linked here before this existed — this just gives
 * `/admin` typed from habit somewhere to land, now that there is an overview
 * worth landing on. */
export default function AdminIndexPage() {
  redirect('/admin/analytics');
}
