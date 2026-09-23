-- تصنيفات لا تُحتسب في مصاريف الشهر إطلاقاً: كل عملية تحمل التصنيف تُستثنى،
-- الموجودة منها والقادمة في أي رفع لاحق، بلا تعليم كل عملية على حدة.
create table if not exists card_excluded_categories (
  name text primary key,
  created_at timestamptz not null default now()
);

notify pgrst, 'reload schema';
