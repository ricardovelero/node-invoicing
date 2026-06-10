import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getStandardWithholdingRates,
  getWithholdingRateOptions,
  resolveWithholdingRateType,
} from "./withholding";

test("getStandardWithholdingRates returns the configured rates for a country", () => {
  assert.deepEqual(getStandardWithholdingRates("ES"), [15, 7]);
  assert.deepEqual(getStandardWithholdingRates("es"), [15, 7]);
  assert.deepEqual(getStandardWithholdingRates(" es "), [15, 7]);
});

test("getStandardWithholdingRates returns an empty list for unknown countries", () => {
  assert.deepEqual(getStandardWithholdingRates("GB"), []);
  assert.deepEqual(getStandardWithholdingRates(null), []);
  assert.deepEqual(getStandardWithholdingRates(undefined), []);
});

test("resolveWithholdingRateType maps standard rates to their label", () => {
  assert.equal(resolveWithholdingRateType(15, "ES"), "15");
  assert.equal(resolveWithholdingRateType("7", "ES"), "7");
});

test("resolveWithholdingRateType maps non-standard rates to custom", () => {
  assert.equal(resolveWithholdingRateType(12.5, "ES"), "custom");
  // A rate that is standard elsewhere is custom for a country without config.
  assert.equal(resolveWithholdingRateType(15, "GB"), "custom");
});

test("resolveWithholdingRateType returns an empty string when there is no rate", () => {
  assert.equal(resolveWithholdingRateType(null, "ES"), "");
  assert.equal(resolveWithholdingRateType("", "ES"), "");
});

test("getWithholdingRateOptions builds value/label pairs from the config", () => {
  assert.deepEqual(getWithholdingRateOptions("ES"), [
    { value: "15", label: "15%" },
    { value: "7", label: "7%" },
  ]);
  assert.deepEqual(getWithholdingRateOptions("GB"), []);
});
