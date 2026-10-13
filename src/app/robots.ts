import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

/** Private test servers ask search engines to stay away; a public launch allows the landing and legal pages. */
export default function robots(): MetadataRoute.Robots {
  if (process.env.PRIVATE_BETA === "true") return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: ["/", "/legal/"], disallow: ["/api/", "/admin", "/app/", "/pay/"] } };
}
