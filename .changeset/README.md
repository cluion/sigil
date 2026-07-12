# Changesets

Sigil 用 `@changesets/cli` 管理版本與發布。七包以 `fixed` **同版號** 一起升。

## 指令

| 指令 | 用途 |
|------|------|
| `pnpm changeset` | 描述變更（在 `.changeset/` 產生 md） |
| `pnpm version-packages` | `changeset version`：bump 七包 `package.json` + CHANGELOG |
| `pnpm release` | `changeset publish`：發 npm |

## 注意

- **不要**手改 `SIGIL_CORE_VERSION`／`SIGIL_APP_VERSION`／`SIGIL_SHORTCODE_VERSION`。  
  它們在 **build／test** 時從各包 `package.json` 的 `version` 注入。  
- 完整流程見 `plan/RELEASING.md`（本機 gitignore）。  
- 純 MIT，不要求 CLA。
