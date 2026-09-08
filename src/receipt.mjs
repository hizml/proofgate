// 回执是对外契约：schema 稳定，别人集成时靠它。规则码同理，只增不改语义。
export function buildReceipt(meta, results) {
  const items = results.flatMap((r) =>
    r.items.map((it) => ({ rule: r.rule, ...it }))
  );
  const error = items.filter((i) => i.severity === 'error').length;
  const warn = items.filter((i) => i.severity === 'warn').length;
  const passes = results
    .filter((r) => r.items.length === 0 && r.pass)
    .map((r) => ({ rule: r.rule, summary: r.pass }));
  return {
    tool: 'proofgate',
    ...meta,
    summary: { error, warn, ruleRun: results.length, pass: passes.length },
    verdict: error > 0 ? 'BLOCK' : 'PASS',
    items,
    passes,
  };
}

export function renderMarkdown(rec) {
  const L = [];
  const errs = rec.items.filter((i) => i.severity === 'error');
  const warns = rec.items.filter((i) => i.severity === 'warn');

  L.push('# 出厂质检单', '');
  L.push(`- 文件：${rec.file}`);
  L.push(
    `- proofgate v${rec.version} · ${rec.startedAt} · 用时 ${rec.durationMs}ms · 联网检查：${rec.noNet ? '关' : '开'} · 配置：${rec.configSource}`
  );

  L.push('', `## 硬伤 ${errs.length} 项${errs.length ? '（建议拦下出厂）' : ''}`);
  if (!errs.length) L.push('无');
  for (const it of errs) L.push(itemLine(it, '✗'));

  L.push('', `## 规范 ${warns.length} 处（建议修）`);
  if (!warns.length) L.push('无');
  for (const it of warns) L.push(itemLine(it, '△'));

  L.push('', `## 通过 ${rec.summary.pass} 项`);
  for (const p of rec.passes) L.push(`- ✓ ${p.rule} ${p.summary}`);

  L.push('', '## 结论');
  if (rec.verdict === 'BLOCK') {
    L.push(`- 拦下：修复 ${errs.length} 项硬伤后重跑（proofgate check <file>）`);
  } else {
    L.push('- 放行：未发现硬伤；规范项按需处理');
  }
  return L.join('\n');
}

function itemLine(it, mark) {
  const where = it.line ? ` L${it.line}` : '';
  const ex = it.excerpt ? ` 「${it.excerpt}」` : '';
  const sg = it.suggestion ? ` → ${it.suggestion}` : '';
  return `- ${mark} ${it.code}${where} ${it.message}${ex}${sg}`;
}
