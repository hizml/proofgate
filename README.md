# proofgate · 文哨

中文内容出厂质检员。对一篇写好的 markdown 文章跑**机械层确定性检查**，并可合并 agent 的**语义层断言核查**，输出一张带规则码的质检回执（人读 markdown + 机读 JSON），硬伤 nonzero exit，可当发布流水线的门禁。

```
proofgate check article.md                    # 机械层回执
proofgate facts-template article.md           # 生成语义层 verdict 骨架（agent 填）
proofgate check article.md --facts verdict.json  # 机械+语义合并回执
proofgate check article.md --json             # 机读 JSON
```

## 定位

- **只检查，不改文**：判断留给规则，裁决留给人。
- **判断/执行分离**：机械层全部确定性可复现（正则/词表/AC 自动机/HTTP 探测/数值归一比对）；语义判断（断言对错）由 agent 在引擎外核查后按契约回填，引擎只做 schema 校验和排版——引擎零 LLM。
- **回执可解释**：每一项都带稳定规则码、行号、原文摘录、修改建议；语义层每条断言带证据链，读者可验。

## 语义层（FACT/LOGIC）

断言核查不走引擎、走 agent，三步：

1. **抽取**：agent 通读文章，把可证伪的事实陈述（数字性、时间性、引用性）摘成清单
2. **核查**：逐条检索/查官方来源，标三态——`verified` 已核实（附证据链接）/ `dubious` 存疑 / `unfound` 查无来源；逻辑矛盾出候选对，人裁决
3. **写回**：按 `schemas/verdict.schema.json` 填 verdict.json，`check --facts` 校验契约（字段/行号/原文摘录逐字可寻）后合并进回执

默认存疑/查无只列出不硬拦（人裁决）；`facts.blockOn: ["unfound"]` 可升级为硬伤。verdict 违契（行号越界、摘录对不上原文、verified 缺证据）会报 `FACT-ERR` 拦下。

## 机械层规则表（v0）

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
| FACT-001 | 存疑断言（agent 核查后回填） | 建议（可配 blockOn） |
| FACT-002 | 查无来源断言 | 建议（可配 blockOn） |
| LOGIC-001 | 逻辑矛盾候选 | 建议 |
| FACT-ERR | verdict 契约违规 | 硬伤 |

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

- v0.1（当前）：9 条确定性规则 + 双格式回执 ✅
- v0.2（当前）：语义层 FACT/LOGIC（verdict 契约 + `--facts` 合并 + `facts-template`）✅
- Phase 2：skill 分发（`npx skills add`）、网页版、GitHub Action、图表数字 OCR 交叉核对

## 开发

```bash
npm test                    # node:test，零依赖
node bin/proofgate.mjs check test/fixtures/article-with-issues.md
```
