# 待办事项

## 安全问题修复

- [x] 部分修复 braces 安全漏洞（通过 npm-force-resolutions 升级大部分依赖）
- [x] 重构 Netlify Functions 结构，为移除 netlify-lambda 做准备
- [x] 完全移除 netlify-lambda 依赖
- [x] 验证构建脚本正常工作
- [ ] 测试新的部署流程确保功能正常

## 迁移计划

由于 `netlify-lambda` 已废弃，我们需要迁移到更现代的替代方案：

### 短期目标
1. 调研 Netlify 官方推荐的替代方案：
   - 使用 Netlify CLI 直接部署
   - 使用 `@netlify/functions` 包

2. 修改项目结构以适应新的构建方式

3. 更新构建脚本和部署配置

4. 测试新的部署流程确保功能正常

### 长期目标
1. 完全移除 `netlify-lambda` 依赖 ✅
2. 使用现代的 Node.js 构建工具
3. 更新所有相关的依赖包到最新稳定版本
4. 实施更完善的依赖管理策略，避免类似的安全问题

### 具体步骤
1. 创建新的 Netlify Functions 目录结构 ✅
2. 将现有功能迁移到新的函数结构中 ✅
3. 更新 netlify.toml 配置文件 ✅
4. 更新构建脚本 ✅
5. 完全移除 netlify-lambda 依赖 ✅
6. 测试本地开发环境
7. 测试部署到 Netlify 的功能
8. 更新文档说明
9. 在确认无误后，将更改合并到 main 分支