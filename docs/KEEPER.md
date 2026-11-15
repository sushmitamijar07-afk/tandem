# Keeper (optional, off by default)

The keeper is an optional automatic settler. Without it, anyone can call `settle` from the round page.

## What it does

1. **Route.** `web/app/api/settle/route.ts` (Node runtime). It returns 401 unless the request has `Authorization: Bearer ${SETTLE_SECRET}`. The secret is compared in constant time.
2. **Scan.** It looks at the last 10 round ids. A round is a candidate if it is closed, still `Open`, has `live > 0`, and has not reached `expireAt`.
3. **Simulate and send.** For each candidate it runs `simulateContract` on `settle`. If the simulation passes, it sends the transaction with `KEEPER_PRIVATE_KEY`, with gas padded by 1.5x.
4. **Sync the TWAP.** If the last pool observation is more than 1,800 s old and the simulation reverted with `SpotTwapDeviation`, it sends `Pool.sync()` once.
5. **Reply.** It returns JSON that lists what it did.

The keeper wallet only needs a small amount of BTC for gas (about 0.001 BTC). Gas on testnet is very cheap.

## Scheduling

Vercel Hobby cron runs only once a day, so a Supabase job calls the route every minute. The job uses `pg_cron` and `pg_net`.

Run this once in the Supabase SQL editor. Replace the placeholders. Never commit the real secret.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Run once. Replace <SETTLE_SECRET> with the value from your secret store. Never commit it.
select vault.create_secret('<SETTLE_SECRET>', 'settle_secret');

-- Call the keeper route every minute. Replace <APP> with the app's Vercel subdomain.
select cron.schedule('batch-settle', '* * * * *', $$
  select net.http_post(
    url := 'https://<APP>.vercel.app/api/settle',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='settle_secret')),
    timeout_milliseconds := 20000);
$$);

-- To stop the keeper:
select cron.unschedule('batch-settle');
```

## Environment variables

Set these in Vercel for the project. Never put real values in the repo.

| Name | Purpose |
|---|---|
| `SETTLE_SECRET` | Bearer secret that the route checks |
| `KEEPER_PRIVATE_KEY` | Keeper wallet key (server only) |
| `NEXT_PUBLIC_INTENT_BOOK` | IntentBook address (TODO until deploy) |
| `NEXT_PUBLIC_PRICE_GUARD` | PriceGuard address (TODO until deploy) |
| `NEXT_PUBLIC_BATCH_SETTLER` | BatchSettler address (TODO until deploy) |

If `KEEPER_PRIVATE_KEY` is not set, the route does nothing.

## Checks

- Call the route without the header and expect 401.
- Call it with the header and expect a JSON reply with no errors.
- Stop the job with `cron.unschedule` if the keeper wallet runs low on BTC.
