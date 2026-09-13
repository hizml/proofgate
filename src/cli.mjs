import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdown } from './parse.mjs';
import { loadConfig } from './config.mjs';
import { RULES } from './rules/index.mjs';
import { buildReceipt, renderMarkdown } from './receipt.mjs';

export const VERSION = '0.2.0';

const HELP = `proofgate v${VERSION} — 中文内容出厂质检员
用法:
  proofgate check <file.md> [选项]
  proofgate facts-template <file.md>     生成语义层 verdict 骨架（agent 填写）
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

  let file = null;
  let json = false;
  let noNet = false;
  let configPath = null;
  let only = null;
  let factsPath = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'check') continue;
    if (a === '--json') json = true;
    else if (a === '--no-net') noNet = true;
    else if (a === '--config') configPath = argv[++i];
    else if (a === '--only') only = new Set(argv[++i].split(',').map((s) => s.trim()));
    else if (a === '--facts') factsPath = argv[++i];
    else if (a === '--version' || a === '-v') { console.log(`proofgate ${VERSION}`); return 0; }
    else if (a === '--help' || a === '-h') { console.log(HELP); return 0; }
    else if (a.startsWith('-')) { console.error(`未知参数: ${a}`); return 2; }
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
  const { config, source } = loadConfig(configPath, path.dirname(absFile));
  const doc = parseMarkdown(raw, absFile);
  const ctx = { fetchImpl: (...args) => fetch(...args), noNet, verdict };

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
