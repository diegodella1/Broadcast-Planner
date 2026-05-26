import { BrowserOutputRenderer } from '@/components/output/browser-output-renderer';
import { EmergencyOutputStub } from '@/components/output/output-stub';
import { isOutputRequestAllowed, outputAccessDeniedReason } from '@/lib/auth/output-auth';

export default async function OutputPreviewPage({
    params,
    searchParams,
}: {
    params: Promise<{ blockId: string }>;
    searchParams: Promise<{ debug?: string; startAt?: string; token?: string }>;
}) {
    const [{ blockId }, query] = await Promise.all([params, searchParams]);

    if (!(await isOutputRequestAllowed(query))) {
        return <EmergencyOutputStub reason={outputAccessDeniedReason()} />;
    }
    const startAt = query.startAt ? Number(query.startAt) : null;

    return (
        <BrowserOutputRenderer
            debug={query.debug === 'true'}
            previewBlockId={blockId}
            startAt={Number.isFinite(startAt) ? startAt : null}
            token={query.token}
        />
    );
}
