# 法国 AMF 总规则正文接入审阅

启动日期：2026-10-21，验收完成：2026-10-22。状态：本地接入与发布门槛验证完成。承接 [候选解析与来源审计](fr-lu-candidate-review-20261021.md)及[发布合同方案](amf-publishing-contract-plan-20261021.md)。本轮目标为本地 Canonical → Reader → Runtime → API/MCP → 检索/精确引用 → RAG 的完整接入；最终验收结果见下文。

## 来源与覆盖边界

新增一份法国法语规则书 `fr:amf:rg`，Reader slug `amf-rg`。保存 693 个分组、1,821 条文和 132 个发布者信息框：文档 1、分组 63、条文 68。国家页面按一份本国材料计数。基金、投资市场和监管规则领域标为部分正文覆盖；法国货币金融法典等核心法律仍在后续清单。本轮不创建法国转置或 `IMPLEMENTS` 关系，也不宣称法语跨语种语义检索已评估。

冻结源为 [AMF 官方入口](https://www.amf-france.org/fr/eli/fr/aai/amf/rg)的既有官方抓取，2,475,701 bytes，SHA-256 `77779fb29c2f9fffdcc5951f155f1393265a895b480a0f68f98329884c231fb4`；原始 probe 报告独立冻结。独立 HTMLParser 与候选 AST 对照了全部标题、URL、祖先、正文与信息框哈希、归属和位置。正式解析器还逐框对照锁定 baseline。

源版本标签为 [2026-09-11 版本](https://www.amf-france.org/fr/eli/fr/aai/amf/rg/20260911/notes)。本轮重试入口与版本链接均返回 HTTP 200 维护页，无条文；这些响应被拒绝，没有替换既有完整源，也不作为当前版本认证。

## 日期与来源地位

- `publicationDate=null`，原因为 `aggregate-with-multiple-component-publications`。Book I 的初始公报日期为 [2004-10-29](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000254713)，Books II–VI 为 [2004-11-24](https://www.legifrance.gouv.fr/jorf/jo/2004/11/24/0273)。这些分卷证据不能转换成整份集合的一个公布日。
- `textAsOf=2026-09-11` 是发布者版本日期；`textAsOfBasis=publisher-version-date`、`textAuthorityStatus=publisher-consolidation`、`currencyStatus=not_assessed`。生效、适用、废止状态均未推断。
- 归档目录只支持 `capturedOn=2026-10-20`，依据为 `archived-probe-directory`；精确 `retrievedAt=null`，依据为 `date-only-official-probe`。`importedAt=2026-10-21T18:21:48.225Z` 是实际导入时间。Reader 的 `lastChecked` 是独立来源审阅时间。

## 合同与渲染

新增 Canonical 1.5、AMF HTML parser 1.0.1、Runtime 5.12、Public API 1.5、RAG Snapshot 1.3。EU/LU Canonical 1.2、DE 1.3/1.4 的字段验证分支继续冻结；RAG 1.1/1.2 继续独立验证。1.0.0 的本轮未发布草稿产物保留，1.0.1 不覆写旧文件。

条文及分组 ID 来自完整官方 URL 的 SHA-256，只表示源地址身份，不声称跨版本连续性。`212-19` 与 NBSP `212-19 bis` 保留不同 ID、路由及完整 URL，即使正文和部分路径编号相同也不合并。所有分组和条文共用连续的源遍历顺序，祖先链、XPath 和 owner 均校验。

64 个文档/分组信息框单独保存 owner、官方 URL、原位置、locator、规范化块和内容哈希。Reader 在所属文档/祖先上下文显示；不生成可引用法律实体、不进入正文检索或关系端点。68 个条文信息框在原位置以 source-note 角色保存。源文不改写，法文 inline run 按原序直接拼接；链接、上标、斜体和有序/无序列表通过规范化 layout 渲染，UI 不解析原始标签。

FR API 文档必须显式返回空公布日及依据，其他法域保留可选非空日期；Zod/OpenAPI/MCP 使用同一版本边界。RAG 导出准确区分版本日、公布日和抓取/导入时间，并核对全部信息框哈希、归属和顺序。

## 审阅与验收

Sol High 实施前合同审阅及实施后复审通过。复审要求修复的三项为：法文 RAG inline 拼接不一致、scoped note 缺少内容哈希验证、FR API 公布日约束单向；三项均已修正并补定向负样例。另补齐 strict build 的 AMF 来源接线和 builder 版本哈希，并经复审通过。没有放松 exact coverage、源校验、归档或 runtime 验证条件。

定向解析/旧版本/查法用例 33 项通过；消费者 API/RAG/Profile 专用用例 8 项通过。独立源审计确认全部 693/1,821/132 单位一致。

| 验收 | 结果与本地证据 |
| --- | --- |
| Strict full-corpus | 121 来源均重新构建、121 文档；`strict-full-final/build-report.json` |
| Strict banking-default | 121 来源校验、编译为99文档，无 DE/FR；`strict-banking-final/build-report.json`、`banking-isolation.json` |
| Runtime 完整性 | 121 文档、68,850 检索记录、19,512 关系；`runtime-verify-final.log` |
| 原有 Reader 回归 | 原120份完整 Reader JSON 哈希全部不变；`publication-verification.json` |
| 法文检索/精确引用 | 3条文引用原序正文一致、2条已删除条文身份独立、说明框不进入检索实体/精确引用；`publication-verification.json` |
| RAG 1.3 full | 121文档、64,715 provisions、20,123关系，独立 verify 通过；`rag-full-1.3/`、`rag-full-verify.log` |
| RAG 1.3 banking | 99文档、49,578 provisions、16,502关系，export内置完整 verify 通过；`rag-banking-1.3/` |
| RAG 旧版兼容 | 1.1专用fixture随完整回归通过；1.2既有120文档不可变快照验证通过；`full-test-verified.log`、`rag-legacy-1.2.log` |
| 检索 eval | 原有法律检索及定义检索基准通过；`search-benchmark.log` |
| Runtime 读取缓存 | 22项仓库用例通过，含深层修改隔离与底层FR公布日篡改拒绝；`cache-fixtures-final.log` |
| 浏览器 | AMF、国家目录、德国四法、基金导航、银行治理共13项通过；`browser-cache-final.log` |
| 完整回归 | 默认 `npm test`：117文件、546断言，零未处理错误、exit 0；`full-test-verified.log` |
| 静态检查与生产构建 | 最终检查见 `check-published-final.log`、`build-published-final.log` |

浏览器首轮在并行构建时启动超时；串行运行后暴露 AMF 页面重复验证大文档的加载开销。本轮已加 repository 内部缓存：每次仍读取并比较 serialized payload，相同才复用已验证结果，任何变化完整重验，验证失败抛错；首次与命中均克隆返回以隔离调用者修改。三个读取入口共用此方法，Sol 方案及实现复审通过。浏览器保留原有五秒断言，修复后13项全部通过。期间另修正测试中的 AMF slug 为实际 `amf-rg`，并补上新增版本状态元数据的计数。

默认本地 Runtime 使用既有 Canonical 目录，完整 strict Runtime 使用 manifest 固定源重建，二者 build ID 分别为 `runtime-5.12.0-a6a7244f54fca0b1` 与 `runtime-5.12.0-cd1be29c2d454740`。逐份深层对照的差异仅涉及33份旧文档的 `lastChecked`，其中3份还涉及Reader正文和结构相同的不同源包之 snapshot/version/build 标识；所有文档正文、结构和AMF数据一致，详见 `strict-reader-differences.json`。它们是两个独立产物，不能混称同一个构建。

首轮完整运行 `full-test-final.log` 为117个文件、545项断言：544通过，发布验证一项因76.2秒超过原60秒失败，另有两项 Vitest `onTaskUpdate` 未处理超时，因此不计为通过。发布验证原先在仓库读取、runtime verifier 和发布集合检查中重复完整解析 Reader，现改为同一批完整验证结果同时完成 exact ID 集合检查；缺失、多余、同数量错误ID与空集合仍拒绝。定向4项通过，发布验证降为44.3秒，原60秒限制保持。

第二轮 `full-test-clean.log` 的117个文件、546项断言全部通过，但仍有两项未处理RPC错误，exit 1，仍不计完整通过。仅在 `beforeAll` 末尾单次 `setImmediate` 不足以解决。

临时诊断runner保留原RPC Promise，记录请求文件、时刻、耗时及结果，所有异常继续抛出。三文件定位准确复现两处超时：search 69.674秒、repository 61.318秒；release无此错误。search 的稳定构建测试重复加载整库三次，现只准备一次相同的已验证DORA DTO，各次构建使用独立 `structuredClone`；两文件在 `afterEach` 使用真实计时器0延时让出I/O。断言、输入内容、fixture范围、超时及错误处理保持；窄修方案经过Sol High审阅。

修复后同三文件32项断言通过、exit 0、零未处理错误，最长RPC为51.946秒，证据为 `rpc-fixed-diagnostic.log` 与 `rpc-fixed-summary.json`。临时runner和config均为ignored诊断工具，不接入默认 gate。默认完整回归 `full-test-verified.log` 最终117个文件、546项断言全部通过，零未处理错误、exit 0。既有失败日志继续保留，未通过增加超时或忽略错误取得通过结果。

本地证据目录为 ignored 的 `data/artifacts/amf-publishing/`。原始源、Canonical/Runtime/RAG 生成文件未纳入版本管理；本轮未进行远程部署或提交。
