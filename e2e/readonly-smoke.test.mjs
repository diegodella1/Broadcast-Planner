import assert from 'node:assert/strict';
import { test } from 'node:test';

const baseUrl = (process.env.RTV_BASE_URL || 'http://127.0.0.1:3450').replace(/\/$/, '');
const outputToken = process.env.OUTPUT_CAPTURE_TOKEN;
const outputQuery = outputToken
    ? `?debug=true&token=${encodeURIComponent(outputToken)}`
    : '?debug=true';
const scheduleQuery = outputToken ? `?token=${encodeURIComponent(outputToken)}` : '';

test('health endpoint is available', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.ok, true);
    const payload = await response.json();
    assert.equal(payload.ok, true);
});

test('live output is nonblank and does not expose admin chrome', async () => {
    const response = await fetch(`${baseUrl}/output/live${outputQuery}`);
    assert.equal(response.ok, true);
    const html = await response.text();
    assert.ok(html.length > 200);
    assert.equal(/<nav\b|href="\/admin/.test(html), false);
});

test('playout schedule returns expected shape', async () => {
    const response = await fetch(`${baseUrl}/api/playout/schedule${scheduleQuery}`);
    assert.equal(response.ok, true);
    const payload = await response.json();
    assert.ok(payload.schedule);
    assert.ok(Array.isArray(payload.schedule.blocks));
    assert.equal(typeof payload.secondsOfDay, 'number');
});
