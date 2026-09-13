import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMarkdown } from './parse.mjs';
import { loadConfig, DEFAULT_CONFIG } from './config.mjs';
import { RULES } from './rules/index.mjs';
import { buildReceipt, renderMarkdown } from './receipt.mjs';

export const VERSION = '0.3.0';

const HELP = `proofgate v${VERSION} — 中文内容出厂质检员
用法:
  proofgate check <file.md> [选项]
  proofgate facts-template <file.md>     生成语义层 verdict 骨架（agent 填写）
  proofgate doctor                       引擎自检（埋雷夹具必须报出 + 干净样例必须放行）
选项:
  --json            输出机读 JSON 回执
  --facts <path>    合并语义层 verdict.json（agent 核查结果）
  --no-net          跳过链接联网检查
  --config <path>   指定配置文件
  --only <rules>    只跑指定规则（逗号分隔，如 space,punc）
  --version         版本
退出码: 0 通过 / 1 存在硬伤 / 2 用法或运行错误`;

export async function runCheck(argv) {
  if (argv[0] === 'facts-template') return factsTemplate(argv.slice(1));
  if (argv[0] === 'doctor') return doctor();

  let file = null;
  let json = false;
  let noNet = false;
  let configPath = null;
  let only = null;
  let factsPath = null;

  // 缺参数/多文件/未知规则名全部显式失败——静默吞参数会悄悄跳过检查（--facts 缺参=语义层没跑还 PASS）
  const valueAfter = (idx) => {
    const v = argv[idx + 1];
    return v === undefined || v.startsWith('-') ? null : v;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'check') continue;
    if (a === '--json') json = true;
    else if (a === '--no-net') noNet = true;
    else if (a === '--config') {
      configPath = valueAfter(i);
      if (configPath === null) { console.error(`${a} 需要一个参数值`); return 2; }
      i++;
    }
    else if (a === '--only') {
      const v = valueAfter(i);
      if (v === null) { console.error(`${a} 需要一个参数值`); return 2; }
      i++;
      const keys = v.split(',').map((s) => s.trim()).filter(Boolean);
      if (!keys.length) { console.error('--only 不能为空'); return 2; }
      const known = new Set(RULES.map((r) => r.key));
      const unknown = keys.filter((k) => !known.has(k));
      if (unknown.length) { console.error(`--only 含未知规则: ${unknown.join(',')}（可用: ${[...known].join(',')}）`); return 2; }
      only = new Set(keys);
    }
    else if (a === '--facts') {
      factsPath = valueAfter(i);
      if (factsPath === null) { console.error(`${a} 需要一个参数值`); return 2; }
      i++;
    }
    else if (a === '--version' || a === '-v') { console.log(`proofgate ${VERSION}`); return 0; }
    else if (a === '--help' || a === '-h') { console.log(HELP); return 0; }
    else if (a.startsWith('-')) { console.error(`未知参数: ${a}`); return 2; }
    else if (file) { console.error(`一次只查一个文件，收到多个: ${file} 和 ${a}`); return 2; }
    else file = a;
  }
  if (!file) { console.error(HELP); return 2; }

  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`读不了文件: ${file}（${e.message}）`);
    return 2;
  }

  let verdict = null;
  if (factsPath) {
    try {
      verdict = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
    } catch (e) {
      console.error(`读不了 --facts 文件: ${factsPath}（${e.message}）`);
      return 2;
    }
  }

  const absFile = path.resolve(file);
  const started = Date.now();
  let config;
  let source;
  try {
    ({ config, source } = loadConfig(configPath, path.dirname(absFile)));
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  const doc = parseMarkdown(raw, absFile);
  const ctx = { fetchImpl: defaultFetch, noNet, verdict };

  const results = await runAllRules(doc, config, ctx, only);

  const receipt = buildReceipt(
    {
      file: absFile,
      version: VERSION,
      startedAt: new Date(started).toISOString(),
      durationMs: Date.now() - started,
      configSource: source,
      noNet,
    },
    results
  );

  console.log(json ? JSON.stringify(receipt, null, 2) : renderMarkdown(receipt));
  return receipt.summary.error > 0 ? 1 : 0;
}

// 单条规则崩了不拖垮整张回执：变成 {RULE}-ERR 警告项，流水线看得见、其他规则照跑
const defaultFetch = (...args) => fetch(...args);

async function runAllRules(doc, config, ctx, only = null) {
  const results = [];
  for (const rule of RULES) {
    if (only && !only.has(rule.key)) continue;
    if (config.rules[rule.key] === false) continue;
    let items = [];
    let pass = null;
    try {
      const r = await rule.run(doc, config, ctx);
      items = r.items;
      pass = r.pass;
    } catch (e) {
      items = [{
        code: `${rule.id}-ERR`, severity: 'warn', line: 0, excerpt: '',
        message: `规则执行失败: ${e.message}`, suggestion: '',
      }];
    }
    results.push({ rule: rule.id, title: rule.title, items, pass });
  }
  return results;
}

// 引擎自证没坏：埋雷夹具该报的必须报出来，干净样例必须放行——双向都对才算活着
async function doctor() {
  const lines = [];
  let failed = 0;
  const mark = (pass) => (pass ? '[ok]' : (() => { failed++; return '[FAIL]'; })());

  const [major] = process.versions.node.split('.').map(Number);
  lines.push(`${mark(major >= 18)} Node.js v${process.versions.node} (requires >=18)`);

  const loaded = RULES.length >= 10 && RULES.every((r) => typeof r.run === 'function');
  lines.push(`${mark(loaded)} 规则加载 ${RULES.length} 条（机械 9 + 语义 1）`);

  const ctx = { fetchImpl: defaultFetch, noNet: true, verdict: null };

  try {
    const fixture = fileURLToPath(new URL('../test/fixtures/article-with-issues.md', import.meta.url));
    const docBad = parseMarkdown(fs.readFileSync(fixture, 'utf8'), fixture);
    const rBad = buildReceipt({}, await runAllRules(docBad, DEFAULT_CONFIG, ctx));
    const need = ['SPACE-001', 'PUNC-001', 'PUNC-002', 'TERM-001', 'SENS-001', 'NUM-001', 'CASE-001', 'DRAFT-001', 'IMG-001', 'IMG-002'];
    const got = new Set(rBad.items.map((i) => i.code));
    const missing = need.filter((c) => !got.has(c));
    lines.push(`${mark(missing.length === 0 && rBad.summary.error >= 6)} 埋雷夹具：${rBad.summary.error} 硬伤 / ${rBad.summary.warn} 建议${missing.length ? `，缺规则码 ${missing.join(', ')}` : '，关键规则码齐全'}`);

    const docGood = parseMarkdown('这是一篇干净的文章，标点规范、术语统一。\n\n数字只有一处：月活 320 万。\n', null);
    const rGood = buildReceipt({}, await runAllRules(docGood, DEFAULT_CONFIG, ctx));
    lines.push(`${mark(rGood.summary.error === 0 && rGood.verdict === 'PASS')} 干净样例：${rGood.summary.error} 硬伤 / ${rGood.summary.warn} 建议，${rGood.verdict === 'PASS' ? '放行' : '误拦'}`);
  } catch (e) {
    lines.push(`${mark(false)} 自检执行异常：${e.message}`);
  }

  lines.push('');
  lines.push(failed ? `proofgate 自检失败：${failed} 项红灯——质检结果不可信，暂停当门禁并上报` : 'proofgate 自检通过');
  console.log(lines.join('\n'));
  return failed ? 1 : 0;
}

function factsTemplate(argv) {
  const file = argv.find((a) => !a.startsWith('-'));
  if (!file) { console.error('用法: proofgate facts-template <file.md>'); return 2; }
  const absFile = path.resolve(file);
  const tpl = {
    tool: 'proofgate-verdict',
    schemaVersion: 1,
    file: absFile,
    checkedAt: new Date().toISOString(),
    claims: [
      {
        id: 'c1',
        kind: 'fact',
        claim: '（断言的独立陈述句，如：Archify 有约 5.4 万 GitHub 星）',
        line: 1,
        quote: '（原文逐字摘录，空白不敏感）',
        status: 'verified',
        evidence: [{ url: 'https://（证据链接）', note: '一句话说明证据与断言的对应关系' }],
      },
      {
        id: 'l1',
        kind: 'logic',
        claim: '（矛盾候选的完整描述，如：前文承诺三点，下文只有两点）',
        line: 1,
        quote: '（原文逐字摘录）',
        status: 'dubious',
        evidence: [{ line: 1, note: '另一处相关位置及说明' }],
      },
    ],
  };
  console.log(JSON.stringify(tpl, null, 2));
  console.error('填完删掉示例条目；契约见 schemas/verdict.schema.json；然后 proofgate check <file> --facts verdict.json');
  return 0;
}
