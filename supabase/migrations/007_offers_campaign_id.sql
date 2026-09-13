-- ربط كل عرض بحملته، حتى تتراكم حملات المول الواحد بدل أن يمسح بعضها بعضاً
alter table offers add column if not exists campaign_id text;

create index if not exists idx_offers_mall_campaign on offers(mall, campaign_id);
