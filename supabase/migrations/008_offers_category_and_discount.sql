-- التصنيف يُملأ عند الاستخراج، ويُعبّأ بأثر رجعي للعروض المحفوظة
alter table offers add column if not exists category text;

-- النشرة نادراً ما تكتب نسبة الخصم (23 من 3548)، لكن السعرين متوفران في 99%،
-- فتُحسب النسبة من العمودين بدل الاعتماد على ما تكتبه النشرة
alter table offers drop column if exists discount_pct;
alter table offers add column discount_pct numeric
  generated always as (
    case
      when original_price is not null
       and original_price > 0
       and offer_price is not null
       and offer_price < original_price
      then round(((original_price - offer_price) / original_price) * 100)
    end
  ) stored;

create index if not exists idx_offers_category on offers(category);
create index if not exists idx_offers_discount_pct on offers(discount_pct desc);
create index if not exists idx_offers_category_discount on offers(category, discount_pct desc);
