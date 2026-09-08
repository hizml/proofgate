import { excerptAt } from '../parse.mjs';

const CJK = '\u4e00-\u9fff';

export default {
  key: 'space',
  id: 'SPACE',
  title: '中西文混排空格',

  run(doc, cfg) {
    const items = [];
    const latinOn = cfg.space?.latin !== false;
    const digitOn = cfg.space?.digit === true;

    const latRe = new RegExp(`([${CJK}])([A-Za-z])|([A-Za-z])([${CJK}])`, 'g');
    const digRe = new RegExp(`([${CJK}])(\\d)|(\\d)([${CJK}])`, 'g');

    for (const { no, text } of doc.textLines) {
      if (!text) continue;
      if (latinOn) {
        let m;
        latRe.lastIndex = 0;
        while ((m = latRe.exec(text))) {
          const cjk = m[1] || m[4];
          const other = m[2] || m[3];
          items.push({
            code: 'SPACE-001', severity: 'warn', line: no,
            excerpt: excerptAt(text, m.index, 2),
            message: `中文「${cjk}」紧贴英文「${other}」`,
            suggestion: '之间加一个空格（盘古之白）',
          });
          latRe.lastIndex = m.index + 1;
        }
      }
      if (digitOn) {
        let m;
        digRe.lastIndex = 0;
        while ((m = digRe.exec(text))) {
          items.push({
            code: 'SPACE-002', severity: 'warn', line: no,
            excerpt: excerptAt(text, m.index, 2),
            message: '中文与数字之间未加空格',
            suggestion: '加空格，或在配置 space.digit 关掉此风格项',
          });
          digRe.lastIndex = m.index + 1;
        }
      }
    }

    return {
      items,
      pass: `扫描 ${doc.textLines.length} 行，中西文边界无粘连`,
    };
  },
};
