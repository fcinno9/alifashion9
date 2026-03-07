// models/GlobalStat.js
import mongoose from "mongoose";

const SubCategoriesSchema = new mongoose.Schema({
  _id: false,
  name: String,
  itemCount: Number,
  avgChangeRate: Number,
  avgPrice: Number,
  avgPrice7dSeries: [
    {
      _id: false,
      date: String, // "YYYY-MM-DD" (KST)
      avgPrice: Number, // 해당 날짜 평균가격
    },
  ],
});
const avgPrice7dSeriesSchema = new mongoose.Schema({
  _id: false,
  date: String, // "YYYY-MM-DD" (KST 기준)
  avgPrice: Number, // 해당 날짜 평균 가격
});

const GlobalStatSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
  },

  itemCount: {
    type: Number,
    required: true,
    default: 0,
  },

  avgChangeRate: {
    type: Number,
    required: true,
    default: 0,
  },

  avgPrice: {
    type: Number,
    required: true,
    default: 0,
  },

  subCategories: [SubCategoriesSchema],

  avgPrice7dSeries: [avgPrice7dSeriesSchema],

  computedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

GlobalStatSchema.index({ key: 1 }, { unique: true });

export default mongoose.models.GlobalStat ||
  mongoose.model("GlobalStat", GlobalStatSchema);
