import { chatWithDataset } from "./chat.js";
import { getDatasetDefinition, listDatasets, parseQuery, queryDataset } from "./datasets.js";
import { apiError, json, optionsResponse } from "./http.js";

const DATASET_ROUTE = /^\/api\/v1\/datasets\/([^/]+)\/(records|chat)\/?$/;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return optionsResponse();

    const url = new URL(request.url);
    try {
      if (url.pathname === "/" && request.method === "GET") return landingPage(url);

      if (url.pathname === "/api/v1/datasets" || url.pathname === "/api/v1/datasets/") {
        if (request.method !== "GET") return methodNotAllowed("GET");
        return json({ datasets: listDatasets() });
      }

      const match = url.pathname.match(DATASET_ROUTE);
      if (!match) return apiError(404, "not_found", "No API route matches this URL.");

      const [, datasetId, action] = match;
      if (!getDatasetDefinition(datasetId)) {
        return apiError(404, "dataset_not_found", `Dataset \"${datasetId}\" is not registered.`);
      }

      if (action === "records") {
        if (request.method !== "GET") return methodNotAllowed("GET");
        return json(await queryDataset(env, datasetId, parseQuery(url), url));
      }

      if (request.method !== "POST") return methodNotAllowed("POST");
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        return apiError(415, "unsupported_media_type", "Send a JSON body with Content-Type: application/json.");
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return apiError(400, "invalid_json", "The request body is not valid JSON.");
      }

      const message = typeof body?.message === "string" ? body.message.trim() : "";
      if (!message) return apiError(400, "message_required", "The JSON body must include a non-empty message string.");
      if (message.length > 2000) return apiError(400, "message_too_long", "Messages must be 2,000 characters or fewer.");

      return json(await chatWithDataset(env, datasetId, message, url));
    } catch (error) {
      console.error(error);
      return apiError(500, "internal_error", "The API could not complete this request.");
    }
  },
};

function methodNotAllowed(allowed) {
  return apiError(405, "method_not_allowed", `Use ${allowed} for this endpoint.`, { allowed });
}

function landingPage(url) {
  const base = url.origin;
  const datasetsUrl = `${base}/api/v1/datasets`;
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Student Data API</title><style>body{max-width:760px;margin:8vh auto;padding:0 24px;background:#10140f;color:#eaf0e6;font:16px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}h1{font:700 clamp(2.4rem,8vw,5rem)/.95 system-ui,sans-serif;letter-spacing:-.06em;margin:0 0 1.5rem}p{color:#b8c3b4}a{color:#b9f66a}code,pre{background:#1b2119;border:1px solid #313a2d;border-radius:8px}code{padding:.15rem .35rem}pre{padding:1rem;overflow:auto}.tag{color:#b9f66a;text-transform:uppercase;letter-spacing:.14em;font-size:.78rem}</style><p class="tag">Cloudflare Worker · API ready</p><h1>Student Data API</h1><p>This service turns configured CSV files into JSON endpoints for student frontend projects.</p><pre>GET  /api/v1/datasets
GET  /api/v1/datasets/{dataset}/records
POST /api/v1/datasets/{dataset}/chat</pre><p>Start with <a href="${datasetsUrl}">${datasetsUrl}</a>.</p></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
