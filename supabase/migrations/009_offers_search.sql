-- بحث نصي يتجاهل اختلاف الإملاء العربي (أ/إ/آ ← ا، ة ← ه، ى ← ي)
create extension if not exists pg_trgm;

alter table offers drop column if exists item_name_norm;
alter table offers add column item_name_norm text
  generated always as (
    lower(translate(item_name, 'أإآىةؤئ', 'ااايهوي'))
  ) stored;

create index if not exists idx_offers_name_norm_trgm
  on offers using gin (item_name_norm gin_trgm_ops);
