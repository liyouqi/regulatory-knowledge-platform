# 德国国家法正文审阅记录：两批发布与后续候选

本记录保留 GwG/WpIG 首批审阅，并补充 KWG/KAGB 第二批；不代表德国或三国金融法覆盖完成。四份正文覆盖银行、基金、AML 与投资服务领域的部分材料，不是任何领域的完整法律覆盖声明。

## 德国原文 XML

政府发布者入口：[Gesetze im Internet](https://www.gesetze-im-internet.de/)。该站明确说明合并文本不是正式公布版本；正式公报地位不能从政府域名推断。下载链接来自各法目录的 XML 入口（`xml.zip`），未采用翻译或第三方镜像。

| 简称 | 官方 Work doknr | 官方标题 | 制定日期 | BGBl 公布日期 | 源 Stand 最后修订日期 | norm 数 | 结构组 | 状态 |
|---|---|---|---|---|---|---:|---:|---|
| KWG | BJNR008810961 | Gesetz über das Kreditwesen | 1961-07-10 | 1961-07-15 | 2026-05-12 | 278 | 32 | 已发布，active |
| GwG | BJNR182210017 | Gesetz über das Aufspüren von Gewinnen aus schweren Straftaten | 2017-06-23 | 2017-06-24 | 2026-06-29 | 84 | 7 | 已发布，active |
| KAGB | BJNR198110013 | Kapitalanlagegesetzbuch | 2013-07-04 | 2013-07-10 | 2026-04-09 | 492 | 74 | 已发布，active |
| WpIG | BJNR099010021 | Gesetz zur Beaufsichtigung von Wertpapierinstituten | 2021-05-12 | 2021-05-17 | 2026-04-09 | 130 | 30 | 已发布，active |

四份已发布源快照均来自 Gesetze im Internet，取得时间为 2026-10-21。首批 GwG/WpIG 快照分别为 `data/raw/national/de-gwg-2017/20261021T065833065Z-e6c3dda080da/` 与 `data/raw/national/de-wpig/20261021T065833613Z-5401a3133af8/`；第二批 KWG/KAGB 快照分别为 `data/raw/national/de-kwg/20261021T074102916Z-0128447811ca/` 与 `data/raw/national/de-kagb/20261021T074101863Z-34e8b51e7eb7/`。当前 national Canonical schema 1.4 使用 parser 1.1；历史 DE Canonical 1.3 与 EU/LU 1.2 仍可读取且未重写。四份正文均为德文 XML 合并文本。Gesetze im Internet 明确合并文本不是正式公布版本，因此不能将其称为正式公报正文。

### 首批：GwG 与 WpIG

首批发布审阅独立对照了 531 个按角色区分的文本哈希，差异为 0。GwG 与 WpIG 的制定日和 Bundesgesetzblatt（BGBl）公布日分别记录；公布日由原始公报核验：[GwG，BGBl I 2017 Nr. 39，2017-06-24](https://www.bgbl.de/xaver/bgbl/start.xav?start=//*%5B@attr_id=%27bgbl117s1822.pdf%27%5D)、[WpIG，BGBl I 2021 Nr. 23，2021-05-17](https://www.bgbl.de/xaver/bgbl/start.xav?start=//*%5B@attr_id=%27bgbl121s0990.pdf%27%5D)。

### 第二批：KWG 与 KAGB

第二批 parser 1.1 质量审阅新增 1,992 个按角色区分的文本哈希（KAGB 1,254，KWG 738），均与独立原文对照为 0 diff；四部法合计 2,523 个 role hashes。结构化表格另做逐格独立核对，共 1,521 个单元格，0 diff：KWG 2 张表、373 行、689 格，其中 57 个跨列单元格、42 个空单元格；KAGB 57 张表、416 行、832 格。

KAGB BGBl 公布日为 2013-07-10，见[BGBl I 2013 Nr. 35](https://www.bgbl.de/xaver/bgbl/start.xav?start=//*%5B@attr_id=%27bgbl113s1981.pdf%27%5D)。KWG 公布日 1961-07-15 依据原始 BGBl I 1961 Nr. 49 扫描件核验：[扫描件（第三方托管）](https://media.offenegesetze.de/bgbl1/1961/bgbl1_1961_49_watermarked.pdf)。扫描件的冻结 SHA-256、获取时间以及印刷页 877/881 的人工核对记录见[第二批 Sol 审阅记录](national-second-batch-review-20261021.md)；BGBl 官方域名直连核验尚未完成。该来源证据地位不改变正文仍来自 Gesetze im Internet 合并 XML 的事实。KWG header 的 Neuf 日期 1998-09-09 与源 Stand 最后修订日 2026-05-12 分开记录。

完整质量基线、源快照绑定及文本哈希由 registry、Corpus manifest 和构建报告管理。以上日期均是制定、公布、header 或源修订等来源字段，不据此声明条文生效状态或最新版本认证。

- `builddate` 是文件生成时间，不能作为法律生效/适用时间。制定日、BGBl 公布日和源 Stand 日期是不同事实；Stand 日期不能等同于全部条文在该日生效。Neuf、Sonst、Hinweis 等源备注另行保留。
- `norm@doknr` 在每份源中唯一，适合精确来源定位。不能用数组位置或可变显示标题替代官方单位 ID。单个源中唯一并不证明跨历史版本稳定性。
- `gliederungskennzahl` 不是全局唯一：KAGB 的 Kapitel 8 和 Kapitel 9 均有 `080`。结构 ID 必须用官方 doknr；层级只能结合源顺序和活动祖先验证，不能静默纠正源编号。
- text、fussnoten、目录、废止/空条文均需保留并区分，不可只抓非空条文正文。来源脚注不自动成为法律义务或转置关系。
- 四份 ZIP 均只有 XML，无图片。KWG Annex I 含真实表格及跨列属性；其余表格主要用于目录。文本顺序投影不能宣称表格排版保真。未知元素或无法表达的资源必须明确报错或保持候选。

## 未发布候选：法国与卢森堡

- 法国：[AMF Règlement général](https://www.amf-france.org/fr/eli/fr/aai/amf/rg) 现有可复现的候选检查工具；冻结输入标示版本 11/09/2026，包含 693 分组、1,821 个完整条文标题及独立链接。全局 1、分组内 63、条文内 68 个 `note-amf` 合计 132，须与正文分开保留；`212-19` 与 `212-19 bis` 不得去重。独立完整源对照为 0 diff。尚未接入 Canonical/Reader 或计为覆盖，详见[法卢候选阶段](fr-lu-candidate-review-20261021.md)。
- 法国：Légifrance CMF 直接获取返回 403。没有改用非官方转载，也未将检索摘录算成已接入正文。
- 卢森堡：[CSSF 法文来源页](https://www.cssf.lu/fr/Document/loi-du-5-avril-1993/) 及其直接链接 `L_050493_lsf.pdf` 获取成功；法文 PDF 为 3,194,942 bytes，SHA-256 `7d3cb1d625f0758eb7309984ea001064632e89147d33dae49f6e873b78686c82`。页面列示更新日 2026-07-11；需进一步核对 PDF 内部版本及来源地位，不能仅凭页面更新日发布。当前保持候选。

## 验收边界

已发布切片覆盖 Canonical、德文原文、不可变快照、API、Runtime、RAG 和 Profile。当前 corpus 为 120 份：112 EUR-Lex、3 CSSF、1 EBA、4 DE；banking-default 保持 99 份。Runtime schema 5.11、Public API 1.4、RAG Snapshot 1.2。GwG、WpIG、KWG、KAGB 均不建立转置或 `IMPLEMENTS` 关系，也不据源 Stand 声明生效状态或最新认证。法国 HTML 和卢森堡 PDF 在各自来源地位、版本及保真审阅通过前继续保持候选；已有 3 份 CSSF 文档不等于卢森堡核心法律已覆盖。静态检查、生产构建、11 项浏览器验收及两版本严格构建已完成；完整回归首次超时和定向重测结果详见第二批验收记录。

首批专项审阅见[德国国家法首批审阅与验收](national-first-slice-review-20261021.md)；第二批审阅见[德国 KWG/KAGB 第二批记录](national-second-batch-review-20261021.md)。
