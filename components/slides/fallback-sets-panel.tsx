'use client';

import { arrayMove } from '@dnd-kit/sortable';
import { ArrowDown, ArrowUp, Check, Play, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import type {
    FallbackCarousel,
    FallbackCarouselCard,
    FallbackCarouselSet,
} from '@/lib/fallback-carousel';
import type { MediaAsset, SlideAsset } from '@/lib/types';

type FallbackSetsPanelProps = {
    slides: SlideAsset[];
    assets: MediaAsset[];
    carousel: FallbackCarousel | null;
    saveSet: (formData: FormData) => Promise<void>;
    activateSet: (formData: FormData) => Promise<void>;
    deleteSet: (formData: FormData) => Promise<void>;
};

type DraftCard = FallbackCarouselCard & {
    key: string;
};

export function FallbackSetsPanel({
    slides,
    assets,
    carousel,
    saveSet,
    activateSet,
    deleteSet,
}: FallbackSetsPanelProps) {
    const readySlides = useMemo(
        () => slides.filter((slide) => slide.status === 'ready').sort(sortSlides),
        [slides],
    );
    const slideById = useMemo(
        () => new Map(readySlides.map((slide) => [slide.id, slide])),
        [readySlides],
    );
    const readyVideoAssets = useMemo(
        () => assets.filter(isPlayableFallbackCarouselAsset).sort(sortAssets),
        [assets],
    );
    const assetById = useMemo(
        () => new Map(readyVideoAssets.map((asset) => [asset.id, asset])),
        [readyVideoAssets],
    );
    const activeSet =
        carousel?.sets.find((set) => set.id === carousel.activeSetId) ?? carousel?.sets[0] ?? null;
    const [setName, setSetName] = useState(activeSet?.name ?? 'Fallback loop');
    const [editingSetId, setEditingSetId] = useState<string | null>(activeSet?.id ?? null);
    const [cards, setCards] = useState<DraftCard[]>(() =>
        cardsFromSet(activeSet, readySlides, slideById, assetById),
    );
    const totalDuration = cards.reduce((total, card) => total + card.durationSeconds, 0);

    function addSlide(slide: SlideAsset) {
        setCards((current) => {
            return [
                ...current,
                {
                    key: `slide-${slide.id}-${Date.now()}-${current.length}`,
                    slideId: slide.id,
                    id: slide.id,
                    kind: 'slide',
                    durationSeconds: slide.defaultDurationSeconds ?? 30,
                },
            ];
        });
    }

    function addAsset(asset: MediaAsset) {
        setCards((current) => {
            return [
                ...current,
                {
                    key: `asset-${asset.id}-${Date.now()}-${current.length}`,
                    kind: 'asset',
                    id: asset.id,
                    assetId: asset.id,
                    durationSeconds: asset.durationSeconds ?? 30,
                },
            ];
        });
    }

    function loadSet(set: FallbackCarouselSet) {
        setSetName(set.name);
        setEditingSetId(set.id);
        setCards(cardsFromSet(set, readySlides, slideById, assetById));
    }

    function updateDuration(index: number, durationSeconds: number) {
        setCards((current) =>
            current.map((card, cardIndex) =>
                cardIndex === index
                    ? { ...card, durationSeconds: Math.max(1, Math.round(durationSeconds || 1)) }
                    : card,
            ),
        );
    }

    function moveCard(index: number, delta: number) {
        setCards((current) => {
            const nextIndex = index + delta;

            if (nextIndex < 0 || nextIndex >= current.length) {
                return current;
            }

            return arrayMove(current, index, nextIndex);
        });
    }

    function removeCard(cardKey: string) {
        setCards((current) => current.filter((item) => item.key !== cardKey));
    }

    return (
        <section className="surface-panel mb-5 overflow-hidden">
            <div className="border-b border-line p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h2 className="text-sm font-semibold">Fallback sets</h2>
                        <p className="mt-1 max-w-3xl text-sm text-muted">
                            Add ready graphics and promo/ad videos in any order, including
                            duplicates, then save one named fallback loop as active.
                        </p>
                    </div>
                    <div className="rounded-md border border-line bg-panel-soft px-3 py-2 text-xs font-semibold text-muted">
                        Active:{' '}
                        <span className="text-ink">
                            {activeSet ? activeSet.name : 'No fallback set'}
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
                <form
                    action={saveSet}
                    className="grid gap-4 border-b border-line p-4 lg:border-b-0 lg:border-r"
                >
                    <input type="hidden" name="set_id" value={editingSetId ?? ''} />
                    {cards.map((card) => (
                        <div key={`${card.key}-hidden`}>
                            <input type="hidden" name="item_kinds" value={card.kind} />
                            <input type="hidden" name="item_ids" value={card.id} />
                            <input
                                type="hidden"
                                name="durations"
                                value={String(card.durationSeconds)}
                            />
                        </div>
                    ))}

                    <label className="grid gap-1 text-xs font-semibold text-muted">
                        Set name
                        <input
                            name="name"
                            required
                            value={setName}
                            onChange={(event) => setSetName(event.target.value)}
                            className="border border-line px-3 py-2 text-sm font-normal text-ink"
                        />
                    </label>

                    <div className="grid gap-2">
                        <p className="text-xs font-semibold uppercase text-muted">Ready graphics</p>
                        <div className="grid max-h-72 gap-2 overflow-auto pr-1 md:grid-cols-2">
                            {readySlides.map((slide) => {
                                const count = countCards(cards, 'slide', slide.id);

                                return (
                                    <div
                                        key={slide.id}
                                        className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm"
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate font-semibold">
                                                {slide.title}
                                            </span>
                                            <span className="block text-xs text-muted">
                                                {slide.templateId ?? slide.slideType} ·{' '}
                                                {slide.defaultDurationSeconds ?? 30}s
                                                {count ? ` · ${count}x in loop` : ''}
                                            </span>
                                        </span>
                                        <button
                                            type="button"
                                            className="btn-secondary min-h-9 gap-1 px-2"
                                            onClick={() => addSlide(slide)}
                                            aria-label={`Add ${slide.title} to fallback loop`}
                                        >
                                            <Plus size={14} aria-hidden="true" />
                                            Add
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <p className="text-xs font-semibold uppercase text-muted">
                            Promo/ad videos
                        </p>
                        <div className="grid max-h-56 gap-2 overflow-auto pr-1 md:grid-cols-2">
                            {readyVideoAssets.map((asset) => {
                                const count = countCards(cards, 'asset', asset.id);

                                return (
                                    <div
                                        key={asset.id}
                                        className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm"
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate font-semibold">
                                                {asset.title}
                                            </span>
                                            <span className="block text-xs text-muted">
                                                {asset.assetType} · {asset.durationSeconds ?? 30}s
                                                {count ? ` · ${count}x in loop` : ''}
                                            </span>
                                        </span>
                                        <button
                                            type="button"
                                            className="btn-secondary min-h-9 gap-1 px-2"
                                            onClick={() => addAsset(asset)}
                                            aria-label={`Add ${asset.title} to fallback loop`}
                                        >
                                            <Plus size={14} aria-hidden="true" />
                                            Add
                                        </button>
                                    </div>
                                );
                            })}
                            {!readyVideoAssets.length ? (
                                <p className="rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-muted md:col-span-2">
                                    No ready promo/ad videos yet.
                                </p>
                            ) : null}
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold uppercase text-muted">Loop order</p>
                            <p className="text-xs text-muted">
                                {cards.length} items · {totalDuration}s
                            </p>
                        </div>
                        {cards.map((card, index) => {
                            const item = itemForCard(card, slideById, assetById);

                            return (
                                <div
                                    key={card.key}
                                    className="grid gap-2 rounded-md border border-line bg-panel-soft p-2 md:grid-cols-[72px_minmax(0,1fr)_96px_40px]"
                                >
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            className="grid size-8 place-items-center rounded-md border border-line"
                                            onClick={() => moveCard(index, -1)}
                                            disabled={index === 0}
                                            aria-label="Move slide up"
                                        >
                                            <ArrowUp size={14} aria-hidden="true" />
                                        </button>
                                        <button
                                            type="button"
                                            className="grid size-8 place-items-center rounded-md border border-line"
                                            onClick={() => moveCard(index, 1)}
                                            disabled={index === cards.length - 1}
                                            aria-label="Move slide down"
                                        >
                                            <ArrowDown size={14} aria-hidden="true" />
                                        </button>
                                    </div>
                                    <div className="min-w-0 self-center">
                                        <p className="truncate text-sm font-semibold">
                                            {item?.title ?? 'Missing item'}
                                        </p>
                                        <p className="text-xs text-muted">
                                            {card.kind === 'asset' ? 'Video' : 'Slide'} card{' '}
                                            {index + 1}
                                        </p>
                                    </div>
                                    <label className="grid gap-1 text-xs font-semibold text-muted">
                                        Seconds
                                        <input
                                            type="number"
                                            min="1"
                                            value={card.durationSeconds}
                                            onChange={(event) =>
                                                updateDuration(index, Number(event.target.value))
                                            }
                                            className="border border-line px-2 py-1 text-sm font-normal text-ink"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        className="grid size-10 place-items-center self-end rounded-md border border-line"
                                        onClick={() => removeCard(card.key)}
                                        aria-label="Remove item from fallback set"
                                    >
                                        <Trash2 size={15} aria-hidden="true" />
                                    </button>
                                </div>
                            );
                        })}
                        {!cards.length ? (
                            <p className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn-strong">
                                Select at least one ready graphic or promo/ad video.
                            </p>
                        ) : null}
                    </div>

                    <button className="btn-primary w-fit gap-2" disabled={!cards.length}>
                        <Plus size={15} aria-hidden="true" />
                        Save and activate set
                    </button>
                </form>

                <div className="grid content-start gap-3 p-4">
                    <p className="text-xs font-semibold uppercase text-muted">Saved sets</p>
                    {carousel?.sets.length ? (
                        carousel.sets.map((set) => (
                            <div
                                key={set.id}
                                className="rounded-md border border-line bg-surface p-3"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold">{set.name}</p>
                                        <p className="text-xs text-muted">
                                            {set.cards.length} items ·{' '}
                                            {set.cards.reduce(
                                                (total, card) => total + card.durationSeconds,
                                                0,
                                            )}
                                            s
                                        </p>
                                    </div>
                                    {set.id === carousel.activeSetId ? (
                                        <span className="inline-flex items-center gap-1 rounded-md border border-ok-line bg-ok-soft px-2 py-1 text-xs font-semibold text-ok-strong">
                                            <Check size={13} aria-hidden="true" />
                                            Active
                                        </span>
                                    ) : null}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        className="btn-secondary min-h-9"
                                        onClick={() => loadSet(set)}
                                    >
                                        Edit
                                    </button>
                                    <form action={activateSet}>
                                        <input type="hidden" name="set_id" value={set.id} />
                                        <button className="btn-secondary min-h-9 gap-2">
                                            <Play size={14} aria-hidden="true" />
                                            Set active
                                        </button>
                                    </form>
                                    <form action={deleteSet}>
                                        <input type="hidden" name="set_id" value={set.id} />
                                        <button className="btn-secondary min-h-9 gap-2">
                                            <Trash2 size={14} aria-hidden="true" />
                                            Delete
                                        </button>
                                    </form>
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-muted">
                            No saved fallback sets yet.
                        </p>
                    )}
                </div>
            </div>
        </section>
    );
}

function cardsFromSet(
    set: FallbackCarouselSet | null,
    readySlides: SlideAsset[],
    slideById: Map<string, SlideAsset>,
    assetById: Map<string, MediaAsset>,
): DraftCard[] {
    const sourceCards = set?.cards.length
        ? set.cards
        : readySlides.slice(0, 3).map((slide) => ({
              kind: 'slide' as const,
              id: slide.id,
              slideId: slide.id,
              durationSeconds: slide.defaultDurationSeconds ?? 30,
          }));

    return sourceCards
        .filter((card) => (card.kind === 'asset' ? assetById.has(card.id) : slideById.has(card.id)))
        .map((card, index) => ({
            ...card,
            key: `${card.kind}-${card.id}-${index}`,
        }));
}

function itemForCard(
    card: FallbackCarouselCard,
    slideById: Map<string, SlideAsset>,
    assetById: Map<string, MediaAsset>,
) {
    return card.kind === 'asset' ? assetById.get(card.id) : slideById.get(card.id);
}

function countCards(cards: DraftCard[], kind: FallbackCarouselCard['kind'], id: string) {
    return cards.filter((card) => card.kind === kind && card.id === id).length;
}

function sortSlides(a: SlideAsset, b: SlideAsset) {
    return a.title.localeCompare(b.title);
}

function sortAssets(a: MediaAsset, b: MediaAsset) {
    return a.title.localeCompare(b.title);
}

function isPlayableFallbackCarouselAsset(asset: MediaAsset) {
    return (
        asset.status === 'ready' &&
        asset.mediaKind === 'video' &&
        (asset.assetType === 'promo' ||
            asset.assetType === 'ad' ||
            asset.assetType === 'fallback') &&
        Boolean(asset.url || asset.storagePath)
    );
}
