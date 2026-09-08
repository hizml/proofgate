# proofgate · 文哨

中文内容出厂质检员。对一篇写好的 markdown 文章跑确定性检查，输出一张**带规则码的质检回执**（人读 markdown + 机读 JSON），硬伤 nonzero exit，可当发布流水线的门禁。

```
proofgate check article.md          # 出人读回执
proofgate check article.md --json   # 出机读 JSON
proofgate check article.md --no-net # 跳过链接联网检查
```

## 定位

- **只检查，不改文**：判断留给规则，裁决留给人。
- **引擎零 LLM**：全部规则确定性可复现（正则/词表/AC 自动机/HTTP 探测/数值归一比对），同输入永远同输出。
- **回执可解释**：每一项都带稳定规则码、行号、原文摘录、修改建议。

## 规则表（v0）

| 规则码 | 检查项 | 级别 |
|---|---|---|
| SPACE-001 | 中文紧贴英文（建议加空格） | 建议 |
| PUNC-001 | 中文之间用半角标点 , ; : ? ! | 建议 |
| PUNC-002 | 英文省略号 `...` 应为中文省略号 `……` | 建议 |
| TERM-001 | 同一概念多种写法混用（术语组可配置） | 建议 |
| SENS-001 | 违禁/风险词（默认：广告法绝对化用语，可扩展） | 硬伤 |
| LINK-001 | 链接返回 4xx/5xx | 硬伤 |
| LINK-002 | 链接超时/被拒（可能是反爬，人工确认） | 建议 |
| NUM-001 | 同一指标出现互相矛盾的数字 | 硬伤 |
| CASE-001 | 英文写法大小写不一致（Claude/claude） | 建议 |
| DRAFT-001 | 发布前残留 TODO/备选/占位标记 | 硬伤 |
| IMG-001 | 本地图片文件不存在 | 硬伤 |
| IMG-002 | 图片缺少 alt 文字 | 建议 |

退出码：`0` 通过，`1` 存在硬伤，`2` 用法/运行错误。

## 配置

在文章同目录或上层放 `proofgate.config.json`（或 `--config` 指定）：

```json
{
  "rules": { "num": false },
  "termGroups": [["大模型", "LLM", "基础模型"]],
  "sensWords": ["自定义风险词"],
  "sensMode": "extend",
  "link": { "timeoutMs": 8000, "concurrency": 8 },
  "space": { "latin": true, "digit": false }
}
```

## 路线

- Phase 0（当前）：9 条确定性规则 + 双格式回执 ✅
- Phase 1：skill 皮（ZCode/Claude Code 里一句话质检）+ FACT/LOGIC 语义规则（引擎外，由 agent 出断言清单）
- Phase 2：网页版、GitHub Action、图表数字 OCR 交叉核对

## 开发

```bash
npm test                    # node:test，零依赖
node bin/proofgate.mjs check test/fixtures/article-with-issues.md
```
