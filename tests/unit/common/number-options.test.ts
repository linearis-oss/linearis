import { describe, expect, it } from "vitest";
import {
	parseEstimateOption,
	parsePriorityOption,
} from "../../../src/common/number-options.js";

describe("parsePriorityOption", () => {
	it("parses valid priorities", () => {
		expect(parsePriorityOption("1")).toBe(1);
		expect(parsePriorityOption("4")).toBe(4);
	});

	it("throws for non-numeric priority", () => {
		expect(() => parsePriorityOption("abc")).toThrow(
			"Invalid --priority: must be an integer between 1 and 4",
		);
	});

	it("throws for out-of-range priority", () => {
		expect(() => parsePriorityOption("0")).toThrow(
			"Invalid --priority: must be an integer between 1 and 4",
		);
		expect(() => parsePriorityOption("5")).toThrow(
			"Invalid --priority: must be an integer between 1 and 4",
		);
	});
});

describe("parseEstimateOption", () => {
	it("parses valid estimates", () => {
		expect(parseEstimateOption("0")).toBe(0);
		expect(parseEstimateOption("3")).toBe(3);
	});

	it("throws for non-numeric estimate", () => {
		expect(() => parseEstimateOption("abc")).toThrow(
			"Invalid --estimate: must be a non-negative integer",
		);
	});

	it("throws for negative estimate", () => {
		expect(() => parseEstimateOption("-1")).toThrow(
			"Invalid --estimate: must be a non-negative integer",
		);
	});
});
