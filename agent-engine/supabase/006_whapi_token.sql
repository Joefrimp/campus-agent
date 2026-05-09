-- Adds the per-tenant Whapi token column the agent uses for outbound sends.
-- Original 001_initial_schema.sql defined whapi_channels without it because
-- token storage was assumed to live in n8n. We now manage it here.
-- Run AFTER 005_owner_commands.sql.

alter table public.whapi_channels add column if not exists token text;

-- For private channels, an index on whapi_channel_id helps inbound resolution
create index if not exists whapi_channels_chan_id_idx
  on public.whapi_channels (whapi_channel_id);
