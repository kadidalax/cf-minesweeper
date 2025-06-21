# 经典扫雷 - Classic Minesweeper

🎮 完美复刻Windows经典扫雷游戏，部署在Cloudflare Workers上

## 🚀 一键部署

想要拥有自己的扫雷游戏？点击下面的按钮，一键部署到您的 Cloudflare 账户：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kadidalax/cf-minesweeper)

> 🎯 **新手友好**：无需任何命令行操作，点击按钮即可自动完成所有配置和部署！

## 🎮 在线体验

### [立即开始游戏](https://mines.abo-vendor289.workers.dev)
<br>

![image](https://github.com/user-attachments/assets/bd1ba746-ed7e-4071-95fe-7ef6f2c582a0)

## ✨ 特性

### 🎮 核心游戏功能
- 🎯 **经典体验**：完美还原Windows扫雷的3D视觉效果和交互方式
- 🎮 **三种难度**：初级(9x9)、中级(16x16)、专家(30x16)

### 🎨 现代化界面
- 🌙 **深色主题设计**：护眼的深色配色方案
- ✨ **毛玻璃效果**：现代化的视觉设计
- 🎭 **精美动画**：流畅的交互动画和反馈

### 🏆 智能排行榜系统
- 📊 **实时排行榜**：支持三种难度的独立排行榜
- 🧠 **智能成绩对比**：自动对比历史最佳成绩
- 🛡️ **防重复上传**：智能过滤相同或更差的成绩
- 🎉 **个性化反馈**：新纪录庆祝、首次上传欢迎等

### ⚡ 技术特性
- 🚀 **零依赖**：纯HTML5 + CSS3 + JavaScript实现
- ☁️ **云端部署**：基于Cloudflare Workers，全球CDN加速
- 📱 **全设备支持**：从手机到大屏显示器，完美适配
- ⚡ **极速加载**：单文件部署，秒开体验

## 🎯 游戏规则

- **左键点击**：挖掘格子
- **右键点击**：标记/取消标记地雷
- **双键快速挖掘**：在已揭开的数字上同时按左右键，快速挖掘周围格子（当标记数等于数字时生效）
- **目标**：找出所有地雷而不踩到它们
- **数字**：表示周围8个格子中地雷的数量
- **首次点击保护**：第一次点击永远不会是地雷

## 🚀 快速开始

### 🎯 一键部署（推荐所有用户）

> 🎉 **2025年6月更新**：已修复依赖版本问题，现在可以完美部署！

**📋 部署前准备：**
- 拥有 GitHub 账户
- 拥有 Cloudflare 账户（免费即可）

**🚀 部署步骤：**

1. **点击部署按钮** 👆
   点击上方的 "Deploy to Cloudflare" 按钮

2. **授权 GitHub** 🔗
   - 登录您的 GitHub 账户
   - 授权 Cloudflare 访问您的仓库

3. **连接 Cloudflare** ☁️
   - 登录您的 Cloudflare 账户
   - 如果没有账户，系统会引导您免费注册

4. **配置项目** ⚙️
   ```
   仓库名称: cf-minesweeper (可自定义)
   Worker 名称: cf-minesweeper (可自定义)
   分支: main
   ```

5. **自动构建** 🔨
   - 系统自动安装 wrangler 4.20.5
   - 自动创建 KV 命名空间用于排行榜
   - 自动配置所有必要的环境变量

6. **部署完成** ✅
   - 获得专属的 `.workers.dev` 域名
   - 立即开始游戏！

7. **配置管理员密钥（可选）** 🔑
   如需使用管理员功能，请在 Cloudflare Dashboard 中设置：
   ```
   Workers & Pages → 选择你的 Worker → Settings → Environment Variables
   添加 Secret: ADMIN_KEY = [32位随机字符串]
   ```

> ✨ **完全自动化**：依赖安装、KV 命名空间创建、Worker 配置、域名绑定全部自动完成！
> 🛡️ **稳定可靠**：使用最新的 wrangler 4.20.5，确保构建成功率 100%
> 🔒 **安全提示**：ADMIN_KEY 为可选配置，仅管理员功能需要

### 🛠️ 本地开发

**📋 环境要求：**
- Node.js >= 18.0.0
- npm >= 8.0.0

**🔧 开发步骤：**

1. **克隆项目**
```bash
git clone https://github.com/kadidalax/cf-minesweeper.git
cd cf-minesweeper
```

2. **安装依赖**
```bash
# 推荐使用 npm ci 确保依赖版本一致
npm ci

# 或者使用 npm install
npm install
```

3. **本地运行**
```bash
# 启动开发服务器
npm run dev

# 或者本地预览模式
npm run preview
```

4. **访问游戏**
   打开浏览器访问 `http://localhost:8787` 开始游戏

> 💡 **开发提示**：使用 `npm ci` 而不是 `npm install` 可以确保与生产环境完全一致的依赖版本

### 🔧 手动部署到 Cloudflare Workers（高级用户）

> 💡 **适用场景**：需要自定义配置、使用自己的域名、或者进行二次开发的用户

**📋 部署要求：**
- Cloudflare 账户
- wrangler CLI 4.20.5+
- Node.js >= 18.0.0

**🚀 部署步骤：**

1. **登录 Cloudflare**
```bash
# 使用最新版本的 wrangler
npx wrangler@latest login
```

2. **创建 KV 命名空间**
```bash
# 创建生产环境 KV
npx wrangler kv:namespace create "LEADERBOARD"

# 创建预览环境 KV（可选）
npx wrangler kv:namespace create "LEADERBOARD" --preview
```

3. **配置 wrangler.toml**
```toml
name = "your-worker-name"
main = "src/optimized.js"
compatibility_date = "2025-06-20"

[[kv_namespaces]]
binding = "LEADERBOARD"
id = "your-actual-kv-namespace-id"
preview_id = "your-preview-kv-id"  # 可选

[env.production]
name = "your-production-worker-name"
```

4. **部署到 Cloudflare**
```bash
# 部署到开发环境
npm run deploy

# 或者直接使用 wrangler
npx wrangler deploy

# 部署到生产环境
npx wrangler deploy --env production
```

5. **配置环境变量（重要）**
```bash
# 生成管理员密钥（至少32位）
openssl rand -hex 32

# 设置管理员密钥
npx wrangler secret put ADMIN_KEY
# 输入上面生成的密钥
```

6. **验证部署**
```bash
# 查看部署状态
npx wrangler deployments list

# 查看 Worker 日志
npx wrangler tail
```

> 🔒 **安全提示**：`ADMIN_KEY` 用于管理员 API 访问，必须设置且至少 32 个字符
> 🎯 **自定义域名**：部署完成后，可以在 Cloudflare Dashboard 中绑定自定义域名
> 📊 **监控分析**：可以在 Cloudflare Analytics 中查看访问统计和性能数据

## 🔧 故障排除

### 🚨 常见部署问题

**❌ 问题：`npm ci` 依赖版本不匹配**
```
npm error Invalid: lock file's wrangler@3.x.x does not satisfy wrangler@^4.20.5
```
**✅ 解决方案：**
```bash
# 删除旧的依赖
rm -rf node_modules package-lock.json

# 重新安装最新依赖
npm install

# 验证 wrangler 版本
npx wrangler --version  # 应该显示 4.20.5+
```

**❌ 问题：KV 命名空间创建失败**
```
Error: You need to specify a KV namespace ID
```
**✅ 解决方案：**
- 确保已登录 Cloudflare：`npx wrangler login`
- 检查账户权限：需要 Workers 和 KV 权限
- 手动在 Cloudflare Dashboard 中创建 KV 命名空间

**❌ 问题：部署后游戏无法加载**
**✅ 解决方案：**
- 检查 Worker 日志：`npx wrangler tail`
- 确认 KV 命名空间绑定正确
- 验证 wrangler.toml 配置

**❌ 问题：管理员 API 返回 "服务配置错误"**
```
Error: ADMIN_KEY environment variable not set
```
**✅ 解决方案：**
```bash
# 生成强密钥（至少32位）
openssl rand -hex 32

# 设置环境变量
npx wrangler secret put ADMIN_KEY

# 或者在 Cloudflare Dashboard 中设置
# Workers & Pages → 选择 Worker → Settings → Environment Variables
```

### 📞 获取帮助

- 🐛 **Bug 报告**：[GitHub Issues](https://github.com/kadidalax/cf-minesweeper/issues)
- 💬 **讨论交流**：[GitHub Discussions](https://github.com/kadidalax/cf-minesweeper/discussions)
- 📖 **Cloudflare 文档**：[Workers 官方文档](https://developers.cloudflare.com/workers/)

## 🛠️ 技术栈

- **前端**：HTML5, CSS3, JavaScript (ES6+)
- **运行环境**：Cloudflare Workers Runtime
- **数据存储**：Cloudflare KV Storage
- **构建工具**：Wrangler CLI 4.20.5+
- **部署平台**：Cloudflare Edge Network (200+ 数据中心)
- **版本管理**：Git + GitHub
- **CI/CD**：Cloudflare 一键部署

## 🎨 设计亮点

### 🎨 视觉设计
- **深色主题**：现代化的深色配色方案，护眼舒适
- **毛玻璃效果**：backdrop-filter 实现的现代视觉效果
- **格子状态区分**：未挖掘(深色金属质感) vs 已挖掘(浅色纸质感)
- **精美动画**：地雷爆炸、旗帜挥舞、快速挖掘高亮等

### 🧠 智能系统
- **智能成绩对比**：自动检测新纪录、成绩下降、首次上传等情况
- **个性化反馈**：根据不同情况提供相应的庆祝或鼓励信息
- **防重复上传**：智能过滤相同或更差的成绩，保护排行榜质量

### ⚡ 技术实现
- **Fisher-Yates洗牌**：确保地雷随机分布
- **BFS自动展开**：点击空白区域自动展开相邻格子
- **智能响应式布局**：动态计算最佳格子大小，自适应屏幕尺寸
- **性能优化**：事件委托和批量DOM更新

## 📝 开发日志

### 🎯 核心功能开发
- ✅ 项目初始化和基础架构
- ✅ 经典UI界面实现
- ✅ 游戏逻辑核心算法
- ✅ 交互功能完整实现
- ✅ 双键快速挖掘功能

### 🎨 界面优化升级
- ✅ 深色主题重设计
- ✅ 毛玻璃效果和现代化视觉
- ✅ 格子状态区分度大幅提升
- ✅ 完美居中布局系统
- ✅ 智能边界保护机制

### 🏆 排行榜系统
- ✅ Cloudflare KV 数据存储
- ✅ 实时排行榜功能
- ✅ 智能成绩对比系统
- ✅ 个性化用户反馈

### ⚡ 用户体验优化
- ✅ 智能响应式布局系统
- ✅ 右键菜单完全禁用
- ✅ 移动端触摸支持
- ✅ 游戏状态管理和优化
- ✅ 精美模态框和动画效果

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

MIT License
