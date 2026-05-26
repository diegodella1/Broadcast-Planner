import { BrowserOutputRenderer } from '@/components/output/browser-output-renderer';
import { EmergencyOutputStub } from '@/components/output/output-stub';
import { isOutputRequestAllowed, outputAccessDeniedReason } from '@/lib/auth/output-auth';

export default async function OutputLivePage({
    searchParams,
}: {
    searchParams: Promise<{ debug?: string; startAt?: string; token?: string }>;
}) {
    const params = await searchParams;

    if (!(await isOutputRequestAllowed(params))) {
        return <EmergencyOutputStub reason={outputAccessDeniedReason()} />;
    }
    const startAt = params.startAt ? Number(params.startAt) : null;

    return (
        <BrowserOutputRenderer
            debug={params.debug === 'true'}
            startAt={Number.isFinite(startAt) ? startAt : null}
            token={params.token}
        />
    );
}
