# utils/

> **状态：CommonJS 副本已移除。** 运行时请使用 **`utils-es/`**。

自 v1.1.9 起，主服务与 Netlify Functions 仅依赖 `utils-es/*`。  
历史 `*.cjs` 双轨实现已删除，避免行为漂移。

| 请使用                  | 说明                    |
| ----------------------- | ----------------------- |
| `utils-es/bangumi.js`   | B站追番数据（分页拉全） |
| `utils-es/ics.js`       | ICS 生成                |
| `utils-es/ics-merge.js` | 外部 ICS 聚合           |
| `utils-es/*`            | 其余工具模块            |

模块说明见 `utils/CLAUDE.md`（文档中路径以 `utils-es` 为准）。
