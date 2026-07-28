import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { rating, ordinal } from 'openskill'
import type { Character } from '../types/character'
import type { TierConfig } from '../types/app'

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
    flaggedCharacters.value.length > 0 ? flaggedCharacters.value : characters.value
  );

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
      if (characters.value[i].flag) {
        characters.value.splice(i, 1)
      }
    }
    sortArrayByScore()
  }

  function clearAllFlags() {
    characters.value.forEach((c) => (c.flag = false))
  }

  // --- Actions: Mass Toggles ---

  function massToggleSkip(shouldSkip: boolean) {
    let updatedCount = 0

    bulkActionTargetList.value.forEach((c) => {
      c.skip = shouldSkip

      if (!shouldSkip) {
        c.linkedTo = ''

        // If the character's sigma collapsed, reset it to the 8.333 baseline so they can be ranked again
        if (c.sigma <= 0.001) {
          c.sigma = 8.333
          const newRating = rating({ mu: c.mu, sigma: c.sigma })
          c.osRating = newRating
          c.score = ordinal(newRating) // Recalculates mu - 3*sigma
        }
      }
      updatedCount++
    })

    // Trigger cascade link rebuild (To be implemented in Step 1.3)
    reapplyLinks();

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
    reapplyLinks();

    return updatedCount
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
    characters.value = newCharacters
    sortArrayByScore()
  }

  function addNewCharacter(character: Character) {
    characters.value.push(character)
    sortArrayByScore()
  }

  function absorbAdjacent(activeIndex: number, direction: number) {
    const targetIndex = activeIndex + direction

    if (targetIndex < 0 || targetIndex >= characters.value.length) return

    const survivor = characters.value[activeIndex]
    const target = characters.value[targetIndex]

    // Steal OpenSkill stats
    survivor.mu = target.mu
    survivor.sigma = target.sigma
    survivor.osRating = target.osRating
    survivor.score = target.score
    survivor.placementMatchesLeft = target.placementMatchesLeft
    survivor.skip = target.skip

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

    characters.value.splice(targetIndex, 1)
    sortArrayByScore()
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
      linkMap[key].forEach((char) => trulyDiscarded.push(char))
    })

    finalArray.push(...trulyDiscarded)

    // 6. Overwrite the state and sort
    characters.value = finalArray
    sortArrayByScore()
  }

  return {
    characters,
    tierConfig,
    unskippedCharacters,
    flaggedCharacters,
    sortArrayByScore,
    deleteCharacter,
    massDeleteFlagged,
    clearAllFlags,
    massToggleSkip,
    massEditNotes,
    massLinkAfter,
    getLowestMu,
    getLowestScore,
    updateAll,
    addNewCharacter,
    absorbAdjacent,
    reapplyLinks
  }
})
