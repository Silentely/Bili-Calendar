// @ts-check
/**
 * 共享业务 Handler：Express 与 Netlify Functions 共用
 * 保证双入口行为一致（限流、校验、错误码、缓存头）
 */

import crypto from 'node:crypto';
import { getBangumiData } from '../../utils-es/bangumi.js';
import { generateICS, respondWithICS, respondWithEmptyCalendar } from '../../utils-es/ics.js';
import { generateMergedICS, fetchExternalICS } from '../../utils-es/ics-merge.js';
import metrics from '../../utils-es/metrics.js';
import { isValidUID, validateExternalSource } from '../../utils-es/security.js';

/**
 * @typedef {{code?: number, message?: string, error?: string, data?: {list?: unknown[]}} & Record<string, unknown>} BangumiData
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 */

/**
 * 处理 B站 API 业务错误（日历路径）
 * @param {Response} res
 * @param {BangumiData} data
 * @param {string} uid
 * @returns {boolean} 是否已发送响应
 */
export function processBangumiApiError(res, data, uid) {
  // 无业务码或成功码时不视为错误（与 data.error 字段分流处理）
  if (data == null || typeof data.code !== 'number' || data.code === 0) {
    return false;
  }
  if (data.code === 53013) {
    console.warn(`⚠️ 用户隐私设置限制: ${uid}`);
    respondWithEmptyCalendar(res, uid, '用户设置为隐私');
    return true;
  }
  console.error(`❌ B站API错误: ${data.message} (code: ${data.code})`);
  res.status(500).send(`Bilibili API 错误: ${data.message} (code: ${data.code})`);
  return true;
}

/**
 * 解析聚合 sources 查询参数
 * @param {unknown} rawSources
 * @returns {{sourceList: string[], error?: {status: number, body: object}}}
 */
export function parseAggregateSourcesQuery(rawSources) {
  /** @type {unknown[]} */
  let sourceItems = [];
  if (Array.isArray(rawSources)) {
    sourceItems = rawSources;
  } else if (rawSources != null && rawSources !== '') {
    sourceItems = [rawSources];
  }
  let hasInvalidSourceEncoding = false;
  const sourceList = sourceItems
    .flatMap((s) => String(s).split(','))
    .map((s) => {
      const trimmed = s.trim();
      if (!trimmed) return null;
      try {
        return decodeURIComponent(trimmed);
      } catch {
        hasInvalidSourceEncoding = true;
        console.warn(`⚠️ 无效的 URL 编码参数: ${trimmed}`);
        return null;
      }
    })
    .filter(/** @returns {s is string} */ (s) => Boolean(s));

  if (hasInvalidSourceEncoding) {
    return {
      sourceList: [],
      error: {
        status: 400,
        body: { error: 'Invalid source', message: 'sources 参数包含无效的编码' },
      },
    };
  }

  if (sourceList.length > 5) {
    return {
      sourceList: [],
      error: {
        status: 400,
        body: { error: 'Too many sources', message: '最多支持 5 个外部 ICS 链接' },
      },
    };
  }

  for (const sourceUrl of sourceList) {
    const ssrfError = validateExternalSource(sourceUrl);
    if (ssrfError) {
      console.warn(`⚠️ SSRF 检测拦截: ${sourceUrl} - ${ssrfError}`);
      return {
        sourceList: [],
        error: {
          status: 400,
          body: { error: 'Invalid source', message: ssrfError },
        },
      };
    }
  }

  return { sourceList };
}

/**
 * GET /api/bangumi/:uid
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 */
export async function handleBangumiApi(req, res, next) {
  const uid = String(req.params.uid || '');

  if (!isValidUID(uid)) {
    console.warn(`⚠️ 无效的UID格式: ${uid}`);
    res.status(400).json({
      error: 'Invalid UID',
      message: 'UID必须是1-20位纯数字',
    });
    return;
  }

  try {
    const apiStart = Date.now();
    const data = /** @type {BangumiData|null} */ (await getBangumiData(uid));
    metrics.onApiCall(Date.now() - apiStart, !!data && data.code === 0);
    if (!data) {
      res.status(500).json({ error: 'Internal Server Error', message: '获取数据失败' });
      return;
    }
    if (typeof data.code === 'number' && data.code !== 0) {
      if (data.code === 53013) {
        res.status(403).json(data);
        return;
      }
      res.json(data);
      return;
    }
    const bodyJson = JSON.stringify(data);
    const etag = `W/"${crypto.createHash('sha1').update(bodyJson).digest('hex')}"`;
    const inm = req.headers['if-none-match'];
    if (inm && inm === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type('application/json').send(bodyJson);
  } catch (err) {
    console.error(`❌ 处理请求时出错:`, err);
    return next(err);
  }
}

/**
 * GET /:uid[.ics]
 * @param {Request & {params: {uid: string}}} req
 * @param {Response} res
 * @param {NextFunction} next
 */
export async function handleCalendar(req, res, next) {
  const raw = req.params.uid;
  const cleanUid = raw.replace('.ics', '');

  if (!isValidUID(cleanUid)) {
    console.warn(`⚠️ 无效的UID格式: ${cleanUid}`);
    respondWithEmptyCalendar(res, cleanUid || 'invalid', 'UID必须是1-20位纯数字');
    return;
  }

  try {
    console.log(`🔍 处理UID: ${cleanUid}`);
    const apiStart = Date.now();
    const data = /** @type {BangumiData|null} */ (await getBangumiData(cleanUid));
    metrics.onApiCall(Date.now() - apiStart, !!data && data.code === 0);
    if (!data) {
      console.error(`❌ getBangumiData 返回 null: ${cleanUid}`);
      respondWithEmptyCalendar(res, cleanUid, '获取数据失败，请稍后重试');
      return;
    }

    if (data.error) {
      console.error(`❌ B站API错误: ${data.message || data.error}`);
      respondWithEmptyCalendar(res, cleanUid, `${data.error}: ${data.message || '请稍后重试'}`);
      return;
    }

    if (processBangumiApiError(res, data, cleanUid)) {
      return;
    }

    const bangumiList = data.data?.list || [];
    console.log(`📋 获取到番剧列表数量: ${bangumiList.length}`);

    if (bangumiList.length === 0) {
      console.warn(`⚠️ 未找到正在播出的番剧: ${cleanUid}`);
      respondWithEmptyCalendar(res, cleanUid, '未找到正在播出的番剧');
      return;
    }

    console.log(`📅 生成日历文件`);
    const icsContent = generateICS(bangumiList, cleanUid);
    respondWithICS(res, icsContent, cleanUid);
  } catch (err) {
    console.error(`❌ 处理请求时出错:`, err);
    next(err);
  }
}

/**
 * GET /aggregate/:uid[.ics]
 * @param {Request & {params: {uid: string}}} req
 * @param {Response} res
 * @param {NextFunction} next
 */
export async function handleAggregate(req, res, next) {
  const raw = req.params.uid;
  const cleanUid = raw.replace('.ics', '');

  if (!isValidUID(cleanUid)) {
    console.warn(`⚠️ 无效的UID格式: ${cleanUid}`);
    res.status(400).json({
      error: 'Invalid UID',
      message: 'UID必须是1-20位纯数字',
    });
    return;
  }

  const parsed = parseAggregateSourcesQuery(req.query.sources);
  if (parsed.error) {
    res.status(parsed.error.status).json(parsed.error.body);
    return;
  }
  const { sourceList } = parsed;

  try {
    console.log(`🔀 聚合 UID: ${cleanUid}, 外部源数量: ${sourceList.length}`);

    const apiStart = Date.now();
    const data = /** @type {BangumiData|null} */ (await getBangumiData(cleanUid));
    metrics.onApiCall(Date.now() - apiStart, !!data && data.code === 0);
    if (!data) {
      res.status(500).json({ error: 'Internal Error', message: '获取数据失败，请稍后重试' });
      return;
    }

    if (data.error) {
      res.status(502).json({
        error: data.error,
        message: data.message || '获取番剧数据失败',
        code: data.code,
      });
      return;
    }

    if (processBangumiApiError(res, data, cleanUid)) return;

    const bangumiList = data.data?.list || [];
    const externalCalendars = await fetchExternalICS(sourceList);
    // 记录外部源拉取结果，供可观测与客户端诊断
    const sourceStats = {
      requested: sourceList.length,
      fetched: externalCalendars.length,
      failed: Math.max(0, sourceList.length - externalCalendars.length),
    };
    metrics.onAggregateSources(sourceStats);

    const merged = generateMergedICS(bangumiList, cleanUid, externalCalendars);
    if (!merged) {
      respondWithEmptyCalendar(res, cleanUid, '未找到可用日程');
      return;
    }

    const icsName = `bili_merge_${cleanUid}.ics`;
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${icsName}"`,
      'Cache-Control': 'public, max-age=600, s-maxage=600',
      'CDN-Cache-Control': 'public, max-age=600',
      'X-Aggregate-Sources-Requested': String(sourceStats.requested),
      'X-Aggregate-Sources-Fetched': String(sourceStats.fetched),
      'X-Aggregate-Sources-Failed': String(sourceStats.failed),
    });
    res.send(merged);
  } catch (err) {
    console.error(`❌ 聚合处理出错:`, err);
    next(err);
  }
}
