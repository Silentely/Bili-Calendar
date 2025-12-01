// push.js - WebPush 注册（实验特性）

async function getPublicKey() {
  const res = await fetch('/push/public-key', { cache: 'no-store' });
  if (!res.ok) throw new Error('no-public-key');
  const data = await res.json();
  if (!data.key) throw new Error('empty-key');
  return data.key;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function registerPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('push-not-supported');
  }

  const reg = await navigator.serviceWorker.ready;
  const key = await getPublicKey();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });

  const resp = await fetch('/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub),
  });
  if (!resp.ok) throw new Error('subscribe-failed');
  return true;
}

export default { registerPush };
