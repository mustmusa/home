import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function uploadInvoice() {
  try {
    const data = JSON.parse(fs.readFileSync("invoice-data.json", "utf-8"));

    // 1) إنشاء سجل الفاتورة
    const { data: purchase, error: purchaseErr } = await supabase
      .from("purchases")
      .insert({
        total_amount: data.total,
        warehouse_total: 0,
        purchased_by: null,
        purchased_at: data.invoiceDate,
      })
      .select()
      .single();

    if (purchaseErr) {
      console.error("❌ خطأ في إنشاء الفاتورة:", purchaseErr);
      return;
    }

    console.log("✅ تم إنشاء الفاتورة:", purchase.id);

    // 2) إضافة السطور
    const lines = data.lines.map((l) => ({
      purchase_id: purchase.id,
      item_name: l.item_name,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: l.line_total,
      destination: "warehouse",
      category: l.category,
      source: "invoice",
    }));

    const { error: linesErr } = await supabase.from("purchase_lines").insert(lines);

    if (linesErr) {
      console.error("❌ خطأ في إضافة السطور:", linesErr);
      return;
    }

    console.log("✅ تم إضافة", lines.length, "سطر");
    console.log("\n📊 ملخص الفاتورة:");
    console.log("   ID:", purchase.id);
    console.log("   المجموع:", data.total);
    console.log("   التاريخ:", data.invoiceDate);
    console.log("   عدد العناصر:", lines.length);

  } catch (error) {
    console.error("❌ خطأ:", error.message);
  }
}

uploadInvoice();
