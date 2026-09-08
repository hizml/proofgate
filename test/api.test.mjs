import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { parseMarkdown } from '../src/parse.mjs';
import { DEFAULT_CONFIG } from '../src/config.mjs';
import { buildReceipt } from '../src/receipt.mjs';
import space from '../src/rules/space.mjs';
import punc from '../src/rules/punc.mjs';
import term from '../src/rules/term.mjs';
import sens from '../src/rules/sens.mjs';
import link from '../src/rules/link.mjs';
import num from '../src/rules/num.mjs';
import caseRule from '../src/rules/case.mjs';
import draft from '../src/rules/draft.mjs';
import img from '../src/rules/img.mjs';

const FIXTURE = fileURLToPath(new URL('./fixtures/article-with-issues.md', import.meta.url));
const cfg = () => structuredClone(DEFAULT_CONFIG);
const ctxNet = (fn) => ({ fetchImpl: fn, noNet: false });
const codes = (items) => [...new Set(items.map((i) => i.code))];

function docOf(text, filePath = FIXTURE) {
  return parseMarkdown(text, filePath);
}

test('解析：链接/图片抽取、代码围栏与 frontmatter 跳过', () => {
  const doc = docOf('---\ntitle: t\n---\n\n# 标题\n\n[点这](https://a.com) 和 ![图](imgs/x.png)\n\n```\n围栏内容\n```\n');
  assert.equal(doc.links.length, 1);
  assert.equal(doc.images.length, 1);
  const joined = doc.textLines.map((l) => l.text).join('\n');
  assert.ok(!joined.includes('围栏内容'));
  assert.ok(!joined.includes('title'));
  assert.ok(joined.includes('标题'));
});

test('SPACE：中文紧贴英文报警，加空格后通过', () => {
  const bad = space.run(docOf('Archify是个工具'), cfg());
  assert.ok(codes(bad.items).includes('SPACE-001'));
  const good = space.run(docOf('Archify 是个工具'), cfg());
  assert.equal(good.items.length, 0);
  // 数字默认不报（space.digit=false）
  const digit = space.run(docOf('涨了320万'), cfg());
  assert.equal(digit.items.filter((i) => i.code === 'SPACE-002').length, 0);
});

test('PUNC：中文间半角标点与英文省略号', () => {
  const r = punc.run(docOf('上个月,我看到火了:它做的...'), cfg());
  assert.deepEqual(codes(r.items).sort(), ['PUNC-001', 'PUNC-002']);
  assert.ok(r.items.find((i) => i.code === 'PUNC-001').suggestion.includes('，'));
});

test('TERM：同概念混用报警，单一写法通过', () => {
  const bad = term.run(docOf('大模型很火，LLM 也很火，大模型万岁'), cfg());
  assert.ok(codes(bad.items).includes('TERM-001'));
  const good = term.run(docOf('大模型很火，大模型万岁'), cfg());
  assert.equal(good.items.length, 0);
});

test('SENS：广告法词命中，「第一步」不误报，支持自定义扩展', () => {
  const r = sens.run(docOf('它是销量第一，堪称第一步入行的首选'), cfg());
  assert.ok(r.items.some((i) => i.message.includes('销量第一')));
  assert.equal(r.items.length, 1);
  const c = cfg();
  c.sensWords = ['黑五类'];
  const r2 = sens.run(docOf('这是黑五类产品'), c);
  assert.equal(r2.items.length, 1);
});

test('NUM：同一指标矛盾数值报警，一致不报', () => {
  const bad = num.run(docOf('月活用户320万，后来开发者月活 2,800,000；用户留存三成，官方说用户留存40%'), cfg());
  assert.equal(bad.items.filter((i) => i.code === 'NUM-001').length, 2);
  const good = num.run(docOf('月活用户320万，也就是月活 3,200,000 人'), cfg());
  assert.equal(good.items.filter((i) => i.code === 'NUM-001').length, 0);
});

test('CASE：Claude/claude 大小写不一致', () => {
  const r = caseRule.run(docOf('Claude 很强，claude 也很强，Claude 万岁'), cfg());
  assert.ok(codes(r.items).includes('CASE-001'));
  assert.equal(caseRule.run(docOf('Claude 很强'), cfg()).items.length, 0);
});

test('DRAFT：正文 TODO 报警，代码围栏内 TODO 不报', () => {
  const r = draft.run(docOf('正常段落\n\n```js\n// TODO: x\n```\n\n- TODO: 补对比\n'), cfg());
  assert.equal(r.items.length, 1);
  assert.ok(r.items[0].excerpt.includes('补对比') || r.items[0].message.includes('TODO'));
});

test('IMG：缺文件报警、空 alt 报警、存在且有 alt 通过', () => {
  const r = img.run(docOf('![封面](imgs/missing-cover.png)\n\n![](imgs/exists.png)\n\n![正常](imgs/exists.png)'), FIXTURE);
  assert.deepEqual(codes(r.items).sort(), ['IMG-001', 'IMG-002']);
});

test('LINK：200 通过、404 死链、超时降级 warn', async () => {
  const mk = (head, get) => async (url, opts = {}) => {
    if (opts.method === 'GET') return typeof get === 'function' ? get() : get;
    return typeof head === 'function' ? head() : head;
  };
  const ok200 = mk({ ok: true, status: 200 });
  const dead404 = mk({ ok: false, status: 404 }, { ok: false, status: 404 });
  const flaky = mk(() => Promise.reject(new Error('timeout')), () => Promise.reject(new Error('timeout')));

  const doc = docOf('[a](https://a.com) [b](https://b.com) [c](https://c.com)');
  assert.equal((await link.run(doc, cfg(), ctxNet(ok200))).items.length, 0);
  const r404 = await link.run(doc, cfg(), ctxNet(dead404));
  assert.equal(r404.items.length, 3);
  assert.ok(r404.items.every((i) => i.code === 'LINK-001'));
  const rFlaky = await link.run(doc, cfg(), ctxNet(flaky));
  assert.ok(rFlaky.items.every((i) => i.code === 'LINK-002'));
  // noNet 跳过
  assert.equal((await link.run(doc, cfg(), { fetchImpl: ok200, noNet: true })).items.length, 0);
});

test('回执：有硬伤 BLOCK、exit 语义正确', () => {
  const results = [
    { rule: 'SENS', title: '', items: [{ code: 'SENS-001', severity: 'error', line: 3, excerpt: '', message: 'x', suggestion: '' }], pass: null },
    { rule: 'SPACE', title: '', items: [], pass: 'ok' },
  ];
  const rec = buildReceipt({ file: 'a.md', version: '0.1.0', startedAt: '', durationMs: 1, configSource: '', noNet: true }, results);
  assert.equal(rec.verdict, 'BLOCK');
  assert.equal(rec.summary.error, 1);
});

test('CLI 冒烟：夹具文章 exit 1，回执含各规则码；--json 可解析', () => {
  const bin = fileURLToPath(new URL('../bin/proofgate.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [bin, 'check', FIXTURE, '--no-net'], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  const out = run.stdout;
  for (const code of ['SPACE-001', 'PUNC-001', 'PUNC-002', 'TERM-001', 'SENS-001', 'NUM-001', 'CASE-001', 'DRAFT-001', 'IMG-001', 'IMG-002']) {
    assert.ok(out.includes(code), `缺 ${code}`);
  }
  const json = spawnSync(process.execPath, [bin, 'check', FIXTURE, '--no-net', '--json'], { encoding: 'utf8' });
  const rec = JSON.parse(json.stdout);
  assert.equal(rec.tool, 'proofgate');
  assert.equal(rec.verdict, 'BLOCK');
});
