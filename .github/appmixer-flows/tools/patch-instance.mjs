#!/usr/bin/env node
// Copies the Code Block code (and an AI Agent's instructions) of a flow JSON in this folder into a
// running instance of its integration, by component label. Instances keep their own component ids
// and do not follow template changes, so a code-only change goes live this way without recreating
// the instance (its webhook URL, accounts and state stay).
//
//   node patch-instance.mjs <flow.json> <instanceId> <label>...
//
// Credentials of the Appmixer instance: ~/.config/appmixer-skills/env (APPMIXER_SKILL_API_URL,
// APPMIXER_SKILL_USERNAME, APPMIXER_SKILL_PASSWORD).
import { readFileSync } from 'node:fs';
import { appmixer } from './appmixer.mjs';

const [flowJson, instanceId, ...labels] = process.argv.slice(2);
if (!flowJson || !instanceId || !labels.length) {
    console.log('usage: node patch-instance.mjs <flow.json> <instanceId> <label>...');
    process.exit(1);
}
const { call } = await appmixer();
const lambdaOf = (c) => Object.values(Object.values(c.config.transform.in)[0])[0].lambda;
const template = JSON.parse(readFileSync(flowJson, 'utf8'));
const instance = await call('GET', `/flows/${instanceId}?projection=flow,stage`);
for (const label of labels) {
    const from = Object.values(template.flow).find((c) => c.label === label);
    const to = Object.values(instance.flow).find((c) => c.label === label);
    if (!from || !to) throw new Error(`no component labelled "${label}" in ${from ? 'the instance' : flowJson}`);
    for (const key of ['code', 'instructions']) {
        if (typeof lambdaOf(from)[key] === 'string') lambdaOf(to)[key] = lambdaOf(from)[key];
    }
}
const running = instance.stage === 'running';
if (running) await call('POST', `/flows/${instanceId}/coordinator`, { command: 'stop' });
await call('PUT', `/flows/${instanceId}`, { flow: instance.flow });
if (running) await call('POST', `/flows/${instanceId}/coordinator`, { command: 'start' });
console.log('patched', instanceId, labels.join(', '), running ? '(restarted)' : '');
