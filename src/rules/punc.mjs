import { excerptAt } from '../parse.mjs';

const CJK = '\u4e00-\u9fff';
const FULLWIDTH = { ',': '，', ';': '；', ':': '：', '?': '？', '!': '！' };

export default {
  key: 'punc',
  id: 'PUNC',
  title: '标点规范',

  run(doc) {
    const items = [];
    const halfRe = new RegExp(`([${CJK}])([,;:?!])([${CJK}])`, 'g');
    const ellRe = /(\.{3,}|。{3,})/g;

    for (const { no, text } of doc.textLines) {
      if (!text) continue;
      let m;
      halfRe.lastIndex = 0;
      while ((m = halfRe.exec(text))) {
        items.push({
          code: 'PUNC-001', severity: 'warn', line: no,
          excerpt: excerptAt(text, m.index, 3),
          message: `中文之间用了半角「${m[2]}」`,
          suggestion: `改为全角「${FULLWIDTH[m[2]]}」`,
        });
      }
      ellRe.lastIndex = 0;
      while ((m = ellRe.exec(text))) {
        items.push({
          code: 'PUNC-002', severity: 'warn', line: no,
          excerpt: excerptAt(text, m.index, m[0].length),
          message: `省略号写法「${m[0]}」不规范`,
          suggestion: '中文省略号用「……」（两个 U+2026）',
        });
      }
    }

    return { items, pass: `扫描 ${doc.textLines.length} 行，标点问题 ${items.length} 处` };
  },
};
