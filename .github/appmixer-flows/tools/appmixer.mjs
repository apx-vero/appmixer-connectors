// Logs in to the Appmixer instance of the pipeline with ~/.config/appmixer-skills/env and returns a
// small API client.
import { readFileSync } from 'node:fs';

export async function appmixer() {
    const env = {};
    for (const line of readFileSync(process.env.HOME + '/.config/appmixer-skills/env', 'utf8').split('\n')) {
        const m = line.match(/^\s*(?:export\s+)?([A-Z_]+)=(.*)$/);
        if (m) env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
    }
    const api = env.APPMIXER_SKILL_API_URL.replace(/\/$/, '');
    const login = await fetch(api + '/user/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: env.APPMIXER_SKILL_USERNAME, password: env.APPMIXER_SKILL_PASSWORD })
    });
    const { token } = await login.json();
    if (!token) throw new Error('Appmixer login failed: ' + login.status);
    const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
    const call = async (method, path, body) => {
        const res = await fetch(api + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
        const text = await res.text();
        if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
        try { return JSON.parse(text); } catch { return text; }
    };
    return { api, call, ui: (env.APPMIXER_SKILL_UI_URL || '').replace(/\/$/, '') };
}
