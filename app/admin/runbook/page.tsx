import { redirect } from 'next/navigation';

import { isoDateInTimezone, PLAYOUT_TIMEZONE } from '@/lib/helpers/time';

export default function RunbookIndexPage() {
    redirect(`/admin/runbook/${isoDateInTimezone(new Date(), PLAYOUT_TIMEZONE)}`);
}
