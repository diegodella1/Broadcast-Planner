import { AdminShell } from '@/components/admin/admin-shell';
import { CsrfInput } from '@/components/forms/csrf-input';
import { CsrfRefreshingForm } from '@/components/forms/csrf-refreshing-form';
import { MediaFilePicker } from '@/components/media/media-file-picker';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState, Field, FormHeader } from '@/components/ui';
import { getGuests, getSlides } from '@/lib/data';
import {
    archiveGuest,
    archiveGuestPlate,
    createGuest,
    createGuestPlate,
    updateGuest,
    updateGuestPlate,
} from '@/lib/mutations';
import { slidePreviewHref } from '@/lib/slide-preview';

import type { GuestStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CATEGORIES = ['bitcoin', 'macro', 'markets', 'policy', 'technology', 'culture'];

export default async function GuestsPage() {
    const [guests, slides] = await Promise.all([getGuests(), getSlides()]);
    const guestPlates = slides.filter((slide) => slide.templateId === 'guest-lineup');

    async function addGuest(formData: FormData) {
        'use server';
        const result = await createGuest(readGuestForm(formData));

        if (!result.success) {
            throw new Error(result.error);
        }
    }

    async function saveGuest(formData: FormData) {
        'use server';
        const result = await updateGuest({
            id: String(formData.get('id')),
            ...readGuestForm(formData),
        });

        if (!result.success) {
            throw new Error(result.error);
        }
    }

    async function removeGuest(formData: FormData) {
        'use server';
        const result = await archiveGuest(String(formData.get('id')));

        if (!result.success) {
            throw new Error(result.error);
        }
    }

    async function addPlate(formData: FormData) {
        'use server';
        const result = await createGuestPlate(readPlateForm(formData));

        if (!result.success) {
            throw new Error(result.error);
        }
    }

    async function savePlate(formData: FormData) {
        'use server';
        const result = await updateGuestPlate({
            slideId: String(formData.get('slide_id')),
            ...readPlateForm(formData),
        });

        if (!result.success) {
            throw new Error(result.error);
        }
    }

    async function removePlate(formData: FormData) {
        'use server';
        const result = await archiveGuestPlate(String(formData.get('slide_id')));

        if (!result.success) {
            throw new Error(result.error);
        }
    }

    const readyGuests = guests.filter((guest) => guest.status === 'ready');
    const selectableGuests = guests.filter((guest) => guest.status !== 'archived');

    return (
        <AdminShell
            title="Guests"
            description="Editorial guest records used by the on-air guest lineup plate."
        >
            <section className="surface-panel mb-5 p-4">
                <FormHeader
                    title="Guest lineup source"
                    detail="Guests marked Ready are shown by the Guest Lineup system slide. Drafts stay out of playout."
                />
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <Metric label="Ready" value={String(readyGuests.length)} />
                    <Metric label="Total" value={String(guests.length)} />
                    <Metric label="Rotation" value="9s" />
                </div>
            </section>

            <section className="mb-5">
                <form action={addGuest} className="surface-panel grid gap-3 p-4 lg:grid-cols-4">
                    <div className="lg:col-span-4">
                        <FormHeader
                            title="Add guest"
                            detail="Use real photo URLs when possible. The plate falls back to initials if the image is missing."
                        />
                    </div>
                    <GuestFields />
                    <button className="btn-primary lg:col-span-4">Add guest</button>
                </form>
            </section>

            <section className="surface-panel mb-5 p-4">
                <FormHeader
                    title="Guest plates"
                    detail="Create individual Guest Lineup plates. Each plate keeps its own selected guests and order."
                />
                <form action={addPlate} className="mt-4 grid gap-3 lg:grid-cols-[1fr_130px_130px]">
                    <input
                        name="title"
                        required
                        placeholder="Plate title"
                        className="border border-line px-3 py-2 text-sm"
                    />
                    <input
                        name="default_duration_seconds"
                        type="number"
                        min="1"
                        defaultValue="30"
                        className="border border-line px-3 py-2 text-sm"
                    />
                    <select
                        name="status"
                        defaultValue="ready"
                        className="border border-line px-3 py-2 text-sm"
                    >
                        <option value="ready">Ready</option>
                        <option value="draft">Draft</option>
                    </select>
                    <GuestCheckboxes guests={readyGuests} />
                    <button className="btn-primary lg:col-span-3">Create guest plate</button>
                </form>
            </section>

            <section className="surface-panel mb-5 overflow-hidden">
                {guestPlates.map((plate) => {
                    const selectedIds = guestIdsFromMetadata(plate.metadata);

                    return (
                        <div key={plate.id} className="border-b border-line p-4 last:border-b-0">
                            <form
                                action={savePlate}
                                className="grid gap-3 lg:grid-cols-[1fr_130px_130px_90px]"
                            >
                                <input type="hidden" name="slide_id" value={plate.id} />
                                <input
                                    name="title"
                                    required
                                    defaultValue={plate.title}
                                    className="border border-line px-3 py-2 text-sm"
                                />
                                <input
                                    name="default_duration_seconds"
                                    type="number"
                                    min="1"
                                    defaultValue={plate.defaultDurationSeconds ?? 30}
                                    className="border border-line px-3 py-2 text-sm"
                                />
                                <select
                                    name="status"
                                    defaultValue={plate.status}
                                    className="border border-line px-3 py-2 text-sm"
                                >
                                    <option value="ready">Ready</option>
                                    <option value="draft">Draft</option>
                                    <option value="archived">Archived</option>
                                </select>
                                <a
                                    className="btn-secondary justify-center"
                                    href={slidePreviewHref(plate.id)}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    View
                                </a>
                                <GuestCheckboxes
                                    guests={selectableGuests}
                                    selectedIds={selectedIds}
                                />
                                <div className="flex flex-wrap gap-2 lg:col-span-4">
                                    <button className="btn-primary">Save plate</button>
                                    <button formAction={removePlate} className="btn-secondary">
                                        Archive
                                    </button>
                                </div>
                            </form>
                        </div>
                    );
                })}
                {guestPlates.length === 0 ? (
                    <div className="p-4">
                        <EmptyState title="No guest plates yet">
                            Create one plate per lineup, then schedule it like any other graphic.
                        </EmptyState>
                    </div>
                ) : null}
            </section>

            <section className="surface-panel overflow-hidden">
                {guests.map((guest) => (
                    <div key={guest.id} className="border-b border-line p-4 last:border-b-0">
                        <form action={saveGuest} className="grid gap-3 lg:grid-cols-4">
                            <input type="hidden" name="id" value={guest.id} />
                            <div className="flex min-w-0 items-center gap-3 lg:col-span-4">
                                <div
                                    className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-panel-soft text-sm font-black"
                                    style={{ border: `3px solid ${safeColor(guest.color)}` }}
                                >
                                    {guest.photoUrl ? (
                                        <img
                                            src={guest.photoUrl}
                                            alt=""
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        initialsFor(guest.name)
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-semibold">{guest.name}</p>
                                    <p className="truncate text-sm text-muted">
                                        {[guest.role, guest.company, guest.program]
                                            .filter(Boolean)
                                            .join(' · ') || 'No details'}
                                    </p>
                                </div>
                                <StatusPill status={guest.status} />
                            </div>
                            <GuestFields guest={guest} />
                            <div className="flex flex-wrap gap-2 lg:col-span-4">
                                <button className="btn-primary">Save</button>
                                <button formAction={removeGuest} className="btn-secondary">
                                    Archive
                                </button>
                            </div>
                        </form>
                        <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            <GuestMediaUploadForm
                                guestId={guest.id}
                                kind="photo"
                                title={`${guest.name} photo`}
                            />
                            <GuestMediaUploadForm
                                guestId={guest.id}
                                kind="video"
                                title={`${guest.name} video`}
                            />
                        </div>
                    </div>
                ))}
                {guests.length === 0 ? (
                    <div className="p-4">
                        <EmptyState title="No guests yet">
                            Add the first guest, then create or schedule the Guest Lineup system
                            slide.
                        </EmptyState>
                    </div>
                ) : null}
            </section>
        </AdminShell>
    );
}

function GuestFields({ guest }: { guest?: Awaited<ReturnType<typeof getGuests>>[number] }) {
    return (
        <>
            <input type="hidden" name="photo_asset_id" value={guest?.photoAssetId ?? ''} />
            <input type="hidden" name="video_asset_id" value={guest?.videoAssetId ?? ''} />
            <Field label="Name">
                <input
                    name="name"
                    required
                    defaultValue={guest?.name ?? ''}
                    className="border border-line px-3 py-2 text-sm"
                    placeholder="Guest name"
                />
            </Field>
            <Field label="Role">
                <input
                    name="role"
                    defaultValue={guest?.role ?? ''}
                    className="border border-line px-3 py-2 text-sm"
                    placeholder="Founder, analyst, host..."
                />
            </Field>
            <Field label="Company">
                <input
                    name="company"
                    defaultValue={guest?.company ?? ''}
                    className="border border-line px-3 py-2 text-sm"
                    placeholder="Company"
                />
            </Field>
            <Field label="Status">
                <select
                    name="status"
                    defaultValue={guest?.status ?? 'ready'}
                    className="border border-line px-3 py-2 text-sm"
                >
                    <option value="ready">Ready</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                </select>
            </Field>
            <Field label="Host">
                <input
                    name="host"
                    defaultValue={guest?.host ?? ''}
                    className="border border-line px-3 py-2 text-sm"
                    placeholder="RTV host"
                />
            </Field>
            <Field label="Program">
                <input
                    name="program"
                    defaultValue={guest?.program ?? ''}
                    className="border border-line px-3 py-2 text-sm"
                    placeholder="Opening Bell"
                />
            </Field>
            <Field label="Category">
                <select
                    name="category"
                    defaultValue={guest?.category ?? 'markets'}
                    className="border border-line px-3 py-2 text-sm"
                >
                    {CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                            {category}
                        </option>
                    ))}
                </select>
            </Field>
            <Field label="Appearance time" hint="24-hour clock from the browser datetime picker.">
                <input
                    name="appearance_at"
                    type="datetime-local"
                    defaultValue={toLocalInputValue(guest?.appearanceAt)}
                    className="border border-line px-3 py-2 text-sm"
                />
            </Field>
            <Field label="Photo URL" className="lg:col-span-2">
                <input
                    name="photo_url"
                    type="url"
                    defaultValue={guest?.photoUrl ?? ''}
                    className="border border-line px-3 py-2 text-sm"
                    placeholder="https://... or upload below"
                />
            </Field>
            <Field label="Video URL" className="lg:col-span-2">
                <input
                    name="video_url"
                    type="url"
                    defaultValue={guest?.videoUrl ?? ''}
                    className="border border-line px-3 py-2 text-sm"
                    placeholder="https://... or upload below"
                />
            </Field>
            <Field label="Accent color">
                <input
                    name="color"
                    type="color"
                    defaultValue={safeColor(guest?.color)}
                    className="h-10 border border-line px-2 py-1"
                />
            </Field>
            <Field label="Order">
                <input
                    name="sort_order"
                    type="number"
                    defaultValue={guest?.sortOrder ?? 0}
                    className="border border-line px-3 py-2 text-sm"
                />
            </Field>
        </>
    );
}

function GuestCheckboxes({
    guests,
    selectedIds = [],
}: {
    guests: Awaited<ReturnType<typeof getGuests>>;
    selectedIds?: string[];
}) {
    const selected = new Set(selectedIds);

    return (
        <div className="grid gap-2 rounded-md border border-line bg-panel-soft p-3 lg:col-span-full">
            <p className="text-xs font-bold uppercase text-muted">Guests in this plate</p>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {guests.map((guest) => (
                    <label key={guest.id} className="flex min-w-0 items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            name="guest_ids"
                            value={guest.id}
                            defaultChecked={selected.has(guest.id)}
                        />
                        <span className="min-w-0 truncate">
                            {guest.name}{' '}
                            <span className="text-muted">
                                {[
                                    guest.program,
                                    guest.category,
                                    guest.status !== 'ready' ? guest.status : '',
                                ]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </span>
                        </span>
                    </label>
                ))}
            </div>
            {guests.length === 0 ? (
                <p className="text-sm text-muted">No ready guests yet.</p>
            ) : null}
        </div>
    );
}

function GuestMediaUploadForm({
    guestId,
    kind,
    title,
}: {
    guestId: string;
    kind: 'photo' | 'video';
    title: string;
}) {
    return (
        <CsrfRefreshingForm
            action="/api/guests/upload"
            method="post"
            encType="multipart/form-data"
            className="rounded-md border border-line bg-panel-soft p-3"
        >
            <CsrfInput />
            <input type="hidden" name="guest_id" value={guestId} />
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="title" value={title} />
            <input type="hidden" name="return_to" value="/admin/guests?uploaded=1" />
            <input type="hidden" name="orientation" value="auto" />
            <FormHeader
                title={kind === 'photo' ? 'Upload photo' : 'Upload video'}
                detail={
                    kind === 'photo'
                        ? 'Image replaces the photo URL for this guest.'
                        : 'Short muted video becomes the hero media for this guest.'
                }
            />
            <div className="mt-3 grid gap-3">
                <MediaFilePicker includeAudio={false} compact />
                <button className="btn-secondary">
                    {kind === 'photo' ? 'Upload photo' : 'Upload video'}
                </button>
            </div>
        </CsrfRefreshingForm>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md border border-line bg-panel-soft p-3">
            <p className="text-xs font-bold uppercase text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
    );
}

function readGuestForm(formData: FormData) {
    return {
        name: String(formData.get('name') || '').trim(),
        role: String(formData.get('role') || '').trim(),
        company: String(formData.get('company') || '').trim(),
        host: String(formData.get('host') || '').trim(),
        program: String(formData.get('program') || '').trim(),
        category: String(formData.get('category') || 'markets').trim(),
        appearanceAt: datetimeLocalToIso(String(formData.get('appearance_at') || '')),
        photoUrl: String(formData.get('photo_url') || '').trim(),
        photoAssetId: String(formData.get('photo_asset_id') || '').trim(),
        videoUrl: String(formData.get('video_url') || '').trim(),
        videoAssetId: String(formData.get('video_asset_id') || '').trim(),
        color: safeColor(String(formData.get('color') || '')),
        sortOrder: Number(formData.get('sort_order') || 0) || 0,
        status: String(formData.get('status') || 'ready') as GuestStatus,
    };
}

function readPlateForm(formData: FormData) {
    return {
        title: String(formData.get('title') || '').trim(),
        guestIds: formData.getAll('guest_ids').map(String),
        defaultDurationSeconds: Number(formData.get('default_duration_seconds') || 30) || 30,
        status: String(formData.get('status') || 'ready'),
    };
}

function guestIdsFromMetadata(metadata: Record<string, unknown> | null | undefined) {
    const guestIds = metadata?.guestIds;

    return Array.isArray(guestIds) ? guestIds.map(String).filter(Boolean) : [];
}

function datetimeLocalToIso(value: string) {
    if (!value) {
        return '';
    }
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function toLocalInputValue(value?: string | null) {
    if (!value) {
        return '';
    }
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

    return offsetDate.toISOString().slice(0, 16);
}

function initialsFor(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('');
}

function safeColor(value?: string | null) {
    return /^#[0-9a-f]{6}$/i.test(value ?? '') ? value! : '#f7931a';
}
