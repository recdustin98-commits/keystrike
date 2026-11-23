# Keystrike

Type to fly. Blast the rocks in your lane, grab the gold crystals beside it for bonus points.

- **Solo flight**: endless run, 3 lives, gets faster as you go.
- **Co-pilot**: 2–4 players fly one ship together from their own phones. Shared score and lives; everyone sees who is aiming at what.
- **1v1 race**: two players race the same course to a 2,000 m finish line, each in their own ship. Blasting rocks boosts you, getting hit slows you down. Both players tap Ready before the host starts.
- **Daily challenge**: everyone flies the same course each day; scores go to a leaderboard (Beginner and Expert boards).

Static site (no build step). Hosted on Vercel; live multiplayer through Supabase Realtime (`js/net.js`).
Open `/?local=1` to test multiplayer between tabs of one browser without Supabase.
