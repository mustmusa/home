-- مصاريف البيت — مخطط قاعدة البيانات
-- شغّل هذا الملف كامل مرة واحدة في: Supabase Dashboard > SQL Editor > New query > Run

create extension if not exists pgcrypto;

-- البيوت (بيت 1، بيت 2)
create table if not exists houses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

insert into houses (id, name)
select gen_random_uuid(), 'بيت 1'
where not exists (select 1 from houses);

insert into houses (id, name)
select gen_random_uuid(), 'بيت 2'
where (select count(*) from houses) < 2;

-- المستخدمون (زوجة 1، زوجة 2، مسؤول المخزن، الأدمن)
-- نفس رقم الجوال ممكن يتكرر لعدة حسابات (أدوار مختلفة)، لكن مو بنفس الدور والبيت مرتين
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  pin_hash text not null,
  role text not null check (role in ('wife', 'warehouse', 'admin')),
  house_id uuid references houses(id),
  created_at timestamptz not null default now(),
  unique (phone, role, house_id)
);

create index if not exists idx_users_phone on users(phone);

-- طلبات المشتريات (بعد تفسير النص بالذكاء الاصطناعي، عنصر واحد لكل سطر)
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references houses(id),
  raw_text text not null,
  item_name text not null,
  quantity_text text,
  status text not null default 'pending' check (status in ('pending', 'purchased', 'cancelled')),
  requested_by uuid references users(id),
  requested_at timestamptz not null default now()
);

create index if not exists idx_requests_house_status on requests(house_id, status);

-- عناصر المخزن (المخزون الحالي)
create table if not exists warehouse_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quantity numeric not null default 0,
  unit text,
  unit_cost numeric,
  category text,
  notes text,
  updated_at timestamptz not null default now()
);

-- الفواتير (فاتورة واحدة قد تحتوي عناصر لبيت 1 وبيت 2 والمخزن معًا، وقد تكون عدة صور لفاتورة طويلة)
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  invoice_image_paths text[],
  purchased_by uuid references users(id),
  purchased_at timestamptz not null default now(),
  total_amount numeric not null default 0,
  warehouse_total numeric not null default 0,
  created_at timestamptz not null default now()
);

-- سطور الفاتورة / السحوبات من المخزن (عنصر واحد لكل سطر)
create table if not exists purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid references purchases(id) on delete cascade,
  item_name text not null,
  quantity numeric,
  unit_price numeric,
  line_total numeric not null default 0,
  destination text not null check (destination in ('house', 'warehouse')),
  house_id uuid references houses(id),
  category text,
  matched_request_id uuid references requests(id),
  source text not null default 'invoice' check (source in ('invoice', 'warehouse_pull')),
  created_at timestamptz not null default now()
);

create index if not exists idx_lines_house_date on purchase_lines(house_id, created_at);
create index if not exists idx_lines_item on purchase_lines(item_name);

-- سجل حركات المخزن (إضافة/سحب) للتدقيق
create table if not exists warehouse_movements (
  id uuid primary key default gen_random_uuid(),
  warehouse_item_id uuid not null references warehouse_items(id) on delete cascade,
  change_qty numeric not null,
  reason text not null check (reason in ('purchase_in', 'pull_out', 'adjustment')),
  related_house_id uuid references houses(id),
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- بعد تشغيل هذا الملف:
-- 1) اذهب إلى Storage في Supabase وأنشئ bucket جديد باسم "invoices" (Private)
-- 2) افتح رابط التطبيق على /setup لإنشاء أول حساب أدمن
-- ============================================================
