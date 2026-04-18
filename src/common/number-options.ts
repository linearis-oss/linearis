import { invalidParameterError } from "./errors.js";

export function parsePriorityOption(raw: string): number {
	const value = Number.parseInt(raw, 10);
	if (Number.isNaN(value) || value < 1 || value > 4) {
		throw invalidParameterError("--priority", "must be an integer between 1 and 4");
	}

	return value;
}

export function parseEstimateOption(raw: string): number {
	const value = Number.parseInt(raw, 10);
	if (Number.isNaN(value) || value < 0) {
		throw invalidParameterError("--estimate", "must be a non-negative integer");
	}

	return value;
}
