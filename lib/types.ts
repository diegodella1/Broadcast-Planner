export type ProgramStatus = 'draft' | 'ready' | 'active' | 'archived';
export type AssetStatus = 'draft' | 'syncing' | 'ready' | 'failed' | 'archived';
export type GuestStatus = 'draft' | 'ready' | 'archived';
export type AssetLifecycleState =
    | 'synced'
    | 'reviewed'
    | 'rejected'
    | 'stale'
    | 'expired'
    | 'scheduled_in_use';
export type PlaybackReadinessStatus = 'unchecked' | 'ready' | 'failed';
export type SourceType =
    | 'vimeo'
    | 'supabase_image'
    | 'supabase_audio'
    | 'remote_image'
    | 'remote_mp4'
    | 'hls'
    | 'rtmp'
    | 'reuters';
export type MediaKind = 'video' | 'image' | 'audio' | 'graphic';
export type BlockType = 'video' | 'image' | 'slide' | 'ad' | 'promo' | 'fallback';
export type LayerType = 'overlay' | 'image' | 'slide' | 'logo_bug' | 'lower_third' | 'promo';
export type Position =
    | 'fullscreen'
    | 'lower_third'
    | 'sidebar'
    | 'top_right'
    | 'bottom_bar'
    | 'custom';

export type BlockCategory =
    | 'mercados'
    | 'earthcam'
    | 'clima'
    | 'calendario'
    | 'trending'
    | 'deuda'
    | 'reuters'
    | 'broadcast';

export const BLOCK_CATEGORIES: readonly BlockCategory[] = [
    'mercados',
    'earthcam',
    'clima',
    'calendario',
    'trending',
    'deuda',
    'reuters',
    'broadcast',
] as const;

export type MediaAsset = {
    id: string;
    title: string;
    description?: string | null;
    sourceType: SourceType;
    mediaKind: MediaKind;
    assetType: BlockType | 'music' | 'overlay';
    url?: string | null;
    storageBucket?: string | null;
    storagePath?: string | null;
    thumbnailUrl?: string | null;
    durationSeconds?: number | null;
    status: AssetStatus;
    lifecycleState?: AssetLifecycleState;
    vimeoId?: string | null;
    vimeoUri?: string | null;
    vimeoPrivacy?: string | null;
    vimeoEmbedStatus?: string | null;
    playbackReadinessStatus?: PlaybackReadinessStatus;
    playbackCheckedAt?: string | null;
    playbackError?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
};

export type SlideAsset = {
    id: string;
    title: string;
    slideType: 'image' | 'html' | 'markdown' | 'template';
    content?: string | null;
    imageUrl?: string | null;
    htmlContent?: string | null;
    templateId?: string | null;
    defaultDurationSeconds?: number | null;
    status: 'draft' | 'ready' | 'archived';
    /** Server-prefetched data bag. slideData is populated at render time for template slides. */
    metadata?: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
};

export type Guest = {
    id: string;
    name: string;
    role?: string | null;
    company?: string | null;
    host?: string | null;
    program?: string | null;
    category: string;
    appearanceAt?: string | null;
    photoUrl?: string | null;
    photoAssetId?: string | null;
    videoUrl?: string | null;
    videoAssetId?: string | null;
    color: string;
    sortOrder: number;
    status: GuestStatus;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
};

export type ProgramDay = {
    id: string;
    airDate: string;
    timezone: string;
    status: ProgramStatus;
    title?: string | null;
    notes?: string | null;
    fallbackAssetId?: string | null;
    createdAt: string;
    updatedAt: string;
};

export type ProgramBlock = {
    id: string;
    programDayId: string;
    title: string;
    blockType: BlockType;
    category: BlockCategory;
    assetId?: string | null;
    slideId?: string | null;
    startTime: string;
    startTimeSeconds: number;
    durationSeconds: number;
    status: ProgramStatus;
    hideOverlays: boolean;
    fallbackAssetId?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
};

export type OutputOverride = {
    id: string;
    programDayId: string;
    enabled: boolean;
    sourceType: 'scheduled_block' | 'vimeo' | 'reuters' | 'slide' | 'hls' | 'remote_image';
    blockId?: string | null;
    assetId?: string | null;
    slideId?: string | null;
    streamUrl?: string | null;
    streamProtocol?: 'hls' | 'rtmp' | null;
    label?: string | null;
    expiresAt?: string | null;
    metadata?: Record<string, unknown> | null;
    createdBy?: string | null;
    createdAt: string;
    updatedAt: string;
};

export type ScheduledLayer = {
    id: string;
    programBlockId: string;
    title: string;
    layerType: LayerType;
    assetId?: string | null;
    slideId?: string | null;
    startTimeSeconds: number;
    durationSeconds: number;
    zIndex: number;
    position: Position;
    enabled: boolean;
    locked: boolean;
    createdAt: string;
    updatedAt: string;
};

export type ScheduleBundle = {
    day: ProgramDay | null;
    blocks: ProgramBlock[];
    layers: ScheduledLayer[];
    mediaAssets: MediaAsset[];
    slideAssets: SlideAsset[];
};

export type RunbookSection = 'preflight' | 'live' | 'incident' | 'shutdown';

export type RunbookCheckState = {
    id: string;
    programDayId: string;
    section: RunbookSection;
    itemKey: string;
    checked: boolean;
    notes?: string | null;
    checkedAt?: string | null;
    createdAt: string;
    updatedAt: string;
};

export type RunbookItem = {
    key: string;
    label: string;
    detail: string;
    critical?: boolean;
};

export type RunbookSectionDefinition = {
    section: RunbookSection;
    title: string;
    items: RunbookItem[];
};

export type ActiveSchedule = {
    day: ProgramDay | null;
    block: ProgramBlock | null;
    elapsedInBlock: number;
    layers: ScheduledLayer[];
    asset?: MediaAsset | null;
    slide?: SlideAsset | null;
    fallbackAsset?: MediaAsset | null;
    reason?: string;
};
