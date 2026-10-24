const ENDPOINT = "https://api.linear.app/graphql";

export class LinearApiError extends Error {
  constructor(code) {
    super(code);
    this.name = "LinearApiError";
    this.code = code;
  }
}

/** Minimal GraphQL transport. Authorization is accepted only as a server-side argument. */
export async function linearGraphql({ accessToken, query, variables = {}, fetchImpl = fetch }) {
  if (typeof accessToken !== "string" || !accessToken || typeof query !== "string" || !query.trim()) {
    throw new LinearApiError("LINEAR_API_INVALID_REQUEST");
  }
  let response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
  } catch {
    throw new LinearApiError("LINEAR_API_UNAVAILABLE");
  }
  if (response.status === 401) throw new LinearApiError("LINEAR_API_UNAUTHORIZED");
  if (response.status === 403) throw new LinearApiError("LINEAR_API_FORBIDDEN");
  if (!response.ok) throw new LinearApiError("LINEAR_API_UNAVAILABLE");
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new LinearApiError("LINEAR_API_INVALID_RESPONSE");
  }
  if (!payload || (Array.isArray(payload.errors) && payload.errors.length)) {
    throw new LinearApiError("LINEAR_API_QUERY_FAILED");
  }
  return payload.data;
}
