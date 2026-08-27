# Regulatory Knowledge Platform — 技术架构与开发实施文档

> 文档版本：v1.4 Profile Compilation Implemented
> 日期：2026-08-25
> 对应产品需求：`Regulatory Knowledge Platform — 产品需求规格说明书 v3.5 Profile Compilation Implemented`
> 产品语言：English  
> 技术文档语言：中文  
> 目标：把最终版产品需求落实为一套**简单、可落地、可逐步扩展、适合 Codex 协作开发**的工程架构。

---

# 0. 文档定位

本文不是第二份产品需求，而是产品需求的**技术实现基线**。所有技术选择必须服务于需求文档已经确定的核心产品能力：

- Universal One-page Act Explorer；
- Legal Reader；
- Global Command Palette / Search；
- Clickable legal text / Side Peek；
- References / Cited By；
- TF-IDF Article ↔ Recital；
- DORA ↔ RTS/ITS；
- CSSF structural adapter；
- Phase 2 的 CELLAR / CJEU / Relationship Graph；
- Phase 2 的 Edition/Profile compilation；
- Phase 3 的 financial-domain expansion、regulatory paths / taxonomy / timeline 与 Agent/RAG internal retrieval；
- Phase 4 的 Public API / MCP / external integrations。

如果本文与产品需求发生冲突，以产品需求为准；如果产品需求没有规定实现方式，则以本文作为默认工程决策。

本项目的技术策略不是追求“技术最多”，而是：

> **用最少的基础设施承载最清晰的数据契约；把复杂度放到可替换的模块内部，而不是散落到整个系统。**

---

# 1. 最终技术结论摘要

Phase 1 默认技术栈：

| 层 | 选择 |
|---|---|
| 主语言 | **TypeScript** |
| Runtime | **Node.js LTS（最低 22）**，初始化时固定版本 |
| Frontend | **React 19** |
| Router | **React Router 7** |
| Build | **Vite** |
| Styling | **Tailwind CSS 4** |
| Motion | **Motion / Framer Motion**，仅用于 Side Peek、Command Palette、轻量过渡 |
| Icons | **Lucide React** |
| Backend | **Express** |
| Runtime DB | **SQLite** |
| Node SQLite driver | **better-sqlite3**，确保 FTS5 可用 |
| Full-text search | **SQLite FTS5 + deterministic ranking** |
| Canonical data | **Normalized JSON documents + manifest** |
| Relationship runtime store | **SQLite relationship table** |
| Relationship export | **JSON nodes/edges / relation export** |
| Article ↔ Recital | **build-time TF-IDF，可配置且通过 benchmark 后启用** |
| EUR-Lex parser | **优先适配 LegalViz 已验证的 Formex parser / resolver** |
| CSSF HTML parsing | **独立 CSSF Adapter；优先 HTML，PDF 为 fallback** |
| Schema validation | **Zod** |
| Unit / integration test | **Vitest** |
| E2E | **Playwright** |
| Lint / format | **Biome + TypeScript compiler** |
| Package manager | **npm**，避免额外工具链 |
| Production deploy | **单 Node 服务 + 静态 React + 单 SQLite artifact** |
| Container | **Docker 可选但推荐用于部署** |
| Phase 4 MCP | **实施时稳定的官方 MCP TypeScript SDK，作为 Service adapter** |
| Phase 2 SPARQL | **HTTP fetch + SPARQL query templates + adapter** |
| Edition / Profile | **build-time validated configuration，生成独立只读 SQLite artifact** |
| Corpus expansion | **manifest-driven deterministic pipeline + explicit legal-semantic review gates** |

Phase 1 不需要为了“未来可能用到”预先增加 Redis、Kafka、Kubernetes、Elasticsearch/OpenSearch、GraphQL、复杂 ORM 或分布式服务。未来需要时可替换 repository / adapter，而不是重写 Reader、Explorer 或 Search UI。

---

# 2. 架构总览

## 2.1 两个运行世界：Build-time 与 Runtime

整个项目必须把“数据构建”和“用户访问网站”分开。

```mermaid
flowchart LR
    subgraph BUILD[Offline / Build-time]
        A[EUR-Lex FMX by CELEX / Bulk Dump] --> B[EUR-Lex Adapter]
        C[CSSF HTML / PDF] --> D[CSSF Adapter]
        B --> E[Canonical Documents]
        D --> E
        E --> P[Edition / Profile Selector]
        P --> F[Relationship Builders]
        P --> G[Search Index Builder]
        F --> H[Relationship Artifact]
        G --> I[SQLite FTS5 Artifact]
        P --> I
        H --> I
    end

    subgraph RUN[Runtime]
        I --> R[Repository Layer]
        R --> S[Services]
        S --> W[Explorer / Reader / Search]
        S --> API[Internal Web API]
        S --> PUBLIC[Public API - Phase 4]
        PUBLIC --> MCP[MCP - Phase 4]
    end
```

核心原则：

1. **网站运行时不解析 FMX source 或 bulk dump**；
2. **网站运行时不实时计算 TF-IDF**；
3. **网站运行时不依赖 CELLAR SPARQL 才能打开 Article**；
4. 所有昂贵、批量、可预计算的工作尽量放在 build-time；
5. Profile 在 build-time 裁剪完整 corpus，runtime 不按请求动态切换数据库；
6. runtime 主要做读取、查询、导航和渲染。

这会同时带来简单代码、快响应、可重复构建和良好可追溯性。

## 2.2 长期稳定的模块层次

```mermaid
flowchart TD
    A[Source Adapters] --> B[Parser / Normalizer]
    B --> C[Canonical Data]
    C --> P[Profile Compiler]
    P --> D[Relationship Builders]
    P --> E[Search Index Builder]
    D --> F[Relationship Repository]
    E --> G[Search Repository]
    P --> H[Document Repository]
    F --> I[Application Services]
    G --> I
    H --> I
    I --> J[Web]
    I --> K[Internal Web API]
    I --> PA[Public API - Phase 4]
    PA --> L[MCP Adapter - Phase 4]
```

**依赖只能向下。**

- Web 不允许 import FMX parser；
- MCP 不允许直接访问 raw XML；
- Search ranking 不允许写进 React component；
- CSSF 特例不允许进入 DORA/AI Act 专用 UI；
- Relationship source 不允许被 UI 猜测。
- Profile 边界不允许只在 Search 或 React 中过滤。

---

# 3. 为什么选择 TypeScript / Node 单栈

## 3.1 目标

该项目 Phase 1 的主要工作不是模型训练或科学计算，而是：

- XML / HTML 解析；
- 数据规范化；
- SQLite / FTS5；
- 浏览器 UI；
- 搜索；
- 引用解析；
- API；
- 后续 MCP。

这些工作完全可以由 TypeScript / Node 一套技术栈覆盖。

## 3.2 选择理由

1. LegalViz 已验证 React/Vite/Express + shared Formex parser 的路线；
2. Parser、Relationship Builder、Search Builder、API、MCP 都可以共享 TypeScript domain types；
3. 减少 Python/Node 两套 dependency、环境、模型定义和序列化差异；
4. Codex 在一个语言栈内更容易做准确重构；
5. SQLite FTS5 在 `better-sqlite3` 下使用简单；
6. Phase 4 Public API/MCP 可直接复用同一 Service 层。

## 3.3 Python 的位置

Phase 1 **不把 Python 设为主运行依赖**。

只有在以下情况才引入独立 offline Python utility：

- 某类 PDF 的现有 Python parser 明显优于 Node 实现；
- 某个一次性数据诊断脚本用 Python/Pandas 明显更快；
- 临时研究任务，不进入 production runtime。

原则：Python utility 的输出仍然必须进入 Canonical Contract，不能形成第二套业务模型。

---

# 4. Repository 组织

建议一个 Git repository、一个主 package、一个部署单元；内部按职责分目录，不使用 Nx/Turborepo 等额外 monorepo 框架。

推荐结构：

```text
regulatory-knowledge-platform/
├── AGENTS.md
├── README.md
├── package.json
├── package-lock.json
├── tsconfig*.json
├── vite.config.*
├── biome.json
├── .env.example
├── .gitignore
│
├── docs/
│   ├── regulatory_knowledge_platform_requirements.md
│   ├── regulatory_knowledge_platform_technical_architecture.md
│   ├── adr/
│   └── runbooks/
│
├── core/
│   ├── domain/
│   ├── contracts/
│   └── ids/
│
├── pipeline/
│   ├── acquisition/
│   ├── parsers/
│   │   ├── eurlex/
│   │   └── cssf/
│   ├── normalization/
│   ├── relationships/
│   ├── search-index/
│   └── validation/
│
├── server/
│   ├── repositories/
│   ├── services/
│   ├── api/
│   ├── middleware/
│   └── mcp/                 # Phase 2
│
├── web/
│   ├── components/
│   ├── views/
│   │   ├── explorer/
│   │   ├── reader/
│   │   └── search/
│   ├── hooks/
│   ├── state/
│   ├── api/
│   └── styles/
│
├── scripts/
│   ├── data/
│   └── dev/
│
├── tests/
│   ├── fixtures/
│   ├── parser/
│   ├── search/
│   ├── relationships/
│   └── e2e/
│
└── .local-data/             # ignored by Git
    ├── raw/
    ├── canonical/
    ├── build/
    └── regulatory.sqlite
```

如果 raw dump 希望放在 repo 外，可通过 `REGULATORY_DATA_DIR` 指向，例如：

```text
~/Data/regulatory-platform/
```

**Git 中只保留：**

- 代码；
- schema；
- 小型 test fixtures；
- benchmark snapshots；
- 文档；
- 必要的人工 curated mapping。

不把完整 FMX dump、完整 canonical corpus 或生产 SQLite artifact 提交到 Git。

---

# 5. 数据生命周期

## 5.1 数据的四个状态

### Raw Source

官方原始文件，只做保存和追溯：

- EUR-Lex FMX；
- CSSF HTML；
- CSSF PDF；
- Phase 2 CELLAR response / case source snapshot。

Raw source 不直接供 UI 使用。

开发机的 `data/raw/` 继续由 Git 忽略。参与正式发布的 source snapshot 必须按 content hash 保存到受控、不可变或具备版本保留策略的对象存储，并在 release record 中记录 locator 与 checksum；否则只能声称“可重新获取并重新构建当前版本”，不能声称能够逐字节重现已经丢失的历史构建。对象存储保留策略在扩展下一批金融法规前落地，不把 raw dump 提交到 Git。

### Canonical Data

Parser / Normalizer 输出的统一法律数据，是平台内部的**消费契约**。官方 source artifact 才是法律文本来源；Canonical Data 是可追溯、可验证、可重建的规范化表达，不声明自身具有独立法律权威。

### Derived Data

从 Canonical Data 派生：

- FTS index；
- search aliases；
- TF-IDF relations；
- reverse citations；
- Explorer lightweight structure；
- runtime SQLite。

Derived data 必须可重建，不能成为唯一事实来源。

### Profile Compilation

Profile Compilation 是 Canonical 与 Runtime 之间的确定性选择步骤，不是第五份法律事实来源。它读取版本控制并经过 schema validation 的 Edition/Profile 配置，选择允许进入当前 artifact 的 Documents，并据此过滤 Definitions、Relationships、Search records 与 metadata-only external nodes。

约束：

- Profile 不修改 Canonical document 或 stable ID；
- relationship 只有在端点和 relation policy 都满足当前 Profile 时才能发布；
- Web route、Search、Graph、Library 与内部 service 读取同一编译结果；
- `profileId`、配置版本和配置 hash 参与 runtime build ID；
- 无 Profile 参数时使用显式的默认 Profile，不允许代码各处形成隐式默认值；
- Profile 表达产品 corpus 范围，不替代 provision-level applicability 判断。

当前实现使用 `data/edition-profiles.json` schema `1.0.0`，默认 `full-corpus`，并提供 `banking-default` allowlist。`src/runtime/edition-profile.ts` 负责 schema validation、profile/config hash、known family/document fail-closed validation 与 document/source compilation；Runtime builder 仍是唯一的 Definitions、Relationships、Search、Regulatory Context 与 SQLite 发布边界。SQLite `5.2.0` manifest 保存 Profile ID/version/display name/hash，Search 与 Repository 启动时读取同一 identity，`runtime:verify` 要求两者匹配。Profile 不允许的已注册 endpoint 在 lifecycle、Domain assignment、Authority relation 与 legal-nature input gate 被删除，不能降级为 external Work 或 metadata record 绕过 corpus policy。

### Runtime Artifact

网站运行时使用的 compact SQLite + static frontend build。

## 5.2 Build Manifest

每次完整数据构建应生成一个 manifest，记录：

- build ID；
- build time；
- canonical schema version；
- SQLite schema version；
- source snapshot identifier；
- 输入文件数量；
- 输入 checksum；
- 成功 document 数；
- 失败 document 数；
- relationship 数量；
- search index 数量；
- 输出 artifact checksum。
- edition/profile ID、版本与配置 checksum；
- reviewed mapping/taxonomy dataset checksum；
- raw source archive locator（正式 release）；
- previous active build ID；
- validation result；
- refresh status / failure summary。

目的：出现问题时可以明确回答“这个页面的数据是哪次构建产生的”。

---

# 6. Canonical Data 技术模型

产品需求已明确：不能假设所有法律都只有 Chapter → Section → Article。

## 6.1 核心实体

至少保持以下一等实体：

| Entity | 说明 |
|---|---|
| RegulatoryFamily | DORA / GDPR / AI Act / MiCA / CSSF 等用户视角的法规族 |
| Document | 一份正式法律/监管文档 |
| StructuralNode | Title / Part / Chapter / Section 等不承载正文的层级节点 |
| Provision | Article / paragraph / point / subparagraph / Recital / Annex 及其内部节点等可定位法律内容的统一基类 |
| Definition | 术语定义 |
| Relationship | 两个实体之间的有来源关系 |
| Case | Phase 2 CJEU case |
| Decision | Phase 3 supervisory/national decision |

`Recital` 与 `Annex` 在产品上是独立 collection，在 Canonical Contract 中仍使用 Provision 的共同字段和 stable-ID 规则，通过 `provision_type` 区分。只有当其专属字段产生真实差异时才增加 subtype，避免正文、搜索和关系层维护平行模型。

Document 与 Provision 至少同时保存：

- `language`；
- logical entity ID；
- source expression/version ID；
- `source_snapshot_id`；
- `display_order`；
- `source_locator`；
- `parser_warnings`；
- Document ↔ RegulatoryFamily 多对多 membership。

## 6.2 Stable ID

ID 不能使用 UI slug 作为事实标识。

建议逻辑 ID：

```text
EU document: eu:<CELEX>
Article:     eu:<CELEX>:article:<n>
Paragraph:   eu:<CELEX>:article:<n>:paragraph:<n>
Recital:     eu:<CELEX>:recital:<n>
Annex:       eu:<CELEX>:annex:<n>
CSSF doc:    lu:cssf:<document-id>
```

logical ID 用于跨视图识别“同一法律实体”，source expression/version ID 用于识别某次具体文本，例如：

```text
eu:<CELEX>:article:<n>@<source-version>
```

显示路径和 URL 可以变化，logical ID 不应变化；不同 source version 的正文、hash 和 provenance 不得覆盖。ID normalizer 必须覆盖 `6a`、罗马数字、重复局部编号、Annex 内部层级和 CSSF 非规则编号。DOM anchor 由 logical ID 映射生成，但不是数据库主键。

## 6.3 Structural Path

每个 Article/Provision 带 `structural_path`，例如：

```text
TITLE III → CHAPTER 2 → SECTION 1
```

而不是强制存成固定三列 `chapter / section / article`。

Explorer 与 TOC 都从同一 structural tree 生成。

## 6.4 Schema Version

每份 Canonical Document 必须带 schema version。

如果未来 schema 变化：

- 通过 migration / rebuild 更新；
- 不允许 UI 靠兼容多个未定义历史 JSON 形状维持运行。

---

# 7. EUR-Lex Ingestion

## 7.1 数据来源

Phase 1 使用 English FMX / Formex 数据作为 EU primary source。

获取顺序：

1. `Release 0.1` 按 CELEX 获取 DORA、GDPR、AI Act、MiCA、NIS2、Data Act；
2. 保存每个 source artifact、checksum、retrieved-at 与官方 URL；
3. 支持显式 refresh 和 metadata/checksum change detection；
4. 核心纵向链路稳定后再引入完整 English dump，用于扩大覆盖和批量兼容性验证；
5. refresh/build 失败不得替换当前 active artifact。

Release 0.5 增加一个有意受限的 `sourceStatus` contract：`basis`（original OJ / consolidated）、`textAsOf`、`checkedAt`、`currentVersionUrl` 和零到多个官方 corrigendum date/URL。它随 Registry → Canonical SourceSnapshot → Reader DTO → SQLite 构建传播。Reader 与 Level 2 Library 必须明确提示“当前载入的是原始 OJ 还是 consolidated text”，且原始 OJ 存在后续勘误时不得暗示勘误已经合并。source-status hash 参与不可变 Canonical artifact 路径和 runtime build identity，同一 OJ snapshot 后续增加勘误不会覆盖旧 artifact。

SQLite `4.3.0` 在不修改 Canonical `1.0.0` 的前提下，增加 `document_version_chains`、`document_versions`、`document_version_edges` 三张规范化只读表，并由 `document-version-chain@1.0.0` 在 build time 从已核验 `sourceStatus` 投影。当前只允许发布 loaded original/consolidated snapshot、外部 current-version link 和官方 corrigendum 节点，以及 `CURRENT_VERSION_LINK` / `HAS_CORRIGENDUM` 两种 `OFFICIAL_METADATA` 边。外部节点不代表其正文已载入 Reader；没有核验输入时不生成 chain，且当前不生成 `AMENDED_BY`。builder version 进入 runtime identity，节点/边数量进入 manifest，并通过独立 API 与 Reader version history 读取。它是第 22.2 节的首个有界切片，不是完整 amendment/version graph；后续修订法案、consolidated lineage、Article-level provenance 和 snapshot comparison 仍需独立核验输入。

当前 SQLite `5.2.0` 在该 version-chain contract 之外保留独立 `legal_works` / `lifecycle_relationships` 与 `case_entities` / `case_law_relationships` 表。CELEX-derived Work ID 与 loaded EU Document ID 收敛；loaded Work 通过 nullable foreign key 回到 `documents`，external Work 只保留 CELEX、CELLAR URI、显示标签和官方 URL。Case 使用独立 `case:eu:<CELEX>` namespace，并只以 foreign key 指向 loaded target Document。`AMENDS` / `CORRECTS` / `INTERPRETS` 不进入要求两端均为 loaded `legal_entities` 的主 `relationships` 表，因此不会把 metadata-only endpoint 伪装成正文已载入的 Document 或 Judgment。reviewed dataset、builder version、65 条 lifecycle 边、63 个 external Work、72 个 Case 与 72 条 Act-level case edge 均进入 runtime identity/manifest。

SQLite `5.1.0` 包含 `regulatory_domains` / `domain_assignments`、`authorities` / `authority_relationships` 与 `legal_natures` 三组规范化 context 表。Domain taxonomy/assignment 只接受版本控制且已审核的 `EDITORIAL` 输入；Authority、`Document → ISSUED_BY → Authority` 和 guideline legal nature/status 只接受独立 `OFFICIAL_METADATA` 输入。EBA guideline 的 instrument type、make-every-effort-to-comply expectation、in-force/under-review 状态、application date 及各自 evidence endpoint/source 分字段存储，不把 editorial classification、issuer、status 或正文关系混为一个标签。所有 endpoint 在 Edition compilation 后由 loaded Document/`legal_entities` foreign key 约束，避免 Profile 外数据回流。Repository 继续通过 `/api/documents/:documentId/regulatory-context?provisionId=<stable-id>` 投影单一 DTO；Reader 与后续 Agent/RAG adapter 不读取 curated JSON 或 SQLite 表细节。

EBA acquisition 使用独立 registry、same-authority HTTPS redirect guard、immutable page/PDF snapshot 和 `eu:eba:gl:<year>:<sequence>` stable Document ID。EBA 与 CSSF parser 只共用 authority-neutral tagged-PDF event extraction；legal-body page boundaries、连续编号、Annex、warning ceiling 和 official-text hashes 属于 EBA parser profile。EBA/GL/2021/05 的 reviewed builder 将 CRD Article 74(3) → EBA Document 发布为 `MANDATES`，将 EBA paragraph 5 → CRD Article 74 发布为 `SUPPLEMENTS`；两条边均保留 `OFFICIAL_MAPPING` provenance、exact excerpt、source URL、builder/version，且不从普通 citation 自动升级。

## 7.2 LegalViz reuse strategy

LegalViz 已验证：

- Formex → article/chapter/section/recital/definition/annex；
- internal references；
- cross-law references；
- CELEX resolution；
- HTML fallback；
- shared parser 被 Web/API/CLI 共用。

因此开发顺序必须是：

1. 先运行并理解 LegalViz parser 的输入输出；
2. 用 DORA / GDPR / AI Act / MiCA / NIS2 / Data Act 做 regression fixtures；
3. 根据项目采用的代码复用方式，选择保留来源说明并适配，或按明确输入输出和测试独立实现；
4. 建 Adapter 将 parser 输出转换为本项目 Canonical Model；
5. 只有确认 parser 不适配的部分才改写，不做无价值的机械改名。

若直接复用 `.mjs` shared parser，可以通过 typed adapter 接入并保留其来源/许可证信息；等功能稳定后再决定是否逐步 TypeScript 化。若独立实现，则以公开行为、官方 Formex 样本和本项目 fixtures 为 contract，不逐行转写第三方实现。

## 7.3 Parser 质量门槛

每个核心法规至少校验：

- document title；
- CELEX；
- Article count；
- Recital count；
- Annex count；
- Article numbering sanity（允许 `6a`、删除/保留编号和合法跳号，不以连续性作为硬规则）；
- structural labels；
- paragraph anchors；
- normalized text diff / representative paragraph exact match；
- internal reference resolution rate。

---

# 8. CSSF Ingestion

CSSF 必须作为独立 source adapter，不污染 EUR-Lex parser。

## 8.1 优先级

1. HTML 有结构时优先 HTML；
2. 官方 PDF 为 fallback；
3. PDF 解析只负责恢复结构与正文，不做 AI interpretation；
4. 对结构异常的少数文档允许 curated override，但 override 必须显式记录 provenance。

## 8.2 CSSF Adapter 输出

无论来源 HTML 还是 PDF，都输出同一 Canonical Document：

- authority = CSSF；
- jurisdiction = LU；
- document type；
- official URL；
- publication/update date；
- structural path；
- provisions；
- explicit references。

## 8.3 结构规则

CSSF 可以出现 Part / Chapter / Section / Subsection / Paragraph 等不同层级。Parser 只负责忠实恢复层级，Universal Explorer / Reader 不写 CSSF 特例页面。

Release 0.6 的首批 source contract 使用独立 `data/cssf-source-registry.json` 与 `data/raw/cssf` snapshot namespace，不扩展 CELEX registry，也不让 CSSF URL/HTML/PDF 规则进入 Cellar adapter。首批代表集包含一份完整 HTML communiqué 与两份 PDF Circular；snapshot 统一记录官方 landing page、content URL/media type、ETag/Last-Modified（存在时）、byte count、SHA-256 和 `lu:cssf:<local-id>`。HTML adapter 已通过 heading、paragraph、nested list、footnote、entity、source locator 与 stable-ID fixtures，并以 section/block count、warning ceiling 和正文 anchor hash 作为 fidelity gate；无法表达的正文图片与排除的 related-document collections 必须形成显式 warning。Tagged-PDF adapter 使用 PDF semantic structure 恢复 heading/list/table role，并以文内显式编号 marker 确定层级，不由视觉缩进或模型推断法律语义；所有正文节点保留 page locator。Incident-reporting profile 用于 25/893，并通过 introduction、4 个 chapter、连续 points 1–15、嵌套 point、稳定 ID、count/warning/hash gates；签名 table 的排除形成显式 warning。Consolidated-governance profile 用于 12/552，把 Sub-chapter 映射为既有 Canonical `division`，按 Part namespace 恢复 82 个结构节点及 Part I 1–3、Part II 1–186、Part III 1–51 的本地连续编号，另保留 Part IV timeline、Annex I–II、无编号导语和 tagged substantive table；只排除 contact footer。重复编号的 Canonical ID 与 Reader route 均包含稳定 Part 上下文，official label 不变。两份 Circular 均已通过独立 structural fixture 与 page/structure/provision/point count、warning ceiling、正文 anchor hash gate，并进入同一 runtime contract。

---

# 9. Relationship Layer

## 9.1 定位

本地 Relationship Store 不是 CELLAR 的镜像，也不是某一种图数据库的绑定层。

它是平台自己的**统一监管关系模型**，汇聚：

- 原文 explicit references；
- reverse cited-by；
- cross-law links；
- DORA RTS/ITS mapping；
- TF-IDF related recitals；
- Phase 2 CELLAR official relations；
- Phase 2 CJEU article citations；
- Phase 3 topic / decision relations。

## 9.2 Relationship runtime storage

Phase 1 直接使用 SQLite 普通表。

主要字段：

| 字段 | 说明 |
|---|---|
| relationship_id | 确定性或持久化关系 ID |
| source_entity_id | 源实体 stable ID；正文引用精确到 paragraph / point 等 block entity |
| relation_type | REFERENCES / MANDATES / ADOPTED_UNDER / SUPPLEMENTS / RELATED_RECITAL 等受控关系类型 |
| target_entity_id | 目标 Document / Article / Annex stable ID |
| provenance | LEGAL_TEXT / OFFICIAL_METADATA / OFFICIAL_MAPPING / TFIDF 等 |
| evidence_locator | 原文 span、XML path、metadata predicate 或 curated record ID |
| score | TF-IDF 等算法关系分数 |
| source_ref | 原始官方 URL / query / snapshot |
| builder_method / version | 生成器和规则版本 |
| resolution_status | resolved / external / unresolved / ambiguous |
| build_id | 哪次数据构建生成 |

关系表需要唯一约束，至少覆盖 `source_entity_id + relation_type + target_entity_id + provenance + evidence_locator`。`CITED_BY` 默认由 `REFERENCES` 反向查询，不要求保存重复边；只有性能数据证明必要时才物化。RTS/ITS 是 Document type，不编码成 `RELATED_RTS` / `RELATED_ITS` 两套平行关系。

Release 0.4 实际 runtime schema 使用两张普通表：

- `legal_entities`：为 Document、顶层 Provision 与 paragraph/point 等正文 block 提供统一 stable-ID JOIN 边界；保留 `document_id`、`parent_entity_id`、`root_provision_id`、kind/label/title/path；
- `relationships`：保存有向边、原文 evidence、官方 source ref、provenance、builder method/version、resolution status 与 runtime build ID。

当前只物化 `resolution_status=resolved` 的边。无法确定、歧义或目标未进入本地 corpus 的引用不写入关系表，只进入 build manifest 的 `unresolvedReferenceCount`；官方正文保持原样。`CITED_BY` 使用 `target_entity_id` 索引反向查询同一条 `REFERENCES` edge。

## 9.3 Builder pattern

每种关系来源独立 builder：

```text
ExplicitReferenceBuilder
TfidfRecitalBuilder
OfficialMappingBuilder
CellarRelationshipBuilder        # Phase 2
CaseCitationBuilder              # Phase 2
```

所有 builder 输出同一 Relationship Contract。

当前 `explicit-reference@1.0.0` 先覆盖可保守确认的 singular Article / Annex、typed modern EU Regulation / Directive，以及“Article … of Regulation/Directive …” compound citation。parser 尚未保留的 Formex structured-link metadata 和无法可靠判断目标的 shorthand/range 不由文本规则猜测。builder method/version 参与 runtime build ID，关系语义变化必须升级 builder version 并运行 dedicated relationship fixtures。

Release 0.5 的 `official-mapping@1.0.0` 读取版本控制且经 schema 校验的 `data/official-mappings/level2.json`。Level 2 法规本身先走相同 official snapshot → Canonical → Document/Entity 流水线，因此 mapping 不引入 external-node 旁路或第二份正文。builder 验证两端文档、Article endpoint、Canonical official title 以及 mandate evidence 是否真实存在于 Level 1 正文，再为每条核验记录输出 `MANDATES` 与 `ADOPTED_UNDER` 两条有向边。mapping 内容和 builder version 均参与 runtime build ID。

Phase 2 首个 `cellar-focused-relations@1.0.0` 使用固定 CELEX `VALUES` 和 predicate 白名单查询官方 SPARQL endpoint。fetch 结果、query 与 SHA-256 manifest 进入 ignored raw snapshot；只有人工复核后的 `data/official-metadata/cellar-focused-relations.json` 参与 runtime build。builder 只接受官方 Publications Office CELEX / CELLAR URI，并只在两端 document entity 均存在时输出 `OFFICIAL_METADATA` edge。当前 predicate 映射为：

| CDM predicate | Relationship type | Scope |
|---|---|---|
| `resource_legal_based_on_resource_legal` | `ADOPTED_UNDER` | Document → Document |
| `resource_legal_completes_resource_legal` | `SUPPLEMENTS` | Document → Document |

`work_cites_work` 暂不发布，以避免把粗粒度 Work citation 与已有 Article/body-block `REFERENCES` 混合。Article Graph projection 只接受真正以当前 root provision 为 endpoint 的边，不把 Reader 提供的 document context 重写成 Article relationship。Document Graph 单独查询所有跨文档 relationship，并只在 UI-owned projection 中把 Article/body-block endpoints 折叠到其 stable document entity；原始 relationship endpoints、evidence 与 provenance 不变，同文档 self-edge 不进入 Document Graph。

独立 `cellar-lifecycle@1.0.0` adapter 使用开放一跳查询，只允许 `resource_legal_amends_resource_legal` 与 `resource_legal_corrects_resource_legal`，并校验每条结果至少一端属于 seed CELEX。它支持 URL-encoded corrigendum CELEX（例如 `32024R2956R(01)`），固定官方 host、response size、query/response SHA-256 与 immutable ignored snapshot。2026-08-24 的 65 条 verified candidate 全部涉及 external Work；人工复核后的 normalized dataset 才由同版本 runtime builder 消费。builder 输出 24 条 `AMENDS`、41 条 `CORRECTS` 和 64 个 metadata-only external Works，写入独立表并只投影到 Document Graph。external endpoint 没有 Reader path；若同一 CELEX 日后作为正式 Document 载入，其 stable Work ID 与 Document ID 收敛，而不是迁移到第二套身份。

## 9.4 为什么 Phase 1 不需要专用“Citation Engine”服务

当前问题可以由简单 builder + resolver 完成：

- Formex 自带链接优先；
- 文本规则 / regex fallback；
- stable ID resolver；
- 反向索引。

如果未来实际出现大量 citation dialect / unresolved edge，再把 resolver 内部升级，不改变 Relationship Contract。

---

# 10. TF-IDF 架构

TF-IDF 属于 Phase 1 后段的可选 lightweight statistical relation。它不阻塞 Reader、Search、explicit references 或 official mappings 发布。

## 10.1 运行位置

**build-time 预计算**，不是浏览器每次实时计算。

## 10.2 输入

同一法案内：

- Articles / provisions；
- Recitals。

## 10.3 输出

对每个 Article 保存 Top-N related recitals：

- target stable ID；
- score；
- method=`TFIDF`；
- build version。

## 10.4 质量策略

- N 可配置，不预设所有法案都必须展示相同数量；
- stopword / token normalization 固定；
- 同一 build 结果确定性；
- 不与 explicit reference 混为同一 provenance；
- 建立一个小型人工 benchmark，检查 AI Act / GDPR / DORA 已知 article-recital pair 的 Top-N 命中；
- build report 记录 benchmark 结果，未达到配置门槛时不向 UI 发布该关系；
- `score` 仅表示文本相似度，不表示法律置信度。

TF-IDF 是代码计算，不需要调用任何 LLM。

当前 `tfidf-related-recital@1.0.0` 对 DORA、GDPR、AI Act 使用版本控制的 8-case benchmark，要求 Top 5 case hit rate 为 100%。完整 benchmark 语料与门禁均满足时，builder 才把 `RELATED_RECITAL` 写入统一 `relationships` 表；不完整测试语料或门禁失败时写入 0 条。benchmark 内容与 builder version 参与 runtime build ID，manifest 记录 case-level evaluation 和发布数量。该关系能力本身不要求 schema 变更；后续 SQLite `4.2.0` 仅为 CSSF 增加与 CELEX 分离的 local identifier contract。

---

# 11. Search Architecture

这是 Phase 1 的核心技术模块之一，直接参考 LegalViz 已验证路线。

## 11.1 为什么 SQLite FTS5

需要支持：

- law title / acronym / CELEX；
- full-text；
- definitions；
- snippets；
- phrase search；
- prefix match；
- deterministic ranking；
- 本地单机部署。

SQLite FTS5 已足够，不引入 Elasticsearch/OpenSearch。

`better-sqlite3` 作为 Node driver；构建和启动时必须通过实际创建/查询 FTS5 test table 验证 capability，不能只根据 package 名称假设 FTS5 可用。

## 11.2 Search Index Builder

从 Canonical Data 生成：

### metadata records

- title；
- short name；
- CELEX；
- number/year；
- document type；
- family；
- authority；
- status；
- aliases。

### provision excerpts

- index unit 明确为最小可独立定位且适合展示 snippet 的 Provision；默认 paragraph，有结构限制时回退到 Article/Recital/Annex node；
- stable provision ID；
- law ID；
- article/paragraph label；
- heading；
- normalized plain text；
- display snippet source。

### definitions

- normalized term；
- display term；
- definition text；
- source provision；
- document / family。

## 11.3 Find Laws ranking

顺序原则：

1. exact CELEX；
2. exact known acronym/alias；
3. exact legal number/year；
4. exact normalized title；
5. strong prefix/title match；
6. FTS lexical match；
7. secondary contextual matches。

已知 alias 例如：

- DORA；
- GDPR；
- AI Act；
- MiCA；
- NIS2。

`DORA` 不应因为通用关键词出现而被无关 Regulation 挤到后面。

## 11.4 Full-text

FTS5 返回：

- stable result ID；
- law / family；
- article/paragraph；
- snippet；
- escaped highlight/snippet fragments；
- rank。

点击直接落到 paragraph-level URL。

Search Service 必须拥有独立 query parser：限制 query 长度、token/prefix 数量和结果数，转义或拒绝不支持的 FTS5 syntax，并始终使用 SQL parameter binding。普通用户输入不得直接拼接进 SQL 或未经约束的 `MATCH` expression。

## 11.5 Current-law Quick Go

当前已打开法规使用浏览器端小型 inverted index：

- Article number；
- title；
- Recital number；
- Annex；
- known definitions。

目的不是代替全局 FTS，而是让 Cmd+K / Quick Go 在当前法案内零延迟跳转。

## 11.6 Search Service Contract

UI 不直接 SQL。

Search Service 统一提供：

- find laws；
- search provisions；
- search definitions；
- recent/opened law metadata；
- resolve citation / alias；
- future relation filters。

---

# 12. Runtime SQLite 设计

Phase 1 推荐一个 SQLite artifact，避免多数据库同步。

Release 0.3 先采用最小化 runtime schema，以现有稳定 API DTO 作为 materialized read model，不为了关系型纯度拆解递归 Reader 树。逻辑表族：

| 表族 | 用途 |
|---|---|
| build_manifest | schema/build ID、Canonical input lineage 与 corpus counts |
| documents | 可查询的 document/family/source metadata；不参与筛选的 bounded `source_status_json` |
| document_views | 经 schema 校验的 Reader / Explorer JSON read model |
| document_aliases | reviewed short names / legal aliases |
| search_records | paragraph-level derived search records |
| definitions | normalized, traceable definitions |
| search_records_fts / definitions_fts | FTS5 virtual tables |
| legal_entities / relationships | stable entity JOIN、explicit references、reverse cited-by、official Level 2 mappings |
| legal_works / lifecycle_relationships | loaded/external CELEX Work identity、reviewed amendment/corrigendum metadata |

`document_views` 是有意的 build-time denormalization：Reader / Explorer 一次主键查询即可返回现有 DTO，不在每次请求中用多表 JOIN 重建递归树。它与全文记录、Definitions 都由同一次 Canonical → SQLite build 生成，不存在人工双写。

只有当 References / Relationships 出现需要独立查询的真实实体访问模式时，才增加最小的 entity/relationship 表；不提前建立通用 ontology、RDF store 或十余张未被运行时使用的结构表。稳定 ID 保证 materialized view 将来可以无损拆分或导出 RDF。

不使用 Prisma/Drizzle 作为 Phase 1 默认 ORM。

理由：

- FTS5 本身需要原生 SQL；
- 数据模型稳定且表数量有限；
- raw SQL + repository 更直接；
- 避免 ORM 对 FTS / bulk insert / build pipeline 的额外抽象；
- SQLite artifact 是可重建的，不需要复杂 migration framework。

仍需维护编号 SQL migration / schema scripts，并使用 `PRAGMA user_version` 或等效 schema version。

---

# 13. Repository Layer

Repository 是存储替换边界。

逻辑能力至少包括：

- DocumentRepository；
- ProvisionRepository；
- DefinitionRepository；
- RelationshipRepository；
- SearchRepository；
- FamilyRepository。

这些名称描述职责，不要求 `Release 0.1` 立即建立六套 class/interface。初期可以在一个 SQLite repository module 内按函数分组；只有出现替代实现、复杂测试替身或独立变化原因时再拆接口。

要求：

1. Service 不 import `better-sqlite3`；
2. Repository 返回 domain DTO，而不是 SQLite row 任意透传；
3. future storage change 只影响 repository；
4. Web / MCP 不知道 SQLite 路径。

---

# 14. Service Layer

Service 是 Web 与数据访问之间的业务边界，因为 Phase 1–3 Web 产品及 Phase 4 Public API/MCP 都依赖它。下面名称表示能力分组，不要求每组成为独立进程或无状态 class；优先使用小型函数模块，出现真实复杂度后再拆分。

## 14.1 Document Service

- get law metadata；
- get explorer structure；
- get navigation neighbors；
- get source info。

## 14.2 Provision Service

- get Article / paragraph；
- get Recital / Annex；
- resolve stable ID；
- side-peek payload。

## 14.3 Relationship Service

- outgoing relations；
- incoming relations；
- grouped relationship panel；
- DORA RTS/ITS；
- related recitals；
- Phase 2 cases/amendments。

## 14.4 Search Service

- law search；
- full-text；
- definitions；
- citation resolution；
- query normalization / ranking。

## 14.5 Family Service

- DORA family；
- AI Act family；
- CSSF authority collections；
- Level 1/2/3 groupings。

---

# 15. REST API

Phase 1–3 使用内部 Web API。它遵守 stable ID、错误语义和 DTO 边界，但在 Phase 4 首次公开 API version 发布前允许随 repository 内部版本演进；不得为了尚未存在的外部兼容承诺保留不合理设计。

建议资源风格：

```text
/api/families/:familyId
/api/documents/:documentId
/api/documents/:documentId/structure
/api/provisions/:provisionId
/api/relationships/:documentId/:provisionId
/api/relationship-queries/level-2-mandates?documentId=:documentId&provisionId=:provisionId
/api/search/laws
/api/search/fulltext
/api/search/definitions
/api/documents/:documentId/definitions
/api/resolve
```

API response 必须返回 stable IDs，不让前端靠标题重新识别实体。

`/api/relationship-queries/level-2-mandates` 是一个有意保持狭窄的 Phase 2 internal adapter：service 先复用 Provision Relationships，再仅投影 `MANDATES` relationship group。它接受 stable document/provision IDs，不接收自然语言，且不会对空结果作法律否定推断。首个 `/relationship-queries/level-2-mandates` UI 仅将其作为 DORA Article → reviewed RTS/ITS 模板展示；DTO 继续携带统一 relationship contract 的 evidence、provenance、builder 与 stable endpoints。新增查询模板必须复用同一 repository/service 数据，不能直接访问 raw 或 curated mapping input。

错误响应要区分：

- not found；
- unresolved reference；
- source unavailable；
- unsupported document structure；
- build/index mismatch。

Phase 4 MCP 只调用 Service，不需要通过 Public API HTTP 绕一圈；Public REST 与 MCP 是两个 delivery adapter。

---

# 16. Frontend Architecture

## 16.1 一个 UI Shell，多种数据视图

```text
Top Navigation
 ├─ Family switch
 ├─ Global Search / Cmd+K
 └─ Theme

Main Views
 ├─ Explore
 ├─ Read
 ├─ Recitals / Annexes
 └─ RTS/ITS / Related
```

Explorer、Reader、Search 不维护各自数据副本。

## 16.2 State 原则

优先级：

1. URL = 可分享的业务状态；
2. React local state = UI 临时状态；
3. Context = 少量跨组件 UI state；
4. localStorage = recently opened、theme、轻量偏好。

Phase 1 不默认引入 Redux/Zustand。

## 16.3 Data fetching

保持轻量：

- native fetch + typed client；
- 简单 request cache；
- Side Peek 可 cache 最近实体；
- 不因为“以后也许需要”预先引入复杂 client state framework。

如果 Phase 2 出现大量后台 mutation、分页和服务器 cache，再评估 TanStack Query。

---

# 17. Universal Explorer

Explorer 是平台 capability，不是每部法规单独写页面。

## 17.1 输入

仅需要：

- document metadata；
- structural tree；
- Article labels/titles；
- lightweight relation counts/badges。

不需要一次下载整部法规所有正文。

## 17.2 Renderer

Universal Explorer 按 structural node 的 `type / number / title / depth / children` 渲染。

因此：

- DORA 显示 CHAPTER / SECTION；
- MiCA 可显示 TITLE / CHAPTER；
- CSSF 可显示 PART / CHAPTER / SECTION；
- chapterless law 自动 flatten。

## 17.3 Interaction

- Article click → Reader；
- relation badge → relationship/RTS context；
- search highlight → Explorer 定位；
- Reader “View in Explorer” → 回到同一节点；
- navigation state 保留滚动位置。

---

# 18. Legal Reader

## 18.1 三栏结构

- 左：Adaptive TOC；
- 中：official legal text；
- 右：relationship context。

## 18.2 Inline reference handling

渲染顺序：

1. parser 提供的 structured ref；
2. resolver 补充 stable target；
3. unresolved ref 显示为普通文本或外部官方链接；
4. 不允许前端临时用正则重复解析整段正文。

当前 explicit-reference builder 输出 `source_entity_id + evidence_locator(text:start-end) + evidence_text`。Reader 只在 locator 所属 entity、offset 边界和当前渲染文本三者全部校验一致时渲染 inline button；任何 stale、overlap 或不一致 evidence 都保持普通文本。前端不以显示文字重新识别关系。

## 18.3 Side Peek

Side Peek 请求一个精简 `ProvisionPreview`：

- target title；
- label；
- excerpt / full short provision；
- source law；
- open full target action。

Side Peek 不改变主页面 URL；只有用户选择 “Open full” 才导航。

当前实现的 `/api/relationship-previews/:entityId` 先读取 `legal_entities` 元数据，再从现有 `document_views.reader_payload_json` 按 stable entity/root provision ID 提取并截断首段官方正文。它不创建第二份法律文本表；浏览器只有用户点击已解析 inline reference 后才请求该 preview。

## 18.4 Paragraph anchors

Paragraph / point 必须有稳定 DOM anchor，由 provision stable ID 映射，而不是按纯文本内容 hash 动态生成。

---

# 19. Global Command Palette

直接参考 LegalViz 的成熟交互：

- Cmd/Ctrl+K；
- modal/overlay；
- live search；
- keyboard navigation；
- Best Match；
- tabs/modes：Find Laws / Opened Laws / Definitions / Full-text；
- Enter open；
- Esc close。

Search UI 只负责交互，不实现 ranking。

`Opened Laws` 是唯一的 browser-local mode，不属于 Search Service 或 runtime SQLite。它使用 versioned `localStorage` envelope，单条仅保存 `documentId`、最后 Reader/Explorer `path` 与 `openedAt`，最多保留 10 条，并按 `documentId` 去重；不保存法规正文、搜索索引或用户账号数据。打开时由当前 `/api/documents` catalog hydrate，已不在本地语料中的 ID 不显示。清除动作只删除该 localStorage key，不影响 Canonical、SQLite artifact 或服务端数据。

首页大搜索框与全站 Cmd+K 使用同一 Search Service 和同一结果组件。

---

# 20. DORA Regulatory Family

DORA 的 Level 2 是 Phase 1 核心差异化能力。

## 20.1 Family data

DORA family 包含：

- primary act；
- recitals；
- RTS；
- ITS；
- future guidelines/Q&A slot。

## 20.2 RTS/ITS mapping

Phase 1 允许 official curated mapping：

- Article mandate / legal basis → RTS/ITS；
- RTS/ITS → mandate / source Article；
- mapping 必须记录官方依据与 source URL。

人工核验的 mapping 以版本控制的 YAML/JSON source record 保存，再由 `OfficialMappingBuilder` 导入统一 Relationship Store。UI 不直接读取 mapping 文件，也不维护 DORA 专用关系真相。

## 20.3 UI consumption

同一关系可用于：

- DORA landing RTS library；
- Article relationship panel；
- Explorer badge；
- search result context；
- Phase 4 MCP `get_related_acts`。

---

# 21. Phase 2 技术扩展

Phase 1 必须确保以下功能可以通过新增 adapter/builder/service 实现，不更换核心架构。

## 21.1 CELLAR SPARQL

新增：

```text
CellarClient
CellarRelationshipBuilder
```

流程：

```text
Seed Documents / CELEX
  → SPARQL query
  → normalize official predicates
  → Relationship Contract
  → local Relationship Store
```

不让 Reader 直接向 CELLAR 查询。

当前边界：SPARQL 只在显式 fetch 命令中运行，不在 `runtime:build`、server startup 或 Web request 中运行。fetch 产生 ignored raw snapshot 和 normalized candidate；reviewed dataset、builder method/version 与内容共同参与 runtime build ID。闭集关系仍只在两端 loaded `legal_entities` 时发布 12 条 legal-basis/completion edge；开放 lifecycle 邻域则通过独立 Work contract 发布，不把 RDF/XML 作为 UI 输入。

生命周期 discovery 使用单独命令和 ignored snapshot 查询 seed 的 external amendment/corrigendum 邻居。runtime 只消费人工复核后的 `data/official-metadata/cellar-lifecycle-relations.json`，并写入 `legal_works` / `lifecycle_relationships`；这条路径不修改 Canonical Document，也不放松 `relationships → legal_entities` 边界。

## 21.2 Amendment / Version

Canonical Document 已有：

- publication/effective/application dates；
- source snapshot；
- external IDs。

Phase 2 增加 document-level version relationships 即可。

## 21.3 CJEU

参考 LegalViz：

- SPARQL discover cases；
- fetch judgment source；
- parse operative part / article citations；
- normalize Case entity；
- build `CITES / CITED_BY_CASE` edges。

仍进入同一 Relationship Repository。

当前 `cellar-case-law@1.0.0` 只允许官方 CDM `case-law_interpretes_resource_legal`，target 必须属于 loaded EU CELEX seeds，case CELEX 必须是 `6YYYYXXNNNN` 形态（包括 CELLAR 返回的 joined-case suffix）。2026-08-24 discovery snapshot 得到 74 条 GDPR Work-level interpretation candidates；独立 metadata snapshot 通过 CELEX `owl:sameAs` 找到 Work，只读 English expression title、ECLI 和 `work_date_document`，得到 72 条完整记录，两个 joined-case 记录保持 `unavailable`。reviewed dataset 进入独立 `case_entities` / `case_law_relationships`，严格从官方英文 title 提取 case name、Case/Joined Cases number 与 `judgment | order` 类型；当前为 71 judgment、1 order。关系固定为 `Case → INTERPRETS → Act`、provenance `OFFICIAL_METADATA`、resolution `metadata-only`，在 GDPR Document Graph 与 Global Network 的可选 case layer 投影。它不读取 judgment text、不宣称具体 Article 被引用、不进入 Article Graph，也不修改 Canonical Document 或主 `legal_entities` contract。

## 21.4 Relationship Graph Delivery

首个 Graph 切片保持为 Web delivery concern：

```text
Relationship Repository
  → existing provision relationship response
  → UI-owned focused Graph DTO
  → lazy-loaded React Flow route
```

Graph DTO 只包含 stable endpoint metadata、方向、relation type、provenance 和 evidence；不包含 React Flow position/node type 等 vendor state。Web 层负责确定性布局、筛选和 React Flow 类型转换，因此未来更换图形组件不改变 Repository、relationship contract 或内部 endpoint。Graph route 继续只读 SQLite runtime artifact，不读取 Canonical JSON、raw source 或 curated mapping 文件。

当前 delivery 提供三种 projection：Article Graph 使用既有 provision relationship response 保持精确 root-provision scope；Document Graph 查询 source/target document 命中的 resolved 跨文档边，在投影阶段聚合为 Document nodes，并合并当前 Document 的独立 lifecycle 与 case-law response；Global Network 以所有 loaded Document nodes 为默认层，并汇集同一 runtime 中的跨法规、lifecycle 与 case-law edges。Global Network 默认折叠 external Work 与 Case，用户可分别展开它们；这只是 UI projection，不新增 relationship type、SQLite table 或 Canonical contract。loaded endpoint 继续使用 Document node；external Work node 只有 stable ID、CELEX label 和官方 CELLAR URL；Case node 只显示官方 case number/name、ECLI、date、decision type 与 CELLAR URL。两类 metadata-only node 都不请求正文 preview，也没有 Reader/Explorer route。三种 projection 共享 Graph node/edge schema、React Flow 页面、筛选、拖拽状态和 provenance 图例，但 route 与 scope 显式区分，避免把 Work-level metadata 伪装成 Article 关系。

## 21.5 Phase 4 External Adapters（预留）

Public API 和 MCP 都是 Service Adapter，不拥有业务逻辑。Phase 2 只需继续形成清晰的内部 service outputs；外部版本兼容、认证、限流和 transport implementation 延后到 Phase 4。

优先工具：

- search_law；
- resolve_law；
- get_law_structure；
- get_provision；
- get_related_acts；
- get_definitions；
- get_case_law；
- get_family_documents。

Phase 4 MCP 返回结构化官方数据与 provenance，不在 MCP 内再次生成“AI 法律解释”。

---

# 22. Phase 3 技术预留

Phase 3 能力包括：

- topic taxonomy；
- provision-level Regulatory Domain；
- Authority entity 与 EU → national legal relations；
- applicability；
- implementation timeline；
- decisions；
- multi-hop regulatory paths；
- richer relationship persistence / specialized graph querying。
- Agent/RAG citation-ready context assembly。

当前第一个 Banking Governance 0→1 slice 已实现 provision-level Domain、Authority/`ISSUED_BY` normalized persistence、Profile-safe builder、内部 regulatory-context service，以及 `Circular CSSF 12/552 Introduction block 7 → IMPLEMENTS → EBA/GL/2021/05` 的首条 reviewed national implementation path。`data/official-mappings/national-implementations.json` 与独立 fail-closed builder 保持 Canonical 正文不变；Runtime 5.2.0 只在两个 endpoint 都进入 Edition 时发布该边。当前 `IMPLEMENTS` contract 从 evidence-bearing 国家实施 Body Block 指向被落实的 EU/Authority instrument，使用 `OFFICIAL_MAPPING` 和 source endpoint 的 exact legal-text evidence；它不代替 Directive-specific `TRANSPOSES`。持续要求：

- stable node IDs；
- relation type 可扩展；
- provenance；
- repository abstraction；
- dates / authority / jurisdiction 字段；
- Edition/Profile identity；
- Web 与内部 service/API 不依赖 SQLite schema 细节；Phase 4 adapter 复用同一边界。

当前负载继续使用 read-only SQLite；只有真实 multi-hop 查询证明现有 service/repository 边界不足时，才评估专用 graph persistence，Web 与未来 adapter 不直接依赖该选择。

Cross-Regulation Path 0→1 不新增 graph store 或 Runtime table。`RegulatoryPathService` 依赖 `SqliteRuntimeRepository` 的 Domain/assignment/context 与 graph-neutral cross-document relationship outputs，按当前 Profile 选择两端均已加载且 provenance 为 `OFFICIAL_MAPPING` 的 `MANDATES`、`SUPPLEMENTS`、`IMPLEMENTS` edges，并以独立 Zod DTO 返回 Domain hierarchy、Document context、原始方向与 exact evidence。通用 `/api/regulatory-paths/:domainSlug` 与 `/domains/:domainSlug` 只消费该 service output；Web 不查询 SQLite，不读取 mapping source，也不在客户端临时创造多跳边。首个 Banking Governance path 保留 `EDITORIAL` classification 与 `applicabilityConclusion: false`，因此不会把 corpus Profile 表达成机构适用性判断。后续 Domain 复用同一 contract；只有真实查询负载证明 SQLite service 边界不足时才评估 focused graph persistence。

Implementation Timeline 0→1 使用独立 reviewed temporal dataset 与 `implementation-timeline@1.0.0` builder。builder 从当前 Edition/Profile 的 `DocumentView` exact-resolve source entity，要求 explicit application date 能从绑定的 Article 113 evidence text 解析并匹配；publication event 必须与 source registry/Document `asOf` 一致。entry-into-force 的 twentieth-day rule 以结构化 derivation 保存，build 时用 UTC calendar arithmetic 重算，不把 derived date 标为正文直接陈述。Runtime `5.1.0` 新增 `implementation_timeline_events`，通过 `document_id`、`source_entity_id` foreign key 与 loaded Document/legal entity 绑定，并保存 date basis、provenance、exact evidence、locator、review 与 builder identity。Repository、`/api/timelines/:slug` 和通用 Web page 只读取该表；Profile excluded Document 不会产生 timeline event，Canonical 与 UI 不保存 temporal fact 副本。

Supervisory Decision 0→1 使用 `supervisory-decision@1.0.0` 与独立 reviewed dataset。Decision stable ID 由 Authority ID 与官方 decision number 确定，不使用被监管主体名称；Authority 复用规范化 `authorities` 表，Decision metadata 和 Article finding 分别进入 Runtime `5.2.0` 的 `supervisory_decisions` / `supervisory_decision_findings`。`FINDS_VIOLATION_OF` 方向固定为 `Decision → loaded Article`，只接受 `DECISION_TEXT` provenance、exact operative text、PDF page locator 和 official PDF URL。builder 要求 target 是当前 Edition 的 root Article、evidence citation 出现在 reviewed operative text、Authority jurisdiction/type 匹配，并将 dataset/builder 纳入 Runtime identity。Repository 组装 schema-validated Document/Provision DTO；`/api/supervisory-decisions/:slug`、Reader context 与 `/decisions/:slug` 页面不读取 curated JSON。Profile 排除 target Document 时，对应 Decision、findings 与 decision-only Authority 全部不 materialize。整份官方决定仍是外部 source document，而不是伪造的 Canonical legal Document。

Agent/RAG 0→1 使用独立 `CitationContextService` 组合现有 read-only repository outputs，不读取 Canonical JSON 或 curated mappings。Runtime 5.2.0 的 `DocumentView` 保留 document `sourceSnapshotId` 及 Provision/Body Block `sourceLocator`；service 在启动时只为当前 Profile 的 Reader payload 建 stable entity index。exact Provision/Body Block lookup 返回原文 segment 序列、source/version/build identity、root-Provision relationships 与 regulatory context，并由独立 Zod DTO 固定输出。`CitationRetrievalService` 在相同 build/Profile identity 下组合现有 `SearchService` 与 `CitationContextService`：先执行 SQLite FTS5，再将 search entity exact-resolve 为 citation bundle；若 body record 没有独立 context，只能回退到该 record 已声明的 root Provision。输出同时保留原始 `searchRank` 和过滤不可解析项后的最终 `rank`。`/api/internal/citation-context/:entityId` 与 `/api/internal/citation-retrieval` 只是 controlled internal transports；Phase 4 adapter 不得复制 assembly logic。三条 reviewed CRD/CSSF/EBA Top-1 cases 构成 0→1 regression gate。

---

# 23. Production Deployment

## 23.1 开发环境

典型：

```text
Vite dev server          :5173
Express API              :3000
SQLite artifact          .local-data/regulatory.sqlite
```

## 23.2 Production

```text
npm build
  → static web dist
  → server bundle
  → regulatory.sqlite

single Node process
  ├─ /api/*
  └─ static frontend
```

一个容器或一台普通 Linux VM 即可。当前 container delivery 使用 multi-stage Docker build：build stage 只生成 Vite `dist`，runtime stage 带入 Node source、`dist` 与此前已经 `runtime:verify` 的 `regulatory.sqlite`。Express 在 API routes 注册后托管 `dist`，并以 SPA fallback 返回 `index.html`；因此 `/api/*` 与 Reader/Explorer/Graph routes 都在同一个 Cloud Run service 中运行。Cloud Run 只负责运行不可变 image，不能在启动时抓取 raw source 或重建法律数据；artifact 更新须按 runbook 验证后发布为新的 image/revision，并保留前一 revision 用于回退。

## 23.3 Data build 与 Web deploy 分开

Data build 可以在开发机/构建机手动运行：

```text
raw source → canonical master corpus → profile compilation → relationships/search → SQLite artifact
```

生成经过 validation 的 artifact 后再部署。

发布流程必须使用 staging path 构建和验证，完成后以原子 rename/symlink switch 或等价机制切换 active artifact，并保留至少一个 previous artifact。schema/build ID 不兼容或 health check 失败时立即回退。

当前实现以 `REGULATORY_RUNTIME_DATABASE_PATH` 指向运行时只读 SQLite artifact；未设置时仍使用 repository 内的开发默认路径。`npm run runtime:verify -- --input <sqlite-path>` 必须在 promote 前通过，验证 SQLite integrity、FTS5、schema/build manifest 与 Reader/Search read model 一致性。具体 staging、promote、health check 与 rollback 步骤见 `docs/runtime-operation-runbook.md`。

当前 `data/corpus-build-manifest.json` schema `1.0.0` 将 EUR-Lex、CSSF、EBA 三个 source registry 的 18 个条目逐一绑定到 exact snapshot ID、content SHA-256 与 retention status。`npm run corpus:build -- --profile <profileId>` 要求 manifest 与 registries 完全集合一致，验证本地 snapshot、quality baseline 和 required reviewed inputs 后，通过独立子进程调用既有 EUR-Lex/CSSF/EBA Canonical builders，再从 staging Canonical root 调用同一 Profile/Relationship/Search Runtime builder，并以只读 Runtime service 验证 staging SQLite。Staging Canonical 集合必须与 manifest 完全一致且全部为 official，fixture fallback 不得通过发布门禁。输出目录由 manifest、Profile、reviewed-input hashes 和 parser versions 的 build-request hash 确定，保存 ignored Canonical artifacts、Runtime SQLite 与 machine-readable report；promotion 仍是独立操作。编排层不复制 parser、relationship 或 search 业务逻辑。

Snapshot retention 与 build orchestration 分开：当前 18 个条目均为 `local-only`，普通本地重建如实记录该状态；`--require-archived` 要求每项具有 reviewed `gs://`、`s3://` 或 HTTPS archive URI，否则 fail closed。上传、凭据、bucket versioning/retention policy 不进入应用代码；选定外部 object storage 后再把精确 locator 写回 manifest。

Phase 3 首个 CRD source 暴露了 legacy Cellar multi-item manifestation：同一 English FMX4 manifestation 将 `DOC` metadata、`ACT` 与两个 `ANNEX` 分成独立 item，且 item 顺序不保证主文优先。Acquisition 通过 `.doc.xml` metadata 与同 basename legal XML 识别主文，下载 manifestation 的 byte-exact XML items，并仅在 raw snapshot boundary 组装 deterministic ZIP；snapshot schema `1.1.0` 逐项保留 official URL、media type、ETag/Last-Modified、byte count 与 SHA-256，verification 同时核验 package 和每个上游 item。Canonical parser 仍只接收通用 Formex package，不增加 CRD 专用解析分支；CRD 的 165 Articles、107 Recitals、Annexes I–II 和零 warning 由既有 quality gate 发布。

同一代码库可以把不同 Profile 编译成 `banking.sqlite`、`digital-assets.sqlite` 等独立 artifact。每个生产 deployment 默认固定一个 artifact/Profile；Phase 4 如开放 `profileId`，只能在授权的 artifact/service 范围内选择，不能让客户端绕过 corpus policy。

Phase 1 不要求生产服务器自己下载 bulk dump。

---

# 24. Configuration

建议配置类别：

| 类别 | 示例 |
|---|---|
| data | `REGULATORY_DATA_DIR` |
| server | `PORT`, `HOST` |
| database | `REGULATORY_RUNTIME_DATABASE_PATH` |
| environment | `NODE_ENV` |
| source | EUR-Lex/CSSF/EBA endpoint base URL |
| build | TF-IDF top-N、fixtures、strict mode |
| edition | `REGULATORY_EDITION_PROFILE`（build/dev only）、profile config path |

配置必须集中读取和验证，不能在代码各处直接 `process.env.X`。

Zod 验证启动配置，错误时 fail fast。

---

# 25. Logging / Observability

Phase 1 不需要复杂 APM，但需要结构化日志。

推荐：

- server request log；
- build pipeline log；
- parser error summary；
- relationship unresolved summary；
- search build statistics；
- build manifest。

生产至少有：

- `/health`；
- build ID；
- DB schema version；
- canonical schema version。

出现数据问题时能够快速区分：

- source 问题；
- parser 问题；
- index 问题；
- runtime/API 问题。

---

# 26. 安全与数据完整性

这是公开法规读取产品，Phase 1 风险不高，但要守住基础边界。

## 26.1 Legal HTML

- 解析后 legal HTML 必须经过 allowlist / sanitization；
- 不直接信任源 HTML script/style；
- 只保留需要的 semantic markup；
- external link 使用安全属性。

## 26.2 文件路径

API 不接受任意 raw file path；document lookup 只能通过 stable ID。

## 26.3 SQLite

- 运行时以 read-only 模式打开 production artifact；
- 所有 SQL 值使用 parameter binding；
- 服务启动时校验 schema version、build ID、integrity check 与 FTS5 capability；
- artifact 更新只通过受控发布流程，不允许 HTTP API 写入 production DB。

## 26.4 Source Integrity

- 保存 source URL；
- 保存 source snapshot checksum；
- canonical transformation 可重建；
- derived relations 保存 provenance。

## 26.5 HTTP Boundary

- 配置基础 security headers；
- 限制 URL、query、body 和返回结果大小；
- 对 search/resolve endpoint 配置轻量 rate limit 与 timeout；
- external URL 只允许 `http/https`，前端新窗口链接使用 `noopener noreferrer`；
- 错误响应不暴露文件路径、SQL 或 source artifact 内部位置。

---

# 27. Testing Strategy

测试的重点不是追求 coverage 数字，而是保护法律文本、结构和引用不被重构破坏。

## 27.1 Parser Golden Fixtures

至少：

- DORA；
- GDPR；
- AI Act；
- MiCA；
- NIS2；
- Data Act；
- 2–3 个不同结构 CSSF 文档。

每个 fixture 记录：

- counts；
- representative structural tree；
- representative paragraphs；
- known references；
- definitions；
- source hash。
- source expression/version ID；
- parser warnings；
- expected unsupported constructs（如有）。

## 27.2 Relationship Tests

- explicit ref target；
- reverse cited-by；
- cross-law CELEX resolution；
- provenance；
- DORA RTS mapping；
- TF-IDF deterministic output。

## 27.3 Search Eval Set

维护人工 query set，例如：

```text
DORA
32022R2554
2022/2554
Article 28 DORA
ICT risk management
management body
controller
high-risk AI
CSSF 12/552
```

每个 query 定义 expected top result / expected minimum result。

搜索改动必须跑 eval，而不是凭感觉判断 ranking。

## 27.4 E2E

Playwright 保护核心用户流：

1. 首页 search → DORA；
2. DORA Explorer → Article 28 Reader；
3. Reader inline ref → Side Peek；
4. Reader → View in Explorer；
5. Cmd+K → definition；
6. full-text result → paragraph anchor；
7. Article → related RTS；
8. dark/light + responsive basic checks。

---

# 28. Data Quality Gates

完整 build 发布前必须通过：

1. canonical schema validation；
2. core law parse checks；
3. stable ID uniqueness；
4. dangling/ambiguous relation counts 不超过由 release 配置声明的门槛；
5. duplicate provision detection；
6. article count sanity；
7. FTS row/document count consistency；
8. version-controlled search query eval 全部满足 expected Top-1 / minimum result；
9. official mapping provenance completeness；
10. build manifest complete。

如果 core law 结构失败，应 fail build，而不是“尽量上线”。

---

# 29. Performance Baseline

Phase 1 目标以普通单机为基准，不依赖缓存集群。benchmark 必须记录 CPU、内存、Node/SQLite 版本、corpus/build ID、cold/warm 状态和样本数。

建议预算：

| 场景 | 目标 |
|---|---|
| Home → initial UI | 使用生产构建记录 Core Web Vitals / payload，不以主观“感知快速”作为验收 |
| Find Laws | warm P95 <100ms server query |
| Full-text FTS | 固定常见查询集 warm P95 <250ms |
| Provision fetch | warm P95 <100ms API response |
| Side Peek | 感知即时，允许 client cache |
| Explorer structure | 不下载整部正文；结构 payload 可控 |
| Current-law Quick Go | client-side instant |

性能优化优先顺序：

1. 减小 payload；
2. build-time precompute；
3. SQLite indexes；
4. client caching；
5. 再考虑更复杂基础设施。

---

# 30. Git / CI / Development Workflow

## 30.1 Branch

保持简单：

- `main` 始终可构建；
- feature branch；
- 小 PR / 小 commit；
- milestone 完成后 tag。

## 30.2 CI

每个 PR 至少执行：

- typecheck；
- lint/format check；
- unit tests；
- parser fixture tests；
- search eval；
- web build；
- selected Playwright smoke tests。

CI 不下载完整 bulk dump；CI 使用 fixtures。

## 30.3 Local Full Data Validation

完整数据 build 是独立显式任务：

- 手动触发；
- 输出 build report；
- 输入是版本控制的 source/profile manifests 与 reviewed datasets；
- 正式 release 能通过 archived raw snapshot checksum 定位精确输入；
- 对每个 Document 记录 adapter/parser/quality-gate 结果；
- runtime verify 同时核验 `profileId` 和 corpus counts；
- 不因为普通 UI PR 每次重复跑完整数据。

当前 `npm run corpus:build -- --profile <profileId>` 已作为已有 snapshot verification、Canonical、relationship、search 和 Runtime builders 的薄 orchestrator 落地。加入 EBA/GL/2021/05 后，对 `full-corpus` 与 `banking-default` 的完整重建分别复现 18/16 文档 Runtime build ID。新增 source 仍须先按 `docs/corpus-onboarding-runbook.md` 完成 fetch、inspect、quality baseline 与 legal-semantic review，再更新 exact-snapshot manifest；编排命令不替代这些人工门禁。

---

# 31. Codex 协作开发原则

Codex 是开发工具，不是 production canonical pipeline 的运行依赖。模型名称、价格、额度和 reasoning effort 会变化，因此不写入长期架构 contract，也不按固定模型绑定 Milestone。

长期稳定规则：

1. 确定性脚本优先处理下载、解析、校验、索引、TF-IDF、统计和批量任务；
2. 模型只读取完成当前任务所需的文档、代码、fixture、统计与代表性失败样本；
3. Canonical build 在没有模型 API 的情况下必须完整运行；
4. 修改 stable ID、Canonical Contract、relationship semantics 或 legal-text fidelity 时，必须进行更高强度 review 和回归测试；
5. 并行任务按模块边界划分，不让多个任务同时修改同一核心 contract；
6. AGENTS.md 只保存稳定约束、测试命令、允许的操作和目录职责，不复制整份需求或技术文档；
7. 具体模型和 reasoning effort 由当时可用能力、成本和代表性 eval 决定，从满足质量门槛的最低成本配置开始；
8. 模型生成的任何 enrichment 必须是可关闭的独立 builder，并带 method/model/prompt version provenance，不得混入 official text。

大型数据任务采用：

```text
deterministic batch script
  → statistics / error signatures / representative samples
  → targeted model analysis when needed
  → code change
  → fixtures / full validation
```

建议在根 `AGENTS.md` 只写：

- 阅读 requirements / technical docs 中与当前任务相关的章节；
- 依赖方向和 Canonical Data invariants；
- raw data 不进入 Git；
- parser/relationship/search 改动必须运行的测试；
- review/diagnose 请求只读，明确要求实现时才修改；
- destructive、external 或 scope-expanding action 需要确认。

模型选择和 reasoning effort 不进入 ADR；如确需记录阶段性成本策略，放在可随时更新的 runbook，而不是本技术基线。

# 32. 代码简单性规则

这些规则比选择某个框架更重要：

1. 一个部署应用优先；
2. 一种主语言优先；
3. 一份 Canonical Contract；
4. 一个 runtime SQLite artifact；
5. Search、Relationships、Reader 通过 Service 连接；
6. 不为未来预建微服务；
7. 不为 FTS 上 ES；
8. 不为普通 CRUD 上 ORM；
9. 不为简单状态上 Redux；
10. 不为关系可视化提前绑定某一种图数据库；
11. 先理解和验证 LegalViz 已证明的外部行为，再选择保留来源适配或独立实现；
12. build-time 能解决的问题不留给 runtime；
13. script 能解决的问题不交给 LLM；
14. 模型和 reasoning effort 只有在代表性 eval 显示质量收益时才升级。

---

# 33. Architecture Decision Records（初始清单）

建议在 `docs/adr/` 保存短 ADR。初始状态：

| ADR | 决策 | 状态 |
|---|---|---|
| ADR-001 | TypeScript/Node 作为主栈 | Accepted |
| ADR-002 | React/Vite SPA，不使用 Next.js | Accepted |
| ADR-003 | Express 单后端 | Accepted |
| ADR-004 | Canonical JSON 是内部消费契约，官方 source artifact 是来源；SQLite 是 runtime/derived store | Accepted |
| ADR-005 | better-sqlite3 + FTS5 | Accepted |
| ADR-006 | Phase 1 不使用 ORM | Accepted |
| ADR-007 | Search = deterministic resolver + FTS5 | Accepted |
| ADR-008 | TF-IDF 仅在 benchmark 通过后以 build-time enrichment 发布 | Accepted |
| ADR-009 | Unified Relationship Contract + provenance | Accepted |
| ADR-010 | EUR-Lex / CSSF 通过 Source Adapter | Accepted |
| ADR-011 | Universal Explorer / Reader 共用数据 | Accepted |
| ADR-012 | 先验证 LegalViz proven behavior，再选择保留来源适配或独立实现 | Accepted |
| ADR-013 | Public API / MCP = Service Adapter（Phase 4） | Accepted |
| ADR-014 | Relationship persistence 与未来专用图技术解耦 | Accepted |
| ADR-015 | Canonical build 不依赖 LLM | Accepted |
| ADR-016 | Codex 不进入 canonical runtime/build dependency | Accepted |
| ADR-017 | One canonical corpus, multiple build-time Edition/Profile artifacts | Accepted |
| ADR-018 | Corpus expansion uses deterministic orchestration plus explicit review gates; Public API/MCP remains Phase 4 | Accepted |

---

# 34. LegalViz 参考与复用清单

LegalViz 是 Phase 1 的第一 reference implementation。

当前公开项目说明其技术栈为 React 19、React Router 7、Vite、Tailwind 4、Framer Motion、Lucide React、Express；同一 Formex parser 服务 Web / REST / CLI；客户端有 inverted index 与 TF-IDF；CJEU 通过 SPARQL 发现并解析 article reference。

主要参考：

- https://github.com/maastrichtlawtech/legalviz.eu
- `backend/shared/formex-parser/fmxParser.mjs`
- `backend/search/search-ranking.js`
- `backend/search/build-sqlite-data.js`
- `backend/search/fulltext-index-build.js`
- `backend/search/definition-index-build.js`
- `backend/search/citation-graph-build.js`
- `backend/search/case-law-*.js`
- `src/components/law-viewer/LawViewerToc.jsx`
- `src/utils/law-viewer/tocFormat.js`
- `backend/mcp/`

## 34.1 优先评估适配或独立实现

- Formex parsing；
- reference resolution；
- search alias/ranking patterns；
- SQLite FTS build patterns；
- definition index；
- TOC behavior；
- Cmd+K interaction；
- URL state；
- TF-IDF idea/implementation；
- citation reverse-index pattern。

## 34.2 在其基础上增强

- structural_path；
- Universal one-page Explorer；
- RegulatoryFamily；
- DORA RTS/ITS；
- CSSF；
- relationship provenance；
- broader search corpus；
- Phase 4 Public API/MCP family tools。

---

# 35. 其他 benchmark 在技术上的用途

## artificialintelligenceact.eu

主要用于：

- One-page Act Explorer visual hierarchy；
- Article context metadata；
- paragraph deep-link；
- implementation documents/timeline 的未来数据模型。

## ai-act-law.eu / gdpr-info.eu

主要用于：

- 极简 reader typography；
- Article ↔ Recital presentation；
- Annex/Recital independent browsing。

## EBA / ESMA Single Rulebook

主要用于：

- Level 1 ↔ RTS / ITS / Guidelines / Q&A relationship semantics；
- regulatory family information architecture。

## regulation-dora.eu

主要用于：

- DORA family landing；
- pillar/topic 后续扩展；
- implementation artefact thinking。

## GDPRhub

主要用于 Phase 3：

- Article ↔ decisions；
- authority/jurisdiction metadata。

---

# 36. First Implementation Sequence（工程版）

按以下顺序降低返工，同时保证尽早得到可运行的纵向链路。DORA 只是第一个工程 fixture，不缩减最终多法规范围。

## Step 1 — Minimal Repo / Contracts

- repo scaffold；
- TypeScript；
- 最小 core domain；
- stable ID；
- canonical schema；
- Zod validation；
- AGENTS.md；
- 只记录已经作出的关键 ADR。

## Step 2 — DORA Vertical Slice

- 获取单个 CELEX source；
- parser / adapter → canonical；
- SQLite artifact；
- Document/Provision repository；
- 最小 Reader / TOC route；
- source version / build manifest；
- golden fixture。

这一阶段的目标是尽早验证完整依赖方向，不形成 DORA 专用页面或专用 Canonical Model。

## Step 3 — Six-law Parser Generalization

- DORA；
- GDPR；
- AI Act；
- MiCA；
- NIS2；
- Data Act；
- adapter → canonical；
- golden fixtures。

## Step 4 — Reader / Explorer Foundation

- nav；
- routes；
- Explorer；
- Reader；
- TOC。
- paragraph deep link；
- refresh/change detection；
- artifact validation / rollback。

## Step 5 — Search

- metadata aliases；
- FTS5；
- definitions；
- Command Palette；
- eval set。

## Step 6 — Clickable law

- reference resolver；
- relationship table；
- Side Peek；
- Cited By。

## Step 7 — Official Relationships / RTS

- DORA / MiCA mappings；
- relationship panel/badges。

## Step 8 — TF-IDF Experiment

- benchmark fixture；
- build-time TF-IDF；
- quality gate；
- benchmark 通过时启用 UI。

## Step 9 — CSSF

- representative documents；
- HTML adapter；
- PDF fallback as needed；
- search/Explorer/Reader integration。

## Step 10 — Full-data Build / Polish

- full English dump validation；
- performance；
- accessibility；
- deploy artifact / atomic publish / rollback runbook。

---

# 37. Definition of Done — Releases

每个 Release 必须有独立 DoD、build ID、source snapshot 和已知限制。下面是 Phase 1 最终累计完成条件，不阻塞前序 Release 独立部署：

### Data

- DORA / GDPR / AI Act / MiCA / NIS2 / Data Act 可由同一 pipeline 解析；
- canonical schema versioned；
- source hashes 可追溯；
- CSSF representative docs 可进入同一 model。

### Architecture

- Web 不依赖 parser/raw data；
- Service 不依赖 React；
- MCP future adapter 不需要改 Service；
- storage 可由 Repository 替换；
- Explorer/Reader 使用同一 stable IDs。

### Search

- SQLite FTS5 可完整重建；
- known aliases Top-1 正确；
- search eval 通过；
- paragraph deep-link 正确。

### Relationships

- explicit reference；
- cited-by；
- DORA/MiCA RTS/ITS；
- TF-IDF benchmark；达到门槛时发布 related-recital artifact；
- provenance 完整。

### UX

- universal Explorer；
- adaptive TOC；
- Reader；
- Side Peek；
- Cmd+K；
- responsive；
- keyboard flow。

### Engineering

- CI 通过；
- parser fixtures；
- E2E smoke；
- build manifest；
- no full raw data in Git；
- AGENTS.md / ADR / runbook complete。

---

# 38. 参考资料

## 产品 / 开源实现

- LegalViz: https://legalviz.eu/
- LegalViz source: https://github.com/maastrichtlawtech/legalviz.eu
- AI Act Explorer: https://artificialintelligenceact.eu/ai-act-explorer/
- AI Act Law: https://ai-act-law.eu/
- GDPR Info: https://gdpr-info.eu/
- Regulation DORA: https://www.regulation-dora.eu/
- EBA Interactive Single Rulebook: https://www.eba.europa.eu/regulation-and-policy/single-rulebook/interactive-single-rulebook
- ESMA Interactive Single Rulebook: https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook
- GDPRhub: https://gdprhub.eu/

## Official data

- EUR-Lex: https://eur-lex.europa.eu/
- CELLAR: https://op.europa.eu/en/web/cellar
- CSSF: https://www.cssf.lu/

## OpenAI / Codex

- Models: https://developers.openai.com/api/docs/models
- Current OpenAI model guidance: https://developers.openai.com/api/docs/guides/latest-model
- Codex AGENTS.md guide: https://developers.openai.com/codex/guides/agents-md
- Codex source: https://github.com/openai/codex

---

# 39. 最终技术原则

整个工程长期遵守以下 18 条：

1. **Official data first**；
2. **Canonical contract first**；
3. **Stable IDs before URLs**；
4. **One canonical dataset, multiple views**；
5. **Relationships are first-class and provenance-aware**；
6. **Build-time before runtime when possible**；
7. **Deterministic code before statistical method**；
8. **TF-IDF before heavier semantic machinery when it solves the problem**；
9. **SQLite/FTS5 before distributed search**；
10. **One deployable application before microservices**；
11. **Repository/Service boundaries before database specialization**；
12. **Reuse proven LegalViz patterns before rebuilding**；
13. **Universal Explorer / Reader, never per-law duplicated pages**；
14. **Script before LLM for data processing**；
15. **Model choice follows current capability and representative evals**；
16. **Future-capable contracts, present-simple implementation**；
17. **One canonical corpus, multiple build-time editions**；
18. **Review decisions live in versioned data, not human or model memory**。

最终目标不是拥有最多的技术，而是让以下链路稳定成立：

```text
Official Sources
    ↓
Canonical Legal Data
    ↓
Edition / Profile Compilation
    ↓
Explainable Relationships + Search
    ↓
Reusable Services
    ↓
Explorer / Reader / Search / Phase 4 Public API / MCP
```

只要这条链路保持清晰，后续加入 CJEU、CELLAR、更多 CSSF/EBA/ESMA 文件、MCP、监管路径和更高级可视化，都属于“增加能力”，而不是“重做系统”。
