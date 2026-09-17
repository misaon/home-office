import { z } from "zod";
import { IsoDateTime } from "./domain.ts";

export const REMOTE_PROTOCOL_VERSION = 1;
export const RELAY_MAX_FRAME_BYTES = 1024 * 1024;
export const RELAY_MAX_DEVICES = 16;
export const RELAY_MAX_PAIRINGS = 4;
export const RELAY_FRAMES_PER_WINDOW = 2000;
export const RELAY_WINDOW_MS = 10_000;
export const PAIRING_TTL_MS = 10 * 60 * 1000;
export const DEVICE_TICKET_TTL_MS = 365 * 24 * 60 * 60 * 1000;
export const REMOTE_HANDSHAKE_TIMEOUT_MS = 15_000;

export const Base64Url = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/u)
  .max(2_000_000);
export const RemoteId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/u);
export type RemoteId = z.infer<typeof RemoteId>;

export const DeviceTicket = z.object({ notAfter: IsoDateTime, signature: Base64Url });
export type DeviceTicket = z.infer<typeof DeviceTicket>;

const PairingWindow = z.object({ id: RemoteId, until: IsoDateTime });

export const RelayHello = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("instance"),
    v: z.literal(REMOTE_PROTOCOL_VERSION),
    instanceId: RemoteId,
    publicKey: Base64Url,
    signature: Base64Url,
    revoked: z.array(RemoteId).max(1000),
    pairings: z.array(PairingWindow).max(RELAY_MAX_PAIRINGS),
  }),
  z.object({
    t: z.literal("device"),
    v: z.literal(REMOTE_PROTOCOL_VERSION),
    instanceId: RemoteId,
    instancePublicKey: Base64Url,
    deviceId: RemoteId,
    publicKey: Base64Url,
    ticket: DeviceTicket,
    signature: Base64Url,
  }),
  z.object({
    t: z.literal("pairing"),
    v: z.literal(REMOTE_PROTOCOL_VERSION),
    instanceId: RemoteId,
    pairingId: RemoteId,
  }),
]);
export type RelayHello = z.infer<typeof RelayHello>;

export const InstanceToRelay = z.discriminatedUnion("t", [
  z.object({ t: z.literal("to"), peer: RemoteId, data: z.string() }),
  z.object({ t: z.literal("pairing_open"), id: RemoteId, until: IsoDateTime }),
  z.object({ t: z.literal("pairing_closed"), id: RemoteId }),
  z.object({ t: z.literal("revoke"), deviceId: RemoteId }),
]);
export type InstanceToRelay = z.infer<typeof InstanceToRelay>;

export const PeerToRelay = z.object({ t: z.literal("data"), data: z.string() });
export type PeerToRelay = z.infer<typeof PeerToRelay>;

export const RelayErrorCode = z.enum([
  "bad_hello",
  "bad_signature",
  "bad_ticket",
  "instance_offline",
  "unknown_pairing",
  "revoked",
  "too_many_peers",
  "rate_limited",
  "frame_too_large",
  "protocol",
]);
export type RelayErrorCode = z.infer<typeof RelayErrorCode>;

export const RelayToClient = z.discriminatedUnion("t", [
  z.object({ t: z.literal("challenge"), nonce: Base64Url }),
  z.object({ t: z.literal("welcome"), role: z.enum(["instance", "device", "pairing"]) }),
  z.object({
    t: z.literal("from"),
    peer: RemoteId,
    kind: z.enum(["device", "pairing"]),
    data: z.string(),
  }),
  z.object({ t: z.literal("peer_open"), peer: RemoteId, kind: z.enum(["device", "pairing"]) }),
  z.object({ t: z.literal("peer_closed"), peer: RemoteId }),
  z.object({ t: z.literal("data"), data: z.string() }),
  z.object({ t: z.literal("instance_offline") }),
  z.object({ t: z.literal("error"), code: RelayErrorCode, message: z.string().max(300) }),
]);
export type RelayToClient = z.infer<typeof RelayToClient>;

export const SecureFrame = z.discriminatedUnion("k", [
  z.object({ k: z.literal("hs1"), e: Base64Url, n: Base64Url }),
  z.object({ k: z.literal("hs2"), e: Base64Url, n: Base64Url, m: Base64Url }),
  z.object({ k: z.literal("hs3"), m: Base64Url }),
  z.object({ k: z.literal("d"), c: z.int().positive(), p: Base64Url }),
]);
export type SecureFrame = z.infer<typeof SecureFrame>;

export const RemoteMessage = z.discriminatedUnion("a", [
  z.object({ a: z.literal("rpc"), m: z.string() }),
  z.object({
    a: z.literal("enroll_request"),
    publicKey: Base64Url,
    name: z.string().min(1).max(60),
  }),
  z.object({
    a: z.literal("enrolled"),
    deviceId: RemoteId,
    secret: Base64Url,
    ticket: DeviceTicket,
    instancePublicKey: Base64Url,
  }),
  z.object({ a: z.literal("refused"), reason: z.string().max(300) }),
]);
export type RemoteMessage = z.infer<typeof RemoteMessage>;

const RemoteDevice = z.object({
  id: RemoteId,
  name: z.string().min(1).max(60),
  publicKey: Base64Url,
  pairedAt: IsoDateTime,
  lastSeenAt: IsoDateTime.nullable(),
  revokedAt: IsoDateTime.nullable(),
  online: z.boolean(),
});

export const RemoteStatus = z.object({
  enabled: z.boolean(),
  relayUrl: z.string().nullable(),
  instanceId: RemoteId.nullable(),
  connected: z.boolean(),
  connectedAt: IsoDateTime.nullable(),
  lastError: z.string().nullable(),
  devices: z.array(RemoteDevice),
  pairings: z.array(z.object({ id: RemoteId, name: z.string(), expiresAt: IsoDateTime })),
});
export type RemoteStatus = z.infer<typeof RemoteStatus>;

export const RemoteConfigureInput = z.object({
  enabled: z.boolean().optional(),
  relayUrl: z
    .url({ protocol: /^wss?$/u })
    .nullable()
    .optional(),
});
export type RemoteConfigureInput = z.infer<typeof RemoteConfigureInput>;

export const RemotePairInput = z.object({ name: z.string().min(1).max(60).default("phone") });
export type RemotePairInput = z.infer<typeof RemotePairInput>;

export const RemotePairing = z.object({
  code: z.string(),
  instanceId: RemoteId,
  expiresAt: IsoDateTime,
  relayUrl: z.string().nullable(),
});
export type RemotePairing = z.infer<typeof RemotePairing>;

export const REMOTE_ALLOWED_ROUTES: ReadonlySet<string> = new Set([
  "system.health",
  "projects.list",
  "agents.list",
  "tasks.list",
  "tasks.get",
  "tasks.create",
  "tasks.assign",
  "tasks.transition",
  "tasks.rate",
  "chat.send",
  "sessions.list",
  "sessions.stream",
  "sessions.stop",
  "usage.summary",
  "mail.list",
  "intake.status",
  "events.head",
  "events.subscribe",
]);
