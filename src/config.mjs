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
};

export function loadConfig(configPath, startDir) {
  const candidates = configPath
    ? [configPath]
    : [
        path.join(startDir, 'proofgate.config.json'),
        path.join(process.cwd(), 'proofgate.config.json'),
        path.join(os.homedir(), '.proofgate', 'config.json'),
      ];
  const found = candidates.find((p) => p && fs.existsSync(p));
  if (!found) return { config: DEFAULT_CONFIG, source: '内置默认' };

  let user;
  try {
    user = JSON.parse(fs.readFileSync(found, 'utf8'));
  } catch (e) {
    return { config: DEFAULT_CONFIG, source: `内置默认（${found} 解析失败：${e.message}）` };
  }
  const config = {
    ...DEFAULT_CONFIG,
    ...user,
    space: { ...DEFAULT_CONFIG.space, ...(user.space || {}) },
    link: { ...DEFAULT_CONFIG.link, ...(user.link || {}) },
    case: { ...DEFAULT_CONFIG.case, ...(user.case || {}) },
    num: { ...DEFAULT_CONFIG.num, ...(user.num || {}) },
    rules: { ...(user.rules || {}) },
    termGroups: user.termGroups !== undefined ? user.termGroups : DEFAULT_CONFIG.termGroups,
    sensWords: user.sensWords || [],
    sensMode: user.sensMode || 'extend',
  };
  return { config, source: found };
}
