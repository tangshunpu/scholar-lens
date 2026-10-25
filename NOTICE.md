# 来源与修改说明

## ShowJCR 数据

来源：https://github.com/hitfyd/ShowJCR

固定版本：`4687a8f608f20aaf004299992f5d347dba009361`。

上游仓库附带 GNU General Public License v3.0；原许可全文随包保留在 `licenses/ShowJCR-GPL-3.0.txt`。本包包含原始 `FQBJCR2025-UTF8.csv`、`JCR2025-UTF8.csv`、`XR2026-UTF8.csv`、`XR2026Conferences-UTF8.csv` 以及由它们生成的 `data/journals.json`。新锐期刊分区表数据由 xr-scholar.com 发布，经上游 ShowJCR 整理为 CSV。这些数据及其转换结果保留该许可。完整对应源文件、转换程序与来源散列均包含在本包，转换程序为 `scripts/build-journals.py`。

2026-10-23 所做转换：读取 UTF-8 CSV、按 ISSN 匹配、分开保存中科院大小类及 JCR 学科、保留缺失值和 `<0.1`、附加版本和来源行号。新锐分区单独保存与显示（2026-10-24 加入）；医学与人文社科期刊在生成的快照中只保留名称与 ISSN（原始 CSV 不变，`--all` 可生成完整快照）；没有用其他排名推断中科院分区或 IF。本扩展没有复制 ShowJCR 的浏览器插件代码。

## CCF 与既有扩展

CCF 目录来自官方公开发布 PDF；版本、来源、页码随记录保留，见 `docs/SOURCES.md`。排名事实的整理不表示 CCF 认可或认证此扩展。

`src/venue-normalizer.js` 来源于用户本机的 Google Scholar Publication Venue Stats 0.1.15 项目。原文件保持不变；本版新增独立的别名目录与匹配层。作者高亮和兼容适配为独立实现，未复制原 Author Highlighter 的算法、服务或接口代码。

本交付以可检查、可修改的源码形式提供；不声称拥有第三方组件或数据的权利。与 Google、CCF、Clarivate、ShowJCR 无隶属关系。
