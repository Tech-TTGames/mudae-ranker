import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { rating, ordinal } from 'openskill'
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
      score: ordinal(osRating),
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

  function sortArrayByScore() {
    // Enforces descending conservative score, with alphabetical fallback to prevent scrambled unseeded imports
    characters.value.sort((a, b) => {
      const diff = b.score - a.score
      if (Math.abs(diff) < 0.0001) {
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
    sortArrayByScore()
  }

  function clearAllFlags() {
    characters.value.forEach((c) => (c.flag = false))
  }

  function applyUnskipMath(c: Character) {
    c.linkedTo = ''

    // Only reset and compensate if the character's sigma has actually collapsed
    if (c.sigma <= 0.001) {
      const preservedScore = c.score
      c.sigma = 8.333
      c.mu = preservedScore + 3.0 * c.sigma

      const newRating = rating({ mu: c.mu, sigma: c.sigma })
      c.osRating = newRating
      c.score = ordinal(newRating) // Locks in the preserved score safely
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

    // Trigger cascade link rebuild (To be implemented in Step 1.3)
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

  function getLowestScore(): number {
    let lowest = 100.0
    characters.value.forEach((c) => {
      if (typeof c.score === 'number' && c.score < lowest) lowest = c.score
    })
    return lowest === 100.0 ? 0.0 : lowest
  }

  function updateAll(newCharacters: Character[]) {
    characters.value = newCharacters.map((c) => hydrateCharacter(c))
    sortArrayByScore()
  }

  function addNewCharacter(character: Character) {
    characters.value.push(character)
    sortArrayByScore()
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
    survivor.score = target.score
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
      sortArrayByScore()
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
    function insertWithLinks(char: Character, parentScore: number | null = null) {
      // Prevent infinite loops if users accidentally created a circular dependency
      if (processedSet.has(char.originalName)) return
      processedSet.add(char.originalName)

      if (parentScore !== null) {
        // Force sigma to basically 0, making Score exactly equal to Mu
        char.mu = parentScore - cascadeOffset
        char.sigma = 0.001
        cascadeOffset += 0.0001

        char.osRating = rating({ mu: char.mu, sigma: char.sigma })
        char.score = char.mu // Since sigma is tiny, score = mu
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
        insertWithLinks(linkedChar, char.score)
      })
    }

    // 4. Process the main list
    mainList.forEach((char) => insertWithLinks(char))

    // 5. Clean up orphans (linked to a character that doesn't exist)
    Object.keys(linkMap).forEach((key) => {
      linkMap[key]?.forEach((char) => trulyDiscarded.push(char))
    })

    finalArray.push(...trulyDiscarded)

    // 6. Overwrite the state and sort
    characters.value = finalArray
    sortArrayByScore()
  }

  function applyDragAndDropSort(oldIndex: number, newIndex: number) {
    if (oldIndex === newIndex) return

    const movedChar = characters.value[newIndex]
    if (!movedChar) return
    const prevChar = newIndex > 0 ? characters.value[newIndex - 1] : null
    const nextChar = newIndex < characters.value.length - 1 ? characters.value[newIndex + 1] : null

    let targetScore = 25.0 // Failsafe for an empty array, though technically impossible here

    // 1. Determine target score based on boundary vs. inline drop
    if (prevChar && nextChar) {
      // Dropped in the middle: exact average of the two neighbors
      targetScore = (prevChar.score + nextChar.score) / 2.0
    } else if (nextChar) {
      // Dropped at the absolute top: barely edge out the former #1
      targetScore = nextChar.score + 0.1
    } else if (prevChar) {
      // Dropped at the absolute bottom: barely fall behind the former last place
      targetScore = prevChar.score - 0.1
    }

    // 2. Barely penalize sigma to prevent the score from crashing
    movedChar.sigma = Math.min(8.333, (movedChar.sigma || 4.0) + 0.1)

    // 3. Reverse engineer mu so the final conservative math precisely matches the UI drop position
    movedChar.mu = targetScore + 3.0 * movedChar.sigma

    // 4. Hydrate the OpenSkill object and display score
    movedChar.osRating = rating({ mu: movedChar.mu, sigma: movedChar.sigma })
    movedChar.score = ordinal(movedChar.osRating)

    reapplyLinks()
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
      updateAll(charsToImport.map((c: Partial<Character>) => hydrateCharacter(c)))
    }

    sortArrayByScore()
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
    unskippedCharacters,
    flaggedCharacters,
    searchQuery,
    filteredCharacters,
    bulkActionTargetList,
    sortArrayByScore,
    deleteCharacter,
    massDeleteFlagged,
    clearAllFlags,
    massToggleSkip,
    massEditNotes,
    massLinkAfter,
    massResetMatchCounts,
    getLowestMu,
    getLowestScore,
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
