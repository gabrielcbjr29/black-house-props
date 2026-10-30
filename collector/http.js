// Requisições com tempo limite, novas tentativas e limite de paralelismo.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// contador de requisições por site (vai para a aba Guia: quanto cada coleta gastou)
export const USAGE = {};
// nunca deixar chave aparecer em aviso (os avisos vão para o site publicado)
export const safeURL = u => String(u).replace(/([?&](?:apiKey|api_key|key|token)=)[^&]+/gi, '$1***');
export const countReq = url => { try { const h = new URL(url).hostname; USAGE[h] = (USAGE[h] || 0) + 1; } catch { } };

export async function getJSON(url, { headers = {}, retries = 3, timeout = 20000, quiet404 = false } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      countReq(url);
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', ...headers }, signal: ctl.signal });
      clearTimeout(t);
      if (res.status === 404 || res.status === 403) {
        const e = new Error(`HTTP ${res.status} ${safeURL(url)}`); e.status = res.status;
        if (quiet404) return null; throw e;
      }
      if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`HTTP ${res.status} ${safeURL(url)}`), { status: res.status, retry: true });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${safeURL(url)}`), { status: res.status });
      const remaining = res.headers.get('x-requests-remaining'), used = res.headers.get('x-requests-used'), last = res.headers.get('x-requests-last');
      const json = await res.json();
      if (json && typeof json === 'object') {
        if (remaining != null) Object.defineProperty(json, '__remaining', { value: +remaining, enumerable: false });
        if (used != null) Object.defineProperty(json, '__used', { value: +used, enumerable: false });
        if (last != null) Object.defineProperty(json, '__last', { value: +last, enumerable: false });
      }
      return json;
    } catch (e) {
      clearTimeout(t); lastErr = e;
      if (e.status && !e.retry) throw e;
      await new Promise(r => setTimeout(r, 600 * 2 ** i + Math.random() * 300));
    }
  }
  throw lastErr;
}

// executa tarefas assíncronas com no máximo `limit` ao mesmo tempo
export async function pool(items, limit, fn, onProgress) {
  const out = new Array(items.length); let next = 0, done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i], i); } catch (e) { out[i] = { __error: e }; }
      done++; if (onProgress) onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function normName(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}
