function parsePdKeyToDate(key) {
  if (typeof key !== "string") return null;

  if (/^\d{8}$/.test(key)) {
    const y = key.slice(0, 4);
    const m = key.slice(4, 6);
    const d = key.slice(6, 8);
    const dt = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
    return Number.isNaN(dt.valueOf()) ? null : dt;
  }

  const dt = new Date(key);
  return Number.isNaN(dt.valueOf()) ? null : dt;
}

function getLatestAndAvg(pdMap, { windowDays = 60 } = {}) {
  if (!pdMap || typeof pdMap !== "object") return null;

  const entries =
    pdMap instanceof Map ? Array.from(pdMap.entries()) : Object.entries(pdMap);

  const now = new Date();
  const start = new Date(now.getTime() - windowDays * 86400000);

  let latestT = null;
  let latest = null;

  let sum = 0;
  let cnt = 0;

  for (const [k, v] of entries) {
    if (!v) continue;

    const t = parsePdKeyToDate(k);
    if (!t) continue;

    const sRaw = v.s;
    if (sRaw == null) continue;

    const s = Number(sRaw);
    if (!Number.isFinite(s) || s <= 0) continue;

    // 최신가는 전체 기간 기준으로 봐도 되고,
    // 평균은 최근 N일만 반영
    if (!latestT || t > latestT) {
      latestT = t;
      latest = s;
    }

    if (t >= start) {
      sum += s;
      cnt += 1;
    }
  }

  if (latest == null) return null;

  return {
    latest,
    avg: cnt > 0 ? sum / cnt : null,
    count: cnt,
  };
}

export function computePriceFields(
  productDoc,
  { windowDays = 60, minPoints = 3 } = {},
) {
  const sil = productDoc?.sku_info?.sil || [];

  console.log("sil", sil);

  let minPrice = null;
  let maxPrice = null;
  let bestDiscount = null;

  for (const sku of sil) {
    const stats = getLatestAndAvg(sku?.pd, { windowDays });
    if (!stats) continue;

    const { latest, avg, count } = stats;

    // 1) 최신가 기준 최저/최고
    if (minPrice == null || latest < minPrice) minPrice = latest;
    if (maxPrice == null || latest > maxPrice) maxPrice = latest;

    // 2) 할인율
    if (avg != null && count >= minPoints && avg > 0) {
      const disc = ((avg - latest) / avg) * 100;

      if (bestDiscount == null || disc > bestDiscount) {
        bestDiscount = disc;
      }
    }
  }

  return {
    min_price: minPrice ?? null,
    max_price: maxPrice ?? null,
    discount_rate:
      bestDiscount == null ? null : Math.round(bestDiscount * 100) / 100,
  };
}
