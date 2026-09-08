import { excerptAt } from '../parse.mjs';

// 发布前残留的工作标记。TODO 在代码示例里合法，所以只扫正文（解析器已跳过代码围栏）。
const MARKS = [
  { re: /\bTODO\b/i, name: 'TODO' },
  { re: /\bFIXME\b/i, name: 'FIXME' },
  { re: /\bHACK\b/i, name: 'HACK' },
  { re: /备选标题/, name: '备选标题' },
  { re: /【占位】/, name: '占位' },
  { re: /待补充|待确认/, name: '待补/待确认' },
];

export default {
  key: 'draft',
  id: 'DRAFT',
  title: '残留工作标记',

  run(doc) {
    const items = [];
    for (const { no, text } of doc.textLines) {
      for (const mark of MARKS) {
        const m = text.match(mark.re);
        if (m) {
          items.push({
            code: 'DRAFT-001', severity: 'error', line: no,
            excerpt: excerptAt(text, m.index, m[0].length),
            message: `残留工作标记「${mark.name}」`,
            suggestion: '定稿后删除或转为正式内容',
          });
        }
      }
    }
    return { items, pass: '无 TODO/备选/占位残留' };
  },
};
