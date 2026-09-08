import path from 'node:path';

const FENCE_RE = /^\s*(```|~~~)/;

// 输出两类结构：
// - textLines：逐行清洗后的正文（跳过 frontmatter/代码围栏），给文本类规则用，行号保真
// - links / images：从原始行里抽的引用，给 LINK/IMG 规则用
export function parseMarkdown(raw, filePath) {
  const lines = raw.split(/\r?\n/);
  const textLines = [];
  const links = [];
  const images = [];
  let inFence = false;
  let inFront = lines[0] !== undefined && lines[0].trim() === '---';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const no = i + 1;

    if (inFront) {
      if (no > 1 && rawLine.trim() === '---') inFront = false;
      continue;
    }
    if (FENCE_RE.test(rawLine)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    collectInline(rawLine, no, links, images);
    const text = cleanInline(rawLine);
    textLines.push({ no, text, raw: rawLine });
  }

  return {
    raw,
    lines,
    filePath: filePath || null,
    dir: filePath ? path.dirname(filePath) : '.',
    textLines,
    links,
    images,
  };
}

export function excerptAt(text, start, len = 0, radius = 14) {
  if (!text) return '';
  const from = Math.max(0, start - radius);
  const to = Math.min(text.length, start + len + radius);
  const left = from > 0 ? '…' : '';
  const right = to < text.length ? '…' : '';
  return left + text.slice(from, to).trim() + right;
}

function collectInline(text, line, links, images) {
  const imgRe = /!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g;
  let m;
  while ((m = imgRe.exec(text))) images.push({ alt: m[1], url: m[2], line });
  const linkRe = /(?<!\!)\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g;
  while ((m = linkRe.exec(text))) links.push({ text: m[1], url: m[2], line });
}

// 去掉 markdown 标记，保留自然语言文本：图片/链接/行内代码/裸链接清掉，强调符号和行首标记剥掉
function cleanInline(s) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`[^`]*`/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^(?:\s*>\s?)+/, '')
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/[*_~]{1,3}/g, '')
    .trim();
}
