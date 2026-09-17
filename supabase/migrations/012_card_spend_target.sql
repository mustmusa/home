-- جهة الصرف: بُعد مستقل عن التصنيف — التصنيف "ماذا"، والجهة "لمن"
alter table card_transactions
  add column if not exists target_kind text
    check (target_kind in ('house', 'personal', 'warehouse', 'other')),
  add column if not exists target_house_id uuid references houses(id) on delete set null,
  add column if not exists target_label text;

create index if not exists idx_card_txn_target on card_transactions(target_kind);
create index if not exists idx_card_txn_target_house on card_transactions(target_house_id);
