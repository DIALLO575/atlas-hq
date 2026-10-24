const ENDPOINT = "https://api.linear.app/graphql";
const QUERY = "query AtlasLinearOAuthIdentity { viewer { id organization { id } } }";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function verifyLinearOAuthIdentity(accessToken, fetchImpl = fetch) {
  if (typeof accessToken !== "string" || !accessToken) throw new Error("LINEAR_IDENTITY_UNAVAILABLE");
  let response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query: QUERY, operationName: "AtlasLinearOAuthIdentity" }),
      cache: "no-store",
    });
  } catch {
    throw new Error("LINEAR_IDENTITY_UNAVAILABLE");
  }
  if (!response.ok) throw new Error("LINEAR_IDENTITY_UNAVAILABLE");
  let payload;
  try { payload = await response.json(); } catch { throw new Error("LINEAR_IDENTITY_INVALID"); }
  const viewer = payload?.data?.viewer;
  if (payload?.errors?.length || !UUID.test(viewer?.id ?? "") || !UUID.test(viewer?.organization?.id ?? "")) {
    throw new Error("LINEAR_IDENTITY_INVALID");
  }
  return { userId: viewer.id, workspaceId: viewer.organization.id };
}
