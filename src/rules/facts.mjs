// 语义层入口：agent 按 schemas/verdict.schema.json 核查断言后回填，
// 引擎只做契约校验（字段/行号/原文摘录真实性）+ 三态映射排版，零 LLM。
// 断言对错、证据真伪是 agent 的责任——回执上每条都带证据链，读者可验。

const STATUS = new Set(['verified', 'dubious', 'unfound']);

function normalize(s) {
  return String(s).replace(/\s+/g, '');
}

export function validateVerdict(verdict, doc) {
  const errs = [];
  const claims = verdict?.claims;
  const rawNorm = normalize(doc.raw);
  if (verdict?.file && verdict.file !== doc.filePath) {
    errs.push(`file 不匹配：verdict 指向 ${verdict.file}，实际 ${doc.filePath}`);
  }
  if (!Array.isArray(claims)) {
    errs.push('verdict.claims 必须是数组');
    return { errs, claims: [] };
  }
  claims.forEach((c, i) => {
    const where = c?.id ? `claims[${c.id}]` : `claims[${i}]`;
    if (!c || typeof c.claim !== 'string' || !c.claim.trim()) errs.push(`${where}: 缺 claim`);
    if (!c || typeof c.line !== 'number' || c.line < 1 || c.line > doc.lines.length) {
      errs.push(`${where}: line 越界（1-${doc.lines.length}）`);
    }
    if (!c || !STATUS.has(c.status)) errs.push(`${where}: status 必须是 verified|dubious|unfound`);
    if (!c || typeof c.quote !== 'string' || !c.quote.trim()) {
      errs.push(`${where}: 缺 quote`);
    } else if (!rawNorm.includes(normalize(c.quote))) {
      errs.push(`${where}: quote 在原文中找不到（须逐字摘录）`);
    }
    if (c && c.status === 'verified' && !Array.isArray(c.evidence)) {
      errs.push(`${where}: verified 必须附 evidence`);
    }
    if (c && Array.isArray(c.evidence)) {
      for (const e of c.evidence) {
        if (!e || (!e.url && e.line == null && !e.note)) errs.push(`${where}: evidence 条目至少要有 url/line/note 之一`);
      }
    }
  });
  return { errs, claims };
}

function evidenceNote(c) {
  const ev = c.evidence || [];
  const refs = ev.map((e) => e.url || (e.line != null ? `L${e.line}` : '')).filter(Boolean);
  const note = ev.map((e) => e?.note).filter(Boolean)[0];
  return `${note || '人工裁决'}${refs.length ? `（${refs.join('；')}）` : ''}`;
}

export default {
  key: 'facts',
  id: 'FACT',
  title: '断言核查（语义层）',

  run(doc, cfg, ctx) {
    if (!ctx.verdict) {
      return { items: [], pass: '跳过（未提供 --facts；语义层由 agent 编排，见 skill 工作流）' };
    }
    const { errs, claims } = validateVerdict(ctx.verdict, doc);
    if (errs.length) {
      return {
        items: errs.map((e) => ({
          code: 'FACT-ERR', severity: 'error', line: 0, excerpt: '',
          message: `verdict 契约违规：${e}`,
          suggestion: '按 schemas/verdict.schema.json 修正后重跑',
        })),
        pass: null,
      };
    }

    const blockOn = new Set(cfg.facts?.blockOn || []);
    const items = [];
    const counts = { verified: 0, dubious: 0, unfound: 0, logic: 0, logicFlagged: 0 };

    for (const c of claims) {
      if (c.kind === 'logic') {
        counts.logic++;
        if (c.status === 'verified') continue; // 已排查无矛盾
        counts.logicFlagged++;
        items.push({
          code: 'LOGIC-001', severity: 'warn', line: c.line, excerpt: c.quote,
          message: `逻辑矛盾候选：${c.claim}`,
          suggestion: evidenceNote(c),
        });
        continue;
      }
      counts[c.status] = (counts[c.status] || 0) + 1;
      if (c.status === 'verified') continue;
      items.push({
        code: c.status === 'dubious' ? 'FACT-001' : 'FACT-002',
        severity: blockOn.has(c.status) ? 'error' : 'warn',
        line: c.line, excerpt: c.quote,
        message: `${c.status === 'dubious' ? '存疑断言' : '查无来源'}：${c.claim}`,
        suggestion: evidenceNote(c),
      });
    }

    const factTotal = claims.filter((c) => c.kind !== 'logic').length;
    const pass = `断言 ${factTotal} 条：${counts.verified} 已核实 / ${counts.dubious} 存疑 / ${counts.unfound} 查无来源` +
      (counts.logic ? `；逻辑候选 ${counts.logic} 条（${counts.logicFlagged} 条待裁决）` : '');
    return { items, pass };
  },
};
