import dns from 'node:dns/promises';

// 链接可达性：HEAD 优先，被拒(403/405/501)回退 GET。网络异常降级为 warn——可能是反爬不是死链。
// SSRF 防护：环回/私网/链路本地/云元数据地址一律不探测；重定向手动逐跳跟，每一跳重新过黑名单。
// 将来跑在 CI/GitHub Action 上处理第三方文章时，这是必须的攻击面收敛。

function blockedIPv4(ip) {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = m.slice(1).map(Number);
  return (
    a === 127 || a === 0 || a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a >= 224
  );
}

function blockedIP(ip) {
  if (blockedIPv4(ip)) return true;
  const v6 = ip.toLowerCase();
  return (
    v6 === '::1' || v6 === '::' ||
    v6.startsWith('fe80:') ||   // 链路本地
    v6.startsWith('fc') || v6.startsWith('fd') // 私有
  );
}

async function hostAllowed(hostname) {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (h === '169.254.169.254' || h === 'metadata.google.internal') return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':')) return !blockedIP(h);
  try {
    const addrs = await dns.lookup(h, { all: true });
    return addrs.every((a) => !blockedIP(a.address));
  } catch {
    return true; // DNS 查不动就放行给 fetch，让它以 unreachable 报出
  }
}

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
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) proofgate/0.2 (+link-check)',
      Accept: '*/*',
    };

    const probe = async (url, method) => {
      let current = url;
      for (let hop = 0; hop < 3; hop++) {
        let u;
        try {
          u = new URL(current);
        } catch {
          return { err: 'bad-url' };
        }
        if (!/^https?:$/.test(u.protocol)) return { err: 'bad-url' };
        if (!(await hostAllowed(u.hostname))) return { err: 'blocked' };
        let res;
        try {
          res = await fetchImpl(current, { method, headers, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
        } catch {
          return { err: 'network' };
        }
        if ([301, 302, 303, 307, 308].includes(res.status)) {
          const loc = res.headers.get('location');
          if (loc) {
            try { current = new URL(loc, current).href; continue; } catch { /* fallthrough */ }
          }
        }
        if (res.body && typeof res.body.cancel === 'function') res.body.cancel().catch(() => {});
        return { res };
      }
      return { err: 'too-many-redirects' };
    };

    const items = [];
    let ok = 0;
    let blocked = 0;
    const queue = [...urls];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) {
        const url = queue.shift();
        const line = firstLine(doc, url);
        let r = await probe(url, 'HEAD');
        if (r.res && r.res.ok) { ok++; continue; }
        if (r.err === 'blocked') { blocked++; pushBlocked(items, line, url); continue; }
        if (!r.res || [403, 405, 501].includes(r.res.status)) {
          const r2 = await probe(url, 'GET');
          if (r2.res && r2.res.ok) { ok++; continue; }
          if (r2.err === 'blocked') { blocked++; pushBlocked(items, line, url); continue; }
          r = r2.res ? r2 : r;
        }
        if (r.res) {
          items.push({
            code: 'LINK-001', severity: 'error', line,
            excerpt: '', message: `链接不可达（HTTP ${r.res.status}）：${url}`,
            suggestion: '修正地址或删除引用',
          });
        } else {
          items.push({
            code: 'LINK-002', severity: 'warn', line,
            excerpt: '', message: `链接访问失败（超时/DNS 无解析/被拒，需人工确认）：${url}`,
            suggestion: '浏览器打开确认是否真死链',
          });
        }
      }
    });
    await Promise.all(workers);

    items.sort((a, b) => (a.line || 0) - (b.line || 0));
    return {
      items,
      pass: `检查 ${urls.length} 个链接，${ok} 个可达` + (blocked ? `，${blocked} 个内网/环回地址未探测（SSRF 防护）` : ''),
    };
  },
};

function pushBlocked(items, line, url) {
  items.push({
    code: 'LINK-003', severity: 'warn', line,
    excerpt: '', message: `内网/环回地址不探测（SSRF 防护）：${url}`,
    suggestion: '本地环境链接属正常，人工确认即可',
  });
}

function firstLine(doc, url) {
  const refs = [...doc.links, ...doc.images].filter((x) => x.url === url);
  return Math.min(...refs.map((x) => x.line));
}
