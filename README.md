# Solmar Heat: Neon Run

![bounty](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/Klowor2002/solmar-heat-v7/rank.svg)
![reward](https://make.fun/badge/gta6-01/Klowor2002/solmar-heat-v7/reward.svg)

A browser 3D open-world crime game built for the make.fun
[gta6-01 "Make GTA 6"](https://make.fun/bounty/gta6-01) bounty — the
sequel chapter of Solmar Heat, rebuilt under neon.

Jax Moreno swore he was done. Mona Reyes has **ten jobs** that say
otherwise: a pickup, a stolen Comet to fence, the Vulture alley, a
timed getaway, a pier deal gone loud, a safehouse defence, a night
deposit, the Neon Run checkpoint dash, an armoured-van intercept, and
the Solmar Bank score that closes the story.

## The city

- A full grid city at dusk: Solmar Tower, the Bank, Reyes Chop Shop,
  Mona's Garage, the Lagoon Hotel, St Brisa Hospital, the PD precinct,
  a beach, a pier and the sea — every landmark signed in neon.
- Lane-true traffic that stops at crossings, 30+ pedestrians who
  stroll, panic and flee, and golden-hour light over all of it.
- The Solmar PD: a five-star wanted system with ramming interceptors,
  flashing lightbars, foot officers, arrests and busted/wasted ends.
- Combat with fists and a pistol, Vulture gang fights, cash/health/
  ammo pickups, particles and camera shake.

## Side economies

- **Chop Shop fencing** — steal any car, sell it at Reyes.
- **Courier** (T), **street race** (G) and **taxi fares** (Y) — always on.
- **Twelve golden tokens** hidden across alleys, rooftops' shadows,
  the beach and the pier.
- Progress, cash and tokens persist in `localStorage`.

## Controls

| Keys | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse | Look (click the view to capture) |
| Shift | Sprint |
| Space | Jump / handbrake |
| E | Enter / exit / steal car |
| Click | Shoot |
| 1 / 2 | Fists / pistol |
| R | Reload |
| M | Next story job |
| T / G / Y | Courier / race / taxi |
| H | Horn |
| Esc | Pause |

## Running it

The game is static: serve `game/` from any static host, or run
`node serve.ts` and open http://localhost:8080. No build step, no
network calls — three.js is vendored under `game/vendor/`.

`main.ts` is the hand-in program: it copies `game/` and
`screenshots/` to the output directory and writes the dossier.

## Referral

Building on make.fun too? Use referral code **ebgtn94a** when you
sign up.

MIT licensed — see `LICENSE`.
