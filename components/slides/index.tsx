'use client';

import { CalendarSlide, type CalendarSlideProps } from './CalendarSlide';
import { DebtSlide, type DebtSlideProps } from './DebtSlide';
import { EventSlide, type EventSlideProps } from './EventSlide';
import { EventSlideModern, type EventSlideModernProps } from './EventSlideModern';
import { FxSlide, type FxSlideProps } from './FxSlide';
import { GoldSlide, type GoldSlideProps } from './GoldSlide';
import { GuestLineupSlide, type GuestLineupSlideProps } from './GuestLineupSlide';
import { MetalsSlide, type MetalsSlideProps } from './MetalsSlide';
import { OilSlide, type OilSlideProps } from './OilSlide';
import { SataSlide, type SataSlideProps } from './SataSlide';
import { SilverSlide, type SilverSlideProps } from './SilverSlide';
import { StrcSlide, type StrcSlideProps } from './StrcSlide';
import {
    ChinaMarketOpenSlide,
    JapanMarketOpenSlide,
    SaudiMarketOpenSlide,
    UkMarketOpenSlide,
    UsMarketOpenSlide,
    type UsMarketOpenSlideProps,
} from './UsMarketOpenSlide';
import { WeatherSlide, type WeatherSlideProps } from './WeatherSlide';

import type { SlideTemplateId } from '@/lib/slides/registry';

export type SlideTemplateRendererProps = {
    templateId: SlideTemplateId;
    data: unknown;
};

export function SlideTemplateRenderer({ templateId, data }: SlideTemplateRendererProps) {
    switch (templateId) {
        case 'calendar':
            return <CalendarSlide {...(data as CalendarSlideProps)} />;
        case 'debt':
            return <DebtSlide {...(data as DebtSlideProps)} />;
        case 'event':
            return <EventSlide {...(data as EventSlideProps)} />;
        case 'event-modern':
            return <EventSlideModern {...(data as EventSlideModernProps)} />;
        case 'fx':
            return <FxSlide {...(data as FxSlideProps)} />;
        case 'gold':
            return <GoldSlide {...(data as GoldSlideProps)} />;
        case 'guest-lineup':
            return <GuestLineupSlide {...(data as GuestLineupSlideProps)} />;
        case 'japan-market-open':
            return <JapanMarketOpenSlide {...(data as UsMarketOpenSlideProps)} />;
        case 'metals':
            return <MetalsSlide {...(data as MetalsSlideProps)} />;
        case 'oil':
            return <OilSlide {...(data as OilSlideProps)} />;
        case 'sata':
            return <SataSlide {...(data as SataSlideProps)} />;
        case 'china-market-open':
            return <ChinaMarketOpenSlide {...(data as UsMarketOpenSlideProps)} />;
        case 'saudi-market-open':
            return <SaudiMarketOpenSlide {...(data as UsMarketOpenSlideProps)} />;
        case 'silver':
            return <SilverSlide {...(data as SilverSlideProps)} />;
        case 'strc':
            return <StrcSlide {...(data as StrcSlideProps)} />;
        case 'uk-market-open':
            return <UkMarketOpenSlide {...(data as UsMarketOpenSlideProps)} />;
        case 'us-market-open':
            return <UsMarketOpenSlide {...(data as UsMarketOpenSlideProps)} />;
        case 'weather':
            return <WeatherSlide {...(data as WeatherSlideProps)} />;
    }
}
