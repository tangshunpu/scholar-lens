# 指标数据格式

只有 `title`（期刊/会议完整名称）必填；每项非空指标必须有自己的年度与来源。别名只影响名称匹配。名称或 ISSN 不会触发远程查询；ISSN 用于同名期刊合并、区分和数据搜索，不从论文 DOI 自动解析。

## CSV / TSV

首行为表头，推荐使用以下列。空指标留空，**不要用 0 表示未知**（真实 IF 为 0 时允许填 0）。

| 列 | 说明 |
|---|---|
| `title` | 完整期刊/会议名称；也支持 `journal`、`name`、`期刊名称`、`刊名` |
| `aliases` | 别名，以 `|` 分隔；不要使用正则表达式 |
| `type` | `journal` 或 `conference`，默认 `journal` |
| `issn` | 可选，按文本保存 |
| `cas` | 中科院分区：1、2、3、4，也接受 1区 等 |
| `casYear` | 中科院分区表年度 |
| `casCategory` | 学科名称 |
| `casScope` | `major` 大类（默认）或 `minor` 小类 |
| `casTop` | 可选，`true` 或 `false` |
| `jcr` | `Q1`、`Q2`、`Q3`、`Q4` |
| `jcrYear` | JCR 指标年度 |
| `jcrCategory` | JCR 学科名称 |
| `impactFactor` | 非负数字或 `<0.1`；也支持 `IF` 或 `影响因子` |
| `ifYear` | Journal Impact Factor 指标年度 |
| `source` | 数据来源名称或 URL，应用于本行各项指标 |
| `ccf` | 可选，自定义 CCF A/B/C；同时填写 `ccfYear` 与来源 |
| `ccfYear`, `ccfCategory`, `ccfSource` | 可选 CCF 目录年度、领域和独立来源 |

逗号、引号、换行字段遵循标准 CSV 引号规则。推荐使用扩展导出的模板，并由 Excel 另存为 CSV UTF-8。TSV 使用制表符分列。文件上限为 8 MB。

**以下所有数值均为虚构示例，不是真实期刊指标。**

```csv
title,aliases,type,cas,casYear,casCategory,jcr,jcrYear,jcrCategory,impactFactor,ifYear,source
Example Journal (DEMO),EJ-DEMO,journal,2,2025,工程技术,Q2,2024,COMPUTER SCIENCE,3.5,2024,仅作结构演示（虚构数据）
```

同一期刊有多个 JCR 学科时，增加同名行，分别填入 `jcrCategory` 与 `jcr`。中科院大小类也可采用多行输入。不要重复填入含义冲突的同年度同学科数据。

## JSON

支持顶层数组或 `{ "records": [...] }`。数组指标结构如下。此示例同样是虚构期刊与指标，需全部替换后才能用于实际展示。

```json
{
  "records": [
    {
      "title": "Example Journal (DEMO)",
      "aliases": ["EJ-DEMO"],
      "type": "journal",
      "issn": "",
      "cas": [
        { "year": 2025, "division": 2, "scope": "major", "category": "工程技术", "top": false, "source": "虚构示例" },
        { "year": 2025, "division": 1, "scope": "minor", "category": "计算机：人工智能", "source": "虚构示例" }
      ],
      "jcr": [
        { "year": 2024, "quartile": "Q1", "category": "COMPUTER SCIENCE, ARTIFICIAL INTELLIGENCE", "source": "虚构示例" },
        { "year": 2024, "quartile": "Q2", "category": "ENGINEERING, ELECTRICAL & ELECTRONIC", "source": "虚构示例" }
      ],
      "impactFactors": [
        { "year": 2023, "value": 3.1, "source": "虚构示例" },
        { "year": 2024, "value": 3.5, "source": "虚构示例" }
      ]
    }
  ]
}
```

`ccf` 数组项格式为 `{ "rank": "A", "year": 2026, "category": "领域", "source": "来源" }`。会议不能包含 `cas`、`jcr` 或 `impactFactors` 期刊指标。

## 合并与显示

1. 优先按 ISSN 合并，其次按唯一的规范化完整名称。不同 ISSN 的同名期刊保留独立记录。内置目录中唯一的历史名称/别名也能映射到对应条目；有歧义时不推测。
2. 同一指标中的 `year + category + scope` 作为覆盖键。导入相同键会更新原值，不删除其他年度或学科。
3. 页面分别取 CCF、CAS、JCR、IF 的最新年度。例如 CAS 2025 可以同时显示 JCR/IF 2024。
4. 中科院优先显示大类；若只有小类则注明“小类”。悬停可查看该年度全部大小类。JCR 的多个学科分区并列展示。
5. 空数组/空列不清除已有值。要移除数据，可先备份 JSON、编辑备份，再清空并导入；清空不会删除内置 CCF 或期刊快照，无法借此删除内置值。
6. 无效分区、缺少年度/来源、会议误填期刊指标、CSV 列数错误等会阻止本次导入，原数据保留。

导入数据只保存在此扩展的 `chrome.storage.local`。浏览器自身有本地存储配额；超过配额时会显示保存失败并保留原数据。建议保留原始文件和 JSON 备份。
