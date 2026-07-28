export interface OpenSkillRating {
  mu: number
  sigma: number
}

export interface Character {
  id: string
  name: string
  originalName: string
  minimizedName: string
  series: string
  imageUrl: string
  note: string

  // Status Flags
  skip: boolean
  flag: boolean
  linkedTo: string

  // Match Data
  totalMatches: number
  endlessMatches: number
  swissMatches?: number
  placementMatchesLeft: number

  // OpenSkill Core
  mu: number
  sigma: number

  // UI/Sorting Metadata
  score: number // The conservative score (mu - 3*sigma)
  osRating?: OpenSkillRating
}
