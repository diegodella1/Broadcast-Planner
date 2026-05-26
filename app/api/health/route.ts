import { NextResponse } from 'next/server';

import { notifyHealthFailures } from '@/lib/alerts';
import { requireAdmin } from '@/lib/auth';
import {
    collectOperatorHealth,
    sanitizeOperatorHealthReport,
    type OperatorHealthReport,
} from '@/lib/health-checks';

export const dynamic = 'force-dynamic';

export async function GET() {
    const report = await collectOperatorHealth();
    await notifyHealthFailures(report);

    return NextResponse.json(await responseBodyForRequester(report), {
        status: report.ok ? 200 : 503,
    });
}

async function responseBodyForRequester(report: OperatorHealthReport) {
    try {
        await requireAdmin();

        return report;
    } catch {
        return sanitizeOperatorHealthReport(report);
    }
}
