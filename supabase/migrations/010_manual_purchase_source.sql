-- السماح بمصدر "إدخال يدوي" للأسطر، تمييزاً لها عن الفواتير المصوّرة
alter table purchase_lines drop constraint if exists purchase_lines_source_check;
alter table purchase_lines add constraint purchase_lines_source_check
  check (source in ('invoice', 'warehouse_pull', 'manual'));
