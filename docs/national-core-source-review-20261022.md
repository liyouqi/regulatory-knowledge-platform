# 卢森堡核心法与法国法典来源盘点

日期：2026-10-22。本轮完成候选来源冻结、逐表示清单和下一解析工作包审阅。**新增 Reader 文档为 0，全库仍为 121，banking-default 仍为 99。** 未修改生产代码、active registry、Corpus manifest、Canonical 或关系语义；完整回归的 pretest 会重建同输入 Runtime，字节差异另见下方验证记录。此前 AMF 正文接入的完成状态见[上一轮验收](amf-publishing-review-20261021.md)。

## 取得的材料

[逐法来源与哈希清单](national-core-source-snapshots-20261022.csv)记录 12 部 LU 法律的原始 ELI、截止日、发布者合并区间候选、未来版本数、JSON/XML/HTML/PDF 哈希、PDF 页数和获取时间。原始字节保存在 ignored 的 `data/raw/national-core/2026-10-22/`；页级提取、几何 text items、字体和验证报告在 ignored 的 `data/artifacts/national-core-20261022/`。这些不是已发布 Canonical 或 Runtime。

清单另逐种表示记录版本依据：JSON 请求及响应 URI、XML 的 `originalVersion` 与 FRBR Expression、HTML 自述合并标题、PDF 的原始 ModDate 和版本对齐审阅状态。保险 PDF 标题日期与所选日期相符，正文保真尚未审阅；其余 PDF 版本对齐仍标 `not-assessed`。任何表示都不能借用另一表示的日期补空。

| 目标 | 2026-10-22 对应的发布者区间起点 | 版本目录项 | 所选 URI 的 JSON / XML / HTML | PDF 页数 |
|---|---|---:|---|---:|
| [1993 金融业法 LSF](https://legilux.public.lu/eli/etat/leg/loi/1993/04/05/n1/jo) | 2026-07-11 | 84 | 内容查询零命中；无所选版本文件引用 | 321 |
| [2010 UCI 法](https://legilux.public.lu/eli/etat/leg/loi/2010/12/17/n9/jo) | 2026-05-10 | 31 | 内容查询零命中；无所选版本文件引用 | 132 |
| [2013 AIFM 法](https://legilux.public.lu/eli/etat/leg/loi/2013/07/12/n1/jo) | 2026-04-16 | 27 | 三种输入均取得，版本身份待对照 | 85 |
| [2007 SIF 法](https://legilux.public.lu/eli/etat/leg/loi/2007/02/13/n1/jo) | 2023-07-28 | 14 | 三种输入均取得，版本身份待对照 | 29 |
| [2004 SICAR 法](https://legilux.public.lu/eli/etat/leg/loi/2004/06/15/n1/jo) | 2023-07-28 | 12 | 三种输入均取得，版本身份待对照 | 23 |
| [2016 RAIF 法](https://legilux.public.lu/eli/etat/leg/loi/2016/07/23/n7/jo) | 2023-07-28 | 5 | 三种输入均取得，版本身份待对照 | 18 |
| [2015 保险业法](https://legilux.public.lu/eli/etat/leg/loi/2015/12/07/n1/jo) | 2026-04-03 | 22 | 三种输入均取得，版本身份待对照 | 209 |
| [2009 支付法](https://legilux.public.lu/eli/etat/leg/loi/2009/11/10/n1/jo) | 2025-04-11 | 18 | 三种输入均取得，版本身份待对照 | 126 |
| [2004 AML 法](https://legilux.public.lu/eli/etat/leg/loi/2004/11/12/n1/jo) | 2026-08-08 | 26 | 三种输入均取得，版本身份待对照 | 65 |
| [2018 金融工具市场法](https://legilux.public.lu/eli/etat/leg/loi/2018/05/30/a446/jo) | 2026-06-06 | 18 | 内容查询零命中；无所选版本文件引用 | 65 |
| [2016 市场滥用法](https://legilux.public.lu/eli/etat/leg/loi/2016/12/23/n15/jo) | 2026-04-03 | 5 | 三种输入均取得，版本身份待对照 | 19 |
| [2015 银行处置法](https://legilux.public.lu/eli/etat/leg/loi/2015/12/18/n7/jo) | 2026-05-10 | 19 | 三种输入均取得，版本身份待对照 | 177 |

目录共 281 项；12 个响应的 total 均为 `eq`、数量完整、无 timeout/shard failure。上表日期只转录官方目录的区间起点，未独立认证逐条效力或法律最新性。LSF 2027-01-11、UCI 2027-04-16、AIFM 2027-04-16 三个未来合并版本被排除，未进入截止日候选。

12 份 PDF 为 11 份 [CSSF 原法文合并 PDF](https://www.cssf.lu/fr/Document/loi-du-5-avril-1993/)和 1 份 Legilux 保险法 PDF，共 1,269 页。每份均检查 HTTP 状态、PDF magic、字节数和 SHA-256；pdfjs 完成所有页的文字提取，未发现无文字页。此结果不证明脚注归属、表格、条文边界或版本已无损还原；本轮没有新增 PDF 法律解析器。CSSF PDF 版本依据与 Legilux 目录分别记录，不以 PDF 文件修改日替代合并日期，也未声称全部为同一版。

## 官方结构化入口的取得方式

最初 Legilux ELI 页面返回 2,118 bytes 的 JavaScript 应用壳，并非法律正文；`data.legilux.public.lu` 直接请求返回 400。本轮读取该公开页面自身的客户端及非认证 `api/settings`，定位其只读 `proxy/getByUri`、`proxy/consolidationDetails`、`proxy/getContentByUri` 查询。请求仅含法律 URI、日期或语言，不登录、不写入外部服务。

原始法律元数据全部命中一条，URI 与请求 `/jo` 完全相同，完整标题逐项对照目标法律。日期目录返回的 URI、区间起止、future flags 都保留原响应。曾尝试 `getClosestLegalResource` 按日期查询，但 LSF 返回历史 2003-10-01 候选，与完整目录的日期区间不符；该响应保留为诊断证据，不用于选版。实际候选要求完整目录内恰有一条满足发布者提供的截止日区间，否则停止该法律的选版。

9 部法律的所选元数据有明确的法文 Expression/Manifestation 引用，XML/HTML 文件地址来自 `isExemplifiedBy`，下载主机按官方客户端 `manifestation_prefix` 映射到 `https://legilux.public.lu/filestore/...`。保存了原始文件 URI、实际请求 URL、最终 URL、时间、字节和哈希。LSF/UCI/MiFID 的所选元数据虽存在，正文查询为精确零命中且无文件引用，未猜测文件路径、构造正文或用历史版本顶替。

## 阻止直接发布的已知差异

1. 9 份 XML 都是 Akoma Ntoso CSD13/JOLUX，但 `act@contains=originalVersion` 和 FRBR 身份指向原始 `/jo`，与下载链接中的 `/consolide/<date>` 并存。该事实不单独证明文件错误，也不能直接认证其合并版本；须与官方 HTML 的修改表示、元数据和同版 PDF 对照后解释。
2. JSON 检索响应不能当作完整法律树。AIFM 的 XML 有 288 个 `article` 元素，JSON 顶层 `type=article` 项为 229；附件内存在额外结构。部分 AIFM/保险 `mainBody` 项没有 id。后续候选不能按检索列表裁剪附件或把缺失 id 填成稳定身份。
3. CSSF 的 11 份 PDF 均声明为信息用途合并文本。Legilux 保险法 PDF 第一页也明确说明合并文本只有文献用途、没有法律价值，尽管其 manifestation metadata 的 `legalValue` 是 `officiel`。这两个事实分别保留，不把机器标签写成法律权威性结论。
4. CAA 的[保险法目录](https://www.caa.lu/fr/documentation/lois)和其公开 PDF 链接本次都返回 HTTP 200、8,885 bytes 的维护 HTML；这两份响应被拒绝作为正文。保险法取得的是单独核验的 Legilux PDF。市场滥用法最初无后缀的 CSSF URL 返回 404，随后核对[正确官方入口](https://www.cssf.lu/fr/Document/loi-du-23-decembre-2016-1/)取得法文 PDF；错误尝试保留。

## 法国三个核心法典

精确代码标识已由 Légifrance 索引及 [ACPR 官方代码目录](https://acpr.banque-france.fr/fr/reglementation/textes-de-reference/codes)交叉发现，分别为 `LEGITEXT000006072026`（货币金融法典）、`LEGITEXT000006073984`（保险法典）、`LEGITEXT000006069565`（消费法典）。不能把 ACPR 旧日期深链当作当前版本。消费法典后续只按经审阅的金融相关章节范围接入，不以该法典存在宣称金融消费法已完整覆盖。

本次直接请求三个法典的 2026-10-22 页面均为 HTTP 403/5,713 bytes challenge，未取得法典正文；ACPR 直接请求也转到维护页，网络工具索引可见不等于本机已下载。错误页已冻结，法国三个发现记录仍为候选。

取得 [DILA 官方 LEGI 数据集元数据](https://www.data.gouv.fr/datasets/legi-codes-lois-et-reglements-consolides)及其 HTTPS 开放目录。数据集明确提供无需账户的开放下载；PISTE API 是另一个需注册的路径。本次目录列出全量 `Freemium_legi_global_20250713-140000.tar.gz`（显示约 1.1G）及此后增量，最新已列到 2026-10-21。这里只下载了数据集元数据和 LEGI/DTD 目录，没有下载全量/增量档案，更未组装可用法典。后续采用 DILA 路线须冻结完整基线与截止日所需全部增量、删除/替换规则和 DTD，再核对版本；单个增量包或整个目录的 HTTP 200 不构成完整输入。

## 下一解析与发布顺序

[专门方案](legilux-candidate-contract-plan-20261022.md)已通过 Sol High **candidate-only** 审阅，范围限 SIF/SICAR/RAIF。审阅要求逐表示记录版本依据、保留保险 PDF 权威性冲突、显式拒绝 DTD/自定义实体/外部解析、区分源字节哈希与 XML 标准规范化后的树。上述要求已写入方案，未开始新的解析实施。

1. SIF/SICAR/RAIF：先解释 XML/HTML 版本身份，完成独立候选树、附件/注释/删除标识和复杂布局对照；不修改发布数据。
2. 候选保真通过后，单独审阅 Legilux Canonical/稳定 ID/日期与权威性合同，再接入 Reader、检索、引用、国家页、API/MCP/RAG。
3. 扩至 AIFM、AML、支付、市场滥用、保险、处置法；LSF/UCI/MiFID 继续取得所选日期的完整结构化表示或走单独审阅的 PDF 解析路线。
4. 法国三法典按 DILA 全量与增量路线另开来源工作包，之后再补各国落地规则及有证据的欧盟关系。

来源清单不发布转置、`IMPLEMENTS` 或其他法律关系。国家领域矩阵的正文覆盖状态保持不变。

## 验证记录

独立重新读取下载文件验证 **107 个响应**的字节数与 SHA-256，全部一致；12 份版本目录数量完整；9 份 XML 命名空间检查通过；9 份 HTML/9 份非空法文源 JSON 与 12 份 PDF 已冻结。12 份 PDF 的 1,269 页均完成 text-item 提取，源类型/几何输出只用于后续审阅，未形成法律正文投影。

关键证据：`source-verification-summary.json`、`source-inventory-summary.json`、`pdf-inventory-summary.json`、`lu-insurance-legilux-inventory.json`。源请求日志与脚本只存在于本机 ignored 目录，原始法律内容、下载错误页、客户端代码和生成数据均不提交。

`npm run check` 通过：417 个文件的 Biome 检查及 TypeScript 检查，无需修复。默认 `npm test` 完整运行通过：**117 个文件、546 项测试，零失败、零未处理错误，exit 0**，耗时 919.76 秒。测试未增加、删减或修改；本轮也未改变超时或运行门槛。`npm run build` 通过、exit 0，Vite 构建 4.97 秒，保留已有的大 chunk 提示。日志为 `check-final.log` / `npm-test.log` / `build.log`。六份本轮文档/CSV 的本地链接、列宽、候选与已发布状态分离检查，以及 `git diff --check` 均通过。

Corpus manifest 和 EUR-Lex/national/AMF 三份 active registry 的整文件 SHA-256 均与本轮来源工作开始前一致。`npm test` 的 pretest 重建 Runtime 后仍为 `runtime-5.12.0-a6a7244f54fca0b1`、121 文档；`builtAt` 等生成信息更新，SQLite 整文件 SHA 因而不同，不声称 Runtime 字节未变。旧 120 份 Reader payload 与上轮冻结哈希逐份一致，0 差异；证据为 `publication-before.json` / `publication-after.json`。
