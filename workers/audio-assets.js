/**
 * Serve SPA static assets, and proxy `/audio/*` clips from R2.
 * Manifest stays in the asset bundle; wav objects live in the AUDIO bucket.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname.startsWith("/audio/") && !pathname.endsWith("/manifest.json")) {
      return serveAudioObject(env, pathname, request);
    }

    return env.ASSETS.fetch(request);
  },
};

/**
 * @param {{ AUDIO: R2Bucket }} env
 * @param {string} pathname
 * @param {Request} request
 */
async function serveAudioObject(env, pathname, request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const key = pathname.replace(/^\/audio\//, "");
  if (!key || key.includes("..") || key.startsWith("/")) {
    return new Response("Not Found", { status: 404 });
  }

  const object = await env.AUDIO.get(key);
  if (!object) {
    return new Response("Not Found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", contentTypeForKey(key));
  }

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }

  return new Response(object.body, { status: 200, headers });
}

function contentTypeForKey(key) {
  if (key.endsWith(".wav")) return "audio/wav";
  if (key.endsWith(".json")) return "application/json; charset=utf-8";
  if (key.endsWith(".opus") || key.endsWith(".ogg")) return "audio/ogg";
  if (key.endsWith(".mp3")) return "audio/mpeg";
  return "application/octet-stream";
}
