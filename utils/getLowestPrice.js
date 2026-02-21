const toKstDate = (rawDate) => new Date(`${rawDate}T00:00:00+09:00`);

const isInPeriod = (rawDate, promo) => {
  const d = toKstDate(rawDate);
  const start = new Date(promo.period.startAt);
  const end = new Date(promo.period.endAt);
  return start <= d && d < end; // endAt 배타적 기준
};

const pickBestCoupon = (basePrice, promosForDay) => {
  if (!promosForDay?.length) return null;

  const coupons = (promosForDay[0].coupon ?? []).slice();
  coupons.sort((a, b) => (b.minPrice ?? 0) - (a.minPrice ?? 0));

  for (const coupon of coupons) {
    if (basePrice >= Number(coupon.minPrice ?? Infinity)) return coupon.sale;
  }
  return null;
};

export const getLowestPrice = (last60, promos) => {
  if (!Array.isArray(last60)) return [];

  return last60
    .slice()
    .sort((a, b) => String(a.t).localeCompare(String(b.t)))
    .map(({ t, p }) => {
      const [, m, d] = String(t).split("-"); // YYYY-MM-DD
      const basePrice = Number(p ?? 0);

      const promosForDay = (promos ?? []).filter((promo) =>
        isInPeriod(t, promo),
      );
      const bestCoupon = pickBestCoupon(basePrice, promosForDay);

      const discountedPrice =
        bestCoupon != null ? Number(basePrice - Number(bestCoupon)) : basePrice;

      return {
        t: t, // "YYYY-MM-DD"
        date: `${Number(m)}.${Number(d)}`, // 표시용
        p: discountedPrice,
        basePrice,
        appliedCoupon: bestCoupon,
        isPromo: promosForDay.length > 0,
        promosForDay,
      };
    });
};
