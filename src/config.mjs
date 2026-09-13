import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 默认词表取广告法绝对化用语的常见条目，刻意选多字词，避免「第一步」「第一次」这类误报。
// 词表是运营资产，正式版支持热更；这里只是保底样本。
export const SENS_DEFAULT_WORDS = [
  '国家级', '世界级', '最高级', '最佳', '第一品牌', '全网第一',
  '销量第一', '排名第一', '史上最', '全网最', '万能', '特效药',
  '包治', '根治', '无效退款', '纯天然', '100%中奖', '绝对有效',
];

export const DEFAULT_CONFIG = {
  rules: {}, // 如 { num: false } 关掉某条规则
  space: { latin: true, digit: false },
  termGroups: [
    ['大模型', 'LLM', '基础模型'],
    ['公众号', '微信公众平台'],
  ],
  sensWords: [],
  sensMode: 'extend', // extend=默认词表+自定义；replace=只用自定义
  link: { timeoutMs: 8000, concurrency: 8 },
  case: { minLength: 3 },
  num: { enabled: true },
  facts: { blockOn: [] }, // 如 ['unfound'] 把查无来源升级为硬伤
};

export function loadConfig(configPath, startDir) {
  const candidates = configPath
    ? [configPath]
    : [
        path.join(startDir, 'proofgate.config.json'),
        path.join(process.cwd(), 'proofgate.config.json'),
        path.join(os.homedir(), '.proofgate', 'config.json'),
      ];
  // 自动发现的候选不存在是正常的；但显式指定的路径不存在必须报错——静默回退等于悄悄解除词表武装
  if (configPath && !fs.existsSync(configPath)) {
    throw new Error(`--config 指定的配置文件不存在: ${configPath}`);
  }
  const found = candidates.find((p) => p && fs.existsSync(p));
  if (!found) return { config: DEFAULT_CONFIG, source: '内置默认' };

  let user;
  try {
    user = JSON.parse(fs.readFileSync(found, 'utf8'));
  } catch (e) {
    throw new Error(`配置文件解析失败: ${found}（${e.message}）——拒绝静默回退默认配置`);
  }
  validateShape(user, found);
  const config = {
    ...DEFAULT_CONFIG,
    ...user,
    space: { ...DEFAULT_CONFIG.space, ...(user.space || {}) },
    link: { ...DEFAULT_CONFIG.link, ...(user.link || {}) },
    case: { ...DEFAULT_CONFIG.case, ...(user.case || {}) },
    num: { ...DEFAULT_CONFIG.num, ...(user.num || {}) },
    facts: { ...DEFAULT_CONFIG.facts, ...(user.facts || {}) },
    rules: { ...(user.rules || {}) },
    termGroups: user.termGroups !== undefined ? user.termGroups : DEFAULT_CONFIG.termGroups,
    sensWords: user.sensWords || [],
    sensMode: user.sensMode || 'extend',
  };
  return { config, source: found };
}

// 垃圾配置 → 硬伤出（空敏感词会把干净句子每个位置都打中）。形状错直接抛，不猜意图
function validateShape(user, where) {
  if (user.termGroups !== undefined) {
    if (!Array.isArray(user.termGroups) || !user.termGroups.every((g) => Array.isArray(g) && g.every((v) => typeof v === 'string' && v.trim()))) {
      throw new Error(`${where}: termGroups 必须是「数组的数组」，内层是非空字符串，如 [["大模型","LLM"]]`);
    }
  }
  if (user.sensWords !== undefined) {
    if (!Array.isArray(user.sensWords) || !user.sensWords.every((w) => typeof w === 'string' && w.trim())) {
      throw new Error(`${where}: sensWords 必须是非空字符串数组`);
    }
  }
  if (user.rules !== undefined && (typeof user.rules !== 'object' || Array.isArray(user.rules))) {
    throw new Error(`${where}: rules 必须是对象，如 { "num": false }`);
  }
}
