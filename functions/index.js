const functions = require("firebase-functions/v1");
const crypto = require("crypto");
const Anthropic = require("@anthropic-ai/sdk");
const { initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getStorage } = require("firebase-admin/storage");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();
const bucket = getStorage().bucket();

const GCAL_CLIENT_ID = "473409624300-jq90dnic5pb52ag1rfabej4mkhdav28a.apps.googleusercontent.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

function googleCalendarClientSecret() {
  return process.env.GCAL_CLIENT_SECRET || "";
}

async function deleteStoragePath(path) {
  if (!path) return;
  try { await bucket.file(path).delete({ ignoreNotFound: true }); }
  catch (e) { console.warn("deleteStoragePath:", path, e.message); }
}

function isInvalidFcmTokenError(error) {
  const code = error?.code || "";
  return code === "messaging/registration-token-not-registered" ||
    code === "messaging/invalid-registration-token" ||
    code === "messaging/invalid-argument";
}

async function sendToUserTokens(userRef, tokens, payload, label = "notification") {
  const uniqueTokens = [...new Set((tokens || []).filter(Boolean))];
  if (!uniqueTokens.length) return { successCount: 0, failureCount: 0, responses: [] };

  try {
    const result = await messaging.sendEachForMulticast({ tokens: uniqueTokens, ...payload });
    const invalidTokens = [];
    result.responses.forEach((r, i) => {
      if (!r.success) {
        const err = r.error;
        console.warn(`${label} token[${i}]:`, err?.code, err?.message);
        if (isInvalidFcmTokenError(err)) invalidTokens.push(uniqueTokens[i]);
      }
    });
    if (invalidTokens.length) {
      await userRef.update({ fcmTokens: FieldValue.arrayRemove(...invalidTokens) });
      console.log(`${label}: pruned ${invalidTokens.length} invalid FCM token(s)`);
    }
    return result;
  } catch (e) {
    console.error(`${label} FCM error:`, e.message);
    return { successCount: 0, failureCount: uniqueTokens.length, responses: [] };
  }
}

const EVENT_REMINDER_OFFSETS_MS = {
  "3week": 21 * 24 * 60 * 60 * 1000,
  "2week": 14 * 24 * 60 * 60 * 1000,
  "1week": 7 * 24 * 60 * 60 * 1000,
  "3day": 3 * 24 * 60 * 60 * 1000,
  "1day": 24 * 60 * 60 * 1000,
  "dayof": 2 * 60 * 60 * 1000
};

const EVENT_REMINDER_LABELS = {
  "3week": "in 3 weeks",
  "2week": "in 2 weeks",
  "1week": "in 1 week",
  "3day": "in 3 days",
  "1day": "tomorrow",
  "dayof": "today"
};

function eventStartMs(event = {}) {
  if (Number.isFinite(event.eventAtMs)) return event.eventAtMs;
  if (!event.date || !event.time) return null;
  const [y, m, d] = String(event.date).split("-").map(Number);
  const [h, min] = String(event.time).split(":").map(Number);
  const ms = new Date(y, (m || 1) - 1, d || 1, h || 0, min || 0).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function calendarEventBody(ev = {}) {
  const startsAt = eventStartMs(ev);
  if (!startsAt) return null;
  const start = new Date(startsAt);
  const end = new Date(startsAt + 60 * 60 * 1000);
  const timeZone = ev.timezone || "UTC";
  return {
    summary: ev.title || "Event",
    description: ev.description || "",
    location: ev.location || "",
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
    reminders: { useDefault: true }
  };
}

function eventSyncRecipients(ev = {}) {
  const accepted = (ev.invitees || [])
    .filter(inv => inv && inv.uid && inv.status === "accepted")
    .map(inv => inv.uid);
  return [...new Set([ev.creatorUid, ...accepted].filter(Boolean))];
}

function gcalTokenRef(uid) {
  return db.collection("googleCalendarTokens").doc(uid);
}

async function exchangeGoogleAuthCode(uid, code) {
  const clientSecret = googleCalendarClientSecret();
  if (!clientSecret) {
    throw new functions.https.HttpsError("failed-precondition", "Google Calendar server secret is not configured.");
  }
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GCAL_CLIENT_ID,
      client_secret: clientSecret,
      redirect_uri: "postmessage",
      grant_type: "authorization_code"
    })
  });
  const data = await res.json().catch(() => ({}));
  const now = Date.now();
  if (!res.ok || !data.refresh_token) {
    const existing = await gcalTokenRef(uid).get();
    if (res.ok && existing.exists && existing.data().refreshToken && data.access_token) {
      await existing.ref.set({
        accessToken: data.access_token,
        accessTokenExpiresAt: now + ((data.expires_in || 3600) * 1000) - 60000,
        scope: data.scope || existing.data().scope || "",
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return;
    }
    console.warn("exchangeGoogleAuthCode:", res.status, data.error || data.error_description || data);
    throw new functions.https.HttpsError("permission-denied", "Google did not return a long-term Calendar token.");
  }
  await gcalTokenRef(uid).set({
    refreshToken: data.refresh_token,
    accessToken: data.access_token || "",
    accessTokenExpiresAt: now + ((data.expires_in || 3600) * 1000) - 60000,
    scope: data.scope || "",
    linkedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

async function googleAccessToken(uid) {
  const tokenSnap = await gcalTokenRef(uid).get();
  if (!tokenSnap.exists || !tokenSnap.data().refreshToken) return null;
  const token = tokenSnap.data();
  if (token.accessToken && token.accessTokenExpiresAt && token.accessTokenExpiresAt > Date.now() + 60000) {
    return token.accessToken;
  }
  const clientSecret = googleCalendarClientSecret();
  if (!clientSecret) return null;
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GCAL_CLIENT_ID,
      client_secret: clientSecret,
      refresh_token: token.refreshToken,
      grant_type: "refresh_token"
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.warn("googleAccessToken refresh:", uid, res.status, data.error || data.error_description || data);
    return null;
  }
  await tokenSnap.ref.set({
    accessToken: data.access_token,
    accessTokenExpiresAt: Date.now() + ((data.expires_in || 3600) * 1000) - 60000,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return data.access_token;
}

async function googleCalendarRequest(uid, url, options = {}) {
  const accessToken = await googleAccessToken(uid);
  if (!accessToken) return { ok: false, status: 401, data: null };
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function googleCalendarEventId(uid, eventId) {
  // Google event ids must use base32hex characters; a hex digest is a safe subset.
  return `db${crypto.createHash("sha256").update(`${uid}:${eventId}`).digest("hex").slice(0, 32)}`;
}

function dateKeyInTimeZone(value, timeZone = "UTC") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function previousDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) return dateKey || "";
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

async function upsertGoogleCalendarEvent(uid, eventId, ev = {}) {
  const body = calendarEventBody(ev);
  if (!body) return null;
  const existingId = ev.googleCalIds?.[uid] || googleCalendarEventId(uid, eventId);
  if (existingId) {
    const patch = await googleCalendarRequest(uid, `${GOOGLE_CALENDAR_API}/${encodeURIComponent(existingId)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    if (patch.ok) return existingId;
    if (patch.status !== 404 && patch.status !== 410) return null;
  }
  const deterministicId = googleCalendarEventId(uid, eventId);
  const created = await googleCalendarRequest(uid, GOOGLE_CALENDAR_API, {
    method: "POST",
    body: JSON.stringify({ ...body, id: deterministicId })
  });
  if (created.ok && created.data?.id) return created.data.id;
  if (created.status === 409) {
    const patch = await googleCalendarRequest(uid, `${GOOGLE_CALENDAR_API}/${encodeURIComponent(deterministicId)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    if (patch.ok) return deterministicId;
  }
  return null;
}

async function deleteGoogleCalendarEvent(uid, googleEventId) {
  if (!googleEventId) return;
  await googleCalendarRequest(uid, `${GOOGLE_CALENDAR_API}/${encodeURIComponent(googleEventId)}`, { method: "DELETE" });
}

async function syncEventToLinkedGoogleCalendars(eventId, ev = {}) {
  if (!ev || ev.isActive === false) return {};
  const updates = {};
  for (const uid of eventSyncRecipients(ev)) {
    const googleEventId = await upsertGoogleCalendarEvent(uid, eventId, ev);
    if (googleEventId && googleEventId !== ev.googleCalIds?.[uid]) updates[`googleCalIds.${uid}`] = googleEventId;
  }
  return updates;
}

function eventRelevantSnapshot(ev = {}) {
  return JSON.stringify({
    title: ev.title || "",
    description: ev.description || "",
    location: ev.location || "",
    date: ev.date || "",
    time: ev.time || "",
    eventAtMs: ev.eventAtMs || null,
    timezone: ev.timezone || "",
    creatorUid: ev.creatorUid || "",
    isActive: ev.isActive !== false,
    invitees: (ev.invitees || []).map(inv => ({ uid: inv.uid, status: inv.status })).sort((a, b) => String(a.uid).localeCompare(String(b.uid)))
  });
}

async function writeEventMessage(toUid, type, fromName, fromUid, extra, dedupeKey) {
  if (!toUid || !dedupeKey) return;
  const ref = db.collection("encouragements").doc(toUid).collection("messages").doc(dedupeKey);
  const existing = await ref.get();
  if (existing.exists) return;
  await ref.set({
    type,
    fromName,
    fromUid,
    processed: false,
    createdAt: FieldValue.serverTimestamp(),
    ...extra
  });
}

exports.googleCalendarStatus = functions.https.onCall(async (_data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
  const snap = await gcalTokenRef(context.auth.uid).get();
  return { linked: snap.exists && !!snap.data().refreshToken, configured: !!googleCalendarClientSecret() };
});

exports.connectGoogleCalendar = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
  const code = String(data?.code || "");
  if (!code) throw new functions.https.HttpsError("invalid-argument", "Missing Google authorization code.");
  await exchangeGoogleAuthCode(context.auth.uid, code);

  const upcoming = await db.collection("events")
    .where("participantUids", "array-contains", context.auth.uid)
    .where("isActive", "==", true)
    .limit(100)
    .get();
  for (const eventDoc of upcoming.docs) {
    const ev = eventDoc.data();
    const isCreator = ev.creatorUid === context.auth.uid;
    const accepted = (ev.invitees || []).some(inv => inv.uid === context.auth.uid && inv.status === "accepted");
    if (!isCreator && !accepted) continue;
    const googleEventId = await upsertGoogleCalendarEvent(context.auth.uid, eventDoc.id, ev);
    if (googleEventId && googleEventId !== ev.googleCalIds?.[context.auth.uid]) {
      await eventDoc.ref.update({ [`googleCalIds.${context.auth.uid}`]: googleEventId, updatedAt: FieldValue.serverTimestamp() });
    }
  }
  return { linked: true };
});

exports.disconnectGoogleCalendar = functions.https.onCall(async (_data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
  await gcalTokenRef(context.auth.uid).delete();
  return { linked: false };
});

exports.syncGoogleCalendarEvent = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
  const eventId = String(data?.eventId || "");
  if (!eventId) throw new functions.https.HttpsError("invalid-argument", "Missing event id.");
  const ref = db.collection("events").doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError("not-found", "Event not found.");
  const ev = snap.data();
  if (!(ev.participantUids || []).includes(context.auth.uid)) {
    throw new functions.https.HttpsError("permission-denied", "Not an event participant.");
  }
  const googleEventId = await upsertGoogleCalendarEvent(context.auth.uid, eventId, ev);
  if (googleEventId && googleEventId !== ev.googleCalIds?.[context.auth.uid]) {
    await ref.update({ [`googleCalIds.${context.auth.uid}`]: googleEventId, updatedAt: FieldValue.serverTimestamp() });
  }
  return { synced: !!googleEventId };
});

exports.listGoogleCalendarDayEvents = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
  const date = String(data?.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new functions.https.HttpsError("invalid-argument", "Missing event date.");
  }
  const timeZone = String(data?.timezone || "UTC");
  const [year, month, day] = date.split("-").map(Number);
  const timeMin = new Date(Date.UTC(year, month - 1, day - 1, 0, 0, 0)).toISOString();
  const timeMax = new Date(Date.UTC(year, month - 1, day + 2, 0, 0, 0)).toISOString();
  const items = [];
  let pageToken = "";
  do {
    const params = {
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "100",
      timeZone,
      fields: "items(id,summary,start,end),nextPageToken"
    };
    if (pageToken) params.pageToken = pageToken;
    const url = `${GOOGLE_CALENDAR_API}?${new URLSearchParams(params)}`;
    const res = await googleCalendarRequest(context.auth.uid, url, { method: "GET" });
    if (!res.ok) return { linked: false, events: [] };
    items.push(...(Array.isArray(res.data?.items) ? res.data.items : []));
    pageToken = res.data?.nextPageToken || "";
  } while (pageToken && items.length < 500);
  const events = items
    .map(item => {
      const allDayDate = item.start?.date || "";
      const startsAt = item.start?.dateTime || allDayDate;
      const endsAt = item.end?.dateTime || item.end?.date || "";
      const itemDate = allDayDate || dateKeyInTimeZone(startsAt, timeZone);
      const endDate = allDayDate
        ? previousDateKey(endsAt || allDayDate)
        : dateKeyInTimeZone(new Date(new Date(endsAt || startsAt).getTime() - 1), timeZone);
      return {
        id: item.id || "",
        title: item.summary || "Untitled event",
        startsAt,
        endsAt,
        allDay: !!allDayDate,
        date: itemDate,
        endDate
      };
    })
    .filter(item => item.date <= date && (item.endDate || item.date) >= date);
  return { linked: true, events };
});

async function shareRecentCommunityPostsBetweenFriends(uidA, uidB) {
  if (!uidA || !uidB) return;
  const now = Date.now();
  const pairs = [
    { authorUid: uidA, newAudienceUid: uidB },
    { authorUid: uidB, newAudienceUid: uidA }
  ];

  for (const pair of pairs) {
    const snap = await db.collection("communityPosts")
      .where("authorUid", "==", pair.authorUid)
      .limit(30)
      .get();

    const batch = db.batch();
    let count = 0;
    snap.docs.forEach(doc => {
      const post = doc.data();
      if (post.isActive === false) return;
      if (post.expiresAtMs && post.expiresAtMs <= now) return;
      batch.update(doc.ref, { audienceUids: FieldValue.arrayUnion(pair.newAudienceUid) });
      count += 1;
    });
    if (count) await batch.commit();
  }
}

async function deleteQueryInBatches(query, batchSize = 250) {
  const snap = await query.limit(batchSize).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  if (snap.size === batchSize) return deleteQueryInBatches(query, batchSize);
}

async function cleanupDeletedUserData(uid) {
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const username = (userData.username || "").toLowerCase().trim();
  const displayName = (userData.displayName || "").toLowerCase().trim();

  const baseBatch = db.batch();
  if (username) baseBatch.delete(db.collection("usernames").doc(username));
  if (displayName) baseBatch.delete(db.collection("displayNames").doc(displayName));
  baseBatch.delete(userRef);
  baseBatch.delete(db.collection("xp_board").doc(uid));
  baseBatch.delete(db.collection("scholar_board").doc(uid));
  baseBatch.delete(db.collection("consistency_board").doc(uid));
  await baseBatch.commit();

  const friendSnap = await db.collection("users")
    .where("friends", "array-contains", uid)
    .limit(300)
    .get();
  if (!friendSnap.empty) {
    const batch = db.batch();
    friendSnap.docs.forEach(doc => batch.update(doc.ref, {
      friends: FieldValue.arrayRemove(uid),
      friendRequestsIn: FieldValue.arrayRemove(uid),
      friendRequestsOut: FieldValue.arrayRemove(uid),
      updatedAt: FieldValue.serverTimestamp()
    }));
    await batch.commit();
  }

  await deleteQueryInBatches(db.collection("encouragements").doc(uid).collection("messages"));

  const authoredPosts = await db.collection("communityPosts")
    .where("authorUid", "==", uid)
    .limit(300)
    .get();
  if (!authoredPosts.empty) {
    const batch = db.batch();
    authoredPosts.docs.forEach(doc => batch.update(doc.ref, {
      isActive: false,
      deletedAt: FieldValue.serverTimestamp()
    }));
    await batch.commit();
  }

  const audiencePosts = await db.collection("communityPosts")
    .where("audienceUids", "array-contains", uid)
    .limit(300)
    .get();
  if (!audiencePosts.empty) {
    const batch = db.batch();
    let count = 0;
    audiencePosts.docs.forEach(doc => {
      if (doc.data().authorUid === uid) return;
      batch.update(doc.ref, {
        [`reactions.${uid}`]: FieldValue.delete(),
        [`prayers.${uid}`]: FieldValue.delete()
      });
      count += 1;
    });
    if (count) await batch.commit();
  }

  const mercyPosts = await db.collection("merciesPosts")
    .where("audienceUids", "array-contains", uid)
    .limit(300)
    .get();
  if (!mercyPosts.empty) {
    const batch = db.batch();
    const storageDeletes = [];
    let count = 0;
    mercyPosts.docs.forEach(doc => {
      if (doc.data().authorUid === uid) {
        storageDeletes.push(deleteStoragePath(doc.data().imagePath));
        batch.update(doc.ref, {
          isActive: false,
          deletedAt: FieldValue.serverTimestamp()
        });
      } else {
        batch.update(doc.ref, { [`reactions.${uid}`]: FieldValue.delete() });
      }
      count += 1;
    });
    if (count) await batch.commit();
    await Promise.all(storageDeletes);
  }
  await deleteQueryInBatches(db.collection("users").doc(uid).collection("merciesJournal"));


  const comments = await db.collectionGroup("comments")
    .where("authorUid", "==", uid)
    .limit(300)
    .get();
  if (!comments.empty) {
    const batch = db.batch();
    comments.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }

  const studies = await db.collection("studies")
    .where("collaboratorUids", "array-contains", uid)
    .limit(300)
    .get();
  for (const studyDoc of studies.docs) {
    const study = studyDoc.data();
    if (study.creatorUid !== uid) {
      await studyDoc.ref.update({
        collaboratorUids: FieldValue.arrayRemove(uid),
        pendingCollaboratorUids: FieldValue.arrayRemove(uid)
      });
      continue;
    }

    for (const sub of ["notes", "entries", "savedVerses", "wordLog", "trails", "structures"]) {
      await deleteQueryInBatches(studyDoc.ref.collection(sub));
    }
    await studyDoc.ref.delete();
  }
}

exports.cleanupDeletedAuthUser = functions.auth.user().onDelete(async user => {
  await cleanupDeletedUserData(user.uid);
  return null;
});

exports.cleanupExpiredMercies = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async () => {
    const now = Date.now();
    const snap = await db.collection("merciesPosts")
      .where("expiresAtMs", "<=", now)
      .limit(100)
      .get();
    if (snap.empty) return null;

    const batch = db.batch();
    for (const doc of snap.docs) {
      const post = doc.data();
      const hasJournal = (post.journalSavedBy || []).length > 0;
      if (hasJournal) {
        batch.update(doc.ref, {
          isActive: false,
          expiredAt: FieldValue.serverTimestamp()
        });
      } else {
        await deleteStoragePath(post.imagePath);
        batch.delete(doc.ref);
      }
    }
    await batch.commit();
    return null;
  });

function getLocalParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const pick = type => parts.find(p => p.type === type)?.value;
  const hour = Number(pick("hour"));
  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    weekday: pick("weekday"),
    hour: hour === 24 ? 0 : hour,
    minute: Number(pick("minute"))
  };
}

function zonedTimeToUtc({ year, month, day, hour, minute }, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const localAtGuess = getLocalParts(new Date(utcGuess), timeZone);
  const localAsUtc = Date.UTC(
    localAtGuess.year,
    localAtGuess.month - 1,
    localAtGuess.day,
    localAtGuess.hour,
    localAtGuess.minute
  );
  return new Date(utcGuess - (localAsUtc - utcGuess));
}

function reminderAllowsWeekday(frequency, weekday) {
  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  const isWeekend = ["Sat", "Sun"].includes(weekday);
  if (frequency === "weekdays") return isWeekday;
  if (frequency === "weekends") return isWeekend;
  return true;
}

function calculateNextReminderDate(reminder, afterDate = new Date()) {
  const [hour, minute] = String(reminder.time || "").split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;

  const timeZone = reminder.timezone || "UTC";
  const frequency = reminder.frequency || "daily";
  const base = getLocalParts(afterDate, timeZone);

  for (let offset = 0; offset <= 8; offset++) {
    const localDay = new Date(Date.UTC(base.year, base.month - 1, base.day + offset));
    const candidate = zonedTimeToUtc({
      year: localDay.getUTCFullYear(),
      month: localDay.getUTCMonth() + 1,
      day: localDay.getUTCDate(),
      hour,
      minute
    }, timeZone);
    const candidateLocal = getLocalParts(candidate, timeZone);
    if (!reminderAllowsWeekday(frequency, candidateLocal.weekday)) continue;
    if (candidate > afterDate) return candidate;
  }
  return null;
}

function calculateNextMercyFriendDate(reminder, afterDate = new Date()) {
  const base = new Date(afterDate.getTime() + (1 + Math.floor(Math.random() * 7)) * 86400000);
  return calculateNextReminderDate({ ...reminder, frequency: "daily" }, base);
}

function mercyDateKey(ms = Date.now(), timeZone = "UTC") {
  const local = getLocalParts(new Date(ms), timeZone || "UTC");
  return `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
}

const HABIT_REMINDER_MESSAGES = [
  "You better not forget to do {name} today!",
  "Don't be a loser and give up on {name} — complete it!",
  "{name} isn't going to do itself. Get on it!",
  "Your streak is on the line. Time to crush {name}!",
  "Hey! {name} is calling your name. Answer it.",
  "Future you will thank present you for doing {name} today.",
  "You've been so consistent with {name}. Don't break that streak now!",
  "Okay, it's time. {name}. Go. Now.",
  "Did you forget about {name}? It definitely didn't forget about you.",
  "Champions don't skip {name}. You're a champion — prove it!",
  "Still haven't done {name}? The clock is ticking!",
  "Time to stop scrolling and do {name}.",
  "You said you were going to do {name}. We both know you meant it.",
  "Every great achiever does {name} daily. Just saying.",
  "Rise up and crush {name} today. No excuses!",
  "One small step: {name}. You've totally got this.",
  "Be the person who never skips {name}. That person is legendary.",
  "The only bad {name} session is the one you skip.",
  "No excuses. {name}. Do it.",
  "{name} won't complete itself — but you will. Let's go!"
];

function randomHabitReminderMessage(habitName) {
  const msg = HABIT_REMINDER_MESSAGES[Math.floor(Math.random() * HABIT_REMINDER_MESSAGES.length)];
  return msg.replace(/{name}/g, habitName || "your habit");
}

const PRAISE_PROMPTS = [
  "What good gift can you praise God for today?",
  "What ordinary blessing did you notice today?",
  "What truth from Scripture helped you think clearly today?",
  "What is something you ate today that you enjoyed?",
  "What conversation from today are you thankful for?",
  "What simple comfort did you receive today?",
  "What part of creation caught your attention today?",
  "What task did you get through that you can thank God for?",
  "What song, verse, or thought helped your heart today?",
  "What small moment made your day lighter?",
  "What is one answered prayer, large or small, you want to remember?",
  "What is one reason to praise the Lord today?"
];

function randomPraisePrompt() {
  return PRAISE_PROMPTS[Math.floor(Math.random() * PRAISE_PROMPTS.length)];
}

const PRAISE_FRIEND_PROMPTS = [
  "What is one way {friend} has encouraged you?",
  "What is something you appreciate about {friend}?",
  "What is one Christlike quality you see in {friend}?",
  "What is a time {friend} made you smile?",
  "What is one way God has used {friend} to bless your life?",
  "What is one strength you see in {friend}?",
  "What is one memory with {friend} you are thankful for?",
  "What is a verse or truth that reminds you of {friend}?",
  "How has {friend} been faithful, kind, or steady?",
  "What prayer would you write for {friend} this week?"
];

function cleanPraiseFriendName(friendName) {
  const name = String(friendName || "").trim();
  return name || "your friend";
}

function randomPraiseFriendPrompt(friendName) {
  const prompt = PRAISE_FRIEND_PROMPTS[Math.floor(Math.random() * PRAISE_FRIEND_PROMPTS.length)];
  return prompt.replace(/{friend}/g, cleanPraiseFriendName(friendName));
}

async function backfillReminderNextSendAt(now) {
  if (now.getUTCMinutes() !== 0 || now.getUTCHours() % 6 !== 0) return;
  const snap = await db.collection("users")
    .where("reminder.enabled", "==", true)
    .limit(500)
    .get();
  if (snap.empty) return;

  const batch = db.batch();
  let updates = 0;
  snap.docs.forEach(userDoc => {
    const reminder = userDoc.data().reminder || {};
    if (reminder.nextSendAt || !reminder.time) return;
    const nextSendAt = calculateNextReminderDate(reminder, now);
    if (!nextSendAt) return;
    batch.update(userDoc.ref, { "reminder.nextSendAt": nextSendAt });
    updates++;
  });

  if (updates) {
    await batch.commit();
    console.log(`Backfilled nextSendAt for ${updates} reminder users`);
  }
}

// Runs every minute, but only reads users whose reminder.nextSendAt is due.
exports.sendScheduledReminders = functions.pubsub
  .schedule("every 1 minutes")
  .onRun(async () => {
    const now = new Date();
    await backfillReminderNextSendAt(now);
    await backfillMercyReminderNextSendAt(now);

    const snap = await db.collection("users")
      .where("reminder.enabled", "==", true)
      .where("reminder.nextSendAt", "<=", now)
      .limit(100)
      .get();

    for (const userDoc of snap.docs) {
      const data = userDoc.data();
      const reminder = data.reminder || {};
      const tokens = data.fcmTokens || [];

      if (!reminder.time) {
        await userDoc.ref.update({ "reminder.enabled": false });
        continue;
      }

      const nextSendAt = calculateNextReminderDate(reminder, new Date(now.getTime() + 60 * 1000));
      if (!tokens.length) {
        if (nextSendAt) await userDoc.ref.update({ "reminder.nextSendAt": nextSendAt });
        continue;
      }

      console.log(`Sending reminder to ${userDoc.id}`);

      const update = { "reminder.lastSent": now };
      if (nextSendAt) update["reminder.nextSendAt"] = nextSendAt;
      await userDoc.ref.update(update);

      const result = await sendToUserTokens(userDoc.ref, tokens, {
        notification: {
          title: "Time to study Greek!",
          body: "Take a few minutes to review your vocabulary and lessons."
        },
        webpush: { fcmOptions: { link: "/Greek-Vocab/" }, notification: { icon: "/Greek-Vocab/icon-192.png", vibrate: [200, 100, 200] } }
      }, `study reminder ${userDoc.id}`);
      console.log(`${userDoc.id}: ${result.successCount} sent, ${result.failureCount} failed`);
    }

    const mercyDailySnap = await db.collection("users")
      .where("mercyReminder.enabled", "==", true)
      .where("mercyReminder.nextSendAt", "<=", now)
      .limit(100)
      .get();

    for (const userDoc of mercyDailySnap.docs) {
      const data = userDoc.data();
      const reminder = data.mercyReminder || {};
      const tokens = data.fcmTokens || [];
      const nextSendAt = calculateNextReminderDate(reminder, new Date(now.getTime() + 60 * 1000));
      await userDoc.ref.update({ "mercyReminder.lastSent": now, ...(nextSendAt ? { "mercyReminder.nextSendAt": nextSendAt } : {}) });
      if (data.mercyLastPostDate === mercyDateKey(now.getTime(), reminder.timezone || "UTC")) continue;
      if (!tokens.length) continue;
      const body = `Share your daily praise: ${randomPraisePrompt()}`;
      await sendToUserTokens(userDoc.ref, tokens, {
        notification: { title: "Praises", body },
        webpush: { fcmOptions: { link: "/Greek-Vocab/?open=mercies" }, notification: { icon: "/Greek-Vocab/icon-192.png", vibrate: [200, 100, 200] } }
      }, `mercy reminder ${userDoc.id}`);
    }

    const mercyFriendSnap = await db.collection("users")
      .where("mercyFriendReminder.enabled", "==", true)
      .where("mercyFriendReminder.nextSendAt", "<=", now)
      .limit(100)
      .get();

    for (const userDoc of mercyFriendSnap.docs) {
      const data = userDoc.data();
      const reminder = data.mercyFriendReminder || {};
      const tokens = data.fcmTokens || [];
      const friends = data.friends || [];
      const nextSendAt = calculateNextMercyFriendDate(reminder, now);
      await userDoc.ref.update({ "mercyFriendReminder.lastSent": now, ...(nextSendAt ? { "mercyFriendReminder.nextSendAt": nextSendAt } : {}) });
      if (!tokens.length || !friends.length) continue;
      const friendUid = friends[Math.floor(Math.random() * friends.length)];
      const friendSnap = await db.collection("users").doc(friendUid).get();
      const friendData = friendSnap.exists ? (friendSnap.data() || {}) : {};
      const resolvedName = (friendData.displayName || friendData.username || "").trim();
      const friendName = (resolvedName && resolvedName.toLowerCase() !== "user") ? resolvedName : "a friend";
      const friendAvatar = friendData.avatar || "";
      const promptText = randomPraiseFriendPrompt(friendName);
      const pendingPrompt = {
        friendUid,
        friendName,
        friendAvatar,
        promptText,
        createdAtMs: now.getTime(),
        expiresAtMs: now.getTime() + 24 * 60 * 60 * 1000
      };
      await userDoc.ref.update({ pendingMercyFriendEncouragement: pendingPrompt });
      await sendToUserTokens(userDoc.ref, tokens, {
        notification: { title: "Praises", body: promptText },
        data: { open: "mercies", friendUid, friendName },
        webpush: { fcmOptions: { link: `/Greek-Vocab/?open=mercies&friend=${encodeURIComponent(friendUid)}` }, notification: { icon: "/Greek-Vocab/icon-192.png", vibrate: [200, 100, 200] } }
      }, `mercy friend reminder ${userDoc.id}`);
    }

    // ── Habit reminder slots ─────────────────────────────────────────────────
    const habitSlotSnap = await db.collectionGroup("habitReminderSlots")
      .where("enabled", "==", true)
      .where("nextSendAt", "<=", now)
      .limit(200)
      .get();

    if (!habitSlotSnap.empty) {
      // Batch-read all distinct user docs in one round-trip instead of N+1 sequential reads
      const slotsByUid = {};
      for (const slotDoc of habitSlotSnap.docs) {
        const slot = slotDoc.data();
        if (!slot.uid || !slot.time) continue;
        if (!slotsByUid[slot.uid]) slotsByUid[slot.uid] = [];
        slotsByUid[slot.uid].push({ doc: slotDoc, slot });
      }

      const uids = Object.keys(slotsByUid);
      const userSnaps = await Promise.all(uids.map(uid => db.collection("users").doc(uid).get()));
      const userMap = {};
      const userRefMap = {};
      userSnaps.forEach(snap => {
        if (snap.exists) {
          userMap[snap.id] = snap.data();
          userRefMap[snap.id] = snap.ref;
        }
      });

      const entryRefsByKey = {};
      for (const uid of uids) {
        if (!userMap[uid]) continue;
        for (const { slot } of slotsByUid[uid]) {
          if (!slot.habitId) continue;
          const dayKey = mercyDateKey(now.getTime(), slot.timezone || "UTC");
          const key = `${uid}|${slot.habitId}|${dayKey}`;
          if (!entryRefsByKey[key]) {
            entryRefsByKey[key] = db.collection("users").doc(uid)
              .collection("habits").doc(slot.habitId)
              .collection("entries").doc(dayKey);
          }
        }
      }
      const entrySnaps = Object.keys(entryRefsByKey).length
        ? await db.getAll(...Object.values(entryRefsByKey))
        : [];
      const completedHabitDays = {};
      const entryInfoByKey = {};
      entrySnaps.forEach(snap => {
        if (!snap.exists) return;
        const path = snap.ref.path.split("/");
        const uid = path[1];
        const habitId = path[3];
        const dayKey = snap.id;
        const data = snap.data();
        entryInfoByKey[`${uid}|${habitId}|${dayKey}`] = {
          comment: data.comment || "",
          source: data.source || ""
        };
        if (data.status === "success") {
          completedHabitDays[`${uid}|${habitId}|${dayKey}`] = true;
        }
      });

      // Update slot nextSendAts in parallel, then send notifications
      const slotUpdates = [];
      for (const uid of uids) {
        const userData = userMap[uid];
        if (!userData) {
          // User gone — delete all their slots
          slotsByUid[uid].forEach(({ doc }) => slotUpdates.push(doc.ref.delete()));
          continue;
        }
        const tokens = userData.fcmTokens || [];
        for (const { doc: slotDoc, slot } of slotsByUid[uid]) {
          const nextSendAt = calculateNextReminderDate(
            { time: slot.time, frequency: slot.frequency || "daily", timezone: slot.timezone || "UTC" },
            new Date(now.getTime() + 60 * 1000)
          );
          const slotUpdate = { lastSent: now };
          if (nextSendAt) slotUpdate.nextSendAt = nextSendAt;
          slotUpdates.push(slotDoc.ref.update(slotUpdate));
          const dayKey = mercyDateKey(now.getTime(), slot.timezone || "UTC");
          if (completedHabitDays[`${uid}|${slot.habitId}|${dayKey}`]) continue;
          if (!tokens.length) continue;
          const info = entryInfoByKey[`${uid}|${slot.habitId}|${dayKey}`] || {};
          // Reading Plan reminders carry a per-day reference in the entry comment
          // (written by the app, prefixed with 📖 and sourced "reading-plan").
          const isReadingPlan = slot.kind === "reading-plan"
            || info.source === "reading-plan"
            || (typeof info.comment === "string" && info.comment.startsWith("📖"));
          let title = slot.habitName || "Habit Reminder";
          let body = randomHabitReminderMessage(slot.habitName || "your habit");
          let link = "/Greek-Vocab/?open=habits";
          if (isReadingPlan) {
            const tz = slot.timezone || "UTC";
            let pretty;
            try {
              pretty = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long", day: "numeric", year: "numeric" }).format(now);
            } catch (e) { pretty = mercyDateKey(now.getTime(), tz); }
            const ref = String(info.comment || "").replace(/^📖\s*/, "").trim();
            title = "Reading Plan";
            body = ref ? `It's ${pretty}, time to read ${ref}.` : `It's ${pretty}, time to read today's passage.`;
            link = "/Greek-Vocab/?open=reading-plan";
          }
          slotUpdates.push(
            sendToUserTokens(userRefMap[uid], tokens, {
              notification: { title, body },
              webpush: {
                fcmOptions: { link },
                notification: { icon: "/Greek-Vocab/icon-192.png", vibrate: [200, 100, 200] }
              }
            }, `habit reminder ${uid}`)
          );
        }
      }
      await Promise.all(slotUpdates);
    }

    return null;
  });

async function backfillMercyReminderNextSendAt(now) {
  if (now.getUTCMinutes() !== 0 || now.getUTCHours() % 6 !== 0) return;
  const [dailySnap, friendSnap] = await Promise.all([
    db.collection("users").where("mercyReminder.enabled", "==", true).limit(500).get(),
    db.collection("users").where("mercyFriendReminder.enabled", "==", true).limit(500).get()
  ]);
  const batch = db.batch();
  let updates = 0;
  dailySnap.docs.forEach(userDoc => {
    const reminder = userDoc.data().mercyReminder || {};
    if (reminder.nextSendAt || !reminder.time) return;
    const nextSendAt = calculateNextReminderDate(reminder, now);
    if (!nextSendAt) return;
    batch.update(userDoc.ref, { "mercyReminder.nextSendAt": nextSendAt });
    updates++;
  });
  friendSnap.docs.forEach(userDoc => {
    const reminder = userDoc.data().mercyFriendReminder || {};
    if (reminder.nextSendAt || !reminder.time) return;
    const nextSendAt = calculateNextMercyFriendDate(reminder, now);
    if (!nextSendAt) return;
    batch.update(userDoc.ref, { "mercyFriendReminder.nextSendAt": nextSendAt });
    updates++;
  });
  if (updates) {
    await batch.commit();
    console.log(`Backfilled nextSendAt for ${updates} Mercy reminder users`);
  }
}

exports.onUserReminderWritten = functions.firestore
  .document("users/{uid}")
  .onWrite(async (change) => {
    if (!change.after.exists) return null;
    const before = change.before.exists ? (change.before.data().reminder || {}) : {};
    const after = change.after.data().reminder || {};
    const updates = {};
    if (after.enabled && after.time) {
      const scheduleChanged =
        before.enabled !== after.enabled ||
        before.time !== after.time ||
        before.frequency !== after.frequency ||
        before.timezone !== after.timezone;
      if ((scheduleChanged || !after.nextSendAt)) {
        const nextSendAt = calculateNextReminderDate(after);
        if (nextSendAt) updates["reminder.nextSendAt"] = nextSendAt;
      }
    }
    const beforeMercy = change.before.exists ? (change.before.data().mercyReminder || {}) : {};
    const afterMercy = change.after.data().mercyReminder || {};
    if (afterMercy.enabled && afterMercy.time && (beforeMercy.enabled !== afterMercy.enabled || beforeMercy.time !== afterMercy.time || !afterMercy.nextSendAt)) {
      const next = calculateNextReminderDate(afterMercy);
      if (next) updates["mercyReminder.nextSendAt"] = next;
    }
    const beforeFriend = change.before.exists ? (change.before.data().mercyFriendReminder || {}) : {};
    const afterFriend = change.after.data().mercyFriendReminder || {};
    if (afterFriend.enabled && afterFriend.time && (beforeFriend.enabled !== afterFriend.enabled || beforeFriend.time !== afterFriend.time || !afterFriend.nextSendAt)) {
      const next = calculateNextMercyFriendDate(afterFriend);
      if (next) updates["mercyFriendReminder.nextSendAt"] = next;
    }
    if (Object.keys(updates).length) await change.after.ref.update(updates);
    return null;
  });

exports.onEventCalendarSync = functions.firestore
  .document("events/{eventId}")
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return null;

    const eventId = context.params.eventId;
    if (before && eventRelevantSnapshot(before) === eventRelevantSnapshot(after)) return null;

    if (after.isActive === false) {
      const ids = after.googleCalIds || {};
      for (const [uid, googleEventId] of Object.entries(ids)) {
        await deleteGoogleCalendarEvent(uid, googleEventId);
      }
      return null;
    }

    const updates = await syncEventToLinkedGoogleCalendars(eventId, after);
    if (Object.keys(updates).length) {
      await change.after.ref.update({ ...updates, lastGoogleSyncAt: FieldValue.serverTimestamp() });
    }
    return null;
  });

// Checks group calendar event reminders from the backend so delivery does not depend on the creator's browser.
exports.sendEventReminders = functions.pubsub
  .schedule("every 1 hours")
  .onRun(async () => {
    const now = Date.now();
    const snap = await db.collection("events")
      .where("isActive", "==", true)
      .limit(500)
      .get();

    for (const eventDoc of snap.docs) {
      const ev = eventDoc.data();
      const startsAt = eventStartMs(ev);
      if (!startsAt || startsAt < now) continue;

      const sentReminders = ev.sentReminders || {};
      const reminders = Array.isArray(ev.reminders) && ev.reminders.length
        ? ev.reminders
        : ["1week", "3day", "1day", "dayof"];

      for (const key of reminders) {
        const offset = EVENT_REMINDER_OFFSETS_MS[key];
        if (offset == null || sentReminders[key] || now < startsAt - offset) continue;

        const accepted = (ev.invitees || []).filter(inv => inv && inv.uid && inv.status === "accepted");
        const recipients = [...new Set([ev.creatorUid, ...accepted.map(inv => inv.uid)].filter(Boolean))];
        for (const uid of recipients) {
          await writeEventMessage(uid, "eventReminder", ev.creatorName || "Disciple Builder", ev.creatorUid || uid, {
            eventId: eventDoc.id,
            eventTitle: ev.title || "an event",
            date: ev.date || "",
            time: ev.time || "",
            reminderKey: key
          }, `evtremind_${eventDoc.id}_${key}_${uid}`);
        }

        await eventDoc.ref.update({ [`sentReminders.${key}`]: true, updatedAt: FieldValue.serverTimestamp() });
      }
    }
    return null;
  });

// Triggers on any new doc in encouragements/{targetUid}/messages/{messageId}.
// Handles the app's social, study, habit, and encouragement notification types.
exports.onEncouragementCreated = functions.firestore
  .document("encouragements/{targetUid}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const { type, fromName, processed } = snap.data();
    if (processed) return null;

    const targetUid = context.params.targetUid;

    let title, body;
    if (type === "friendRequest") {
      title = "New Friend Request";
      body = `${fromName} sent you a friend request.`;
    } else if (type === "friendAccepted") {
      title = "Friend Request Accepted!";
      body = `${fromName} accepted your friend request.`;
      await shareRecentCommunityPostsBetweenFriends(targetUid, snap.data().fromUid);
    } else if (type === "studySession") {
      const studyName = snap.data().studyName || "Greek";
      title = "Studying Now 📖";
      body = `${fromName} is studying ${studyName} right now!`;
    } else if (type === "studyCollabRequest") {
      const studyName = snap.data().studyName || "a study";
      title = "Study Join Request";
      body = `${fromName} wants to join your "${studyName}" study.`;
    } else if (type === "studyCollabApproved") {
      const studyName = snap.data().studyName || "a study";
      title = "Study Request Approved!";
      body = `${fromName} approved your request to join "${studyName}".`;
    } else if (type === "studyInvite") {
      const studyName = snap.data().studyName || "a study";
      title = "Study Invitation";
      body = `${fromName} invited you to join "${studyName}".`;
    } else if (type === "communityPost") {
      const kind = snap.data().postKind || "post";
      const labels = { insight: "an insight", question: "a question", encouragement: "an encouragement", prayer: "a prayer post" };
      title = "New Community Post";
      body = `${fromName} shared ${labels[kind] || "a post"} with you.`;
    } else if (type === "postReaction") {
      const postTitle = snap.data().postTitle || "your post";
      const emoji = snap.data().emoji || "reacted";
      title = "Someone Reacted";
      body = `${fromName} reacted ${emoji} to "${postTitle}".`;
    } else if (type === "postComment") {
      const postTitle = snap.data().postTitle || "your post";
      title = "New Comment";
      body = `${fromName} commented on "${postTitle}".`;
    } else if (type === "postPrayer") {
      const postTitle = snap.data().postTitle || "your prayer post";
      title = "They Prayed For You";
      body = `${fromName} prayed for your "${postTitle}" post.`;
    } else if (type === "mercyPostedTagged") {
      title = "New Praise";
      body = `${fromName} posted a Praise about you.`;
    } else if (type === "mercyComment") {
      const postTitle = snap.data().postTitle || "your Praise";
      title = "New Praise Comment";
      body = `${fromName} commented on "${postTitle}".`;
    } else if (type === "habitAccountabilityAdded") {
      const habitName = snap.data().habitName || "a habit";
      title = "Accountability Partner";
      body = `${fromName} added you as an accountability partner for "${habitName}".`;
    } else if (type === "habitCompleted") {
      const habitName = snap.data().habitName || "a habit";
      title = "Habit Completed";
      body = `${fromName} completed today's "${habitName}" habit.`;
    } else if (type === "habitEncouragement") {
      const habitName = snap.data().habitName || "habit";
      title = "Habit Encouragement";
      body = `${fromName} encouraged you to keep going with "${habitName}".`;
    } else if (type === "eventInvite") {
      const eventTitle = snap.data().eventTitle || "an event";
      const date = snap.data().date || "";
      title = "Event Invitation";
      body = `${fromName} invited you to "${eventTitle}"${date ? ` on ${date}` : ""}.`;
    } else if (type === "eventUpdate") {
      const eventTitle = snap.data().eventTitle || "an event";
      title = "Event Updated";
      body = `${fromName} updated "${eventTitle}".`;
    } else if (type === "eventReminder") {
      const eventTitle = snap.data().eventTitle || "an event";
      const label = EVENT_REMINDER_LABELS[snap.data().reminderKey] || "soon";
      title = "Event Reminder";
      body = `"${eventTitle}" is coming up ${label}.`;
    } else if (type === "eventAccepted") {
      const eventTitle = snap.data().eventTitle || "your event";
      title = "Event Accepted";
      body = `${fromName} is coming to "${eventTitle}".`;
    } else if (type === "eventDeclined") {
      const eventTitle = snap.data().eventTitle || "your event";
      title = "Event Declined";
      body = `${fromName} declined "${eventTitle}".`;
    } else if (type === "eventCancelled") {
      const eventTitle = snap.data().eventTitle || "an event";
      title = "Event Cancelled";
      body = `${fromName} cancelled "${eventTitle}".`;
    } else if (type === "encouragement") {
      title = "Study Encouragement";
      body = `${fromName} is encouraging you to study your Greek!`;
    } else {
      return null; // unknown type — don't send a misleading notification
    }

    const userSnap = await db.collection("users").doc(targetUid).get();
    if (!userSnap.exists) {
      await snap.ref.update({ processed: true });
      return null;
    }

    const tokens = userSnap.data().fcmTokens || [];
    if (!tokens.length) {
      await snap.ref.update({ processed: true });
      return null;
    }

    const messageId = context.params.messageId || "";
    const eventId = snap.data().eventId || "";
    const webpush = { notification: { icon: "/Greek-Vocab/icon-192.png", vibrate: [200, 100, 200] } };
    if (type && String(type).startsWith("mercy")) webpush.fcmOptions = { link: "/Greek-Vocab/?open=mercies" };
    if (type && String(type).startsWith("habit")) webpush.fcmOptions = { link: "/Greek-Vocab/?open=habits" };
    if (type === "eventInvite" && eventId) {
      webpush.fcmOptions = { link: `/Greek-Vocab/?open=calendar&action=commit&eventId=${encodeURIComponent(eventId)}&msgId=${encodeURIComponent(messageId)}` };
    } else if (type && String(type).startsWith("event")) {
      webpush.fcmOptions = { link: "/Greek-Vocab/?open=calendar" };
    }
    const dataPayload = {
      type: String(type || ""),
      open: type && String(type).startsWith("event") ? "calendar" : "",
      action: type === "eventInvite" ? "commit" : "",
      eventId: String(eventId || ""),
      msgId: String(messageId || "")
    };
    const result = await sendToUserTokens(userSnap.ref, tokens, {
      notification: { title, body },
      data: dataPayload,
      webpush
    }, `push ${type} ${targetUid}`);
    console.log(`onEncouragementCreated ${targetUid}: ${result.successCount} sent, ${result.failureCount} failed`);

    await snap.ref.update({ processed: true });
    return null;
  });

// ── Bible Quiz (AI) ───────────────────────────────────────────────────────────
// One Claude call generates a whole quiz — every question, its four options,
// the correct answer, a tailored hint, the supporting reference + verse, and a
// short explanation — returned as a single structured-JSON payload. Generating
// everything up front (rather than one call per question) is the efficient path:
// the client shows hints and explanations instantly with zero extra API calls.

// Primary model plus ordered fallbacks. If the strongest model is overloaded
// or erroring, generation automatically drops to the next so a quiz still comes
// back. Sonnet 5 writes the best questions; Opus 4.8 is an equally strong
// backup; Haiku 4.5 is the fast last resort that keeps the feature working
// even under load.
const BIBLE_QUIZ_MODEL = "claude-sonnet-5";
const BIBLE_QUIZ_MODELS = ["claude-sonnet-5", "claude-opus-4-8", "claude-haiku-4-5"];
// Haiku 4.5 doesn't accept the effort parameter; everything else here does.
const MODELS_WITHOUT_EFFORT = { "claude-haiku-4-5": true };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Transient failures worth retrying / falling back on (overload, rate limit,
// timeouts, transport errors). A 400/401/403 is a real problem another model
// won't fix, so those surface immediately.
function isRetryableAnthropicError(e) {
  const s = e && e.status;
  if (!s) return true; // network / timeout / unknown → worth another try
  return s === 408 || s === 409 || s === 425 || s === 429 || s === 500 || s === 502 || s === 503 || s === 504 || s === 529;
}

// Try each model in turn, with one quick backoff-retry per model, before giving
// up. Returns the first successful message.
async function createQuizMessage(client, promptContent) {
  let lastErr;
  for (let m = 0; m < BIBLE_QUIZ_MODELS.length; m++) {
    const model = BIBLE_QUIZ_MODELS[m];
    const output_config = MODELS_WITHOUT_EFFORT[model]
      ? { format: { type: "json_schema", schema: QUIZ_SCHEMA } }
      : { effort: "medium", format: { type: "json_schema", schema: QUIZ_SCHEMA } };
    const params = {
      model,
      max_tokens: 16000,
      system: "You write accurate, engaging, non-generic Bible quizzes and always return the requested JSON structure.",
      output_config,
      messages: [{ role: "user", content: promptContent }]
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await client.messages.create(params);
      } catch (e) {
        lastErr = e;
        console.warn(`generateBibleQuiz ${model} attempt ${attempt + 1} failed:`, e && e.message);
        if (!isRetryableAnthropicError(e)) throw e;
        if (attempt === 0) await sleep(600 * (m + 1)); // brief backoff, then retry same model
      }
    }
    // exhausted this model's retries → fall through to the next model
  }
  throw lastErr;
}

const QUIZ_CATEGORIES = [
  "narrative", "people", "places", "numbers",
  "doctrine", "quotes", "prophecy", "application"
];

const QUIZ_DIFFICULTIES = {
  broad: "Broad — big-picture themes, main events, and who's who. A committed reader who just finished the passage should get most of these.",
  balanced: "Balanced — a fair mix of storyline, key people, and a few specific details. Rewards careful reading.",
  detailed: "Detailed — precise names, numbers, sequence of events, and cause-and-effect. Assumes close, attentive reading.",
  scholar: "Scholar — exact figures, obscure names, subtle wording, cross-textual connections, and easily-confused details. A genuine test even for someone who knows the passage well."
};

function anthropicClient() {
  // NOTE: firebase-functions v7 removed functions.config() — the key must come
  // from the environment. Bind it by declaring `secrets: ["ANTHROPIC_API_KEY"]`
  // on the function (set with `firebase functions:secrets:set ANTHROPIC_API_KEY`).
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Bible Quiz isn't configured yet. Set the ANTHROPIC_API_KEY for Cloud Functions."
    );
  }
  return new Anthropic({ apiKey: key });
}

// JSON schema the model must fill. Structured outputs guarantee valid,
// parseable JSON on the first try — no retries, no brittle string parsing.
const QUIZ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answerIndex: { type: "integer" },
          reference: { type: "string" },
          verse: { type: "string" },
          hint: { type: "string" },
          explanation: { type: "string" },
          category: { type: "string", enum: QUIZ_CATEGORIES }
        },
        required: ["question", "options", "answerIndex", "reference", "verse", "hint", "explanation", "category"]
      }
    }
  },
  required: ["title", "questions"]
};

function buildQuizPrompt(opts) {
  const { reference, difficulty, numQuestions, focus, translation, tricky, avoid } = opts;
  const avoidText = (avoid && avoid.length)
    ? "\nAlready asked earlier in this quiz — do NOT repeat or closely rephrase any of these:\n" +
      avoid.map(q => `- ${q}`).join("\n") + "\n"
    : "";
  const diffText = QUIZ_DIFFICULTIES[difficulty] || QUIZ_DIFFICULTIES.balanced;
  const focusText = (focus && focus.length)
    ? `Weight the questions toward these areas: ${focus.join(", ")}. Still let the passage's own content lead — don't force a category that isn't there.`
    : "Cover a natural spread of the passage: its storyline, the people involved, key statements, and telling details.";
  const trickyText = tricky
    ? "Make the wrong answers genuinely plausible: use real names, places, and numbers from nearby Scripture so a guesser can't win by eliminating the obviously-silly option. Never make a distractor a joke."
    : "Keep wrong answers reasonable and on-topic — no absurd or filler options.";
  const versionText = translation ? ` Quote the ${translation} translation where you cite a verse.` : "";

  return [
    `You are an expert Bible teacher writing a premium, genuinely challenging quiz on ${reference}.`,
    "",
    "The reference above may name MULTIPLE passages (separated by commas, semicolons, \"and\", or line breaks — e.g. \"John 3; Romans 8:1–17, Psalm 23\"). Treat every listed passage as in scope: spread the questions across all of them roughly in proportion to their length, and never ignore one.",
    "",
    `Difficulty: ${diffText}`,
    `Number of questions: exactly ${numQuestions}.`,
    focusText,
    trickyText,
    avoidText,
    "Rules for every question:",
    "- Base it strictly on the referenced passage(s). Every question, every correct answer, and every explanation must be verifiable from the actual words of the text. Do not invent facts or pull from outside the text.",
    "- Stay theologically neutral: never test denominational positions, systematic-theology labels, or interpretive stances — test what the text SAYS. If a question unavoidably touches salvation, grace, faith, or eternal life, keep to the passage's own wording; where the text's plain reading must be summarized, present salvation and eternal life as received freely by grace through faith in Christ — never as earned or kept by works.",
    "- Exactly four options. Exactly one is correct. `answerIndex` is the 0-based index of the correct option.",
    "- Vary which position holds the correct answer across the quiz — do not favor any slot.",
    "- Questions must be specific and substantive — never vague, never answerable without having read the passage. Avoid trivially easy or generic filler.",
    "- `reference` is the specific verse or short range the answer comes from (e.g. \"Genesis 1:14–19\").",
    `- \`verse\` is the actual Scripture text for that reference, quoted accurately.${versionText}`,
    "- `hint` is a genuinely helpful nudge tailored to THIS question — a pointer to the right verse, a clarifying detail, or a way to reason it out — WITHOUT giving away the answer.",
    "- `explanation` is one or two sentences on why the correct answer is right, grounded in the text itself, worth reading after answering.",
    "- `category` is the single best fit from the allowed list.",
    "",
    "Write like a thoughtful teacher who wants the reader to actually retain what they read, not like a generic trivia generator."
  ].join("\n");
}

// Fast, citation-first semantic search. The quiz endpoint above/below retains
// its own prompt, models and behavior; only the existing API key is shared.
const BIBLE_SEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          reference: { type: "string" },
          reason: { type: "string" }
        },
        required: ["reference", "reason"]
      }
    }
  },
  required: ["results"]
};
const BIBLE_SEARCH_CACHE = new Map();
const BIBLE_SEARCH_IN_FLIGHT = new Map();
let bibleSearchClient;

async function findBibleReferences(query) {
  bibleSearchClient ||= anthropicClient();
  const message = await bibleSearchClient.messages.create({
    model: "claude-haiku-5-5",
    max_tokens: 700,
    system: [
      "Find real Bible references for the user's remembered words, topic, story, or question.",
      "Return the 5 most probable passages, most likely first. Include every real candidate that could be what they mean:",
      "parallel accounts in other Gospels or books, other verses with the same wording, and closely related verses on the same idea.",
      "Example: 'Paul said I do what I hate' → Romans 7:15, Romans 7:19, Romans 7:18, Galatians 5:17, Romans 7:24.",
      "Use standard book names and one chapter:verse per result. Give a relevant reason of 12 words or fewer.",
      "Never invent a reference or quote verse text. Return fewer than 5 only when fewer real passages fit."
    ].join(" "),
    output_config: { effort: "low", format: { type: "json_schema", schema: BIBLE_SEARCH_SCHEMA } },
    messages: [{ role: "user", content: query }]
  }, { timeout: 9000, maxRetries: 0 });
  const block = (message.content || []).find(part => part.type === "text");
  const parsed = JSON.parse(block ? block.text : "{}");
  const seen = new Set();
  const results = [];
  for (const item of (Array.isArray(parsed.results) ? parsed.results : [])) {
    const reference = String(item.reference || "").trim().slice(0, 60);
    if (!/^[1-3]?\s?[A-Za-z][A-Za-z ]+\s+\d{1,3}:\d{1,3}$/.test(reference)) continue;
    const key = reference.toLowerCase().replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ reference, reason: String(item.reason || "").trim().slice(0, 140) });
    if (results.length === 5) break;
  }
  return { results };
}

exports.searchBibleReferences = functions
  .runWith({ timeoutSeconds: 15, memory: "256MB", minInstances: 1, secrets: ["ANTHROPIC_API_KEY"] })
  .https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in to search the Bible.");
    }
    const query = String((data && data.query) || "").trim().slice(0, 180);
    if (query.length < 2) {
      throw new functions.https.HttpsError("invalid-argument", "Enter a phrase, topic, story, or question.");
    }
    try {
      const cacheKey = query.toLowerCase().replace(/\s+/g, " ");
      const cached = BIBLE_SEARCH_CACHE.get(cacheKey);
      if (cached && cached.expires > Date.now()) return cached.value;
      let pending = BIBLE_SEARCH_IN_FLIGHT.get(cacheKey);
      if (!pending) {
        pending = (async () => {
          try {
            const value = await findBibleReferences(query);
            BIBLE_SEARCH_CACHE.set(cacheKey, { value, expires: Date.now() + 20 * 60 * 1000 });
            if (BIBLE_SEARCH_CACHE.size > 200) BIBLE_SEARCH_CACHE.delete(BIBLE_SEARCH_CACHE.keys().next().value);
            return value;
          } finally {
            BIBLE_SEARCH_IN_FLIGHT.delete(cacheKey);
          }
        })();
        BIBLE_SEARCH_IN_FLIGHT.set(cacheKey, pending);
      }
      return await pending;
    } catch (error) {
      console.error("searchBibleReferences error:", error && error.message);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("unavailable", "Bible search is unavailable right now. Try again shortly.");
    }
  });

exports.generateBibleQuiz = functions
  .runWith({ timeoutSeconds: 300, memory: "512MB", secrets: ["ANTHROPIC_API_KEY"] })
  .https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in to create a quiz.");
    }

    const reference = String((data && data.reference) || "").trim().slice(0, 240);
    if (!reference) {
      throw new functions.https.HttpsError("invalid-argument", "Add a passage reference (book, chapter, or verse range).");
    }
    let numQuestions = parseInt((data && data.numQuestions), 10);
    if (!Number.isFinite(numQuestions)) numQuestions = 10;
    numQuestions = Math.max(3, Math.min(20, numQuestions));

    const difficulty = QUIZ_DIFFICULTIES[data && data.difficulty] ? data.difficulty : "balanced";
    const focus = Array.isArray(data && data.focus)
      ? data.focus.filter(f => QUIZ_CATEGORIES.includes(f)).slice(0, QUIZ_CATEGORIES.length)
      : [];
    const translation = String((data && data.translation) || "").trim().slice(0, 40);
    const tricky = !!(data && data.tricky);
    // Questions already asked this quiz (the client generates long quizzes in
    // two batches so play starts fast) — passed so the model doesn't repeat.
    const avoid = Array.isArray(data && data.avoid)
      ? data.avoid.map(s => String(s).slice(0, 200)).filter(Boolean).slice(0, 30)
      : [];

    const client = anthropicClient();
    let message;
    try {
      // Retries + model fallback live in createQuizMessage so a busy or erroring
      // model never leaves the user without a quiz.
      message = await createQuizMessage(
        client,
        buildQuizPrompt({ reference, difficulty, numQuestions, focus, translation, tricky, avoid })
      );
    } catch (e) {
      console.error("generateBibleQuiz Anthropic error:", e && e.message);
      if (e && e.status === 429) {
        throw new functions.https.HttpsError("resource-exhausted", "The quiz service is busy right now. Please try again in a moment.");
      }
      throw new functions.https.HttpsError("internal", "Couldn't generate the quiz. Please try again.");
    }

    const textBlock = (message.content || []).find(b => b.type === "text");
    let parsed;
    try {
      parsed = JSON.parse(textBlock ? textBlock.text : "{}");
    } catch (e) {
      console.error("generateBibleQuiz parse error:", e && e.message);
      throw new functions.https.HttpsError("internal", "The quiz came back malformed. Please try again.");
    }

    // Validate + normalize every question; drop anything unusable rather than
    // shipping a broken card to the UI.
    const clean = [];
    for (const q of (Array.isArray(parsed.questions) ? parsed.questions : [])) {
      if (!q || typeof q.question !== "string") continue;
      const options = Array.isArray(q.options) ? q.options.map(o => String(o)).filter(Boolean) : [];
      if (options.length !== 4) continue;
      let ai = parseInt(q.answerIndex, 10);
      if (!Number.isFinite(ai) || ai < 0 || ai > 3) continue;
      clean.push({
        question: String(q.question).trim(),
        options,
        answerIndex: ai,
        reference: String(q.reference || "").trim(),
        verse: String(q.verse || "").trim(),
        hint: String(q.hint || "").trim(),
        explanation: String(q.explanation || "").trim(),
        category: QUIZ_CATEGORIES.includes(q.category) ? q.category : "narrative"
      });
    }

    if (!clean.length) {
      throw new functions.https.HttpsError("internal", "Couldn't build questions for that passage. Try a broader reference.");
    }

    return {
      title: String(parsed.title || reference).trim().slice(0, 120),
      reference,
      difficulty,
      focus,
      translation,
      tricky,
      questions: clean
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// See interpretations
//
// For a selected verse or passage, the server looks up how real Christian
// traditions read it. Built to be fast and cheap, with Claude Haiku 5.5 (the
// low-cost model) and real pages:
// 1. Find: Haiku runs up to 3 web searches and picks the best page or two
//    for each tradition.
// 2. Read: the server itself downloads those pages all at once and keeps only
//    the part about this passage (no AI cost, a few seconds).
// 3. Assemble: Haiku puts the excerpts together. It copies quotes and writes
//    only the short overview and summaries. The server keeps a quote only if it
//    appears word for word on its page, and drops any view without a page.
//
// Results are saved by "interpretive unit" (for example Hebrews 6:4–6) and
// shared with everyone. Anyone who opens a verse inside a saved unit gets the
// saved result right away. Only the first look-up of a new passage costs
// anything (about $0.03–0.04, mostly the searches).
// ─────────────────────────────────────────────────────────────────────────────

const INTERP_MODEL = "claude-haiku-5-5";
const INTERP_BACKUP_MODEL = "claude-sonnet-5-5"; // only if Haiku declines or returns nothing usable
const INTERP_VERSION = 3; // bump to ignore every saved result and research again
const INTERP_COLLECTION = "passageInterpretations";
const INTERP_JOBS = "passageInterpretationJobs";
const INTERP_USAGE = "passageInterpretationUsage";
const INTERP_REFRESH_MS = 180 * 24 * 60 * 60 * 1000;
const INTERP_JOB_STALE_MS = 150 * 1000;
const INTERP_RETRY_AFTER_FAIL_MS = 60 * 1000;
const INTERP_USER_DAILY = 12;    // new passages one person can start per day
const INTERP_GLOBAL_DAILY = 300; // new passages everyone together can start per day (≈ $15 max)
const INTERP_MAX_SELECTION = 40; // verses
const INTERP_DEADLINE_MS = 100 * 1000;
const INTERP_MAX_SEARCHES = 3;
// Low-value sources for this job: social media, forums, video.
const INTERP_BLOCKED_DOMAINS = [
  "reddit.com", "quora.com", "facebook.com", "instagram.com", "tiktok.com",
  "pinterest.com", "x.com", "twitter.com", "youtube.com", "medium.com"
];

const INTERP_BOOKS = {
  GEN: "Genesis", EXO: "Exodus", LEV: "Leviticus", NUM: "Numbers", DEU: "Deuteronomy",
  JOS: "Joshua", JDG: "Judges", RUT: "Ruth", "1SA": "1 Samuel", "2SA": "2 Samuel",
  "1KI": "1 Kings", "2KI": "2 Kings", "1CH": "1 Chronicles", "2CH": "2 Chronicles",
  EZR: "Ezra", NEH: "Nehemiah", EST: "Esther", JOB: "Job", PSA: "Psalms",
  PRO: "Proverbs", ECC: "Ecclesiastes", SNG: "Song of Solomon", ISA: "Isaiah",
  JER: "Jeremiah", LAM: "Lamentations", EZK: "Ezekiel", DAN: "Daniel", HOS: "Hosea",
  JOL: "Joel", AMO: "Amos", OBA: "Obadiah", JON: "Jonah", MIC: "Micah", NAM: "Nahum",
  HAB: "Habakkuk", ZEP: "Zephaniah", HAG: "Haggai", ZEC: "Zechariah", MAL: "Malachi",
  MAT: "Matthew", MAR: "Mark", LUK: "Luke", JOH: "John", ACT: "Acts", ROM: "Romans",
  "1CO": "1 Corinthians", "2CO": "2 Corinthians", GAL: "Galatians", EPH: "Ephesians",
  PHP: "Philippians", COL: "Colossians", "1TH": "1 Thessalonians", "2TH": "2 Thessalonians",
  "1TI": "1 Timothy", "2TI": "2 Timothy", TIT: "Titus", PHM: "Philemon", HEB: "Hebrews",
  JAM: "James", "1PE": "1 Peter", "2PE": "2 Peter", "1JO": "1 John", "2JO": "2 John",
  "3JO": "3 John", JUD: "Jude", REV: "Revelation"
};

// Free Grace always sorts first. The rest keep the order the research gave.
const INTERP_TRADITIONS = {
  free_grace: "Free Grace",
  reformed: "Reformed (Calvinist)",
  lordship: "Lordship Salvation",
  arminian: "Arminian",
  wesleyan: "Wesleyan-Holiness",
  lutheran: "Lutheran",
  anglican: "Anglican",
  baptist: "Baptist",
  dispensational: "Dispensational",
  covenant: "Covenant Theology",
  pentecostal: "Pentecostal / Charismatic",
  anabaptist: "Anabaptist",
  restorationist: "Restorationist (Churches of Christ)",
  catholic: "Roman Catholic",
  orthodox: "Eastern Orthodox",
  preterist: "Preterist",
  futurist: "Futurist",
  other: "Other view"
};

function interpPos(chapter, verse) { return chapter * 1000 + verse; }

function interpRefLabel(book, sc, sv, ec, ev) {
  const name = INTERP_BOOKS[book] || book;
  if (sc === ec) return sv === ev ? `${name} ${sc}:${sv}` : `${name} ${sc}:${sv}–${ev}`;
  return `${name} ${sc}:${sv}–${ec}:${ev}`;
}

function interpUnitId(book, sc, sv, ec, ev) { return `${book}.${sc}.${sv}-${ec}.${ev}`; }

function interpDayKey() { return new Date().toISOString().slice(0, 10); }

function interpCleanUrl(u) {
  try {
    const url = new URL(String(u || "").trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    url.hash = "";
    let out = url.toString();
    if (out.endsWith("/")) out = out.slice(0, -1);
    return out;
  } catch (_) {
    return "";
  }
}

function interpHost(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch (_) { return ""; }
}

function interpClip(s, max) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:\s]+$/, "") + "…";
}

// Strip any citation markup the model might echo, and tidy spacing.
function interpText(s) {
  return String(s || "").replace(/<\/?cite[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// Lower-case letters and digits only, so curly quotes, dashes, spacing and
// punctuation differences between a page and a quote don't matter.
function interpNorm(s) {
  return String(s || "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// A quote counts only when every piece of it (split at "..." or [brackets])
// appears word for word in the page text.
function interpQuoteOnPage(quote, normPage) {
  const parts = String(quote || "")
    .split(/\.\.\.|…|\[[^\]]*\]/)
    .map(interpNorm)
    .filter(p => p.split(" ").length >= 3);
  const words = parts.reduce((n, p) => n + p.split(" ").length, 0);
  if (!parts.length || words < 6) return false;
  const hay = " " + normPage + " ";
  return parts.every(p => hay.includes(" " + p + " "));
}

function interpDecode(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/gi, "'").replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&mdash;/gi, "—").replace(/&ndash;/gi, "–").replace(/&hellip;/gi, "…")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch (_) { return " "; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch (_) { return " "; } })
    .replace(/&[a-z]+;/gi, " ");
}

function interpHtmlToText(html) {
  let h = String(html || "");
  h = h.replace(/<(script|style|noscript|svg|nav|header|footer|form|aside|iframe|button|select)\b[\s\S]*?<\/\1>/gi, " ");
  h = h.replace(/<!--[\s\S]*?-->/g, " ");
  h = h.replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/blockquote|\/tr|\/section|\/article)\b[^>]*>/gi, "\n");
  h = h.replace(/<[^>]+>/g, " ");
  return interpDecode(h).replace(/[ \t\f\r\v]+/g, " ").replace(/\n\s*(\n\s*)+/g, "\n").trim();
}

// Keep only what a page says about this passage: windows around each mention
// of its verses (or the book), so the model reads a few hundred words per page
// instead of the whole site.
function interpExcerpt(text, sel, unit, bookName) {
  const hits = [];
  const chapters = new Set([sel.chapter, unit.sc, unit.ec]);
  const lo = Math.min(sel.startVerse, unit.sc === sel.chapter ? unit.sv : 1);
  const hi = Math.max(sel.endVerse, unit.ec === sel.chapter ? unit.ev : sel.endVerse);
  for (const c of chapters) {
    const re = new RegExp(`\\b${c}\\s*[:.]\\s*(\\d{1,3})\\b`, "g");
    let m;
    while ((m = re.exec(text)) && hits.length < 40) {
      const v = +m[1];
      if (c !== sel.chapter || (v >= lo - 2 && v <= hi + 2)) hits.push(m.index);
    }
  }
  if (!hits.length) {
    const at = text.toLowerCase().indexOf(bookName.toLowerCase());
    if (at >= 0) hits.push(at);
  }
  if (!hits.length) return text.slice(0, 2600);
  hits.sort((a, b) => a - b);
  const wins = [];
  for (const i of hits) {
    const a = Math.max(0, i - 700), b = Math.min(text.length, i + 1300);
    const last = wins[wins.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else wins.push([a, b]);
  }
  let out = "";
  for (const [a, b] of wins) {
    if (out.length > 3800) break;
    out += (out ? " … " : "") + text.slice(a, b);
  }
  return out.slice(0, 4200);
}

async function interpFetchPage(url) {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(7000),
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = String(res.headers.get("content-type") || "");
  if (!/html|text\/plain/i.test(type)) throw new Error(`skipped ${type}`);
  const html = (await res.text()).slice(0, 1500000);
  const title = interpDecode(((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "")).replace(/\s+/g, " ").trim();
  const author = interpDecode(((html.match(/<meta[^>]+name=["']author["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']author["']/i) || [])[1] || "")).trim();
  return { text: /html/i.test(type) ? interpHtmlToText(html) : html, title, author };
}

// STEP 1 (cheap model + a few searches): pick the passage unit and the best
// pages for each tradition.
function interpFindPrompt() {
  return [
    "You find published pages on how Christian traditions interpret a Bible passage. You do not write the explanation; you only pick pages.",
    "",
    "1. Pick the interpretive unit: the passage teachers discuss as one piece. It must include every selected verse.",
    "- Inside a well-known debated passage → that passage, scope part_of_larger (Hebrews 6:5 → Hebrews 6:4-6; John 15:6 → John 15:1-8).",
    "- The selection is itself the debated unit → exactly the selection, scope selection.",
    "- Rarely debated alone but used with other verses → the selection, scope supporting_verse.",
    "- Never more than about 25 verses or two chapters.",
    `2. Search the web, at most ${INTERP_MAX_SEARCHES} searches. First the Free Grace reading (Grace Evangelical Society faithalone.org, Zane Hodges, Bob Wilkin, Joseph Dillow, Charles Bing gracelife.org, Charles Ryrie). Then the other traditions that read it differently (Reformed, Arminian, Catholic, Lutheran, Orthodox, Dispensational and so on).`,
    "3. Pick 1 or 2 pages per tradition, 3 to 6 traditions, at most 10 pages. Prefer commentaries, articles and sermons by real, named teachers or churches that discuss this passage. Skip forums, video and AI-written pages.",
    "",
    "Answer with these lines only, nothing else:",
    "@UNIT <startChapter>:<startVerse>-<endChapter>:<endVerse>",
    "@SCOPE <selection | part_of_larger | supporting_verse>",
    "@PAGE <tradition key> | <exact URL from your search results>",
    `Tradition keys: ${Object.keys(INTERP_TRADITIONS).join(", ")}.`
  ].join("\n");
}

const INTERP_ASSEMBLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    contextNote: { type: "string" },
    overview: { type: "string" },
    views: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tradition: { type: "string", enum: Object.keys(INTERP_TRADITIONS) },
          label: { type: "string" },
          summary: { type: "string" },
          reasons: { type: "array", items: { type: "string" } },
          teachers: { type: "array", items: { type: "string" } },
          usedWith: { type: "array", items: { type: "string" } },
          usageNote: { type: "string" },
          pages: { type: "array", items: { type: "integer" } },
          quotes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { page: { type: "integer" }, text: { type: "string" }, speaker: { type: "string" } },
              required: ["page", "text", "speaker"]
            }
          }
        },
        required: ["tradition", "label", "summary", "reasons", "teachers", "usedWith", "usageNote", "pages", "quotes"]
      }
    }
  },
  required: ["contextNote", "overview", "views"]
};

// STEP 3 (cheap model, no tools): put the page excerpts together. It mostly
// gathers and copies; the only fresh writing is the short overview and the
// one- or two-sentence summaries.
function interpAssemblePrompt() {
  return [
    "You put together a short, fair guide to how Christian traditions read a Bible passage, using ONLY the page excerpts you are given.",
    "",
    "- Make one view per tradition the excerpts actually support. Free Grace first. Merge traditions that read it the same way and say so in the label. Leave out any tradition the excerpts don't support. Never invent a position.",
    "- pages: the numbers of the excerpts that support the view.",
    "- quotes: 1 or 2 short quotes per view (6 to 45 words) COPIED EXACTLY, character for character, from one excerpt, with that excerpt's number. speaker: the person who said it if the excerpt or page names them, otherwise \"\".",
    "- summary: up to 2 sentences (about 45 words) restating what the excerpts say this tradition holds.",
    "- reasons: 2 or 3 short reasons the excerpts give, each under 20 words.",
    "- teachers: up to 3 real teachers named in the excerpts or well known for this reading.",
    "- usedWith: up to 4 references the excerpts read alongside the passage (\"Book chapter:verse\").",
    "- usageNote: only when the scope is supporting_verse, one sentence on how this camp uses the verse with those passages; otherwise \"\".",
    "- overview: up to 2 sentences (about 45 words): what the passage is about and what the views disagree on.",
    "- contextNote: for part_of_larger or supporting_verse, one sentence (about 25 words) on how the passage fits a larger reading; otherwise \"\".",
    "- Plain, friendly words a new believer understands. Neutral: describe each view as its own teachers would and never say which is right. Never mention AI, yourself, excerpts, pages or sources in the text. Don't refer to the specific verse that was selected; write for the whole unit."
  ].join("\n");
}

function interpParseUnit(text, sel) {
  const um = String(text || "").match(/@UNIT\s*(\d+)\s*:\s*(\d+)\s*[-–]\s*(?:(\d+)\s*:\s*)?(\d+)/);
  let sc, sv, ec, ev;
  if (um) { sc = +um[1]; sv = +um[2]; ec = um[3] ? +um[3] : sc; ev = +um[4]; }
  const ok = um && [sc, sv, ec, ev].every(n => Number.isFinite(n) && n > 0) &&
    interpPos(sc, sv) <= interpPos(sel.chapter, sel.startVerse) &&
    interpPos(ec, ev) >= interpPos(sel.chapter, sel.endVerse) &&
    ec - sc <= 1 &&
    (sc !== ec || ev - sv < 60);
  if (!ok) { sc = ec = sel.chapter; sv = sel.startVerse; ev = sel.endVerse; }
  const sameAsSelection = sc === sel.chapter && ec === sel.chapter && sv === sel.startVerse && ev === sel.endVerse;
  const sm = String(text || "").match(/@SCOPE\s*([a-z_]+)/i);
  let scope = sm && ["selection", "part_of_larger", "supporting_verse"].includes(sm[1].toLowerCase()) ? sm[1].toLowerCase() : "selection";
  if (scope === "part_of_larger" && sameAsSelection) scope = "selection";
  if (scope === "selection" && !sameAsSelection) scope = "part_of_larger";
  return { sc, sv, ec, ev, scope };
}

function interpUsage(usage, msg) {
  const u = (msg && msg.usage) || {};
  usage.input_tokens += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  usage.output_tokens += u.output_tokens || 0;
  usage.searches += (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
}

async function interpFindPages(client, model, sel, deadline, usage) {
  const selRef = interpRefLabel(sel.book, sel.chapter, sel.startVerse, sel.chapter, sel.endVerse);
  const messages = [{ role: "user", content: `Selected passage: ${selRef}` }];
  const results = new Map();     // search-result URL → title
  const snippets = new Map();    // URL → cited text the search API returned
  let text = "";
  for (let turn = 0; turn < 4; turn++) {
    const remaining = deadline - Date.now();
    if (remaining < 15000) throw new Error("ran out of time finding pages");
    const msg = await client.messages.create({
      model,
      max_tokens: 3000,
      system: interpFindPrompt(),
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: INTERP_MAX_SEARCHES, blocked_domains: INTERP_BLOCKED_DOMAINS }],
      messages
    }, { timeout: Math.min(remaining - 10000, 60000), maxRetries: 1 });
    interpUsage(usage, msg);
    for (const block of (msg.content || [])) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) {
          const url = interpCleanUrl(r && r.url);
          if (url && !results.has(url)) results.set(url, String(r.title || "").trim());
        }
      } else if (block.type === "text") {
        text += block.text || "";
        for (const c of (block.citations || [])) {
          const url = interpCleanUrl(c && c.url);
          if (url && c.cited_text) snippets.set(url, ((snippets.get(url) || "") + " " + interpText(c.cited_text)).trim());
        }
      }
    }
    if (msg.stop_reason === "refusal") { const e = new Error("declined"); e.declined = true; throw e; }
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }
  const unit = interpParseUnit(text, sel);
  const pages = [];
  const seen = new Set();
  for (const m of text.matchAll(/@PAGE\s*([a-z_ -]+?)\s*\|\s*(\S+)/gi)) {
    const url = interpCleanUrl(m[2]);
    // Only pages the search actually returned.
    const known = url && (results.has(url) ? url : [...results.keys()].find(k => k.replace(/^https?:\/\/(www\.)?/, "") === url.replace(/^https?:\/\/(www\.)?/, "")));
    if (!known || seen.has(known)) continue;
    seen.add(known);
    const hint = m[1].trim().toLowerCase().replace(/[\s-]+/g, "_");
    pages.push({ url: known, hint: INTERP_TRADITIONS[hint] ? hint : "other", title: results.get(known) || "" });
    if (pages.length === 10) break;
  }
  return { unit, pages, results, snippets };
}

async function interpResearch(sel) {
  const client = anthropicClient();
  const deadline = Date.now() + INTERP_DEADLINE_MS;
  const usage = { model: INTERP_MODEL, input_tokens: 0, output_tokens: 0, searches: 0, pagesRead: 0 };
  const bookName = INTERP_BOOKS[sel.book] || sel.book;
  const selRef = interpRefLabel(sel.book, sel.chapter, sel.startVerse, sel.chapter, sel.endVerse);

  // 1) Find pages (backup model only if the cheap one declines or fails).
  let found;
  try {
    found = await interpFindPages(client, INTERP_MODEL, sel, deadline, usage);
  } catch (e) {
    if (!(e && e.declined) && !isRetryableAnthropicError(e)) throw e;
    console.warn("getPassageInterpretations find retry on backup:", e && e.message);
    usage.model = INTERP_BACKUP_MODEL;
    found = await interpFindPages(client, INTERP_BACKUP_MODEL, sel, deadline, usage);
  }
  const { unit } = found;

  // 2) Read every page at once; keep the part about this passage.
  const read = await Promise.all(found.pages.map(async p => {
    try {
      const page = await interpFetchPage(p.url);
      const excerpt = interpExcerpt(page.text, sel, unit, bookName);
      if (excerpt.length < 200) throw new Error("too little text");
      return { ...p, title: p.title || page.title, author: page.author, excerpt };
    } catch (e) {
      console.warn("getPassageInterpretations page skipped:", p.url, e && e.message);
      // Blocked or slow page: fall back to the exact lines the search API cited.
      const cited = found.snippets.get(p.url);
      return cited && cited.length > 80 ? { ...p, excerpt: cited, author: "" } : null;
    }
  }));
  const pages = read.filter(Boolean);
  usage.pagesRead = pages.length;
  if (!pages.length) throw new Error("no readable pages");

  // 3) Put it together from those excerpts only.
  const unitRef = interpRefLabel(sel.book, unit.sc, unit.sv, unit.ec, unit.ev);
  const pageText = pages.map((p, i) =>
    `[${i + 1}] (${INTERP_TRADITIONS[p.hint] || "unknown"}) ${p.title || interpHost(p.url)} — ${interpHost(p.url)}${p.author ? ` — by ${p.author}` : ""}\n${p.excerpt}`
  ).join("\n\n");
  const assemble = async model => {
    const remaining = deadline - Date.now();
    if (remaining < 8000) throw new Error("ran out of time assembling");
    const msg = await client.messages.create({
      model,
      max_tokens: 6000,
      system: interpAssemblePrompt(),
      output_config: { effort: "low", format: { type: "json_schema", schema: INTERP_ASSEMBLE_SCHEMA } },
      messages: [{ role: "user", content: `Passage: ${unitRef} (scope: ${unit.scope}; selected: ${selRef})\n\nExcerpts:\n\n${pageText}` }]
    }, { timeout: remaining, maxRetries: 1 });
    interpUsage(usage, msg);
    if (msg.stop_reason === "refusal") { const e = new Error("declined"); e.declined = true; throw e; }
    const block = (msg.content || []).find(b => b.type === "text");
    return JSON.parse(block ? block.text : "{}");
  };
  let raw;
  try {
    raw = await assemble(INTERP_MODEL);
  } catch (e) {
    if (!(e && e.declined) && !(e instanceof SyntaxError) && !isRetryableAnthropicError(e)) throw e;
    console.warn("getPassageInterpretations assemble retry on backup:", e && e.message);
    raw = await assemble(INTERP_BACKUP_MODEL);
  }

  const clean = interpCleanResult(raw, pages, unit, sel);
  console.log("getPassageInterpretations", selRef, JSON.stringify(usage), "views", clean.views.length);
  if (!clean.views.length) throw new Error("no views with real sources");
  return { clean, usage };
}

function interpCleanResult(raw, pages, unit, sel) {
  const { sc, sv, ec, ev, scope } = unit;
  const norm = pages.map(p => interpNorm(p.excerpt));
  const views = [];
  const used = new Set();
  for (const v of (Array.isArray(raw && raw.views) ? raw.views : [])) {
    if (!v || typeof v !== "object") continue;
    const tradition = INTERP_TRADITIONS[v.tradition] ? v.tradition : "other";
    const summary = interpClip(interpText(v.summary), 420);
    if (!summary) continue;
    const idx = new Set((Array.isArray(v.pages) ? v.pages : []).map(n => n - 1).filter(i => pages[i]));
    const quotes = [];
    for (const q of (Array.isArray(v.quotes) ? v.quotes : [])) {
      const i = (q && q.page) - 1;
      const text = interpText(q && q.text).replace(/^["“”'\s]+|["“”'\s]+$/g, "");
      if (!pages[i] || !text || text.length > 360) continue;
      if (!interpQuoteOnPage(text, norm[i])) continue; // not on the page → not shown
      idx.add(i);
      quotes.push({
        text,
        speaker: interpClip(interpText(q.speaker) || pages[i].author || "", 60),
        work: interpClip(pages[i].title || interpHost(pages[i].url), 110),
        url: pages[i].url,
        site: interpHost(pages[i].url)
      });
      if (quotes.length === 2) break;
    }
    const sources = [...idx].slice(0, 3).map(i => ({
      url: pages[i].url,
      title: interpClip(pages[i].title || interpHost(pages[i].url), 110),
      site: interpHost(pages[i].url)
    }));
    if (!sources.length) continue; // nothing real behind it → leave it out
    const key = tradition === "other" ? `other:${String(v.label || "").toLowerCase()}` : tradition;
    if (used.has(key)) continue;
    used.add(key);
    views.push({
      tradition,
      label: interpClip(interpText(v.label) || INTERP_TRADITIONS[tradition], 60) || INTERP_TRADITIONS[tradition],
      summary,
      reasons: (Array.isArray(v.reasons) ? v.reasons : []).map(r => interpClip(interpText(r), 220)).filter(Boolean).slice(0, 3),
      teachers: (Array.isArray(v.teachers) ? v.teachers : []).map(t => interpClip(interpText(t), 50)).filter(t => t.length > 2).slice(0, 3),
      usageNote: scope === "supporting_verse" ? interpClip(interpText(v.usageNote), 320) : "",
      usedWith: (Array.isArray(v.usedWith) ? v.usedWith : [])
        .map(r => interpClip(interpText(r), 40))
        .filter(r => /^[1-3]?\s?[A-Za-z][A-Za-z ]+\s\d{1,3}(:\d{1,3}([–-]\d{1,3}(:\d{1,3})?)?)?$/.test(r))
        .slice(0, 4),
      quotes,
      sources
    });
  }
  views.sort((a, b) => (a.tradition === "free_grace" ? 0 : 1) - (b.tradition === "free_grace" ? 0 : 1));
  return {
    book: sel.book,
    startChapter: sc, startVerse: sv, endChapter: ec, endVerse: ev,
    start: interpPos(sc, sv),
    end: interpPos(ec, ev),
    ref: interpRefLabel(sel.book, sc, sv, ec, ev),
    scope,
    contextNote: scope === "selection" ? "" : interpClip(interpText(raw && raw.contextNote), 260),
    overview: interpClip(interpText(raw && raw.overview), 420),
    views: views.slice(0, 6)
  };
}

// The smallest saved unit that holds the whole selection.
async function interpFindSaved(sel) {
  const snap = await db.collection(INTERP_COLLECTION)
    .where("book", "==", sel.book)
    .select("start", "end", "version", "updatedAt")
    .get();
  const s = interpPos(sel.chapter, sel.startVerse);
  const e = interpPos(sel.chapter, sel.endVerse);
  let best = null;
  snap.forEach(doc => {
    const d = doc.data();
    if (d.version !== INTERP_VERSION || !(d.start <= s && d.end >= e)) return;
    const span = d.end - d.start;
    if (!best || span < best.span) best = { id: doc.id, span };
  });
  if (!best) return null;
  const doc = await db.collection(INTERP_COLLECTION).doc(best.id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

function interpPublic(d, extra) {
  const updatedAt = d.updatedAt && typeof d.updatedAt.toMillis === "function" ? d.updatedAt.toMillis() : null;
  return {
    status: "ready",
    unit: {
      book: d.book, startChapter: d.startChapter, startVerse: d.startVerse,
      endChapter: d.endChapter, endVerse: d.endVerse, ref: d.ref
    },
    scope: d.scope,
    contextNote: d.contextNote || "",
    overview: d.overview || "",
    views: d.views || [],
    updatedAt,
    ...(extra || {})
  };
}

// Counts a new research run against the person's and everyone's daily limits.
async function interpSpend(uid) {
  const day = interpDayKey();
  const userRef = db.collection(INTERP_USAGE).doc(`${uid}_${day}`);
  const allRef = db.collection(INTERP_USAGE).doc(`_all_${day}`);
  await db.runTransaction(async tx => {
    const [mine, all] = await Promise.all([tx.get(userRef), tx.get(allRef)]);
    const m = mine.exists ? (mine.data().count || 0) : 0;
    const a = all.exists ? (all.data().count || 0) : 0;
    if (m >= INTERP_USER_DAILY) {
      throw new functions.https.HttpsError("resource-exhausted",
        "You've opened a lot of new passages today. Try again tomorrow. Passages other people have already opened still work.");
    }
    if (a >= INTERP_GLOBAL_DAILY) {
      throw new functions.https.HttpsError("resource-exhausted",
        "Interpretations are busy today. Try this passage again tomorrow.");
    }
    tx.set(userRef, { uid, day, count: m + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(allRef, { day, count: a + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

exports.getPassageInterpretations = functions
  .runWith({ timeoutSeconds: 120, memory: "256MB", secrets: ["ANTHROPIC_API_KEY"] })
  .https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in to see interpretations.");
    }
    const book = String((data && data.book) || "").toUpperCase();
    const chapter = parseInt(data && data.chapter, 10);
    let startVerse = parseInt(data && data.startVerse, 10);
    let endVerse = parseInt((data && data.endVerse) || startVerse, 10);
    if (!INTERP_BOOKS[book] || !(chapter > 0 && chapter <= 150) || !(startVerse > 0) || !(endVerse > 0)) {
      throw new functions.https.HttpsError("invalid-argument", "Pick a verse first.");
    }
    if (endVerse < startVerse) [startVerse, endVerse] = [endVerse, startVerse];
    if (endVerse > 200) throw new functions.https.HttpsError("invalid-argument", "Pick a verse first.");
    if (endVerse - startVerse + 1 > INTERP_MAX_SELECTION) {
      throw new functions.https.HttpsError("invalid-argument",
        `Pick a shorter passage (up to ${INTERP_MAX_SELECTION} verses).`);
    }
    const sel = { book, chapter, startVerse, endVerse };

    let saved = null;
    try {
      saved = await interpFindSaved(sel);
    } catch (e) {
      console.error("getPassageInterpretations lookup error:", e && e.message);
      throw new functions.https.HttpsError("unavailable", "Interpretations are unavailable right now. Try again shortly.");
    }
    const updatedMs = saved && saved.updatedAt && saved.updatedAt.toMillis ? saved.updatedAt.toMillis() : 0;
    const fresh = saved && Date.now() - updatedMs < INTERP_REFRESH_MS;
    if (fresh) return interpPublic(saved);

    // One research run per passage at a time. Anyone else who asks meanwhile
    // gets "pending" and checks back in a few seconds.
    const jobId = saved ? `refresh.${saved.id}` : `${book}.${chapter}.${startVerse}-${endVerse}`;
    const jobRef = db.collection(INTERP_JOBS).doc(jobId);
    const claimed = await db.runTransaction(async tx => {
      const job = await tx.get(jobRef);
      const j = job.exists ? job.data() : null;
      const started = j && j.startedAt && j.startedAt.toMillis ? j.startedAt.toMillis() : 0;
      if (j && j.status === "running" && Date.now() - started < INTERP_JOB_STALE_MS) return false;
      const ended = j && j.finishedAt && j.finishedAt.toMillis ? j.finishedAt.toMillis() : 0;
      if (j && j.status === "failed" && Date.now() - ended < INTERP_RETRY_AFTER_FAIL_MS) return "failed";
      tx.set(jobRef, { status: "running", book, chapter, startVerse, endVerse, uid: context.auth.uid, startedAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (claimed === "failed") {
      if (saved) return interpPublic(saved);
      throw new functions.https.HttpsError("unavailable", "Couldn't find interpretations for this passage just now. Try again in a few minutes.");
    }
    if (!claimed) {
      // A stale saved result is still worth showing while it refreshes.
      if (saved) return interpPublic(saved, { refreshing: true });
      return { status: "pending", retryAfterMs: 6000 };
    }

    try {
      await interpSpend(context.auth.uid);
    } catch (e) {
      await jobRef.delete().catch(() => {});
      if (saved) return interpPublic(saved);
      throw e;
    }

    try {
      const { clean, usage } = await interpResearch(sel);
      const id = interpUnitId(book, clean.startChapter, clean.startVerse, clean.endChapter, clean.endVerse);
      const record = {
        ...clean,
        version: INTERP_VERSION,
        model: usage.model,
        usage,
        requestedBy: context.auth.uid,
        requested: interpRefLabel(book, chapter, startVerse, chapter, endVerse),
        updatedAt: FieldValue.serverTimestamp()
      };
      await db.collection(INTERP_COLLECTION).doc(id).set(record);
      await jobRef.set({ status: "done", unitId: id, finishedAt: FieldValue.serverTimestamp() }, { merge: true });
      return interpPublic({ ...record, updatedAt: { toMillis: () => Date.now() } });
    } catch (e) {
      console.error("getPassageInterpretations research error:", e && e.message);
      await jobRef.set({ status: "failed", error: String((e && e.message) || e).slice(0, 300), finishedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
      if (saved) return interpPublic(saved);
      if (e instanceof functions.https.HttpsError) throw e;
      if (e && e.status === 429) {
        throw new functions.https.HttpsError("resource-exhausted", "Interpretations are busy right now. Try again in a minute.");
      }
      throw new functions.https.HttpsError("internal", "Couldn't find interpretations for this passage right now. Try again later.");
    }
  });
