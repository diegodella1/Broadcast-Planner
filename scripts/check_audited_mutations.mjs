import fs from 'node:fs';

const required = [
    { path: 'lib/mutations.ts', token: 'auditedMutation' },
    { path: 'lib/settings.ts', token: 'auditedMutation' },
    { path: 'lib/reuters-credentials.ts', token: 'auditedMutation' },
    { path: 'lib/manual-broadcast.ts', token: 'recordAuditEvent' },
    { path: 'app/admin/output/page.tsx', token: 'recordAuditEvent' },
    { path: 'app/api/vimeo/sync/route.ts', token: 'recordAuditEvent' },
    { path: 'app/api/reuters/sync/route.ts', token: 'recordAuditEvent' },
];

const violations = [];

for (const item of required) {
    const source = fs.readFileSync(item.path, 'utf8');

    if (!source.includes(item.token)) {
        violations.push(`${item.path}: missing ${item.token}`);
    }
}

for (const path of ['app', 'lib']) {
    scan(path);
}

function scan(path) {
    if (!fs.existsSync(path)) {
        return;
    }
    const stat = fs.statSync(path);

    if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(path)) {
            scan(`${path}/${entry}`);
        }

        return;
    }

    if (!/\.(ts|tsx)$/.test(path)) {
        return;
    }
    const source = fs.readFileSync(path, 'utf8');

    if (path !== 'lib/audit.ts' && source.includes('.from("audit_log").insert')) {
        violations.push(`${path}: writes audit_log directly instead of using audit helpers`);
    }

    if (path !== 'lib/audit.ts' && source.includes(".from('audit_log').insert")) {
        violations.push(`${path}: writes audit_log directly instead of using audit helpers`);
    }
}

if (violations.length) {
    console.error('Audit trail guard failed:');

    for (const violation of violations) {
        console.error(`- ${violation}`);
    }
    process.exit(1);
}

console.log('audit trail guard ok');
