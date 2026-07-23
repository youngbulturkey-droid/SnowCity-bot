// roblox-api.js
// Talks to two Roblox APIs:
//   - public Users API (username -> userId lookup, no key required)
//   - Open Cloud MessagingService API (pushes a live message to the running
//     server, which is picked up by the "DiscordAdminBridge" subscriber added
//     to ServerScriptService.AdminCommands)
//
// All persistence (BanData/BanIndex writes, staff chat logs, kicks, public
// ban announcements) happens inside AdminCommands.lua itself, reusing the
// exact same code path as the in-game /ban, /permban, and /ssu commands.
// This file does not touch DataStores directly, so the bot's API key only
// needs the universe-messaging-service:publish scope.

const fetch = require('node-fetch');

const UNIVERSE_ID = process.env.ROBLOX_UNIVERSE_ID;
const API_KEY = process.env.ROBLOX_API_KEY;
const TOPIC = 'DiscordAdminBridge'; // must match DISCORD_BRIDGE_TOPIC in AdminCommands.lua

/** Look up a Roblox UserId from a Roblox username. Returns null if not found. */
async function getUserIdFromUsername(username) {
  const res = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
  });
  const data = await res.json();
  if (!data.data || data.data.length === 0) return null;
  return data.data[0].id;
}

/** Look up a Roblox username from a UserId (for confirmation messages). */
async function getUsernameFromUserId(userId) {
  const res = await fetch(`https://users.roblox.com/v1/users/${userId}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.name || null;
}

async function publish(message) {
  const url = `https://apis.roblox.com/messaging-service/v1/universes/${UNIVERSE_ID}/topics/${encodeURIComponent(TOPIC)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: JSON.stringify(message) })
  });
  if (!res.ok) throw new Error(`MessagingService publish failed (${res.status}): ${await res.text()}`);
}

/** action: "start" | "stop". durationSeconds only applies to "start". */
async function sendSSU(action, durationSeconds) {
  await publish({ type: 'ssu', action, durationSeconds: durationSeconds || null });
}

/**
 * kind: "charname" | "charid" | "robloxname" | "robloxid"
 * The script can only resolve charname/charid among players currently online
 * (same limitation the in-game /ban command has), so for those we just pass
 * kind+value through. For robloxname/robloxid we resolve to a UserId here
 * since that works whether or not the player is online.
 */
async function sendBan({ kind, value, durationMinutes, reason, moderator }) {
  let userId = null;

  if (kind === 'robloxid') {
    userId = /^\d+$/.test(value) ? Number(value) : null;
    if (!userId) throw new Error(`"${value}" is not a valid Roblox Id.`);
  } else if (kind === 'robloxname') {
    userId = await getUserIdFromUsername(value);
    if (!userId) throw new Error(`Could not find a Roblox user named "${value}".`);
  }

  await publish({
    type: 'ban',
    userId, // present for robloxname/robloxid, null for charname/charid
    kind,
    value,
    durationMinutes,
    reason,
    moderator
  });

  return { userId };
}

/**
 * value: a Roblox username or a numeric Roblox Id.
 * Unbanning is always done by UserId (bans are stored keyed by UserId), so we
 * resolve usernames here the same way sendBan does for robloxname/robloxid.
 */
async function sendUnban({ value, moderator }) {
  let userId = /^\d+$/.test(value) ? Number(value) : await getUserIdFromUsername(value);
  if (!userId) throw new Error(`Could not resolve a Roblox user from "${value}".`);

  await publish({
    type: 'unban',
    userId,
    value,
    moderator
  });

  return { userId };
}

module.exports = {
  getUserIdFromUsername,
  getUsernameFromUserId,
  sendSSU,
  sendBan,
  sendUnban
};
