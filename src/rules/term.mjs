import { excerptAt } from '../parse.mjs';

export default {
  key: 'term',
  id: 'TERM',
  title: '术语一致性',

  run(doc, cfg) {
    const groups = cfg.termGroups || [];
    const items = [];

    for (const group of groups) {
      const stats = new Map(); // 写法 → { count, firstLine, excerpt }
      for (const { no, text } of doc.textLines) {
        for (const v of group) {
          let idx = 0;
          let count = 0;
          let firstIdx = -1;
          while ((idx = text.indexOf(v, idx)) !== -1) {
            if (firstIdx < 0) firstIdx = idx;
            count++;
            idx += v.length;
          }
          if (count > 0) {
            const s = stats.get(v) || { count: 0, firstLine: no, excerpt: '' };
            s.count += count;
            if (!s.excerpt) s.excerpt = excerptAt(text, firstIdx, v.length);
            stats.set(v, s);
          }
        }
      }
      if (stats.size >= 2) {
        const parts = [...stats.entries()].map(([v, s]) => `「${v}」×${s.count}`).join(' 与 ');
        const minority = [...stats.entries()].sort((a, b) => a[1].count - b[1].count)[0];
        items.push({
          code: 'TERM-001', severity: 'warn',
          line: minority[1].firstLine,
          excerpt: minority[1].excerpt,
          message: `同一概念多种写法混用：${parts}`,
          suggestion: '全文统一为其中一种写法',
        });
      }
    }

    const checked = groups.length;
    return { items, pass: checked ? `检查 ${checked} 组术语，混用 ${items.length} 组` : '未配置术语组（termGroups），跳过' };
  },
};
