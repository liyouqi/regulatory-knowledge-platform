# 国家维度与落地法建设方案

日期：2026-10-22。状态：按[欧洲金融法规覆盖总计划](financial-coverage-expansion-plan.md)分期实施。国家目录与详情页、德国四法德文原文和法国 AMF 法语原文已实现；其余国家正文和跨国转置查询按下文边界推进。

本轮来源准备：卢森堡 12 部核心法已核对精确 ELI 和完整版本目录，取得 9 部所选日期的法文源 JSON/XML/HTML，以及 12 份 PDF，共 1,269 页；3 个未来版本被排除。材料仍为候选，XML 内部身份与合并链接之间的差异待对照，未增加 Reader 覆盖。法国三个核心法典已定位精确代码 ID 和 DILA 开放数据路线，正文下载及版本组装待完成。见[来源审阅](national-core-source-review-20261022.md)、[逐法清单](national-core-source-snapshots-20261022.csv)及[下一候选解析方案](legilux-candidate-contract-plan-20261022.md)。

已落地：独立32国元数据目录、`/countries`及`/countries/:code`页面和内部API、Profile内实际本国正文统计、EU框架分列、门户待核验/已核验状态，以及Runtime 5.9的目录哈希与完整性校验。DE national XML adapter 已发布 GwG、WpIG、KWG、KAGB 四份德文正文，覆盖 AML、投资服务、银行与基金领域的部分材料；Canonical 1.4/parser 1.1，历史 DE 1.3 和 EU/LU 1.2 仍可读取，法国 AMF Canonical 1.5/parser 1.0.1 新增 1,821 条文、693 分组和132信息框，见[发布审阅](amf-publishing-review-20261021.md)。Runtime schema 5.12、Public API 1.5、RAG Snapshot 1.3（保留1.1/1.2验证）。全 corpus 121 份，banking-default 保持 99 份。德国四法均不意味着其领域全面覆盖，也不据此推断转置或 `IMPLEMENTS` 关系。国家发布与候选边界见[德国国家法审阅记录](national-source-onboarding-20261020.md)、[KWG/KAGB 第二批审阅](national-second-batch-review-20261021.md)及[Sol High首批审阅记录](national-first-slice-review-20261021.md)。

## 已核实的实现边界

- Canonical 和共享 DTO 已支持 `EU`、`LU`、`DE`、`FR` 法域；DE national law 使用独立 GII source system 和显式 `de:gii:*` Document ID。
- Public API jurisdiction 与语言合同已扩展以承载德文国家法；OpenAPI 与共享 DTO 通过响应 schema 测试保持一致。后续扩国仍需兼顾 Web、Citation、Topic、Path、API 和 MCP 消费方。
- 当前EUR-Lex、CSSF、EBA来源及快照按英语输入配置。不能把法国、德国等国家法律假装成英文CSSF来源接入。
- 现有国家实施关系只发布精确正文证据支持的`national Body Block → IMPLEMENTS → EU/Authority Document`。它不等同于指令的立法转置，也没有实现多国转置目录。
- 四份已发布德国法均没有建立转置或 `IMPLEMENTS` 关系；德国政府合并文本与正式 BGBl 公布文本地位分开记录。KWG 的 BGBl 日期证据来自第三方托管的原始扫描件，官方域名直连核验尚未完成。
- Profile是构建时可见范围，运行时只读；增加国家筛选不应为每个国家/领域组合都新建独立应用或动态重编译Profile。

来源：`src/shared/legal.ts`、`src/shared/public-api.ts`、`src/shared/regulatory-topic.ts`、`src/shared/regulatory-path.ts`、`src/shared/citation-context.ts`、`src/ingestion/*-source-registry.ts`、`src/relationships/national-implementation.ts`；法律关系边界见需求文档23.8节。

## 地理范围与覆盖单位

首版范围：欧盟27国；EEA非欧盟三国NO/IS/LI；独立欧洲制度GB/CH。国家使用ISO代码，希腊国家代码`GR`与欧盟数据中的`EL`做显式映射，英国采用`GB`并处理官方来源使用`UK`的情况。

EU是超国家法域，不当作国家。EEA、欧盟成员资格和具体法律的EEA纳入状态是不同事实，后者逐项有证据和时间。国家代码不等于语言，也不等于最终适用性。

覆盖的最小管理单元为国家×领域×材料层次：

| 材料层次 | 内容 | 成功标准 |
|---|---|---|
| 核心国家法律 | 法典、法律、国家条例 | 官方身份与版本明确，正文可读、稳定引用可用 |
| 转置/执行措施 | 指令转置、条例执行/罚则、国家选择或补充规则 | 来源和关系依据可查；范围与条文粒度有明确边界 |
| 监管实践 | 监管条例、通函、规则书、指引、FAQ/Q&A、报告说明 | 文件法律性质和官方状态明确，正文/目录数量分开 |
| 执法材料 | 有代表性的官方决定和裁判 | 决定原文与精确认定证据分开，既有Decision合同之外的能力单独审阅 |

一个法典可以覆盖多个领域；一次转置可涉及多份国家措施，一部国家法也可涉及多份欧盟指令。国家部分不是简单的一对一关联。

## 来源发现与版本策略

1. 从EUR-Lex National transposition获取成员国通知的国家措施标识及所涉指令，保存通知来源和获取时间。
2. 从e-Justice/N-Lex核对国家官方法律入口，再从国家公报/法律库获取正式文本。矩阵里的portal是发现候选，逐国验证现行入口、访问条件、可用格式、语言和来源地位。
3. 先确认官方文档身份和版本，再绑定解析/页码/结构定位。法律库合并文本、正式公布文本、官方译本与非官方译本保留不同地位。
4. 比较公布、生效、适用、修订、废止/替代时间；“网页最近更新”不代替法律日期。不存在完整英文时保留官方本国语言正文，不以英文可用性缩减国家范围。
5. 先做国家核心法律和关键监管材料，再逐家族发现国家通知措施及后续修订。只有目录时提供明确外部入口，不能计入完整Reader正文。

官方依据：[National transposition](https://eur-lex.europa.eu/collection/n-law/mne.html?locale=en)、[e-Justice国家法入口](https://e-justice.europa.eu/topics/legislation-and-case-law/national-legislation_en)、[欧委会关于实施核查的说明](https://commission.europa.eu/law/application-eu-law/implementing-eu-law_en)。成员国通知不等于欧委会已认定完整/正确转置，也不自动建立精确条文关系。

## 拟议的数据与关系能力

优先扩展现有jurisdiction及Expression/来源元数据；只有现有结构无法表达且有实际来源证据时才新增字段或合同。

| 维度 | 拟表达的信息 | 约束 |
|---|---|---|
| 法域 | EU或国家；原始公布机关 | 不从语言、域名、机构总部推断国家 |
| 国家上下文 | 国家入口、EU共同框架、本地材料 | EU文档保留EU身份，不复制成27部国家法律 |
| 语言/地位 | 原文语言、官方译本、翻译版本来源 | 翻译不覆盖正式正文；导航标签和正文语言可不同 |
| 文件身份与版本 | 来源原始ID/ELI、稳定Work、版本、适用时间 | 国家法典条号重复、重编号、修订插入必须有ID回归 |
| 法律性质 | 法律、条例、监管规则、通函、指引、FAQ、决定 | 不把国家法律全部归为Level 3；借用发布网站不改变颁布主体 |
| 国家实施目录 | 通知记录、欧盟指令、国家措施、官方证据、审阅状态 | 候选与已核实关系分开；多对多；不宣布完整转置 |
| 可选法律关系 | 经审阅的转置、执行、补充或EEA纳入证据 | 关系语义、端点、方向、证据粒度、Provenance先审后测；不能复用不匹配语义 |
| 完整性 | 来源发现、全文接入、版本审核、配套/关系/检索情况 | 国家矩阵不能只有一个容易误解的“已完成”勾选 |

国家筛选至少区分“该国本地材料”和“在该国上下文中查看EU共同框架”。后者只提供关联证据和清单，不做机构适用性判定。

国家实施发现记录可以先作为独立审阅输入交付；是否以及如何发布新的法律关系，由后续合同设计和Sol High审阅确定。不要将通知记录静默写成`TRANSPOSES`或既有`IMPLEMENTS`。

## 页面与查询交付

拟议入口包括国家列表、国家详情、国家×领域和EU指令×国家措施目录。路由示例`/countries`、`/countries/de`和`/countries/de/funds`需在UI实施时定稿。

- 国家详情展示机构分工、国家核心法、EU共同框架、本地配套、版本/语言和缺口。
- 全文检索增加国家、语言、材料类型和版本过滤；先过滤再排序，不能越过编译Profile边界。
- Reader展示国家、颁布机关、法律性质、原文语言、来源与版本信息，并链接已核实国家实施目录/关系。
- 反向从UCITS、CRD、PSD等家族进入各国落地材料；不存在已载入正文时显示外部官方入口及实际状态。
- 跨国比较先列出同题证据与已审阅差异；规则相同、要求更严格、完全等价等结论需另行法律审阅。
- Public API/MCP复用已有服务；enum、过滤器、响应合同、错误处理和文档同步测试，不能只扩前端下拉框。

## 工程拆分与验收

| 工作包 | 责任边界 | 验收 |
|---|---|---|
| C0：合同与来源设计 | 法域/语言、文档类型、官方身份、国家实施目录、稳定ID、API兼容性 | 定向测试方案及Sol High审阅；原EU/LU身份和语义保持可验证 |
| C1：首个国家法律来源 | 德国 XML 源已完成 GwG/WpIG 首批及 KWG/KAGB 第二批，共四份 active | national Source Adapter、不可变快照、完整源校验、解析 fixture、质量基线和表格逐格核对已审阅；DE Canonical 1.4/parser 1.1，历史 DE 1.3 与 EU/LU 1.2 可读取。静态检查、生产构建、浏览器与两版本严格构建已完成；完整回归及超时修正的重测结果见第二批验收记录 |
| C2：多国语言正文与查询 | 德语原文四法与法国 AMF 法语正文已发布 | 德文文本、原文语言与来源地位、稳定 ID、Profile 与精确引文已纳入当前合同；AMF 的 1,821 条文和 132 信息框已接入 Reader/API/RAG，计一份文档，见[发布阶段](amf-publishing-review-20261021.md)；不宣称通用跨语种语义搜索 |
| C3：国家页面与服务 | 国家列表/详情、领域、过滤器、目录和Reader上下文 | 本地国家材料和EU共同框架可区分；深链、空态、缺口及API/MCP边界通过 |
| C4：卢法德深度首批 | 德国银行、基金、AML、投资服务各有一部部分正文已发布；法国与卢森堡国家核心法律及配套仍待审阅 | 按3国×12领域冻结清单，逐项记录正文/目录/关系，不以每国一份文件结束；卢森堡已有 3 份 CSSF 材料不等于核心法律覆盖 |
| C5：可复用国家扩展 | 其余国家法律库和监管来源 | 按源格式而非按国家复制解析器；逐国质量fixture、版本/语言及来源状态 |

来源优先XML/HTML/官方结构化接口；PDF次之。只要正式材料可用就解决对应来源，不能长期把重要国家排除在英语或Formex以外。新增能力仍属于单一Node/TypeScript应用、构建准备与只读Runtime，不引入第二套法库平台。

每个工作包执行对应严格构建、`npm run check`、`npm test`和`npm run build`；解析、关系、搜索变化附专用fixture/eval。核心合同/法律解析/关系/发布门槛变更按AGENTS.md先安排Sol High审阅。当前已交付国家目录、德国四法与法国 AMF 正文；法国公布日/获取时间仍保留未知状态。卢森堡来源审计见[法卢阶段](fr-lu-candidate-review-20261021.md)，其余国家和格式继续按候选审阅流程推进。

验收除技术检查外，输出每国每领域：冻结目标文件集、官方标识/版本、已读正文、仅目录项、已核实欧盟链路、关键配套缺口、语言限制和更新时间。覆盖率仅能对这个冻结集合计算，不能表述为“某国金融法已全部覆盖”。
