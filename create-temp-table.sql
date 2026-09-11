-- إنشاء جدول البيانات المؤقتة للفواتير (دفعات متعددة)
create table if not exists temp_invoice_batches (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  batch_number int not null,
  image_paths text[],
  extracted_lines jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists idx_temp_batches_session on temp_invoice_batches(session_id);
create index if not exists idx_temp_batches_expires on temp_invoice_batches(expires_at);
