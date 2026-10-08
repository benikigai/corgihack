import fs from 'node:fs';
import crypto from 'node:crypto';

const reader = fs.readFileSync(new URL('./ads-reader.py', import.meta.url), 'utf8');
const readerPath = `~/muse/.setup/ads-reader-${crypto.createHash('sha256').update(reader).digest('hex').slice(0, 16)}.py`;
const PERIODS = new Set(['today', 'last_7d', 'last_30d']);
const MESSAGES = {
  reconnect_required: 'Your Meta connection needs to be renewed. Connect Meta Ads again, then refresh.',
  permission_required: 'Meta has not granted access to this ad account. Check the connection’s ad account permissions.',
  account_not_found: 'This ad account is no longer available through the selected Meta connection.',
  meta_unavailable: 'Meta Ads could not be loaded. Please refresh to try again.',
  invalid_request: 'Choose a valid ad account and reporting period.',
};

export class AdsError extends Error {
  constructor(code = 'meta_unavailable', status = 502) {
    super(MESSAGES[code] || MESSAGES.meta_unavailable);
    this.code = Object.hasOwn(MESSAGES, code) ? code : 'meta_unavailable';
    this.status = status;
  }
}

export function validateAdsQuery({ account = '', period = 'today', connection = '', refresh = '' } = {}) {
  if (typeof account !== 'string' || (account && !/^act_\d{1,30}$/.test(account)) || !PERIODS.has(period)
    || typeof connection !== 'string' || (connection && !/^[A-Za-z0-9_-]{1,100}$/.test(connection))
    || typeof refresh !== 'string' || !['', '0', '1'].includes(refresh)) throw new AdsError('invalid_request', 400);
  return { account, period, connection, refresh: refresh === '1' };
}

export function createAdsService({ apiKey, apiBase, appDomain, fetchImpl = fetch, now = Date.now }) {
  const cache = new Map();
  const pending = new Map();
  const installations = new Map();
  async function json(url, init = {}) {
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(150_000) });
    if (!response.ok) throw new AdsError();
    return response.json();
  }
  const hosting = (id, path) => `${apiBase}/v1/instances/${id}${path}`;
  const auth = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  async function install(id) {
    if (!installations.has(id)) {
      const promise = json(`https://${id}.${appDomain}/v1/files/content?${new URLSearchParams({ path: readerPath })}`, {
        method: 'PUT', headers: { 'X-Agent37-Key': apiKey, 'Content-Type': 'text/plain' }, body: reader,
      }).catch((error) => { installations.delete(id); throw error; });
      installations.set(id, promise);
    }
    await installations.get(id);
  }
  return async function readAds(instanceId, query) {
    const options = validateAdsQuery(query);
    const inventory = await json(hosting(instanceId, '/integrations/connections'), { headers: auth });
    const connections = (inventory.connections || []).filter((c) => c.toolkitSlug === 'metaads' && c.status === 'ACTIVE')
      .map((c, index) => ({ id: c.id, name: `Meta Ads${index ? ` ${index + 1}` : ''}` }));
    if (!connections.length) return { connection_required: true, connections: [], accounts: [], ads: [] };
    const connection = options.connection ? connections.find((c) => c.id === options.connection) : connections[0];
    if (!connection) throw new AdsError('reconnect_required', 409);
    const key = JSON.stringify([instanceId, connection.id, options.account, options.period]);
    const cached = cache.get(key);
    if (cached && !options.refresh && now() - cached.at < 90_000) return { ...cached.data, connections };
    if (!pending.has(key)) {
      const task = (async () => {
        await install(instanceId);
        const args = Buffer.from(JSON.stringify({ connection: connection.id, account: options.account, period: options.period })).toString('base64');
        const result = await json(hosting(instanceId, '/exec'), {
          method: 'POST', headers: auth,
          body: JSON.stringify({ command: `python3 ${readerPath} '${args}'` }),
        });
        if (result.exit_code !== 0) throw new AdsError();
        let data;
        try { data = JSON.parse(result.stdout); } catch { throw new AdsError(); }
        if (!data.ok) throw new AdsError(data.code);
        if (!Array.isArray(data.ads) || !Array.isArray(data.accounts) || !data.updated_at) throw new AdsError();
        const value = { ...data, connection_id: connection.id, connections, connection_required: false };
        cache.set(key, { at: now(), data: value });
        // Reuse the initial/default account result when the browser sends its selected ID.
        if (data.account?.id) cache.set(JSON.stringify([instanceId, connection.id, data.account.id, options.period]), { at: now(), data: value });
        while (cache.size > 30) cache.delete(cache.keys().next().value);
        return value;
      })().catch((err) => { throw err instanceof AdsError ? err : new AdsError(); }).finally(() => pending.delete(key));
      pending.set(key, task);
    }
    return pending.get(key);
  };
}
