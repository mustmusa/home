-- إضافة أعمدة الضريبة

-- جدول purchases
ALTER TABLE purchases
ADD COLUMN IF NOT EXISTS total_with_tax numeric not null default 0;

-- جدول purchase_lines
ALTER TABLE purchase_lines
ADD COLUMN IF NOT EXISTS tax_amount numeric default 0,
ADD COLUMN IF NOT EXISTS total_with_tax numeric default 0;
