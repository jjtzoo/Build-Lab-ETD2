create table if not exists feedback_submission (
  id uuid primary key,
  category text not null default 'GENERAL'
    check (category in ('BUG', 'IDEA', 'GENERAL')),
  message text not null
    check (char_length(trim(message)) between 1 and 4000),
  contact_email text,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed')),
  delivery_error text,
  created_at timestamptz not null default now(),
  notification_sent_at timestamptz
);

create index if not exists feedback_submission_created_at_idx
  on feedback_submission (created_at desc);
