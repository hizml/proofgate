import space from './space.mjs';
import punc from './punc.mjs';
import term from './term.mjs';
import sens from './sens.mjs';
import link from './link.mjs';
import num from './num.mjs';
import caseRule from './case.mjs';
import draft from './draft.mjs';
import img from './img.mjs';
import facts from './facts.mjs';

// 规则接口：{ key, id, title, run(doc, config, ctx) → { items, pass } }
// ctx: { fetchImpl, noNet, verdict }。items: { code, severity('error'|'warn'), line, excerpt, message, suggestion }
// facts 是语义层入口：断言由 agent 核查后按 schemas/verdict.schema.json 回填，引擎只校验契约
export const RULES = [space, punc, term, sens, link, num, caseRule, draft, img, facts];
