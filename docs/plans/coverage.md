# 法规覆盖计划

更新日期：2026-10-22。欧盟法规和国家落地法交替推进，按批次接入。

## 目前进度

全库 121 份：112 份 EUR-Lex、3 份 CSSF、1 份 EBA 指南、德国四法和法国 AMF 总规则。银行 Profile 为 99 份。[法规列表](../corpus-status.md)由 registry 生成。

国家目录已有 32 国。德国已接入 GwG、WpIG、KWG、KAGB；法国已接入 AMF。它们分别覆盖部分领域，不代表该国金融法已收全。卢森堡原有的 3 份 CSSF 材料也不等于核心法律覆盖。

卢森堡 12 部核心法已取得精确身份和版本目录，9 部另有 XML/HTML，12 份 PDF 共 1,269 页。法国三个核心法典已定位代码 ID 和 DILA 来源。这些材料仍是候选，详见[来源记录](../reviews/lu-fr-sources-20261022.md)。

| 清单 | 范围 |
| --- | --- |
| [欧盟目录](../data/eu-catalog.csv) | 15 个领域，206 个基础 Work；112 个 active、1 个原有 planned、93 个候选 |
| [国家领域矩阵](../data/country-coverage.csv) | 32 国 × 12 领域，分别记录正文、目录和关系 |
| [国家法律发现目录](../data/national-catalog.csv) | 85 个具名事项，逐项核对身份、版本和格式 |
| [卢森堡来源快照](../data/lu-source-snapshots-20261022.csv) | 本批次的版本依据、哈希和获取时间 |

目录数量是当前列出的范围，不是欧洲金融法规的总数。一个法典或家族分多批完成时，只计一次。

## 接下来做什么

1. **卢森堡 SIF、SICAR、RAIF**：先解释 XML 内部 `/jo` 身份与合并版本链接的差异，完成候选树和独立保真检查。已有的审阅只批准 candidate-only；正式发布合同另审。具体步骤见 [Legilux 方案](legilux.md)。
2. **法国核心法典**：准备 DILA 全量基线和截止日所需增量，核对货币金融法典、保险法典和消费法典的金融相关部分。当前不能从单个增量包组装完整法典。
3. **卢森堡其他核心法**：扩至 AIFM、AML、支付、市场滥用、保险和处置法。LSF、UCI、MiFID 还需所选版本的完整结构化文本，或另审 PDF 解析方案。
4. **欧盟家族**：继续补基金、市场的配套，再补保险、可持续金融及监管实践材料。国家法接入不等待全部欧盟法规做完。
5. **其他国家**：按下方顺序扩展。能复用现有格式就复用；新格式先审解析和数据合同。

Formex 可复用的文件通常每批 8–15 份。大法典、复杂表格或新 PDF 格式通常每批 1–3 份，先完成一个可独立验收的范围。

## 欧盟范围

| 领域 | 主要家族和材料 |
| --- | --- |
| 银行审慎与集团监管 | CRR/CRD、SSM、FICOD；资本、风险、流动性、杠杆、薪酬、治理、报告及 Pillar 3 |
| 恢复处置与存款保护 | BRRD、SRMR、DGSD、信用机构清算；计划、估值和 MREL |
| 投资公司审慎 | IFR/IFD；分类、资本、流动性、治理、薪酬、报告和 SREP |
| 基金与资管 | UCITS、AIFMD/AIFMD II、MMF、ELTIF、EuVECA、EuSEF、跨境分销及组织、委托、流动性、存管、营销和报告 |
| 投资服务与市场行为 | MiFID II/MiFIR、MAR/MAD、Prospectus、BMR、Short Selling、Transparency、CRA、PRIIPs、Listing Act、众筹 |
| 衍生品和市场基础设施 | EMIR、CSDR、SFTR、结算终局性、金融担保、CCP 恢复处置 |
| 支付与电子货币 | PSD2、EMD、SEPA、即时支付、跨境支付、交换费、SCA、欺诈与报告；PSD3/PSR 先核对正式状态 |
| 信贷与金融消费者 | 消费信贷、住房信贷、信用服务商/NPL、支付账户、远程金融服务及投诉 |
| AML/CFT、制裁与资金转移 | AMLD、AMLR、AMLA、TFR、CDD/EDD、UBO、合规官、远程开户、集团控制和可疑交易报告 |
| 保险、再保险与养老金 | Solvency II、2015/35、IDD、IRRD、IORP II、PEPP、机动车保险及治理、ORSA、销售与报告 |
| 可持续金融 | SFDR、Taxonomy、绿色债券、气候基准、ESG 评级、CSRD/ESRS、CSDDD 及后续调整 |
| 会计、审计、治理与公共披露 | Accounting、IAS、Audit、股东权利、ESAP、国别报告和举报人保护 |
| 数字金融与数字资产 | MiCA、ART/EMT/CASP 配套、DLT Pilot、旅行规则；FiDA 先核对正式状态 |
| 跨行业数字监管 | DORA、GDPR、NIS2、AI Act、Data Act、eIDAS、Cybersecurity Act、Cyber Resilience Act、ePrivacy |
| 监管机构与实践 | EBA、ESMA、EIOPA、ECB、SRB、AMLA 及国家机构的规则、指引、Q&A、通函和代表性决定 |

发现入口：[欧委会金融法规总览](https://finance.ec.europa.eu/regulation-and-supervision/financial-services-legislation/overview-financial-services-legislation_en)、[EBA](https://www.eba.europa.eu/regulation-and-policy/single-rulebook/interactive-single-rulebook)、[ESMA](https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook)、[EIOPA](https://www.eiopa.europa.eu/browse/regulation-and-policy/solvency-ii_en)。正式版本仍回到官方公报或法律数据库核对。

监管材料按业务家族整理。EBA/ECB 先看治理、SREP、贷款、薪酬和报告；ESMA 先看基金、投资者保护、市场行为；EIOPA 先看治理、ORSA、报告和销售。AML 材料同时核对主管机构和替代状态。

Q&A 按对应家族的官方 Final/Published 清单分批接入，保留日期、状态、引用和历史信息。全量目录和完整答案数分别记录，验收样本数不是最终覆盖上限。

## National laws

### 国家顺序

| 批次 | 国家 |
| --- | --- |
| 优先十国 | 卢森堡、法国、德国、爱尔兰、荷兰、意大利、西班牙、比利时、奥地利、葡萄牙 |
| 其余欧盟成员国 | 保加利亚、克罗地亚、塞浦路斯、捷克、丹麦、爱沙尼亚、芬兰、希腊、匈牙利、拉脱维亚、立陶宛、马耳他、波兰、罗马尼亚、斯洛伐克、斯洛文尼亚、瑞典 |
| 欧洲其他制度 | 挪威、冰岛、列支敦士登、英国、瑞士 |

每国跟踪银行、基金、保险与养老金、支付、AML 与制裁、投资与市场、恢复处置、消费信贷、可持续与企业报告、ICT 与数据、监管规则、执法，共 12 个领域。主要法律线索已列入国家目录，不再另维护一份重复清单。

国家用 ISO 代码；希腊的 `GR`/`EL`、英国的 `GB`/`UK` 显式映射。EU 不算国家。国家身份、欧盟/EEA 成员资格和某部法律的 EEA 纳入状态分别记录。

### 来源和关系

- 从 [EUR-Lex 国家措施](https://eur-lex.europa.eu/collection/n-law/mne.html?locale=en)、[e-Justice](https://e-justice.europa.eu/topics/legislation-and-case-law/national-legislation_en)和国家官方法律库确认身份。成员国通知只是发现输入，不直接写成法律关系。
- 正式公布文本、法律库合并文本、官方译本和其他翻译分别标明。没有官方英文时保留本国语言正文。
- 公布、生效、适用、修订和废止日期分开；网页更新日、文件生成日不替代法律日期。
- 已有 `IMPLEMENTS` 只表示经精确正文证据支持的 `national Body Block → EU/Authority Document`，不等于指令转置。德国四法和 AMF 未据主题或链接新增这类关系。
- 新增转置、执行、补充或 EEA 关系前，先确定端点、方向、证据和 provenance，再审阅、测试。不把 EU 条例写成被国家法转置。
- 国家法的原始 ID、重复条号、重编号和插入条文需做回归。翻译不覆盖原文，脚注不自动成为法律义务。

### 页面和查询

已有 `/countries` 和 `/countries/:code`。后续继续补国家×领域筛选、欧盟家族到国家措施的入口、语言/类型/版本过滤，以及 Reader 和 API/MCP 的国家上下文。

本国正文与 EU 共同框架分开显示。跨国比较先列材料、条文和已审阅差异，不自动判断要求等价或更严格。Profile 仍在构建时选定，不按请求重编译，也不为国家和领域的每种组合另建应用。

## Other work

旧覆盖 backlog 中尚未完成的事项合并在这里：

- 银行治理的真实用户任务验证、更多查询和证据样本，见[任务评估](../evaluation/banking-governance.md)及[工作流记录](../evaluation/banking-workflows.md)。
- 更多机构/活动适用规则、条文级分类、机构与法律性质元数据。
- 版本比较、逐条修订来源、更多 CJEU 和国家决定；决定全文与网站摘要分开处理。
- 原始快照的远程归档、增量构建，以及远程 API/MCP 的账户授权、配额、审计和客户端 SDK。
- 定期查看未命中的法规搜索，只加入稳定简称或常用法名，并补查询回归；不把任意关键词、错拼和一次性问法都存成别名。
- 2020/1224 的复杂表格仍需解析支持，不能通过降低 1,942 个结构警告的门槛发布。
- 原 RAG 对照清单中的 GDPR 决定 `32021D0914`、`32021D0915`；指南 `JC-GL-2024-36`、`JC-GL-2024-34`、`EBA-GL-2021-02`、`EBA-GL-2024-01`、`EBA-GL-2022-05`、`EBA-GL-2022-15`、`EBA-GL-2023-04`、`EBA-GL-2024-11`；CSSF `25/882`、`25/892`、`26/915`、`21/782`、`23/842`、`23/843`、`25/878`、`25/879`。它们还需身份、文档类型或 PDF profile 审阅，不导入其他项目的快照来补数。

## 每批验收

先固定目标文件、官方身份和版本，再做快照校验、解析保真、Canonical、Runtime/Profile、检索、引用和 API 回归。目录、正文和已核实关系分别计数。

运行 `npm run check`、`npm test`、`npm run build`、对应严格 Profile 构建及专用 fixture/eval。涉及法律解析、稳定 ID、Canonical、关系或发布门槛的变更，按 [AGENTS.md](../../AGENTS.md)先审阅。旧 ID、原文和版本兼容性继续验证；不降低质量门槛。原始下载、生成产物和本地配置不进 Git。
