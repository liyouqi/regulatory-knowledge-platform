# 德国国家法首批审阅与验收

范围仅为 GwG、WpIG 两份德文合并 XML。KWG、KAGB、法国 HTML 和卢森堡核心法 PDF 不在发布范围。

## 合同及解析审阅

按 AGENTS.md 的 Sol High 审阅要求，先审边界、再审实现。最终实现审阅结论为 Approve，实际发布仍以独立原文对照和端到端验收为条件。

- 保留既有 Canonical 1.2；德国分支使用 Canonical 1.3 和 GII source system。Work、norm ID 绑定官方 doknr，不给段落、表格单元或文本 run 制造公共稳定 ID。
- Reader 只从 orderedContent 读取文本。规范化布局以本地 contentIndex 引用文本，验证每个索引恰好出现一次并保持源顺序。
- 正文、来源注释和目录分角色保存；默认义务检索、Citation 和自动引用关系排除后两类。来源注释在 Reader 和导出中单独保留。
- 未知 XML 元素、上下文、语义属性、重复容器及不支持的归档资源严格拒绝。源 norm ID 集合、结构元数据和逐角色文本哈希形成质量基线。
- 来源标为政府发布的非权威合并文本。Stand 的最后修订法日期不等同于生效日期；制定日、BGBl 公布日、下载时间分别记录。
- Public API 1.4、RAG Snapshot 1.2 明确语言和角色；旧 RAG 1.1 验证继续限定其原有 EU/LU、英文合同。德国 inline 文本按源顺序精确拼接。

审阅中发现并修复了 XML 上下文可丢失文本、旧 RAG 合同过宽、RAG 非正文隔离和德文 inline 拼接问题。最终审阅者验证 XML fixtures 4/4、RAG tests 11/11 通过，无剩余实质阻塞。

## 原文与旧库回归证据

- 对固定的两份官方源快照，用独立 Python ElementTree 遍历正文、来源注释和目录：GwG 231、WpIG 300 个角色哈希，共 531 项，差异为零。
- 构建前将原有 116 份 Reader DTO 与当前 Canonical 投影逐份比较，差异为零；构建后的 118 份运行库再次与旧 116 份 Reader payload 比较，差异为零。
- 新运行库中 173 个正文 norm 的 Citation 投影与 Canonical 正文哈希一致，4 个目录或来源说明 norm 不能作为默认 Citation；德文全文检索和 `GwG § 1`、`WpIG § 1` 定位通过。
- 严格 Runtime 构建成功：118 份文档、63,905 条检索记录、118 份 Expression metadata、reviewed-input issues 为零。银行 Profile 保持 99 份。

本机详细对照和构建日志位于忽略的 `data/artifacts/national-onboarding/`，原始快照位于忽略的 `data/raw/national/`。这些文件不是版本控制的交付附件；可复现入口是注册表、固定清单和构建命令。

## 最终检查

- `npm run check`、`npm run build` 通过；生产构建保留既有的大 chunk 提示。
- `npm test` 完整运行 109 个文件、466 项：107 个文件/464 项通过；2 项失败分别是遗漏 DE 版本链计数和 OpenAPI 漏列新字段。修复后两文件定向补跑 26/26 通过（OpenAPI 新增一项字段覆盖测试）。这是完整运行加修复后定向重测，未声称最后又完整重跑一次。
- XML fixtures 4/4、结构化内容与德国端到端测试 8/8、RAG tests 11/11 均在完整运行中通过；旧 Formex fixtures、法条搜索 fixtures、CRD 独立原文对照等同轮通过。
- Playwright 本机 Chrome 10/10 通过：德国两法 Reader/来源声明、国家目录及移动端、既有基金和银行治理页面。测试用忽略目录中的临时配置启动无 watch 的 API 和 Vite；缺失的 Playwright Chromium 未作为产品故障，也未下载新浏览器。
- 搜索基准 8 组查询均命中各自预期法规，引用基准 3/3、关系基准 2/2 通过；实际德国检索与逐条 Citation 另有上述验收。
- `corpus:build --profile full-corpus` 固定清单严格构建成功：118 sources / 118 Runtime documents，构建 ID `runtime-5.10.0-044662c5accc1b7c`。118 份源均为本机 local-only，尚无归档副本，不代表已部署或满足 require-archived 门槛。
- 严格固定清单与本机原有 Canonical 快照选择不同，33 份文档的 `lastChecked` 或快照/版本/构建溯源字段不同；全部正文、稳定 ID 和 Reader 结构相同。各构建分别保留来源标识。
- 严格完整版本的 RAG Snapshot 1.2 导出与 verify 成功：118 documents、62,230 provisions、20,123 relationships，语言包含德文和英文。快照仅写入忽略的本机验收目录，不是对其他项目的发布或导入声明。
- `corpus:build --profile banking-default` 固定清单严格构建成功：同一清单的 118 份源完成校验，Profile 内仍为 99 份文档、51,161 条检索记录；构建 ID `runtime-5.10.0-ce92d1aa15a3af7d`。德国两法未进入银行版。
