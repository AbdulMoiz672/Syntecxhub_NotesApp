import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { getDatabase } from "./mongodb";

const SESSION_COOKIE = "papertrail-session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const SESSION_KEY_ID = "papertrail-session-key";

type SessionKeyDocument = {
  _id: string;
  value: string;
};

let sessionSecretPromise: Promise<Uint8Array> | undefined;

async function getSessionSecret() {
  const pending = sessionSecretPromise ??= loadSessionSecret();
  try {
    return await pending;
  } catch (error) {
    if (sessionSecretPromise === pending) sessionSecretPromise = undefined;
    throw error;
  }
}

async function loadSessionSecret() {
  const db = await getDatabase();
  const settings = db.collection<SessionKeyDocument>("settings");
  const existing = await settings.findOne({ _id: SESSION_KEY_ID });
  if (existing) return Buffer.from(existing.value, "base64url");

  try {
    await settings.updateOne(
      { _id: SESSION_KEY_ID },
      { $setOnInsert: { value: randomBytes(32).toString("base64url") } },
      { upsert: true },
    );
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== 11000) throw error;
  }

  const saved = await settings.findOne({ _id: SESSION_KEY_ID });
  if (!saved) throw new Error("Unable to initialize the session signing key.");
  const secret = Buffer.from(saved.value, "base64url");
  if (secret.byteLength !== 32) throw new Error("The stored session signing key is invalid.");
  return secret;
}

export async function createSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer("papertrail")
    .setAudience("papertrail")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(await getSessionSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function getSessionUserId() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, await getSessionSecret(), {
      algorithms: ["HS256"],
      issuer: "papertrail",
      audience: "papertrail",
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}