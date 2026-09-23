-- عمليات تظهر في الكشف لكنها ليست من مصاريف الشهر: سداد البطاقة، حوالة،
-- مبلغ مسترجع، أو أي بند يقرر صاحب الحساب ألّا يُحتسب. تبقى في السجل
-- كاملةً ويُستثنى مبلغها من الإجماليات والتقارير.
alter table card_transactions
  add column if not exists excluded boolean not null default false;

create index if not exists idx_card_txn_excluded on card_transactions(excluded);

notify pgrst, 'reload schema';
