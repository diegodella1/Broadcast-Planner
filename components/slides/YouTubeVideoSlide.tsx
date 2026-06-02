import { getYouTubeSlideConfig, youTubeEmbedUrl } from '@/lib/slides/youtube';

import type { SlideAsset } from '@/lib/types';

type YouTubeVideoSlideProps = {
    slide: SlideAsset;
};

export function YouTubeVideoSlide({ slide }: YouTubeVideoSlideProps) {
    const config = getYouTubeSlideConfig(slide);

    if (!config) {
        return (
            <section className="grid h-screen w-screen place-items-center bg-black text-white">
                <p className="text-3xl font-semibold">YouTube video unavailable</p>
            </section>
        );
    }
    const zoomClass = config.zoom === 1.25 ? 'scale-125' : 'scale-100';

    return (
        <section className="relative h-screen w-screen overflow-hidden bg-black">
            <iframe
                className={`absolute inset-0 h-full w-full origin-center border-0 ${zoomClass}`}
                src={youTubeEmbedUrl(config)}
                title={slide.title}
                allow="autoplay; encrypted-media; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
            />
        </section>
    );
}
