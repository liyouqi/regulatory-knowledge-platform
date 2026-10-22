# Legilux 下一批候选解析合同草案

日期：2026-10-22。当前范围为来源冻结与候选方案，尚未实施新的法律解析器或修改发布合同。来源盘点见[本轮记录](../reviews/lu-fr-sources-20261022.md)。

## 已取得的输入与发现

12 部卢森堡核心法的官方原始法律身份和合并版本目录已保存。目录查询 `consolidationDetails` 的 total 必须为精确值、返回数量一致、无 shard failure 或 timed_out；原始元数据必须准确匹配所请求的 `/jo` URI，标题逐项与目标法律对照。截止日为 2026-10-22，仅记录发布者提供的日期区间候选，不独立认证最新性或条款效力。LSF、UCI、AIFM 的未来版本分别进入排除清单。

9 部法律有所选日期的法文内容响应和元数据明确链接的 XML/HTML：AIFM、SIF、SICAR、RAIF、保险业法、支付法、AML 法、市场滥用法、银行处置法。LSF、UCI、MiFID 的所选合并元数据存在，但同 URI 的内容查询返回零命中；不拿旧版本补位。另有 11 份 CSSF 信息用途合并 PDF，可作为独立对照输入；保险法取得 Legilux PDF，未取得 CAA PDF。

公开查询仅作发现输入。完整源 XML/HTML 的文件链接必须取自同版本的 `isRealizedBy` / `isEmbodiedBy` / `isExemplifiedBy` 引用链；下载主机映射使用官方网页配置 `manifestation_prefix`，不得猜测路径。`legalValue=officiel` 只在保险法 PDF 的元数据中观测并单独记录，不自动赋给 XML、HTML、JSON 或所有合并文本。

保险法 PDF 第一页另明确声明该合并文本只有文献用途、没有法律价值。这与其 manifestation metadata 的 `officiel` 标签并存，须分别记录；来源声明不得被机器标签覆盖。PDF 的 CreationDate/ModDate 也不认证所选合并日期。

XML 采用 Akoma Ntoso `http://docs.oasis-open.org/legaldocml/ns/akn/3.0/CSD13` 和 JOLUX 扩展。已观测到：

- 9 份 XML 的 `act@contains` 均为 `originalVersion`，FRBRWork/Expression 指向原始 `/jo`，即使下载链接来自 `/consolide/<date>`。必须保留并解释这种身份差异，不能静默修正元数据或仅凭路径认定版本一致。
- AIFM 全 XML 含 288 个 `article` 元素，而公开检索内容响应的顶层 `type=article` 项为 229；附件内部还有结构。保险、AIFM 的部分 `mainBody` 项没有 `id`。因此检索响应不是无损法律树基线，不能按其计数或条文数组裁剪 XML。
- 正文与附件包含修改标识、来源引用、表格、上下标、列表及嵌套结构；单纯拼接 XML 的全部文字会混入 RDF/元数据、来源说明或历史修改内容。

## 下一工作包的建议边界

先以 SIF/SICAR/RAIF 三部较小基金法进行 **candidate-only** 研究；保险、支付、AIFM 等随后按复杂结构单独扩展。此选择只表示工程顺序，不表示三法最新性、完整性或业务覆盖已经通过。

1. 分别冻结 XML、HTML、官方元数据、源 JSON 与 PDF 的原始字节、完整 URL、查询参数、时间和哈希，并逐种表示记录版本依据。只有证据确认同版的输入才作同版本保真对照；不同版 PDF 仅作为差异线索。FRBR 原法日期、合并区间起点、获取时间不得互代。若更新任何输入，创建新候选目录，保留旧输入，不重写现有证据。
2. 候选模型与 Canonical 分离，只保存原 QName、属性、字符和子节点顺序以及可复核源路径；不生成跨版本 logical ID，不导入 Canonical/UI，不创建关系，不更新 active registry、manifest、Runtime 或覆盖计数。
3. 先调查 XML 的版本编码、修改/删除内容及 HTML 实际显示规则，制作同条文跨表示对照；身份/版本差异未解释前，候选报告必须显示 unresolved 并拒绝提出发布结论。不可用 CSSF PDF 的 ModDate 或页面更新日填补版本日期。
4. 候选解析必须对未实现的标签、属性、混合内容、命名空间、资源、重复身份和缺失必需上下文失败，显式拒绝 DTD、自定义实体与外部资源解析。保留 NBSP、空节点、链接目标、上下标、列表、表格与附件原序；不得 OCR 纠字、补写或按同文哈希去重。
5. Python 标准库 XML 遍历与 TypeScript 候选解析独立实现，先约定展开 QName/命名空间、属性、text/tail、空白、XML 标准换行和字符引用处理，再逐节点比较路径、原序与哈希。源字节哈希和解析后树的保真声明必须分开，不能将 XML 规范化说成字节无损；另外对照经版本核对的官方 HTML/PDF 代表性复杂条款。XML 树完整一致只证明技术保真，不独自证明其与所选合并日期相符。
6. 专用 fixtures 覆盖 mixed text/tail、附件内条文、缺失 id、重复显示编号、删除/替换标识、来源注释/脚注归属、表格跨度、外部链接、未知结构及未来/历史版本错配。未经设计审阅，不改变既有 Canonical/稳定 ID/来源权威性合同。

进入正式 Canonical/Reader 发布前，再单独设计 LU 法语与 Legilux 来源分支、日期/权威性字段、稳定 ID、Reader/Citation/Search/API/MCP/RAG 消费方合同及版本兼容；按 AGENTS.md 取得 Sol High 审阅，并执行独立保真、旧库哈希回归、严格双 Profile、`npm run check`、`npm test`、构建与浏览器验证。来源可获取不替代这些门槛。

## 审阅状态

Sol High 只读方案审阅结论为 **APPROVE FOR CANDIDATE-ONLY，限 SIF/SICAR/RAIF**。审阅抽查三份 XML，确认存在上述 `originalVersion` 与 `/jo` 身份差异。提出的逐表示版本依据、保险 PDF 来源声明冲突、DTD/实体拒绝、XML 规范化边界及链接目标补齐均已纳入本文件和来源记录。该结论不批准 Canonical、发布或覆盖计数变更，也不表示解析实施或发布已完成。
