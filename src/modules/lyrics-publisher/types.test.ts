import { describe, expect, it } from "vitest";
import type { ServicePublishStatus, UnifiedPublishFormState } from "./types";

describe("lyrics-publisher types", () => {
	it("allows constructing valid form states", () => {
		const form: UnifiedPublishFormState = {
			song: "Test Song",
			artist: "Test Artist",
			album: "Test Album",
			durationSeconds: 180,
			videoId: "dQw4w9WgXcQ",
			isrc: "USUM71703881",
			language: "en",
			publishToLrcLib: true,
			publishToUnison: true,
			lrcLibIncludeLyricsfile: true,
			lrcLibIncludeSynced: true,
			lrcLibIncludePlain: true,
			unisonFormat: "ttml",
		};

		expect(form.publishToLrcLib).toBe(true);
		expect(form.publishToUnison).toBe(true);
		expect(form.unisonFormat).toBe("ttml");
	});

	it("supports all service status variants", () => {
		const statuses: ServicePublishStatus[] = [
			{ state: "idle" },
			{ state: "requesting_challenge" },
			{ state: "solving_pow", attempts: 15000, elapsedMs: 800 },
			{ state: "signing" },
			{ state: "publishing" },
			{ state: "success", details: "Published", id: 1234 },
			{ state: "error", message: "Network failure" },
		];

		expect(statuses).toHaveLength(7);
	});
});
