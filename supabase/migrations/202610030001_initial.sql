-- Portion­ed v1 data foundation. Apply with `supabase db push` after linking a project.
create extension if not exists pgcrypto;
create extension if not exists postgis with schema extensions;

create type public.plan_status as enum ('active', 'paused', 'expired');
create type public.friend_request_status as enum ('pending', 'accepted', 'declined');
create type public.session_status as enum ('requested', 'confirmed', 'completed', 'cancelled');

create table public.pilot_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  boundary extensions.geography(polygon, 4326),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  pilot_area_id uuid not null references public.pilot_areas(id),
  chain text not null check (chain in ('Trader Joe''s', 'Costco', 'Whole Foods Market')),
  name text not null,
  location_label text not null,
  address text,
  location extensions.geography(point, 4326),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (pilot_area_id, chain, location_label)
);
create index stores_location_idx on public.stores using gist (location);

-- Public profile fields only. Email, phone, and authentication state stay in auth.users.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  area_label text not null default 'Roosevelt Island + Midtown East',
  bio text not null default '' check (char_length(bio) <= 280),
  avatar_color text not null default 'sage' check (avatar_color in ('sage', 'lavender', 'peach', 'blue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create the public profile when Supabase Auth creates the account.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.item_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true
);
create table public.item_types (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.item_categories(id),
  name text not null,
  normalized_name text not null unique,
  aliases text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category_id, name)
);

create table public.shopping_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  pilot_area_id uuid not null references public.pilot_areas(id),
  status public.plan_status not null default 'active',
  visibility text not null default 'public' check (visibility in ('public', 'friends')),
  availability_label text not null default 'Flexible — let’s coordinate',
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shopping_plans_active_area_idx on public.shopping_plans (pilot_area_id, status, expires_at);

create table public.plan_availability (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.shopping_plans(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);

create table public.plan_stores (
  plan_id uuid not null references public.shopping_plans(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  primary key (plan_id, store_id)
);

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.shopping_plans(id) on delete cascade,
  item_type_id uuid not null references public.item_types(id),
  desired_share_min numeric(5,4) not null default 0.5 check (desired_share_min > 0 and desired_share_min <= 1),
  desired_share_max numeric(5,4) not null default 0.5 check (desired_share_max > 0 and desired_share_max <= 1),
  estimated_package_size numeric(12,3),
  package_size_unit text,
  brand_preference text,
  notes text,
  check (desired_share_max >= desired_share_min),
  check (estimated_package_size is null or estimated_package_size > 0)
);

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status public.friend_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  unique (sender_id, recipient_id)
);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.shopping_sessions (
  id uuid primary key default gen_random_uuid(),
  pilot_area_id uuid not null references public.pilot_areas(id),
  store_id uuid not null references public.stores(id),
  requested_by uuid not null references public.profiles(id),
  status public.session_status not null default 'requested',
  starts_at timestamptz,
  ends_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.session_members (
  session_id uuid not null references public.shopping_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid references public.shopping_plans(id) on delete set null,
  accepted_at timestamptz,
  primary key (session_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.shopping_sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_session_created_idx on public.messages (session_id, created_at);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.shopping_sessions(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  check (reviewer_id <> reviewee_id),
  unique (session_id, reviewer_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.shopping_sessions(id) on delete set null,
  reason text not null check (char_length(reason) between 2 and 80),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved')),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create or replace function public.is_session_member(target_session uuid, target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.session_members sm where sm.session_id = target_session and sm.user_id = target_user); $$;

create or replace function public.are_friends(first_user uuid, second_user uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and ((fr.sender_id = first_user and fr.recipient_id = second_user)
        or (fr.sender_id = second_user and fr.recipient_id = first_user))
  );
$$;

create or replace function public.is_blocked_between(first_user uuid, second_user uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_blocks b where (b.blocker_id = first_user and b.blocked_id = second_user) or (b.blocker_id = second_user and b.blocked_id = first_user));
$$;

-- Safe starter policies. Match/session creation and state transitions should use
-- server-side functions so clients cannot forge accepted sessions or reviews.
alter table public.pilot_areas enable row level security;
alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.item_categories enable row level security;
alter table public.item_types enable row level security;
alter table public.shopping_plans enable row level security;
alter table public.plan_availability enable row level security;
alter table public.plan_stores enable row level security;
alter table public.plan_items enable row level security;
alter table public.friend_requests enable row level security;
alter table public.user_blocks enable row level security;
alter table public.shopping_sessions enable row level security;
alter table public.session_members enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;

create policy "active pilot areas readable by signed in users" on public.pilot_areas for select to authenticated using (active);
create policy "active stores readable by signed in users" on public.stores for select to authenticated using (active);
create policy "categories readable by signed in users" on public.item_categories for select to authenticated using (active);
create policy "item types readable by signed in users" on public.item_types for select to authenticated using (active);

create policy "profiles readable by signed in users" on public.profiles for select to authenticated using (not public.is_blocked_between(auth.uid(), id));
create policy "users create their own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "users update their own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "plans readable by owner or visible friends/public in area" on public.shopping_plans for select to authenticated using (
  owner_id = auth.uid() or (
    status = 'active' and expires_at > now()
    and not public.is_blocked_between(auth.uid(), owner_id)
    and (visibility = 'public' or public.are_friends(auth.uid(), owner_id))
  )
);
create policy "users manage their own plans" on public.shopping_plans for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "plan details visible when parent plan is visible" on public.plan_items for select to authenticated using (exists (select 1 from public.shopping_plans p where p.id = plan_id));
create policy "owners manage plan items" on public.plan_items for all to authenticated using (exists (select 1 from public.shopping_plans p where p.id = plan_id and p.owner_id = auth.uid())) with check (exists (select 1 from public.shopping_plans p where p.id = plan_id and p.owner_id = auth.uid()));
create policy "plan store choices visible when parent plan is visible" on public.plan_stores for select to authenticated using (exists (select 1 from public.shopping_plans p where p.id = plan_id));
create policy "owners manage plan store choices" on public.plan_stores for all to authenticated using (exists (select 1 from public.shopping_plans p where p.id = plan_id and p.owner_id = auth.uid())) with check (exists (select 1 from public.shopping_plans p where p.id = plan_id and p.owner_id = auth.uid()));
create policy "availability visible when parent plan is visible" on public.plan_availability for select to authenticated using (exists (select 1 from public.shopping_plans p where p.id = plan_id));
create policy "owners manage plan availability" on public.plan_availability for all to authenticated using (exists (select 1 from public.shopping_plans p where p.id = plan_id and p.owner_id = auth.uid())) with check (exists (select 1 from public.shopping_plans p where p.id = plan_id and p.owner_id = auth.uid()));

create policy "users read friend requests involving them" on public.friend_requests for select to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy "users send friend requests" on public.friend_requests for insert to authenticated with check (sender_id = auth.uid() and not public.is_blocked_between(sender_id, recipient_id));
create policy "recipients can respond to requests" on public.friend_requests for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy "users remove their own requests" on public.friend_requests for delete to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());

create policy "users manage blocks they created" on public.user_blocks for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy "session rows visible to participants" on public.shopping_sessions for select to authenticated using (public.is_session_member(id));
create policy "session members visible to participants" on public.session_members for select to authenticated using (public.is_session_member(session_id));
create policy "session messages visible to participants" on public.messages for select to authenticated using (public.is_session_member(session_id) and not exists (select 1 from public.session_members sm where sm.session_id = session_id and public.is_blocked_between(auth.uid(), sm.user_id)));
create policy "session participants send messages" on public.messages for insert to authenticated with check (sender_id = auth.uid() and public.is_session_member(session_id));
create policy "reviews visible to signed in users" on public.reviews for select to authenticated using (not public.is_blocked_between(auth.uid(), reviewer_id) and not public.is_blocked_between(auth.uid(), reviewee_id));
create policy "review author can insert" on public.reviews for insert to authenticated with check (reviewer_id = auth.uid());
create policy "reporters and reported users can read reports" on public.reports for select to authenticated using (reporter_id = auth.uid());
create policy "users can submit reports" on public.reports for insert to authenticated with check (reporter_id = auth.uid());

-- Limit exposed roles to the required operations; RLS still decides row access.
grant usage on schema public to authenticated;
grant select on public.pilot_areas, public.stores, public.item_categories, public.item_types, public.profiles to authenticated;
grant insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.shopping_plans, public.plan_availability, public.plan_stores, public.plan_items, public.friend_requests, public.user_blocks to authenticated;
grant select on public.shopping_sessions, public.session_members to authenticated;
grant select, insert on public.messages, public.reviews, public.reports to authenticated;

-- Store and taxonomy rows are intentionally provisioned by an administrator.
insert into public.pilot_areas (name, slug, description)
values ('Roosevelt Island + Midtown East', 'roosevelt-island-midtown-east', 'Open pilot catchment for shoppers willing to meet at participating stores near the Roosevelt Island tramway.')
on conflict (slug) do nothing;

insert into public.stores (pilot_area_id, chain, name, location_label, address)
select a.id, seed.chain, seed.name, seed.location_label, seed.address
from public.pilot_areas a
cross join (values
  ('Trader Joe''s', 'Trader Joe’s — Upper East Side Bridgemarket', '405 E 59th St', '405 E 59th St, New York, NY 10022'),
  ('Whole Foods Market', 'Whole Foods Market — East 57th Street', 'East 57th St', '226 E 57th St, New York, NY 10022'),
  ('Costco', 'Costco — Long Island City', 'Long Island City', null)
) as seed(chain, name, location_label, address)
where a.slug = 'roosevelt-island-midtown-east'
on conflict (pilot_area_id, chain, location_label) do nothing;

with seed(category_name, sort_order, item_names) as (values
  ('Produce', 1, array['Apples','Avocados','Bananas','Berries','Citrus','Grapes','Melons','Peaches & stone fruit','Pears','Tomatoes','Leafy greens','Lettuce','Cabbage','Broccoli','Cauliflower','Carrots','Potatoes','Sweet potatoes','Onions','Garlic','Peppers','Cucumbers','Zucchini & squash','Mushrooms','Fresh herbs','Other fresh produce']),
  ('Meat & poultry', 2, array['Chicken thighs','Chicken breast','Whole chicken','Ground chicken or turkey','Turkey','Ground beef','Beef steak','Beef roast','Pork chops','Ground pork','Pork shoulder','Bacon','Sausage','Lamb','Deli meat','Other meat']),
  ('Seafood', 3, array['Salmon','Tuna','Shrimp','White fish','Shellfish','Smoked fish','Other seafood']),
  ('Dairy & eggs', 4, array['Milk','Cream','Butter','Eggs','Yogurt','Cottage cheese','Cream cheese','Cheddar','Mozzarella','Parmesan','Other cheese','Plant-based milk','Plant-based yogurt','Other dairy']),
  ('Bakery', 5, array['Sandwich bread','Sourdough bread','Bagels','English muffins','Tortillas','Pita & flatbread','Buns & rolls','Pastries','Cookies','Cakes','Other bakery']),
  ('Pantry', 6, array['Rice','Pasta','Beans','Lentils','Flour','Sugar','Oats','Cereal','Cooking oil','Vinegar','Canned tomatoes','Canned vegetables','Canned fruit','Canned fish','Broth & stock','Nut butter','Nuts & seeds','Dried fruit','Spices','Sauces & condiments','Pasta sauce','Baking ingredients','Other pantry item']),
  ('Frozen', 7, array['Frozen vegetables','Frozen fruit','Frozen meat','Frozen seafood','Frozen meals','Frozen pizza','Ice cream','Other frozen item']),
  ('Prepared foods', 8, array['Prepared entrée','Prepared side dish','Prepared salad','Sandwich or wrap','Sushi','Rotisserie chicken','Soup','Hot bar meal','Ready-to-eat snack','Hummus','Prepared dip','Prepared meal kit','Other prepared food']),
  ('Snacks & sweets', 9, array['Chips & crackers','Popcorn','Chocolate','Candy','Granola bars','Snack bars','Dips & spreads','Other snack']),
  ('Beverages', 10, array['Coffee','Tea','Juice','Sparkling water','Still water','Soda','Sports drinks','Other beverage']),
  ('Alcohol', 11, array['Beer','Wine','Spirits','Hard seltzer','Non-alcoholic beer or wine','Other alcoholic beverage']),
  ('Household', 12, array['Dish soap','Laundry detergent','Paper towels','Toilet paper','Trash bags','Food storage bags','Cleaning supplies','Other household item']),
  ('Kitchen & home', 13, array['Food storage container','Cookware','Kitchen utensil','Food wrap & foil','Napkins & tissues','Disposable tableware','Other kitchen or home item']),
  ('Personal care', 14, array['Shampoo & conditioner','Body wash & soap','Toothpaste','Deodorant','Skin care','Other personal care']),
  ('Health & wellness', 15, array['Vitamins & supplements','Pain relief medicine','Allergy medicine','Cold & flu medicine','First aid supplies','Other health item']),
  ('Baby & child', 16, array['Baby formula','Baby food','Diapers','Baby wipes','Baby care','Other baby or child item']),
  ('Pet', 17, array['Dry pet food','Wet pet food','Pet treats','Pet litter','Pet care','Other pet item']),
  ('Flowers & seasonal', 18, array['Flowers','Potted plant','Holiday item','Seasonal decoration','Gift item','Other seasonal item']),
  ('Other grocery', 19, array['Greeting card','Magazine or newspaper','Batteries','Other grocery item'])
), inserted_categories as (
  insert into public.item_categories (name, sort_order)
  select category_name, sort_order from seed
  on conflict (name) do update set sort_order = excluded.sort_order
  returning id, name
)
insert into public.item_types (category_id, name, normalized_name)
select c.id, items.item_name, regexp_replace(lower(items.item_name), '[^a-z0-9]+', '-', 'g')
from seed s
join public.item_categories c on c.name = s.category_name
cross join lateral unnest(s.item_names) as items(item_name)
on conflict (normalized_name) do nothing;
