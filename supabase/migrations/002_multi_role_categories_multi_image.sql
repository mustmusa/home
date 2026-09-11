-- ترقية 002: أكثر من دور لنفس الجوال + تصنيف العناصر + عدة صور للفاتورة الواحدة
-- شغّل هذا الملف كامل مرة واحدة في: Supabase Dashboard > SQL Editor > New query > Run

-- 1) السماح بنفس رقم الجوال لأكثر من حساب (دور مختلف أو بيت مختلف)
alter table users drop constraint if exists users_phone_key;
alter table users add constraint users_phone_role_house_unique unique (phone, role, house_id);
create index if not exists idx_users_phone on users(phone);

-- 2) تصنيف العناصر (خضار وفواكه، ألبان، لحوم...)
alter table purchase_lines add column if not exists category text;
alter table warehouse_items add column if not exists category text;

-- 3) دعم أكثر من صورة للفاتورة الواحدة (فاتورة طويلة مصوّرة على أجزاء)
alter table purchases add column if not exists invoice_image_paths text[];
update purchases
  set invoice_image_paths = array[invoice_image_path]
  where invoice_image_path is not null and invoice_image_paths is null;
alter table purchases drop column if exists invoice_image_path;
