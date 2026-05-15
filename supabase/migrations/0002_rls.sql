-- Veloseller: Row Level Security
alter table sellers enable row level security;
alter table products enable row level security;
alter table data_connections enable row level security;
alter table inventory_snapshots enable row level security;
alter table inventory_events enable row level security;
alter table tvelo_metrics enable row level security;
alter table store_metrics enable row level security;
alter table changelog enable row level security;
alter table alerts enable row level security;

create policy "sellers_self_read" on sellers for select using (auth.uid() = id);
create policy "sellers_self_update" on sellers for update using (auth.uid() = id);
create policy "sellers_self_insert" on sellers for insert with check (auth.uid() = id);
create policy "products_seller_read" on products for select using (auth.uid() = seller_id);
create policy "products_seller_write" on products for all using (auth.uid() = seller_id) with check (auth.uid() = seller_id);
create policy "data_connections_seller_all" on data_connections for all using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

create policy "snapshots_seller_read" on inventory_snapshots for select using (exists (select 1 from products p where p.product_id = inventory_snapshots.product_id and p.seller_id = auth.uid()));
create policy "events_seller_read" on inventory_events for select using (exists (select 1 from products p where p.product_id = inventory_events.product_id and p.seller_id = auth.uid()));
create policy "tvelo_seller_read" on tvelo_metrics for select using (exists (select 1 from products p where p.product_id = tvelo_metrics.product_id and p.seller_id = auth.uid()));
create policy "store_metrics_seller_read" on store_metrics for select using (auth.uid() = seller_id);
create policy "changelog_seller_read" on changelog for select using (auth.uid() = seller_id);
create policy "alerts_seller_all" on alerts for all using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into sellers (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
