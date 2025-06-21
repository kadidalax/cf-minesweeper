# 经典扫雷 - Classic Minesweeper

🎮 完美复刻Windows经典扫雷游戏，部署在Cloudflare Workers上

## 🚀 一键部署

想要拥有自己的扫雷游戏？点击下面的按钮，一键部署到您的 Cloudflare 账户：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kadidalax/cf-minesweeper)

> 🎯 **新手友好**：无需任何命令行操作，点击按钮即可自动完成所有配置和部署！

## 🎮 在线体验

### [立即开始游戏](https://cf-minesweeper.heartwopen.workers.dev)
<br><br>
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

### 🎯 一键部署（推荐新手）

1. **点击部署按钮**：点击上方的 "Deploy to Cloudflare" 按钮
2. **连接 GitHub**：授权 Cloudflare 访问您的 GitHub 账户
3. **连接 Cloudflare**：登录您的 Cloudflare 账户（没有账户会引导注册）
4. **配置项目**：
   - 设置仓库名称（默认：cf-minesweeper）
   - 设置 Worker 名称（默认：cf-minesweeper）
   - 系统会自动创建 KV 命名空间用于排行榜
5. **完成部署**：点击 "Deploy" 按钮，等待部署完成
6. **开始游戏**：部署完成后，您将获得专属的游戏链接！

> ✨ **全自动化**：KV 命名空间、Worker 配置、域名绑定全部自动完成，无需任何手动操作！

### 🛠️ 本地开发

1. 克隆项目
```bash
git clone https://github.com/your-username/cf-minesweeper.git
cd cf-minesweeper
```

2. 安装依赖
```bash
npm install
```

3. 本地运行
```bash
npm run dev
```

4. 访问 `http://localhost:8787` 开始游戏

### 🔧 手动部署到 Cloudflare Workers（高级用户）

> 💡 **提示**：如果您已经使用了上面的一键部署，可以跳过这个部分。以下步骤适合需要自定义配置的高级用户。

1. 登录Cloudflare账户
```bash
npx wrangler login
```

2. 创建KV命名空间
```bash
npx wrangler kv:namespace create "LEADERBOARD"
```

3. 更新wrangler.toml配置
将步骤2返回的KV命名空间ID复制到`wrangler.toml`文件中：
```toml
[[kv_namespaces]]
binding = "LEADERBOARD"
id = "your-actual-kv-namespace-id"
preview_id = "your-actual-preview-id"
```

4. 部署项目
```bash
npm run deploy
```

## 🛠️ 技术栈

- **前端**：HTML5, CSS3, JavaScript (ES6+)
- **运行环境**：Cloudflare Workers
- **数据存储**：Cloudflare KV
- **构建工具**：Wrangler CLI
- **部署平台**：Cloudflare Edge Network

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

### 🚀 部署和发布
- ✅ Cloudflare Workers部署
- ✅ 项目文档完善
- ✅ 代码优化和清理

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

MIT License
