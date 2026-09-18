// @ts-nocheck
// utils-es/push-store.js
// 本地轻量 WebPush 订阅持久化存储（ESM）

import fs from 'node:fs';
import path from 'node:path';
import { isPrivateIPAddress } from './security.js';

export const MAX_SUBSCRIPTIONS = 2000;

/**
 * 验证 WebPush 订阅结构是否合法与安全
 * @param {any} subscription
 * @returns {boolean}
 */
export function validatePushSubscription(subscription) {
  if (!subscription || typeof subscription !== 'object' || Array.isArray(subscription)) {
    return false;
  }
  if (typeof subscription.endpoint !== 'string') {
    return false;
  }

  const endpoint = subscription.endpoint.trim();
  if (endpoint.length < 10 || endpoint.length > 2048) {
    return false;
  }

  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    if (isPrivateIPAddress(parsed.hostname)) {
      return false;
    }
  } catch {
    return false;
  }

  if (subscription.keys !== undefined && subscription.keys !== null) {
    if (typeof subscription.keys !== 'object' || Array.isArray(subscription.keys)) {
      return false;
    }
    const { p256dh, auth } = subscription.keys;
    if (p256dh !== undefined && (typeof p256dh !== 'string' || p256dh.length > 512)) {
      return false;
    }
    if (auth !== undefined && (typeof auth !== 'string' || auth.length > 512)) {
      return false;
    }
  }

  if (
    subscription.expirationTime !== undefined &&
    subscription.expirationTime !== null &&
    typeof subscription.expirationTime !== 'number'
  ) {
    return false;
  }

  try {
    if (JSON.stringify(subscription).length > 4096) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

/**
 * 对订阅对象做白名单清洗，防止存储无用或恶意字段
 * @param {object} subscription
 * @returns {{endpoint: string, expirationTime: number|null, keys: {p256dh: string, auth: string}}}
 */
export function sanitizePushSubscription(subscription) {
  return {
    endpoint: String(subscription.endpoint || '').trim(),
    expirationTime:
      typeof subscription.expirationTime === 'number' ? subscription.expirationTime : null,
    keys: {
      p256dh: typeof subscription.keys?.p256dh === 'string' ? subscription.keys.p256dh : '',
      auth: typeof subscription.keys?.auth === 'string' ? subscription.keys.auth : '',
    },
  };
}

class PushStore {
  constructor(filePath) {
    this.filePath = filePath || path.join(process.cwd(), 'data', 'push-subscriptions.json');
    this.data = [];
    this.saveTimeout = null;
    this.ensureDir();
    this.load();
  }

  ensureDir() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.data = parsed
            .filter(validatePushSubscription)
            .map(sanitizePushSubscription)
            .slice(-MAX_SUBSCRIPTIONS);
        }
      }
    } catch (err) {
      console.warn(`⚠️ 无法读取推送订阅文件 (${this.filePath}): ${err.message}，重置为空并备份`);
      try {
        if (fs.existsSync(this.filePath)) {
          const backupPath = `${this.filePath}.corrupt.${Date.now()}`;
          fs.renameSync(this.filePath, backupPath);
          console.warn(`⚠️ 已备份损坏文件到: ${backupPath}`);
        }
      } catch {
        // 备份失败不影响主流程
      }
      this.data = [];
    }
  }

  save() {
    try {
      this.ensureDir();
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error(`❌ 保存推送订阅失败: ${err.message}`);
    }
  }

  scheduleSave() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.save();
    }, 500);
  }

  isValidSubscription(subscription) {
    return validatePushSubscription(subscription);
  }

  sanitizeSubscription(subscription) {
    return sanitizePushSubscription(subscription);
  }

  add(subscription) {
    if (!this.isValidSubscription(subscription)) return false;
    const clean = this.sanitizeSubscription(subscription);
    const exists = this.data.find((item) => item.endpoint === clean.endpoint);
    if (!exists) {
      this.data.push(clean);
      if (this.data.length > MAX_SUBSCRIPTIONS) {
        this.data.splice(0, this.data.length - MAX_SUBSCRIPTIONS);
      }
      this.scheduleSave();
      return true;
    }
    return false;
  }

  list() {
    return [...this.data];
  }
}

export default function createPushStore(filePath) {
  return new PushStore(filePath);
}
