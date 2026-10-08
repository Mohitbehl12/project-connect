import "server-only";
import { z } from "zod";
import { ApiError } from "./http";
import { DATE_KINDS } from "./constants";
import { screenMessage } from "./moderation";

// Nudges people away from private locations for a first meeting.
export const PRIVATE_PLACE = /\b(my|your|our)\s+(place|home|house|flat|apartment|room|pg|hostel)\b|\bhotel room\b|\bhouse\s*(no|number)\b/i;

export const DateBody = z.object({
  kind: z.enum(Object.keys(DATE_KINDS) as [string, ...string[]]),
  place: z.string().trim().min(2).max(120),
  startsAt: z.string().datetime({ offset: true }),
  note: z.string().trim().max(200).optional(),
});

export function validatePlace(place: string) {
  if (PRIVATE_PLACE.test(place))
    throw new ApiError(422, "For a first meeting, pick a public place like a café, restaurant or park.", "private_place");
  const flags = screenMessage(place);
  if (flags.includes("CONTACT_INFO") || flags.includes("LINK")) throw new ApiError(422, "place: Enter just the venue name and area.", "validation");
}

