# 德国 KWG/KAGB 第二批审阅与验收

本轮新增德国银行核心法 KWG 与基金法 KAGB。四部德国法构成银行、基金、AML、投资服务的部分正文覆盖；法国、卢森堡核心国家法律和其他欧洲国家仍按分阶段计划推进。

## 来源与日期

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

## 合同与审阅

按 AGENTS.md 完成 Sol High 前置审阅和最终实现审阅。最终结论 Approve，无剩余实质 finding。实现与常规整理使用 Terra/Luna，合同及法律解析由 Sol High 审阅。

- National Canonical 1.4、national parser 1.1、Runtime 5.11；Canonical 1.2/1.3 继续读取。1.3 的内容 schema 冻结，拒绝新增列字段。
- 所有 1.4 表格保存规范化列宽，所有单元格保存列起点与跨度；解析、Canonical 原始单元验证及 Runtime Reader DTO 验证分别检查结构。Reader 仅使用规范化 `colSpan`，不解释 XML 属性。
- 本批限制单 tgroup/tbody、连续完整覆盖的行；拒绝未知列名、单边跨度、冲突定位、重复/倒序/重叠/越界列，以及未实现的 rowspan、spanspec。显式空 cell 保留，不补造文字。
- `orderedContent` 仍是 Reader/Citation 的文本源；索引必须完整、唯一、保持原顺序。正文、来源注释和目录继续隔离。Public API 1.4、RAG 1.2 不输出布局，合同版本保持不变。
- 本轮不添加转置或 IMPLEMENTS 关系，不改变 banking-default 的可见范围。

终审发现并修复：删除全部列字段会静默退回旧布局；给 line-break 添加列字段会在投影时被吞掉。修复后 1.4 强制列字段并在投影前验证节点归属，相关 41 项 fixtures 由审阅者独立重跑通过。

## 独立保真

独立 Python ElementTree 遍历与 TypeScript 解析器分开执行：

| 来源 | 逐角色文本哈希 | 表格 | 行 | 单元格 | 跨列单元格 | 空单元格 | 差异 |
|---|---:|---:|---:|---:|---:|---:|---:|
| KAGB | 1,254 | 57 | 416 | 832 | 0 | 0 | 0 |
| KWG | 738 | 2 | 373 | 689 | 57 | 42 | 0 |

两法共 1,992 项文本哈希、1,521 个单元格；单元格位置、跨度、精确文本和空格均对照。连同旧 GwG/WpIG，总计 2,523 项角色哈希无差异。

实际运行库的四法 833 个正文 norm 均通过 Citation 文本哈希核对，8 个目录/来源说明 norm 被默认 Citation 排除；四法德文全文检索及 `简称 § 1` 定位通过。

KAGB 两个 `080` 同级章节按官方 doknr 区分：§338b 归属 `BJNG007300123`（Kapitel 8），§338c 归属 `BJNG007400123`（Kapitel 9）。重复编号不会把两章合并或相互嵌套。

旧库回归将原 118 份 Reader 与新 120 份逐份比较，排除本轮新增的 `contentLayout` 和 parser/build 标识后，所有正文、稳定 ID、法律结构及其余字段一致。允许布局包装变化，不声称新旧 Reader payload 字节完全相同。

## 最终检查

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
