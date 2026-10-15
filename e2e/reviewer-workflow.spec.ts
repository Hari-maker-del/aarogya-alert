import { expect, test, type Page, type Route } from "@playwright/test";

const REVIEWER_ID = "00000000-0000-4000-8000-000000000041";
const REVIEWER_EMAIL = "e2e-reviewer@example.test";
const ALERT_ID = "ALT-E2E-01";
const APP_ORIGIN = "http://127.0.0.1:4173";
const SUPABASE_ORIGIN = "https://ipqgtcfnlaivnaeehywm.supabase.co";

type DemoRole = "reviewer" | "pending";

type AuditEvent = {
  event_id: string;
  alert_id: string;
  investigation_id: string;
  actor_id: string;
  action: string;
  occurred_at: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  note: string | null;
  source: string;
};

function createWorkflowFixture(role: DemoRole = "reviewer") {
  const state = {
    statusWriteCount: 0,
    rejectedWriteCount: 0,
    unexpectedRequests: [] as string[],
    alert: {
      alert_id: ALERT_ID,
      region_id: "REG-E2E-01",
      region_name: "Test North",
      indicator_type: "respiratory_medicine_demand",
      observed_value: 12,
      expected_baseline: 8,
      absolute_difference: 4,
      percentage_change: 50,
      anomaly_score: 3.9,
      detection_threshold: 3.5,
      review_priority: "needs_review",
      contributing_signals: ["pharmacy_demand_anomaly"],
      supporting_evidence: ["Synthetic test evidence: aggregate demand differs from its illustrative baseline."],
      uncertainty_notes: ["Synthetic browser-test record only; this is not confirmation of an outbreak."],
      recommended_verification_steps: ["Verify source completeness and compare independent aggregate signals."],
      data_quality_status: "demo",
      investigation_status: "assigned",
      active: true,
      observation_date: "2026-10-15",
      created_at: "2026-10-15T09:00:00.000Z",
      updated_at: "2026-10-15T09:00:00.000Z",
      assigned_reviewer_id: REVIEWER_ID,
      investigations: [{
        investigation_id: "INV-E2E-01",
        alert_id: ALERT_ID,
        status: "assigned",
        reviewer_id: REVIEWER_ID,
        findings: null,
        outcome: null,
        created_at: "2026-10-15T09:00:00.000Z",
        updated_at: "2026-10-15T09:00:00.000Z",
      }],
      audit_events: [] as AuditEvent[],
    },
  };

  async function json(route: Route, payload: unknown, status = 200) {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  }

  async function install(page: Page) {
    // Authentication is exercised through the real sign-in form and session
    // storage path, but the external Supabase boundary is deterministic and uses
    // a non-existent test account. No production credentials are needed.
    await page.route((url) => url.origin === SUPABASE_ORIGIN && url.pathname.startsWith("/auth/v1/"), async (route) => {
      const request = route.request();
      const method = request.method();

      if (method === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": APP_ORIGIN,
            "access-control-allow-methods": "GET,POST,OPTIONS",
            "access-control-allow-headers": "apikey,authorization,content-type",
            "access-control-max-age": "600",
          },
        });
        return;
      }

      if (request.url().includes("/auth/v1/token?grant_type=password") && method === "POST") {
        const credentials = request.postDataJSON() as { email?: string; password?: string };
        if (!credentials.email || !credentials.password) {
          await json(route, { message: "Test credentials are required." }, 400);
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": APP_ORIGIN },
          body: JSON.stringify({
            access_token: "test-only-reviewer-access-token",
            refresh_token: "test-only-reviewer-refresh-token",
            token_type: "bearer",
            expires_in: 3600,
            user: {
              id: REVIEWER_ID,
              email: credentials.email,
              role: "authenticated",
              aud: "authenticated",
            },
          }),
        });
        return;
      }

      state.unexpectedRequests.push(method + " " + new URL(request.url()).pathname);
      await json(route, { message: "Unexpected Supabase auth request in browser test." }, 501);
    });

    // This API fixture models the persistent service boundary across browser
    // reloads. Backend authorization and durable-event adapters are independently
    // covered by backend pytest tests; this browser test does not write live data.
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const method = request.method();
      const url = new URL(request.url());
      const path = url.pathname;

      if (method === "GET" && path === "/api/health") {
        await json(route, {
          status: "ok",
          api_version: "e2e-test",
          dataset: {
            status: "synthetic",
            region_count: 1,
            observation_count: 30,
            latest_observation_date: "2026-10-15",
            synthetic_only: true,
          },
        });
        return;
      }

      if (method === "GET" && path === "/api/alerts/summary") {
        await json(route, {
          active_alert_count: state.alert.active ? 1 : 0,
          by_review_priority: { priority_review: 0, needs_review: 1, watch: 0, normal: 0 },
          by_investigation_status: { [state.alert.investigation_status]: 1 },
        });
        return;
      }

      if (method === "GET" && path === "/api/alerts") {
        await json(route, { items: [{ ...state.alert }] });
        return;
      }

      if (method === "GET" && path === "/api/regions") {
        await json(route, {
          synthetic_only: true,
          items: [{
            region_id: state.alert.region_id,
            region_name: state.alert.region_name,
            latitude: 13.08,
            longitude: 80.24,
            population_band: "synthetic",
            neighbor_ids: [],
          }],
        });
        return;
      }

      if (method === "GET" && path === "/api/reviewers/me") {
        await json(route, {
          user_id: REVIEWER_ID,
          email: REVIEWER_EMAIL,
          role,
          can_review: role === "reviewer",
          is_admin: false,
        });
        return;
      }

      if (method === "GET" && path === "/api/regions/REG-E2E-01/trends") {
        await json(route, { region_id: state.alert.region_id, days: Number(url.searchParams.get("days") ?? 14), series: [] });
        return;
      }

      if (method === "GET" && path === `/api/alerts/${ALERT_ID}/history`) {
        await json(route, { alert_id: ALERT_ID, items: [...state.alert.audit_events].reverse().slice(0, Number(url.searchParams.get("limit") ?? 100)) });
        return;
      }

      if (method === "GET" && path === `/api/alerts/${ALERT_ID}`) {
        await json(route, { ...state.alert, audit_events: [...state.alert.audit_events] });
        return;
      }

      if (method === "PATCH" && path === `/api/alerts/${ALERT_ID}/status`) {
        if (role !== "reviewer") {
          state.rejectedWriteCount += 1;
          await json(route, { error: { code: "request_error", message: "Your reviewer account is awaiting administrator approval." } }, 403);
          return;
        }

        const body = request.postDataJSON() as { status: string; findings?: string; outcome?: string };
        const previousStatus = state.alert.investigation_status;
        state.statusWriteCount += 1;
        const occurredAt = "2026-10-15T10:30:" + String(state.statusWriteCount).padStart(2, "0") + ".000Z";
        const event: AuditEvent = {
          event_id: "E2E-EVENT-" + String(state.statusWriteCount).padStart(2, "0"),
          alert_id: ALERT_ID,
          investigation_id: "INV-E2E-01",
          actor_id: REVIEWER_ID,
          action: "status_updated",
          occurred_at: occurredAt,
          before: { status: previousStatus, assigned_reviewer_id: state.alert.assigned_reviewer_id },
          after: { status: body.status, assigned_reviewer_id: state.alert.assigned_reviewer_id },
          note: body.findings ?? body.outcome ?? null,
          source: "test-api",
        };

        state.alert.investigation_status = body.status;
        state.alert.updated_at = occurredAt;
        state.alert.audit_events.push(event);
        state.alert.investigations = [{
          ...state.alert.investigations[0],
          status: body.status,
          findings: body.findings ?? state.alert.investigations[0].findings,
          outcome: body.outcome ?? state.alert.investigations[0].outcome,
          updated_at: occurredAt,
        }];

        await json(route, {
          investigation: {
            ...state.alert.investigations[0],
            audit_history: state.alert.audit_events,
          },
        });
        return;
      }

      state.unexpectedRequests.push(method + " " + path);
      await json(route, { error: { code: "unhandled_test_request", message: "Unhandled mocked API request." } }, 501);
    });

    // Avoid external map tile traffic; map rendering itself remains part of the page.
    await page.route("https://*.tile.openstreetmap.org/**", (route) => route.abort());
  }

  return { state, install };
}

async function signInAs(page: Page, email = REVIEWER_EMAIL) {
  await page.goto("/");
  await page.getByRole("button", { name: "Reviewer sign in", exact: true }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.locator("#dossier-status")).toBeVisible();
  await expect(page.locator("#selected-signal-dossier").getByText(ALERT_ID, { exact: true })).toBeVisible();
}

test.describe("reviewer investigation browser workflow", () => {
  test("signs in, updates a signal, reloads, and retains status plus audit history", async ({ page }) => {
    const fixture = createWorkflowFixture("reviewer");
    await fixture.install(page);
    await signInAs(page);

    await expect(page.locator("#dossier-status")).toHaveValue("assigned");
    await expect(page.getByText("No workflow audit events recorded for this alert yet.")).toBeVisible();

    await page.locator("#dossier-status").selectOption("investigating");

    await expect(page.locator("#dossier-status")).toHaveValue("investigating");
    await expect(page.getByText("status updated", { exact: true })).toBeVisible();
    await expect(page.getByText("Actor: " + REVIEWER_ID, { exact: true })).toBeVisible();
    expect(fixture.state.statusWriteCount).toBe(1);
    expect(fixture.state.alert.investigation_status).toBe("investigating");

    await page.reload();

    // The same isolated API state serves requests after reload, as a persistent
    // backend would. Verify both the status control and audit event are restored.
    await expect(page.getByText(REVIEWER_EMAIL, { exact: true })).toBeVisible();
    await expect(page.locator("#dossier-status")).toHaveValue("investigating");
    await expect(page.getByText("status updated", { exact: true })).toBeVisible();
    await expect(page.getByText("Actor: " + REVIEWER_ID, { exact: true })).toBeVisible();
    expect(fixture.state.statusWriteCount).toBe(1);
    expect(fixture.state.alert.audit_events).toHaveLength(1);
    expect(fixture.state.unexpectedRequests).toEqual([]);
  });

  test("keeps status editing disabled for a reviewer awaiting approval", async ({ page }) => {
    const fixture = createWorkflowFixture("pending");
    await fixture.install(page);
    await signInAs(page, "pending-reviewer@example.test");

    await expect(page.locator("#dossier-status")).toBeDisabled();
    await expect(page.getByText(/pending administrator approval/i).first()).toBeVisible();
    expect(fixture.state.statusWriteCount).toBe(0);
    expect(fixture.state.rejectedWriteCount).toBe(0);
    expect(fixture.state.unexpectedRequests).toEqual([]);
  });
});
