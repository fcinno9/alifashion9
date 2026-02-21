// batch_import.js
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";

import ProductDetail from "./models/ProductDetail.js";
import dbConnect from "./utils/dbConnect.js";

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function importJsonToProductDetailBatch() {
  await dbConnect();

  console.log("✅ connected db:", ProductDetail.db?.name);
  console.log("✅ collection:", ProductDetail.collection?.name);

  const filePath = path.resolve(
    process.cwd(),
    "productdetail_sportsShoes.json",
  );
  const raw = await fs.readFile(filePath, "utf-8");
  const docs = JSON.parse(raw);

  if (!Array.isArray(docs)) {
    throw new Error("JSON 최상위가 배열이 아니야. export 결과를 확인해줘.");
  }

  // ✅ 스키마 required 대응 + 기본값
  const cleaned = docs.map((d) => {
    const { __v, ...rest } = d;
    return {
      ...rest,
      rn: rest.rn ?? 0,
      ps: rest.ps ?? 0,
    };
  });

  const BATCH_SIZE = 300; // ✅ 여기만 조절 (100~500 추천)
  const batches = chunkArray(cleaned, BATCH_SIZE);

  console.log(
    "docs:",
    cleaned.length,
    "batches:",
    batches.length,
    "batchSize:",
    BATCH_SIZE,
  );

  const before = await ProductDetail.estimatedDocumentCount();
  console.log("before estimatedDocumentCount:", before);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    try {
      // ordered:false => 중간 에러 있어도 계속
      // lean/validation은 schema에 따라 필요하면 validateBeforeSave 끄는 선택지도 있음(아래 참고)
      const insertedDocs = await ProductDetail.insertMany(batch, {
        ordered: false,
      });

      ok += insertedDocs.length;

      // 배치 진행 로그
      if ((i + 1) % 10 === 0 || i === 0 || i === batches.length - 1) {
        console.log(
          `✅ batch ${i + 1}/${batches.length} inserted: ${insertedDocs.length} | total ok: ${ok} | fail: ${fail}`,
        );
      }
    } catch (e) {
      // insertMany는 ordered:false여도 “BulkWriteError”로 throw 날 수 있고,
      // 그 안에 insertedDocs / writeErrors 가 들어있는 경우가 많음
      const insertedLen = e?.insertedDocs?.length ?? 0;
      const writeErrorsLen = e?.writeErrors?.length ?? 0;

      ok += insertedLen;
      fail += writeErrorsLen || 0;

      console.log(
        `⚠️ batch ${i + 1}/${batches.length} error | inserted(in error): ${insertedLen} | writeErrors: ${writeErrorsLen}`,
      );

      if (e?.writeErrors?.length) {
        console.log("first writeError:", {
          code: e.writeErrors[0].code,
          errmsg: e.writeErrors[0].errmsg,
          index: e.writeErrors[0].index,
        });
      } else {
        console.log("error message:", e?.message);
      }
    }
  }

  const after = await ProductDetail.estimatedDocumentCount();
  console.log("after estimatedDocumentCount:", after);
  console.log(
    `✅ DONE | ok: ${ok} | fail: ${fail} | delta(count): ${after - before}`,
  );

  // ✅ 샘플 확인 (첫 번째 _id)
  const firstId = cleaned?.[0]?._id;
  if (firstId != null) {
    const found = await ProductDetail.findById(firstId).lean();
    console.log("findById(first):", found ? "FOUND ✅" : "NOT FOUND ❌");
  }
}

importJsonToProductDetailBatch()
  .then(async () => {
    await mongoose.disconnect().catch(() => {});
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("❌ import 실패:", err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
