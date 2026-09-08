import space from './space.mjs';
import punc from './punc.mjs';
import term from './term.mjs';
import sens from './sens.mjs';
import link from './link.mjs';
import num from './num.mjs';
import caseRule from './case.mjs';
import draft from './draft.mjs';
import img from './img.mjs';

// 规则接口：{ key, id, title, run(doc, config, ctx) → { items, pass } }
// ctx: { fetchImpl, noNet }。items: { code, severity('error'|'warn'), line, excerpt, message, suggestion }
export const RULES = [space, punc, term, sens, link, num, caseRule, draft, img];
