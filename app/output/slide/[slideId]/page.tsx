import { EmergencyOutputStub } from '@/components/output/output-stub';
import { SlideTemplateRenderer } from '@/components/slides';
import { YouTubeVideoSlide } from '@/components/slides/YouTubeVideoSlide';
import { getSlides } from '@/lib/data';
import { isOutputRequestAllowed, outputAccessDeniedReason } from '@/lib/auth/output-auth';
import { SLIDE_TEMPLATES, type SlideTemplateId } from '@/lib/slides/registry';
import { getSlideRenderData } from '@/lib/slides/render-data';
import { isYouTubeSlide } from '@/lib/slides/youtube';

export const dynamic = 'force-dynamic';

export default async function OutputSlidePage({
    params,
    searchParams,
}: {
    params: Promise<{ slideId: string }>;
    searchParams: Promise<{ token?: string }>;
}) {
    const query = await searchParams;

    if (!(await isOutputRequestAllowed(query))) {
        return <EmergencyOutputStub reason={outputAccessDeniedReason()} />;
    }

    const { slideId } = await params;
    const slide = (await getSlides()).find((candidate) => candidate.id === slideId);

    if (isYouTubeSlide(slide)) {
        return (
            <main className="h-screen w-screen overflow-hidden bg-black text-white">
                <YouTubeVideoSlide slide={slide!} />
            </main>
        );
    }
    const templateId = slide?.templateId;

    if (!slide || slide.slideType !== 'template' || !isSlideTemplateId(templateId)) {
        return <EmergencyOutputStub reason="Slide unavailable" />;
    }

    const data = await getSlideRenderData(templateId, slide);

    return (
        <main className="h-screen w-screen overflow-hidden bg-black text-white">
            <SlideTemplateRenderer templateId={templateId} data={data} />
        </main>
    );
}

function isSlideTemplateId(value: string | null | undefined): value is SlideTemplateId {
    return SLIDE_TEMPLATES.some((template) => template.id === value);
}
