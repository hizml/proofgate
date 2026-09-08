import fs from 'node:fs';
import path from 'node:path';

export default {
  key: 'img',
  id: 'IMG',
  title: '图片完整性',

  run(doc) {
    const items = [];
    for (const im of doc.images) {
      if (!im.alt || !im.alt.trim()) {
        items.push({
          code: 'IMG-002', severity: 'warn', line: im.line,
          excerpt: im.url, message: '图片缺少 alt 文字',
          suggestion: '补一句描述（无障碍 + 公众号图片摘要）',
        });
      }
      if (!/^https?:/i.test(im.url)) {
        const local = path.resolve(doc.dir, im.url.split('?')[0]);
        if (!fs.existsSync(local)) {
          items.push({
            code: 'IMG-001', severity: 'error', line: im.line,
            excerpt: im.url, message: `本地图片文件不存在：${im.url}`,
            suggestion: '确认路径或先导出图片',
          });
        }
      }
    }
    const n = doc.images.length;
    return { items, pass: n ? `检查 ${n} 张图片，全部就位` : '文中无图片' };
  },
};
