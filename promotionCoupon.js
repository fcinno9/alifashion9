import dbConnect from "./utils/dbConnect.js";
import PromotionCoupon from "./models/PromotionCoupon.js";

(async () => {
  await dbConnect();

  // (KST 기준)
  // 판매 시간: 2/1 00:00 ~ 2/7 23:59 (포함)
  // endAt은 배타적으로 2/8 00:00으로 저장
  //   const doc = {
  //     period: {
  //       startAt: new Date("2026-02-01T00:00:00+09:00"),
  //       endAt: new Date("2026-02-08T00:00:00+09:00"),
  //     },
  //     promotionName: "사랑가득 선물대전 (달러)",

  //     // ✅ 스키마에 coupon만 있으니 코드 문자열은 메타로 남기기 어려움
  //     // 일단 할인 조건만 저장 (minPrice, sale, currency)
  //     coupon: [
  //       { minPrice: 19, sale: 2, couponCode: "LOVEKR02 ", currency: "USD" },
  //       { minPrice: 34, sale: 4, couponCode: "LOVEKR04 ", currency: "USD" },
  //       { minPrice: 53, sale: 6, couponCode: "LOVEKR06 ", currency: "USD" },
  //       { minPrice: 86, sale: 9, couponCode: "LOVEKR09 ", currency: "USD" },
  //       { minPrice: 139, sale: 15, couponCode: "LOVEKR15 ", currency: "USD" },
  //       { minPrice: 239, sale: 26, couponCode: "LOVEKR26 ", currency: "USD" },
  //       { minPrice: 332, sale: 34, couponCode: "LOVEKR34 ", currency: "USD" },
  //       { minPrice: 529, sale: 54, couponCode: "LOVEKR54", currency: "USD" },
  //     ],
  //   };

  // 판매 시간: 2/1 00:00 ~ 2/7 23:59 (포함)
  // endAt은 배타적으로 2/8 00:00으로 저장

  const doc = {
    period: {
      startAt: new Date("2026-02-08T09:00:00+09:00"),
      endAt: new Date("2026-02-24T00:00:00+09:00"),
    },
    promotionName: "설 특가전",

    // ✅ 스키마에 coupon만 있으니 코드 문자열은 메타로 남기기 어려움
    // 일단 할인 조건만 저장 (minPrice, sale, currency)
    coupon: [
      { minPrice: 30000, sale: 3800, couponCode: "AEKP02", currency: "KRW" },
      { minPrice: 50000, sale: 6200, couponCode: "AEKP04", currency: "KRW" },
      { minPrice: 80000, sale: 10000, couponCode: "AEKP07", currency: "KRW" },
      { minPrice: 130000, sale: 14000, couponCode: "AEKP09", currency: "KRW" },
      { minPrice: 200000, sale: 22000, couponCode: "AEKP15", currency: "KRW" },
      { minPrice: 360000, sale: 40000, couponCode: "AEKP26", currency: "KRW" },
      { minPrice: 500000, sale: 50000, couponCode: "AEKP34", currency: "KRW" },
      { minPrice: 800000, sale: 80000, couponCode: "AEKP54", currency: "KRW" },
    ],
  };

  // ✅ 있으면 업데이트 / 없으면 생성
  const saved = await PromotionCoupon.findOneAndUpdate(
    { promotionName: doc.promotionName },
    { $set: doc },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  console.log("✅ 저장 완료:", saved);

  await PromotionCoupon.db.close();
  process.exit(0);
})().catch((err) => {
  console.error("❌ 에러:", err);
  process.exit(1);
});
