import { excerptAt } from '../parse.mjs';

// 英文标识大小写一致性：同一小写形式出现 ≥2 种拼写（Claude/claude）→ 提示统一
export default {
  key: 'case',
  id: 'CASE',
  title: '英文写法一致性',

  run(doc, cfg) {
    const minLen = cfg.case?.minLength ?? 3;
    const groups = new Map(); // lower → Map(form → { count, firstLine, excerpt })
    const tokenRe = /[A-Za-z][A-Za-z0-9+#.\-]*/g;

    for (const { no, text } of doc.textLines) {
      let m;
      tokenRe.lastIndex = 0;
      while ((m = tokenRe.exec(text))) {
        const form = m[0];
        if (form.length < minLen) continue;
        const key = form.toLowerCase();
        if (!groups.has(key)) groups.set(key, new Map());
        const g = groups.get(key);
        const e = g.get(form) || { count: 0, firstLine: no, excerpt: excerptAt(text, m.index, form.length) };
        e.count++;
        g.set(form, e);
      }
    }

    const items = [];
    for (const g of groups.values()) {
      if (g.size < 2) continue;
      const parts = [...g.entries()].map(([f, e]) => `「${f}」×${e.count}`);
      const minority = [...g.entries()].sort((a, b) => a[1].count - b[1].count)[0];
      items.push({
        code: 'CASE-001', severity: 'warn',
        line: minority[1].firstLine, excerpt: minority[1].excerpt,
        message: `英文写法不一致：${parts.join(' 与 ')}`,
        suggestion: '统一为官方拼写',
      });
    }

    items.sort((a, b) => a.line - b.line);
    return { items, pass: `英文标识 ${groups.size} 个，写法一致` };
  },
};
