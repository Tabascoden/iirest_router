# Backup and Restore

Use these commands on the VPS from the repository directory. Do not store backups in a public web directory.

## Backup

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --format=custom \
  > "backups/iirest_router_$(date +%F_%H-%M).dump"
```

If shell environment variables are not available, use explicit values:

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump \
  -U iirest \
  -d iirest_router \
  --format=custom \
  > backups/iirest_router.dump
```

## Restore

Stop the router before restoring:

```bash
docker compose stop router
```

Make a current backup first, then restore:

```bash
docker compose exec -T postgres pg_restore \
  -U iirest \
  -d iirest_router \
  --clean \
  --if-exists \
  < backups/iirest_router.dump
```

Start the router and verify:

```bash
docker compose start router
docker compose exec router npm run smoke
```

## Retention

Keep daily backups for 7 days and weekly backups for 4 weeks. Encrypt backups if they are moved outside the RF VPS. Relay tokens are hashed in the database, but messenger identifiers are PII and must be protected.
