# Regulatory Knowledge Platform

一个用来查阅欧洲金融监管法规的项目。可以读原文、查条文和引用关系，也可以通过 REST、MCP 和离线 RAG 快照使用同一份数据。

[English](README.md) · [启动指南](docs/getting-started.md) · [文档目录](docs/README.md) · [法规列表](docs/corpus-status.md)

## 能做什么

- 按条文阅读，或者浏览整部法规。
- 检索法规名称、正文和定义，直接跳到对应位置。
- 查看明确引用和已审阅的 RTS/ITS 映射。元数据关系、相似度推荐会另外标明。
- 从 32 个国家的目录进入本国材料。
- 通过只读 REST API、4 个本地 MCP 工具或离线 RAG 快照调用数据。

阅读和检索不需要大模型。Copilot、Monitor 和 Earth 有各自的配置和数据要求。

## 目前收录了什么

截至 **2026 年 10 月 22 日**：

| 来源 | 文档数 | 原文语言 |
| --- | ---: | --- |
| EUR-Lex / CELLAR | 112 | 英语 |
| CSSF | 3 | 英语 |
| EBA 指南 | 1 | 英语 |
| 德国 GwG、WpIG、KWG、KAGB | 4 | 德语 |
| 法国 AMF 总规则 | 1 | 法语 |
| **合计** | **121** | **英 / 德 / 法** |

银行 Profile 在构建时选取其中 99 份。国家目录不代表该国法律已全部收录。已收集的卢森堡 12 部核心法和法国核心法典还在候选阶段。

[法规列表](docs/corpus-status.md)记录已发布的内容，[覆盖计划](docs/plans/coverage.md)记录后续工作。使用时仍需查看每份文件的来源和版本日期。

## 本地启动

使用 **Node.js 24** 和 **npm 11+**。法律原始下载和生成数据不放进 Git。

首次安装先下载 DORA：

```bash
npm ci
npm run source:fetch -- --celex 32022R2554
```

将命令输出的快照目录填到下面的占位值：

```bash
npm run canonical:build -- --snapshot "PASTE_SNAPSHOT_DIRECTORY_HERE"
npm run dev
```

这样会先加载一份法规。如果已有 Canonical 数据，直接运行 `npm ci` 和 `npm run dev` 即可。

打开 **http://localhost:5173**，API 使用 **http://localhost:3000**。如果 Vite 提示了其他端口，以终端输出为准。

数据准备和常见错误见[启动指南](docs/getting-started.md)。重建完整的 121 份法规还需要已核验的 AMF 快照，`npm run dev` 不会下载它。

| 页面 | 路径 |
| --- | --- |
| DORA 阅读器 | `/read/dora/articles/1` |
| 国家目录 | `/countries` |
| 监管主题 | `/topics` |
| 法国 AMF | `/read/amf-rg/articles/211-1` |
| 法规关系 | `/relationships` |

页面显示的是本机已加载的内容。`Cmd+K` / `Ctrl+K` 打开检索。

## 开发

先下载和解析源文件，再将 Canonical 数据编译成只读 SQLite 运行库。网页、API、MCP 和导出都使用这份运行库。发布者说明、编辑说明和法律正文分开保存。

```bash
npm run check
npm test
npm run build
```

测试包含运行库构建和集成检查，完整运行可能需要数分钟。

详见[开发指南](docs/development-guide.md)、[来源接入](docs/corpus-onboarding-runbook.md)、[REST API](docs/public-api-v1.md)、[MCP](docs/mcp-server.md)和 [RAG 导出](docs/rag-snapshot-export.md)。

## 项目状态与许可证

项目还在开发中，各国家和法规领域的覆盖程度不同，跨语言语义检索也尚未评估。主要用于阅读和研究，实际适用性仍需核对官方来源。

项目软件使用 [MIT 许可证](LICENSE)，法律来源材料和第三方组件保留各自的使用条件。参与开发见[贡献指南](CONTRIBUTING.md)，安全问题见 [SECURITY.md](SECURITY.md)，发布前的剩余事项见[开源准备](docs/plans/open-source.md)。
