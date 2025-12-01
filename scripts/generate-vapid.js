#!/usr/bin/env node
// 生成 VAPID 公私钥对并输出环境变量格式
import { generateVAPIDKeys } from 'web-push';

const keys = generateVAPIDKeys();

console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('VAPID_SUBJECT=mailto:admin@example.com');
