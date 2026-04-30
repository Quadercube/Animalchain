-- Einmal im Supabase SQL Editor ausführen.

alter table public.game_players
alter column user_id drop not null;

alter table public.games
add column if not exists last_animal text not null default 'Turmfalke';

alter table public.games
add column if not exists current_turn_order int not null default 1;

alter table public.games
add column if not exists mode text not null default 'online';

alter table public.moves
add column if not exists game_player_id uuid references public.game_players(id) on delete set null;

alter table public.moves
add column if not exists guest_name text;

drop policy if exists "moves_delete_all" on public.moves;

create policy "moves_delete_all"
on public.moves
for delete
to anon, authenticated
using (true);
