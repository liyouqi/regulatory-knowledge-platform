# 法国 / 卢森堡：候选解析阶段

本阶段完成法国 AMF HTML 候选检查工具及独立源审计，不新增已发布法规。Reader 仍为 120 份，banking-default 为 99 份；本轮不改 Canonical、Public API、Runtime、RAG、active registry、Corpus manifest 或既有发布门槛。

## 法国 AMF

输入来自此前保存的 [AMF 原法文入口](https://www.amf-france.org/fr/eli/fr/aai/amf/rg)：`data/raw/national-probes/2026-10-20/fr-amf.bin`，2,475,701 bytes，SHA-256 `77779fb29c2f9fffdcc5951f155f1393265a895b480a0f68f98329884c231fb4`。既有 probe report 记录 HTTP 200；本次网页重试返回 429。验收只针对冻结输入，不声明今日最新版本或重新下载成功。

HTML canonical 为 `https://www.amf-france.org/fr/eli/fr/aai/amf/rg/20260911/notes`。h1 原标题、h1 的 `about` 与 canonical URL 必须共同指向 2026-09-11。此日期只记为发布者标示的合并文本版本日期，不记作公布日，不推导所有条文的生效、废止或适用状态。[AMF 使用说明](https://www.amf-france.org/fr/reglementation/reglement-general/rg-mode-demploi)另区分历史版本及未来生效修改；这一份快照不构成完整时间覆盖。

| 源单位 | 数量 | 保留方式 |
|---|---:|---|
| `rg-part` 分组 | 693 | 原始标题、官方路径、父路径及源序，包括 `like-h7` / `like-h8` |
| `art` 条文容器 | 1,821 | 完整显示标题、原 href、完整官方 URL、所属分组及正文哈希 |
| `note-amf` 信息框 | 132 | 文档级 1、分组级 63、条文级 68；原位置与归属不变 |

`legalContentAst` 包含 h1、文档级信息框和一个 `rg-content` 树，不包含网站导航。它保留解码后原文字符、NBSP、空白、标签、属性、链接、列表和子节点顺序。源字节由输入 SHA 锁定；树的确定性序列化另有 SHA，可检测文本相同但链接目标或标签改变的情形。

信息框使用 `source-note`，正文使用 `operative-text`，标题及容器使用 `structure`。条文信息框留在标题与正文之间；分组信息框不挂到前一条条文。信息框不进入正文文本哈希，链接不自动成为法律关系。

`Article 212-19` 与 `Article 212-19 bis` 分别保留：它们的 URL 路径编号同为 `212-19`，完整 URL 分别以 `/notes`、`/notes-0` 结束，正文均为相同的来源删除标记。候选身份使用完整官方 URL，并检查完整显示标题唯一；不按路径编号或正文哈希去重。本阶段不创建 logical ID，也未证明链接跨历史版本稳定。

## 重现与边界

TypeScript 使用项目现有 `fast-xml-parser`；Python 标准库 `html.parser` 独立生成基线，不复用 TypeScript 树或投影。完整对照覆盖分组及父序、全部标题与 URL、1,821 个正文哈希、132 个信息框的归属、直属元素位置和文本哈希。

```sh
npm run amf:candidate:inspect -- \
  --input data/raw/national-probes/2026-10-20/fr-amf.bin \
  --output data/artifacts/national-fr-lu/amf-reviewed-candidate.json
python3 scripts/audit-amf-candidate.py \
  --input data/raw/national-probes/2026-10-20/fr-amf.bin \
  --output data/artifacts/national-fr-lu/amf-independent-baseline.json \
  --candidate data/artifacts/national-fr-lu/amf-reviewed-candidate.json
```

候选只写入已忽略的 `data/artifacts/`，已有文件会报错。命令不下载、不更新 registry、不构建 Runtime。未知法律子树标签、属性、资源、身份 URL、重复完整标题/URL、关键节点缺失或顺序错误、版本冲突均须失败。外部引用链接原样保留，不能误用 AMF 身份域名白名单。原始 HTML 和生成树均不提交。

Sol High 在实现前批准上述 candidate-only 范围；实现审阅及最终验证结果见下方。

## 卢森堡 LSF

[CSSF 来源页](https://www.cssf.lu/fr/Document/loi-du-5-avril-1993/)直接链接的法文 `L_050493_lsf.pdf` 已做独立盘点：321 页、3,194,942 bytes，SHA-256 `7d3cb1d625f0758eb7309984ea001064632e89147d33dae49f6e873b78686c82`。PDF 自述合并文本用于信息，正式公报文本具有相应权威地位；页面更新日不能替代 PDF 内部修订截止日期。

`pdfjs-dist` 完成全部页文本提取，但未证明脚注归属、表格几何或条文边界已无损恢复。文档包含目录、附件、修订说明和删除标记，当前没有批准 PDF 法律解析器。Legilux 候选原始 ELI 路由在受限网络外重试仍返回 HTTP 403，未取得经核验的结构化表示链接；检索可见的旧协调文本不能替代当前合并法。

进一步核对发现：该 PDF 的修订清单到第 26 页结束，最后列示 2026-05-05 的修订法（Mém. A 2026, N° 227），第 27 页开始正文；PDF 的 CreationDate / ModDate 为 2026-07-23。这些是清单和文件元数据的不同事实，均不能单独认证法律最新性或条文生效日。摘取证据保存在 ignored 的 `data/artifacts/national-fr-lu/lu-version-evidence.json`；后续须与官方修订法及适用时间核验后再定义正式版本字段。

LSF 保持候选。下一步先核验官方结构化表示；若只能使用 PDF，则单独确认内部版本、条文及脚注结构，并做专项解析审阅。既有 3 份 CSSF 文档不计作该核心法已覆盖。

## 后续阶段

1. 基于 AMF 候选树设计独立的来源适配器；另行审阅 `FR` / `fr`、来源身份、公布日证据和版本字段，不能套用德国 GII 合同。
2. 冻结旧 Canonical / RAG 格式，再接入 Reader、API、检索及国家页面，验证引用、角色隔离与 Profile 严格构建；通过前不计为新增覆盖。
3. 卢森堡核心法按来源与格式独立推进，不从门户存在或 PDF 可提取推断接入完成。

## 验收记录

Sol High 已完成实现审阅，结论为 **APPROVED，限 candidate-only**。审阅发现的整段标题匹配及层间依赖问题已修正；候选解析器不再导入 Canonical 层。此结论不涵盖未来 Canonical / FR 合同、来源状态、API、Runtime、RAG 或发布门槛变更，这些变更仍须按具体方案审阅。

完整独立对照通过：693 分组、1,821 条文、132 信息框，0 diff；132 个信息框的归属为 1 / 63 / 68。确定性 `legalContentAstHash` 为 `sha256:9d5255c0b2aac12985b60b9c80a7f9ea075f91353a588592c96d126f92976fcb`。正式候选保存在 ignored 的 `data/artifacts/national-fr-lu/amf-reviewed-candidate.json`。

24 项专用 fixture、`npm run check`、`npm run build` 通过。专用检查涵盖原始 NBSP、一次性实体解码、三类信息框归属与位置、嵌套 `like-h7/8`、外部引用链接、同文不同源单位、链接变化、元数据冲突、未知标签/属性/资源、重复标题/URL，以及候选文件覆盖拒绝。

完整 `npm test` 执行了预构建和全部回归：111 个测试文件、521 个测试断言全部通过，无失败断言；但 Vitest 另报 1 个未处理的 `[vitest-worker]: Timeout calling "onTaskUpdate"`，最终 exit 1，**不计为完整回归全绿**。日志为 ignored 的 `data/artifacts/national-fr-lu/npm-test.log`，运行耗时 978.43 秒。此次没有调整全局测试预算、屏蔽未处理错误或改变发布谓词。该类 runner RPC 超时也见于上阶段记录，具体触发原因尚未定位；本轮 candidate-only 发布边界不因断言全部通过而扩大。

预构建生成的完整 Runtime 仍为 `runtime-5.11.0-837af02ca1fbaec9`，120 文档、65,208 records，reviewed input issues 为 0，与本轮开始前相同。全量中的 Reader、API、MCP、RAG、德国四法集成、国家目录和 Profile 隔离测试均通过。Sol 审阅期间另一份重复回归被单独停止，不纳入结果；这里仅记录根执行的完整运行。
