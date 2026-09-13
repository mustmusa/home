-- إنشاء جدول العروض
create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  mall text not null,
  item_name text not null,
  original_price numeric,
  offer_price numeric not null,
  discount_percent numeric,
  description text,
  source text not null default 'pdf' check (source in ('pdf', 'scrape')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- إضافة فهارس للبحث السريع
create index if not exists idx_offers_mall on offers(mall);
create index if not exists idx_offers_created_at on offers(created_at desc);
create index if not exists idx_offers_mall_created_at on offers(mall, created_at desc);

-- تفعيل RLS
alter table offers enable row level security;

-- السماح لمستخدمي الأدمن والمخزن بقراءة جميع العروض
create policy "allow_read_offers_for_admin_warehouse" on offers
  for select
  using (auth.jwt() ->> 'role' in ('admin', 'warehouse'));

-- السماح فقط للأدمن بإضافة عروض جديدة
create policy "allow_insert_offers_for_admin" on offers
  for insert
  with check (auth.jwt() ->> 'role' = 'admin');

-- السماح فقط للأدمن بتحديث العروض
create policy "allow_update_offers_for_admin" on offers
  for update
  using (auth.jwt() ->> 'role' = 'admin')
  with check (auth.jwt() ->> 'role' = 'admin');

-- السماح فقط للأدمن بحذف العروض
create policy "allow_delete_offers_for_admin" on offers
  for delete
  using (auth.jwt() ->> 'role' = 'admin');
