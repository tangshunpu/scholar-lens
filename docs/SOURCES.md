# 来源与实现记录

核验日期：2026-10-23（Asia/Singapore）。

## CCF

- 官方发布页：<https://www.ccf.org.cn/Academic_Evaluation/By_category/>
- 官方 PDF：<https://www.ccf.org.cn/ccf/contentcore/resource/download?ID=112CF3BF7E1140ACEB271ADAED12A67ADFABB8FF099E40C2759502A85C8A281F>
- 文件：第七版《中国计算机学会推荐国际学术会议和期刊目录》（2026），72 页；发布页注明 2026-04-09 勘误修订。
- 使用 PDF 表格提取，按领域、期刊/会议和 A/B/C 保存；相同名称跨领域合并，保留各领域等级。681 条领域记录合并为 677 个场所。提取时没有空名称/缺等级/缺领域条目。
- `data/ccf.json` 保存 `pdfSha256`、源链接、检索日、每条记录的 PDF 页码。另对第 57 页 AI A 类会议进行了图像核对。
- 常见缩写、历史名称和用户原有归并规则用于辅助名称匹配，不新增或推断等级。改名期刊的原 PDF 标题保留在 `pdfTitle` 字段。

CCF 官方目录明确排除 Short paper、Demo、Technical Brief、Summary、Findings、Workshop 等非主会正式长文。插件对可见元数据中的这些词做保守排除；元数据没有提供论文类型时不能保证逐篇认证。

## 期刊数据

- 中科院官方分区平台：<https://www.fenqubiao.com/>
- 分区开放平台的数据结构：<https://webapi.fenqubiao.com/Help/ResourceModel?modelName=ZKYCategory>
- JCR：<https://jcr.clarivate.com/>
- Clarivate Journals API 说明：<https://developer.clarivate.com/apis/wos-journal>

v1.1.0 内置第三方公开数据 [ShowJCR](https://github.com/hitfyd/ShowJCR)，固定上游 commit `4687a8f608f20aaf004299992f5d347dba009361`，检索日 2026-10-23。此 commit 的 README 标注中科院 2025 升级版与 JCR / IF 2025；上游 JCR 2025 的更新提交为 `c8da202c1d39373abdb5b5f936de712bb182ce0b`，2026-06-17。v1.4.0 起另行内置同一 commit 中的新锐期刊分区表 2026（XR2026），单独显示为“新锐”，不当作中科院数据。

- [中科院原始 CSV](https://github.com/hitfyd/ShowJCR/blob/4687a8f608f20aaf004299992f5d347dba009361/中科院分区表及JCR原始数据文件/FQBJCR2025-UTF8.csv)：21,772 行。
- [JCR / IF 原始 CSV](https://github.com/hitfyd/ShowJCR/blob/4687a8f608f20aaf004299992f5d347dba009361/中科院分区表及JCR原始数据文件/JCR2025-UTF8.csv)：22,643 行。
- [新锐期刊分区表原始 CSV](https://github.com/hitfyd/ShowJCR/blob/4687a8f608f20aaf004299992f5d347dba009361/中科院分区表及JCR原始数据文件/XR2026-UTF8.csv)：22,299 行，SHA-256 `8bffe4bdcae8f710c756e0138d93219bb53555eae23827c20287bc9200a027e6`；[会议 CSV](https://github.com/hitfyd/ShowJCR/blob/4687a8f608f20aaf004299992f5d347dba009361/中科院分区表及JCR原始数据文件/XR2026Conferences-UTF8.csv)：15 行，SHA-256 `96b6764033d89e196aaf40363aa193f8965261fa52fd3631c6365686b7630805`。上游 README 注明数据来自 <https://www.xr-scholar.com>，2026 年版于 2026-03-24 发布，涵盖 SCIE、SSCI、ESCI 等来源，不再单独发布预警名单，对预警期刊标记 “Under Review”。
- 新锐表按 ISSN / eISSN 连接到同一期刊条目：22,299 行全部挂接，无 ISSN 冲突；其中 32 种期刊只见于新锐表，作为新条目加入（2 种没有 ISSN）。原有条目 ID 在加入新锐数据前固定，中科院 / JCR / IF 数值不变。大类与小类分开保存，大类优先、多个大类取最高（上游注明 ADVANCED ENGINEERING MATERIALS、Soft Science 有两个大类）；Top 标记随大类保存。15 个会议在加载时按全称或缩写唯一挂接到 CCF 会议记录。
- **内置范围（v1.4.1）**：凡中科院 / 新锐大类全部属于医学或人文社科（社会学、文学、管理学、教育学、哲学、历史学、经济学、心理学、艺术学；两表都没有时按 JCR 学科推断），且没有任何计算机、工程、数学、统计、运筹、电信、自动化、机器人、成像科学、医学信息学、信息科学或仪器类学科的期刊，在 `data/journals.json` 中只保留刊名与 ISSN（`excluded` 字段），不含指标；全部 CCF 期刊保留完整指标。结果：8,765 个完整条目、14,296 个仅名称条目（医学 5,664、人文社科 8,632）。`python3 scripts/build-journals.py --all` 生成不删减的完整快照。原始 CSV 仍全部随包保留。
- `data/upstream/` 保留原文件，`data/journals.json` 保存 SHA-256、源 commit、指标年度与逐条来源行号。`data/journal-build-audit.json` 保存覆盖和冲突统计。
- 按 ISSN / eISSN 连接两表，名称仅用于唯一且标识符兼容的补充匹配。合并为 23,029 个期刊条目（加入新锐表后为 23,061）；其中中科院 21,772、JCR 有效分区 20,337、有效 IF 22,594。
- 原始 JCR 中 49 条 IF 缺失；619 条 `<0.1` 原样保留。原始 2,306 条没有有效 JCR 分区，不推断补全。相同刊名、不同 ISSN 的记录不合并，页面只有歧义刊名时不显示其指标。
- 小类与大类分别保存；多 JCR 学科并列，IF 专指 Journal Impact Factor，不以其他引文指标替代。该快照不是官方实时 API，抽样核验不保证全表无误。

样本交叉核验（2025 指标年度）：

| 样本 | 内置 IF | 出版方材料 |
|---|---:|---|
| IEEE TPAMI | 20.4 | [IEEE Computer Society Publications](https://www.computer.org/publications) |
| IEEE TWC | 10.3 | [IEEE Communications Society 发布](https://www.linkedin.com/posts/ieee-communications-society_transactions-on-wireless-communications-received-activity-7489715414634217472-4Kry) |
| CA: A Cancer Journal for Clinicians | 685.2 | [Wiley 期刊页](https://www.wiley.com/en-jp/ca-a-cancer-journal-for-clinicians-p-15424863) |

重建：在扩展目录运行 `python3 scripts/build-journals.py`。只需标准库，读随包 CSV，不联网。新年份更新应先核对来源、许可、字段与指标年度，再生成新快照并回归测试。

## 会议俗称、历史名称与容器期刊

`data/venue-aliases.json` 共 388 个场所条目、1,290 种写法；其中 50 个条目有针对性别名整理。其余是 CCF 正式名称的出版社前缀省略、Conference / Symposium 缩写等确定性格式变体。每条包含证据链接，可用 `python3 scripts/build-aliases.py` 重建。

| 归并 | 主要证据 |
|---|---|
| ACM MM / ACMMM / ACM Multimedia | [ACM 会议发布](https://www.acm.org/binaries/content/assets/press-releases/2018/october/mm-2018.pdf)、[会议官网](https://acmmm.hosting2.acm.org/) |
| KDD / SIGKDD | [SIGKDD 历届会议](https://www.kdd.org/conferences) |
| Oakland / IEEE S&P | [IEEE S&P 2026 主办方说明](https://www.ieee-security.org/TC/SP2026/cfdonors.html) |
| USENIX ATC / ACM SIGOPS ATC | [ATC 2026 CFP](https://atc.sigops.org/2026/cfp.html) |
| NIPS / NeurIPS | [CCF 报道](https://cncc2019.ccf.org.cn/cms/news/100000/0000000040/2019/10/11/6063546cfeff435fa8b3103b32b7a1bf.shtml) |
| EMNLP-IJCNLP | [ACL Anthology 正式文集](https://aclanthology.org/volumes/D19-1/) |
| NAACL-HLT / 主会与 Findings 区分 | [NAACL 2025 accepted papers](https://2025.naacl.org/program/accepted_papers/) |
| PVLDB → VLDB | [PVLDB 第 17 卷第 13 期前言](https://www.vldb.org/pvldb/vol17/FrontMatterVol17No13.pdf) |
| PACMMOD → SIGMOD | [SIGMOD 2026 论文征集](https://2026.sigmod.org/calls_papers_sigmod_research.shtml) |
| IMWUT → UbiComp | [UbiComp 2026 IMWUT 论文](https://ubicomp.hosting.acm.org/ubicompiswc2026_wp/imwut-papers/) |
| PACMPL 的明确会议期次 | [SIGPLAN PACMPL Procedures](https://www.sigplan.org/PACMPL/pacmpl_procedures.pdf)、[PLDI 加入 PACMPL](https://blog.sigplan.org/2022/08/08/pldi-will-join-pacmpl/) |
| PACMHCI 的明确会议期次 | [SIGCHI conferences](https://sigchi.org/conferences/)、[CSCW 历史](https://archive.sigchi.org/conferences/conference-history/cscw/) |

不做任意模糊匹配。MMAsia 与 ACM MM、AsiaCCS 与 CCS、SIGGRAPH Asia 与 SIGGRAPH 分开；FSE 同时指软件工程与密码学会议，SEC 同时指边缘计算与 IFIP 安全会议，裸缩写不强行赋级，明确的会议名采用不同分组。CCF 单独列出的 Workshop 会议保留目录等级，附属 workshop 不套用主会等级。

## 现有插件与独立实现

- Venue Stats：只读查看用户本机的 Google Scholar Publication Venue Stats **0.1.15**，复用其 `venue-normalizer.js`，保留通信领域缩写、会议年份和 Workshop 归并规则。未修改原插件文件。
- Author Highlighter：只读查看本机 **2.4.0** 的 Manifest、页面控件和高亮状态约定，以 `#author-highlighter-controls` 检测兼容模式，以 `.highlighted-author` 读取当前选择。没有复制其作者识别、后台服务或 API 实现。
- Author Highlighter 产品页：<https://chromewebstore.google.com/detail/google-scholar-author-hig/ijmngekkpaccbbjimedfkjpigplaikah>
- Chrome Content Scripts 文档：<https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts>

扩展使用独立的 Manifest、存储空间、页面标记与实现。所有页面显示的用户数据通过文本节点写入；只使用随扩展打包的脚本和数据。


## v1.2.0：MobiCom 名称与截断处理

用户报告的 `Proceedings of the 29th Annual International Conference on Mobile Computing and Networking` 对应 [MobiCom 2023 官方页面](https://sigmobile.org/mobicom/2023/)。CCF 2026 目录中的 MobiCom 为 A 类（本包 CCF 原始记录第 13 页）。标签沿用当前 2026 目录口径，不据此声称历史目录逐年相同。

将用户原文直接输入 1.1.0 匹配器时可正确识别，所以不能仅凭原文断言用户实际运行页面漏标的原因。本次复现并修复的是：完整会议名后带省略号时，原实现要求出现明确缩写才保留匹配，即使完整长名称已出现也会拒绝。新版仅在省略号之前已经出现完整且足够具体的会议名时保留匹配；名称本身缺字、被截断或附有 Workshop/Companion 等词时仍保守处理。面板增加版本号，帮助识别旧版本未重载的情况。
