import mongoose from "mongoose";

// ✅ coupon 배열 원소 스키마 (_id 제거)
const CouponItemSchema = new mongoose.Schema(
  {
    minPrice: { type: Number, required: true },
    sale: { type: Number, required: true },
    couponCode: { type: String, required: true },
    currency: { type: String, required: true },
  },
  { _id: false },
);

// ✅ 루트 스키마 (기간: startAt ~ endAt)
const PromotionCouponSchema = new mongoose.Schema(
  {
    // ✅ 프로모션 기간
    period: {
      startAt: { type: Date, required: true, index: true },
      endAt: { type: Date, required: true, index: true },
    },

    promotionName: { type: String, required: true, index: true },

    coupon: { type: [CouponItemSchema], default: [] },
  },
  { versionKey: false },
);

// ✅ 기간 유효성 검사 (startAt < endAt)
PromotionCouponSchema.pre("validate", function (next) {
  const { startAt, endAt } = this.period || {};
  if (startAt && endAt && startAt >= endAt) {
    this.invalidate("period.endAt", "endAt must be after startAt");
  }
  next();
});

// ✅ 쿼리 최적화 인덱스 (기간 검색용)
PromotionCouponSchema.index({ "period.startAt": 1, "period.endAt": 1 });
PromotionCouponSchema.index({ promotionName: 1 });

const PromotionCoupon =
  mongoose.models.PromotionCoupon ||
  mongoose.model("PromotionCoupon", PromotionCouponSchema);

export default PromotionCoupon;
