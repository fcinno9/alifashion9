import dbConnect from "./utils/dbConnect.js";
import ProductDetail from "./models/ProductDetail.js";
import GlobalStat from "./models/GlobalStat.js";

// ─────────────────────────────────────────────
// 유틸
function toNum(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mem() {
  const m = process.memoryUsage();
  const toMB = (x) => Math.round((x / 1024 / 1024) * 10) / 10;
  return `rss ${toMB(m.rss)}MB, heapUsed ${toMB(m.heapUsed)}MB`;
}

function toKstYmd(date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function getLastNDaysKst(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    out.push(toKstYmd(d));
  }
  return out;
}

function makeDayAcc(days) {
  const m = new Map();
  for (const ymd of days) m.set(ymd, { sum: 0, cnt: 0 });
  return m;
}

function finalize7dSeries(dayAcc, days7) {
  return days7.map((ymd) => {
    const row = dayAcc.get(ymd) || { sum: 0, cnt: 0 };
    const avg = row.cnt > 0 ? row.sum / row.cnt : 0;
    return { date: ymd, avgPrice: Number(avg.toFixed(2)) };
  });
}

function pickLatestPriceFromDayMin(dayMin) {
  if (!dayMin || dayMin.size === 0) return null;

  let latestT = -Infinity;
  let latestP = null;

  for (const [ymd, p] of dayMin.entries()) {
    const t = Date.parse(ymd);
    if (Number.isFinite(t) && t > latestT) {
      latestT = t;
      latestP = p;
    }
  }
  return latestP;
}

// ─────────────────────────────────────────────
// 상품 1개 doc에서 최근 8일(직전7일 + 오늘) 날짜별 최저가 맵 생성 (상품당 날짜 1표)
function buildDayMinForDoc(doc, { daySet8, cutoffMs }) {
  const sil = doc?.sku_info?.sil;
  if (!Array.isArray(sil) || sil.length === 0) return null;

  const dayMin = new Map(); // ymd -> minPrice

  for (const sku of sil) {
    const pd = sku?.pd;
    if (!pd) continue;

    const entries = Array.isArray(pd) ? pd : Object.entries(pd);

    for (const [dateKey, v] of entries) {
      const t = Date.parse(dateKey);
      if (!Number.isFinite(t) || t < cutoffMs) continue;

      const price = toNum(v?.s);
      if (price == null || price <= 0) continue;

      const ymd = toKstYmd(new Date(t));
      if (!daySet8.has(ymd)) continue;

      const prevMin = dayMin.get(ymd);
      if (prevMin == null || price < prevMin) dayMin.set(ymd, price);
    }
  }

  return dayMin;
}

// ─────────────────────────────────────────────
// 집계기
function createAgg({ key, days8 }) {
  return {
    key,
    itemCount: 0,

    // avgPrice: 최신 대표가 평균(오늘 있으면 오늘, 없으면 최신날)
    sumLatestPrice: 0,
    cntLatestPrice: 0,

    // avgChangeRate: “상품별 today vs prev7Avg” 평균
    sumChangeRate: 0,
    cntChangeRate: 0,

    // 차트용 날짜별 평균가격(최근 7일은 여기서 뽑아냄): 8일 누적
    dayAcc: makeDayAcc(days8),

    // subCategories 누적
    // Map: name -> bucket
    subMap: new Map(),
  };
}

function ensureSubBucket(agg, subKey, days8) {
  const name = subKey || "기타";

  if (!agg.subMap.has(name)) {
    agg.subMap.set(name, {
      name,
      itemCount: 0,

      sumLatestPrice: 0,
      cntLatestPrice: 0,

      sumChangeRate: 0,
      cntChangeRate: 0,

      dayAcc: makeDayAcc(days8),
    });
  }
  return agg.subMap.get(name);
}

/**
 * ✅ 핵심:
 * - 같은 상품에서 todayPrice vs prev7Avg(상품별)로 changeRate 1개 만들고
 * - 그 changeRate를 평균냄(상품당 1표)
 *
 * subKeyOrNull:
 * - GLOBAL: null (subCategories 없음)
 * - 일반 카테고리: c2n
 * - 신발: c3n (남성 신발/여성 신발 각각 문서에서)
 */
function accumulateAggByProduct(
  agg,
  dayMin,
  { prev7Days, todayYmd },
  subKeyOrNull,
  days8,
) {
  // 문서 수
  agg.itemCount += 1;

  // sub 문서 수
  let sub = null;
  if (subKeyOrNull != null) {
    sub = ensureSubBucket(agg, subKeyOrNull, days8);
    sub.itemCount += 1;
  }

  if (!dayMin || dayMin.size === 0) return;

  // avgPrice(최신 대표가)
  const latestP = pickLatestPriceFromDayMin(dayMin);
  if (latestP != null) {
    agg.sumLatestPrice += latestP;
    agg.cntLatestPrice += 1;

    if (sub) {
      sub.sumLatestPrice += latestP;
      sub.cntLatestPrice += 1;
    }
  }

  // 날짜별 평균가격(차트용) 누적
  for (const [ymd, p] of dayMin.entries()) {
    const g = agg.dayAcc.get(ymd);
    if (g) {
      g.sum += p;
      g.cnt += 1;
    }
    if (sub) {
      const s = sub.dayAcc.get(ymd);
      if (s) {
        s.sum += p;
        s.cnt += 1;
      }
    }
  }

  // ✅ avgChangeRate: 상품별 today vs prev7Avg
  const todayPrice = dayMin.get(todayYmd);
  if (todayPrice == null || todayPrice <= 0) return;

  let prevSum = 0;
  let prevCnt = 0;
  for (const d of prev7Days) {
    const p = dayMin.get(d);
    if (p != null && p > 0) {
      prevSum += p;
      prevCnt += 1;
    }
  }
  if (prevCnt <= 0) return;

  const prevAvg = prevSum / prevCnt;
  if (!(prevAvg > 0)) return;

  const changeRate = ((todayPrice - prevAvg) / prevAvg) * 100;
  if (!Number.isFinite(changeRate)) return;

  agg.sumChangeRate += changeRate;
  agg.cntChangeRate += 1;

  if (sub) {
    sub.sumChangeRate += changeRate;
    sub.cntChangeRate += 1;
  }
}

function finalizeAggToPayload(agg, { days7, isGlobal }) {
  const avgPrice =
    agg.cntLatestPrice > 0 ? agg.sumLatestPrice / agg.cntLatestPrice : 0;
  const avgChangeRate =
    agg.cntChangeRate > 0 ? agg.sumChangeRate / agg.cntChangeRate : 0;

  const avgPrice7dSeries = finalize7dSeries(agg.dayAcc, days7);

  let subCategories;
  if (!isGlobal) {
    subCategories = Array.from(agg.subMap.values())
      .map((x) => {
        const subAvgPrice =
          x.cntLatestPrice > 0 ? x.sumLatestPrice / x.cntLatestPrice : 0;
        const subAvgChangeRate =
          x.cntChangeRate > 0 ? x.sumChangeRate / x.cntChangeRate : 0;

        return {
          name: x.name,
          itemCount: x.itemCount,
          avgPrice: Number(subAvgPrice.toFixed(2)),
          avgChangeRate: Number(subAvgChangeRate.toFixed(4)),
          avgPrice7dSeries: finalize7dSeries(x.dayAcc, days7),
        };
      })
      .sort((a, b) => (b.itemCount || 0) - (a.itemCount || 0));
  }

  const payload = {
    key: agg.key,
    itemCount: agg.itemCount,
    avgPrice: Number(avgPrice.toFixed(2)),
    avgChangeRate: Number(avgChangeRate.toFixed(4)),
    avgPrice7dSeries,
    computedAt: new Date(),
    ...(isGlobal ? {} : { subCategories }),
  };

  return payload;
}

// ─────────────────────────────────────────────
// 실행부
(async () => {
  const startedAt = Date.now();
  console.log(
    "🚀 GlobalStat 범용 집계 시작 (GLOBAL/일반/신발 + 상품기준 avgChangeRate)",
  );

  try {
    await dbConnect();
    console.log("✅ DB 연결 성공");

    // ✅ 여기만 바꾸면 됨
    const TARGET = { c1n: "가방 및 캐리어" }; // "GLOBAL" | "여성 의류" | "남성 의류" | "신발" ...
    const isGlobal = TARGET.c1n === "GLOBAL";
    const isShoes = TARGET.c1n === "신발";

    console.log(
      "🎯 TARGET:",
      TARGET,
      "| isGlobal:",
      isGlobal,
      "| isShoes:",
      isShoes,
    );

    // ✅ 직전7일 + 오늘 = 8일 필요
    const days8 = getLastNDaysKst(8);
    const prev7Days = days8.slice(0, 7);
    const days7 = days8.slice(1);
    const todayYmd = days8[7];

    const daySet8 = new Set(days8);
    const cutoffMs = Date.now() - 8 * 24 * 60 * 60 * 1000;

    console.log("📅 today:", todayYmd);
    console.log("📅 prev7Days:", prev7Days.join(", "));
    console.log("📅 days7(save):", days7.join(", "));

    // query/projection
    const query = isGlobal ? {} : { c1n: TARGET.c1n };
    const projection = isShoes
      ? { _id: 1, c2n: 1, c3n: 1, "sku_info.sil.pd": 1 }
      : { _id: 1, c2n: 1, "sku_info.sil.pd": 1 };

    const totalDocs = isGlobal
      ? await ProductDetail.countDocuments()
      : await ProductDetail.countDocuments({ c1n: TARGET.c1n });

    console.log("📌 대상 문서 수:", totalDocs);

    const cursor = ProductDetail.find(query, projection)
      .lean()
      .cursor({ batchSize: 200 });

    // ✅ 집계 대상(GlobalStat 문서) 준비
    // GLOBAL/일반: 1개
    // 신발: 2개(남성 신발, 여성 신발)
    let aggSingle = null;
    let aggShoesMen = null;
    let aggShoesWomen = null;

    if (isShoes) {
      aggShoesMen = createAgg({ key: "남성 신발", days8 });
      aggShoesWomen = createAgg({ key: "여성 신발", days8 });
    } else {
      aggSingle = createAgg({ key: TARGET.c1n, days8 });
    }

    let processed = 0;
    const progressEvery = 5000;
    const loopStart = Date.now();

    for await (const doc of cursor) {
      processed++;

      const dayMin = buildDayMinForDoc(doc, { daySet8, cutoffMs });

      if (isShoes) {
        const c2n = doc?.c2n ? String(doc.c2n) : "";
        const c3n = doc?.c3n ? String(doc.c3n) : "기타";

        if (c2n === "남성 신발") {
          accumulateAggByProduct(
            aggShoesMen,
            dayMin,
            { prev7Days, todayYmd },
            c3n, // ✅ subCategories = c3n
            days8,
          );
        } else if (c2n === "여성 신발") {
          accumulateAggByProduct(
            aggShoesWomen,
            dayMin,
            { prev7Days, todayYmd },
            c3n, // ✅ subCategories = c3n
            days8,
          );
        } else {
          // 남/여 신발 아닌 c2n은 무시 (원하면 여기서 따로 처리 가능)
        }
      } else {
        const subKey = isGlobal ? null : doc?.c2n ? String(doc.c2n) : "기타";
        accumulateAggByProduct(
          aggSingle,
          dayMin,
          { prev7Days, todayYmd },
          subKey, // ✅ 일반 카테고리: subCategories = c2n
          days8,
        );
      }

      if (processed % progressEvery === 0) {
        const elapsed = Date.now() - loopStart;
        const rate = Math.round((processed / (elapsed / 1000)) * 10) / 10;
        console.log(
          `⏳ 진행 ${processed}/${totalDocs} (${Math.round((processed / totalDocs) * 100)}%)`,
          `| 속도 ${rate} docs/s`,
          `| ${mem()}`,
        );
      }
    }

    // ✅ payload 생성
    const payloads = [];

    if (isShoes) {
      payloads.push(
        finalizeAggToPayload(aggShoesMen, { days7, isGlobal: false }),
      );
      payloads.push(
        finalizeAggToPayload(aggShoesWomen, { days7, isGlobal: false }),
      );
    } else {
      payloads.push(finalizeAggToPayload(aggSingle, { days7, isGlobal }));
    }

    console.log(
      "📊 요약:",
      payloads.map((p) => ({
        key: p.key,
        itemCount: p.itemCount,
        avgPrice: p.avgPrice,
        avgChangeRate: p.avgChangeRate,
        cntChangeRate: isShoes
          ? p.key === "남성 신발"
            ? aggShoesMen.cntChangeRate
            : aggShoesWomen.cntChangeRate
          : aggSingle.cntChangeRate,
        subCount: p.subCategories ? p.subCategories.length : 0,
      })),
    );

    // ✅ 업서트 저장
    for (const payload of payloads) {
      console.log("💾 upsert:", payload.key);
      await GlobalStat.findOneAndUpdate(
        { key: payload.key },
        { $set: payload },
        { upsert: true, new: true },
      ).lean();
    }

    console.log("✅ 저장 완료:", payloads.map((p) => p.key).join(", "));
    console.log("🏁 소요(ms):", Date.now() - startedAt);

    process.exit(0);
  } catch (err) {
    console.error("❌ 오류:", err);
    process.exit(1);
  }
})();
