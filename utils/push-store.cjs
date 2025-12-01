// push-store.cjs - 简易文件型推送订阅存储
const fs = require('fs');
const path = require('path');

class PushStore {
  constructor(filePath) {
    this.filePath = filePath || path.join(process.cwd(), 'data', 'push-subscriptions.json');
    this.data = [];
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
          this.data = parsed;
        }
      }
    } catch (err) {
      console.warn('⚠️ 无法读取推送订阅存储:', err.message);
      this.data = [];
    }
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.warn('⚠️ 无法写入推送订阅存储:', err.message);
    }
  }

  add(subscription) {
    if (!subscription || !subscription.endpoint) return;
    if (!this.data.find((item) => item.endpoint === subscription.endpoint)) {
      this.data.push(subscription);
      this.save();
    }
  }

  list() {
    return [...this.data];
  }
}

module.exports = (filePath) => new PushStore(filePath);
