import type { UnisonLyricFormat } from "$/modules/unison/types";

export type ServicePublishStatus =
	| { state: "idle" }
	| { state: "requesting_challenge" }
	| {
			state: "solving_pow";
			attempts: number;
			elapsedMs: number;
	  }
	| { state: "signing" }
	| { state: "publishing" }
	| { state: "success"; details?: string; id?: number }
	| { state: "error"; message: string };

export interface UnifiedPublishFormState {
	song: string;
	artist: string;
	album: string;
	durationSeconds: number | "";
	videoId: string;
	isrc: string;
	language: string;

	// Target selections
	publishToLrcLib: boolean;
	publishToUnison: boolean;

	// Target format options
	lrcLibIncludeLyricsfile: boolean;
	lrcLibIncludeSynced: boolean;
	lrcLibIncludePlain: boolean;
	unisonFormat: UnisonLyricFormat;
}
