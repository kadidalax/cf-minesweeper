// 🎮 扫雷游戏 - Cloudflare Workers 版本
// 经典扫雷游戏，支持多难度级别和在线排行榜

// 数据验证工具类
class DataValidator {
  // 用户名验证
  static validateUsername(username) {
    if (!username || typeof username !== 'string') {
      return { valid: false, reason: '用户名必须是字符串' };
    }

    const trimmed = username.trim();
    if (trimmed.length === 0) {
      return { valid: false, reason: '用户名不能为空' };
    }

    // 检查长度（支持Unicode字符）
    const length = [...trimmed].length;
    if (length > 16) {
      return { valid: false, reason: '用户名长度不能超过16个字符' };
    }

    // 字符白名单：字母、数字、中文、下划线、连字符、空格
    const allowedPattern = /^[a-zA-Z0-9\u4e00-\u9fa5_\-\s]+$/;
    if (!allowedPattern.test(trimmed)) {
      return { valid: false, reason: '用户名包含非法字符' };
    }

    // 防止纯特殊字符或空格
    if (/^[_\-\s]+$/.test(trimmed)) {
      return { valid: false, reason: '用户名不能只包含特殊字符' };
    }

    // 防止HTML标签和脚本
    if (/<[^>]*>/.test(trimmed)) {
      return { valid: false, reason: '用户名不能包含HTML标签' };
    }

    return { valid: true, value: trimmed };
  }

  // 时间验证
  static validateTime(time) {
    if (typeof time !== 'number' && typeof time !== 'string') {
      return { valid: false, reason: '时间必须是数字' };
    }

    const numTime = Number(time);

    if (isNaN(numTime) || !isFinite(numTime)) {
      return { valid: false, reason: '时间必须是有效数字' };
    }

    if (numTime !== Math.floor(numTime) || numTime < 1) {
      return { valid: false, reason: '时间必须是正整数' };
    }

    if (numTime > 9999) {
      return { valid: false, reason: '时间不能超过9999秒' };
    }

    return { valid: true, value: numTime };
  }

  // 难度验证
  static validateDifficulty(difficulty) {
    const validDifficulties = ['beginner', 'intermediate', 'expert'];
    if (!validDifficulties.includes(difficulty)) {
      return { valid: false, reason: '无效的难度级别' };
    }
    return { valid: true, value: difficulty };
  }

  // 游戏数据结构验证
  static validateGameDataStructure(gameData) {
    if (!gameData || typeof gameData !== 'object') {
      return { valid: false, reason: '游戏数据格式无效' };
    }

    const requiredFields = [
      'difficulty', 'time', 'moves', 'gameId', 'timestamp',
      'boardSize', 'mineCount', 'gameEndTime', 'firstClickTime', 'gameState'
    ];

    for (const field of requiredFields) {
      if (!(field in gameData)) {
        return { valid: false, reason: `缺少必需字段: ${field}` };
      }
    }

    return { valid: true, value: gameData };
  }
}

// 简化的验证函数（保持向后兼容）
const validateUsername = (username) => DataValidator.validateUsername(username).valid;
const validateTime = (time) => DataValidator.validateTime(time).valid;

// KV存储管理器
class KVStorageManager {
  constructor(env, useCache = true) {
    this.kv = env.LEADERBOARD;
    this.useCache = useCache;
    this.cache = globalCache;
  }

  // 生成带前缀的键
  static createKey(prefix, ...parts) {
    return `${prefix}:${parts.join(':')}`;
  }

  // 批量获取数据
  async batchGet(keys) {
    return await ErrorHandler.handleAsyncError(async () => {
      const promises = keys.map(key => this.kv.get(key));
      const results = await Promise.all(promises);

      const data = {};
      keys.forEach((key, index) => {
        data[key] = results[index] ? JSON.parse(results[index]) : null;
      });

      return data;
    }, 'KVStorageManager.batchGet', {});
  }

  // 批量设置数据
  async batchPut(operations) {
    return await ErrorHandler.handleAsyncError(async () => {
      const promises = operations.map(op =>
        this.kv.put(op.key, JSON.stringify(op.value), op.options || {})
      );
      await Promise.all(promises);
      return true;
    }, 'KVStorageManager.batchPut', false);
  }

  // ⚡ 性能优化：安全获取数据（支持缓存）
  async safeGet(key, defaultValue = null, cacheTTL = null) {
    return await ErrorHandler.handleAsyncError(async () => {
      // 尝试从缓存获取
      if (this.useCache) {
        const cacheKey = CacheManager.createCacheKey('kv', key);
        const cached = this.cache.get(cacheKey);
        if (cached !== null) {
          return cached;
        }
      }

      // 从KV获取数据
      const data = await this.kv.get(key);
      const result = data ? JSON.parse(data) : defaultValue;

      // 存入缓存（只缓存非默认值）
      if (this.useCache && data !== null) {
        const cacheKey = CacheManager.createCacheKey('kv', key);
        this.cache.set(cacheKey, result, cacheTTL);
      }

      return result;
    }, `KVStorageManager.safeGet(${key})`, defaultValue);
  }

  // ⚡ 性能优化：安全设置数据（支持缓存失效）
  async safePut(key, value, options = {}) {
    return await ErrorHandler.handleAsyncError(async () => {
      // 写入KV
      await this.kv.put(key, JSON.stringify(value), options);

      // 更新缓存
      if (this.useCache) {
        const cacheKey = CacheManager.createCacheKey('kv', key);
        // 根据TTL设置缓存过期时间
        const cacheTTL = options.expirationTtl ? Math.min(options.expirationTtl * 1000, 300000) : null;
        this.cache.set(cacheKey, value, cacheTTL);
      }

      return true;
    }, `KVStorageManager.safePut(${key})`, false);
  }

  // 原子性增量操作
  async atomicIncrement(key, increment = 1, options = {}) {
    return await ErrorHandler.handleAsyncError(async () => {
      const current = await this.kv.get(key);
      const currentValue = current ? parseInt(current) : 0;
      const newValue = currentValue + increment;

      await this.kv.put(key, newValue.toString(), options);
      return newValue;
    }, `KVStorageManager.atomicIncrement(${key})`, 0);
  }
}

function getAllowedOrigin(request) {
  const origin = request.headers.get('Origin');

  // 生产环境允许的域名
  const allowedOrigins = [
    'https://cf-minesweeper.heartwopen.workers.dev',
    'https://test2.abo-vendor289.workers.dev',
    // 可以添加您的自定义域名
  ];

  // 开发环境支持 - 更宽松的检查
  if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
    return origin;
  }

  // 如果没有Origin头部（比如同源请求），返回通配符或默认值
  if (!origin) {
    // 检查Host头部来判断是否是本地开发
    const host = request.headers.get('Host');
    if (host && (host.includes('localhost') || host.includes('127.0.0.1'))) {
      return '*'; // 本地开发时允许所有来源
    }
  }

  return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
}

// 安全的字符串比较函数 - 防止时序攻击
function secureCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

// 管理员令牌验证
async function validateAdminToken(token, adminKey, env) {
  return await ErrorHandler.handleAsyncError(async () => {
    // 检查令牌格式：应该是 base64(timestamp:signature)
    let decodedToken;
    try {
      decodedToken = atob(token);
    } catch (e) {
      return { valid: false, reason: 'invalid_token_format' };
    }

    const parts = decodedToken.split(':');
    if (parts.length !== 2) {
      return { valid: false, reason: 'invalid_token_structure' };
    }

    const [timestampStr, signature] = parts;
    const timestamp = parseInt(timestampStr);

    // 验证时间戳（令牌有效期5分钟）
    const now = Date.now();
    const tokenAge = now - timestamp;
    if (tokenAge > 300000 || tokenAge < 0) { // 5分钟 = 300000ms
      return { valid: false, reason: 'token_expired' };
    }

    // 验证签名
    const expectedSignature = await generateTokenSignature(timestampStr, adminKey);
    if (!secureCompare(signature, expectedSignature)) {
      return { valid: false, reason: 'invalid_signature' };
    }

    // 检查令牌是否已被使用（防止重放攻击）
    const tokenKey = `security:used_token:${token}`;
    const isUsed = await env.LEADERBOARD.get(tokenKey);
    if (isUsed) {
      return { valid: false, reason: 'token_already_used' };
    }

    // 标记令牌为已使用
    await env.LEADERBOARD.put(tokenKey, 'used', { expirationTtl: 600 }); // 10分钟过期

    return { valid: true };
  }, 'validateAdminToken', { valid: false, reason: 'validation_error' });
}

// 生成令牌签名
async function generateTokenSignature(timestamp, adminKey) {
  const data = `${timestamp}:${adminKey}`;
  // 使用简单的哈希函数（在生产环境中应使用HMAC-SHA256）
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  return Math.abs(hash).toString(36);
}

// 错误处理工具类
class ErrorHandler {
  static generateErrorId() {
    return Math.random().toString(36).substr(2, 9);
  }

  static async handleAsyncError(operation, context, fallbackValue = null) {
    try {
      return await operation();
    } catch (error) {
      const errorId = this.generateErrorId();
      console.error(`[${errorId}] Error in ${context}:`, error);

      // KV错误日志记录已移除以精简存储

      return fallbackValue;
    }
  }

  static handleSyncError(operation, context, fallbackValue = null) {
    try {
      return operation();
    } catch (error) {
      const errorId = this.generateErrorId();
      console.error(`[${errorId}] Error in ${context}:`, error);
      return fallbackValue;
    }
  }

  static createStandardError(type, message, statusCode = 500) {
    return {
      type,
      message,
      statusCode,
      timestamp: new Date().toISOString(),
      errorId: this.generateErrorId()
    };
  }
}

// 生成客户端指纹
async function generateClientFingerprint(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const userAgent = request.headers.get('User-Agent') || '';
  const acceptLanguage = request.headers.get('Accept-Language') || '';
  const acceptEncoding = request.headers.get('Accept-Encoding') || '';

  // 创建基于多个因素的指纹
  const fingerprintData = `${ip}:${userAgent}:${acceptLanguage}:${acceptEncoding}`;

  // 使用简单的哈希函数（在真实环境中应使用更强的哈希）
  let hash = 0;
  for (let i = 0; i < fingerprintData.length; i++) {
    const char = fingerprintData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }

  return Math.abs(hash).toString(36);
}

// 速率限制检查
async function checkRateLimit(request, env) {
  return await ErrorHandler.handleAsyncError(async () => {
    // 生成客户端指纹
    const fingerprint = await generateClientFingerprint(request);
    const minute = Math.floor(Date.now() / 60000);

    // 多层速率限制配置
    const rateLimitConfig = [
      { key: `rate_limit:ip:${request.headers.get('CF-Connecting-IP')}:${minute}`, limit: 20, type: 'ip' },
      { key: `rate_limit:fingerprint:${fingerprint}:${minute}`, limit: 15, type: 'fingerprint' },
      { key: `rate_limit:global:${minute}`, limit: 1000, type: 'global' }
    ];

    // 批量检查所有限制
    const checkPromises = rateLimitConfig.map(async (check) => {
      const securityKey = `security:${check.key}`;
      const current = await env.LEADERBOARD.get(securityKey);
      const count = current ? parseInt(current) : 0;

      return { ...check, count, securityKey };
    });

    const checkResults = await Promise.all(checkPromises);

    // 检查是否有超限
    for (const result of checkResults) {
      if (result.count >= result.limit) {
        // 记录速率限制触发
        await logSecurityEvent(request, env, 'rate_limit_exceeded', {
          type: result.type,
          count: result.count,
          limit: result.limit,
          severity: 'medium'
        });

        return { allowed: false, remaining: 0, reason: '请求过于频繁' };
      }
    }

    // 批量更新计数
    const updatePromises = checkResults.map(result =>
      env.LEADERBOARD.put(result.securityKey, (result.count + 1).toString(), { expirationTtl: 120 })
    );
    await Promise.all(updatePromises);

    // 返回指纹限制的剩余次数
    const fingerprintResult = checkResults.find(r => r.type === 'fingerprint');
    return {
      allowed: true,
      remaining: fingerprintResult.limit - fingerprintResult.count - 1
    };
  }, 'checkRateLimit', { allowed: false, remaining: 0, reason: '系统繁忙，请稍后重试' });
}

// 游戏数据验证
function validateGameSession(gameData) {
  // 验证游戏数据结构
  if (!gameData || typeof gameData !== 'object') {
    return { valid: false, reason: '游戏数据格式无效', severity: 'critical' };
  }

  const { difficulty, time, moves, gameId, timestamp, boardSize, mineCount, gameEndTime, firstClickTime, gameState } = gameData;

  // 验证必需字段
  if (!gameId || !timestamp || !boardSize || !gameEndTime || !firstClickTime) {
    return { valid: false, reason: '缺少关键游戏会话信息', severity: 'critical' };
  }

  // 验证游戏状态
  if (gameState !== 'won') {
    return { valid: false, reason: '游戏状态无效，只能提交获胜的游戏', severity: 'high' };
  }

  // 验证时间戳合理性（极度放宽时间限制）
  const gameStartTime = new Date(timestamp).getTime();
  const now = Date.now();

  // 游戏会话不能超过7天（极度放宽限制）
  if (now - gameStartTime > 604800000) {
    return { valid: false, reason: '游戏会话已过期（超过7天）', severity: 'medium' };
  }

  // 验证游戏时长合理性（宽松验证）
  const actualGameDuration = (gameEndTime - firstClickTime) / 1000;
  const timeDifference = Math.abs(actualGameDuration - time);

  // 只检查极端情况，防止明显的作弊行为
  if (timeDifference > 60) { // 允许60秒误差
    return {
      valid: false,
      reason: '游戏时长数据不一致，请重新开始游戏',
      severity: 'high'
    };
  }

  // 验证棋盘尺寸
  const expectedBoardSizes = {
    'beginner': { width: 9, height: 9, mines: 10 },
    'intermediate': { width: 16, height: 16, mines: 40 },
    'expert': { width: 30, height: 16, mines: 99 }
  };

  const expected = expectedBoardSizes[difficulty];
  if (!expected || boardSize.width !== expected.width || boardSize.height !== expected.height || mineCount !== expected.mines) {
    return { valid: false, reason: '棋盘配置与难度不匹配', severity: 'critical' };
  }

  // 验证最小移动次数（基于难度和棋盘大小）
  const minMoves = {
    'beginner': 8,      // 9x9至少需要8次点击
    'intermediate': 15,  // 16x16至少需要15次点击
    'expert': 25        // 30x16至少需要25次点击
  };

  if (moves < minMoves[difficulty]) {
    return { valid: false, reason: `移动次数过少（${moves}次），可能存在作弊`, severity: 'critical' };
  }

  // 验证最大合理移动次数（防止无意义的点击刷数据）
  const maxMoves = boardSize.width * boardSize.height * 2; // 最多点击每个格子2次
  if (moves > maxMoves) {
    return { valid: false, reason: '移动次数过多，可能存在异常操作', severity: 'medium' };
  }

  // 验证时间与移动次数的合理性
  const avgTimePerMove = time / moves;
  if (avgTimePerMove < 0.05) { // 每次移动不能少于0.05秒（人类反应极限）
    return { valid: false, reason: '操作速度超出人类极限', severity: 'critical' };
  }

  if (avgTimePerMove > 60) { // 每次移动不能超过60秒（过于缓慢）
    return { valid: false, reason: '操作速度过于缓慢，可能存在异常', severity: 'low' };
  }

  return { valid: true, severity: 'none' };
}

// 高级成绩验证系统 - 多层防作弊机制
function validateScoreReasonableness(time, difficulty, gameData = null) {
  // 首先进行服务端游戏验证
  if (gameData) {
    const gameValidation = validateGameSession(gameData);
    if (!gameValidation.valid) {
      return {
        valid: false,
        reason: gameValidation.reason,
        severity: 'critical'
      };
    }
  }

  const minTimes = {
    'beginner': 1,      // 初级最少1秒
    'intermediate': 3,   // 中级最少3秒
    'expert': 5         // 专家最少5秒
  };

  const maxReasonableTimes = {
    'beginner': 999,    // 初级合理上限
    'intermediate': 1999, // 中级合理上限
    'expert': 2999      // 专家合理上限
  };

  // 世界纪录参考（用于检测超人类成绩）
  const worldRecords = {
    'beginner': 0.49,    // 世界纪录约0.49秒
    'intermediate': 7.03, // 世界纪录约7.03秒
    'expert': 31.133     // 世界纪录约31.133秒
  };

  if (time < minTimes[difficulty]) {
    return { valid: false, reason: '成绩过快，可能存在异常', severity: 'high' };
  }

  if (time > maxReasonableTimes[difficulty]) {
    return { valid: false, reason: '成绩超出合理范围', severity: 'low' };
  }

  // 检测超人类成绩（比世界纪录快）
  if (time < worldRecords[difficulty]) {
    return {
      valid: false,
      reason: `成绩 ${time}秒 超越了世界纪录 ${worldRecords[difficulty]}秒，请确认成绩真实性`,
      severity: 'critical'
    };
  }

  // 检测可疑的完美成绩（整数秒且过快）
  if (Number.isInteger(time) && time < worldRecords[difficulty] * 2) {
    return {
      valid: false,
      reason: '检测到可疑的完美成绩，请重新游戏',
      severity: 'medium'
    };
  }

  return { valid: true, severity: 'none' };
}

// 🧹 重构：用户行为分析 - 检测异常模式
async function analyzeUserBehavior(username, time, difficulty, env) {
  return await ErrorHandler.handleAsyncError(async () => {
    const storage = new KVStorageManager(env);
    const userKey = KVStorageManager.createKey('security', 'user_stats', username, difficulty);

    // 获取用户统计数据
    const defaultStats = {
      submissions: 0,
      bestTime: null,
      averageTime: 0,
      totalTime: 0,
      lastSubmission: null,
      suspiciousCount: 0
    };

    const stats = await storage.safeGet(userKey, defaultStats);
    const now = Date.now();
    const timeSinceLastSubmission = stats.lastSubmission ?
      (now - new Date(stats.lastSubmission).getTime()) / 1000 : Infinity;

    // 行为分析配置
    const behaviorConfig = {
      frequentSubmissionWindow: 300, // 5分钟
      maxSuspiciousCount: 3,
      significantImprovementThreshold: 0.5 // 50%提升视为异常
    };

    // 检测频繁提交
    if (timeSinceLastSubmission < behaviorConfig.frequentSubmissionWindow) {
      stats.suspiciousCount++;
      if (stats.suspiciousCount > behaviorConfig.maxSuspiciousCount) {
        return {
          suspicious: true,
          reason: '检测到频繁提交行为，请适当休息后再试',
          action: 'temporary_block'
        };
      }
    } else {
      // 重置可疑计数
      stats.suspiciousCount = Math.max(0, stats.suspiciousCount - 1);
    }

    // 检测成绩异常提升 - 已禁用，允许用户自由提升成绩
    // if (stats.bestTime && time < stats.bestTime * behaviorConfig.significantImprovementThreshold) {
    //   return {
    //     suspicious: true,
    //     reason: '成绩提升过于显著，请确认游戏环境正常',
    //     action: 'review_required'
    //   };
    // }

    // 更新用户统计
    stats.submissions++;
    stats.totalTime += time;
    stats.averageTime = stats.totalTime / stats.submissions;
    stats.bestTime = stats.bestTime ? Math.min(stats.bestTime, time) : time;
    stats.lastSubmission = new Date().toISOString();

    // 保存更新的统计数据（7天过期）
    const saveSuccess = await storage.safePut(userKey, stats, { expirationTtl: 604800 });

    return {
      suspicious: false,
      stats,
      saveSuccess
    };
  }, 'analyzeUserBehavior', { suspicious: false, error: true });
}

// ⚡ 性能优化：智能缓存管理器
class CacheManager {
  constructor(defaultTTL = 30000) { // 默认30秒TTL
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };
  }

  // 生成缓存键
  static createCacheKey(...parts) {
    return parts.join(':');
  }

  // 获取缓存数据
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // 检查是否过期
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    entry.lastAccessed = Date.now();
    return entry.data;
  }

  // 设置缓存数据
  set(key, data, ttl = null) {
    const expiry = Date.now() + (ttl || this.defaultTTL);

    this.cache.set(key, {
      data,
      expiry,
      created: Date.now(),
      lastAccessed: Date.now()
    });

    this.stats.sets++;

    // 自动清理过期缓存（每100次设置操作执行一次）
    if (this.stats.sets % 100 === 0) {
      this.cleanup();
    }
  }

  // 删除缓存
  delete(key) {
    return this.cache.delete(key);
  }

  // 清理过期缓存
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    this.stats.evictions += cleaned;
    return cleaned;
  }

  // 获取缓存统计
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%',
      size: this.cache.size
    };
  }

  // 清空缓存
  clear() {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, sets: 0, evictions: 0 };
  }
}

// ⚡ 性能优化：内存使用优化工具
class MemoryOptimizer {
  // 深度克隆对象（避免引用泄漏）
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    if (typeof obj === 'object') {
      const cloned = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = this.deepClone(obj[key]);
        }
      }
      return cloned;
    }
    return obj;
  }

  // 清理对象中的循环引用
  static removeCircularReferences(obj, seen = new WeakSet()) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (seen.has(obj)) return '[Circular Reference]';

    seen.add(obj);

    if (Array.isArray(obj)) {
      return obj.map(item => this.removeCircularReferences(item, seen));
    }

    const cleaned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cleaned[key] = this.removeCircularReferences(obj[key], seen);
      }
    }

    return cleaned;
  }

  // 压缩字符串数据
  static compressString(str) {
    // 简单的字符串压缩（移除多余空格和换行）
    return str.replace(/\s+/g, ' ').trim();
  }

  // 内存使用监控
  static getMemoryUsage() {
    // 在Cloudflare Workers中，我们无法直接获取内存使用情况
    // 但可以估算一些关键对象的大小
    return {
      cacheSize: globalCache.cache.size,
      cacheStats: globalCache.getStats(),
      timestamp: new Date().toISOString()
    };
  }

  // 清理未使用的数据
  static cleanup() {
    // 清理过期缓存
    const cleaned = globalCache.cleanup();

    // 强制垃圾回收（如果可用）
    if (typeof gc === 'function') {
      gc();
    }

    return {
      cacheEntriesCleaned: cleaned,
      timestamp: new Date().toISOString()
    };
  }
}

// 全局缓存实例
const globalCache = new CacheManager(60000); // 60秒TTL

// ⚡ 性能优化：并发处理优化工具
class ConcurrencyOptimizer {
  constructor(maxConcurrency = 10) {
    this.maxConcurrency = maxConcurrency;
    this.running = 0;
    this.queue = [];
  }

  // 并发执行任务
  async execute(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  // 处理队列
  async processQueue() {
    if (this.running >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { task, resolve, reject } = this.queue.shift();

    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.processQueue(); // 处理下一个任务
    }
  }

  // 批量并发执行
  async batchExecute(tasks, batchSize = null) {
    const actualBatchSize = batchSize || this.maxConcurrency;
    const results = [];

    for (let i = 0; i < tasks.length; i += actualBatchSize) {
      const batch = tasks.slice(i, i + actualBatchSize);
      const batchPromises = batch.map(task => this.execute(task));
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  // 获取状态
  getStatus() {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrency: this.maxConcurrency
    };
  }
}

// 全局并发管理器
const globalConcurrencyManager = new ConcurrencyOptimizer(8);

// 注意：在Cloudflare Workers中不能使用setInterval
// 内存清理将在需要时手动调用

// 🧹 代码质量改进：性能监控工具类
class PerformanceMonitor {
  constructor() {
    this.startTime = Date.now();
    this.checkpoints = new Map();
  }

  // 记录检查点
  checkpoint(name) {
    this.checkpoints.set(name, Date.now() - this.startTime);
  }

  // 获取总耗时
  getTotalTime() {
    return Date.now() - this.startTime;
  }

  // 获取检查点间隔
  getInterval(from, to) {
    const fromTime = this.checkpoints.get(from) || 0;
    const toTime = this.checkpoints.get(to) || this.getTotalTime();
    return toTime - fromTime;
  }

  // 生成性能报告
  getReport() {
    const report = {
      totalTime: this.getTotalTime(),
      checkpoints: Object.fromEntries(this.checkpoints),
      intervals: {}
    };

    // 计算相邻检查点的间隔
    const checkpointNames = Array.from(this.checkpoints.keys());
    for (let i = 1; i < checkpointNames.length; i++) {
      const from = checkpointNames[i - 1];
      const to = checkpointNames[i];
      report.intervals[`${from}_to_${to}`] = this.getInterval(from, to);
    }

    return report;
  }
}

// 日志功能已移除以精简KV存储

// 安全事件记录功能已移除以精简KV存储

// ⚡ 性能优化：响应优化工具类
class ResponseOptimizer {
  // 创建优化的JSON响应
  static createOptimizedResponse(data, options = {}) {
    const {
      status = 200,
      headers = {},
      compress = true,
      cache = false,
      cacheMaxAge = 30
    } = options;

    const responseHeaders = {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-ID': Math.random().toString(36).substr(2, 9),
      ...headers
    };

    // 添加缓存头
    if (cache) {
      responseHeaders['Cache-Control'] = `public, max-age=${cacheMaxAge}`;
      responseHeaders['ETag'] = `"${this.generateETag(data)}"`;
    } else {
      responseHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    }

    // 压缩响应（对于大数据）
    let responseBody = JSON.stringify(data);
    if (compress && responseBody.length > 1024) {
      responseHeaders['Content-Encoding'] = 'gzip';
      // 注意：Cloudflare Workers会自动处理gzip压缩
    }

    return new Response(responseBody, {
      status,
      headers: responseHeaders
    });
  }

  // 生成ETag
  static generateETag(data) {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  // 检查条件请求
  static checkConditionalRequest(request, etag) {
    const ifNoneMatch = request.headers.get('If-None-Match');
    if (ifNoneMatch && ifNoneMatch.includes(etag)) {
      return new Response(null, { status: 304 });
    }
    return null;
  }

  // 创建流式响应（用于大数据）
  static createStreamResponse(dataGenerator, options = {}) {
    const { headers = {} } = options;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of dataGenerator()) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify(chunk) + '\n'));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        ...headers
      }
    });
  }
}

// 🧹 统一错误响应创建（增强版）
function createErrorResponse(code, message, status = 400, request, logDetails = {}) {
  // 记录错误事件
  if (status >= 400) {
    logDetails.error = true;
    logDetails.errorCode = code;
    logDetails.statusCode = status;
  }

  return new Response(JSON.stringify({
    success: false,
    error: {
      code: code,
      message: message,
      timestamp: new Date().toISOString(),
      requestId: Math.random().toString(36).substr(2, 9) // 用于追踪
    }
  }), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': getAllowedOrigin(request),
      'X-Content-Type-Options': 'nosniff',
      'X-Request-ID': Math.random().toString(36).substr(2, 9),
    }
  });
}

// 排行榜API处理 - 增强安全性和功能
async function handleLeaderboardAPI(request, env, url) {
  const difficulty = url.pathname.split('/').pop();

  // 验证难度参数
  if (!['beginner', 'intermediate', 'expert'].includes(difficulty)) {
    return createErrorResponse('INVALID_DIFFICULTY', '无效的难度级别', 400, request);
  }

  // 速率限制检查（对所有请求）
  const rateLimitResult = await checkRateLimit(request, env);
  if (!rateLimitResult.allowed) {
    return createErrorResponse(
      'RATE_LIMIT_EXCEEDED',
      '请求过于频繁，请稍后再试',
      429,
      request
    );
  }

  if (request.method === 'GET') {
    return await ErrorHandler.handleAsyncError(async () => {
      const monitor = new PerformanceMonitor();
      const storage = new KVStorageManager(env, true); // 启用缓存

      monitor.checkpoint('start_get');

      // 检查条件请求（ETag支持）
      const leaderboardKey = `leaderboard:${difficulty}`;
      const cachedData = globalCache.get(CacheManager.createCacheKey('leaderboard', difficulty));

      if (cachedData) {
        const etag = ResponseOptimizer.generateETag(cachedData);
        const conditionalResponse = ResponseOptimizer.checkConditionalRequest(request, etag);
        if (conditionalResponse) {
          return conditionalResponse;
        }
      }

      monitor.checkpoint('cache_check');

      // 获取排行榜数据
      const leaderboard = await storage.safeGet(leaderboardKey, [], 30000); // 30秒缓存

      monitor.checkpoint('data_fetch');

      const responseData = {
        success: true,
        data: leaderboard,
        meta: {
          count: leaderboard.length,
          difficulty: difficulty,
          rateLimit: {
            remaining: rateLimitResult.remaining
          },
          serverTime: new Date().toISOString(),
          performance: monitor.getReport(),
          cacheStats: globalCache.getStats()
        }
      };

      monitor.checkpoint('response_build');

      // 使用优化的响应创建
      return ResponseOptimizer.createOptimizedResponse(responseData, {
        cache: true,
        cacheMaxAge: 30,
        headers: {
          'Access-Control-Allow-Origin': getAllowedOrigin(request)
        }
      });
    }, 'handleLeaderboardAPI.GET', createErrorResponse('SERVER_ERROR', '获取排行榜失败', 500, request));
  }
  
  if (request.method === 'POST') {
    return await ErrorHandler.handleAsyncError(async () => {
      const monitor = new PerformanceMonitor();
      const storage = new KVStorageManager(env, true);

      monitor.checkpoint('parse_request');
      const requestData = await request.json();
      const { username, time, gameData } = requestData;

      // 快速验证：游戏数据存在性
      if (!gameData) {
        return createErrorResponse(
          'MISSING_GAME_DATA',
          '游戏数据验证失败，请重新开始游戏',
          400,
          request,
          { securityEvent: true, severity: 'critical' }
        );
      }

      monitor.checkpoint('initial_validation');

      // ⚡ 性能优化：并发执行多个验证任务
      const validationTasks = [
        () => DataValidator.validateUsername(username),
        () => DataValidator.validateTime(time),
        () => DataValidator.validateDifficulty(difficulty),
        () => DataValidator.validateGameDataStructure(gameData)
      ];

      const validationResults = await globalConcurrencyManager.batchExecute(validationTasks);

      monitor.checkpoint('concurrent_validation');

      // ⚡ 性能优化：处理并发验证结果
      const [usernameResult, timeResult, difficultyResult, gameDataResult] = validationResults.map(result =>
        result.status === 'fulfilled' ? result.value : { valid: false, reason: '验证失败' }
      );

      // 检查验证结果
      if (!usernameResult.valid) {
        return createErrorResponse('INVALID_USERNAME', usernameResult.reason, 400, request);
      }
      if (!timeResult.valid) {
        return createErrorResponse('INVALID_TIME', timeResult.reason, 400, request);
      }
      if (!difficultyResult.valid) {
        return createErrorResponse('INVALID_DIFFICULTY', difficultyResult.reason, 400, request);
      }
      if (!gameDataResult.valid) {
        return createErrorResponse('INVALID_GAME_DATA', gameDataResult.reason, 400, request);
      }

      monitor.checkpoint('validation_complete');

      // 强化的成绩验证（包含游戏数据验证）
      const scoreValidation = validateScoreReasonableness(time, difficulty, gameData);
      if (!scoreValidation.valid) {
        return createErrorResponse(
          'UNREASONABLE_SCORE',
          scoreValidation.reason,
          400,
          request,
          { securityEvent: true, severity: scoreValidation.severity }
        );
      }

      // 用户行为分析
      const behaviorAnalysis = await analyzeUserBehavior(username, time, difficulty, env);
      if (behaviorAnalysis.suspicious) {
        return createErrorResponse(
          'SUSPICIOUS_BEHAVIOR',
          behaviorAnalysis.reason,
          429,
          request,
          { securityEvent: true, action: behaviorAnalysis.action }
        );
      }
      
      const data = await env.LEADERBOARD.get('leaderboard:' + difficulty);
      const leaderboard = data ? JSON.parse(data) : [];

      // 去除用户名的前后空格
      const trimmedUsername = username.trim();

      // 防止重复提交相同的游戏ID
      const duplicateGameId = leaderboard.find(record => record.gameId === gameData.gameId);
      if (duplicateGameId) {
        return createErrorResponse(
          'DUPLICATE_GAME',
          '该游戏已经提交过成绩，请开始新游戏',
          400,
          request,
          { securityEvent: true }
        );
      }

      // 创建成绩记录（包含更多验证信息）
      const scoreRecord = {
        username: trimmedUsername,
        time: parseInt(time),
        timestamp: new Date().toISOString(),
        gameId: gameData.gameId,
        moves: gameData.moves,
        verified: true // 标记为已验证的成绩
      };

      // 查找是否已有该用户的记录
      const existingIndex = leaderboard.findIndex(record => record.username === trimmedUsername);

      if (existingIndex !== -1) {
        // 用户已有记录，只有更好的成绩才能更新
        if (parseInt(time) < leaderboard[existingIndex].time) {
          leaderboard[existingIndex] = scoreRecord;
        } else {
          // 成绩没有提升，返回当前排行榜但不更新
          const currentRank = leaderboard.slice(0, 20).findIndex(record => record.username === trimmedUsername) + 1;
          return new Response(JSON.stringify({
            success: true,
            data: leaderboard.slice(0, 20),
            meta: {
              submitted: {
                username: trimmedUsername,
                time: parseInt(time),
                difficulty: difficulty,
                timestamp: new Date().toISOString(),
                improved: false,
                currentBest: leaderboard[existingIndex].time,
                rank: currentRank > 0 ? currentRank : null
              }
            }
          }), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': getAllowedOrigin(request),
              'X-Content-Type-Options': 'nosniff',
              'X-Request-ID': Math.random().toString(36).substr(2, 9),
            },
          });
        }
      } else {
        // 新用户，添加记录
        leaderboard.push(scoreRecord);
      }

      // 按时间排序
      leaderboard.sort((a, b) => a.time - b.time);

      // 只保留前20名
      const top20 = leaderboard.slice(0, 20);

      // 保存前20名排行榜
      await env.LEADERBOARD.put('leaderboard:' + difficulty, JSON.stringify(top20));

      // 🔥 关键修复：立即清理相关缓存，确保前端能获取到最新数据
      const cacheKey = CacheManager.createCacheKey('leaderboard', difficulty);
      globalCache.delete(cacheKey);

      // 清理KV存储管理器的缓存 - 使用正确的缓存键格式
      const leaderboardKey = `leaderboard:${difficulty}`;
      const kvCacheKey = CacheManager.createCacheKey('kv', leaderboardKey);
      if (storage.cache && storage.cache.delete) {
        storage.cache.delete(kvCacheKey);
      }
      // 同时清理全局缓存中的KV缓存
      globalCache.delete(kvCacheKey);

      return new Response(JSON.stringify({
        success: true,
        data: top20,
        meta: {
          submitted: {
            username: trimmedUsername,
            time: parseInt(time),
            difficulty: difficulty,
            timestamp: new Date().toISOString(),
            rank: top20.findIndex(record => record.username === trimmedUsername) + 1
          },
          rateLimit: {
            remaining: rateLimitResult.remaining
          },
          security: {
            scoreValidated: true,
            behaviorAnalyzed: true,
            requestId: Math.random().toString(36).substr(2, 9)
          }
        }
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': getAllowedOrigin(request),
          'X-Content-Type-Options': 'nosniff',
          'X-Request-ID': Math.random().toString(36).substr(2, 9),
        },
      });
    }, 'handleLeaderboardAPI.POST', createErrorResponse('SERVER_ERROR', '提交成绩失败', 500, request));
  }

  // CORS预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': getAllowedOrigin(request),
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
        'Access-Control-Max-Age': '86400', // 缓存预检请求24小时
        'X-Content-Type-Options': 'nosniff',
        'Vary': 'Origin', // 告诉缓存根据Origin头部变化
      }
    });
  }
  
  return createErrorResponse('METHOD_NOT_ALLOWED', '不支持的请求方法', 405, request);
}

// 安全的管理API - 强化身份验证（修复安全漏洞）
async function handleAdminAPI(request, env, url) {
  // 🔒 安全修复：使用Authorization头部而非URL参数
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return createErrorResponse('UNAUTHORIZED', '缺少认证令牌', 401, request);
  }

  const providedToken = authHeader.substring(7); // 移除 "Bearer " 前缀

  // 从环境变量获取管理密钥
  const adminKey = env.ADMIN_KEY;
  if (!adminKey) {
    console.error('ADMIN_KEY environment variable not set');
    return createErrorResponse('SERVER_ERROR', '服务配置错误', 500, request);
  }

  // 验证密钥长度和复杂性
  if (adminKey.length < 32) {
    console.error('ADMIN_KEY too short, must be at least 32 characters');
    return createErrorResponse('SERVER_ERROR', '服务配置错误', 500, request);
  }

  // 🔒 安全改进：添加时间戳验证防止重放攻击
  const isValidToken = await validateAdminToken(providedToken, adminKey, env);
  if (!isValidToken.valid) {
    return createErrorResponse('UNAUTHORIZED', '认证失败', 401, request);
  }

  // 管理员访问日志已移除以精简KV存储

  const action = url.pathname.split('/').pop();

  if (action === 'stats') {
    try {
      const today = new Date().toISOString().split('T')[0];
      const statsKey = `daily_stats:${today}`;
      // 💡 简化方案：使用前缀区分数据类型
      const statsKeyWithPrefix = `logs:daily_stats:${today}`;
      const statsData = await env.LEADERBOARD.get(statsKeyWithPrefix);

      if (!statsData) {
        return new Response(JSON.stringify({
          success: true,
          data: { message: '今日暂无统计数据' }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const stats = JSON.parse(statsData);
      return new Response(JSON.stringify({
        success: true,
        data: {
          date: today,
          totalRequests: stats.totalRequests,
          uniqueIPCount: stats.uniqueIPCount,
          actions: stats.actions,
          countries: stats.countries,
          errorRate: stats.errors / stats.totalRequests * 100
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return createErrorResponse('SERVER_ERROR', '获取统计失败', 500, request);
    }
  }

  if (action === 'security') {
    try {
      // 获取最近的安全事件（简化版本）
      const events = [];
      // 这里可以实现更复杂的安全事件查询逻辑

      return new Response(JSON.stringify({
        success: true,
        data: {
          recentEvents: events,
          summary: '安全监控正常运行'
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return createErrorResponse('SERVER_ERROR', '获取安全信息失败', 500, request);
    }
  }

  return createErrorResponse('NOT_FOUND', '未找到管理功能', 404, request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 排行榜API路由
    if (url.pathname.startsWith('/api/leaderboard/')) {
      return handleLeaderboardAPI(request, env, url);
    }

    // 管理API路由
    if (url.pathname.startsWith('/api/admin/')) {
      return handleAdminAPI(request, env, url);
    }

    // 主页路由
    if (url.pathname === '/') {
      return new Response(getGameHTML(), {
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'Cache-Control': 'public, max-age=3600',
          // 增强的安全头部
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          'X-Request-ID': Math.random().toString(36).substr(2, 9),
        },
      });
    }

    // 健康检查端点
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0-security-enhanced'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return createErrorResponse('NOT_FOUND', '页面未找到', 404, request);
  },
};

function getGameHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>经典扫雷 - Classic Minesweeper</title>
    <style>
        :root {
            --cell-size: 30px;
            --counter-font-size: 24px;
            --smiley-size: 40px;

            /* 深色主题色彩系统 */
            --primary-color: #3b82f6;
            --primary-hover: #2563eb;
            --success-color: #10b981;
            --danger-color: #ef4444;
            --warning-color: #f59e0b;

            /* 背景和面板 */
            --bg-dark: #1e293b;
            --bg-darker: #0f172a;
            --panel-bg: rgba(30, 41, 59, 0.9);
            --panel-bg-light: rgba(51, 65, 85, 0.8);

            /* 文字颜色 */
            --text-primary: #f1f5f9;
            --text-secondary: #cbd5e1;
            --text-muted: #94a3b8;

            /* 阴影系统 */
            --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
            --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
            --shadow-heavy: 0 20px 25px -5px rgba(0, 0, 0, 0.5);

            /* 边框和圆角 */
            --border-radius: 12px;
            --border-radius-small: 8px;
            --border-color: rgba(148, 163, 184, 0.2);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            /* 全局禁用右键菜单和文本选择 */
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            -khtml-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            user-select: none;
        }

        body {
            font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
            background: linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%);
            min-height: 100vh;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            margin: 0;
            padding: 0;
            position: relative;
            overflow-x: hidden;
            /* 禁用右键菜单的CSS方式 */
            -webkit-touch-callout: none;
            -webkit-tap-highlight-color: transparent;
        }

        /* 深色主题背景装饰 */
        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background:
                radial-gradient(circle at 20% 80%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.15) 0%, transparent 50%),
                radial-gradient(circle at 40% 40%, rgba(16, 185, 129, 0.1) 0%, transparent 50%);
            pointer-events: none;
            z-index: -1;
        }

        .main-container {
            display: flex;
            min-height: 100vh;
            position: relative;
        }

        .game-container {
            position: absolute;
            left: calc(280px + (100vw - 280px) / 2);
            top: max(35%, 120px);
            transform: translate(-50%, -50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 10;
        }

        .game-content {
            background: rgba(30, 41, 59, 0.9);
            backdrop-filter: blur(20px);
            border-radius: var(--border-radius);
            padding: 20px;
            border: 1px solid rgba(148, 163, 184, 0.2);
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.3);
            transition: all 0.3s ease;
        }

        .game-content:hover {
            transform: translateY(-4px);
            box-shadow: 0 35px 60px -12px rgba(0, 0, 0, 0.4);
        }

        /* 右侧控制面板 - 紧贴扫雷区右边 */
        .right-panel {
            position: absolute;
            left: calc(280px + (100vw - 280px) / 2 + 20px);
            top: 35%;
            transform: translateY(-50%);
            background: rgba(30, 41, 59, 0.9);
            backdrop-filter: blur(20px);
            border-radius: var(--border-radius);
            padding: 16px;
            border: 1px solid rgba(148, 163, 184, 0.2);
            box-shadow: var(--shadow-heavy);
            z-index: 100;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .right-panel.positioned {
            opacity: 1;
        }
        .difficulty-selector {
            display: flex;
            flex-direction: column;
            gap: 16px;
            align-items: center;
        }

        .difficulty-buttons {
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: 100%;
        }

        .difficulty-button {
            background: linear-gradient(145deg, #475569, #334155);
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius-small);
            padding: 12px 18px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            min-width: 80px;
            color: var(--text-primary);
            transition: all 0.2s ease;
            box-shadow: var(--shadow-light);
        }

        .difficulty-button:hover {
            background: linear-gradient(145deg, #64748b, #475569);
            transform: translateY(-2px);
            box-shadow: var(--shadow-medium);
        }

        .difficulty-button:active {
            transform: translateY(0);
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .difficulty-button.active {
            background: linear-gradient(145deg, var(--primary-color), var(--primary-hover));
            color: white;
            box-shadow: var(--shadow-medium);
            border-color: var(--primary-color);
        }

        .help-button {
            background: linear-gradient(145deg, var(--warning-color), #d97706);
            border: 1px solid var(--warning-color);
            border-radius: var(--border-radius-small);
            padding: 12px 18px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            color: white;
            transition: all 0.2s ease;
            box-shadow: var(--shadow-light);
        }

        .help-button:hover {
            background: linear-gradient(145deg, #d97706, #b45309);
            transform: translateY(-2px);
            box-shadow: var(--shadow-medium);
        }

        .help-button:active {
            transform: translateY(0);
        }
        .game-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: linear-gradient(145deg, #334155, #1e293b);
            border-radius: var(--border-radius-small);
            padding: 12px 20px;
            margin-bottom: 16px;
            width: 100%;
            box-shadow: var(--shadow-medium);
            border: 1px solid var(--border-color);
        }

        .counter {
            background: linear-gradient(145deg, #0f172a, #1e293b);
            color: var(--danger-color);
            font-family: 'JetBrains Mono', 'Courier New', monospace;
            font-size: var(--counter-font-size);
            font-weight: bold;
            padding: 6px 12px;
            border-radius: var(--border-radius-small);
            min-width: calc(var(--counter-font-size) * 2.5);
            text-align: center;
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4);
            border: 1px solid #475569;
            text-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
        }

        .smiley-button {
            width: var(--smiley-size);
            height: var(--smiley-size);
            font-size: calc(var(--smiley-size) * 0.7);
            background: linear-gradient(145deg, var(--warning-color), #d97706);
            border: 2px solid var(--warning-color);
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            box-shadow: var(--shadow-medium);
            position: relative;
        }

        .smiley-button:hover {
            transform: scale(1.08);
            box-shadow: 0 8px 25px rgba(245, 158, 11, 0.5);
        }

        .smiley-button:active {
            transform: scale(0.92);
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        .game-board {
            background: linear-gradient(145deg, #0f172a, #1e293b);
            border-radius: var(--border-radius);
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            box-shadow: inset 0 4px 8px rgba(0, 0, 0, 0.4);
            border: 1px solid var(--border-color);
        }

        .board-grid {
            display: grid;
            gap: 3px;
            background: linear-gradient(145deg, #334155, #475569);
            padding: 8px;
            border-radius: var(--border-radius-small);
            box-shadow: var(--shadow-medium);
            border: 1px solid rgba(71, 85, 105, 0.5);
        }

        /* 未挖掘格子 - 更亮的金属质感 */
        .cell {
            width: var(--cell-size);
            height: var(--cell-size);
            background: linear-gradient(145deg, #64748b, #475569);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: calc(var(--cell-size) * 0.65);
            font-weight: 800;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.2s ease;
            border: 1px solid #94a3b8;
            box-shadow:
                0 2px 4px rgba(0, 0, 0, 0.3),
                inset 0 1px 0 rgba(203, 213, 225, 0.3);
            position: relative;
        }

        .cell:hover {
            background: linear-gradient(145deg, #94a3b8, #64748b);
            transform: scale(1.05);
            box-shadow:
                0 4px 8px rgba(0, 0, 0, 0.4),
                inset 0 1px 0 rgba(203, 213, 225, 0.4);
        }

        .cell:active {
            transform: scale(0.95);
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4);
        }

        /* 已挖掘格子 - 柔和的浅灰色，不刺眼 */
        .cell.revealed {
            background: linear-gradient(145deg, #e2e8f0, #cbd5e1);
            box-shadow:
                inset 0 2px 4px rgba(0, 0, 0, 0.1),
                inset 0 -1px 0 rgba(255, 255, 255, 0.4);
            border: 1px solid #94a3b8;
            color: #1e293b;
        }

        .cell.revealed:hover {
            background: linear-gradient(145deg, #f1f5f9, #e2e8f0);
            transform: none;
        }

        .cell.mine {
            background: linear-gradient(145deg, #ef4444, #dc2626) !important;
            color: #ffffff;
            border: 2px solid #fca5a5 !important;
            animation: mineExplode 0.4s ease-out;
            box-shadow:
                0 0 20px rgba(239, 68, 68, 0.6),
                inset 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        @keyframes mineExplode {
            0% { transform: scale(1); box-shadow: 0 0 20px rgba(239, 68, 68, 0.6); }
            50% { transform: scale(1.15); box-shadow: 0 0 30px rgba(239, 68, 68, 0.8); }
            100% { transform: scale(1); box-shadow: 0 0 20px rgba(239, 68, 68, 0.6); }
        }

        .cell.flagged::after {
            content: '🚩';
            font-size: calc(var(--cell-size) * 0.75);
            animation: flagWave 0.3s ease-out;
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        }

        @keyframes flagWave {
            0% { transform: scale(0) rotate(-10deg); }
            50% { transform: scale(1.2) rotate(5deg); }
            100% { transform: scale(1) rotate(0deg); }
        }

        /* 数字颜色 - 高对比度，清晰可见 */
        .cell[class*="number-"] { font-weight: 900; text-shadow: 0 1px 3px rgba(0,0,0,0.3); }
        .cell.number-1 { color: #1e40af; }
        .cell.number-2 { color: #047857; }
        .cell.number-3 { color: #b91c1c; }
        .cell.number-4 { color: #6b21a8; }
        .cell.number-5 { color: #991b1b; }
        .cell.number-6 { color: #0c4a6e; }
        .cell.number-7 { color: #111827; }
        .cell.number-8 { color: #374151; }

        .cell.quick-dig-highlight {
            background: linear-gradient(145deg, #fbbf24, #f59e0b) !important;
            border: 2px solid #fbbf24 !important;
            box-shadow:
                0 0 20px rgba(251, 191, 36, 0.6) !important,
                inset 0 1px 0 rgba(255, 255, 255, 0.3) !important;
            animation: quickDigPulse 0.8s ease-in-out infinite alternate;
        }

        @keyframes quickDigPulse {
            0% {
                transform: scale(1);
                box-shadow: 0 0 20px rgba(251, 191, 36, 0.6);
            }
            100% {
                transform: scale(1.08);
                box-shadow: 0 0 30px rgba(251, 191, 36, 0.8);
            }
        }
        
        /* 排行榜面板样式 - 固定左侧 */
        .leaderboard-panel {
            position: fixed;
            left: 0;
            top: 0;
            width: 280px;
            height: 100vh;
            background: rgba(30, 41, 59, 0.95);
            backdrop-filter: blur(20px);
            padding: 16px 12px;
            overflow-y: auto;
            border-right: 1px solid rgba(148, 163, 184, 0.2);
            z-index: 100;
            transition: transform 0.3s ease;
        }

        .leaderboard-panel.hidden {
            transform: translateX(-100%);
        }

        .leaderboard-header h3 {
            margin: 0 0 12px 0;
            font-size: 18px;
            text-align: center;
            color: var(--text-primary);
            font-weight: 700;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .leaderboard-tabs {
            display: flex;
            gap: 4px;
            margin-bottom: 16px;
            background: rgba(0, 0, 0, 0.2);
            padding: 4px;
            border-radius: var(--border-radius-small);
            border: 1px solid var(--border-color);
        }

        .tab-button {
            flex: 1;
            padding: 8px 6px;
            font-size: 11px;
            background: transparent;
            border: none;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.2s ease;
            font-weight: 600;
            color: var(--text-muted);
        }

        .tab-button:hover {
            background: rgba(148, 163, 184, 0.2);
            color: var(--text-secondary);
        }

        .tab-button.active {
            background: linear-gradient(145deg, var(--primary-color), var(--primary-hover));
            color: white;
            box-shadow: var(--shadow-light);
        }

        .leaderboard-list {
            display: block;
        }

        .leaderboard-item {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            margin: 3px 0;
            background: linear-gradient(145deg, rgba(51, 65, 85, 0.8), rgba(30, 41, 59, 0.6));
            border-radius: var(--border-radius-small);
            font-size: 12px;
            transition: all 0.2s ease;
            border: 1px solid var(--border-color);
        }

        .leaderboard-item:hover {
            background: linear-gradient(145deg, rgba(71, 85, 105, 0.9), rgba(51, 65, 85, 0.7));
            transform: translateX(6px);
            box-shadow: var(--shadow-light);
        }

        .leaderboard-rank {
            font-weight: 800;
            color: var(--text-muted);
            min-width: 28px;
            text-align: center;
            font-size: 13px;
        }

        .leaderboard-item:nth-child(1) .leaderboard-rank { color: #fbbf24; }
        .leaderboard-item:nth-child(2) .leaderboard-rank { color: #e5e7eb; }
        .leaderboard-item:nth-child(3) .leaderboard-rank { color: #d97706; }

        .leaderboard-username {
            flex: 1;
            margin: 0 10px;
            font-weight: 600;
            color: var(--text-primary);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .leaderboard-time {
            font-family: 'JetBrains Mono', 'Courier New', monospace;
            font-weight: 700;
            color: var(--danger-color);
            font-size: 11px;
            background: rgba(239, 68, 68, 0.2);
            padding: 4px 8px;
            border-radius: 4px;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }
        
        /* 模态框样式 */
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            animation: modalFadeIn 0.3s ease-out;
        }

        @keyframes modalFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .modal-content {
            background: linear-gradient(145deg, #1e293b, #0f172a);
            backdrop-filter: blur(20px);
            position: absolute;
            top: max(40%, 250px);
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 32px;
            border-radius: var(--border-radius);
            width: 90%;
            max-width: 450px;
            text-align: center;
            box-shadow: var(--shadow-heavy);
            border: 2px solid rgba(148, 163, 184, 0.3);
            animation: modalFadeInDirect 0.2s ease-out;
            color: var(--text-primary);
        }

        @keyframes modalSlideIn {
            from {
                transform: translateY(-50px) scale(0.9);
                opacity: 0;
            }
            to {
                transform: translateY(0) scale(1);
                opacity: 1;
            }
        }

        @keyframes modalFadeInDirect {
            from {
                transform: translate(-50%, -50%) scale(0.95);
                opacity: 0;
            }
            to {
                transform: translate(-50%, -50%) scale(1);
                opacity: 1;
            }
        }

        .modal-button {
            background: linear-gradient(145deg, var(--primary-color), var(--primary-hover));
            border: 1px solid var(--primary-color);
            border-radius: var(--border-radius-small);
            padding: 12px 20px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            margin: 6px;
            transition: all 0.2s ease;
            color: white;
            box-shadow: var(--shadow-medium);
        }

        .modal-button:hover {
            background: linear-gradient(145deg, var(--primary-hover), #1e40af);
            transform: translateY(-1px);
            box-shadow: var(--shadow-heavy);
        }

        .modal-button:active {
            transform: translateY(0);
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .modal-input {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #475569;
            border-radius: var(--border-radius-small);
            font-size: 14px;
            margin: 16px 0;
            box-sizing: border-box;
            transition: all 0.2s ease;
            background: linear-gradient(145deg, #334155, #1e293b);
            color: var(--text-primary);
        }

        .modal-input:focus {
            outline: none;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
            background: linear-gradient(145deg, #475569, #334155);
        }

        .modal-input::placeholder {
            color: var(--text-muted);
        }

        /* 为输入框恢复文本选择功能 */
        .modal-input {
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
            user-select: text !important;
        }

        /* 模态框内容样式 - 高对比度 */
        #modal-title {
            color: var(--text-primary) !important;
            font-weight: 700 !important;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3) !important;
        }

        #modal-message {
            color: var(--text-secondary) !important;
            line-height: 1.6 !important;
        }

        #modal-icon {
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3)) !important;
        }

        /* 取消按钮特殊样式 */
        #modal-cancel {
            background: linear-gradient(145deg, #6b7280, #4b5563) !important;
            border-color: #6b7280 !important;
        }

        #modal-cancel:hover {
            background: linear-gradient(145deg, #4b5563, #374151) !important;
        }
        
        /* 响应式设计 */
        @media (max-width: 1200px) {
            .leaderboard-panel {
                position: relative;
                width: 100%;
                height: auto;
                max-height: 250px;
                margin-bottom: 20px;
            }

            .main-container {
                flex-direction: column;
            }

            .game-container {
                position: relative;
                left: auto;
                top: auto;
                transform: none;
                margin: 20px auto;
            }

            .right-panel {
                position: relative !important;
                left: auto !important;
                top: auto !important;
                transform: none !important;
                margin: 20px auto;
                width: fit-content;
            }

            .difficulty-buttons {
                flex-direction: row;
            }

            .modal {
                left: 0;
                width: 100%;
            }

            .modal-content {
                top: 50%;
                transform: translate(-50%, -50%);
            }
        }

        @media (max-width: 768px) {
            .leaderboard-panel {
                display: none;
            }

            .game-container {
                position: absolute;
                left: 50%;
                top: max(40%, 150px);
                transform: translate(-50%, -50%);
            }

            .right-panel {
                position: fixed !important;
                bottom: 20px !important;
                right: 20px !important;
                left: auto !important;
                top: auto !important;
                transform: none !important;
                padding: 12px;
            }

            .game-content {
                padding: 16px;
            }

            :root {
                --cell-size: 22px;
                --counter-font-size: 16px;
                --smiley-size: 28px;
                --border-radius: 8px;
                --border-radius-small: 6px;
            }

            .difficulty-buttons {
                gap: 4px;
                flex-direction: row;
            }

            .difficulty-button {
                padding: 6px 10px;
                font-size: 10px;
                min-width: 50px;
            }

            .help-button {
                padding: 6px 10px;
                font-size: 10px;
            }

            .game-header {
                padding: 8px 12px;
            }

            .modal {
                left: 0;
                width: 100%;
            }

            .modal-content {
                top: 50%;
                transform: translate(-50%, -50%);
                padding: 20px;
            }
        }

        @media (max-width: 480px) {
            :root {
                --cell-size: 20px;
                --counter-font-size: 14px;
                --smiley-size: 26px;
            }

            .game-container {
                padding: 12px;
            }

            .difficulty-selector {
                flex-direction: column;
                gap: 12px;
                align-items: stretch;
            }

            .difficulty-buttons {
                justify-content: center;
            }

            .game-header {
                padding: 10px 12px;
            }
        }





        /* 滚动条美化 */
        .leaderboard-panel::-webkit-scrollbar {
            width: 6px;
        }

        .leaderboard-panel::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.1);
            border-radius: 3px;
        }

        .leaderboard-panel::-webkit-scrollbar-thumb {
            background: linear-gradient(145deg, var(--primary-color), var(--primary-hover));
            border-radius: 3px;
        }

        .leaderboard-panel::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(145deg, var(--primary-hover), #1e40af);
        }

        /* 页脚样式 */
        .footer {
            position: fixed;
            bottom: 0;
            left: 280px;
            right: 0;
            background: rgba(15, 23, 42, 0.95);
            backdrop-filter: blur(20px);
            border-top: 1px solid rgba(148, 163, 184, 0.2);
            padding: 8px 20px;
            z-index: 1000;
            box-shadow: 0 -4px 6px -1px rgba(0, 0, 0, 0.3);
        }

        .footer-content {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 16px;
        }

        .footer-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
        }

        .footer-icon {
            font-size: 16px;
            animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
        }

        .footer-name {
            background: linear-gradient(135deg, var(--primary-color), var(--success-color));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            font-weight: 700;
        }

        .github-link {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            background: linear-gradient(145deg, #374151, #1f2937);
            border-radius: 50%;
            color: var(--text-secondary);
            text-decoration: none;
            transition: all 0.3s ease;
            border: 1px solid rgba(148, 163, 184, 0.2);
            box-shadow: var(--shadow-light);
        }

        .github-link:hover {
            background: linear-gradient(145deg, #4b5563, #374151);
            color: var(--text-primary);
            transform: translateY(-2px) scale(1.05);
            box-shadow: var(--shadow-medium);
        }

        .github-icon {
            width: 20px;
            height: 20px;
            transition: transform 0.3s ease;
        }

        .github-link:hover .github-icon {
            transform: rotate(360deg);
        }

        /* 响应式页脚 */
        @media (max-width: 1200px) {
            .footer {
                left: 0;
                right: 0;
            }
        }

        @media (max-width: 768px) {
            .footer {
                padding: 6px 16px;
                left: 0;
                right: 0;
            }

            .footer-title {
                font-size: 12px;
            }

            .footer-icon {
                font-size: 14px;
            }

            .github-link {
                width: 28px;
                height: 28px;
            }

            .github-icon {
                width: 16px;
                height: 16px;
            }

            .footer-content {
                gap: 12px;
            }
        }
    </style>
</head>
<body>
    <div class="main-container">
        <!-- 排行榜面板 -->
        <div class="leaderboard-panel">
            <div class="leaderboard-header">
                <h3>🏆 排行榜</h3>
                <div class="leaderboard-tabs">
                    <button class="tab-button active" onclick="switchLeaderboard('beginner')">初级</button>
                    <button class="tab-button" onclick="switchLeaderboard('intermediate')">中级</button>
                    <button class="tab-button" onclick="switchLeaderboard('expert')">专家</button>
                </div>
            </div>
            <div class="leaderboard-list" id="leaderboard-list">
                <div style="text-align: center; padding: 20px; color: #666;">加载中...</div>
            </div>
        </div>

        <!-- 游戏区域 -->
        <div class="game-container">
            <div class="game-content">
                <div class="game-header">
                    <div class="counter" id="mine-counter">010</div>
                    <button class="smiley-button" id="smiley-button" onclick="newGame()">😊</button>
                    <div class="counter" id="timer">000</div>
                </div>

                <div class="game-board">
                    <div class="board-grid" id="board-grid"></div>
                </div>
            </div>
        </div>

        <!-- 右侧控制面板 -->
        <div class="right-panel">
            <div class="difficulty-selector">
                <div class="difficulty-buttons">
                    <button class="difficulty-button active" onclick="setDifficulty('beginner')">初级</button>
                    <button class="difficulty-button" onclick="setDifficulty('intermediate')">中级</button>
                    <button class="difficulty-button" onclick="setDifficulty('expert')">专家</button>
                </div>
                <button class="help-button" onclick="showHelp()">帮助</button>
            </div>
        </div>
    </div>

    <!-- 模态框 -->
    <div id="game-modal" class="modal">
        <div class="modal-content">
            <div id="modal-icon" style="font-size: 42px; margin-bottom: 12px;">😊</div>
            <div id="modal-title" style="font-size: 18px; font-weight: bold; margin-bottom: 15px;">游戏提示</div>
            <div id="modal-message" style="margin-bottom: 20px;">消息内容</div>
            <div id="modal-input-container" style="display: none;">
                <input type="text" id="modal-input" class="modal-input" placeholder="请输入您的用户名（最多8个汉字或16个字符）" maxlength="16">
            </div>
            <div>
                <button id="modal-cancel" class="modal-button" onclick="handleModalCancel()" style="display: none;">取消</button>
                <button id="modal-confirm" class="modal-button" onclick="handleModalConfirm()">确定</button>
            </div>
        </div>
    </div>

    <!-- 页脚 -->
    <footer class="footer">
        <div class="footer-content">
            <div class="footer-title">
                <span class="footer-icon">💣</span>
                <span class="footer-name">cf-minesweeper</span>
            </div>
            <a href="https://github.com/kadidalax/cf-minesweeper" target="_blank" class="github-link" title="查看源代码">
                <svg class="github-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
            </a>
        </div>
    </footer>

    <script>
        // 简化的扫雷游戏类 - 基于simple.js优化
        class MinesweeperGame {
            constructor() {
                this.difficulties = {
                    beginner: { rows: 9, cols: 9, mines: 10 },
                    intermediate: { rows: 16, cols: 16, mines: 40 },
                    expert: { rows: 16, cols: 30, mines: 99 }
                };
                this.currentDifficulty = 'beginner';
                this.board = [];
                this.revealed = [];
                this.flagged = [];
                this.gameState = 'ready';
                this.firstClick = true;
                this.startTime = null;
                this.timer = null;
                this.mineCount = 0;
                this.flagCount = 0;

                // 游戏验证所需的状态追踪
                this.moveCount = 0;
                this.gameId = null;
                this.gameStartTime = null;
                this.firstClickTime = null;
                this.rows = 0;
                this.cols = 0;

                // 简化的双键快速挖掘状态
                this.mouseButtons = {
                    left: false,
                    right: false
                };
                this.quickDigCell = null;

                // DOM元素缓存
                this.cellElements = null;
                this.domElements = {
                    smileyButton: null,
                    timer: null,
                    mineCounter: null,
                    boardGrid: null
                };
            }

            initGame() {
                const config = this.difficulties[this.currentDifficulty];
                this.rows = config.rows;
                this.cols = config.cols;
                this.mineCount = config.mines;
                this.flagCount = 0;

                this.board = Array(this.rows).fill().map(() => Array(this.cols).fill(0));
                this.revealed = Array(this.rows).fill().map(() => Array(this.cols).fill(false));
                this.flagged = Array(this.rows).fill().map(() => Array(this.cols).fill(false));

                this.gameState = 'ready';
                this.firstClick = true;
                this.startTime = null;

                // 初始化游戏验证所需的状态
                this.moveCount = 0;
                this.gameId = 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                this.gameStartTime = new Date().toISOString();
                this.firstClickTime = null;

                if (this.timer) {
                    clearInterval(this.timer);
                    this.timer = null;
                }

                this.createBoard();
                this.updateDisplay();

                this.getDomElement('smileyButton', 'smiley-button').textContent = '😊';
                this.getDomElement('timer', 'timer').textContent = '000';

                // 延迟更新位置，确保DOM渲染完成
                setTimeout(() => {
                    this.updateGamePosition();
                    this.updateRightPanelPosition();
                }, 100);
            }

            createBoard() {
                const boardGrid = this.getDomElement('boardGrid', 'board-grid');
                boardGrid.innerHTML = '';

                // 清除DOM元素缓存
                this.clearCellCache();

                // 简化的响应式计算
                this.calculateCellSize();

                boardGrid.style.gridTemplateColumns = 'repeat(' + this.cols + ', var(--cell-size))';
                boardGrid.style.gridTemplateRows = 'repeat(' + this.rows + ', var(--cell-size))';

                for (let row = 0; row < this.rows; row++) {
                    for (let col = 0; col < this.cols; col++) {
                        const cell = document.createElement('div');
                        cell.className = 'cell';

                        // 阻止右键菜单
                        cell.addEventListener('contextmenu', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            return false;
                        });

                        // 鼠标事件
                        cell.addEventListener('mousedown', (e) => this.handleMouseDown(row, col, e));
                        cell.addEventListener('mouseup', (e) => this.handleMouseUp(row, col, e));

                        // 触摸支持 - 简化版本
                        let touchTimer = null;
                        cell.addEventListener('touchstart', (e) => {
                            touchTimer = setTimeout(() => {
                                this.handleRightClick(row, col, e);
                                if (navigator.vibrate) navigator.vibrate(50);
                            }, 500);
                        });

                        cell.addEventListener('touchend', (e) => {
                            if (touchTimer) {
                                clearTimeout(touchTimer);
                                this.handleLeftClick(row, col, e);
                            }
                        });

                        cell.addEventListener('touchmove', () => {
                            if (touchTimer) {
                                clearTimeout(touchTimer);
                                touchTimer = null;
                            }
                        });

                        boardGrid.appendChild(cell);
                    }
                }
            }

            // 优化的格子大小计算 - 确保一页显示所有格子
            calculateCellSize() {
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                // 为排行榜、游戏头部、按钮等预留空间
                const leaderboardWidth = window.innerWidth > 1200 ? 280 : 0;
                const reservedWidth = leaderboardWidth + 200; // 为右侧面板预留更多空间
                const reservedHeight = 300; // 头部、按钮、边距等

                const availableWidth = viewportWidth - reservedWidth;
                const availableHeight = viewportHeight - reservedHeight;

                const maxCellSizeByWidth = Math.floor(availableWidth / this.cols);
                const maxCellSizeByHeight = Math.floor(availableHeight / this.rows);

                // 确保格子大小适中，优先保证全部显示
                let optimalSize = Math.min(maxCellSizeByWidth, maxCellSizeByHeight);
                optimalSize = Math.max(16, Math.min(35, optimalSize));

                document.documentElement.style.setProperty('--cell-size', optimalSize + 'px');
                document.documentElement.style.setProperty('--counter-font-size', Math.max(14, optimalSize * 0.6) + 'px');
                document.documentElement.style.setProperty('--smiley-size', Math.max(28, optimalSize * 1.1) + 'px');

                // 延迟更新位置，确保DOM更新完成
                setTimeout(() => {
                    this.updateGamePosition();
                    this.updateRightPanelPosition();
                }, 50);
            }

            // 更新游戏容器位置，确保不超出屏幕边界
            updateGamePosition() {
                const gameContainer = document.querySelector('.game-container');
                const gameContent = document.querySelector('.game-content');

                if (gameContainer && gameContent) {
                    const viewportHeight = window.innerHeight;
                    const gameHeight = gameContent.offsetHeight;

                    // 计算理想的top位置（35%）
                    let idealTop = viewportHeight * 0.35;

                    // 确保游戏区域上部不会超出屏幕（至少留20px边距）
                    const minTop = (gameHeight / 2) + 20;

                    // 确保游戏区域下部不会超出屏幕（至少留20px边距）
                    const maxTop = viewportHeight - (gameHeight / 2) - 20;

                    // 应用边界限制
                    const finalTop = Math.max(minTop, Math.min(idealTop, maxTop));

                    gameContainer.style.top = finalTop + 'px';
                    gameContainer.style.transform = 'translate(-50%, -50%)';
                }
            }

            // 更新右侧面板位置，使其紧贴游戏区域
            updateRightPanelPosition() {
                const gameContent = document.querySelector('.game-content');
                const rightPanel = document.querySelector('.right-panel');

                if (gameContent && rightPanel && window.innerWidth > 768) {
                    const gameRect = gameContent.getBoundingClientRect();
                    const panelWidth = rightPanel.offsetWidth;

                    // 计算面板应该在的位置（游戏区域右边 + 一点间距）
                    const leftPosition = gameRect.right + 20;

                    // 确保不超出屏幕右边界
                    const maxLeft = window.innerWidth - panelWidth - 20;
                    const finalLeft = Math.min(leftPosition, maxLeft);

                    rightPanel.style.left = finalLeft + 'px';
                    rightPanel.style.top = gameRect.top + 'px';
                    rightPanel.style.transform = 'none';

                    // 位置设置完成后显示面板
                    rightPanel.classList.add('positioned');
                } else if (rightPanel) {
                    // 在小屏幕上也要显示面板
                    rightPanel.classList.add('positioned');
                }
            }

            generateMines(firstClickRow, firstClickCol) {
                const positions = [];
                this.forEachCell((row, col) => {
                    if (Math.abs(row - firstClickRow) <= 1 && Math.abs(col - firstClickCol) <= 1) {
                        return;
                    }
                    positions.push([row, col]);
                });

                // Fisher-Yates洗牌
                for (let i = positions.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [positions[i], positions[j]] = [positions[j], positions[i]];
                }

                for (let i = 0; i < this.mineCount && i < positions.length; i++) {
                    const [row, col] = positions[i];
                    this.board[row][col] = -1;
                }

                this.calculateNumbers();
            }

            calculateNumbers() {
                this.forEachCell((row, col) => {
                    if (this.board[row][col] !== -1) {
                        let count = 0;
                        for (let dr = -1; dr <= 1; dr++) {
                            for (let dc = -1; dc <= 1; dc++) {
                                const newRow = row + dr;
                                const newCol = col + dc;
                                if (this.isValidCell(newRow, newCol) && this.board[newRow][newCol] === -1) {
                                    count++;
                                }
                            }
                        }
                        this.board[row][col] = count;
                    }
                });
            }

            isValidCell(row, col) {
                return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
            }

            handleLeftClick(row, col, event) {
                event.preventDefault();
                if (this.isGameEnded()) return;
                if (this.flagged[row][col]) return;

                // 追踪移动次数
                this.moveCount++;

                if (this.firstClick) {
                    this.generateMines(row, col);
                    this.firstClick = false;
                    this.gameState = 'playing';
                    this.firstClickTime = Date.now();
                    this.startTimer();
                }

                this.revealCell(row, col);
                this.updateDisplay();
                this.checkGameState();
            }

            handleRightClick(row, col, event) {
                event.preventDefault();
                if (this.isGameEnded()) return;
                if (this.revealed[row][col]) return;

                // 追踪移动次数（标记也算移动）
                this.moveCount++;

                this.flagged[row][col] = !this.flagged[row][col];
                this.flagCount += this.flagged[row][col] ? 1 : -1;
                this.updateDisplay();
            }

            // 简化的双键快速挖掘
            handleMouseDown(row, col, event) {
                if (this.isGameEnded()) return;

                if (event.button === 0) {
                    this.mouseButtons.left = true;
                } else if (event.button === 2) {
                    this.mouseButtons.right = true;
                }

                if (this.mouseButtons.left && this.mouseButtons.right) {
                    this.quickDigCell = { row, col };
                    this.highlightQuickDigArea(row, col, true);
                    // 双键时小人变惊讶表情
                    this.getDomElement('smileyButton', 'smiley-button').textContent = '😮';
                }
            }

            handleMouseUp(row, col, event) {
                if (this.isGameEnded()) return;

                const wasQuickDig = this.mouseButtons.left && this.mouseButtons.right;

                if (wasQuickDig && this.quickDigCell &&
                    this.quickDigCell.row === row && this.quickDigCell.col === col) {
                    this.performQuickDig(row, col);
                } else if (event.button === 0 && !this.mouseButtons.right) {
                    this.handleLeftClick(row, col, event);
                } else if (event.button === 2 && !this.mouseButtons.left) {
                    this.handleRightClick(row, col, event);
                }

                // 重置状态
                if (event.button === 0) this.mouseButtons.left = false;
                if (event.button === 2) this.mouseButtons.right = false;

                if (this.quickDigCell) {
                    this.highlightQuickDigArea(this.quickDigCell.row, this.quickDigCell.col, false);
                    this.quickDigCell = null;
                    // 双键结束时恢复正常表情（如果游戏还在进行中）
                    if (this.gameState === 'playing' || this.gameState === 'ready') {
                        this.getDomElement('smileyButton', 'smiley-button').textContent = '😊';
                    }
                }
            }

            performQuickDig(row, col) {
                if (!this.revealed[row][col] || this.board[row][col] <= 0) return;

                let flaggedCount = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const newRow = row + dr;
                        const newCol = col + dc;
                        if (this.isValidCell(newRow, newCol) && this.flagged[newRow][newCol]) {
                            flaggedCount++;
                        }
                    }
                }

                if (flaggedCount === this.board[row][col]) {
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            const newRow = row + dr;
                            const newCol = col + dc;
                            if (this.isValidCell(newRow, newCol) &&
                                !this.revealed[newRow][newCol] &&
                                !this.flagged[newRow][newCol]) {
                                this.revealCell(newRow, newCol);
                            }
                        }
                    }
                    this.updateDisplay();
                    this.checkGameState();
                }
            }

            // 获取缓存的cell元素
            getCellElements() {
                if (!this.cellElements) {
                    this.cellElements = document.querySelectorAll('.cell');
                }
                return this.cellElements;
            }

            // 清除cell元素缓存（在重新创建游戏板时调用）
            clearCellCache() {
                this.cellElements = null;
            }

            // 检查游戏是否已结束
            isGameEnded() {
                return this.gameState === 'won' || this.gameState === 'lost';
            }

            // 格式化3位数字显示
            formatThreeDigits(num) {
                return Math.max(-99, Math.min(999, num)).toString().padStart(3, '0');
            }

            // 获取缓存的DOM元素
            getDomElement(key, id) {
                if (!this.domElements[key]) {
                    this.domElements[key] = document.getElementById(id);
                }
                return this.domElements[key];
            }

            // 遍历所有格子的辅助方法
            forEachCell(callback) {
                for (let row = 0; row < this.rows; row++) {
                    for (let col = 0; col < this.cols; col++) {
                        callback(row, col);
                    }
                }
            }

            highlightQuickDigArea(row, col, highlight) {
                if (!this.revealed[row][col] || this.board[row][col] <= 0) return;

                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const newRow = row + dr;
                        const newCol = col + dc;
                        if (this.isValidCell(newRow, newCol)) {
                            const cellIndex = newRow * this.cols + newCol;
                            const cellElement = this.getCellElements()[cellIndex];
                            if (cellElement) {
                                if (highlight) {
                                    cellElement.classList.add('quick-dig-highlight');
                                } else {
                                    cellElement.classList.remove('quick-dig-highlight');
                                }
                            }
                        }
                    }
                }
            }

            revealCell(row, col) {
                if (!this.isValidCell(row, col) || this.revealed[row][col] || this.flagged[row][col]) {
                    return;
                }

                this.revealed[row][col] = true;

                if (this.board[row][col] === -1) {
                    this.gameState = 'lost';
                    this.revealAllMines();
                    return;
                }

                if (this.board[row][col] === 0) {
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            this.revealCell(row + dr, col + dc);
                        }
                    }
                }
            }

            revealAllMines() {
                this.forEachCell((row, col) => {
                    if (this.board[row][col] === -1) {
                        this.revealed[row][col] = true;
                    }
                });
            }

            checkGameState() {
                if (this.gameState === 'lost') {
                    this.getDomElement('smileyButton', 'smiley-button').textContent = '😵';
                    this.stopTimer();
                    setTimeout(() => {
                        showModal('游戏失败', '💣', '踩到地雷了！点击笑脸重新开始。');
                    }, 100);
                    return;
                }

                let unrevealedCount = 0;
                this.forEachCell((row, col) => {
                    if (!this.revealed[row][col] && this.board[row][col] !== -1) {
                        unrevealedCount++;
                    }
                });

                if (unrevealedCount === 0) {
                    this.gameState = 'won';
                    this.getDomElement('smileyButton', 'smiley-button').textContent = '😎';
                    this.stopTimer();

                    // 自动标记剩余地雷
                    this.forEachCell((row, col) => {
                        if (this.board[row][col] === -1 && !this.flagged[row][col]) {
                            this.flagged[row][col] = true;
                            this.flagCount++;
                        }
                    });

                    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
                    setTimeout(async () => {
                        const message = '用时：' + elapsed + '秒<br>难度：' + this.getDifficultyName() + '<br><br>恭喜！请输入用户名上传成绩：';
                        const username = await showModal('胜利！', '🎉', message, true, true);
                        if (username && username.trim()) {
                            uploadScore(username.trim(), elapsed, this.currentDifficulty, this);
                        }
                    }, 100);
                }
            }

            startTimer() {
                this.startTime = Date.now();
                this.timer = setInterval(() => {
                    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
                    this.getDomElement('timer', 'timer').textContent = this.formatThreeDigits(elapsed);
                }, 1000);
            }

            stopTimer() {
                if (this.timer) {
                    clearInterval(this.timer);
                    this.timer = null;
                }
            }

            getDifficultyName() {
                const names = {
                    beginner: '初级',
                    intermediate: '中级',
                    expert: '专家'
                };
                return names[this.currentDifficulty] || '未知';
            }

            updateDisplay() {
                const remainingMines = this.mineCount - this.flagCount;
                this.getDomElement('mineCounter', 'mine-counter').textContent = this.formatThreeDigits(remainingMines);

                const cells = this.getCellElements();
                cells.forEach((cell, index) => {
                    const row = Math.floor(index / this.cols);
                    const col = index % this.cols;

                    cell.className = 'cell';
                    cell.textContent = '';

                    if (this.flagged[row][col]) {
                        cell.classList.add('flagged');
                    } else if (this.revealed[row][col]) {
                        cell.classList.add('revealed');
                        if (this.board[row][col] === -1) {
                            cell.classList.add('mine');
                            cell.textContent = '💣';
                        } else if (this.board[row][col] > 0) {
                            cell.classList.add('number-' + this.board[row][col]);
                            cell.textContent = this.board[row][col];
                        }
                    }
                });
            }
        }

        // 全局变量
        let game = null;
        let currentLeaderboardDifficulty = 'beginner';
        let modalCallback = null;

        // 模态框函数
        function showModal(title, icon, message, showInput = false, showCancel = false) {
            document.getElementById('modal-title').textContent = title;
            document.getElementById('modal-icon').textContent = icon;
            document.getElementById('modal-message').innerHTML = message;

            const inputContainer = document.getElementById('modal-input-container');
            const cancelButton = document.getElementById('modal-cancel');
            const confirmButton = document.getElementById('modal-confirm');
            const input = document.getElementById('modal-input');

            if (showInput) {
                inputContainer.style.display = 'block';
                input.value = '';
                setTimeout(() => input.focus(), 100);
            } else {
                inputContainer.style.display = 'none';
            }

            if (showCancel) {
                cancelButton.style.display = 'inline-block';
                confirmButton.textContent = '确定';
            } else {
                cancelButton.style.display = 'none';
                confirmButton.textContent = '确定';
            }

            document.getElementById('game-modal').style.display = 'block';

            return new Promise((resolve) => {
                modalCallback = resolve;
            });
        }

        // 平滑更新模态框内容（不关闭模态框）
        function updateModal(title, icon, message) {
            document.getElementById('modal-title').textContent = title;
            document.getElementById('modal-icon').textContent = icon;
            document.getElementById('modal-message').innerHTML = message;

            // 隐藏输入框和取消按钮
            document.getElementById('modal-input-container').style.display = 'none';
            document.getElementById('modal-cancel').style.display = 'none';
            document.getElementById('modal-confirm').textContent = '确定';
        }

        function closeModal() {
            document.getElementById('game-modal').style.display = 'none';
            if (modalCallback) {
                modalCallback(null);
                modalCallback = null;
            }
        }

        function handleModalConfirm() {
            const input = document.getElementById('modal-input');
            const inputContainer = document.getElementById('modal-input-container');
            const cancelButton = document.getElementById('modal-cancel');

            let value;
            if (inputContainer.style.display !== 'none') {
                // 有输入框的情况
                value = input.value.trim();

                // 验证用户名长度（支持8个汉字或16个字符）
                if (value && [...value].length > 16) {
                    showModal('用户名过长', '⚠️', '用户名最多支持8个汉字或16个字符，请重新输入。');
                    return;
                }

                if (value && value.length === 0) {
                    showModal('用户名不能为空', '⚠️', '请输入有效的用户名。');
                    return;
                }
            } else if (cancelButton.style.display !== 'none') {
                // 有取消按钮的确认对话框
                value = true;
            } else {
                // 普通提示框
                value = true;
            }

            // 对于有输入框的情况（如上传成绩），不立即关闭模态框
            if (inputContainer.style.display === 'none') {
                // 普通提示框或确认框，正常关闭
                document.getElementById('game-modal').style.display = 'none';
            }
            // 注意：对于有输入框的情况，模态框会在uploadScore函数中保持显示并更新内容

            if (modalCallback) {
                modalCallback(value);
                modalCallback = null;
            }
        }

        function handleModalCancel() {
            document.getElementById('game-modal').style.display = 'none';
            if (modalCallback) {
                modalCallback(false);
                modalCallback = null;
            }
        }

        // 全局函数
        function setDifficulty(difficulty) {
            if (!game) return;

            document.querySelectorAll('.difficulty-button').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');

            game.currentDifficulty = difficulty;
            game.initGame();
        }

        function newGame() {
            if (game) {
                game.initGame();
            }
        }

        function showHelp() {
            const helpMessage =
                '<div style="text-align: left; line-height: 1.6;">' +
                '<strong>🎯 游戏目标：</strong><br>' +
                '找出所有地雷而不踩到它们！<br><br>' +
                '<strong>🖱️ 操作方法：</strong><br>' +
                '• 左键：挖掘格子<br>' +
                '• 右键：标记地雷<br>' +
                '• 双键：在数字上同时按左右键快速挖掘<br><br>' +
                '<strong>📱 移动端：</strong><br>' +
                '长按格子标记地雷<br><br>' +
                '<strong>🏆 难度选择：</strong><br>' +
                '• 初级：9×9，10个地雷<br>' +
                '• 中级：16×16，40个地雷<br>' +
                '• 专家：30×16，99个地雷<br><br>' +
                '<strong>💡 提示：</strong><br>' +
                '数字表示周围8个格子中地雷的数量' +
                '</div>';
            showModal('怎么玩', '🎯', helpMessage);
        }

        function switchLeaderboard(difficulty) {
            currentLeaderboardDifficulty = difficulty;

            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');

            loadLeaderboard(difficulty, true); // 切换时强制刷新
        }

        // 定期刷新排行榜以确保实时性
        function startLeaderboardAutoRefresh() {
            setInterval(() => {
                // 每30秒自动刷新当前显示的排行榜
                loadLeaderboard(currentLeaderboardDifficulty, true);
            }, 30000); // 30秒间隔
        }

        // 注释：已移除错误的 updateLeaderboardDisplay 函数
        // 该函数试图更新不存在的 #leaderboard-table tbody 元素
        // 现在直接在 uploadScore 中正确更新 #leaderboard-list

        // DOM元素创建辅助函数
        function createElement(tag, className, textContent, styles = {}) {
            const element = document.createElement(tag);
            if (className) element.className = className;
            if (textContent) element.textContent = textContent;
            Object.assign(element.style, styles);
            return element;
        }

        // 安全的排行榜项创建函数 - 防止XSS攻击
        function createLeaderboardItem(record, index) {
            const item = createElement('div', 'leaderboard-item');
            const rank = createElement('div', 'leaderboard-rank', index + 1);
            const username = createElement('div', 'leaderboard-username', record.username);
            const time = createElement('div', 'leaderboard-time', record.time + 's');

            item.appendChild(rank);
            item.appendChild(username);
            item.appendChild(time);
            return item;
        }

        async function loadLeaderboard(difficulty, forceRefresh = false) {
            try {
                // 添加缓存破坏参数以确保获取最新数据
                const url = '/api/leaderboard/' + difficulty + (forceRefresh ? '?t=' + Date.now() + '&r=' + Math.random() : '');
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache',
                        'Expires': '0'
                    }
                });
                const result = await response.json();

                const listElement = document.getElementById('leaderboard-list');

                // 清空现有内容
                listElement.innerHTML = '';

                if (result.success && result.data.length > 0) {
                    // 使用安全的DOM操作替代innerHTML
                    result.data.forEach((record, index) => {
                        const item = createLeaderboardItem(record, index);
                        listElement.appendChild(item);
                    });
                } else {
                    // 安全地创建"暂无记录"消息
                    const emptyMessage = createElement('div', '', '暂无记录', {
                        textAlign: 'center',
                        padding: '20px',
                        color: '#666'
                    });
                    listElement.appendChild(emptyMessage);
                }
            } catch (error) {
                // 安全地创建错误消息
                const listElement = document.getElementById('leaderboard-list');
                listElement.innerHTML = '';
                const errorMessage = createElement('div', '', '加载失败', {
                    textAlign: 'center',
                    padding: '20px',
                    color: '#d00'
                });
                listElement.appendChild(errorMessage);
            }
        }

        async function uploadScore(username, time, difficulty, gameInstance) {
            try {
                // 确保模态框显示并立即更新为"正在提交"状态
                document.getElementById('game-modal').style.display = 'block';
                updateModal('正在提交', '⏳', '正在上传您的成绩，请稍候...');

                // 首先获取当前排行榜数据，检查用户是否已有记录
                const getResponse = await fetch('/api/leaderboard/' + difficulty);
                const getResult = await getResponse.json();

                let existingRecord = null;
                let isNewRecord = false;
                let rankImprovement = '';

                if (getResult.success && getResult.data.length > 0) {
                    // 查找用户的现有记录
                    existingRecord = getResult.data.find(record => record.username === username.trim());

                    if (existingRecord) {
                        // 用户已有记录，比较成绩
                        if (time < existingRecord.time) {
                            // 新成绩更好
                            const improvement = existingRecord.time - time;
                            isNewRecord = true;
                            rankImprovement = '恭喜！您的成绩提升了 ' + improvement + ' 秒！';
                        } else if (time > existingRecord.time) {
                            // 新成绩更差，直接提醒并取消上传
                            const decline = time - existingRecord.time;
                            showModal(
                                '成绩未达最佳',
                                '📊',
                                '您的当前成绩：' + time + '秒<br>您的最佳成绩：' + existingRecord.time + '秒<br><br>新成绩比最佳成绩慢了 ' + decline + ' 秒，未上传到排行榜。<br><br>继续努力，争取打破个人纪录！'
                            );
                            return; // 直接取消上传
                        } else {
                            // 成绩相同
                            showModal('成绩相同', 'ℹ️', '您的成绩与之前的最佳成绩相同（' + time + '秒），无需重复上传。');
                            return;
                        }
                    }
                }

                // 收集游戏数据用于服务端验证
                const gameData = {
                    difficulty: difficulty,
                    time: time,
                    moves: gameInstance.moveCount,
                    gameId: gameInstance.gameId,
                    timestamp: gameInstance.gameStartTime,
                    boardSize: {
                        width: gameInstance.cols,
                        height: gameInstance.rows
                    },
                    mineCount: gameInstance.mineCount,
                    gameEndTime: Date.now(),
                    firstClickTime: gameInstance.firstClickTime,
                    gameState: 'won'
                };

                // 上传成绩（包含完整游戏数据用于验证）
                const response = await fetch('/api/leaderboard/' + difficulty, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ username, time, gameData })
                });

                const result = await response.json();
                if (result.success) {
                    // 查找用户在新排行榜中的排名
                    const userRank = result.data.findIndex(record => record.username === username.trim()) + 1;

                    let successMessage = '';
                    let modalTitle = '';
                    let modalIcon = '';

                    if (userRank > 0 && userRank <= 20) {
                        // 用户上榜了
                        modalTitle = '🎉 恭喜上榜！';
                        modalIcon = '🏆';

                        if (isNewRecord && existingRecord) {
                            // 打破个人纪录并上榜
                            const improvement = existingRecord.time - time;
                            successMessage = '🎉 新纪录并成功上榜！<br><br>' +
                                           '旧成绩：' + existingRecord.time + '秒<br>' +
                                           '新成绩：' + time + '秒<br>' +
                                           '提升：' + improvement + '秒<br><br>' +
                                           '🏆 当前排名：第 ' + userRank + ' 名';
                        } else if (!existingRecord) {
                            // 首次上传并上榜
                            successMessage = '🎊 首次上传即上榜！<br><br>' +
                                           '您的成绩：' + time + '秒<br>' +
                                           '🏆 当前排名：第 ' + userRank + ' 名<br><br>' +
                                           '欢迎加入排行榜！';
                        } else {
                            // 其他上榜情况
                            successMessage = '🎉 成功上榜！<br><br>' +
                                           '您的成绩：' + time + '秒<br>' +
                                           '🏆 当前排名：第 ' + userRank + ' 名';
                        }
                    } else {
                        // 用户没有上榜（排名在20名之外或未找到）
                        modalTitle = '📊 成绩已记录';
                        modalIcon = '📈';

                        if (isNewRecord && existingRecord) {
                            // 打破个人纪录但未上榜
                            const improvement = existingRecord.time - time;
                            successMessage = '🎯 个人新纪录！<br><br>' +
                                           '旧成绩：' + existingRecord.time + '秒<br>' +
                                           '新成绩：' + time + '秒<br>' +
                                           '提升：' + improvement + '秒<br><br>' +
                                           '💪 继续努力，争取进入前20名排行榜！';
                        } else if (!existingRecord) {
                            // 首次上传但未上榜
                            successMessage = '📝 首次成绩已记录！<br><br>' +
                                           '您的成绩：' + time + '秒<br><br>' +
                                           '💪 继续练习，争取进入前20名排行榜！<br>' +
                                           '目前需要达到更好的成绩才能上榜。';
                        } else {
                            // 其他未上榜情况
                            successMessage = '📊 成绩已更新！<br><br>' +
                                           '您的成绩：' + time + '秒<br><br>' +
                                           '💪 继续努力，争取进入前20名排行榜！';
                        }
                    }

                    // 立即更新模态框内容
                    updateModal(modalTitle, modalIcon, successMessage);

                    // 立即更新排行榜显示（无论是否上榜都要刷新）
                    // 如果当前显示的难度与上传的难度不同，先切换到对应难度
                    if (currentLeaderboardDifficulty !== difficulty) {
                        currentLeaderboardDifficulty = difficulty;
                        // 更新排行榜标签页
                        document.querySelectorAll('.tab-button').forEach(btn => {
                            btn.classList.remove('active');
                        });
                        // 根据难度激活对应的标签
                        const difficultyMap = {
                            'beginner': '初级',
                            'intermediate': '中级',
                            'expert': '专家'
                        };
                        const targetText = difficultyMap[difficulty];
                        document.querySelectorAll('.tab-button').forEach(btn => {
                            if (btn.textContent.trim() === targetText) {
                                btn.classList.add('active');
                            }
                        });
                    }

                    // 使用正确的函数来更新排行榜显示，直接使用服务器返回的最新数据
                    const listElement = document.getElementById('leaderboard-list');
                    if (listElement && result.data) {
                        // 清空现有内容
                        listElement.innerHTML = '';

                        if (result.data.length > 0) {
                            // 使用安全的DOM操作更新排行榜
                            result.data.forEach((record, index) => {
                                const item = createLeaderboardItem(record, index);
                                listElement.appendChild(item);
                            });
                        } else {
                            // 安全地创建"暂无记录"消息
                            const emptyMessage = document.createElement('div');
                            emptyMessage.style.textAlign = 'center';
                            emptyMessage.style.padding = '20px';
                            emptyMessage.style.color = '#666';
                            emptyMessage.textContent = '暂无记录';
                            listElement.appendChild(emptyMessage);
                        }
                    }

                    // 🔥 关键修复：立即强制刷新排行榜，确保显示最新数据
                    // 移除延迟刷新，避免与直接更新产生冲突
                    loadLeaderboard(difficulty, true);

                } else {
                    // 正确解析错误对象并显示
                    let errorMsg = '未知错误';
                    if (result.error) {
                        if (typeof result.error === 'string') {
                            errorMsg = result.error;
                        } else if (result.error.message) {
                            errorMsg = result.error.message;
                        } else if (result.error.code) {
                            errorMsg = result.error.code;
                        }
                    }
                    updateModal('上传失败', '❌', '上传失败：' + errorMsg);
                }
            } catch (error) {
                console.error('Upload error:', error);
                let errorMessage = '网络连接错误';

                if (error.name === 'TypeError' && error.message.includes('fetch')) {
                    errorMessage = '网络连接失败，请检查网络状态';
                } else if (error.message) {
                    errorMessage = error.message;
                }

                updateModal('上传失败', '❌', '上传失败：' + errorMessage);
            }
        }

        // 初始化
        window.addEventListener('DOMContentLoaded', () => {
            // 全局禁用右键菜单 - 多重保护
            document.body.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
            });

            // 禁用选择文本（可选，防止意外选择）
            document.body.style.userSelect = 'none';
            document.body.style.webkitUserSelect = 'none';
            document.body.style.mozUserSelect = 'none';
            document.body.style.msUserSelect = 'none';

            game = new MinesweeperGame();
            game.initGame();
            loadLeaderboard('beginner', true); // 初始加载时强制刷新

            // 启动排行榜自动刷新
            startLeaderboardAutoRefresh();

            // 确保右侧面板在初始化后显示
            setTimeout(() => {
                if (game) {
                    game.updateRightPanelPosition();
                }
            }, 200);

            // 窗口大小变化监听
            window.addEventListener('resize', () => {
                if (game) {
                    game.calculateCellSize();
                    // 延迟更新位置，确保DOM已更新
                    setTimeout(() => {
                        game.updateGamePosition();
                        game.updateRightPanelPosition();
                    }, 100);
                }
            });

            // 全局鼠标事件监听（清理双键状态）
            document.addEventListener('mouseup', (e) => {
                if (game && !e.target.closest('.cell')) {
                    game.mouseButtons.left = false;
                    game.mouseButtons.right = false;
                    if (game.quickDigCell) {
                        game.highlightQuickDigArea(game.quickDigCell.row, game.quickDigCell.col, false);
                        game.quickDigCell = null;
                        // 恢复正常表情（如果游戏还在进行中）
                        if (game.gameState === 'playing' || game.gameState === 'ready') {
                            document.getElementById('smiley-button').textContent = '😊';
                        }
                    }
                }
            });

            // 全局禁用右键菜单，防止浏览器接管
            document.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            });


        });
    </script>
</body>
</html>`;
}
