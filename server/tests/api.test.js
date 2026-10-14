const request = require("supertest");
const { app } = require("../src/server");

describe("TaskFlow API", () => {
  test("reports API and database health without exposing configuration", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body).toHaveProperty("database");
    expect(response.body).not.toHaveProperty("env");
  });

  test("rejects unauthenticated access to private account routes", async () => {
    const response = await request(app).get("/api/auth/me");
    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/sign in/i);
  });

  test("validates registration input before attempting a database write", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name: "A",
      email: "not-an-email",
      password: "short",
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/valid email/i);
  });

  test("returns a JSON response for unknown routes", async () => {
    const response = await request(app).get("/api/not-a-route");
    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Route not found.");
  });
});
