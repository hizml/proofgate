// 链接可达性：HEAD 优先，被拒(403/405/501)回退 GET。网络异常降级为 warn——可能是反爬不是死链。
export default {
  key: 'link',
  id: 'LINK',
  title: '链接可达性',

  async run(doc, cfg, ctx) {
    if (ctx.noNet) return { items: [], pass: '跳过（--no-net）' };
    const urls = [
      ...new Set([...doc.links, ...doc.images].map((x) => x.url).filter((u) => /^https?:\/\//i.test(u))),
    ];
    if (!urls.length) return { items: [], pass: '文中无链接' };

    const timeoutMs = cfg.link?.timeoutMs ?? 8000;
    const concurrency = cfg.link?.concurrency ?? 8;
    const fetchImpl = ctx.fetchImpl;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) proofgate/0.1 (+link-check)',
      Accept: '*/*',
    };

    const probe = async (url, method) => {
      try {
        return await fetchImpl(url, { method, headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      } catch {
        return null;
      }
    };

    const items = [];
    let ok = 0;
    const queue = [...urls];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) {
        const url = queue.shift();
        const line = firstLine(doc, url);
        let res = await probe(url, 'HEAD');
        if (res && res.ok) { ok++; continue; }
        if (!res || [403, 405, 501].includes(res.status)) {
          const r2 = await probe(url, 'GET');
          if (r2 && r2.ok) { ok++; continue; }
          res = r2 || res;
        }
        if (res) {
          items.push({
            code: 'LINK-001', severity: 'error', line,
            excerpt: '', message: `链接不可达（HTTP ${res.status}）：${url}`,
            suggestion: '修正地址或删除引用',
          });
        } else {
          items.push({
            code: 'LINK-002', severity: 'warn', line,
            excerpt: '', message: `链接访问失败（超时或被拒，需人工确认）：${url}`,
            suggestion: '浏览器打开确认是否真死链',
          });
        }
      }
    });
    await Promise.all(workers);

    items.sort((a, b) => (a.line || 0) - (b.line || 0));
    return { items, pass: `检查 ${urls.length} 个链接，${ok} 个可达` };
  },
};

function firstLine(doc, url) {
  const refs = [...doc.links, ...doc.images].filter((x) => x.url === url);
  return Math.min(...refs.map((x) => x.line));
}
