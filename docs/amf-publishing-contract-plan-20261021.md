# AMF 正文发布合同方案（已通过 Sol High 审阅）

实施前方案与实施复审均已通过 Sol High；最终验证见 [AMF 发布审阅](amf-publishing-review-20261021.md)。本方案延续 `fr-lu-candidate-review-20261021.md` 的冻结输入：SHA `77779fb29c2f9fffdcc5951f155f1393265a895b480a0f68f98329884c231fb4`，AST SHA `9d5255c0b2aac12985b60b9c80a7f9ea075f91353a588592c96d126f92976fcb`，693 分组、1,821 条文、132 信息框（文档 1 / 分组 63 / 条文 68）。

## 日期与来源

- Book I 的初始公报日期为 2004-10-29：[官方批准令](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000254713)。Books II–VI 为 2004-11-24：[官方公报](https://www.legifrance.gouv.fr/jorf/jo/2004/11/24/0273)。整份合并集合的 `publicationDate` 显式为 `null`，两个来源日期另作分卷证据；不猜测一个总公布日。
- `textAsOf=2026-09-11` 仅表示发布者版本标签；新增 `textAsOfBasis=publisher-version-date`、`textAuthorityStatus=publisher-consolidation`。`currencyStatus=not_assessed`，不据此判断生效、废止或最新性。
- 本轮尝试官方入口和版本链接，均 HTTP 200 但内容为 24,489 bytes 的维护页（无条文），必须拒绝。证据位于 ignored 的 `data/raw/amf-probes/20261021T150356Z/` 与 `20261021T150504Z/`。
- 导入既有官方 probe：完整 HTML 与原始 `report.json` 分开冻结，核验原报告对应 URL、HTTP 200、字节数和 SHA；日期 `capturedOn=2026-10-20`，精确 `retrievedAt=null`，`importedAt` 记录实际导入时间，明确 `retrievalTimestampBasis=date-only-official-probe`，不能把导入时间冒充获取时间。维护页不能替换此源。

## Canonical 1.5

- 冻结旧 1.2 / 1.3 / 1.4 分支、旧 content-unit 和 source-status 验证行为。新增严格 FR / fr / regulation / amf 分支，Document ID `fr:amf:rg`，localId `fr-amf-rg`。
- Article ID 为 `fr:amf:rg:article:<sha256(完整官方URL)>`；分组使用 `fr:amf:rg:structure:<sha256(完整分组URL)>`。保留完整原始标题、原 href、URL 与 XPath；这些是来源地址身份，不声称已证明跨历史版本连续性。`212-19` 和 NBSP `212-19 bis` 分别保留，不从路径编号或相同正文推导合并。
- 每条文仍只有一个可引用源单位；不生成段落/列表点的稳定法律 ID。68 个条文信息框在 `orderedUnits` 内原位置、独立 source-note 角色保留。
- 新增规范化 `link/href`、`superscript`、`list/listStyle=ordered|unordered`，保留内联斜体、Unicode 和源顺序。旧 unit 分支拒绝新字段，UI 只读规范化 layout，不解释 sourceName/sourceAttributes。
- 新增 `scopedSourceNotes[]`（64 条文档或分组信息框）：`ownerId, ownerSourceUrl, position, sourceLocator, orderedUnits, contentHash`，全部 source-note。验证 owner 存在、URL/哈希身份、位置、顺序及文本哈希；它们不是 provisions 或法律关系端点。

## Reader / Runtime / API

- DocumentView 新增可选 `publicationDate`，FR 必须为 null；其 `asOf` 使用明确标示的发布者版本日期。旧文档的字段和 `asOf` 行为保持可比。
- FR 的 `lastChecked` 使用 sourceStatus 的必需 `checkedAt`（来源审阅时间），不伪装为 source.retrievedAt。
- DocumentView 保留 693 个分组（包括空分组）与全部 scopedSourceNotes。信息框投影为带 owner 标签、位置和 source-note BodyBlock 的独立元数据。单条文 Reader 以明确所属文档/祖先分组的上下文显示，不把信息框归作条文正文；条文内 68 框仍在正文前原位置显示。
- 搜索、精确引用、法律实体和关系构建不纳入 scopedSourceNotes。所有源文本及角色哈希按冻结候选逐项独立核对。
- Runtime 5.12：documents.publication_date 对 FR 允许 null；新增 as_of_date 保留 DocumentView.asOf。旧 publication_date 值不改。语言约束增 fr，公共法域增 FR；banking-default 仍为 99 且不混入 FR。
- Public API 1.5：同步 FR/fr、FR 显式为空、其他法域可选非空的 publicationDate 和规范化内容字段，OpenAPI/MCP/服务合同一致。

## RAG 1.3 / 构建

- 冻结并继续验证 1.1 与 1.2。1.3 的 FR `date_document` 与 `retrieved_at` 显式 null，版本日期和 importedAt/捕获日期另记；旧文档的日期仍不可空。
- 64 条 scopedSourceNotes 在 document 的 `scoped_source_notes` 导出，包含 scope/ownerId/ownerSourceUrl/ownerLabel/position、精确文本及 locator。验证 owner URL 哈希与文档/分组归属，不能视为可引用法律实体；68 条 article note 复用 provision.source_notes。
- 原始 inline run 拼接策略：fr/de 为原序直接拼接；旧 English 策略不变。法域、语言、source-status、日期未知原因在导出及 verifier 中严格对应。
- 独立 AMF registry / snapshot / CLI / parser，不扩德国 GII 入口。原源字节、probe 证据、候选 AST 与完整 baseline 质量哈希均锁定；active 必须有已审阅质量基线。
- Manifest 新增显式 amf adapter，strict build 与 release 验证加入 AMF 来源；既有 exact coverage、checksum、archive 和质量条件不放松。目标 full-corpus 121，banking-default 99；不创建转置、IMPLEMENTS 或根据说明框链接推断的关系。

## 验收与责任

实现前需要 Sol High 合同审阅；实现后复审。定向验证旧 schema 拒绝新字段、完整旧 Reader 120 份哈希不变、全部 1,821 正文及 132 信息框的内容/归属/顺序、日期缺失语义、Reader/API/检索/引用/RAG/Profile 和浏览器。完整 npm test 由根任务串行执行，失败修复后重跑；原有 Vitest RPC 错误与测试断言结果分开报告，不屏蔽错误或放松发布条件。原始/生成数据保持 ignored，不提交。
