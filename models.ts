export interface PlayerStats {
  hunger: number; // 0 is full, 100 is starving
  fatigue: number; // 0 is rested, 100 is exhausted
  lust: number;
}

export interface Npc {
  name: string;
  description: string;
  affection: number;
  desire: number;
  currentLocation: Location | null;
  avoidingPlayerUntilTurn?: number;
  unavailableUntilTurn?: number;
}

export type CharacterEventStatus = 'completed';

export interface CharacterEvent {
  id: string;
  characterName: string;
  title: string;
  trigger: (state: GameState) => boolean;
  prompt: string;
}


export interface GameState {
  player: PlayerStats;
  npcs: { [key: string]: Npc };
  currentTurn: GameTurn | null;
  history: GameTurn[];
  gameStarted: boolean;
  loading: boolean;
  error: string | null;
  currentView: 'start_menu' | 'location_selection' | 'interaction';
  currentLocation: string | null;
  eventLog: { [eventId: string]: CharacterEventStatus };
  turnNumber: number;
  day: number;
  time: number; // in minutes from midnight, e.g., 6 AM is 360
}

export interface NpcInteraction {
  npcName: string;
  npcDialogue: string;
  npcInnerThought: string;
  npcBehavior: string;
}

export interface GameTurn {
  sceneDescription: string;
  npcsInScene: NpcInteraction[];
  playerChoices: string[];
}

export interface StatChanges {
    npcName?: string;
    affectionChange?: number;
    desireChange?: number;
    playerHungerChange?: number;
    playerFatigueChange?: number;
    playerLustChange?: number;
}

export interface GeminiGameResponse {
    sceneDescription: string;
    npcsInScene: NpcInteraction[];
    playerChoices: string[];
    statChanges: StatChanges[];
}

export type Location = '훈련장' | '식당' | '의무실' | '도서실' | '정원' | '내 방';

export interface SaveSlot {
  id: number;
  timestamp: number | null;
  location: string | null;
  isEmpty: boolean;
}