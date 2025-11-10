import { Injectable, signal, WritableSignal, computed } from '@angular/core';
import { GameState, PlayerStats, Npc, GameTurn, StatChanges, SaveSlot, CharacterEvent, Location, NpcInteraction } from '../models';
import { GeminiService } from './gemini.service';
import { GAME_LORE } from './game-lore';
import { CHARACTER_EVENTS } from './game-events';

const INITIAL_STATE: GameState = {
  player: { hunger: 0, fatigue: 0, lust: 1 },
  npcs: {
    '타치바나 센조': { name: '타치바나 센조', description: '', affection: 40, desire: 0, currentLocation: null },
    '시오에 몬지로': { name: '시오에 몬지로', description: '', affection: 40, desire: 0, currentLocation: null },
    '젠포우지 이사쿠': { name: '젠포우지 이사쿠', description: '', affection: 40, desire: 0, currentLocation: null },
    '케마 토메사부로': { name: '케마 토메사부로', description: '', affection: 40, desire: 0, currentLocation: null },
    '나나마츠 코헤이타': { name: '나나마츠 코헤이타', description: '', affection: 40, desire: 0, currentLocation: null },
    '나카자이케 쵸지': { name: '나카자이케 쵸지', description: '', affection: 40, desire: 0, currentLocation: null },
    '쿠쿠치 헤이스케': { name: '쿠쿠치 헤이스케', description: '', affection: 40, desire: 0, currentLocation: null },
    '오하마 칸에몽': { name: '오하마 칸에몽', description: '', affection: 40, desire: 0, currentLocation: null },
    '하치야 사부로': { name: '하치야 사부로', description: '', affection: 40, desire: 0, currentLocation: null },
    '후와 라이조': { name: '후와 라이조', description: '', affection: 40, desire: 0, currentLocation: null },
    '타케야 하치자에몽': { name: '타케야 하치자에몽', description: '', affection: 40, desire: 0, currentLocation: null },
  },
  currentTurn: null,
  history: [],
  eventLog: {},
  gameStarted: false,
  loading: false,
  error: null,
  currentView: 'start_menu',
  currentLocation: null,
  turnNumber: 0,
  day: 1,
  time: 360, // 6:00 AM
};


@Injectable({
  providedIn: 'root'
})
export class GameService {
  private state: WritableSignal<GameState> = signal(INITIAL_STATE);

  player = computed(() => this.state().player);
  npcs = computed(() => this.state().npcs);
  currentTurn = computed(() => this.state().currentTurn);
  gameStarted = computed(() => this.state().gameStarted);
  loading = computed(() => this.state().loading);
  error = computed(() => this.state().error);
  currentView = computed(() => this.state().currentView);
  currentLocation = computed(() => this.state().currentLocation);
  day = computed(() => this.state().day);
  time = computed(() => this.state().time);

  completedEvents = computed(() => {
    const log = this.state().eventLog;
    return CHARACTER_EVENTS.filter(event => log[event.id] === 'completed');
  });

  activeEvents = computed(() => {
    const state = this.state();
    const log = state.eventLog;
    // An event is active if its trigger conditions are met and it hasn't been completed.
    return CHARACTER_EVENTS.filter(event => !log[event.id] && event.trigger(state));
  });

  private readonly saveKeyPrefix = 'nintama_rpg_save_';
  private readonly saveSlotsCount = 4;

  constructor(private geminiService: GeminiService) {}

  async startGame() {
    this.state.set({
        ...INITIAL_STATE,
        gameStarted: true,
        loading: true,
        error: null,
        currentView: 'interaction',
        currentLocation: '내 방',
    });

    const startPrompt = `플레이어가 닌자 학원에서의 첫날을 자신의 방에서 시작합니다. 창밖으로 아침 햇살이 비치고, 새로운 하루의 시작을 알립니다. 방의 고요하고 개인적인 분위기를 묘사해주세요. 다른 인물은 절대로 등장해서는 안 됩니다. 플레이어에게는 [자리에서 일어난다] 와 [조금 더 누워 있는다] 선택지를 주세요.`;
    const prompt = this.buildPrompt(startPrompt);

    try {
        const response = await this.geminiService.generateGameTurn(prompt);
        this.state.update(s => ({
            ...s,
            loading: false,
            currentTurn: {
                sceneDescription: response.sceneDescription,
                npcsInScene: [], // Ensure no NPCs on first turn
                playerChoices: response.playerChoices.length > 0 ? response.playerChoices : ['자리에서 일어난다.'],
            },
            turnNumber: s.turnNumber + 1,
        }));
    } catch (e) {
        const error = e as Error;
        this.state.update(s => ({ ...s, loading: false, error: error.message, currentView: 'start_menu', gameStarted: false }));
    }
  }

  private addCurrentTurnToHistory(state: GameState): GameTurn[] {
    const MAX_HISTORY = 10;
    if (!state.currentTurn) {
        return state.history;
    }
    const newHistory = [...state.history, state.currentTurn];
    if (newHistory.length > MAX_HISTORY) {
        newHistory.shift(); // Keep history size manageable
    }
    return newHistory;
  }
  
  private checkForTriggeredEvent(currentState: GameState): CharacterEvent | null {
    for (const event of CHARACTER_EVENTS) {
        if (event.trigger(currentState)) {
            return event;
        }
    }
    return null;
  }

  private getCollapseState(currentState: GameState, reason: string): GameState {
      let collapsedNpcs = { ...currentState.npcs };
      for (const npcKey in collapsedNpcs) {
          collapsedNpcs[npcKey].currentLocation = null;
      }
      return {
          ...currentState,
          loading: false,
          gameStarted: true,
          currentView: 'interaction',
          currentLocation: '의무실',
          day: currentState.day + 1,
          time: 480, // Wake up at 8 AM
          player: { ...currentState.player, hunger: 0, fatigue: 0 },
          npcs: collapsedNpcs,
          history: this.addCurrentTurnToHistory(currentState),
          turnNumber: currentState.turnNumber + 1,
          currentTurn: {
              sceneDescription: `${reason} 정신을 차려보니 의무실 천장이 보였다. 새로운 날이 시작되었다.`,
              npcsInScene: [],
              playerChoices: ['몸을 일으킨다.']
          },
      };
  }

  async moveToLocation(location: string) {
    this.state.update(s => ({ ...s, loading: true, error: null, currentLocation: location, currentView: 'interaction' }));
    
    let preGenState = this.state();

    // Advance time and basic stats
    preGenState.time += 30;
    preGenState.player.hunger = Math.min(100, preGenState.player.hunger + 5);
    preGenState.player.fatigue = Math.min(100, preGenState.player.fatigue + 5);

    // Check for collapse
    const collapseReason = this.getCollapseReason(preGenState.player, preGenState.time);
    if (collapseReason) {
      this.state.set(this.getCollapseState(preGenState, collapseReason));
      return;
    }

    const currentState = preGenState;
    const triggeredEvent = this.checkForTriggeredEvent(currentState);

    let prompt: string;
    let nextEventLog = currentState.eventLog;
    let locationSpecificPrompt = '';

    // Location-specific stat changes and prompt additions
    let updatedPlayerStats = { ...currentState.player };
    let sceneDescriptionPrefix = '';

    if (location === '정원') {
      const newLust = Math.max(1, updatedPlayerStats.lust - 10);
      const newFatigue = Math.max(0, updatedPlayerStats.fatigue - 10);
      if (updatedPlayerStats.lust > newLust) {
          sceneDescriptionPrefix += '정원의 차분한 공기를 들이마시자 들떴던 마음이 조금 가라앉는다.\n';
      }
      if (updatedPlayerStats.fatigue > newFatigue) {
          sceneDescriptionPrefix += '아름다운 풍경에 쌓였던 피로가 조금 가시는 기분이다.\n';
      }
      updatedPlayerStats.lust = newLust;
      updatedPlayerStats.fatigue = newFatigue;
    }

    if (location === '식당') {
      if (updatedPlayerStats.hunger > 0) {
        sceneDescriptionPrefix += '식당에 들러 간단히 식사를 했다. 뱃속이 든든해진다.\n';
        locationSpecificPrompt = '플레이어가 식당에서 식사를 마친 상황입니다.';
      }
      updatedPlayerStats.hunger = 0;
    }
    
    if(sceneDescriptionPrefix) sceneDescriptionPrefix += '\n';

    this.state.update(s => ({...s, player: updatedPlayerStats}));


    if (triggeredEvent) {
        prompt = this.buildPrompt(triggeredEvent.prompt);
        nextEventLog = { ...currentState.eventLog, [triggeredEvent.id]: 'completed' };
    } else {
        let locationPrompt: string;
        if (location === '내 방') {
            locationPrompt = `플레이어가 자신의 방으로 돌아왔습니다. 이곳은 온전히 혼자만의 공간입니다. 방의 아늑하고 평온한 분위기를 묘사해주세요. 다른 인물은 절대로 등장해서는 안 됩니다.`;
        } else {
            locationPrompt = `플레이어가 ${location}(으)로 이동했습니다. ${locationSpecificPrompt} 그곳의 풍경을 묘사해주세요. 때로는 아무도 없을 수 있고, 때로는 예상치 못한 인물이 등장할 수도 있습니다. 이 장소에 있을 법한 인물을 0명 혹은 1명 등장시켜주세요. 두 명의 인물이 동시에 나타나는 것은 매우 드문 경우(15% 미만 확률)에만 허용됩니다.`;
        }
        prompt = this.buildPrompt(locationPrompt);
    }

    try {
      const response = await this.geminiService.generateGameTurn(prompt);
      
      this.state.update(s => {
          const newTurnData = {
              sceneDescription: response.sceneDescription,
              npcsInScene: response.npcsInScene,
              playerChoices: response.playerChoices,
          };
          let updatedNpcs = this.updateNpcLocationsFromTurn(s.npcs, newTurnData, s.currentLocation);
          updatedNpcs = this.applyLustReaction(updatedNpcs, s.player.lust, newTurnData.npcsInScene);

          // Apply cooldown to NPCs in the scene
          for (const interaction of newTurnData.npcsInScene) {
            if (updatedNpcs[interaction.npcName]) {
                updatedNpcs[interaction.npcName] = {
                    ...updatedNpcs[interaction.npcName],
                    unavailableUntilTurn: s.turnNumber + 4 // current turn + 3 turns of cooldown
                };
            }
          }

          const finalTurn = {
            ...newTurnData,
            sceneDescription: sceneDescriptionPrefix + newTurnData.sceneDescription,
          };

          return {
            ...s,
            loading: false,
            eventLog: nextEventLog,
            history: this.addCurrentTurnToHistory(s),
            currentTurn: finalTurn,
            npcs: updatedNpcs,
            turnNumber: s.turnNumber + 1,
          };
      });

    } catch (e) {
      const error = e as Error;
      this.state.update(s => ({ ...s, loading: false, error: error.message, currentView: 'location_selection' }));
    }
  }

  returnToLocationSelection() {
      const currentState = this.state();
      const eventResult = this.triggerRandomEvent(currentState);

      // FIX: Explicitly type `newState` as `GameState`. This prevents TypeScript from inferring a too-narrow
      // type for `currentView` (i.e., just `'location_selection'`), which caused a type error when `newState`
      // was potentially reassigned by `getCollapseState`, which can return a state with a different `currentView`.
      let newState: GameState = {
          ...currentState,
          history: this.addCurrentTurnToHistory(currentState),
          player: eventResult ? eventResult.player : currentState.player,
          currentView: 'location_selection',
          currentLocation: null,
          turnNumber: currentState.turnNumber + 1,
          time: currentState.time + 10,
          currentTurn: {
            sceneDescription: eventResult ? eventResult.eventDescription : '어디로 갈까? 다른 장소를 둘러보자.',
            npcsInScene: [],
            playerChoices: []
          }
      };
      
      const collapseReason = this.getCollapseReason(newState.player, newState.time);
      if (collapseReason) {
        newState = this.getCollapseState(newState, collapseReason);
      }
      
      this.state.set(newState);
  }
  
  returnToMainMenu() {
    this.state.update(s => ({
      ...s,
      gameStarted: false,
      currentView: 'start_menu',
      currentLocation: null,
      currentTurn: null
    }));
  }

  private triggerRandomEvent(currentState: GameState): { player: PlayerStats, eventDescription: string } | null {
    const EVENT_CHANCE = 0.25; // 25% chance
    if (Math.random() > EVENT_CHANCE) {
        return null;
    }

    const newPlayerStats = { ...currentState.player };
    let eventDescription = '';

    const events = [
        () => { // Sudden Fatigue
            newPlayerStats.fatigue = Math.min(100, newPlayerStats.fatigue + 20);
            eventDescription = '갑자기 온몸의 힘이 빠져나가며 피로가 몰려온다. 어젯밤의 고된 훈련 탓일까, 잠시 쉬고 싶다는 생각이 간절하다.';
        },
        () => { // Second Wind
            newPlayerStats.fatigue = Math.max(0, newPlayerStats.fatigue - 15);
            eventDescription = '시원한 바람이 뺨을 스치자 정신이 번쩍 든다. 찌뿌둥했던 몸에 다시 활력이 넘치는 기분이다.';
        },
        () => { // Hunger Pangs
            newPlayerStats.hunger = Math.min(100, newPlayerStats.hunger + 20);
            eventDescription = '갑자기 배가 고파온다. 뱃속에서 천둥이 치는 것 같아 자신도 모르게 배를 움켜쥐었다.';
        },
        () => { // Found Snack
            newPlayerStats.hunger = Math.max(0, newPlayerStats.hunger - 15);
            eventDescription = '복도 구석에서 누군가 떨어뜨린 듯한 깨끗한 경단을 발견했다. 주위를 둘러보았지만 아무도 없어, 감사히 먹었다.';
        },
        () => { // Fleeting Memory
            newPlayerStats.lust = Math.min(100, newPlayerStats.lust + 15);
            eventDescription = '문득 스쳐 지나간 누군가의 모습에 심장이 거세게 두근거렸다. 이유 없이 얼굴이 살짝 달아오르는 것을 느낀다.';
        },
        () => { // Calming Down
            newPlayerStats.lust = Math.max(1, newPlayerStats.lust - 10);
            eventDescription = '차가운 물에 손을 씻으니 들떴던 마음이 차분히 가라앉는다. 닌자에게 평정심은 필수다.';
        }
    ];

    const randomEvent = events[Math.floor(Math.random() * events.length)];
    randomEvent();

    return { player: newPlayerStats, eventDescription };
  }

  async nextTurn(playerInput: string) {
    this.state.update(s => ({ ...s, loading: true, error: null }));
    try {
        const prompt = this.buildPrompt(playerInput);
        const response = await this.geminiService.generateGameTurn(prompt);

        this.state.update(s => {
            let { player, npcs } = this.applyStatChanges(s, response.statChanges);
            
            const timePassed = 10;
            let newTime = s.time + timePassed;
            player.hunger = Math.min(100, player.hunger + 2);
            player.fatigue = Math.min(100, player.fatigue + 2);
            
            const collapseReason = this.getCollapseReason(player, newTime);
            if(collapseReason) {
                return this.getCollapseState({...s, player, time: newTime}, collapseReason);
            }

            const newTurn = {
                sceneDescription: response.sceneDescription,
                npcsInScene: response.npcsInScene,
                playerChoices: response.playerChoices,
            };

            const previousNpcNames = s.currentTurn?.npcsInScene.map(n => n.npcName) ?? [];
            const currentNpcNames = new Set(newTurn.npcsInScene.map(n => n.npcName));
            let updatedNpcs = this.updateNpcLocationsFromTurn(npcs, newTurn, s.currentLocation);
            
            for (const npcName of previousNpcNames) {
                if (!currentNpcNames.has(npcName) && updatedNpcs[npcName]) {
                    updatedNpcs[npcName] = { ...updatedNpcs[npcName], currentLocation: null };
                }
            }
            updatedNpcs = this.applyLustReaction(updatedNpcs, player.lust, newTurn.npcsInScene);
            
            // Apply cooldown to NPCs in the scene
            for (const interaction of newTurn.npcsInScene) {
                if (updatedNpcs[interaction.npcName]) {
                    updatedNpcs[interaction.npcName] = {
                        ...updatedNpcs[interaction.npcName],
                        unavailableUntilTurn: s.turnNumber + 4 // current turn + 3 turns of cooldown
                    };
                }
            }

            return {
                ...s,
                player,
                time: newTime,
                npcs: updatedNpcs,
                history: this.addCurrentTurnToHistory(s),
                currentTurn: newTurn,
                loading: false,
                turnNumber: s.turnNumber + 1,
            };
        });
    } catch (e) {
        const error = e as Error;
        this.state.update(s => ({ ...s, loading: false, error: error.message }));
    }
  }

  async fleeFromDanger() {
    this.state.update(s => ({ ...s, loading: true, error: null }));
    
    const currentState = this.state();
    const trappingNpcs = currentState.currentTurn?.npcsInScene
      .filter(npcInteraction => {
        const npcData = currentState.npcs[npcInteraction.npcName];
        return npcData && npcData.desire >= 100;
      })
      .map(interaction => interaction.npcName);

    if (!trappingNpcs || trappingNpcs.length === 0) {
      this.state.update(s => ({ ...s, loading: false, error: "도망칠 위험한 인물이 없습니다." }));
      this.returnToLocationSelection();
      return;
    }

    const AVOID_DURATION = 20; // NPCs will avoid player for 20 turns
    const updatedNpcs = { ...currentState.npcs };
    const fleeDescription = `당신은 ${trappingNpcs.join(', ')}의 집요한 시선을 피해 필사적으로 도망쳤습니다. 심장이 미친듯이 뛰지만, 일단은 벗어나는 데 성공했습니다.`;

    for (const npcName of trappingNpcs) {
      const npc = updatedNpcs[npcName];
      if (npc) {
        updatedNpcs[npcName] = {
          ...npc,
          affection: Math.max(0, npc.affection - 5),
          desire: Math.max(0, npc.desire - 15),
          currentLocation: null,
          avoidingPlayerUntilTurn: currentState.turnNumber + AVOID_DURATION,
        };
      }
    }
    
    this.state.update(s => ({
      ...s,
      loading: false,
      npcs: updatedNpcs,
      history: this.addCurrentTurnToHistory(s),
      currentView: 'location_selection',
      currentLocation: null,
      turnNumber: s.turnNumber + 1,
      time: s.time + 10,
      currentTurn: {
        sceneDescription: fleeDescription,
        npcsInScene: [],
        playerChoices: []
      }
    }));
  }

  async restInPlace() {
    this.state.update(s => ({ ...s, loading: true, error: null }));
    
    const preGenState = this.state();

    const newTime = preGenState.time + 30;
    const newPlayerStats = {
      ...preGenState.player,
      fatigue: Math.max(0, preGenState.player.fatigue - 15),
      hunger: Math.min(100, preGenState.player.hunger + 3)
    };

    const collapseReason = this.getCollapseReason(newPlayerStats, newTime);
    if (collapseReason) {
      const collapseState = this.getCollapseState({ ...preGenState, player: newPlayerStats, time: newTime }, collapseReason);
      this.state.set(collapseState);
      return;
    }

    const ENCOUNTER_CHANCE = 0.6;
    if (Math.random() < ENCOUNTER_CHANCE) {
        try {
            const prompt = this.buildPrompt("플레이어가 복도 같은 공용 공간에 잠시 앉아 쉬고 있습니다. 그 때, 다른 인물이 플레이어에게 다가와 말을 겁니다. 이 상황을 묘사해주세요.");
            const response = await this.geminiService.generateGameTurn(prompt);
            
            this.state.update(s => {
                const newTurnData = {
                    sceneDescription: response.sceneDescription,
                    npcsInScene: response.npcsInScene,
                    playerChoices: response.playerChoices,
                };

                let updatedNpcs = this.applyLustReaction(s.npcs, newPlayerStats.lust, newTurnData.npcsInScene);

                // Apply cooldown to NPCs in the scene
                for (const interaction of newTurnData.npcsInScene) {
                    if (updatedNpcs[interaction.npcName]) {
                        updatedNpcs[interaction.npcName] = {
                            ...updatedNpcs[interaction.npcName],
                            unavailableUntilTurn: s.turnNumber + 4 // current turn + 3 turns of cooldown
                        };
                    }
                }

                return {
                    ...s,
                    loading: false,
                    player: newPlayerStats,
                    time: newTime,
                    currentView: 'interaction',
                    currentLocation: null,
                    history: this.addCurrentTurnToHistory(s),
                    currentTurn: newTurnData,
                    npcs: updatedNpcs,
                    turnNumber: s.turnNumber + 1,
                };
            });

        } catch (e) {
            const error = e as Error;
            this.state.update(s => ({ ...s, loading: false, error: error.message, currentView: 'location_selection' }));
        }
    } else {
        this.state.update(s => {
            const sceneDescription = '잠시 앉아 숨을 고르니 뻐근했던 몸이 조금 풀리는 기분이다. 아무도 지나가지 않아 조용했다.';
            return {
                ...s,
                loading: false,
                player: newPlayerStats,
                time: newTime,
                history: this.addCurrentTurnToHistory(s),
                currentView: 'location_selection',
                currentLocation: null,
                turnNumber: s.turnNumber + 1,
                currentTurn: {
                    sceneDescription: sceneDescription,
                    npcsInScene: [],
                    playerChoices: []
                }
            };
        });
    }
  }

  private updateNpcLocationsFromTurn(currentNpcs: { [key: string]: Npc }, turn: GameTurn, location: string | null): { [key: string]: Npc } {
    if (!location || !turn.npcsInScene) {
        return currentNpcs;
    }
    const newNpcs = { ...currentNpcs };
    for (const npcInteraction of turn.npcsInScene) {
        const npcName = npcInteraction.npcName;
        if (newNpcs[npcName]) {
            newNpcs[npcName] = { ...newNpcs[npcName], currentLocation: location as Location };
        }
    }
    return newNpcs;
  }
  
  private applyLustReaction(currentNpcs: { [key: string]: Npc; }, playerLust: number, npcsInScene: NpcInteraction[]): { [key: string]: Npc; } {
      if (playerLust < 30 || !npcsInScene || npcsInScene.length === 0) {
          return currentNpcs;
      }
      
      const newNpcs = { ...currentNpcs };
      const npcsToUpdate = npcsInScene.map(interaction => interaction.npcName);
      const desireIncrease = 20;
      const affectionIncrease = Math.floor(desireIncrease / 2); // Proportional increase

      for (const npcName of npcsToUpdate) {
          if (newNpcs[npcName]) {
              const npc = newNpcs[npcName];
              newNpcs[npcName] = {
                  ...npc,
                  desire: Math.min(100, npc.desire + desireIncrease),
                  affection: Math.min(100, npc.affection + affectionIncrease)
              };
          }
      }
      return newNpcs;
  }

  private applyStatChanges(state: GameState, changes: StatChanges[]): { player: PlayerStats, npcs: { [key: string]: Npc } } {
    const newPlayerStats = { ...state.player };
    const newNpcs = { ...state.npcs };

    for (const change of changes) {
        newPlayerStats.hunger = Math.max(0, Math.min(100, newPlayerStats.hunger + (change.playerHungerChange || 0)));
        newPlayerStats.fatigue = Math.max(0, Math.min(100, newPlayerStats.fatigue + (change.playerFatigueChange || 0)));
        newPlayerStats.lust = Math.max(1, Math.min(100, newPlayerStats.lust + (change.playerLustChange || 0)));

        if (change.npcName && newNpcs[change.npcName]) {
            const npcToUpdate = newNpcs[change.npcName];
            const rawDesireChange = change.desireChange || 0;
            let rawAffectionChange = change.affectionChange || 0;

            if (rawDesireChange > 0) {
              rawAffectionChange += Math.floor(rawDesireChange / 2);
            }

            const desireChange = Math.max(-30, Math.min(20, rawDesireChange));
            const affectionChange = Math.max(-30, Math.min(20, rawAffectionChange));

            newNpcs[change.npcName] = {
                ...npcToUpdate,
                affection: Math.max(0, Math.min(100, npcToUpdate.affection + affectionChange)),
                desire: Math.max(0, Math.min(100, npcToUpdate.desire + desireChange))
            };
        }
    }
    
    return { player: newPlayerStats, npcs: newNpcs };
  }
  
  async takePersonalTime() {
    this.state.update(s => ({ ...s, loading: true, error: null }));
    
    let preGenState = this.state();
    preGenState.time += 20;
    
    const collapseReason = this.getCollapseReason(preGenState.player, preGenState.time);
    if(collapseReason) {
      this.state.set(this.getCollapseState(preGenState, collapseReason));
      return;
    }
      
    try {
      const currentState = preGenState;
      const currentLust = currentState.player.lust;
      const newLust = Math.min(100, currentLust + 20);
      const isClimax = newLust === 100;

      const actionDescription = isClimax 
        ? "플레이어 토마가 방에서 혼자만의 시간을 보내며 마침내 욕망이 절정에 달했습니다. 그 순간의 폭발적인 감각과 뒤따르는 평온한 해방감을 아름답고 시적으로 묘사해주세요. 묘사는 토마의 내면 독백과 신체 감각에 깊이 초점을 맞추어야 합니다. 이 이벤트 이후 플레이어의 성욕 수치는 1로 초기화됩니다."
        : "플레이어 토마가 방에서 혼자만의 시간을 보내며 은밀하게 성욕을 해소하고 있습니다. 임무와 훈련의 긴장감 속에서 찾아낸 짧은 위안의 순간입니다. 그녀의 생각, 감각, 그리고 미묘한 감정 변화를 내적으로 섬세하게 묘사해주세요.";

      const prompt = this.buildSoloScenePrompt(actionDescription);
      const response = await this.geminiService.generateGameTurn(prompt);

      this.state.update(s => {
          const newPlayerStats = { ...s.player };
          newPlayerStats.lust = isClimax ? 1 : newLust;
          newPlayerStats.fatigue = Math.max(0, s.player.fatigue - 5);

          return {
              ...s,
              loading: false,
              player: newPlayerStats,
              time: currentState.time,
              history: this.addCurrentTurnToHistory(s),
              turnNumber: s.turnNumber + 1,
              currentTurn: {
                  sceneDescription: response.sceneDescription,
                  npcsInScene: [],
                  playerChoices: response.playerChoices.length > 0 ? response.playerChoices : ['정신을 차린다.'],
              }
          };
      });

    } catch (e) {
      const error = e as Error;
      this.state.update(s => ({ ...s, loading: false, error: error.message }));
    }
  }

  async rest() {
    this.state.update(s => ({ ...s, loading: true, error: null }));
    
    let newState = this.state();
    newState.time += 40;
    newState.player.fatigue = Math.max(0, newState.player.fatigue - 20);

    const collapseReason = this.getCollapseReason(newState.player, newState.time);
    if (collapseReason) {
      this.state.set(this.getCollapseState(newState, collapseReason));
      return;
    }

    const scene = {
      sceneDescription: "잠시 눈을 붙이며 휴식을 취했다. 뻐근했던 몸이 한결 가벼워진 기분이다.",
      npcsInScene: [],
      playerChoices: ['자리에서 일어난다.']
    };
    
    this.state.update(s => ({
      ...s,
      loading: false,
      player: newState.player,
      time: newState.time,
      history: this.addCurrentTurnToHistory(s),
      turnNumber: s.turnNumber + 1,
      currentTurn: scene,
    }));
  }

  sleep() {
    if (!confirm('잠자리에 들어 다음 날로 이동하시겠습니까?')) {
      return;
    }
    
    const currentState = this.state();
    
    let refreshedNpcs = { ...currentState.npcs };
    for (const npcKey in refreshedNpcs) {
        refreshedNpcs[npcKey].currentLocation = null;
    }
    
    this.state.update(s => ({
      ...s,
      day: s.day + 1,
      time: 360, // 6:00 AM
      player: {
        ...s.player,
        hunger: 0,
        fatigue: 0,
        lust: 1,
      },
      npcs: refreshedNpcs,
      currentView: 'location_selection',
      currentLocation: null,
      turnNumber: s.turnNumber + 1,
      currentTurn: {
        sceneDescription: '밤새 깊은 잠을 자고 일어나니 새로운 날이 밝았다. 몸이 가뿐하다.',
        npcsInScene: [],
        playerChoices: []
      }
    }));
  }

  private getCollapseReason(player: PlayerStats, time: number): string | null {
    if (player.hunger >= 100) return '허기';
    if (player.fatigue >= 100) return '피로';
    if (time >= 1440) return '수면 부족'; // 24:00
    return null;
  }

  updateNpcDialogue(npcName: string, newDialogue: string): void {
    this.state.update(s => {
      if (!s.currentTurn) {
        return s;
      }

      const newNpcsInScene = s.currentTurn.npcsInScene.map(npcInteraction => {
        if (npcInteraction.npcName === npcName) {
          return { ...npcInteraction, npcDialogue: newDialogue };
        }
        return npcInteraction;
      });

      return {
        ...s,
        currentTurn: {
          ...s.currentTurn,
          npcsInScene: newNpcsInScene,
        }
      };
    });
  }

  private getHistorySummaryForPrompt(history: GameTurn[]): string {
    if (history.length === 0) {
        return "No history yet.";
    }
    // Take the last 5 turns for prompt brevity
    return history.slice(-5).map(turn => {
        const participants = turn.npcsInScene.map(i => i.npcName).join(', ') || 'no one';
        const dialogues = turn.npcsInScene
            .map(i => `${i.npcName}: "${i.npcDialogue}"`)
            .join(' ');
        const sceneSummary = turn.sceneDescription.replace(/\n/g, ' ').substring(0, 150);
        return `Previously: ${sceneSummary}... (With: ${participants}). ${dialogues}`;
    }).join('\n');
  }

  private getDangerStateNpcs(npcs: { [key: string]: Npc }): Npc[] {
    return Object.values(npcs).filter(npc => npc.affection === 100 && npc.desire === 100);
  }

  private buildSoloScenePrompt(playerAction: string): string {
    const currentState = this.state();
    const historySummary = this.getHistorySummaryForPrompt(currentState.history);
    const dangerNpcs = this.getDangerStateNpcs(currentState.npcs);
    let dangerNpcPrompt = '';
    const timeFormatted = `${Math.floor(currentState.time / 60).toString().padStart(2, '0')}:${(currentState.time % 60).toString().padStart(2, '0')}`;

    if (dangerNpcs.length > 0) {
        dangerNpcPrompt = `
---
[CRITICAL INTERVENTION RULE]
The following character(s) are in a [위험] (Danger) state of obsession: ${dangerNpcs.map(n => n.name).join(', ')}.
There is a VERY HIGH PROBABILITY (e.g., 75%) that one of them will interrupt the player's private time.
If you trigger this interruption:
1. Describe them bursting into the room or otherwise forcefully interrupting.
2. Their dialogue MUST be possessive and questioning ("What were you doing alone?", "You should have been with me.").
3. Add them to the 'npcsInScene' array. The scene is no longer a solo scene.
---
`;
    }

    return `${GAME_LORE}
      ${dangerNpcPrompt}

      Recent Events History (most recent is last):
      ${historySummary}
      
      Current Game State:
      Day: ${currentState.day}, Time: ${timeFormatted}
      Turn Number: ${currentState.turnNumber}
      Player Location: ${currentState.currentLocation}
      Player Stats:
      - Hunger: ${currentState.player.hunger} (0=full, 100=starving)
      - Fatigue: ${currentState.player.fatigue} (0=rested, 100=exhausted)
      - Lust: ${currentState.player.lust}

      This is a special solo scene for the player character, 토마.
      
      Player's Action: "${playerAction}"

      Your task is to generate the next game turn.
      - Unless a Danger State NPC interrupts, this is a solo scene.
      - If no interruption: Describe the scene vividly based on the player's action. Set npcsInScene to an empty array. Provide one or two logical choices. For statChanges, return an empty array or suggest only player stat changes.
      - Your response must be a single, valid JSON object matching the provided schema.
      `;
  }


  private buildPrompt(playerAction: string): string {
    const currentState = this.state();
    const currentTurnNumber = currentState.turnNumber;

    const availableNpcs = Object.values(currentState.npcs)
      .filter((npc: Npc) => // FIX: Explicitly type 'npc' as Npc to correct type inference from 'unknown' and resolve property access errors.
        (!npc.avoidingPlayerUntilTurn || npc.avoidingPlayerUntilTurn <= currentTurnNumber) &&
        (!npc.unavailableUntilTurn || npc.unavailableUntilTurn <= currentTurnNumber)
      );
      
    const npcStates = availableNpcs
      .map((npc: Npc) => `- ${npc.name}: { Affection: ${npc.affection}, Desire: ${npc.desire} }`)
      .join('\n');

    const historySummary = this.getHistorySummaryForPrompt(currentState.history);
    const dangerNpcs = this.getDangerStateNpcs(currentState.npcs);
    let dangerNpcPrompt = '';
    const timeFormatted = `${Math.floor(currentState.time / 60).toString().padStart(2, '0')}:${(currentState.time % 60).toString().padStart(2, '0')}`;

    if (dangerNpcs.length > 0) {
        dangerNpcPrompt = `
---
[CRITICAL INTERVENTION RULE]
The following character(s) are in a [위험] (Danger) state of obsession: ${dangerNpcs.map(n => n.name).join(', ')}.
There is a high probability (e.g., 50%) that one of these characters will suddenly appear and interrupt the current action, regardless of location.
If you choose to trigger an interruption, you must:
1. Add the interrupting NPC to the 'npcsInScene' array.
2. Describe their unexpected arrival vividly.
3. Their dialogue and inner thoughts MUST reflect extreme possessiveness and a desire to get the player's sole attention. They might act jealous of other NPCs or be angry the player is alone.
---
`;
    }
      
    return `${GAME_LORE}
      ${dangerNpcPrompt}

      Recent Events History (most recent is last):
      ${historySummary}

      Current Game State:
      Day: ${currentState.day}, Time: ${timeFormatted}
      Turn Number: ${currentTurnNumber}
      Player Location: ${currentState.currentLocation || 'Not specified'}
      Player Stats:
      - Hunger: ${currentState.player.hunger} (0=full, 100=starving)
      - Fatigue: ${currentState.player.fatigue} (0=rested, 100=exhausted)
      - Lust: ${currentState.player.lust}

      NPC States (Only these NPCs are available for this scene):
      ${npcStates}

      Previous Scene:
      ${currentState.currentTurn?.sceneDescription || "This is the first turn."}
      
      Player's last action/choice: "${playerAction}"

      Your task is to generate the next game turn based on the rules and current state. Your response must be a single, valid JSON object matching the provided schema. Do not add any text before or after the JSON. Be creative and adhere to the character personalities.
      `;
  }

  // Save/Load System
  loadSaveSlots(): SaveSlot[] {
    const slots: SaveSlot[] = [];
    for (let i = 0; i < this.saveSlotsCount; i++) {
        const key = this.saveKeyPrefix + i;
        const savedData = localStorage.getItem(key);
        if (savedData) {
            try {
                const gameState: GameState & { timestamp?: number } = JSON.parse(savedData);
                slots.push({
                    id: i,
                    timestamp: gameState.timestamp || null,
                    location: gameState.currentLocation,
                    isEmpty: false,
                });
            } catch (e) {
                console.error(`Error parsing save slot ${i}:`, e);
                slots.push({ id: i, timestamp: null, location: null, isEmpty: true });
            }
        } else {
            slots.push({ id: i, timestamp: null, location: null, isEmpty: true });
        }
    }
    return slots;
  }

  saveGame(slotId: number): void {
      const currentState = this.state();
      const stateToSave = {
          ...currentState,
          timestamp: Date.now()
      };
      localStorage.setItem(this.saveKeyPrefix + slotId, JSON.stringify(stateToSave));
  }

  loadGame(slotId: number): boolean {
      const savedData = localStorage.getItem(this.saveKeyPrefix + slotId);
      if (savedData) {
          try {
              const loadedState: GameState = JSON.parse(savedData);
              // Gracefully handle saves from older versions
              if (!loadedState.history) loadedState.history = [];
              if (!loadedState.eventLog) loadedState.eventLog = {};
              if (loadedState.turnNumber === undefined) loadedState.turnNumber = 0;
              if (loadedState.day === undefined) loadedState.day = 1;
              if (loadedState.time === undefined) loadedState.time = 360;
              if (loadedState.player.hunger === undefined || loadedState.player.hunger > 100) {
                // This condition handles old saves where hunger was 100=good
                loadedState.player.hunger = 0;
              }
               if (loadedState.player.fatigue === undefined || loadedState.player.fatigue > 100) {
                loadedState.player.fatigue = 0;
              }
              for (const npcKey in loadedState.npcs) {
                if (loadedState.npcs[npcKey].currentLocation === undefined) {
                    loadedState.npcs[npcKey].currentLocation = null;
                }
              }
              this.state.set(loadedState);
              return true;
          } catch (e) {
              console.error(`Error loading game from slot ${slotId}:`, e);
              this.state.update(s => ({ ...s, error: `세이브 파일이 손상되었습니다 (슬롯 ${slotId + 1}).` }));
              return false;
          }
      }
      return false;
  }

  deleteSave(slotId: number): void {
      localStorage.removeItem(this.saveKeyPrefix + slotId);
  }

  exportSave(slotId: number): { filename: string; data: string } | null {
      const savedData = localStorage.getItem(this.saveKeyPrefix + slotId);
      if (savedData) {
          return {
              filename: `nintama_save_slot_${slotId + 1}.json`,
              data: savedData
          };
      }
      return null;
  }

  importSave(slotId: number, jsonString: string): boolean {
      try {
          const loadedState: GameState = JSON.parse(jsonString);
          if (loadedState.player && loadedState.npcs && loadedState.gameStarted !== undefined) {
               // Gracefully handle saves from older versions
               if (!loadedState.history) loadedState.history = [];
               if (!loadedState.eventLog) loadedState.eventLog = {};
               if (loadedState.turnNumber === undefined) loadedState.turnNumber = 0;
               if (loadedState.day === undefined) loadedState.day = 1;
               if (loadedState.time === undefined) loadedState.time = 360;
               if (loadedState.player.hunger === undefined || loadedState.player.hunger > 100) {
                 loadedState.player.hunger = 0;
               }
                if (loadedState.player.fatigue === undefined || loadedState.player.fatigue > 100) {
                 loadedState.player.fatigue = 0;
               }
               for (const npcKey in loadedState.npcs) {
                if (loadedState.npcs[npcKey].currentLocation === undefined) {
                    loadedState.npcs[npcKey].currentLocation = null;
                }
              }
               localStorage.setItem(this.saveKeyPrefix + slotId, JSON.stringify(loadedState));
               return true;
          }
          throw new Error("Invalid save file structure.");
      } catch (e) {
          console.error(`Error importing save for slot ${slotId}:`, e);
          this.state.update(s => ({ ...s, error: `세이브 파일을 가져오는 데 실패했습니다 (슬롯 ${slotId + 1}). 파일이 손상되었거나 형식이 올바르지 않습니다.` }));
          return false;
      }
  }
}