# Current ThingsBoard integration

The configured evaluation target is ThingsBoard 4.4. Automated verification must
use local fakes rather than the LAN target in `.env.example`.

| Boundary  | Existing contract                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| Login     | Gateway forwards username/password to `/api/auth/login`, then reads `/api/auth/user`                       |
| Refresh   | `/api/auth/token`; gateway retains access/refresh tokens in memory                                         |
| Discovery | `/api/entitiesQuery/find` for paged DEVICE/ASSET names; validated time-series and attribute sample catalog |
| Realtime  | Browser `/api/realtime` → gateway → ThingsBoard `/api/ws` with `authCmd`                                   |
| Telemetry | `ENTITY_DATA`/`latestCmd`, grouped by entity; distinct `TIME_SERIES` and `ATTRIBUTE` keys                  |
| Alarms    | `ALARM_DATA`, page 0 / 50 entries; acknowledgement through `/api/alarm/:id/ack`                            |
| Commands  | Published server configuration → `/api/rpc/twoway/:deviceId`                                               |

Realtime subscription input is schema validated with a maximum of 100 bindings.
Gateway/client reconnect paths use bounded backoff; logout revokes sockets.
Heartbeat revalidates the session and refreshes upstream authentication. The browser
normalizes stale quality on interruption. Some upstream response shapes still use
casts/`any`, so actual 4.4 fixture/contract coverage is a recorded gap.

Projects are saved in Twynix's repository, not inside ThingsBoard dashboards.
Owner identity is tenant ID plus user ID. The repository uses either an atomic
JSON replacement with process-local serialization or PostgreSQL transactions,
row/advisory locks and revision checks. PostgreSQL table creation currently occurs
on first use; a migration framework is not implemented.

Commands are disabled by default. Preview does not issue RPC. Enabled runtime
commands resolve the device, method, static parameters and validation policy from
a stored release. Requests supply identity/event/request ID and, for a mapped
control, a typed scalar value. The gateway validates the scalar and inserts it into
the published parameter name; browser-supplied RPC parameters are not authoritative.
Deduplication is process-local for 24 hours and is not durable across restart.
An RPC response is not proof of physical state; equipment interlocks remain outside
this application. No automated test may reach real equipment.

See [isolated testing](../engineering/quality-gates.md) for local test boundaries.

The property binding browser uses paged `/api/entities?type=DEVICE|ASSET&search=…&page=…`
and `/api/entities/:type/:id/catalog` through the session gateway. Catalog reads
keys/time-series values and attribute values; normalized DTOs are schema validated
at gateway and client boundaries. Browser sample previews are fetched snapshots,
while applied bindings keep the existing realtime path. See
[reusable components and bindings](../features/reusable-components-and-bindings.md).

The [control/action editor](../features/control-and-action-editor.md) configures
numeric/choice validation, optional ThingsBoard authority restrictions, response
field checks and client reported-value confirmation. RPC timeout is 5–60 seconds
with the legacy 10-second default; upstream 504 is reported as timeout. Reusing a
request ID with a different resolved value returns conflict. Preview simulation
uses no command endpoint. This does not add team roles, durable command outcome
auditing, server-side process interlocks or production deployment readiness.
