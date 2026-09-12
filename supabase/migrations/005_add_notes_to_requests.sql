-- إضافة حقل الملاحظات إلى جدول الطلبات
ALTER TABLE requests ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS quantity_requested numeric;

-- إضافة فهرس للحالة والتاريخ
CREATE INDEX IF NOT EXISTS idx_requests_status_date ON requests(status, requested_at DESC);
