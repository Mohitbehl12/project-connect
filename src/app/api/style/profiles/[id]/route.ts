import { ok, parseBody, route } from "@/lib/http";
import { ProfileBody, deleteProfile, saveProfile } from "@/lib/style/server";

export const PUT = route<{ id: string }>(async ({ req, user, params }) => ok({ profile: await saveProfile(user.id, params.id, await parseBody(req, ProfileBody)) }));
export const DELETE = route<{ id: string }>(async ({ user, params }) => { await deleteProfile(user.id, params.id); return ok({ deleted: true }); });
