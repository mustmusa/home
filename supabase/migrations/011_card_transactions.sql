-- عمليات البطاقة الائتمانية المستوردة من كشف الحساب
create table if not exists card_transactions (
  id uuid primary key default gen_random_uuid(),

  txn_date date not null,
  posted_date date,
  merchant text not null,
  amount numeric not null,                 -- سالب = مصروف
  foreign_amount numeric,
  foreign_currency text,
  status text not null default 'posted' check (status in ('pending', 'posted')),
  card_last4 text,

  -- يملؤها المستخدم لما لا فاتورة له
  category text,
  note text,
  purchase_id uuid references purchases(id) on delete set null,

  -- (التاريخ + التاجر + المبلغ): نفس التاجر قد يتكرر في اليوم بمبالغ مختلفة،
  -- فالمبلغ جزء لازم من المفتاح وإلا ابتلعت العمليةُ الأخرى
  fingerprint text not null unique,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_card_txn_date on card_transactions(txn_date desc);
create index if not exists idx_card_txn_status on card_transactions(status);
create index if not exists idx_card_txn_purchase on card_transactions(purchase_id);
create index if not exists idx_card_txn_category on card_transactions(category);
