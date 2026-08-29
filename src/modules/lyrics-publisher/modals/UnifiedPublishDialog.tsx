import { stringifyLrc } from "@applemusic-like-lyrics/lyric";
import {
	CheckmarkCircle16Filled,
	DismissCircle16Filled,
	Globe16Regular,
	Info16Regular,
	Key16Regular,
	Rocket16Filled,
	Sparkle16Filled,
	Warning16Filled,
} from "@fluentui/react-icons";
import {
	Badge,
	Box,
	Button,
	Callout,
	Checkbox,
	Dialog,
	Flex,
	RadioGroup,
	Tabs,
	Text,
	TextArea,
	TextField,
} from "@radix-ui/themes";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { currentDurationAtom } from "$/modules/audio/states";
import { LrcLibApi } from "$/modules/lrclib/api/client";
import { solveChallenge } from "$/modules/lrclib/utils/challenge-solver";
import { exportLyricsfileText } from "$/modules/lyricsfile-processor/writer";
import exportTTMLText from "$/modules/project/logic/ttml-writer";
import { UnisonApi } from "$/modules/unison/api/client";
import type { UnisonIdentityKeyPair, UnisonLyricFormat } from "$/modules/unison/types";
import { getOrCreateUnisonIdentity } from "$/modules/unison/utils/crypto";
import { publishUnifiedDialogAtom } from "$/states/dialogs";
import { lyricLinesAtom } from "$/states/main";
import type { TTMLLyric } from "$/types/ttml";
import type { ServicePublishStatus } from "../types";

function extractMetadataValue(
	metadata: TTMLLyric["metadata"],
	keys: string[],
): string {
	for (const key of keys) {
		const found = metadata.find((m) => m.key.toLowerCase() === key.toLowerCase());
		if (found?.value && found.value.length > 0) {
			return found.value.join(", ").trim();
		}
	}
	return "";
}

function extractYouTubeVideoId(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) return "";
	if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
		return trimmed;
	}
	const urlMatch = trimmed.match(
		/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
	);
	if (urlMatch && urlMatch[1]) {
		return urlMatch[1];
	}
	return trimmed;
}

function generatePlainLyrics(ttml: TTMLLyric): string {
	return ttml.lyricLines
		.map((line) => line.words.map((w) => w.word).join("").trim())
		.filter((text) => text.length > 0)
		.join("\n");
}

function generateSyncedLyrics(ttml: TTMLLyric): string {
	try {
		return stringifyLrc(ttml.lyricLines) || "";
	} catch {
		return "";
	}
}

export function UnifiedPublishDialog() {
	const [open, setOpen] = useAtom(publishUnifiedDialogAtom);
	const ttml = useAtomValue(lyricLinesAtom);
	const currentAudioDurationMs = useAtomValue(currentDurationAtom);
	const { t } = useTranslation();

	const [song, setSong] = useState("");
	const [artist, setArtist] = useState("");
	const [album, setAlbum] = useState("");
	const [durationSeconds, setDurationSeconds] = useState<number | "">("");
	const [videoId, setVideoId] = useState("");
	const [isrc, setIsrc] = useState("");
	const [language, setLanguage] = useState("");

	// Target selections
	const [publishToLrcLib, setPublishToLrcLib] = useState(true);
	const [publishToUnison, setPublishToUnison] = useState(true);

	// Format options for LRCLIB
	const [lrcLibIncludeLyricsfile, setLrcLibIncludeLyricsfile] = useState(true);
	const [lrcLibIncludeSynced, setLrcLibIncludeSynced] = useState(true);
	const [lrcLibIncludePlain, setLrcLibIncludePlain] = useState(true);

	// Format options for Unison
	const [unisonFormat, setUnisonFormat] = useState<UnisonLyricFormat>("ttml");

	// Status states for each service
	const [lrcLibStatus, setLrcLibStatus] = useState<ServicePublishStatus>({
		state: "idle",
	});
	const [unisonStatus, setUnisonStatus] = useState<ServicePublishStatus>({
		state: "idle",
	});

	const [unisonIdentity, setUnisonIdentity] =
		useState<UnisonIdentityKeyPair | null>(null);
	const abortControllerRef = useRef<AbortController | null>(null);

	// Pre-fill form values on dialog open
	useEffect(() => {
		if (open) {
			getOrCreateUnisonIdentity().then(setUnisonIdentity);

			const initTrack = extractMetadataValue(ttml.metadata, [
				"musicName",
				"title",
				"trackName",
				"song",
			]);
			const initArtist = extractMetadataValue(ttml.metadata, [
				"artists",
				"artist",
				"singer",
			]);
			const initAlbum = extractMetadataValue(ttml.metadata, [
				"album",
				"albumName",
			]);
			const initIsrc = extractMetadataValue(ttml.metadata, ["isrc"]);

			setSong(initTrack);
			setArtist(initArtist);
			setAlbum(initAlbum);
			setIsrc(initIsrc);

			let durSec = 0;
			if (currentAudioDurationMs > 0) {
				durSec = Math.round(currentAudioDurationMs / 1000);
			} else if (ttml.lyricLines.length > 0) {
				const lastLine = ttml.lyricLines[ttml.lyricLines.length - 1];
				durSec = Math.ceil(lastLine.endTime / 1000);
			}
			setDurationSeconds(durSec > 0 ? durSec : "");
			setLrcLibStatus({ state: "idle" });
			setUnisonStatus({ state: "idle" });
		}
	}, [open, ttml, currentAudioDurationMs]);

	// Cleanup on close
	useEffect(() => {
		return () => {
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
		};
	}, []);

	// Generated formats for preview and payload
	const generatedTtml = useMemo(() => {
		try {
			return exportTTMLText(ttml);
		} catch (e) {
			return `<!-- Error generating TTML: ${e} -->`;
		}
	}, [ttml]);

	const generatedLyricsfile = useMemo(() => {
		try {
			return exportLyricsfileText(ttml);
		} catch (e) {
			return `# Error generating Lyricsfile: ${e}`;
		}
	}, [ttml]);

	const generatedSyncedLrc = useMemo(() => {
		return generateSyncedLyrics(ttml);
	}, [ttml]);

	const generatedPlainText = useMemo(() => {
		return generatePlainLyrics(ttml);
	}, [ttml]);

	const isPublishing =
		lrcLibStatus.state === "requesting_challenge" ||
		lrcLibStatus.state === "solving_pow" ||
		lrcLibStatus.state === "publishing" ||
		unisonStatus.state === "signing" ||
		unisonStatus.state === "publishing";

	const handlePublishAll = async () => {
		if (!publishToLrcLib && !publishToUnison) {
			toast.warn(
				t("unifiedPublisher.errors.noTargetSelected", {
					defaultValue: "Please select at least one database to publish to.",
				}),
			);
			return;
		}

		if (!song.trim() || !artist.trim()) {
			toast.error(
				t("unifiedPublisher.errors.missingMetadata", {
					defaultValue: "Song title and artist name are required.",
				}),
			);
			return;
		}

		const dur = typeof durationSeconds === "number" ? durationSeconds : 0;
		if (dur <= 0) {
			toast.error(
				t("unifiedPublisher.errors.missingDuration", {
					defaultValue: "Please specify a valid track duration.",
				}),
			);
			return;
		}

		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}
		const abortController = new AbortController();
		abortControllerRef.current = abortController;

		const tasks: Promise<void>[] = [];

		// Task 1: LRCLIB Publish Task
		if (publishToLrcLib) {
			tasks.push(
				(async () => {
					setLrcLibStatus({ state: "requesting_challenge" });
					try {
						const challenge = await LrcLibApi.requestChallenge();
						if (abortController.signal.aborted) return;

						setLrcLibStatus({
							state: "solving_pow",
							attempts: 0,
							elapsedMs: 0,
						});

						const token = await solveChallenge(
							challenge.prefix,
							challenge.target,
							{
								signal: abortController.signal,
								onProgress: (stats) => {
									setLrcLibStatus({
										state: "solving_pow",
										attempts: stats.attempts,
										elapsedMs: stats.elapsedMs,
									});
								},
							},
						);

						if (abortController.signal.aborted) return;

						setLrcLibStatus({ state: "publishing" });

						await LrcLibApi.publish(
							{
								trackName: song.trim(),
								artistName: artist.trim(),
								albumName: album.trim() || undefined,
								duration: dur,
								plainLyrics: lrcLibIncludePlain
									? generatedPlainText.trim() || undefined
									: undefined,
								syncedLyrics: lrcLibIncludeSynced
									? generatedSyncedLrc.trim() || undefined
									: undefined,
								lyricsfile: lrcLibIncludeLyricsfile
									? generatedLyricsfile.trim() || undefined
									: undefined,
							},
							token,
						);

						setLrcLibStatus({
							state: "success",
							details: "Published to LRCLIB",
						});
					} catch (err) {
						if (abortController.signal.aborted) return;
						const msg =
							err instanceof Error ? err.message : "Failed to publish to LRCLIB.";
						setLrcLibStatus({ state: "error", message: msg });
					}
				})(),
			);
		} else {
			setLrcLibStatus({ state: "idle" });
		}

		// Task 2: Unison Publish Task
		if (publishToUnison) {
			tasks.push(
				(async () => {
					setUnisonStatus({ state: "signing" });
					try {
						let lyricsContent = generatedTtml;
						if (unisonFormat === "lrc") lyricsContent = generatedSyncedLrc;
						else if (unisonFormat === "text") lyricsContent = generatedPlainText;

						const cleanVideoId = extractYouTubeVideoId(videoId);

						setUnisonStatus({ state: "publishing" });

						const result = await UnisonApi.publish(
							{
								song: song.trim(),
								artist: artist.trim(),
								album: album.trim() || undefined,
								duration: dur,
								lyrics: lyricsContent,
								format: unisonFormat,
								videoId: cleanVideoId || undefined,
								isrc: isrc.trim() || undefined,
								language: language.trim() || undefined,
							},
							unisonIdentity ?? undefined,
						);

						setUnisonStatus({
							state: "success",
							id: result.data?.id,
							details: result.data?.id
								? `Unison ID #${result.data.id}`
								: "Published to Unison",
						});
					} catch (err) {
						const msg =
							err instanceof Error ? err.message : "Failed to publish to Unison.";
						setUnisonStatus({ state: "error", message: msg });
					}
				})(),
			);
		} else {
			setUnisonStatus({ state: "idle" });
		}

		// Wait for both concurrent tasks to finish
		await Promise.allSettled(tasks);

		toast.info(
			t("unifiedPublisher.batchFinished", {
				defaultValue: "Publishing requests completed. Review status below.",
			}),
		);
	};

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Content style={{ maxWidth: 900, maxHeight: "92vh" }}>
				<Dialog.Title>
					<Flex align="center" justify="between" wrap="wrap" gap="2">
						<Flex align="center" gap="2">
							<Rocket16Filled style={{ color: "var(--accent-9)" }} />
							<Text size="5" weight="bold">
								{t("unifiedPublisher.dialogTitle", {
									defaultValue: "Publish Lyrics to Databases (Dual Publisher)",
								})}
							</Text>
						</Flex>
						<Flex gap="2">
							<Badge color="blue" variant="soft">
								LRCLIB (PoW)
							</Badge>
							<Badge color="violet" variant="soft">
								Unison (ECDSA)
							</Badge>
						</Flex>
					</Flex>
				</Dialog.Title>

				<Dialog.Description size="2" mb="3">
					{t("unifiedPublisher.dialogDescription", {
						defaultValue:
							"Simultaneously publish your synchronized lyrics to both LRCLIB and the Unison (Better Lyrics) crowdsourced database with one click.",
					})}
				</Dialog.Description>

				{/* Target Selection & Status Cards */}
				<Flex gap="3" mb="3" wrap="wrap">
					{/* LRCLIB Target Card */}
					<Box
						p="3"
						style={{
							flex: "1 1 380px",
							backgroundColor: publishToLrcLib
								? "var(--accent-a2)"
								: "var(--gray-a2)",
							borderRadius: "var(--radius-3)",
							border: publishToLrcLib
								? "1px solid var(--accent-a6)"
								: "1px solid var(--gray-a4)",
						}}
					>
						<Flex justify="between" align="center" mb="2">
							<Flex align="center" gap="2">
								<Checkbox
									checked={publishToLrcLib}
									onCheckedChange={(c) => setPublishToLrcLib(!!c)}
									disabled={isPublishing}
								/>
								<Globe16Regular style={{ color: "var(--accent-11)" }} />
								<Text size="3" weight="bold">
									LRCLIB
								</Text>
							</Flex>
							{lrcLibStatus.state === "success" && (
								<Badge color="green">
									<CheckmarkCircle16Filled /> {lrcLibStatus.details}
								</Badge>
							)}
							{lrcLibStatus.state === "error" && (
								<Badge color="red">
									<DismissCircle16Filled /> Failed
								</Badge>
							)}
							{lrcLibStatus.state === "solving_pow" && (
								<Badge color="amber">
									PoW: {(lrcLibStatus.elapsedMs / 1000).toFixed(1)}s (
									{lrcLibStatus.attempts.toLocaleString()})
								</Badge>
							)}
							{lrcLibStatus.state === "requesting_challenge" && (
								<Badge color="blue">Requesting Challenge...</Badge>
							)}
							{lrcLibStatus.state === "publishing" && (
								<Badge color="blue">Publishing...</Badge>
							)}
						</Flex>

						<Flex gap="3" wrap="wrap">
							<Text as="label" size="1">
								<Flex gap="1" align="center">
									<Checkbox
										checked={lrcLibIncludeLyricsfile}
										onCheckedChange={(c) => setLrcLibIncludeLyricsfile(!!c)}
										disabled={isPublishing || !publishToLrcLib}
									/>
									YAML
								</Flex>
							</Text>
							<Text as="label" size="1">
								<Flex gap="1" align="center">
									<Checkbox
										checked={lrcLibIncludeSynced}
										onCheckedChange={(c) => setLrcLibIncludeSynced(!!c)}
										disabled={isPublishing || !publishToLrcLib}
									/>
									Synced LRC
								</Flex>
							</Text>
							<Text as="label" size="1">
								<Flex gap="1" align="center">
									<Checkbox
										checked={lrcLibIncludePlain}
										onCheckedChange={(c) => setLrcLibIncludePlain(!!c)}
										disabled={isPublishing || !publishToLrcLib}
									/>
									Plain Text
								</Flex>
							</Text>
						</Flex>

						{lrcLibStatus.state === "error" && (
							<Callout.Root color="red" size="1" mt="2">
								<Callout.Icon>
									<DismissCircle16Filled />
								</Callout.Icon>
								<Callout.Text>{lrcLibStatus.message}</Callout.Text>
							</Callout.Root>
						)}
					</Box>

					{/* Unison Target Card */}
					<Box
						p="3"
						style={{
							flex: "1 1 380px",
							backgroundColor: publishToUnison
								? "var(--accent-a2)"
								: "var(--gray-a2)",
							borderRadius: "var(--radius-3)",
							border: publishToUnison
								? "1px solid var(--accent-a6)"
								: "1px solid var(--gray-a4)",
						}}
					>
						<Flex justify="between" align="center" mb="2">
							<Flex align="center" gap="2">
								<Checkbox
									checked={publishToUnison}
									onCheckedChange={(c) => setPublishToUnison(!!c)}
									disabled={isPublishing}
								/>
								<Sparkle16Filled style={{ color: "var(--accent-11)" }} />
								<Text size="3" weight="bold">
									Unison (Better Lyrics)
								</Text>
							</Flex>
							{unisonStatus.state === "success" && (
								<Badge color="green">
									<CheckmarkCircle16Filled /> {unisonStatus.details}
								</Badge>
							)}
							{unisonStatus.state === "error" && (
								<Badge color="red">
									<DismissCircle16Filled /> Failed
								</Badge>
							)}
							{unisonStatus.state === "signing" && (
								<Badge color="amber">Signing ECDSA...</Badge>
							)}
							{unisonStatus.state === "publishing" && (
								<Badge color="violet">Publishing...</Badge>
							)}
						</Flex>

						<Flex gap="3" align="center" wrap="wrap">
							<Text size="1" weight="medium">
								Format:
							</Text>
							<RadioGroup.Root
								value={unisonFormat}
								onValueChange={(val) => setUnisonFormat(val as UnisonLyricFormat)}
								disabled={isPublishing || !publishToUnison}
							>
								<Flex gap="3">
									<RadioGroup.Item value="ttml">
										<Text size="1">TTML (Word-sync)</Text>
									</RadioGroup.Item>
									<RadioGroup.Item value="lrc">
										<Text size="1">LRC</Text>
									</RadioGroup.Item>
									<RadioGroup.Item value="text">
										<Text size="1">Text</Text>
									</RadioGroup.Item>
								</Flex>
							</RadioGroup.Root>
						</Flex>

						{unisonStatus.state === "error" && (
							<Callout.Root color="red" size="1" mt="2">
								<Callout.Icon>
									<DismissCircle16Filled />
								</Callout.Icon>
								<Callout.Text>{unisonStatus.message}</Callout.Text>
							</Callout.Root>
						)}
					</Box>
				</Flex>

				{/* Shared Track Metadata */}
				<Flex direction="column" gap="3" mb="3">
					<Flex gap="3" wrap="wrap">
						<Box style={{ flex: "1 1 250px" }}>
							<Text as="label" size="2" weight="bold">
								{t("unifiedPublisher.fields.song", {
									defaultValue: "Song Title",
								})}{" "}
								*
							</Text>
							<TextField.Root
								value={song}
								onChange={(e) => setSong(e.target.value)}
								placeholder="e.g. Never Gonna Give You Up"
								disabled={isPublishing}
							/>
						</Box>

						<Box style={{ flex: "1 1 250px" }}>
							<Text as="label" size="2" weight="bold">
								{t("unifiedPublisher.fields.artist", {
									defaultValue: "Artist",
								})}{" "}
								*
							</Text>
							<TextField.Root
								value={artist}
								onChange={(e) => setArtist(e.target.value)}
								placeholder="e.g. Rick Astley"
								disabled={isPublishing}
							/>
						</Box>
					</Flex>

					<Flex gap="3" wrap="wrap">
						<Box style={{ flex: "1 1 200px" }}>
							<Text as="label" size="2" weight="bold">
								{t("unifiedPublisher.fields.album", { defaultValue: "Album" })}
							</Text>
							<TextField.Root
								value={album}
								onChange={(e) => setAlbum(e.target.value)}
								placeholder="e.g. Whenever You Need Somebody"
								disabled={isPublishing}
							/>
						</Box>

						<Box style={{ flex: "0 0 120px" }}>
							<Text as="label" size="2" weight="bold">
								{t("unifiedPublisher.fields.duration", {
									defaultValue: "Duration (s)",
								})}{" "}
								*
							</Text>
							<TextField.Root
								type="number"
								value={durationSeconds}
								onChange={(e) =>
									setDurationSeconds(
										e.target.value === "" ? "" : Number(e.target.value),
									)
								}
								placeholder="e.g. 213"
								disabled={isPublishing}
							/>
						</Box>

						<Box style={{ flex: "1 1 200px" }}>
							<Text as="label" size="2">
								{t("unifiedPublisher.fields.videoId", {
									defaultValue: "YouTube Video ID (for Unison)",
								})}
							</Text>
							<TextField.Root
								value={videoId}
								onChange={(e) => setVideoId(e.target.value)}
								placeholder="e.g. dQw4w9WgXcQ"
								disabled={isPublishing}
							/>
						</Box>
					</Flex>
				</Flex>

				{/* Multi-Format Live Preview */}
				<Tabs.Root defaultValue="ttml">
					<Tabs.List size="1">
						<Tabs.Trigger value="ttml">TTML Preview</Tabs.Trigger>
						<Tabs.Trigger value="lyricsfile">Lyricsfile (YAML)</Tabs.Trigger>
						<Tabs.Trigger value="lrc">Synced LRC</Tabs.Trigger>
						<Tabs.Trigger value="plain">Plain Text</Tabs.Trigger>
					</Tabs.List>

					<Box pt="2">
						<Tabs.Content value="ttml">
							<TextArea
								value={generatedTtml}
								readOnly
								rows={6}
								style={{
									fontFamily: "monospace",
									fontSize: 12,
									backgroundColor: "var(--gray-a2)",
								}}
							/>
						</Tabs.Content>

						<Tabs.Content value="lyricsfile">
							<TextArea
								value={generatedLyricsfile}
								readOnly
								rows={6}
								style={{
									fontFamily: "monospace",
									fontSize: 12,
									backgroundColor: "var(--gray-a2)",
								}}
							/>
						</Tabs.Content>

						<Tabs.Content value="lrc">
							<TextArea
								value={generatedSyncedLrc}
								readOnly
								rows={6}
								style={{
									fontFamily: "monospace",
									fontSize: 12,
									backgroundColor: "var(--gray-a2)",
								}}
							/>
						</Tabs.Content>

						<Tabs.Content value="plain">
							<TextArea
								value={generatedPlainText}
								readOnly
								rows={6}
								style={{
									fontFamily: "monospace",
									fontSize: 12,
									backgroundColor: "var(--gray-a2)",
								}}
							/>
						</Tabs.Content>
					</Box>
				</Tabs.Root>

				{/* Footer Controls */}
				<Flex justify="between" align="center" mt="4" wrap="wrap" gap="2">
					<Flex align="center" gap="1">
						<Info16Regular style={{ color: "var(--gray-10)" }} />
						<Text size="1" color="gray">
							{t("unifiedPublisher.permanentNote", {
								defaultValue:
									"LRCLIB & Unison entries are publicly visible once published.",
							})}
						</Text>
					</Flex>

					<Flex gap="3">
						<Dialog.Close>
							<Button variant="soft" color="gray" disabled={isPublishing}>
								{t("common.cancel", { defaultValue: "Cancel" })}
							</Button>
						</Dialog.Close>
						<Button
							color="violet"
							onClick={handlePublishAll}
							loading={isPublishing}
							disabled={
								isPublishing ||
								(!publishToLrcLib && !publishToUnison) ||
								!song.trim() ||
								!artist.trim()
							}
						>
							<Rocket16Filled />
							{t("unifiedPublisher.publishButton", {
								defaultValue: "Publish to Selected Databases",
							})}
						</Button>
					</Flex>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
}
