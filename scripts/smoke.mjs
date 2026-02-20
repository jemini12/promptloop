const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const cookie = process.env.SMOKE_COOKIE || "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchRaw(path, opts = {}) {
  const url = baseUrl + path;
  const headers = new Headers(opts.headers || {});
  if (cookie) headers.set("cookie", cookie);

  const res = await fetch(url, { redirect: "manual", ...opts, headers });
  const text = await res.text().catch(() => "");
  return { res, text };
}

async function checkPage200(path, mustContain) {
  const { res, text } = await fetchRaw(path);
  assert(res.status === 200, `${path}: expected 200, got ${res.status}`);
  if (mustContain) {
    assert(text.includes(mustContain), `${path}: expected body to include ${JSON.stringify(mustContain)}`);
  }
  console.log(`OK page 200 ${path}`);
}

async function checkProtectedRoute(path) {
  const { res, text } = await fetchRaw(path);
  const loc = res.headers.get("location") || "";

  if (res.status >= 300 && res.status < 400) {
    assert(loc.startsWith("/signin"), `${path}: expected redirect to /signin, got ${loc || "(missing)"}`);
    console.log(`OK protected ${path} -> redirect ${loc}`);
    return;
  }

  // Some Next.js auth flows render the sign-in page directly for protected routes.
  assert(res.status === 200, `${path}: expected 200 or redirect, got ${res.status}`);
  // In this app, protected routes often return HTML that triggers a client-side redirect to /signin?callbackUrl=...
  assert(text.includes("signin") && text.includes("callbackUrl"), `${path}: expected sign-in redirect markers in HTML`);
  console.log(`OK protected ${path} -> 200 client-side sign-in redirect markers`);
}

async function checkApiStatus(path, method, expectedStatus, body) {
  const { res } = await fetchRaw(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  assert(res.status === expectedStatus, `${method} ${path}: expected ${expectedStatus}, got ${res.status}`);
  console.log(`OK api ${method} ${path} -> ${res.status}`);
}

async function main() {
  console.log(`SMOKE_BASE_URL=${baseUrl}`);
  console.log(`SMOKE_COOKIE=${cookie ? "(set)" : "(not set)"}`);

  await checkPage200("/", "Automate recurring prompts");
  await checkPage200("/signin", "Sign in");
  await checkPage200("/help", "Help");
  await checkProtectedRoute("/dashboard");
  await checkProtectedRoute("/jobs/new");

  // Unauthed API expectations
  if (!cookie) {
    await checkApiStatus("/api/jobs", "GET", 401);
    await checkApiStatus("/api/models", "GET", 401);
    await checkApiStatus("/api/prompt-writer/enhance", "POST", 401, { prompt: "hi", allowStrongerRewrite: false });
    await checkApiStatus("/api/preview", "POST", 401, {
      template: "hi",
      variables: "{}",
      useWebSearch: false,
      llmModel: "gpt-4o-mini",
      webSearchMode: "native",
      testSend: false,
      name: "Preview",
    });

    const cron = await fetchRaw("/api/cron/run-jobs");
    assert(cron.res.status === 200 || cron.res.status === 401, `/api/cron/run-jobs: expected 200/401, got ${cron.res.status}`);
    console.log(`OK api GET /api/cron/run-jobs -> ${cron.res.status}`);
  }

  console.log("SMOKE OK");
}

main().catch((err) => {
  console.error("SMOKE FAIL", err);
  process.exit(1);
});
