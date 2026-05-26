import type { OperatorHealthReport } from './health-checks';

const sentAlerts = new Map<string, number>();

export async function notifyHealthFailures(report: OperatorHealthReport) {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;

    if (!webhookUrl || report.status !== 'fail') {
        return;
    }
    const failed = Object.values(report.checks).filter((check) => check.status === 'fail');

    if (!failed.length) {
        return;
    }
    const signature = alertSignature(report, failed);

    if (isAlertCoolingDown(signature)) {
        return;
    }

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                service: report.service,
                status: report.status,
                generatedAt: report.generatedAt,
                failed: failed.map((check) => ({
                    id: check.id,
                    label: check.label,
                    message: check.message,
                })),
            }),
        });
        sentAlerts.set(signature, Date.now());
    } catch (error) {
        console.error('[alerts] health alert failed', error);
    }
}

function alertSignature(
    report: OperatorHealthReport,
    failed: Array<OperatorHealthReport['checks'][keyof OperatorHealthReport['checks']]>,
) {
    return JSON.stringify({
        service: report.service,
        failed: failed.map((check) => [check.id, check.message]).sort(),
    });
}

function isAlertCoolingDown(signature: string) {
    const cooldownMs = Number(process.env.ALERT_WEBHOOK_COOLDOWN_MS ?? 10 * 60 * 1000);

    if (!Number.isFinite(cooldownMs) || cooldownMs <= 0) {
        return false;
    }
    const lastSentAt = sentAlerts.get(signature);

    return Boolean(lastSentAt && Date.now() - lastSentAt < cooldownMs);
}
