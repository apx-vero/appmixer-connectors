#!/usr/bin/env node
// Creates a running instance of a published integration template — what the Automation Hub wizard
// does, scripted: clone the template, link the instance to it, bind the accounts, replace the
// <PLACEHOLDER>s of the flow with values from a local secrets file, start it, and optionally stop
// and delete the instance it replaces. Prints the instance's webhook URL (if it has a Webhook
// trigger) into a file readable only by you, never to the terminal.
//
//   node new-instance.mjs <templateId> "<integration name>" \
//       --account appmixer:github=<accountId> [--account appmixer:ai:claude=<accountId>] \
//       [--secrets ~/.config/appmixer-pipeline/secrets.json] [--webhook-url-file <file>] [--replace <oldInstanceId>]
//
// The secrets file is a JSON object of placeholder → value, kept outside the repo, e.g.
//   { "OPENCLAW_HOOK_TOKEN": "…", "PRE_RELEASE_FLOW_URL": "https://…", "STAGE_RESULT_URL": "https://…" }
// Every <NAME> in a component's lambda values whose NAME is a key is replaced.
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { appmixer } from './appmixer.mjs';

const args = process.argv.slice(2);
const [templateId, name] = args;
const opt = (flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));
if (!templateId || !name || !opt('--account').length) {
    console.log('usage: node new-instance.mjs <templateId> "<name>" --account <service>=<accountId>... [--secrets <file>] [--webhook-url-file <file>] [--replace <id>]');
    process.exit(1);
}
const secretsFile = (opt('--secrets')[0] || '~/.config/appmixer-pipeline/secrets.json').replace(/^~/, process.env.HOME);
let secrets = {};
try { secrets = JSON.parse(readFileSync(secretsFile, 'utf8')); } catch { /* a flow without placeholders needs none */ }
const accounts = Object.fromEntries(opt('--account').map((a) => [a.slice(0, a.lastIndexOf('=')), a.slice(a.lastIndexOf('=') + 1)]));

const { api, call, ui } = await appmixer();
await call('POST', `/flows/${templateId}/clone`, { setOriginFlowId: true, additional: { type: 'integration-instance' } });
// The clone answer carries no flowId: take the newest unlinked instance of that name
const list = await call('GET', '/flows?filter=type:integration-instance&projection=flowId,name,templateId,btime&limit=500');
const created = list.filter((f) => f.name === name && !f.templateId).sort((a, b) => b.btime.localeCompare(a.btime))[0];
if (!created) throw new Error(`no new instance named "${name}" — is the template's name exactly that?`);
const flowId = created.flowId;
await call('PUT', `/flows/${flowId}`, { templateId, name });

const flow = (await call('GET', `/flows/${flowId}?projection=flow`)).flow;
const missing = new Set();
const fill = (value) => value.replace(/<([A-Z][A-Z0-9_]+)>/g, (m, key) => (key in secrets ? secrets[key] : (missing.add(key), m)));
const byService = {};
let hookId = null;
for (const [id, c] of Object.entries(flow)) {
    if (c.type === 'appmixer.utils.http.WebhookTrigger') hookId = id;
    const service = Object.keys(accounts).find((s) => c.type.startsWith(s.replace(/:/g, '.') + '.'));
    if (service) (byService[service] = byService[service] || []).push(id);
    for (const port of Object.values((c.config && c.config.transform && c.config.transform.in) || {})) {
        for (const t of Object.values(port)) {
            for (const [k, v] of Object.entries(t.lambda || {})) if (typeof v === 'string') t.lambda[k] = fill(v);
        }
    }
}
await call('PUT', `/flows/${flowId}`, { flow });
for (const [service, ids] of Object.entries(byService)) {
    await call('PUT', `/auth/account/${accounts[service]}/components`, { componentIDs: ids });
}
const auth = await call('GET', `/auth/flow/${flowId}`);
console.log('instance', flowId, '| accounts', JSON.stringify(Object.fromEntries(Object.entries(byService).map(([s, i]) => [s, i.length]))),
    '| auth errors', JSON.stringify(auth.errors || {}), missing.size ? '| UNFILLED: ' + [...missing].join(', ') : '');

const urlFile = opt('--webhook-url-file')[0];
if (urlFile && hookId) {
    writeFileSync(urlFile, `${api}/flows/${flowId}/components/${hookId}\n`, { mode: 0o600 });
    chmodSync(urlFile, 0o600);
    console.log('webhook URL written to', urlFile);
}
const old = opt('--replace')[0];
if (old) {
    const o = await call('GET', `/flows/${old}?projection=flowId,name,type,stage`);
    if (o.type !== 'integration-instance' || o.name !== name) throw new Error(`refusing to delete ${old}: not an instance of "${name}"`);
    if (o.stage === 'running') await call('POST', `/flows/${old}/coordinator`, { command: 'stop' });
    await call('DELETE', `/flows/${old}`);
    console.log('replaced and deleted', old);
}
await call('POST', `/flows/${flowId}/coordinator`, { command: 'start' });
console.log('started:', (ui || api) + '/designer/' + flowId);
