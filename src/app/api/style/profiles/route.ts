import { ok, parseBody, route } from "@/lib/http";
import { ProfileBody, listProfiles, saveProfile } from "@/lib/style/server";

/** Measurement profiles (yours, and people you order for). */
export const GET = route(async ({ user }) => ok({ profiles: await listProfiles(user.id) }));
export const POST = route(async ({ req, user }) => ok({ profile: await saveProfile(user.id, null, await parseBody(req, ProfileBody)) }, 201));
