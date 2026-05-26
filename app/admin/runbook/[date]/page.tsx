import Link from 'next/link';

import { AdminShell } from '@/components/admin-shell';
import { StatusPill } from '@/components/status-pill';
import { ButtonLink, EmptyState, Notice } from '@/components/ui';
import { getRunbookState, getScheduleForDate } from '@/lib/data';
import { collectOperatorHealth } from '@/lib/health-checks';
import { updateRunbookCheck } from '@/lib/mutations';
import { liveOutputHref } from '@/lib/output-auth';
import { RUNBOOK_TEMPLATE } from '@/lib/runbook';

import type { RunbookCheckState, RunbookSection } from '@/lib/types';

export default async function OperatorRunbookPage({
    params,
}: {
    params: Promise<{ date: string }>;
}) {
    const { date } = await params;
    const [schedule, healthReport] = await Promise.all([
        getScheduleForDate(date),
        collectOperatorHealth(),
    ]);
    const state = schedule.day ? await getRunbookState(schedule.day.id) : [];
    const stateByKey = new Map(state.map((item) => [`${item.section}:${item.itemKey}`, item]));

    async function saveCheck(formData: FormData) {
        'use server';
        const currentSchedule = await getScheduleForDate(date);

        if (!currentSchedule.day) {
            throw new Error('Program day missing');
        }
        const section = String(formData.get('section')) as RunbookSection;
        const itemKey = String(formData.get('item_key'));
        const checked = formData.get('checked') === 'true';
        const notes = String(formData.get('notes') || '');
        await updateRunbookCheck({
            date,
            programDayId: currentSchedule.day.id,
            section,
            itemKey,
            checked,
            notes,
        });
    }

    const checkedCount = RUNBOOK_TEMPLATE.reduce(
        (total, section) =>
            total +
            section.items.filter(
                (item) => stateByKey.get(`${section.section}:${item.key}`)?.checked,
            ).length,
        0,
    );
    const totalCount = RUNBOOK_TEMPLATE.reduce((total, section) => total + section.items.length, 0);
    const criticalOpen = RUNBOOK_TEMPLATE.flatMap((section) =>
        section.items
            .filter(
                (item) =>
                    item.critical && !stateByKey.get(`${section.section}:${item.key}`)?.checked,
            )
            .map((item) => item.label),
    );

    return (
        <AdminShell
            title={`Operator runbook ${date}`}
            description="Persisted per-day checklist and incident notes for live operation."
            actions={
                <>
                    <ButtonLink href={`/admin/schedule/${date}`} variant="secondary">
                        Schedule
                    </ButtonLink>
                    <ButtonLink href="/admin/output" variant="secondary">
                        Control
                    </ButtonLink>
                    <ButtonLink href={liveOutputHref(true)}>Live output</ButtonLink>
                </>
            }
        >
            {healthReport.status !== 'ok' ? (
                <Notice
                    tone={healthReport.status === 'fail' ? 'danger' : 'warn'}
                    title={
                        healthReport.status === 'fail'
                            ? 'Production health failing'
                            : 'Health degraded'
                    }
                >
                    <Link href="/admin/health">Open Admin Health</Link> before handoff or live
                    operation.
                </Notice>
            ) : null}
            {!schedule.day ? (
                <EmptyState title="No program day">
                    Create a schedule for {date} before running the operator checklist.
                </EmptyState>
            ) : (
                <>
                    <section className="mb-5 grid gap-3 lg:grid-cols-3">
                        <div className="surface-card p-4">
                            <p className="eyebrow">Day</p>
                            <p className="mt-2 text-lg font-semibold">
                                {schedule.day.title ?? date}
                            </p>
                            <div className="mt-2">
                                <StatusPill status={schedule.day.status} />
                            </div>
                        </div>
                        <div className="surface-card p-4">
                            <p className="eyebrow">Progress</p>
                            <p className="mt-2 text-2xl font-semibold tabular-nums">
                                {checkedCount}/{totalCount}
                            </p>
                            <p className="mt-1 text-sm text-muted">checks complete</p>
                        </div>
                        <div className="surface-card p-4">
                            <p className="eyebrow">Critical preflight</p>
                            <p className="mt-2 text-2xl font-semibold tabular-nums">
                                {criticalOpen.length}
                            </p>
                            <p className="mt-1 text-sm text-muted">open items</p>
                        </div>
                    </section>

                    {criticalOpen.length ? (
                        <Notice tone="warn" title="Critical checks open">
                            {criticalOpen.join(', ')}
                        </Notice>
                    ) : (
                        <Notice tone="ok">Critical preflight checks are complete.</Notice>
                    )}

                    <div className="grid gap-5">
                        {RUNBOOK_TEMPLATE.map((section) => (
                            <section
                                key={section.section}
                                className="surface-panel overflow-hidden"
                            >
                                <div className="border-b border-line px-4 py-3">
                                    <h2 className="font-semibold">{section.title}</h2>
                                </div>
                                <div className="divide-y divide-line">
                                    {section.items.map((item) => {
                                        const current = stateByKey.get(
                                            `${section.section}:${item.key}`,
                                        );

                                        return (
                                            <RunbookItemForm
                                                key={item.key}
                                                action={saveCheck}
                                                section={section.section}
                                                itemKey={item.key}
                                                label={item.label}
                                                detail={item.detail}
                                                {...(item.critical ? { critical: true } : {})}
                                                {...(current ? { current } : {})}
                                            />
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                    </div>

                    <p className="mt-5 text-sm text-muted">
                        Need the full operational docs?{' '}
                        <Link href="/admin/audit" className="font-semibold underline">
                            Review audit trail
                        </Link>
                        .
                    </p>
                </>
            )}
        </AdminShell>
    );
}

function RunbookItemForm({
    action,
    section,
    itemKey,
    label,
    detail,
    critical,
    current,
}: {
    action: (formData: FormData) => Promise<void>;
    section: RunbookSection;
    itemKey: string;
    label: string;
    detail: string;
    critical?: boolean;
    current?: RunbookCheckState;
}) {
    const checked = current?.checked ?? false;

    return (
        <form action={action} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_320px_150px]">
            <input type="hidden" name="section" value={section} />
            <input type="hidden" name="item_key" value={itemKey} />
            <input type="hidden" name="checked" value={checked ? 'false' : 'true'} />
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{label}</span>
                    {critical ? (
                        <span className="rounded-full border border-warn-line bg-warn-soft px-2 py-0.5 text-[0.68rem] font-bold uppercase text-warn-strong">
                            Critical
                        </span>
                    ) : null}
                    {checked ? (
                        <span className="rounded-full border border-success-line bg-success-soft px-2 py-0.5 text-[0.68rem] font-bold uppercase text-success-strong">
                            Done
                        </span>
                    ) : null}
                </div>
                <p className="mt-1 text-sm text-muted">{detail}</p>
            </div>
            <textarea
                name="notes"
                defaultValue={current?.notes ?? ''}
                placeholder="Operator note"
                className="min-h-20 rounded-md border border-line bg-surface px-3 py-2 text-sm"
            />
            <button className={checked ? 'btn-secondary' : 'btn-primary'}>
                {checked ? 'Reopen / save' : 'Check / save'}
            </button>
        </form>
    );
}
