import { getSessionUserId } from "../../../lib/auth";
import { getDatabase } from "../../../lib/mongodb";
import { emptyWorkspace, mergeWorkspaces, parseWorkspace, type Workspace } from "../../../lib/workspace";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await getSessionUserId();
    if (!userId) return Response.json({ error: "Sign in to sync notes." }, { status: 401 });

    const db = await getDatabase();
    const saved = await db.collection<Workspace & { _id: string }>("workspaces").findOne({ _id: userId });
    const workspace = saved ? parseWorkspace(saved) : emptyWorkspace();
    if (!workspace) return Response.json({ error: "The saved workspace could not be read." }, { status: 500 });
    return Response.json(workspace);
  } catch {
    return Response.json({ error: "Unable to load the cloud workspace." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) return Response.json({ error: "Sign in to sync notes." }, { status: 401 });

    const incoming = parseWorkspace(await request.json());
    if (!incoming) return Response.json({ error: "The workspace data is invalid or too large." }, { status: 400 });

    const db = await getDatabase();
    const workspaces = db.collection<Workspace & { _id: string; updatedAt?: string }>("workspaces");
    const saved = await workspaces.findOne({ _id: userId });
    const current = saved ? parseWorkspace(saved) : emptyWorkspace();
    if (!current) return Response.json({ error: "The saved workspace could not be read." }, { status: 500 });

    const merged = mergeWorkspaces(current, incoming);
    await workspaces.updateOne(
      { _id: userId },
      { $set: { ...merged, updatedAt: new Date().toISOString() } },
      { upsert: true },
    );
    return Response.json(merged);
  } catch {
    return Response.json({ error: "Unable to save the cloud workspace." }, { status: 503 });
  }
}