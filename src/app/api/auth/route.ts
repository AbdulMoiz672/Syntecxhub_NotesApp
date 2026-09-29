import { compare, hash } from "bcryptjs";
import { ObjectId } from "mongodb";
import { clearSession, createSession, getSessionUserId } from "../../../lib/auth";
import { getDatabase } from "../../../lib/mongodb";

export const runtime = "nodejs";

type Account = {
  _id: ObjectId;
  email: string;
  passwordHash: string;
};

export async function GET() {
  try {
    const userId = await getSessionUserId();
    if (!userId) return Response.json({ authenticated: false });

    const db = await getDatabase();
    const account = await db.collection<Account>("users").findOne({ _id: new ObjectId(userId) });
    if (!account) {
      await clearSession();
      return Response.json({ authenticated: false });
    }

    return Response.json({ authenticated: true, email: account.email });
  } catch {
    return Response.json({ error: "Cloud sync is not configured on this server." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: unknown; password?: unknown; confirmPassword?: unknown; mode?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const mode = body.mode;

    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      return Response.json({ error: "Enter a valid email and a password of 8 to 72 bytes." }, { status: 400 });
    }
    if (mode !== "register" && mode !== "login") {
      return Response.json({ error: "Choose sign in or create account." }, { status: 400 });
    }
    if (mode === "register" && body.confirmPassword !== password) {
      return Response.json({ error: "Passwords do not match." }, { status: 400 });
    }

    const db = await getDatabase();
    const users = db.collection<Account>("users");
    await users.createIndex({ email: 1 }, { unique: true });

    if (mode === "register") {
      const passwordHash = await hash(password, 12);
      const result = await users.insertOne({ email, passwordHash } as Account);
      await createSession(result.insertedId.toHexString());
      return Response.json({ authenticated: true, email });
    }

    const account = await users.findOne({ email });
    if (!account || !(await compare(password, account.passwordHash))) {
      return Response.json({ error: "The email or password is incorrect." }, { status: 401 });
    }

    await createSession(account._id.toHexString());
    return Response.json({ authenticated: true, email: account.email });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      return Response.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    return Response.json({ error: "Unable to reach the sync service. Check the server configuration." }, { status: 503 });
  }
}

export async function DELETE() {
  await clearSession();
  return Response.json({ authenticated: false });
}