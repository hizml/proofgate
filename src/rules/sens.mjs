import { excerptAt } from '../parse.mjs';
import { SENS_DEFAULT_WORDS } from '../config.mjs';

// Aho-Corasick：几千词条一次线性扫描全命中，词表大小不影响文章长度复杂度
function buildAC(words) {
  const next = [{}];
  const out = [[]];
  for (const w of words) {
    let v = 0;
    for (const ch of w) {
      if (!next[v][ch]) {
        next[v][ch] = next.length;
        next.push({});
        out.push([]);
      }
      v = next[v][ch];
    }
    out[v].push(w);
  }
  const fail = new Array(next.length).fill(0);
  const queue = [];
  for (const u of Object.values(next[0])) queue.push(u);
  while (queue.length) {
    const v = queue.shift();
    for (const [ch, u] of Object.entries(next[v])) {
      let f = fail[v];
      while (f && !next[f][ch]) f = fail[f];
      fail[u] = next[f][ch] === u ? 0 : (next[f][ch] || 0);
      queue.push(u);
    }
    out[v].push(...out[fail[v]]);
  }
  return {
    scan(text) {
      let v = 0;
      const hits = [];
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        while (v && !next[v][ch]) v = fail[v];
        if (next[v][ch]) v = next[v][ch];
        if (out[v].length) {
          for (const w of out[v]) hits.push({ word: w, start: i - w.length + 1 });
        }
      }
      return hits;
    },
  };
}

export default {
  key: 'sens',
  id: 'SENS',
  title: '违禁/风险词',

  run(doc, cfg) {
    const words =
      cfg.sensMode === 'replace'
        ? (cfg.sensWords || []).filter((w) => typeof w === 'string' && w.trim())
        : [...SENS_DEFAULT_WORDS, ...(cfg.sensWords || []).filter((w) => typeof w === 'string' && w.trim())];
    if (!words.length) return { items: [], pass: '未配置词表，跳过' };

    const ac = buildAC(words.map((w) => w.toLowerCase()));
    const hits = new Map(); // 词 → { count, firstLine, excerpt }

    for (const { no, text } of doc.textLines) {
      for (const h of ac.scan(text.toLowerCase())) {
        const e = hits.get(h.word) || { count: 0, firstLine: no, excerpt: '' };
        e.count++;
        if (!e.excerpt) e.excerpt = excerptAt(text, h.start, h.word.length);
        hits.set(h.word, e);
      }
    }

    const items = [...hits.entries()].map(([w, e]) => ({
      code: 'SENS-001', severity: 'error', line: e.firstLine,
      excerpt: e.excerpt,
      message: `命中风险词「${w}」×${e.count}`,
      suggestion: '按平台规范改写或删除（默认词表=广告法绝对化用语）',
    }));

    return { items, pass: `敏感词扫描（${words.length} 词条），命中 ${items.length} 个词` };
  },
};
