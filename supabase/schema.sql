-- Zumrad database schema. Paste the whole file into Supabase -> SQL Editor -> Run.
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('student','teacher','parent')),
  full_name text not null,
  phone text not null,
  pin_hash text not null,
  pin_salt text not null,
  age int,
  school text,
  class_label text,
  father_name text,
  subject text,
  code text unique not null,
  teacher_id uuid references users(id),
  child_id uuid references users(id),
  status text not null default 'approved' check (status in ('approved','pending','rejected')),
  coins int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists users_phone_idx on users(phone);
create index if not exists users_teacher_idx on users(teacher_id);

create table if not exists login_attempts (
  id bigserial primary key,
  phone text not null,
  at timestamptz not null default now()
);
create index if not exists login_attempts_idx on login_attempts(phone, at);

create table if not exists teacher_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  verdict text not null,
  risk int not null,
  reasons jsonb not null default '[]',
  summary text,
  extracted jsonb,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references users(id) on delete cascade,
  subject text not null,
  text text not null,
  file_path text,
  file_type text,
  voice_path text,
  created_at timestamptz not null default now()
);
create index if not exists tasks_teacher_idx on tasks(teacher_id, created_at desc);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  subject text,
  stars int not null,
  understood boolean not null default true,
  copy_risk int not null default 0,
  seconds int not null default 0,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists submissions_student_idx on submissions(student_id, created_at desc);

create table if not exists handwriting (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  score int not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists handwriting_student_idx on handwriting(student_id, created_at desc);

create table if not exists help_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  submission_id uuid references submissions(id) on delete set null,
  subject text,
  mistakes jsonb not null default '[]',
  video_path text,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists help_student_idx on help_requests(student_id, created_at desc);

create table if not exists signatures (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references users(id) on delete cascade,
  child_id uuid not null references users(id) on delete cascade,
  week text not null,
  speed int not null,
  pressure numeric not null,
  forged boolean not null default false,
  img text not null,
  hash text not null,
  prev text not null,
  created_at timestamptz not null default now()
);
create index if not exists signatures_parent_idx on signatures(parent_id, created_at desc);

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create table if not exists announcement_signs (
  announcement_id uuid references announcements(id) on delete cascade,
  parent_id uuid references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (announcement_id, parent_id)
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  items jsonb not null,
  total int not null,
  created_at timestamptz not null default now()
);

create table if not exists market_items (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references users(id) on delete cascade,
  school text,
  title text not null,
  price int,
  kind text not null check (kind in ('sell','swap')),
  reserved_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references users(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create table if not exists replies (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists notebooks (
  student_id uuid primary key references users(id) on delete cascade,
  text text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists rewards_bought (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  item_id text not null,
  price int not null,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,
  meta jsonb not null default '{}',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications(user_id, created_at desc);

-- Lock every table: the browser must never talk to the database directly.
-- The server uses the service_role key, which bypasses RLS.
alter table users enable row level security;
alter table login_attempts enable row level security;
alter table teacher_reviews enable row level security;
alter table tasks enable row level security;
alter table submissions enable row level security;
alter table handwriting enable row level security;
alter table help_requests enable row level security;
alter table signatures enable row level security;
alter table announcements enable row level security;
alter table announcement_signs enable row level security;
alter table orders enable row level security;
alter table market_items enable row level security;
alter table questions enable row level security;
alter table replies enable row level security;
alter table notebooks enable row level security;
alter table rewards_bought enable row level security;
alter table notifications enable row level security;

-- Private bucket for teacher video answers.
insert into storage.buckets (id, name, public) values ('videos', 'videos', false) on conflict (id) do nothing;

-- Manual diploma review: teachers with status 'pending' are waiting for you.
--   select u.id, u.full_name, u.phone, r.risk, r.reasons, r.summary from users u join teacher_reviews r on r.user_id = u.id where u.status = 'pending';
--   update users set status = 'approved' where id = '<id>';
