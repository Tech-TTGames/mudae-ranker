import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { rate, rating, ordinal, predictDraw } from 'openskill'
import { bradleyTerryFull } from 'openskill/models'
import { useCharacterStore } from './character'
import type { Character } from '@/types/character'
import { AppMode } from '@/types/app'

export interface PlacementState {
  active: boolean
  queue: Character[]
  target: Character | null
  history: Set<string>
}

export interface MatchHistory {
  char1Id: string
  char2Id: string
  char1OldStats: { mu: number; sigma: number; score: number }
  char2OldStats: { mu: number; sigma: number; score: number }
}

export const useRankStore = defineStore('rank', () => {
  const characterStore = useCharacterStore()

  // --- State ---
  const mode = ref<AppMode>(AppMode.Edit)
  const lastRankMode = ref<AppMode | null>(null)
  const currentMatch = ref<[Character | null, Character | null]>([null, null])

  // History & Penalties
  const recentMatchups = ref<string[]>([])
  const MAX_RECENT_MATCHUPS = 100
  const undoStack = ref<MatchHistory[]>([])

  // Swiss State
  const maxSwissRounds = ref(3)
  const swissHistory = ref<Set<string>>(new Set())

  // Placement State
  const placementState = ref<PlacementState>({
    active: false,
    queue: [],
    target: null,
    history: new Set(),
  })

  // --- Getters ---
  const hasActiveMatch = computed(
    () => currentMatch.value[0] !== null && currentMatch.value[1] !== null,
  )
  const canUndo = computed(() => undoStack.value.length > 0)
  const isRankingInProgress = computed(() => {
    const validChars = characterStore.unskippedCharacters.length >= 2
    return (mode.value !== AppMode.Edit || lastRankMode.value !== null) && validChars
  })

  // --- Helpers ---
  function getMatchupSignature(charA: Character | null, charB: Character | null): string {
    if (!charA || !charB) return ''
    return [charA.originalName, charB.originalName].sort().join('::')
  }

  function recordMatchup(charA: Character, charB: Character) {
    const sig = getMatchupSignature(charA, charB)
    if (!sig) return
    recentMatchups.value.push(sig)
    if (recentMatchups.value.length > MAX_RECENT_MATCHUPS) {
      recentMatchups.value.shift()
    }
  }

  // --- Actions: Undo Engine ---
  function undoRank() {
    if (undoStack.value.length === 0) return false

    const lastMatch = undoStack.value.pop()
    if (!lastMatch) return false

    const char1 = characterStore.characters.find((c) => c.id === lastMatch.char1Id)
    const char2 = characterStore.characters.find((c) => c.id === lastMatch.char2Id)

    if (char1 && char2) {
      // 1. Revert OpenSkill Stats
      char1.mu = lastMatch.char1OldStats.mu
      char1.sigma = lastMatch.char1OldStats.sigma
      char1.score = lastMatch.char1OldStats.score
      char1.osRating = rating({ mu: char1.mu, sigma: char1.sigma })

      char2.mu = lastMatch.char2OldStats.mu
      char2.sigma = lastMatch.char2OldStats.sigma
      char2.score = lastMatch.char2OldStats.score
      char2.osRating = rating({ mu: char2.mu, sigma: char2.sigma })

      // 2. Revert Global Play Counts
      if (char1.totalMatches) char1.totalMatches--
      if (char2.totalMatches) char2.totalMatches--

      // 3. Revert Mode-Specific Play Counts & Histories
      if (mode.value === AppMode.Placement) {
        if (placementState.value.target) {
          // Check if we crossed a character boundary
          if (placementState.value.target.id !== char1.id) {
            // We moved to the next character! Push them back to the queue.
            placementState.value.queue.unshift(placementState.value.target)
            // Restore the previous character as the active target
            placementState.value.target = char1
          }
          placementState.value.target.placementMatchesLeft++
        }
      } else if (mode.value === AppMode.RankFinite) {
        if (char1.swissMatches) char1.swissMatches--
        if (char2.swissMatches) char2.swissMatches--
        // Remove the signature so they can legally fight again
        swissHistory.value.delete(getMatchupSignature(char1, char2))
      } else if (mode.value === AppMode.Endless) {
        if (char1.endlessMatches) char1.endlessMatches--
        if (char2.endlessMatches) char2.endlessMatches--
      }

      // Pop the most recent global matchup memory
      recentMatchups.value.pop()

      // 4. Force the UI to display the reverted matchup
      currentMatch.value = [char1, char2]

      // Resort in case the reverted score shuffled their rank
      characterStore.sortArrayByScore()
      return true
    }

    return false
  }

  // --- Actions: Placement Engine ---
  function massInsert() {
    // Uses bulkActionTargetList (flagged characters if any exist, otherwise all characters)
    const targets = characterStore.bulkActionTargetList

    if (targets.length === 0) return false

    targets.forEach((c) => {
      c.skip = false
      c.linkedTo = ''
      c.placementMatchesLeft = 5

      // Reset sigma to 8.333 baseline if collapsed so OpenSkill can calibrate them again
      if (c.sigma <= 0.001) {
        c.sigma = 8.333
        c.osRating = rating({ mu: c.mu, sigma: c.sigma })
        c.score = ordinal(c.osRating)
      }
    })

    // Re-link cascading followers and pass unskipped targets to placement match queue
    characterStore.reapplyLinks()
    return startPlacementMatches(targets.filter((c) => !c.skip))
  }

  function startPlacementMatches(queueToInsert: Character[]) {
    if (!queueToInsert || queueToInsert.length === 0) return false

    mode.value = AppMode.Placement
    placementState.value.queue = queueToInsert
    placementState.value.active = true

    return nextPlacementTarget()
  }

  function nextPlacementTarget(): boolean {
    if (placementState.value.queue.length === 0) {
      placementState.value.active = false
      mode.value = AppMode.Edit
      characterStore.characters.forEach((c) => (c.flag = false))
      characterStore.sortArrayByScore()
      return false
    }

    placementState.value.target = placementState.value.queue.shift()!
    placementState.value.target.placementMatchesLeft = 5
    placementState.value.history.clear()

    return nextPlacementMatch()
  }

  function nextPlacementMatch(): boolean {
    const target = placementState.value.target
    if (!target || target.placementMatchesLeft <= 0) {
      return nextPlacementTarget()
    }

    const activeRoster = characterStore.unskippedCharacters.filter(
      (c) => c.id !== target.id && !placementState.value.queue.some((qc) => qc.id === c.id),
    )

    if (activeRoster.length === 0) {
      target.placementMatchesLeft = 0
      return nextPlacementTarget()
    }

    let candidates = activeRoster.filter(
      (c) =>
        !placementState.value.history.has(c.originalName) &&
        !recentMatchups.value.includes(getMatchupSignature(target, c)),
    )

    if (candidates.length === 0) {
      candidates = activeRoster.filter((c) => !placementState.value.history.has(c.originalName))
    }
    if (candidates.length === 0) {
      placementState.value.history.clear()
      candidates = activeRoster
    }

    candidates.sort((a, b) => Math.abs(a.mu - target.mu) - Math.abs(b.mu - target.mu))

    const poolSize = Math.min(3, candidates.length)
    const opponent = candidates[Math.floor(Math.random() * poolSize)]
    if (!opponent) return false

    currentMatch.value = [target, opponent]
    return true
  }

  // --- Actions: Swiss Engine ---
  function startRankMode(intensity: 'quick' | 'balanced' | 'thorough' = 'balanced') {
    const validChars = characterStore.unskippedCharacters
    if (validChars.length < 2) return false

    mode.value = AppMode.RankFinite
    lastRankMode.value = null

    validChars.forEach((c) => (c.swissMatches = 0))

    const baseRounds = Math.ceil(Math.log2(validChars.length))
    const intensityMap = {
      quick: Math.max(2, baseRounds),
      balanced: Math.max(3, baseRounds + 1),
      thorough: Math.max(4, baseRounds + 3),
    }

    maxSwissRounds.value = intensityMap[intensity]
    swissHistory.value.clear()

    return nextRankMatch()
  }

  function nextRankMatch(): boolean {
    const validChars = characterStore.unskippedCharacters
    const activePool = validChars.filter((c) => (c.swissMatches || 0) < maxSwissRounds.value)

    if (activePool.length < 2) {
      pauseRankMode()
      return false
    }

    activePool.sort((a, b) => b.score - a.score)
    let charA: Character | null = null
    let charB: Character | null = null

    // Search for the highest-ranked pair that has NOT fought yet
    for (let i = 0; i < activePool.length - 1; i++) {
      const candidateA = activePool[i]
      for (let j = i + 1; j < activePool.length; j++) {
        const candidateB = activePool[j]
        if (candidateA && candidateB) {
          const sig = getMatchupSignature(candidateA, candidateB)
          if (!swissHistory.value.has(sig)) {
            charA = candidateA
            charB = candidateB
            break
          }
        }
      }
      if (charA && charB) break
    }

    // Fallback: If literally every possible combination in the active pool has
    // already been fought, pair the top two so they can burn their matches and exit.
    if (!charA || !charB) {
      charA = activePool[0]!
      charB = activePool[1]!
    }

    currentMatch.value = [charA, charB]
    return true
  }

  // --- Actions: Endless Engine ---
  function startEndlessRank() {
    const validChars = characterStore.unskippedCharacters
    if (validChars.length < 2) return false

    mode.value = AppMode.Endless
    return nextEndlessMatch()
  }

  function nextEndlessMatch(): boolean {
    const validChars = characterStore.unskippedCharacters
    if (validChars.length < 2) {
      pauseRankMode()
      return false
    }

    validChars.forEach((c) => {
      if (typeof c.endlessMatches === 'undefined') c.endlessMatches = 0
    })
    validChars.sort((a, b) => (a.endlessMatches || 0) - (b.endlessMatches || 0))

    const poolSizeLeft = Math.max(2, Math.min(15, Math.floor(validChars.length * 0.15)))
    const charA = validChars[Math.floor(Math.random() * poolSizeLeft)]
    if (!charA) return false

    const allCandidates = validChars.filter((c) => c.id !== charA.id)
    let candidates = allCandidates.filter(
      (c) => !recentMatchups.value.includes(getMatchupSignature(charA, c)),
    )

    if (candidates.length === 0) candidates = allCandidates

    const ratingA = [rating({ mu: charA.mu, sigma: charA.sigma })]

    candidates.sort((a, b) => {
      const ratingCanA = [rating({ mu: a.mu, sigma: a.sigma })]
      const ratingCanB = [rating({ mu: b.mu, sigma: b.sigma })]

      const qualityA = predictDraw([ratingA, ratingCanA])
      const qualityB = predictDraw([ratingA, ratingCanB])

      const weightA = 1.0 - qualityA + (a.endlessMatches || 0) * 2.0
      const weightB = 1.0 - qualityB + (b.endlessMatches || 0) * 2.0

      return weightA - weightB
    })

    const rightPoolSize = Math.min(30, candidates.length)
    const charB = candidates[Math.floor(Math.random() * rightPoolSize)]
    if (!charB) return false

    currentMatch.value = [charA, charB]
    return true
  }

  // --- Actions: Unified Resolution ---
  function resolveMatch(winnerIndex: 0 | 1 | -1) {
    if (!hasActiveMatch.value) return

    const char1 = currentMatch.value[0]!
    const char2 = currentMatch.value[1]!

    // Save Undo State
    undoStack.value.push({
      char1Id: char1.id,
      char2Id: char2.id,
      char1OldStats: { mu: char1.mu, sigma: char1.sigma, score: char1.score },
      char2OldStats: { mu: char2.mu, sigma: char2.sigma, score: char2.score },
    })

    if (undoStack.value.length > 100) undoStack.value.shift()

    // Mode specific histories
    if (mode.value === AppMode.Placement) {
      placementState.value.history.add(char2.originalName)
    } else if (mode.value === AppMode.RankFinite) {
      swissHistory.value.add(getMatchupSignature(char1, char2))
    }

    recordMatchup(char1, char2)

    // OpenSkill Math
    const team1 = [rating({ mu: char1.mu, sigma: char1.sigma })]
    const team2 = [rating({ mu: char2.mu, sigma: char2.sigma })]

    let newTeam1, newTeam2

    if (winnerIndex === 0) {
      ;[newTeam1, newTeam2] = rate([team1, team2], {
        model: bradleyTerryFull,
      })
    } else if (winnerIndex === 1) {
      ;[newTeam2, newTeam1] = rate([team2, team1], {
        model: bradleyTerryFull,
      })
    } else {
      ;[newTeam1, newTeam2] = rate([team1, team2], {
        rank: [1, 1],
        model: bradleyTerryFull,
      })
    }

    const rating1 = newTeam1[0]
    const rating2 = newTeam2[0]

    // Guard: ensure both ratings exist before applying updates
    if (rating1 && rating2) {
      char1.mu = rating1.mu
      char1.sigma = rating1.sigma
      char1.osRating = rating1
      char1.score = ordinal(rating1)

      char2.mu = rating2.mu
      char2.sigma = rating2.sigma
      char2.osRating = rating2
      char2.score = ordinal(rating2)
    }

    // Stat Tick
    char1.totalMatches = (char1.totalMatches || 0) + 1
    char2.totalMatches = (char2.totalMatches || 0) + 1

    if (mode.value === AppMode.Placement) {
      if (placementState.value.target) placementState.value.target.placementMatchesLeft--
    } else if (mode.value === AppMode.RankFinite) {
      char1.swissMatches = (char1.swissMatches || 0) + 1
      char2.swissMatches = (char2.swissMatches || 0) + 1
    } else if (mode.value === AppMode.Endless) {
      char1.endlessMatches = (char1.endlessMatches || 0) + 1
      char2.endlessMatches = (char2.endlessMatches || 0) + 1
    }

    characterStore.sortArrayByScore()

    // Route to next match
    if (mode.value === AppMode.Placement) nextPlacementMatch()
    else if (mode.value === AppMode.RankFinite) nextRankMatch()
    else if (mode.value === AppMode.Endless) nextEndlessMatch()
  }

  function skipParticipant(targetIndex: 0 | 1) {
    if (!hasActiveMatch.value) return
    const skippedChar = currentMatch.value[targetIndex]

    if (skippedChar) {
      skippedChar.skip = true

      if (mode.value === AppMode.Placement && placementState.value.target?.id === skippedChar.id) {
        placementState.value.target.placementMatchesLeft = 0
      }
    }

    // Since the roster changed, ensure it's sorted
    characterStore.sortArrayByScore()

    // Route to the next match based on the current mode
    if (mode.value === AppMode.Placement) {
      nextPlacementMatch()
    } else if (mode.value === AppMode.RankFinite) {
      nextRankMatch()
    } else if (mode.value === AppMode.Endless) {
      nextEndlessMatch()
    }
  }

  function pauseRankMode() {
    if (mode.value === AppMode.Placement) {
      characterStore.characters.forEach((c) => (c.flag = false))
    }
    if (mode.value !== AppMode.Edit) {
      lastRankMode.value = mode.value
    }
    mode.value = AppMode.Edit
    characterStore.reapplyLinks()
    characterStore.sortArrayByScore()
  }

  function resumeRankMode() {
    if (mode.value === AppMode.Edit) {
      mode.value = lastRankMode.value || AppMode.RankFinite
    }
    lastRankMode.value = null

    if (mode.value === AppMode.RankFinite) return nextRankMatch()
    if (mode.value === AppMode.Placement) return nextPlacementMatch()
    if (mode.value === AppMode.Endless) return nextEndlessMatch()
  }

  return {
    mode,
    currentMatch,
    hasActiveMatch,
    canUndo,
    isRankingInProgress,
    maxSwissRounds,
    undoStack,
    undoRank,
    startPlacementMatches,
    startRankMode,
    startEndlessRank,
    resolveMatch,
    pauseRankMode,
    resumeRankMode,
    skipParticipant,
    massInsert,
  }
})
