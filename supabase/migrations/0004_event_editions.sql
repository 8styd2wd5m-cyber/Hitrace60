alter table events
add column if not exists slug text,
add column if not exists edition_label text,
add column if not exists timezone text not null default 'Europe/Rome',
add column if not exists duplicated_from_event_id uuid references events(id) on delete set null;

create unique index if not exists events_slug_idx on events(slug) where slug is not null;
