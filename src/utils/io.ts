import { rating, ordinal } from 'openskill';
import type { Character } from '@/types/character';
import type { AppSavePayload, TierConfig } from '@/types/app';
import { AppMode } from '@/types/app';

/**
 * PARSE & IMPORT
 * Parses JSON into an AppSavePayload or Character[], or cleans raw Mudae Discord text into Characters.
 */
export function parseImportData(rawData: string): Partial<AppSavePayload> | Character[] {
    // 1. Attempt JSON Parse First
    try {
        const parsed = JSON.parse(rawData);

        // Handle legacy/simplified array imports or full AppSavePayload
        if (Array.isArray(parsed)) {
            return parsed as Character[];
        } else if (parsed.characters) {
            return parsed as Partial<AppSavePayload>;
        }
    } catch (e) {
        // Fall through to plain text parsing
    }

    // 2. Mudae Discord Text Cleanup
    let initialText = rawData.replace(/\n\n+/g, '\n').replace(/\u200b/g, '');
    initialText = initialText.replace(/\[([1-9]|1[12]):([0-5][0-9]) [AP]M] BOTMuda(e|maid)( \d+)?: /gi, '');
    initialText = initialText.replace(/Muda(e|maid \d+)BOTToday at ([1-9]|1[12]):([0-5][0-9]) [AP]M/gi, '');
    initialText = initialText.replace(/<(https?:\/\/[^>]+)>/gi, '$1');

    const hasSeriesHeaders = /(.*) (- | +)\d+\/\d+/.test(initialText);
    if (!hasSeriesHeaders) initialText = "Unknown Series - 1/1\n" + initialText;

    initialText = initialText.replace(/(.*) (- | +)\d+\/\d+/g, '$$$1');
    const seriesArray = initialText.split('$').slice(1);

    const extractedCharacters: Character[] = [];

    seriesArray.forEach(seriesChunk => {
        const seriesData = seriesChunk.trim().split('\n');
        const seriesName = seriesData.splice(0, 1)[0].trim();

        seriesData.forEach(characterString => {
            const cString = characterString.trim();
            if (!cString) return;

            const imageURLIndex = cString.lastIndexOf(' - https:');
            let characterImage = '';
            let nameAndNotePart = cString;

            if (imageURLIndex > 0) {
                characterImage = cString.substring(imageURLIndex + 3).trim();
                nameAndNotePart = cString.substring(0, imageURLIndex).trim();
            }

            let noteText = '';
            const firstPipeIndex = nameAndNotePart.indexOf(' | ');
            if (firstPipeIndex !== -1) {
                noteText = nameAndNotePart.substring(firstPipeIndex + 3).trim();
                nameAndNotePart = nameAndNotePart.substring(0, firstPipeIndex).trim();
            }

            const originalName = nameAndNotePart;
            const characterName = originalName.replace(/(?: \([A-Z]+\))?/gi, '').trim();
            const defaultRating = rating();

            extractedCharacters.push({
                id: crypto.randomUUID(),
                name: characterName,
                originalName: originalName,
                minimizedName: characterName.toLowerCase().replace(/[^a-z0-9]/g, ''),
                series: seriesName,
                imageUrl: characterImage,
                note: noteText,
                skip: false,
                flag: false,
                linkedTo: '',
                totalMatches: 0,
                endlessMatches: 0,
                placementMatchesLeft: 5,
                mu: 25.0,
                sigma: 8.333,
                score: ordinal(defaultRating),
                osRating: defaultRating
            });
        });
    });

    return extractedCharacters;
}

/**
 * Helper to trigger a browser file download for any JSON blob.
 */
function downloadJsonFile(data: unknown, filename: string) {
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * SIMPLIFIED EXPORT
 * Serializes only the character array to a JSON file.
 */
export function exportCharactersToJson(characters: Character[], filename = 'mudae-characters.json') {
    downloadJsonFile(characters, filename);
}

/**
 * FULL EXPORT
 * Serializes the full application save payload (state, characters, tiers, metadata).
 */
export function exportFullAppStateToJson(
    characters: Character[],
    activeMode: AppMode,
    rankingInProgress: boolean,
    tierConfig: TierConfig[],
    deviceId: string,
    filename = 'mudae-rank-export.json'
) {
    const exportData: AppSavePayload = {
        appState: {
            rankingInProgress,
            activeMode
        },
        characters,
        tierConfig,
        metadata: {
            timestamp: Date.now(),
            deviceId
        }
    };

    downloadJsonFile(exportData, filename);
}
