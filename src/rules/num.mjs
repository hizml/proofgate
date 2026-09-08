import { excerptAt } from '../parse.mjs';

// 数字交叉核对：抽「数值+单位」→ 归一化 → 按指标分组 → 同指标不同值 = 冲突。
// 对象靠启发式猜（数字前的中文短语，剥动词和泛称），猜不出的不参与分组，宁漏勿误报。

const UNIT_FACTORS = [
  ['万亿', 1e12], ['千万', 1e7], ['百万', 1e6], ['亿', 1e8],
  ['万', 1e4], ['千', 1e3], ['k', 1e3], ['K', 1e3], ['M', 1e6], ['B', 1e9],
];
const UNIT_ALT = UNIT_FACTORS.map(([u]) => u).join('|');
const ARAB_RE = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s*(?:(${UNIT_ALT}))?\\s*([%％])?`, 'g');
const BAI_RE = /百分之\s*([\d.]+)/g;
const CHENG_RE = /([一二两三四五六七八九十]{1,3})\s*成/g;

// 数字后面直接跟时间单位 = 日期/时刻，不是指标（「9 月 20 号」「每晚 23 点」）
const TIME_AFTER_RE = /^\s*(?:年|月|日|号|点|分|秒|时|周|届|季度)/;
// 对象猜出来是时间词本身的也排除（「每月 320 万」的「每月」）
const TIME_OBJECTS = new Set(['月', '年', '日', '周', '点', '号', '时', '每晚', '每天', '每月', '每年', '当日', '当天', '次', '倍', '篇', '条', '行']);
// 对象以量词/结构词收尾 = 分类短语不是指标（「一篇 38」「下一步 3 个」），两处数字本就不是同一指标
const CLASSIFIER_TAILS = new Set(['篇', '条', '只', '个', '位', '名', '次', '款', '项', '份', '台', '家', '轮', '层', '步', '章', '节', '幕', '课', '题', '段', '字', '词', '句', '分', '秒', '米', '元', '块', '岁']);

// 出现在数字前的动词/介词，剥掉后剩下的才像指标名
const STRIP_TAIL = ['突破', '达到', '增长至', '增长了', '增长', '上涨至', '上涨', '下降至', '下降', '升至', '降至', '高达', '超过', '约为', '约', '近', '超', '为', '是', '有', '达', '共', '了'];
// 指标名尾部的泛称，剥掉让「月活用户」「开发者月活」都能归到「月活」
const STRIP_GENERIC = ['用户', '人数', '数量', '规模', '总量', '总数', '数据', '量', '数'];
const CJK_RE = /^[\u4e00-\u9fff]+$/;

function canonical(rawNum, unit, isPercent) {
  const n = parseFloat(String(rawNum).replace(/,/g, ''));
  if (Number.isNaN(n)) return null;
  const factor = unit ? (UNIT_FACTORS.find(([u]) => u === unit)?.[1] ?? 1) : 1;
  const val = isPercent ? n / 100 : n * factor;
  return String(Number(val.toPrecision(6)));
}

function chengValue(s) {
  const map = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (s === '十') return 10;
  if (s.length === 1) return map[s] ?? null;
  if (s.includes('十')) {
    const [a, b = ''] = s.split('十');
    const tens = a === '' ? 1 : (map[a] ?? NaN);
    const ones = b === '' ? 0 : (map[b] ?? NaN);
    if (Number.isNaN(tens) || Number.isNaN(ones)) return null;
    return tens * 10 + ones;
  }
  return null;
}

function guessObject(before) {
  const tail = before.slice(-12);
  const m = tail.match(/([\u4e00-\u9fff]{1,8})\s*$/);
  if (!m) return null;
  let obj = m[1];
  if (TIME_OBJECTS.has(obj)) return null;
  if (CLASSIFIER_TAILS.has(obj[obj.length - 1])) return null;
  let changed = true;
  while (changed) {
    changed = false;
    for (const w of STRIP_TAIL) {
      if (obj.length > w.length && obj.endsWith(w)) { obj = obj.slice(0, -w.length); changed = true; break; }
    }
    for (const w of STRIP_GENERIC) {
      if (obj.length > w.length && obj.endsWith(w)) { obj = obj.slice(0, -w.length); changed = true; break; }
    }
  }
  return CJK_RE.test(obj) ? obj : null;
}

export default {
  key: 'num',
  id: 'NUM',
  title: '数字交叉核对',

  run(doc, cfg) {
    if (cfg.num?.enabled === false) return { items: [], pass: '跳过（rules.num=false）' };
    const mentions = [];

    for (const { no, text } of doc.textLines) {
      if (!text) continue;
      let m;
      ARAB_RE.lastIndex = 0;
      while ((m = ARAB_RE.exec(text))) {
        if (!m[1]) continue;
        const end = m.index + m[0].length;
        if (TIME_AFTER_RE.test(text.slice(end))) {
          ARAB_RE.lastIndex = end; // 日期/时刻数字不参与指标核对
          continue;
        }
        const isPercent = Boolean(m[3]);
        const canon = canonical(m[1], m[2], isPercent);
        if (canon === null) continue;
        mentions.push({
          obj: guessObject(text.slice(0, m.index)), kind: isPercent ? 'percent' : 'absolute',
          canon, display: m[1] + (m[2] || '') + (m[3] || ''), line: no,
          excerpt: excerptAt(text, m.index, m[0].length),
        });
        ARAB_RE.lastIndex = m.index + m[0].length;
      }
      BAI_RE.lastIndex = 0;
      while ((m = BAI_RE.exec(text))) {
        mentions.push({
          obj: guessObject(text.slice(0, m.index)), kind: 'percent',
          canon: canonical(m[1], null, true), display: `百分之${m[1]}`, line: no,
          excerpt: excerptAt(text, m.index, m[0].length),
        });
      }
      CHENG_RE.lastIndex = 0;
      while ((m = CHENG_RE.exec(text))) {
        const v = chengValue(m[1]);
        if (v === null) continue;
        mentions.push({
          obj: guessObject(text.slice(0, m.index)), kind: 'percent',
          canon: String(Number((v / 10).toPrecision(6))), display: `${m[1]}成`, line: no,
          excerpt: excerptAt(text, m.index, m[0].length),
        });
      }
    }

    // 对象归并：一个以另一个结尾（如「开发者月活」ends with「月活」）视为同一指标。
    // 与入组顺序无关，用并查集双向归并，代表取较短的名字。
    const objs = [...new Set(mentions.map((m) => m.obj).filter(Boolean))];
    const parent = new Map(objs.map((o) => [o, o]));
    const find = (o) => {
      while (parent.get(o) !== o) {
        parent.set(o, parent.get(parent.get(o)));
        o = parent.get(o);
      }
      return o;
    };
    for (let i = 0; i < objs.length; i++) {
      for (let j = i + 1; j < objs.length; j++) {
        const a = objs[i];
        const b = objs[j];
        if (a.length >= 2 && b.length >= 2 && (a.endsWith(b) || b.endsWith(a))) {
          const ra = find(a);
          const rb = find(b);
          if (ra !== rb) {
            const rep = ra.length <= rb.length ? ra : rb;
            parent.set(rep === ra ? rb : ra, rep);
          }
        }
      }
    }

    const groups = new Map(); // 代表对象 → { kind → Map(canon → mentions) }
    for (const men of mentions) {
      if (!men.obj) continue;
      const host = find(men.obj);
      if (!groups.has(host)) groups.set(host, {});
      const byKind = groups.get(host);
      if (!byKind[men.kind]) byKind[men.kind] = new Map();
      const set = byKind[men.kind];
      if (!set.has(men.canon)) set.set(men.canon, []);
      set.get(men.canon).push(men);
    }

    const items = [];
    for (const [obj, byKind] of groups) {
      for (const [kind, set] of Object.entries(byKind)) {
        if (set.size < 2) continue;
        const parts = [...set.entries()].map(([canon, ms]) =>
          `「${ms[0].display}」(L${ms[0].line})`
        );
        const first = [...set.values()].flat()[0];
        items.push({
          code: 'NUM-001', severity: 'error', line: first.line,
          excerpt: first.excerpt,
          message: `同一指标「${obj}」的${kind === 'percent' ? '比例' : '数值'}前后不一致：${parts.join(' 与 ')}`,
          suggestion: '核对数据来源后统一（对象识别为启发式，误报可 rules.num=false 关闭）',
        });
      }
    }

    items.sort((a, b) => a.line - b.line);
    return { items, pass: `抽取 ${mentions.length} 处数字，交叉核对无冲突` };
  },
};
