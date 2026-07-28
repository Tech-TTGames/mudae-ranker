import type { Character } from 'character'

export enum AppMode {
  Edit = 0,
  RankFinite = 1,
  Placement = 2,
  Endless = 3,
}

export interface TierConfig {
  label: string
  size: number
}

export interface AppSavePayload {
  appState: {
    rankingInProgress: boolean
    activeMode: AppMode
  }
  characters: Character[]
  tierConfig: TierConfig[]
  metadata: {
    timestamp: number
    deviceId: string
  }
}
