import { AdminShell } from '@/components/admin/admin-shell';
import { FormHeader, MetricTile, Notice } from '@/components/ui';
import { createOperator, listOperators } from '@/lib/auth/operators';
import { getMetadataRefreshHealth } from '@/lib/media/asset-metadata';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
    const [metadataHealth, operators] = await Promise.all([
        getMetadataRefreshHealth(),
        listOperators().catch(() => []),
    ]);
    const config =
        metadataHealth.settings?.publicConfig &&
        typeof metadataHealth.settings.publicConfig === 'object'
            ? (metadataHealth.settings.publicConfig as Record<string, unknown>)
            : {};
    const lastRefresh = textValue(config.last_refresh_at) || 'Never';
    const checked = textValue(config.last_refresh_count) || '0';
    const failed = textValue(config.last_refresh_failed_count) || '0';

    async function addOperator(formData: FormData) {
        'use server';
        await createOperator({
            handle: String(formData.get('handle') || ''),
            displayName: String(formData.get('display_name') || ''),
            role: String(formData.get('role') || 'operator'),
            token: String(formData.get('token') || ''),
        });
    }

    return (
        <AdminShell title="Settings" description="Metadata refresh status and operator access.">
            <section className="mb-5 grid gap-3 md:grid-cols-3">
                <MetricTile
                    label="Last metadata refresh"
                    value={lastRefresh}
                    detail={`${checked} assets checked`}
                    tone={lastRefresh === 'Never' ? 'warn' : 'ok'}
                />
                <MetricTile
                    label="Refresh failures"
                    value={failed}
                    detail="Latest daily batch"
                    tone={failed === '0' ? 'ok' : 'warn'}
                />
                <MetricTile
                    label="Needs review"
                    value={String(metadataHealth.needsReview)}
                    detail="Public media blocked from scheduling"
                    tone={metadataHealth.needsReview === 0 ? 'ok' : 'warn'}
                />
            </section>

            {metadataHealth.settings?.lastError ? (
                <Notice tone="warn" title="Last metadata error">
                    {metadataHealth.settings.lastError}
                </Notice>
            ) : null}

            <section className="surface-panel max-w-2xl p-5">
                <FormHeader
                    title="Automatic metadata"
                    detail="Public media refresh runs daily at 04:15 in batches of 25 with concurrency 3. Manual refresh is available from Library."
                />
                <p className="mt-4 text-sm text-muted">
                    No provider account, SDK, token, or secret is required.
                </p>
            </section>

            <section className="surface-panel mt-5 max-w-2xl p-5">
                <FormHeader
                    title="Single-tenant operators"
                    detail="Create named operators for audit identity or rotate an operator token."
                />
                <form action={addOperator} className="mt-4 grid gap-3 md:grid-cols-2">
                    <input
                        name="handle"
                        required
                        placeholder="operator-handle"
                        className="border border-line px-3 py-2 text-sm"
                    />
                    <input
                        name="display_name"
                        required
                        placeholder="Display name"
                        className="border border-line px-3 py-2 text-sm"
                    />
                    <select
                        name="role"
                        defaultValue="operator"
                        className="border border-line px-3 py-2 text-sm"
                    >
                        <option value="operator">Operator</option>
                        <option value="admin">Admin</option>
                    </select>
                    <input
                        name="token"
                        type="password"
                        required
                        placeholder="Initial token"
                        className="border border-line px-3 py-2 text-sm"
                    />
                    <button className="btn-primary md:col-span-2">Create or rotate operator</button>
                </form>
                <div className="mt-4 grid gap-2">
                    {operators.map((operator) => (
                        <div
                            key={operator.id}
                            className="grid gap-2 rounded-md border border-line bg-panel-soft px-3 py-2 text-sm md:grid-cols-[1fr_120px_100px]"
                        >
                            <span>
                                {operator.displayName} ({operator.handle})
                            </span>
                            <span className="text-muted">{operator.role}</span>
                            <span className="text-muted">{operator.status}</span>
                        </div>
                    ))}
                </div>
            </section>
        </AdminShell>
    );
}

function textValue(value: unknown) {
    return value === null || value === undefined ? '' : String(value);
}
