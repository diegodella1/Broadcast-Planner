import { EmergencyOutputStub, OutputStub } from '@/components/output/output-stub';
import { getLivePlaybackSchedule } from '@/lib/data';
import { isOutputRequestAllowed, outputAccessDeniedReason } from '@/lib/output-auth';
import { findActiveSchedule } from '@/lib/scheduler';
import { secondsSinceMidnightInTimezone } from '@/lib/time';

export default async function OutputTimelineCompatPage({
    searchParams,
}: {
    searchParams: Promise<{ debug?: string; startAt?: string; token?: string }>;
}) {
    const params = await searchParams;

    if (!(await isOutputRequestAllowed(params))) {
        return <EmergencyOutputStub reason={outputAccessDeniedReason()} />;
    }
    const schedule = await getScheduleOrEmergency();

    if (!schedule) {
        return <EmergencyOutputStub reason="Schedule data unavailable" />;
    }
    const startAt = params.startAt ? Number(params.startAt) : null;
    const secondsOfDay = Number.isFinite(startAt) ? startAt! : secondsSinceMidnightInTimezone();

    return (
        <OutputStub
            active={findActiveSchedule(schedule, secondsOfDay)}
            secondsOfDay={secondsOfDay}
            debug={params.debug === 'true'}
            label="Output compatibility status"
        />
    );
}

async function getScheduleOrEmergency() {
    try {
        return await getLivePlaybackSchedule();
    } catch {
        return null;
    }
}
