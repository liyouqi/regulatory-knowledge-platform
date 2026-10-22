# 德国国家法：来源与两批验收

记录日期：2026-10-20 至 2026-10-21。各批次的数量和版本按当时状态保留。法国 AMF 之后的接入见 [AMF 记录](amf-20261021.md)，卢法后续来源见 [2026-10-22 记录](lu-fr-sources-20261022.md)。

## Sources

本记录保留 GwG/WpIG 首批审阅，并补充 KWG/KAGB 第二批；不代表德国或三国金融法覆盖完成。四份正文覆盖银行、基金、AML 与投资服务领域的部分材料，不是任何领域的完整法律覆盖声明。

### 德国原文 XML

政府发布者入口：[Gesetze im Internet](https://www.gesetze-im-internet.de/)。该站明确说明合并文本不是正式公布版本；正式公报地位不能从政府域名推断。下载链接来自各法目录的 XML 入口（`xml.zip`），未采用翻译或第三方镜像。

| 简称 | 官方 Work doknr | 官方标题 | 制定日期 | BGBl 公布日期 | 源 Stand 最后修订日期 | norm 数 | 结构组 | 状态 |
|---|---|---|---|---|---|---:|---:|---|
| KWG | BJNR008810961 | Gesetz über das Kreditwesen | 1961-07-10 | 1961-07-15 | 2026-05-12 | 278 | 32 | 已发布，active |
| GwG | BJNR182210017 | Gesetz über das Aufspüren von Gewinnen aus schweren Straftaten | 2017-06-23 | 2017-06-24 | 2026-06-29 | 84 | 7 | 已发布，active |
| KAGB | BJNR198110013 | Kapitalanlagegesetzbuch | 2013-07-04 | 2013-07-10 | 2026-04-09 | 492 | 74 | 已发布，active |
| WpIG | BJNR099010021 | Gesetz zur Beaufsichtigung von Wertpapierinstituten | 2021-05-12 | 2021-05-17 | 2026-04-09 | 130 | 30 | 已发布，active |

四份已发布源快照均来自 Gesetze im Internet，取得时间为 2026-10-21。首批 GwG/WpIG 快照分别为 `data/raw/national/de-gwg-2017/20261021T065833065Z-e6c3dda080da/` 与 `data/raw/national/de-wpig/20261021T065833613Z-5401a3133af8/`；第二批 KWG/KAGB 快照分别为 `data/raw/national/de-kwg/20261021T074102916Z-0128447811ca/` 与 `data/raw/national/de-kagb/20261021T074101863Z-34e8b51e7eb7/`。当前 national Canonical schema 1.4 使用 parser 1.1；历史 DE Canonical 1.3 与 EU/LU 1.2 仍可读取且未重写。四份正文均为德文 XML 合并文本。Gesetze im Internet 明确合并文本不是正式公布版本，因此不能将其称为正式公报正文。

#### 首批：GwG 与 WpIG

首批发布审阅独立对照了 531 个按角色区分的文本哈希，差异为 0。GwG 与 WpIG 的制定日和 Bundesgesetzblatt（BGBl）公布日分别记录；公布日由原始公报核验：[GwG，BGBl I 2017 Nr. 39，2017-06-24](https://www.bgbl.de/xaver/bgbl/start.xav?start=//*%5B@attr_id=%27bgbl117s1822.pdf%27%5D)、[WpIG，BGBl I 2021 Nr. 23，2021-05-17](https://www.bgbl.de/xaver/bgbl/start.xav?start=//*%5B@attr_id=%27bgbl121s0990.pdf%27%5D)。

#### 第二批：KWG 与 KAGB

第二批 parser 1.1 质量审阅新增 1,992 个按角色区分的文本哈希（KAGB 1,254，KWG 738），均与独立原文对照为 0 diff；四部法合计 2,523 个 role hashes。结构化表格另做逐格独立核对，共 1,521 个单元格，0 diff：KWG 2 张表、373 行、689 格，其中 57 个跨列单元格、42 个空单元格；KAGB 57 张表、416 行、832 格。

KAGB BGBl 公布日为 2013-07-10，见[BGBl I 2013 Nr. 35](https://www.bgbl.de/xaver/bgbl/start.xav?start=//*%5B@attr_id=%27bgbl113s1981.pdf%27%5D)。KWG 公布日 1961-07-15 依据原始 BGBl I 1961 Nr. 49 扫描件核验：[扫描件（第三方托管）](https://media.offenegesetze.de/bgbl1/1961/bgbl1_1961_49_watermarked.pdf)。扫描件的冻结 SHA-256、获取时间以及印刷页 877/881 的人工核对记录见[第二批 Sol 审阅记录](german-laws-20261021.md#second-batch)；BGBl 官方域名直连核验尚未完成。该来源证据地位不改变正文仍来自 Gesetze im Internet 合并 XML 的事实。KWG header 的 Neuf 日期 1998-09-09 与源 Stand 最后修订日 2026-05-12 分开记录。

完整质量基线、源快照绑定及文本哈希由 registry、Corpus manifest 和构建报告管理。以上日期均是制定、公布、header 或源修订等来源字段，不据此声明条文生效状态或最新版本认证。

- `builddate` 是文件生成时间，不能作为法律生效/适用时间。制定日、BGBl 公布日和源 Stand 日期是不同事实；Stand 日期不能等同于全部条文在该日生效。Neuf、Sonst、Hinweis 等源备注另行保留。
- `norm@doknr` 在每份源中唯一，适合精确来源定位。不能用数组位置或可变显示标题替代官方单位 ID。单个源中唯一并不证明跨历史版本稳定性。
- `gliederungskennzahl` 不是全局唯一：KAGB 的 Kapitel 8 和 Kapitel 9 均有 `080`。结构 ID 必须用官方 doknr；层级只能结合源顺序和活动祖先验证，不能静默纠正源编号。
- text、fussnoten、目录、废止/空条文均需保留并区分，不可只抓非空条文正文。来源脚注不自动成为法律义务或转置关系。
- 四份 ZIP 均只有 XML，无图片。KWG Annex I 含真实表格及跨列属性；其余表格主要用于目录。文本顺序投影不能宣称表格排版保真。未知元素或无法表达的资源必须明确报错或保持候选。


## First batch

范围仅为 GwG、WpIG 两份德文合并 XML。KWG、KAGB、法国 HTML 和卢森堡核心法 PDF 不在发布范围。

### 合同及解析审阅

按 AGENTS.md 的 Sol High 审阅要求，先审边界、再审实现。最终实现审阅结论为 Approve，实际发布仍以独立原文对照和端到端验收为条件。

- 保留既有 Canonical 1.2；德国分支使用 Canonical 1.3 和 GII source system。Work、norm ID 绑定官方 doknr，不给段落、表格单元或文本 run 制造公共稳定 ID。
- Reader 只从 orderedContent 读取文本。规范化布局以本地 contentIndex 引用文本，验证每个索引恰好出现一次并保持源顺序。
- 正文、来源注释和目录分角色保存；默认义务检索、Citation 和自动引用关系排除后两类。来源注释在 Reader 和导出中单独保留。
- 未知 XML 元素、上下文、语义属性、重复容器及不支持的归档资源严格拒绝。源 norm ID 集合、结构元数据和逐角色文本哈希形成质量基线。
- 来源标为政府发布的非权威合并文本。Stand 的最后修订法日期不等同于生效日期；制定日、BGBl 公布日、下载时间分别记录。
- Public API 1.4、RAG Snapshot 1.2 明确语言和角色；旧 RAG 1.1 验证继续限定其原有 EU/LU、英文合同。德国 inline 文本按源顺序精确拼接。

审阅中发现并修复了 XML 上下文可丢失文本、旧 RAG 合同过宽、RAG 非正文隔离和德文 inline 拼接问题。最终审阅者验证 XML fixtures 4/4、RAG tests 11/11 通过，无剩余实质阻塞。

### 原文与旧库回归证据

- 对固定的两份官方源快照，用独立 Python ElementTree 遍历正文、来源注释和目录：GwG 231、WpIG 300 个角色哈希，共 531 项，差异为零。
- 构建前将原有 116 份 Reader DTO 与当前 Canonical 投影逐份比较，差异为零；构建后的 118 份运行库再次与旧 116 份 Reader payload 比较，差异为零。
- 新运行库中 173 个正文 norm 的 Citation 投影与 Canonical 正文哈希一致，4 个目录或来源说明 norm 不能作为默认 Citation；德文全文检索和 `GwG § 1`、`WpIG § 1` 定位通过。
- 严格 Runtime 构建成功：118 份文档、63,905 条检索记录、118 份 Expression metadata、reviewed-input issues 为零。银行 Profile 保持 99 份。

本机详细对照和构建日志位于忽略的 `data/artifacts/national-onboarding/`，原始快照位于忽略的 `data/raw/national/`。这些文件不是版本控制的交付附件；可复现入口是注册表、固定清单和构建命令。

### 最终检查

- `npm run check`、`npm run build` 通过；生产构建保留既有的大 chunk 提示。
- `npm test` 完整运行 109 个文件、466 项：107 个文件/464 项通过；2 项失败分别是遗漏 DE 版本链计数和 OpenAPI 漏列新字段。修复后两文件定向补跑 26/26 通过（OpenAPI 新增一项字段覆盖测试）。这是完整运行加修复后定向重测，未声称最后又完整重跑一次。
- XML fixtures 4/4、结构化内容与德国端到端测试 8/8、RAG tests 11/11 均在完整运行中通过；旧 Formex fixtures、法条搜索 fixtures、CRD 独立原文对照等同轮通过。
- Playwright 本机 Chrome 10/10 通过：德国两法 Reader/来源声明、国家目录及移动端、既有基金和银行治理页面。测试用忽略目录中的临时配置启动无 watch 的 API 和 Vite；缺失的 Playwright Chromium 未作为产品故障，也未下载新浏览器。
- 搜索基准 8 组查询均命中各自预期法规，引用基准 3/3、关系基准 2/2 通过；实际德国检索与逐条 Citation 另有上述验收。
- `corpus:build --profile full-corpus` 固定清单严格构建成功：118 sources / 118 Runtime documents，构建 ID `runtime-5.10.0-044662c5accc1b7c`。118 份源均为本机 local-only，尚无归档副本，不代表已部署或满足 require-archived 门槛。
- 严格固定清单与本机原有 Canonical 快照选择不同，33 份文档的 `lastChecked` 或快照/版本/构建溯源字段不同；全部正文、稳定 ID 和 Reader 结构相同。各构建分别保留来源标识。
- 严格完整版本的 RAG Snapshot 1.2 导出与 verify 成功：118 documents、62,230 provisions、20,123 relationships，语言包含德文和英文。快照仅写入忽略的本机验收目录，不是对其他项目的发布或导入声明。
- `corpus:build --profile banking-default` 固定清单严格构建成功：同一清单的 118 份源完成校验，Profile 内仍为 99 份文档、51,161 条检索记录；构建 ID `runtime-5.10.0-ce92d1aa15a3af7d`。德国两法未进入银行版。

## Second batch

本轮新增德国银行核心法 KWG 与基金法 KAGB。四部德国法构成银行、基金、AML、投资服务的部分正文覆盖；法国、卢森堡核心国家法律和其他欧洲国家仍按分阶段计划推进。

### 来源与日期

正文仅来自 Gesetze im Internet 的政府合并 XML。两份正式下载快照分别为：

- KAGB：`data/raw/national/de-kagb/20261021T074101863Z-34e8b51e7eb7`。
- KWG：`data/raw/national/de-kwg/20261021T074102916Z-0128447811ca`。

GII 合并文本的非权威来源地位保持显式标记；最后修订法日期不作为生效日期或最新版本认证。KWG 的源备注分别保留 Neuf（1998-09-09 重刊公告）和 Stand（2026-05-12 最后修订法），不改变原始 Work 的公布日期。

KAGB 原始制定法的 BGBl 公布日为 2013-07-10，来源是[BGBl I 2013 Nr. 35、S. 1981 的官方记录](https://www.bgbl.de/xaver/bgbl/start.xav?start=//*%5B@attr_id=%27bgbl113s1981.pdf%27%5D)；2013-07-04 为制定日。原始公报记载颁布主体为 Bundestag。

KWG 原始制定法公布日为 1961-07-15；1961-07-10 为制定日。依据是[BGBl I 1961 Nr. 49 原始扫描的第三方托管复制件](https://media.offenegesetze.de/bgbl1/1961/bgbl1_1961_49_watermarked.pdf)。官方 BGBl 入口的直接核验未完成；不将复制件描述为政府网站下载文件。该复制件只用于公布日期元数据，法律正文仍由独立的 GII 政府快照提供。

日期证据已冻结在忽略的 `data/artifacts/national-second-batch/kwg-publication-*`：

- 获取时间：2026-10-21T07:44:42.092024+00:00；2,501,687 bytes。
- PDF SHA-256：`076a03cafe71a7cc9f3918cd416de594026289d2db150af5c99545c97e9eac5e`。
- PDF 第 1 页（印刷 877）显示发行日、期号及 KWG 在 881 页的目录项；PDF 第 5 页（印刷 881）显示 KWG 标题、制定日及该期发行日。两页均渲染并人工对照；复制件 OCR 不作为接入正文。
- 原始 KWG 制定条款位于 PDF 第 6 页（印刷 882），记载颁布主体为 Bundestag。

### 合同与审阅

按 AGENTS.md 完成 Sol High 前置审阅和最终实现审阅。最终结论 Approve，无剩余实质 finding。实现与常规整理使用 Terra/Luna，合同及法律解析由 Sol High 审阅。

- National Canonical 1.4、national parser 1.1、Runtime 5.11；Canonical 1.2/1.3 继续读取。1.3 的内容 schema 冻结，拒绝新增列字段。
- 所有 1.4 表格保存规范化列宽，所有单元格保存列起点与跨度；解析、Canonical 原始单元验证及 Runtime Reader DTO 验证分别检查结构。Reader 仅使用规范化 `colSpan`，不解释 XML 属性。
- 本批限制单 tgroup/tbody、连续完整覆盖的行；拒绝未知列名、单边跨度、冲突定位、重复/倒序/重叠/越界列，以及未实现的 rowspan、spanspec。显式空 cell 保留，不补造文字。
- `orderedContent` 仍是 Reader/Citation 的文本源；索引必须完整、唯一、保持原顺序。正文、来源注释和目录继续隔离。Public API 1.4、RAG 1.2 不输出布局，合同版本保持不变。
- 本轮不添加转置或 IMPLEMENTS 关系，不改变 banking-default 的可见范围。

终审发现并修复：删除全部列字段会静默退回旧布局；给 line-break 添加列字段会在投影时被吞掉。修复后 1.4 强制列字段并在投影前验证节点归属，相关 41 项 fixtures 由审阅者独立重跑通过。

### 独立保真

独立 Python ElementTree 遍历与 TypeScript 解析器分开执行：

| 来源 | 逐角色文本哈希 | 表格 | 行 | 单元格 | 跨列单元格 | 空单元格 | 差异 |
|---|---:|---:|---:|---:|---:|---:|---:|
| KAGB | 1,254 | 57 | 416 | 832 | 0 | 0 | 0 |
| KWG | 738 | 2 | 373 | 689 | 57 | 42 | 0 |

两法共 1,992 项文本哈希、1,521 个单元格；单元格位置、跨度、精确文本和空格均对照。连同旧 GwG/WpIG，总计 2,523 项角色哈希无差异。

实际运行库的四法 833 个正文 norm 均通过 Citation 文本哈希核对，8 个目录/来源说明 norm 被默认 Citation 排除；四法德文全文检索及 `简称 § 1` 定位通过。

KAGB 两个 `080` 同级章节按官方 doknr 区分：§338b 归属 `BJNG007300123`（Kapitel 8），§338c 归属 `BJNG007400123`（Kapitel 9）。重复编号不会把两章合并或相互嵌套。

旧库回归将原 118 份 Reader 与新 120 份逐份比较，排除本轮新增的 `contentLayout` 和 parser/build 标识后，所有正文、稳定 ID、法律结构及其余字段一致。允许布局包装变化，不声称新旧 Reader payload 字节完全相同。

### 最终检查

独立文本/grid 对照和四法端到端测试已通过。四法接入测试使用真实固定 XML 和临时 SQLite，覆盖 Reader、API、搜索、Citation、RAG 导出与 verify；该测试的专用超时为 60 秒，未改变全局超时或减少断言。

静态检查已通过。首次完整回归中的全库 Reader 一致性测试运行约 34 秒，超过原 30 秒预算；经 Sol High 审阅，仅将此项执行预算调为 60 秒，保留全部比较断言，不作为性能门通过的声明。时间线测试改为模块级复用完整只读语料夹具，避免每项重复加载整库；其断言和失败门槛未变。

完整 `npm test` 运行 110 个文件、497 项：107 文件/492 项通过，3 文件/5 项超时，另有两条 Vitest `onTaskUpdate` 通信超时。修正上述执行预算及夹具后，三个受影响文件定向重跑 51/51 通过，无通信错误；银行 Profile 隔离文件另单独重跑 6/6 通过，无通信错误。未改全局超时或框架 RPC 超时，也未声称又完成一次全量清洁重跑。银行治理路径的单项功能测试预算由默认 10 秒改为 30 秒，同样经 Sol High 审阅，全部路径、关系及未知 ID 断言保留，不作为性能认证。

最终 `npm run check`、生产 `npm run build` 通过；生产构建保留已有的大 chunk 提示。浏览器（本机 Chrome、临时无 watch 服务配置）11/11 通过，覆盖四法阅读与来源声明、KWG Annex I 跨列、KAGB 章节归属、国家目录及移动端、原基金与银行治理页面。

固定清单严格构建均成功：

| Profile | 校验源 | Runtime 文档 | 检索记录 | Runtime build ID |
|---|---:|---:|---:|---|
| full-corpus | 120 | 120 | 65,208 | runtime-5.11.0-b0f63ed82ef430e7 |
| banking-default | 120 | 99 | 51,161 | runtime-5.11.0-942fa9e54cfada89 |

两版本均从同一固定清单校验全部 120 份源，银行版未引入德国四法。120 份源目前均为本机 local-only，不代表满足 require-archived 门槛或已部署。严格完整版本与本机默认版本排除快照/检查时间等溯源字段后，全部 120 份正文、ID、结构和布局一致。

检索基准 8 组查询均命中预期法规，引用基准 3/3、关系基准 2/2 通过。严格完整版本的 RAG Snapshot 1.2 导出并 verify 成功：120 documents、62,894 provisions、20,123 relationships，语言为 de/en。导出位于本机忽略目录，不是向其他项目发布或导入的声明。原始下载、解析输出、运行库与验收导出均保存在忽略目录，未提交或部署。
