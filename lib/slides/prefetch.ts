import { SLIDE_TEMPLATES, type SlideTemplateId } from './registry';

export async function prefetchSlideData(
    templateId: SlideTemplateId,
    baseUrl: string,
): Promise<unknown> {
    const tpl = SLIDE_TEMPLATES.find((t) => t.id === templateId);

    if (!tpl?.dataEndpoint) {
        return null;
    }

    try {
        const response = await fetch(`${baseUrl}${tpl.dataEndpoint}`, { cache: 'no-store' });

        if (!response.ok) {
            return null;
        }

        return await response.json();
    } catch {
        return null;
    }
}
