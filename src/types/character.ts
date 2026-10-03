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
  osRating?: OpenSkillRating
}

export const CHARACTER_KEYS: (keyof Character)[] = [
  'id', 'name', 'originalName', 'minimizedName', 'series', 'imageUrl', 'note',
  'skip', 'flag', 'linkedTo', 'totalMatches', 'endlessMatches', 'swissMatches',
  'placementMatchesLeft', 'mu', 'sigma'
]
