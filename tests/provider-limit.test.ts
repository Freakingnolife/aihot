// Provider limits: what counts as "stop, the provider is out of capacity for now". A real 429 and the
// limit wording of the Codex shim count; digits that merely appear in an id, URL or trace do not.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isProviderLimit, ProviderRejectedError } from "@aihot/backend/providers/receipts";
import { ModelOutputError } from "@aihot/backend/providers/llm";

test("a provider's HTTP 429 is a limit, whatever its text", () => {
  assert.equal(isProviderLimit(new ProviderRejectedError("HTTP 429: slow down", 429, true)), true);
});

test("the Codex shim's usage limit is a limit: it arrives as HTTP 502 with the CLI's wording", () => {
  const shim = `HTTP 502: {"error":{"message":"Error: codex exited 1: ERROR: Usage limit reached. You've reached your usage limit. Increase your limits to continue using codex."}}`;
  assert.equal(isProviderLimit(new ProviderRejectedError(shim, 502, true)), true);
});

test("the Codex shim's out-of-credits message is a limit: HTTP 502 with the CLI's wording", () => {
  const shim = `HTTP 502: {"error":{"message":"Error: codex exited 1: ERROR: Your workspace is out of credits. Add credits to continue."}}`;
  assert.equal(isProviderLimit(new ProviderRejectedError(shim, 502, true)), true);
  assert.equal(isProviderLimit(new ProviderRejectedError("codex exited 1: You're out of credits. Add credits to continue using Codex.", 502, true)), true);
});

test("the Codex shim's spend cap is a limit: HTTP 502 with the CLI's wording", () => {
  const shim = `HTTP 502: {"error":{"message":"Error: codex exited 1: ERROR: You have reached your spend cap. Raise it to continue."}}`;
  assert.equal(isProviderLimit(new ProviderRejectedError(shim, 502, true)), true);
});

test("the Codex shim's workspace credit limit is a limit: HTTP 502 with the CLI's wording", () => {
  const shim = `HTTP 502: {"error":{"message":"Error: codex exited 1: ERROR: Your workspace credit limit has been reached."}}`;
  assert.equal(isProviderLimit(new ProviderRejectedError(shim, 502, true)), true);
});

test("the Codex retry wrapper's last status 429 is a limit: HTTP 502 with the CLI's wording", () => {
  const shim = `HTTP 502: {"error":{"message":"Error: codex exited 1: giving up after 5 retries, last status: 429"}}`;
  assert.equal(isProviderLimit(new ProviderRejectedError(shim, 502, true)), true);
});

test("a limit phrase in a plain error or a model answer is not a limit", () => {
  assert.equal(isProviderLimit(new Error("codex exited 1: Usage limit reached. Increase your limits to continue.")), false);
  assert.equal(isProviderLimit(new ModelOutputError('Model deepseek-flash returned unusable output for article:1: SyntaxError: "usage limit"')), false);
});

test("a credits field named in a plain failure is not a limit", () => {
  assert.equal(isProviderLimit(new ProviderRejectedError("HTTP 502: invalid credits field in request", 502, true)), false);
});

test("a named rate limit is a limit, including retries exhausted on a 429", () => {
  assert.equal(isProviderLimit(new ProviderRejectedError("HTTP 502: rate_limit_exceeded", 502, true)), true);
  assert.equal(isProviderLimit(new ProviderRejectedError("rate limited by the upstream", 502, true)), true);
  assert.equal(isProviderLimit(new ProviderRejectedError("codex exited 1: exceeded retry limit, last status: 429 Too Many Requests", 502, true)), true);
});

test("a 429 that appears only inside an article id or a URL is not a provider limit", () => {
  assert.equal(isProviderLimit(new Error("article 4291 failed: https://example.com/posts/429/recap")), false);
  assert.equal(isProviderLimit(new Error("article 429 could not be parsed")), false);
});

test("a server error that merely mentions 429 is a failure, not a limit", () => {
  assert.equal(isProviderLimit(new ProviderRejectedError('HTTP 500: {"error":"upstream failure, trace 429"}', 500, true)), false);
});

test("a word that ends in rate is not a rate limit", () => {
  assert.equal(isProviderLimit(new Error("the separate limit applies to each source")), false);
});
