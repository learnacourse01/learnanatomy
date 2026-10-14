# LearnAnatomy — Supabase Setup Guide

This guide sets up Supabase as the single backend for LearnAnatomy: **Auth**, **Database**, and **File Storage**. It's written to match every page you've already designed — Library, Blogs, Practice (MCQ + Essay), Profile, Settings, Pricing/Payments, and Admin — so the schema below isn't generic, it's built directly from your mockups.

Work through this in order. Each step tells you exactly what to click and what to run.

---

## 0. Before you start

You'll need:
- A Supabase account (sign up at supabase.com with GitHub — keeps it tied to the same account you're already using for your repo)
- VS Code open, with a place to paste credentials (a `.env.local` file — never commit this to GitHub)

By the end of this guide you'll have three values to save for when we build the Next.js app:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (⚠️ server-side only, never in frontend code, never committed)

---

## 1. Create the project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. **Name**: `learnanatomy` (or `learnanatomy-prod` if you plan to also make a separate dev/staging project later — recommended once you're past the prototype stage, not required now).
3. **Database password**: generate a strong one and save it in a password manager immediately — you'll need it if you ever connect a external tool directly to Postgres.
4. **Region**: pick the region closest to your actual users. Supabase doesn't currently have a Nigeria/West Africa region, so choose the nearest available (Europe — Frankfurt or London — will generally give Nigerian users better latency than a US region).
5. Click **Create project** and wait (~2 minutes) for provisioning.

Once it's ready:
- Go to **Project Settings → API**. Copy the **Project URL** and the **anon public** key → these are your two `NEXT_PUBLIC_*` values.
- On the same page, reveal and copy the **service_role** key → this is your `SUPABASE_SERVICE_ROLE_KEY`. This key bypasses Row Level Security entirely — it's what your admin approval logic and signed-URL generation will use server-side, and it must never reach the browser.

---

## 2. Set up Authentication

1. Go to **Authentication → Providers**.
2. **Email** provider is on by default — leave it on. This covers your Register/Login page's email/password flow.
3. To enable the "Continue with Google" button you already mocked:
   - Toggle on **Google** provider.
   - You'll need a Google Cloud OAuth Client ID/Secret — create one at [console.cloud.google.com](https://console.cloud.google.com) (APIs & Services → Credentials → OAuth Client ID → Web application), adding Supabase's callback URL (shown on the provider setup screen) as an authorized redirect URI.
   - Paste the Client ID and Secret into Supabase and save. You can skip this step for now and come back once the core app works — email/password alone is enough to launch.
4. Go to **Authentication → URL Configuration**:
   - **Site URL**: set this to your production domain once you have one (or your Render URL for now).
   - **Redirect URLs**: add your local dev URL (`http://localhost:3000/**`) so auth redirects work while building.
5. Go to **Authentication → Email Templates**. Optionally reword the confirmation and password-reset emails to say "LearnAnatomy" instead of the generic default text — purely cosmetic, do this whenever convenient.

**Important concept**: Supabase's built-in `auth.users` table only stores login credentials (email, hashed password, etc.) — it does **not** store your app-specific fields like username, bio, role, or plan. For that, we create our own `profiles` table linked to it, which is what the rest of this guide does first.

---

## 3. Database schema

Go to **SQL Editor → New query** and run each block below in order. They're split into logical groups so you can run them section by section and check for errors as you go, but you can also paste the whole thing at once.

### 3.1 Extensions and custom types

```sql
-- UUIDs for all primary keys
create extension if not exists "uuid-ossp";

-- Enums matching the roles/plans/visibility/statuses used across the app
create type user_role as enum ('student', 'lecturer', 'community_admin', 'master_admin');
create type user_plan as enum ('free', 'plus');
create type account_status as enum ('active', 'suspended', 'deactivated');

create type content_visibility as enum ('public', 'private');
create type approval_status as enum ('pending', 'approved', 'rejected');

create type invite_role as enum ('responder', 'reviewer');
create type notification_type as enum (
  'essay_comment', 'thread_reply', 'book_download', 'essay_vote',
  'approval_status', 'blog_update'
);
```

### 3.2 Profiles (extends auth.users)

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text not null,
  avatar_url text,
  bio text check (char_length(bio) <= 400), -- ~50 words, enforced more precisely in the app
  school text,
  role user_role not null default 'student',
  plan user_plan not null default 'free',
  status account_status not null default 'active',
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever someone signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', 'New user')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

This mirrors your Register form: whatever name/username the person enters gets passed in as `raw_user_meta_data` at signup, and this trigger copies it into `profiles` automatically — no separate "create profile" step needed in your app code.

### 3.3 Library (books)

```sql
create table public.books (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  author text not null,
  category text not null, -- 'textbook' | 'lecture' | 'handout' | 'slide'
  course_code text,
  edition text,
  pages int,
  cover_path text,       -- path inside the `book-covers` bucket
  file_path text,        -- path inside the `library-files` bucket
  drive_link text,       -- fallback for files over 10MB
  description text,
  uploader_id uuid references public.profiles(id),
  status approval_status not null default 'pending',
  reads_count int not null default 0,
  downloads_count int not null default 0,
  created_at timestamptz not null default now()
);
```

### 3.4 Blogs and Threads

```sql
create table public.blog_posts (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  category text not null, -- 'update' | 'study_tips' | 'library' | 'community' | 'research' | 'announcement'
  body text not null,
  author_id uuid references public.profiles(id),
  status approval_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.threads (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  category text not null, -- 'exam_prep' | 'case_discussion' | 'course_help' | 'research' | 'general'
  body text not null,
  author_id uuid references public.profiles(id),
  pinned boolean not null default false,
  flagged boolean not null default false,
  flag_reason text,
  created_at timestamptz not null default now()
);

create table public.thread_replies (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  parent_reply_id uuid references public.thread_replies(id) on delete cascade, -- null = top-level reply
  author_id uuid references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table public.thread_reply_votes (
  reply_id uuid not null references public.thread_replies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  primary key (reply_id, user_id)
);
```

Storing one vote row per (reply, user) — rather than just an upvote/downvote counter on the reply — is what lets you toggle a vote on/off and switch between up and down, exactly like the interaction you designed. Net score is a simple `sum(vote)` query, shown below in the views section.

### 3.5 Practice — MCQ

```sql
create table public.quizzes (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  course_code text,
  category text not null, -- 'gross_anatomy' | 'histology' | 'radiology' | 'embryology' | 'neuroscience' | 'physiology'
  creator_id uuid references public.profiles(id),
  visibility content_visibility not null default 'public',
  time_limit_minutes int not null default 10,
  status approval_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.quiz_questions (
  id uuid primary key default uuid_generate_v4(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_text text not null,
  options jsonb not null,   -- e.g. ["Axillary", "Radial", "Median", "Ulnar"]
  correct_index int not null,
  explanation text,
  sort_order int not null default 0
);

create table public.quiz_attempts (
  id uuid primary key default uuid_generate_v4(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  score int not null,
  total_questions int not null,
  answers jsonb not null,  -- array of the user's picked option indexes, in question order
  completed_at timestamptz not null default now()
);
```

### 3.6 Practice — Essay

```sql
create table public.essay_prompts (
  id uuid primary key default uuid_generate_v4(),
  title text not null,          -- the essay question itself
  category text not null,
  course_code text,
  word_target text,
  time_limit text,
  visibility content_visibility not null default 'public',
  creator_id uuid references public.profiles(id),
  status approval_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- For private prompts: who's allowed to respond or review
create table public.essay_prompt_invites (
  id uuid primary key default uuid_generate_v4(),
  prompt_id uuid not null references public.essay_prompts(id) on delete cascade,
  email text not null,
  role invite_role not null,
  created_at timestamptz not null default now()
);

create table public.essay_answers (
  id uuid primary key default uuid_generate_v4(),
  prompt_id uuid not null references public.essay_prompts(id) on delete cascade,
  author_id uuid references public.profiles(id),
  content text not null,       -- rich text / HTML from the editor
  word_count int,
  visibility content_visibility not null default 'public',
  created_at timestamptz not null default now()
);

create table public.essay_answer_votes (
  answer_id uuid not null references public.essay_answers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  primary key (answer_id, user_id)
);

create table public.essay_comments (
  id uuid primary key default uuid_generate_v4(),
  answer_id uuid not null references public.essay_answers(id) on delete cascade,
  author_id uuid references public.profiles(id),
  role_at_time text not null, -- snapshot of 'Lecturer' / 'Student' at comment time, for the badge
  body text not null,
  created_at timestamptz not null default now()
);
```

### 3.7 Payments (LearnAnatomy Plus)

```sql
create table public.payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id),
  amount numeric(10,2) not null default 1000.00,
  receipt_path text not null,  -- path inside the `payment-receipts` bucket
  note text,
  status approval_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
```

### 3.8 Notifications

```sql
create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type notification_type not null,
  message text not null,
  related_url text,          -- where clicking the notification should take them
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
```

### 3.9 Helpful views (for leaderboards and vote counts)

```sql
-- Net votes per thread reply
create view public.thread_reply_scores as
select reply_id, coalesce(sum(vote), 0) as net_votes
from public.thread_reply_votes
group by reply_id;

-- Net votes per essay answer
create view public.essay_answer_scores as
select answer_id, coalesce(sum(vote), 0) as net_votes
from public.essay_answer_votes
group by answer_id;

-- MCQ leaderboard: total points per user per category
create view public.mcq_leaderboard as
select
  qa.user_id,
  q.category,
  sum(qa.score) as total_points
from public.quiz_attempts qa
join public.quizzes q on q.id = qa.quiz_id
where q.visibility = 'public'
group by qa.user_id, q.category;
```

---

## 4. Row Level Security (RLS)

RLS is what actually enforces your paywall and permission model at the database level — even if someone bypasses your frontend entirely and queries Supabase directly, these rules still apply. **Enable it on every table**, then add policies.

```sql
alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.blog_posts enable row level security;
alter table public.threads enable row level security;
alter table public.thread_replies enable row level security;
alter table public.thread_reply_votes enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.essay_prompts enable row level security;
alter table public.essay_prompt_invites enable row level security;
alter table public.essay_answers enable row level security;
alter table public.essay_answer_votes enable row level security;
alter table public.essay_comments enable row level security;
alter table public.payments enable row level security;
alter table public.notifications enable row level security;
```

### 4.1 A helper function (used by several policies)

```sql
create function public.current_user_role()
returns user_role as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer;
```

### 4.2 Core policies

```sql
-- PROFILES: public profiles page needs everyone to be readable; only you can edit yours
create policy "Profiles are publicly readable"
  on public.profiles for select using (true);
create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- BOOKS: metadata (title/author/description) stays public and crawlable for SEO —
-- this is a deliberate choice matching your Free-tier design: everyone can browse.
create policy "Approved books are publicly readable"
  on public.books for select using (status = 'approved' or uploader_id = auth.uid());
create policy "Plus users and staff can upload"
  on public.books for insert with check (
    exists (select 1 from public.profiles
      where id = auth.uid() and (plan = 'plus' or role in ('community_admin','master_admin')))
  );
create policy "Staff can update book status"
  on public.books for update using (public.current_user_role() in ('community_admin','master_admin'));

-- Note: this policy controls who can see a book's ROW (its metadata).
-- It does NOT control who can download the actual file — that's enforced separately,
-- in your Next.js API route, by generating a signed Storage URL only for Plus users.
-- See Section 6.

-- THREADS & REPLIES: anyone logged in can read/reply/vote; only staff can moderate flags
create policy "Threads are readable by all logged-in users"
  on public.threads for select using (auth.role() = 'authenticated');
create policy "Any user can start a thread if Plus"
  on public.threads for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and plan = 'plus')
  );
create policy "Any authenticated user can reply"
  on public.thread_replies for insert with check (auth.role() = 'authenticated');
create policy "Any authenticated user can vote"
  on public.thread_reply_votes for all using (auth.uid() = user_id);

-- ESSAY PROMPTS: public prompts are open; private prompts only visible to
-- the creator, invited responders/reviewers, and staff
create policy "Public essay prompts are readable by all"
  on public.essay_prompts for select using (
    visibility = 'public'
    or creator_id = auth.uid()
    or exists (
      select 1 from public.essay_prompt_invites i
      join auth.users u on u.email = i.email
      where i.prompt_id = essay_prompts.id and u.id = auth.uid()
    )
    or public.current_user_role() in ('community_admin','master_admin')
  );
create policy "Plus users can create essay prompts"
  on public.essay_prompts for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and plan = 'plus')
  );

-- ESSAY ANSWERS: public answers are open; private answers visible only to author + invitees
create policy "Public essay answers are readable"
  on public.essay_answers for select using (
    visibility = 'public' or author_id = auth.uid()
  );
create policy "Anyone can submit an essay answer"
  on public.essay_answers for insert with check (auth.role() = 'authenticated');

-- PAYMENTS: users submit their own, only Master Admins review
create policy "Users can view their own payments"
  on public.payments for select using (
    user_id = auth.uid() or public.current_user_role() = 'master_admin'
  );
create policy "Users can submit their own payment"
  on public.payments for insert with check (user_id = auth.uid());
create policy "Only Master Admins can update payment status"
  on public.payments for update using (public.current_user_role() = 'master_admin');

-- NOTIFICATIONS: users only ever see their own
create policy "Users see only their own notifications"
  on public.notifications for select using (recipient_id = auth.uid());
create policy "Users can mark their own notifications read"
  on public.notifications for update using (recipient_id = auth.uid());
```

This isn't every policy you'll ever need (quizzes and blog posts follow the same patterns as books/threads above), but it covers the model — copy the pattern for the remaining tables as you build each page.

---

## 5. File Storage — buckets

Go to **Storage** in the dashboard and create these four buckets:

| Bucket name | Public? | Purpose | Size limit |
|---|---|---|---|
| `book-covers` | **Public** | Book thumbnails — everyone needs to see these, even Free users browsing | 2 MB |
| `avatars` | **Public** | Profile pictures | 2 MB |
| `library-files` | **Private** | The actual PDF/DOCX/PPT/XLSX files — this is what's paywalled | 10 MB |
| `payment-receipts` | **Private** | Uploaded bank transfer receipts, admin-only | 10 MB |

For each bucket: click **New bucket**, name it exactly as above, toggle **Public bucket** on only for the two marked Public, and set the file size limit under the bucket's settings. For MIME type restrictions, set:
- `book-covers` / `avatars`: `image/png, image/jpeg, image/jpg, image/gif, image/webp`
- `library-files`: `application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-powerpoint, application/vnd.openxmlformats-officedocument.presentationml.presentation, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `payment-receipts`: `image/png, image/jpeg, image/jpg, application/pdf`

### Storage policies

Public buckets need a read policy so anyone can view images; private buckets should have **no public read policy at all** — access to those only ever happens through your server-side code using the service role key (see Section 6), never directly from the browser.

```sql
-- Allow public read access to the two public buckets
create policy "Public read for book covers"
  on storage.objects for select using (bucket_id = 'book-covers');
create policy "Public read for avatars"
  on storage.objects for select using (bucket_id = 'avatars');

-- Allow any authenticated user to upload their own avatar
create policy "Users can upload their own avatar"
  on storage.objects for insert with check (
    bucket_id = 'avatars' and auth.role() = 'authenticated'
  );

-- Uploading to library-files: only Plus users and staff, matches the books table policy
create policy "Plus users and staff can upload library files"
  on storage.objects for insert with check (
    bucket_id = 'library-files' and
    exists (select 1 from public.profiles
      where id = auth.uid() and (plan = 'plus' or role in ('community_admin','master_admin')))
  );

-- Uploading a payment receipt: any logged-in user, to their own submission
create policy "Users can upload their own payment receipt"
  on storage.objects for insert with check (
    bucket_id = 'payment-receipts' and auth.role() = 'authenticated'
  );
```

Notice there's **no `select` (read) policy for `library-files` or `payment-receipts`** — that's intentional. Nobody, including a logged-in Plus user, reads directly from those buckets. All downloads go through your Next.js API route instead (next section), which checks permissions in application code and then asks Supabase for a temporary signed URL using the service role key. This is what actually makes the 10MB-limit-and-paywall design real rather than just a UI suggestion.

---

## 6. How this connects to the frontend (preview)

You don't need to build this yet — just so the shape makes sense before we get there:

```
Browser (Plus user clicks a book)
   → Next.js API route: /api/books/[id]/download
      → checks: is this user's plan === 'plus'? (query profiles table)
      → if yes: supabase.storage.from('library-files').createSignedUrl(path, 60)
      → returns a URL valid for 60 seconds
   → Browser redirects to that signed URL, file downloads
```

A Free user hitting that same route gets rejected before Supabase is ever asked for a URL — this is where your pricing-modal-vs-real-content logic actually lives on the backend.

---

## 7. Seed some test data

Before wiring up the frontend, it's worth manually inserting a few rows via **Table Editor → profiles** (and the other tables) so you're not building against an empty database. Recreate a handful of the personas already used throughout your mockups — Aniekan Briggs, F. Etim, Dr. O. Ominde, Nelson Ejumedia — with the roles and plans they already have in your designs. This means your first real frontend pages will look right immediately, instead of showing blank states everywhere.

---

## 8. Keep your project awake

Like Render, **Supabase free-tier projects pause automatically after 7 days with no API activity.** Set up a simple free keep-alive once your project has real data in it:
- A GitHub Actions workflow scheduled every 3–4 days that makes one lightweight request to your Supabase project (e.g. `select 1`) is enough — same idea as the Render cron ping discussed earlier, just pointed at a different service.

---

## 9. What you should have when this is done

- [ ] Supabase project created, region chosen
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` saved somewhere safe (not in Git)
- [ ] Email auth enabled; Google OAuth optionally configured
- [ ] All tables from Section 3 created
- [ ] RLS enabled on every table, core policies from Section 4 applied
- [ ] Four storage buckets created with the right public/private settings and policies
- [ ] A few seed rows in `profiles` and `books` so the database isn't empty
- [ ] A keep-alive ping scheduled

Once this is in place, the next step is scaffolding the Next.js app and connecting it to these credentials — that's a separate build step from this guide.
