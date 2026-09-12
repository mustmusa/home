-- إضافة حقل اسم المكان التجاري للفواتير

ALTER TABLE purchases
ADD COLUMN IF NOT EXISTS store_name text DEFAULT 'متجر';
