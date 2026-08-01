# Torn Status Banner

An auto-updating image for your forum signature/thread showing:
- Drug cooldown (ready or time left)
- Booster cooldown (ready or time left)
- Whether your points energy refill is still available today
- Current energy

The forum post itself is never touched again. You embed the image URL **once**
and the image content updates on its own whenever it's requested — no bot ever
performs a Torn action or edits your thread for you, which keeps it clearly on
the right side of Torn's "no automated actions" rule.

## 1. Create a Torn API key with only what you need

Use Torn's custom key builder so the key can't do anything beyond reading this
data (no attack, spend, or trade access):

https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=StatusBanner&user=basic,bars,cooldowns,refills

## 2. Configure

```
cp .env.example .env
# edit .env and paste your key into TORN_API_KEY
```

## 3. Run locally

```
npm install
npm start
```

Visit http://localhost:3000/banner.svg to preview it.

## 4. Deploy somewhere it stays online

Any small always-on Node host works. Free-tier options: Render, Railway, Fly.io,
Glitch. Steps are basically:
1. Push this folder to a GitHub repo (or upload directly if the host allows it).
2. Create a new Web Service pointing at it.
3. Set the `TORN_API_KEY` (and optionally `ENERGY_REFILL_COST`) as environment
   variables in the host's dashboard — don't hardcode it in the repo.
4. Note the public URL it gives you, e.g. `https://your-app.onrender.com`.

## 5. Embed it in your forum post — once

```
[img]https://your-app.onrender.com/banner.svg[/img]
```

Save the post. From now on the image redraws itself; you never edit the thread
again.

## Notes on staying within Torn's rules

- The key only has read access to `bars`, `cooldowns`, and `refills` — nothing
  that can perform an action.
- Requests are cached for 60 seconds server-side, so even if the thread gets a
  lot of views, you won't hammer the API or risk the 100-req/min limit.
- `ENERGY_REFILL_COST` is just a display label (Torn has changed this cost
  before, e.g. 25 vs 30 points) — check the Points page in-game if the number
  looks off and update the `.env` value. It never spends anything.
- If you ever describe this publicly (e.g. in the thread), a one-line note like
  "banner auto-updates via the Torn API, read-only" is good practice per
  Torn's API ToS about not disguising what a key is used for.
