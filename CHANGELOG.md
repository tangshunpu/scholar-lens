# 更新日志

各版本的改动记录，最新在前。功能概览见 [README](README.md)。

## v1.4.3

识别逻辑更鲁棒。新增 89 条真实写法的回归样本（`tests/fixtures/venue-corpus.json`），由 65 条正确提高到全部正确：

- **期刊名后的括号缩写**：`ACM Transactions on Graphics (TOG) 32 (4)`、`ACM Computing Surveys (CSUR)`、`IEEE/ACM Transactions on Networking (TON)`。
- **DOI**：先去掉 DOI 与链接再匹配；名称不全时按 IEEE DOI 中的期刊代码识别，如 `IEEE Internet of Things, DOI: 10.1109/JIOT.2016.2560518` → IEEE Internet of Things Journal（内置 88 个常用 IEEE 期刊代码，均已核对能对应到目录）。
- **状态备注**：`(accepted)`、`to appear`、`in press`、`early access` 不再妨碍匹配。
- **旧名称与写法**：`Ad Hoc` / `Ad-Hoc` / `Adhoc` 视为同一词（MASS），`Int'l`、`Ann.` 可识别（如 `Proc. 33rd Ann. IEEE Int'l Conf. Computer Comm` → INFOCOM），`IEEE Computer Society Conference on Computer Vision and Pattern Recognition`（2005 年前的 CVPR）；MobiHoc 旧名 `ACM International Symposium on Mobile Ad Hoc Networking and Computing`、MASS 新旧名称加入别名；PNAS 的常用短名 `Proceedings of the National Academy of Sciences`。
- **Findings**：`Findings of the Association for Computational Linguistics: ACL 2026` 归入 ACL Findings（EMNLP、NAACL 同理），显示“非主会长文 · 不计 CCF”。
- **修正误判**：NAACL 正式卷 `Volume 1 (Long and Short Papers)` 不再被当作短文。
- 不在目录中的会议（如 VTC）显示“会议不在 CCF / 新锐目录中”，不再笼统显示“未匹配目录”。
- 截断推测、期刊写法和倒装写法检查结果不变或更好（倒装会议 105 / 105）。

后续修正：

- **作者主页只读取英文姓名**：`Yinghui He (何映晖)`、`何映晖 Yinghui He`、`Yinghui He | 何映晖` 等写法都只取 `Yinghui He`，并生成 `Y He`；中文名和整串原文不再作为别名，也不再填入姓名框。会去掉 `Prof.`、`Dr` 等称呼和 `PhD` 等学位；没有英文的姓名保持原样。
- **自己的 Scholar 主页**：本人主页每行前有复选框列，命中论文的高亮竖条现在位于整行最左侧，不再夹在复选框与标题之间。

## v1.4.2

- **识别 IEEE Xplore 旧式倒装名称**：约 2008–2014 年的 IEEE 论文在 Scholar 中常写成倒装形式，现在都能识别，例如 `Industrial Electronics, IEEE Transactions on 57 (12)`、`Communications Letters, IEEE 17 (4)`、`Networking, IEEE/ACM Transactions on`、`Lightwave Technology, Journal of 32 (4)`、`Communications (ICC), 2012 IEEE International Conference on`、`Communications, 2009. ICC'09. IEEE International Conference on`。只在原写法匹配不到时才调换顺序重试，场所列表按正常写法归组。
- 核对：目录中所有 IEEE / IEEE-ACM 期刊（216）、IEEE 杂志与快报（88）、“Journal of …”期刊（1,385）、IEEE / ACM 会议（102）的倒装写法全部识别到与正常写法相同的场所。
- 顺带修正两处误配：结尾多出 of / and 等虚词的写法不再套到别的期刊上（`Econometrics, Journal of` 不再被当作 *Econometrics Journal*，`Virtual Reality and …` 不再被当作 *Virtual Reality*）；带 Conference / Symposium / Workshop 的写法不再被当成同名期刊（`Big Data, 2012 IEEE International Conference on` 是 IEEE BigData 会议，不是期刊 *Big Data*）。
- 已停刊的 *IEEE Transactions on Systems, Man, and Cybernetics, Part B*（2013 年起为 IEEE Transactions on Cybernetics）不在 2025 数据中，仍显示“选择场所”，可手动选择后继期刊。

## v1.4.1

- **删去医学与人文社科期刊的指标**：凡中科院 / 新锐大类全部属于医学或人文社科（社会学、文学、管理学、教育学、哲学、历史学、经济学、心理学、艺术学；两表都没有时按 JCR 学科推断），且没有任何计算机、工程、数学、统计、运筹、电信、自动化、机器人、成像科学、医学信息学、信息科学或仪器类学科的期刊，不再内置中科院 / 新锐 / JCR / IF，只保留刊名与 ISSN。内置数据由 8.3 MB 降到 4.3 MB：8,765 个期刊保留完整指标，14,296 个只留名称（医学 5,664、人文社科 8,632）。
- **仍然保留**：全部 CCF 期刊（包括 MIS Quarterly、Cognition、Computer Law & Security Review 等文科 / 医学大类的 CCF 期刊，281 个 CCF 期刊的指标不变），以及带计算机或工程类学科的医学 / 社科期刊，如 IEEE TMI、Medical Image Analysis、Journal of Biomedical Informatics、Computers & Education。
- **只留名称的期刊**：论文旁显示灰色“人文社科 / 医学期刊 · 未内置指标”，不再提示“选择场所”；属“未分级”。保留名称是为了不让这些论文被套到名字相近的理工期刊上。需要时可在设置页“补充导入”中添加这些期刊的指标，导入后照常显示。
- 重新生成全部期刊：`python3 scripts/build-journals.py --all`。

## v1.4.0

- **新锐期刊分区表 2026**：内置新锐分区（2026-03-24 发布，22,299 种期刊 + 15 个计算机重要会议），来源与中科院 / JCR 相同的 ShowJCR 固定版本，数据由 [xr-scholar.com](https://www.xr-scholar.com) 发布。论文旁显示“新锐 N区 · 2026”，大类优先、多个大类取最高，Top 期刊标“Top”；新锐一区为靛蓝底白字加粗，与 CCF-A（红）、中科院一区（紫）区分。悬停可看全部大小类。
- **会议也有新锐分区**：ACL、CVPR、FOCS、ICML、ICSE、IEEE S&P、ISCA、KDD、NeurIPS、OSDI、SIGCOMM、SIGMOD、SOSP、STOC、VLDB 均为新锐 1区 Top；附属 Workshop 等仍不套用。
- **新锐预警**：新锐表不再单独发布预警名单，37 种期刊标记“Under Review”，显示红色“新锐预警 · Under Review”。
- **筛选与统计**：论文等级新增“新锐 一区 / 二区 / 三区 / 四区”，可与 CCF、中科院、IEEE Trans 多选组合；PUBLICATION INSIGHTS 新增“新锐一区”篇数，点击即筛选；“未分级”改为既无 CCF 也无中科院、新锐分区；CSV 新增“新锐”列。
- 新锐表另收录 32 种 JCR / 中科院快照中没有的期刊，期刊条目由 23,029 增至 23,061；原有条目的 ID 与中科院 / JCR / IF 数值不变，已保存的“选择场所”仍然有效。

## v1.3.3

- **期刊名写法差异也能匹配**：完整（非截断）名称精确匹配失败时，再按以下写法比对，且必须唯一对应一个场所、目录名称的每个词都对得上：单数写法（`IEEE Communication Magazine`、`IEEE Wireless Communication`、`IEEE Transaction on Mobile Computing`）、ISO 4 缩写（`IEEE Commun. Mag.`、`IEEE Wirel. Commun.`、`IEEE J. Sel. Top. Signal Process.`、`J. ACM`、`Proc. IEEE`，带不带点都可）、省略介词（`Briefings Bioinformatics`）。单复数只允许“写成单数、目录为复数”，以免把未收录的 *Journal of Communications* 套到 *Journal of Communication* 上；`J.`、`Med.`、`Eur.`、`Int.` 等极短缩写只按 ISO 4 含义（Journal、Medical、European、International）。
- **核对范围**：约 80 个 IEEE ComSoc 及通信、信号处理常用期刊和全部 291 个 CCF 期刊，各按全名、大写、单数、ISO 缩写、无点缩写 5 种写法检查，共 1,629 种写法；仍不能确定的只剩真实同名期刊（两个 JCST、Frontiers *of*/*in* Computer Science）和不带卷期的期刊/会议同名（CSCW、CVM），由“选择场所”确认。在全部约 2.3 万个期刊上，单数写法 95% 、ISO 缩写 99.5% 唯一识别到本刊。
- **CCF 期刊补全 JCR / 中科院数据**：17 个 CCF 期刊此前因写法不同没有挂上 JCR / 中科院数据，现已补全，包括开头 “The”（The Journal of Supercomputing、The VLDB Journal、The Computer Journal、The Visual Computer 等）、副标题（Journal of Systems Architecture: Embedded Software Design、Future Generation Computer Systems-The International Journal of eScience、Computers & Graphics-UK、World Wide Web-Internet and Web Information Systems）、标点与介词（TSMC、ACM Transactions in/on Quantum Computing）。291 个 CCF 期刊中 281 个有 JCR / 中科院数据，其余 10 个（如 WCMC、SCN、MTA、NCA、PUC）不在 JCR 2025 中。
- **同一期刊的两个 ISSN**：Computer Law & Security Review（JCR 用 2212-473X，中科院用旧 ISSN 0267-3649）、Information Retrieval Journal / Discover Computing（2024 年更名）各合并为一条，依据写在 `data/venue-aliases.json` 的 `sameJournals`。
- **卷期页码说明是期刊**：同名的期刊与会议（如 CSCW、Computational Visual Media），带卷期页码时按期刊识别。
- **`*` 识别为通讯作者**：作者名单中目标作者姓名后带 `*`（含全角 `＊`）或 `✉` 时，自动标为通讯作者；其他作者的星号不影响。†、‡、§、# 仍显示“符号待核实”，共同一作需用“作者标记”确认。
- **选择条件即只看命中**：点选作者角色、论文等级、场所，或输入年份、关键词后，“只显示命中论文”自动打开，列表只留命中的论文；可以手动关掉以显示全部（命中论文仍整行高亮），下次再选条件会重新打开。“清除筛选”会关闭它。打开页面时默认仍显示全部论文、高亮第一作者。

## v1.3.2

- **IEEE Transactions on Networking 不再“名称存在歧义”**：JCR 2025 把更名后的 ToN 以新 eISSN 2998-4157 另列一条（无任何指标），与原 IEEE/ACM Transactions on Networking（1063-6692）同名，因此被判为歧义。现在这类“同名、无指标、只多一个新 ISSN”的更名条目会并入原期刊，新旧名称都显示 CCF A · 中科院 3区 · JCR Q1/Q2 · IF 5.3。同样修正 IEEE Transactions on Audio, Speech and Language Processing（2998-4173）。
- **用户确认场所**：仍无法自动确定的场所（同名不同刊、截断后有多个候选、目录未收录），论文旁显示红色“选择场所”。弹窗列出候选（含 ISSN 与等级），也可按全称、缩写或 ISSN 搜索全部目录，或标为“不在目录中，不赋级”。选择按场所名（去掉卷期页码和年份）保存在本机，同名场所的所有论文一起生效；之后显示“场所 ✓”，可随时修改或“恢复自动识别”。截断后推测的场所显示“核对场所”，可确认或更正。面板统计说明里会提示“N 篇场所未能自动确定”。
- **修正 CCF A《Artificial Intelligence》误挂 MDPI 期刊指标**：CCF 记录的缩写别名 “AI” 与 MDPI 期刊名 “AI” 相同，导致 AIJ 显示了 MDPI 的 ISSN 2673-2688 和中科院 4区。现在内置期刊只按标题（或多词别名）并入 CCF 记录，AIJ 改为 Elsevier 0004-3702 的中科院 2区 / JCR Q2 / IF 4.7；单独写 “AI” 时为歧义，由用户选择。
- **开头的 “The” 不再挡住期刊名**：`The journal of machine learning research` → JMLR（CCF A），`The Lancet` → Lancet。
- 仍保持歧义、需要用户选择的真实同名期刊例子：Journal of Computer Science and Technology（中国 JCST 1000-9000 与阿根廷 1666-6038）、单独的 “AI”。

## v1.3.1

- **截断场所名可推测**：Scholar 会把较长的场所名截到约 70 个字符并加“…”。现在只要截断前的文字是目录中**唯一一个**场所名称的开头，就按该场所赋级，例如 `Proceedings of the 29th Annual International Conference on Mobile Computing …` → MobiCom（CCF A），`Proceedings of the ACM on Interactive, Mobile, Wearable and Ubiquitous …` → IMWUT（关联 UbiComp CCF A，并显示其中科院 / JCR / IF）。比对时忽略 “Proceedings of the”、届次、年份，会议名中的 ACM / IEEE / Annual / International / SIGxxx 可省略；期刊名逐词对齐（“International Journal of X”不等于“Journal of X”）。
- **仍然不猜的情况**：截断后只剩不到两个有区分度的词（如 `IEEE Transactions on Communication…`）；文字已超出某个场所的全名（如 `International Conference on Machine Learning and …` 可能是 ICMLA，不当作 ICML）；同时符合多个场所时标签写出候选，如“可能是 SOSP / OSDI”。推测结果的悬停说明会注明“按唯一匹配的名称开头推测”，截断后无法区分附属 Workshop / Companion，需自行核对。
- **修正把普通单词当缩写**：`Design`、`Cluster`、`Performance`、`Networking` 等也是其他场所名里的普通词，不再在截断名称中被当成 DATE、CLUSTER 等会议的缩写；缩写须按缩写写法独立出现（如 `MobiCom`、`SIGCOMM`），`SIGMOD-SIGACT-SIGAI` 中的 SIGMOD、`SIGGRAPH/Eurographics` 中的 SIGGRAPH 不算。此前 `…Symposium on Operating Systems Design and …`（OSDI）会被误标为 DATE，PODS 被误标为 SIGMOD，现均已改正。
- **IMWUT 指标补全**：ShowJCR 中 IMWUT 名为 “…Technologies-IMWUT”，此前会议关联没有挂到这条期刊记录上，完整名称只显示“关联 CCF”而缺少中科院 / JCR / IF。现在两者合并为同一条。
- 在全目录上模拟 Scholar 式截断（≤ 75 字符）：期刊 338 例 0 例误判，会议 1,235 例 2 例误判（均为模拟生成的 “Annual The International …” 非常规前缀）。

## v1.3.0

- **筛选逻辑统一**：作者角色、论文等级、年份、场所和标题关键词是同一组条件——不同组之间为“且”，同一组内多选为“或”。例如选“第一作者”和“CCF A类 + 中科院一区”，命中的是“第一作者且（CCF-A 或 中科院一区）”的论文。面板写出当前条件和命中篇数。
- **一个显示开关**：默认显示全部论文，命中论文整行高亮；打开“只显示命中论文”后隐藏其他论文。统计、发表场所列表与 CSV 一致；CSV 导出当前列表，并标注每篇是否命中。
- **论文等级可多选**：CCF A/B/C 类、中科院一区至四区（按大类分区，多个大类取最高）、IEEE Trans（含 IEEE/ACM Transactions）、未分级（既无 CCF 等级也无中科院分区）。
- **默认高亮第一作者**；“姓名与可能缩写”默认收起。“清除筛选”清空等级、年份、场所、关键词并关闭“只显示命中论文”，不改动角色选择。
- **PUBLICATION INSIGHTS**：与 Scholar “引用”栏同样的表格，分“全部 / 命中”两列，新增 CCF-A、中科院一区、IEEE Trans 篇数；点击这三行可直接切换对应等级筛选。未设置任何条件时只显示“全部”列。
- **引用数与网页一致**：“全部”列的引用、h-index、i10-index 直接读取 Scholar 主页右侧统计表。旧版把已加载论文的逐篇引用相加，而 Scholar 总数按自己的口径统计，两者本来就不相等（例如一个真实主页官方为 1,102,872，前 20 篇逐篇合计 882,620）。“命中”列仍按论文逐篇计算；悬停“全部”列可看逐篇合计。搜索结果页没有官方统计，仍逐篇计算。
- **贴着“引用”栏**：右侧空白足够时，面板固定在 Scholar 正文右侧 16px，顶部与“引用”栏对齐，向下滚动后停在视口顶部 12px；空白不足（如 13–16 英寸笔记本）时，面板放进 Scholar 右栏，紧接“引用”栏下方。两种方式都不改动 Scholar 正文宽度、边距和居中。在正文右侧时收起会留下一个竖排“Scholar Lens”标签；在右栏时收起只保留标题栏。
- **Google Scholar 风格外观**：Arial 13px、#222 / #777 文字、#e5e5e5 分隔线、Scholar 蓝按钮与链接。角色高亮改用 Google 色板浅色，角色按钮选中时显示对应高亮色，可当图例；CCF-A 红底白字、中科院一区紫底白字保留。设置页和弹窗换用同一配色。

## v1.2.x

- **修复双语姓名与缩写漏识别**：`Yinghui He (何映晖)` 自动关联 `Yinghui He`、`何映晖` 和 `Y He`。支持中英文括号、姓名中的方向控制符，以及 `GY Li` / `G. Y. Li` 等写法；不会把其他完整姓名或只有姓氏的作者当作本人。
- **可选姓名候选与同名保护**：侧栏直接列出完整姓名、`Y He / Y. He`、`He Y / He Y.` 等可能写法，以及实际出现的论文数量。常规首字母缩写默认参与匹配，反序写法需手动勾选；选择按作者主页保存。若已加载名单出现另一个可使用同一缩写的完整姓名，会撤回该缩写的自动高亮；同篇出现多个候选时不猜角色。可逐篇核对后用“作者标记”确认。完全同名且没有其他身份信息时，无法仅凭列表确定是否同一人。
- **识别与空结果提示**：显示已识别的作者角色论文数、当前角色高亮数，并区分未选角色、姓名未匹配、所选角色无结果。同一名单中重复的相同缩写不自动判定角色，可用“作者标记”核对。

- **默认自动 Show more**：打开作者主页就自动逐页加载，侧栏收起时照常工作。等待新论文返回后才继续，避免与原 Highlighter 重复点击。加载过程中显示临时统计、可停止与继续；完成后更新全量统计，CSV 包含最后一页。请求超时会保留部分统计并提供继续入口。
- **命中论文整行高亮**：命中的整条论文背景着色，包含标题、作者、场所、引用数和年份。第一作者用浅黄、第二作者用浅橙、共同一作用浅绿、通讯作者用浅紫、末位作者用浅蓝、中间作者用浅青；多角色重合时依次优先共同一作、通讯、一作、二作、末位、中间。未选角色、只按等级等条件命中时用浅蓝。兼容模式以原 Highlighter 已识别角色为准。

- **保持 Scholar 原有居中布局**：不调整页面 padding、容器宽度和页头宽度。正文、原引用栏的位置和宽度保持原样，展开或收起都不会让页面左移。
- **角色直接多选**：第一作者、共同一作、第二作者、通讯作者、末位作者、中间作者直接显示为复选项，支持全选/清空，满足任一所选角色即命中。兼容旧 Highlighter 时，这里的选项同步其对应开关（旧插件不支持的中间作者不显示）。
- **两种重点颜色**：CCF-A 使用红底白字，中科院显示分区为一区时使用紫底白字，均加粗；大类二区不会因某个小类一区而误用一区颜色。
- **MobiCom 漏标修正**：完整名称 `Proceedings of the 29th Annual International Conference on Mobile Computing and Networking` 在 1.1.0 已可匹配。保留 1.2.0 对“完整会议名后跟省略号”被一律拒绝的修复，并增加原文、其他届次、年份和缩写的回归检查。会议名本身被截断时，自 1.3.1 起只在名称开头唯一对应一个场所时推测；附属 Workshop 仍不算主会。
- **版本可见**：面板标题旁显示版本号（当前 v1.3.0）。更新文件后务必在 Chrome 扩展管理中点“重新加载”，再刷新 Scholar；覆盖文件本身不保证旧标签页和后台已更新。
