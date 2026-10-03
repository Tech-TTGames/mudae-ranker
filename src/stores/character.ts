import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { rating } from 'openskill'
import { parseImportData } from '@/utils/io'
import type { Character } from '@/types/character'
import type { TierConfig } from '@/types/app'

export const useCharacterStore = defineStore('characters', () => {
  // --- State ---
  const characters = ref<Character[]>([])
  const tierConfig = ref<TierConfig[]>([
    { label: '❤️', size: 15 },
    { label: '⭐', size: 30 },
    { label: '🔼', size: 50 },
    { label: '', size: -1 },
  ])
  const isFlagMode = ref(false)

  // --- Getters ---
  const unskippedCharacters = computed(() => characters.value.filter((c) => !c.skip))

  const flaggedCharacters = computed(() => characters.value.filter((c) => c.flag))

  // Determines the target list for bulk actions based on legacy behavior
  const bulkActionTargetList = computed(() =>
    flaggedCharacters.value.length > 0 ? flaggedCharacters.value : characters.value,
  )

  const searchQuery = ref('')

  const filteredCharacters = computed(() => {
    if (!searchQuery.value.trim()) return characters.value

    const query = searchQuery.value.toLowerCase()
    return characters.value.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        (c.series && c.series.toLowerCase().includes(query)) ||
        (c.note && c.note.toLowerCase().includes(query)),
    )
  })

  function minimizeName(name: string): string {
    // Strips spaces and special characters for linkage matching
    return name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  }

  function hydrateCharacter(c: Partial<Character>): Character {
    // 1. MIGRATION: Convert legacy Elo -> OpenSkill (if processing old JSON)
    const rawChar = c as Partial<Character> & { elo?: number }
    if (typeof rawChar.elo !== 'undefined' && typeof c.mu === 'undefined') {
      c.mu = 25.0 + (rawChar.elo - 1200) / 40.0
      const matches = c.endlessMatches || c.totalMatches || 0
      c.sigma = matches === 0 ? 8.333 : 1.0 + 7.333 * Math.exp(-0.05 * matches)
      delete rawChar.elo
    }

    // 2. UNSEEDED / NEW CHARACTERS
    if (typeof c.mu === 'undefined') {
      c.mu = 25.0
      c.sigma = 8.333
    }

    // 3. HYDRATE OPENSKILL RATING OBJECT
    const osRating = rating({ mu: c.mu as number, sigma: c.sigma as number })

    return {
      id: c.id || crypto.randomUUID(),
      name: c.name || 'Unknown',
      originalName: c.originalName || c.name || 'Unknown',
      minimizedName: c.minimizedName || minimizeName(c.name || 'Unknown'),
      series: c.series || 'Unknown Series',
      imageUrl: c.imageUrl || '',
      note: c.note || '',
      skip: !!c.skip,
      linkedTo: c.linkedTo || '',
      flag: !!c.flag,
      placementMatchesLeft: c.skip ? 0 : (c.placementMatchesLeft ?? 5),
      mu: c.mu as number,
      sigma: c.sigma as number,
      osRating: osRating,
      totalMatches: Math.max(c.totalMatches || 0, (c.endlessMatches || 0) + (c.swissMatches || 0)),
      endlessMatches: c.endlessMatches || 0,
      swissMatches: c.swissMatches || 0,
    }
  }

  function mergeCharacter(characterData: Partial<Character>): Character {
    for (let i = 0; i < characters.value.length; i++) {
      const matchChar = characters.value[i]
      if (!matchChar) continue
      if (
        matchChar.originalName === characterData.originalName &&
        (matchChar.series === characterData.series ||
          matchChar.series === 'Unknown Series' ||
          characterData.series === 'Unknown Series')
      ) {
        if (
          matchChar.series === 'Unknown Series' &&
          characterData.series &&
          characterData.series !== 'Unknown Series'
        ) {
          matchChar.series = characterData.series
        }
        if (characterData.note && characterData.note !== '') {
          matchChar.note = characterData.note
        }
        if (characterData.imageUrl && characterData.imageUrl.trim() !== '') {
          matchChar.imageUrl = characterData.imageUrl
        }
        return matchChar
      }
    }

    // Brand new arrival
    characterData.placementMatchesLeft = characterData.skip ? 0 : 5
    characterData.flag = !characterData.skip
    const newChar = hydrateCharacter(characterData)
    characters.value.push(newChar)
    return newChar
  }

  // --- Actions: Sorting & Deletion ---

  function sortArray() {
    // Enforces descending rating, with alphabetical fallback to prevent scrambled unseeded imports
    characters.value.sort((a, b) => {
      const diff = b.mu - a.mu
      if (Math.abs(diff) < 1e-12) {
        return a.originalName.localeCompare(b.originalName)
      }
      return diff
    })
  }

  function deleteCharacter(characterId: string) {
    const index = characters.value.findIndex((c) => c.id === characterId)
    if (index !== -1) {
      characters.value.splice(index, 1)
    }
  }

  function massDeleteFlagged() {
    // Iterating backwards prevents index shifting issues during deletion
    for (let i = characters.value.length - 1; i >= 0; i--) {
      const char = characters.value[i]
      if (char?.flag) {
        characters.value.splice(i, 1)
      }
    }
    reapplyLinks()
  }

  function massFlagVisible() {
    const targetList = searchQuery.value.trim() ? filteredCharacters.value : characters.value
    targetList.forEach((c) => (c.flag = true))
  }

  function clearAllFlags() {
    characters.value.forEach((c) => (c.flag = false))
  }

  function applyUnskipMath(c: Character) {
    c.linkedTo = ''

    // Detect variance collapse (frozen state due to skip/link locks)
    if (c.sigma <= 0.1) {
      // Retain the current mu, which accurately reflects their position in the hierarchy.
      // Inject a moderate amount of standard deviation to thaw the parameter and permit future mobility.
      const dynamicTau = 4.0; // Half of initial uncertainty (8.333 / 2)
      c.sigma = Math.min(8.333, Math.sqrt((c.sigma ** 2) + (dynamicTau ** 2)));

      // Update the rating object
      c.osRating = rating({ mu: c.mu, sigma: c.sigma });
    }
  }

  // --- Actions: Mass Toggles & Skips ---
  function toggleSingleSkip(characterId: string, shouldSkip: boolean) {
    const c = characters.value.find((char) => char.id === characterId)
    if (!c) return

    c.skip = shouldSkip
    if (!shouldSkip) {
      applyUnskipMath(c)
    }

    // Re-evaluate in case breaking this link shifted followers
    reapplyLinks()
  }

  function massToggleSkip(shouldSkip: boolean) {
    let updatedCount = 0
    bulkActionTargetList.value.forEach((c) => {
      c.skip = shouldSkip
      if (!shouldSkip) {
        applyUnskipMath(c)
      }
      updatedCount++
    })

    // Trigger cascade link rebuild once at the very end
    reapplyLinks()
    return updatedCount
  }

  function massEditNotes(newNote: string) {
    let updatedCount = 0
    bulkActionTargetList.value.forEach((c) => {
      c.note = newNote
      updatedCount++
    })
    return updatedCount
  }

  function massLinkAfter(targetCharacterName: string) {
    if (!targetCharacterName || targetCharacterName.trim() === '') return 0

    const searchLower = targetCharacterName.trim().toLowerCase()
    let finalLinkText = targetCharacterName.trim()

    // Search for the target character to get their precise minimized name
    const leader = characters.value.find(
      (char) =>
        (char.originalName && char.originalName.toLowerCase() === searchLower) ||
        (char.minimizedName && char.minimizedName.toLowerCase() === searchLower),
    )

    if (leader) {
      finalLinkText = leader.minimizedName
    }

    let updatedCount = 0
    bulkActionTargetList.value.forEach((c) => {
      c.skip = true
      c.linkedTo = finalLinkText
      updatedCount++
    })

    // Trigger cascade link rebuild
    reapplyLinks()

    return updatedCount
  }

  function massResetMatchCounts() {
    characters.value.forEach((c) => {
      c.totalMatches = 0
      c.endlessMatches = 0
      c.swissMatches = 0
    })
  }

  // --- Actions: Edit Mode Utilities ---

  function getLowestMu(): number {
    let lowest = 100.0
    characters.value.forEach((c) => {
      if (typeof c.mu === 'number' && c.mu < lowest) lowest = c.mu
    })
    return lowest === 100.0 ? 10.0 : lowest
  }

  /**
   * Conditionally sanitizes and replanes the mathematical foundation of an imported dataset
   * if legacy rating inflation or variance collapse is detected, preserving ordinal intent.
   */
  function conditionallyReplaneRoster(characters: Character[], bypassDiagnostics = false) {
    if (characters.length === 0) return;

    // 1. Diagnostics: Detect severe macroeconomic inflation or deflation
    const globalMu = characters.reduce((sum, c) => sum + c.mu, 0) / characters.length;
    const maxMu = Math.max(...characters.map((c) => c.mu));
    const hasLegacyScore = characters.some((c) => 'score' in c && typeof c.score === 'number');

    // Thresholds: Legacy score exists, global average drifted > 2 points, or mu exceeds 50
    const isCorrupted = hasLegacyScore || Math.abs(globalMu - 25.0) > 2.0 || maxMu > 50.0;

    if (!isCorrupted && !bypassDiagnostics) return;

    if (hasLegacyScore) {
      console.warn("Legacy score detected. Forcing replane to preserve ordinal hierarchy...");
    } else {
      console.warn("Legacy rating economy corruption detected. Re-planing ecosystem...");
    }

    if (bypassDiagnostics) {
      console.warn("Diagnostics bypassed. Proceeding with re-planing.");
    }

    // 2. Snapshot the user's intended ordinal hierarchy
    // Excludes LINKED characters (who derive stats dynamically), but INCLUDE SKIPPED characters
    // so their frozen ratings are also properly sanitized and centered.
    const activeRoster = characters.filter((c) => !c.linkedTo);
    activeRoster.sort((a: any, b: any) => {
      if (hasLegacyScore && typeof b.score === 'number' && typeof a.score === 'number') {
        return b.score - a.score;
      }
      return b.mu - a.mu;
    });

    // 3. Zero-Sum Redistribution (Mean Centering)
    const MAX_SPREAD = 15.0; // Enforce safe boundaries between mu = 10.0 and mu = 40.0
    const totalActive = activeRoster.length;

    activeRoster.forEach((char, index) => {
      // Map the character to a normalized position between 1.0 (top) and -1.0 (bottom)
      const normalizedPosition = totalActive > 1
          ? ((totalActive - 1 - index) / (totalActive - 1)) * 2 - 1
          : 0;

      // Assign a perfectly centered mu based on their ordinal position
      char.mu = 25.0 + (normalizedPosition * MAX_SPREAD);

      // 4. Normalize and Thaw Variance (Tau injection)
      // OpenSkill's natural bounds are ~1.5 (highly confident) to 8.333 (unranked)
      const SIGMA_MIN = 1.5;
      const SIGMA_MAX = 8.333;

      if (typeof char.sigma !== 'number' || isNaN(char.sigma)) {
        char.sigma = SIGMA_MAX; // Failsafe for completely missing data
      } else {
        // Step A (Normalize): Clamp the existing sigma into the safe standard range
        const normalizedSigma = Math.max(SIGMA_MIN, Math.min(SIGMA_MAX, char.sigma));

        // Step B (Thaw): Inject a flat 0.5 variance to promote mobility on their new mu
        char.sigma = Math.min(SIGMA_MAX, normalizedSigma + 0.5);
      }

      // Re-hydrate the native OpenSkill rating object
      char.osRating = rating({ mu: char.mu, sigma: char.sigma });

      if ('score' in char) {
        delete char.score;
      }
    });
  }


  function updateAll(newCharacters: Character[]) {
    characters.value = newCharacters.map((c) => {
      if (!c.id || typeof c.mu === 'undefined') {
        return hydrateCharacter(c)
      }

      if (!c.skip || c.linkedTo.trim() === '') {
        c.linkedTo = ''
      }

      const endless = c.endlessMatches || 0
      const swiss = c.swissMatches || 0
      c.totalMatches = Math.max(c.totalMatches || 0, endless + swiss)
      return c
    })
    conditionallyReplaneRoster(characters.value)
    reapplyLinks()
  }

  function addNewCharacter(character: Character) {
    characters.value.push(character)
    sortArray()
  }

  function absorbAdjacent(activeId: string, direction: number) {
    // 1. Determine which list the user is actually looking at
    const activeList = searchQuery.value.trim() ? filteredCharacters.value : characters.value

    // 2. Find the active character in the current visual list
    const activeListIndex = activeList.findIndex((c) => c.id === activeId)
    if (activeListIndex === -1) return

    // 3. Find the target neighbor in the same visual list
    const targetListIndex = activeListIndex + direction
    if (targetListIndex < 0 || targetListIndex >= activeList.length) return

    const survivor = activeList[activeListIndex]
    const target = activeList[targetListIndex]

    if (!survivor || !target) return

    // Steal OpenSkill stats
    survivor.mu = target.mu
    survivor.sigma = target.sigma
    survivor.osRating = target.osRating
    survivor.placementMatchesLeft = target.placementMatchesLeft
    survivor.skip = target.skip
    survivor.totalMatches = target.totalMatches
    survivor.endlessMatches = target.endlessMatches
    survivor.swissMatches = target.swissMatches

    if (!survivor.linkedTo || survivor.linkedTo.trim() === '') {
      survivor.linkedTo = target.linkedTo
    }
    if (target.flag) {
      survivor.flag = true
    }

    // Scavenge metadata
    if (
      (!survivor.series || survivor.series === 'Unknown Series') &&
      target.series &&
      target.series !== 'Unknown Series'
    ) {
      survivor.series = target.series
    }
    if ((!survivor.imageUrl || survivor.imageUrl.trim() === '') && target.imageUrl) {
      survivor.imageUrl = target.imageUrl
    }
    if ((!survivor.note || survivor.note.trim() === '') && target.note) {
      survivor.note = target.note
    }

    // Repoint links
    const targetOriginalLower = target.originalName.toLowerCase()
    const targetMinLower = target.minimizedName.toLowerCase()

    characters.value.forEach((c) => {
      if (c.skip && c.linkedTo && c.linkedTo.trim() !== '') {
        const linkLower = c.linkedTo.trim().toLowerCase()
        if (linkLower === targetOriginalLower || linkLower === targetMinLower) {
          c.linkedTo = survivor.minimizedName
        }
      }
    })

    // 4. Find the target's REAL index in the master array to safely splice it
    const realTargetIndex = characters.value.findIndex((c) => c.id === target.id)
    if (realTargetIndex !== -1) {
      characters.value.splice(realTargetIndex, 1)
      reapplyLinks()
    }
  }

  // --- Actions: Cascading Links ---
  function reapplyLinks() {
    const mainList: Character[] = []
    const linkedList: Character[] = []

    // 1. Separate the characters into independents and dependents
    characters.value.forEach((c) => {
      if (c.skip && c.linkedTo && c.linkedTo.trim() !== '') {
        linkedList.push(c)
      } else {
        mainList.push(c)
      }
    })

    const finalArray: Character[] = []
    const linkMap: Record<string, Character[]> = {}
    const trulyDiscarded: Character[] = []

    // 2. Map the dependents by their target's name
    linkedList.forEach((c) => {
      if (c.linkedTo && c.linkedTo.trim() !== '') {
        const target = c.linkedTo.trim().toLowerCase()
        if (!linkMap[target]) linkMap[target] = []
        linkMap[target].push(c)
      } else {
        trulyDiscarded.push(c)
      }
    })

    const processedSet = new Set<string>()
    let cascadeOffset = 0.0001

    // 3. Recursive insertion function
    function insertWithLinks(char: Character, parentMu: number | null = null) {
      // Prevent infinite loops if users accidentally created a circular dependency
      if (processedSet.has(char.originalName)) return
      processedSet.add(char.originalName)

      if (parentMu !== null) {
        char.mu = parentMu - cascadeOffset
        cascadeOffset += 0.0001

        char.osRating = rating({ mu: char.mu, sigma: char.sigma })
      } else {
        cascadeOffset = 0.0001
      }

      finalArray.push(char)

      // Check if this character has any followers
      const target1 = char.originalName.toLowerCase()
      const target2 = char.minimizedName.toLowerCase()
      const links = (linkMap[target1] || []).concat(linkMap[target2] || [])

      delete linkMap[target1]
      delete linkMap[target2]

      // Recursively chain all followers behind this character
      links.forEach((linkedChar) => {
        insertWithLinks(linkedChar, char.mu)
      })
    }

    // 4. Process the main list
    mainList.forEach((char) => insertWithLinks(char))

    // 5. Clean up orphans (linked to a character that doesn't exist)
    Object.keys(linkMap).forEach((key) => {
      linkMap[key]?.forEach((char) => {
        char.skip = false
        applyUnskipMath(char)
        trulyDiscarded.push(char)
      })
    })

    finalArray.push(...trulyDiscarded)

    // 6. Overwrite the state and sort
    characters.value = finalArray
    sortArray()
  }

  function applyDragAndDropSort(oldIndex: number, newIndex: number) {
    if (oldIndex === newIndex) return;

    const movedChar = characters.value[newIndex];
    if (!movedChar) return;

    const prevChar = newIndex > 0 ? characters.value[newIndex - 1] : null;
    const nextChar = newIndex < characters.value.length - 1 ? characters.value[newIndex + 1] : null;

    // 1. Interpolate strictly within the mu space, completely ignoring sigma
    let targetMu = 25.0;
    if (prevChar && nextChar) {
      targetMu = (prevChar.mu + nextChar.mu) / 2.0;
    } else if (nextChar) {
      targetMu = nextChar.mu + 0.5; // Nominal upper boundary bump for rank 1
    } else if (prevChar) {
      targetMu = prevChar.mu - 0.5; // Nominal lower boundary drop for last place
    }

    // 2. Safely apply the inferred mean derived from the surrounding environment
    movedChar.mu = targetMu;

    // 3. Inject Variance (Tau). The human manual intervention represents a disruption.
    // We expand sigma via standard addition of variance to allow OpenSkill to re-verify later.
    const varianceInjection = 1.5;
    movedChar.sigma = Math.min(8.333, Math.sqrt((movedChar.sigma ** 2) + (varianceInjection ** 2)));

    // 4. Hydrate the correct OpenSkill object
    movedChar.osRating = rating({ mu: movedChar.mu, sigma: movedChar.sigma });

    reapplyLinks();
  }

  // --- Actions: Parser ---
  function parseInputField(inputText: string) {
    if (!inputText || inputText.trim() === '') return

    const mergeMode = characters.value.length > 0

    // 1. Let utility parse with awareness of existing state
    const parsedResult = parseImportData(inputText, mergeMode)

    // 2. Extract character array
    let charsToImport: Character[] = []
    if (Array.isArray(parsedResult)) {
      charsToImport = parsedResult
    } else if (parsedResult.characters) {
      charsToImport = parsedResult.characters
    }

    if (charsToImport.length === 0) return

    // 3. Merge or override existing roster
    if (mergeMode) {
      charsToImport.forEach((c: Partial<Character>) => mergeCharacter(c))
    } else {
      updateAll(charsToImport as Character[])
    }

    reapplyLinks()
  }

  // --- Actions: Auto-Stratify ---

  function applyTierStratification() {
    let currentTierIndex = 0
    let countInCurrentTier = 0

    // Iterate through the already-sorted array
    for (const char of characters.value) {
      const activeTier = tierConfig.value[currentTierIndex]

      // If we run out of defined tiers, stop applying notes
      if (!activeTier) break

      // Apply the tier label as the character's note
      char.note = activeTier.label

      // If the tier is strictly bounded (size !== -1), track the count
      if (activeTier.size !== -1) {
        countInCurrentTier++

        // Move to the next tier once the capacity is reached
        if (countInCurrentTier >= activeTier.size) {
          currentTierIndex++
          countInCurrentTier = 0
        }
      }
      // If size is -1 (unbounded), it will just consume the rest of the list automatically
    }
  }

  return {
    characters,
    tierConfig,
    isFlagMode,
    unskippedCharacters,
    flaggedCharacters,
    searchQuery,
    filteredCharacters,
    bulkActionTargetList,
    sortArray,
    deleteCharacter,
    massDeleteFlagged,
    massFlagVisible,
    clearAllFlags,
    massToggleSkip,
    massEditNotes,
    massLinkAfter,
    massResetMatchCounts,
    getLowestMu,
    updateAll,
    addNewCharacter,
    absorbAdjacent,
    reapplyLinks,
    applyDragAndDropSort,
    parseInputField,
    applyTierStratification,
    toggleSingleSkip,
  }
})
