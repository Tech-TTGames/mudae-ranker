import { rating, ordinal } from 'openskill'
import type { Character } from '@/types/character'
import type { AppSavePayload, TierConfig } from '@/types/app'
import { AppMode } from '@/types/app'

/**
 * PARSE & IMPORT
 * Parses JSON into an AppSavePayload or Character[], or cleans raw Mudae Discord text into Characters.
 */
export function parseImportData(
  rawData: string,
  isMerge = false,
): Partial<AppSavePayload> | Character[] {
  // 1. Attempt JSON Parse First
  try {
    const parsed = JSON.parse(rawData)

    // Handle legacy/simplified array imports or full AppSavePayload
    if (Array.isArray(parsed)) {
      return parsed as Character[]
    } else if (parsed.characters) {
      return parsed as Partial<AppSavePayload>
    }
  } catch {
    // Fall through to plain text parsing
  }

  // 2. Mudae Discord Text Cleanup
  let initialText = rawData.replace(/\n\n+/g, '\n').replace(/\u200b/g, '')
  initialText = initialText.replace(
    /\[([1-9]|1[12]):([0-5][0-9]) [AP]M] BOTMuda(e|maid)( \d+)?: /gi,
    '',
  )
  initialText = initialText.replace(
    /Muda(e|maid \d+)BOTToday at ([1-9]|1[12]):([0-5][0-9]) [AP]M/gi,
    '',
  )
  initialText = initialText.replace(/<(https?:\/\/[^>]+)>/gi, '$1')

  const hasSeriesHeaders = /(.*) (- | +)\d+\/\d+/.test(initialText)
  if (!hasSeriesHeaders) initialText = 'Unknown Series - 1/1\n' + initialText

  initialText = initialText.replace(/(.*) (- | +)\d+\/\d+/g, '$$$1')
  const seriesArray = initialText.split('$').slice(1)

  // Order Preservation Tracking
  const shouldSeedRanks = !hasSeriesHeaders && !isMerge
  const rawLines = initialText
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('$'))
  const totalCharactersToImport = rawLines.length
  let globalImportIndex = 0

  const extractedCharacters: Character[] = []

  seriesArray.forEach((seriesChunk) => {
    const seriesData = seriesChunk.trim().split('\n')
    const seriesName = seriesData.shift()?.trim() ?? 'Unknown Series'

    seriesData.forEach((characterString) => {
      const cString = characterString.trim()
      if (!cString) return

      const imageURLIndex = cString.lastIndexOf(' - https:')
      let characterImage = ''
      let nameAndNotePart = cString

      if (imageURLIndex > 0) {
        characterImage = cString.substring(imageURLIndex + 3).trim()
        nameAndNotePart = cString.substring(0, imageURLIndex).trim()
      }

      let noteText = ''
      const firstPipeIndex = nameAndNotePart.indexOf(' | ')
      if (firstPipeIndex !== -1) {
        noteText = nameAndNotePart.substring(firstPipeIndex + 3).trim()
        nameAndNotePart = nameAndNotePart.substring(0, firstPipeIndex).trim()
      }

      const originalName = nameAndNotePart
      const characterName = originalName.replace(/(?: \([A-Z]+\))?/gi, '').trim()

      // Calculate OpenSkill seed values to preserve list sequence
      const rankOffset = shouldSeedRanks ? (totalCharactersToImport - globalImportIndex) * 0.05 : 0
      const startingSigma = shouldSeedRanks ? 7.0 : 8.333
      const startingMu = 25.0 + rankOffset

      globalImportIndex++

      const defaultRating = rating({ mu: startingMu, sigma: startingSigma })

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
        mu: startingMu,
        sigma: startingSigma,
        score: ordinal(defaultRating),
        osRating: defaultRating,
      })
    })
  })

  return extractedCharacters
}

/**
 * Helper to trigger a browser file download for any JSON blob.
 */
function downloadJsonFile(data: unknown, filename: string) {
  const dataStr = JSON.stringify(data, null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()

  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * SIMPLIFIED EXPORT
 * Serializes only the character array to a JSON file.
 */
export function exportCharactersToJson(
  characters: Character[],
  filename = 'mudae-characters.json',
) {
  downloadJsonFile(characters, filename)
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
  filename = 'mudae-rank-export.json',
) {
  const exportData: AppSavePayload = {
    appState: {
      rankingInProgress,
      activeMode,
    },
    characters,
    tierConfig,
    metadata: {
      timestamp: Date.now(),
      deviceId,
    },
  }

  downloadJsonFile(exportData, filename)
}

/**
 * MUDAE EXPORT: SORT COMMAND ($smp)
 * Generates the paginated $smp strings based on Discord's 2000-character limit.
 */
export function generateExportSortCommand(targetList: Character[], hasFlagged: boolean): string {
  const total = targetList.length

  if (total === 0) throw new Error('No characters available to export.')

  const firstChar = targetList[0]
  if (!firstChar || firstChar.originalName === undefined) {
    throw new Error("Looks like your characters don't have original names stored.")
  }

  // Ensure they are strictly sorted by score
  const sortedList = [...targetList].sort((a, b) => b.score - a.score)

  let output = ''

  // If we are exporting the entire list, we optionally append a $fm command at the top
  if (!hasFlagged) {
    output += `$fm ${sortedList[0]!.originalName}\n\n`
  }

  if (total > 1) {
    const MAX_DISCORD_LENGTH = 2000
    let currentChunk = `$smp ${sortedList[0]!.originalName}`

    for (let i = 1; i < total; i++) {
      const currentChar = sortedList[i]
      if (!currentChar) continue
      const nextAddition = `$${currentChar.originalName}`

      if (currentChunk.length + nextAddition.length > MAX_DISCORD_LENGTH) {
        output += currentChunk + '\n\n'
        const prevChar = sortedList[i - 1]
        currentChunk = `$smp ${prevChar?.originalName ?? ''}${nextAddition}`
      } else {
        currentChunk += nextAddition
      }
    }

    const lastChar = sortedList[total - 1]
    if (currentChunk !== `$smp ${lastChar?.originalName ?? ''}`) {
      output += currentChunk + '\n\n'
    }
  } else if (hasFlagged && total === 1) {
    throw new Error('You need at least 2 characters selected to generate a differential sort.')
  }

  return output.trim()
}

/**
 * MUDAE EXPORT: NOTES COMMAND ($note)
 * Groups characters by note and paginates strings based on Discord's 2000-character limit.
 */
export function generateExportNotesCommand(targetList: Character[]): string {
  if (targetList.length === 0) throw new Error('No characters available to export.')

  const noteGroups: Record<string, string[]> = {}
  targetList.forEach((c) => {
    const note = (c.note || '').trim()
    if (note !== '') {
      if (!noteGroups[note]) noteGroups[note] = []
      noteGroups[note].push(c.originalName)
    }
  })

  if (Object.keys(noteGroups).length === 0) {
    throw new Error('None of the targeted characters have notes saved.')
  }

  let output = ''
  const MAX_DISCORD_LENGTH = 2000

  for (const [noteText, names] of Object.entries(noteGroups)) {
    let currentNames: string[] = []
    let currentLength = `$note $${noteText}`.length

    for (const name of names) {
      const nameLen = name.length + (currentNames.length > 0 ? 1 : 0)
      if (currentLength + nameLen > MAX_DISCORD_LENGTH) {
        output += `$note ${currentNames.join('$')}$${noteText}\n\n`
        currentNames = [name]
        currentLength = `$note $${noteText}`.length + name.length
      } else {
        currentNames.push(name)
        currentLength += nameLen
      }
    }

    if (currentNames.length > 0) {
      output += `$note ${currentNames.join('$')}$${noteText}\n\n`
    }
  }

  return output.trim()
}
