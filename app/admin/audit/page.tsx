import { AdminShell } from '@/components/admin/admin-shell';
import { EmptyState, Field, StatusBanner } from '@/components/ui';
import { getAuditEvents } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function AuditPage({
    searchParams,
}: {
    searchParams: Promise<{ action?: string; entity?: string }>;
}) {
    const params = await searchParams;
    const events = await getAuditEvents({
        ...(params.action ? { action: params.action } : {}),
        ...(params.entity ? { entityType: params.entity } : {}),
        limit: 50,
    });
    const actions = [...new Set(events.map((event) => event.action))].sort();
    const entities = [...new Set(events.map((event) => event.entityType))].sort();

    return (
        <AdminShell
            title="Audit trail"
            description="Operational record for schedule, media, Vimeo, settings and output actions."
        >
            <StatusBanner
                tone="info"
                label="Identity mode"
                title="Bootstrap admin audit"
                detail="Multi-user roles are intentionally out of scope. Actor values are operational labels such as admin, system, vimeo-sync and manual-broadcast."
            />

            <section className="my-5 rounded-lg border border-line bg-surface p-3">
                <form className="grid gap-3 md:grid-cols-[1fr_1fr_120px]" action="/admin/audit">
                    <Field label="Action">
                        <select
                            name="action"
                            defaultValue={params.action ?? ''}
                            className="border border-line px-3 py-2 text-sm font-normal text-ink"
                        >
                            <option value="">Any action</option>
                            {actions.map((action) => (
                                <option key={action} value={action}>
                                    {action}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Entity">
                        <select
                            name="entity"
                            defaultValue={params.entity ?? ''}
                            className="border border-line px-3 py-2 text-sm font-normal text-ink"
                        >
                            <option value="">Any entity</option>
                            {entities.map((entity) => (
                                <option key={entity} value={entity}>
                                    {entity}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <button className="btn-secondary self-end">Filter</button>
                </form>
            </section>

            <div className="surface-panel overflow-hidden">
                {events.map((event) => (
                    <article
                        key={event.id}
                        className="grid gap-3 border-b border-line p-4 last:border-b-0 md:grid-cols-[190px_1fr_110px]"
                    >
                        <div>
                            <p className="text-sm font-semibold">{formatDate(event.createdAt)}</p>
                            <p className="mt-1 text-xs text-muted">{event.actor}</p>
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold">{event.action}</p>
                            <p className="mt-1 text-sm text-muted">
                                {event.entityType}
                                {event.entityId ? ` · ${event.entityId}` : ''}
                            </p>
                            <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-panel-soft p-2 text-xs text-muted">
                                {JSON.stringify(event.metadata, null, 2)}
                            </pre>
                        </div>
                        <span
                            className={
                                event.result === 'failure'
                                    ? 'h-fit rounded-full border border-danger-line bg-danger-soft px-3 py-1 text-center text-xs font-semibold text-danger-strong'
                                    : 'h-fit rounded-full border border-success-line bg-success-soft px-3 py-1 text-center text-xs font-semibold text-success-strong'
                            }
                        >
                            {event.result}
                        </span>
                    </article>
                ))}
                {events.length === 0 ? (
                    <div className="p-4">
                        <EmptyState title="No audit events">
                            Change filters or perform an admin action.
                        </EmptyState>
                    </div>
                ) : null}
            </div>
        </AdminShell>
    );
}

function formatDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value || 'unknown';
    }

    return new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
}
