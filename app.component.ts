import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from './services/game.service';
import { GeminiService } from './services/gemini.service';
import { Location, PlayerStats, SaveSlot, Npc } from './models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .dialogue-box {
      background-color: rgba(17, 24, 39, 0.8);
      backdrop-filter: blur(5px);
    }
    .choice-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 10px rgba(147, 197, 253, 0.2);
    }
    ::-webkit-scrollbar {
      width: 4px;
    }
    ::-webkit-scrollbar-track {
      background: #2d3748;
    }
    ::-webkit-scrollbar-thumb {
      background: #718096;
      border-radius: 2px;
    }
    @keyframes stat-flash {
      50% {
        filter: brightness(1.75);
      }
    }
    .stat-bar-flash {
      animation: stat-flash 0.7s ease-out;
    }
  `]
})
export class AppComponent implements OnInit {
  gameService = inject(GameService);
  geminiService = inject(GeminiService);

  // Game State
  player = this.gameService.player;
  npcs = this.gameService.npcs;
  currentTurn = this.gameService.currentTurn;
  gameStarted = this.gameService.gameStarted;
  loading = this.gameService.loading;
  error = this.gameService.error;
  currentView = this.gameService.currentView;
  day = this.gameService.day;
  time = this.gameService.time;
  
  locations: Location[] = ['훈련장', '식당', '의무실', '도서실', '정원', '내 방'];
  customInput = signal('');
  
  // UI State
  saveSlots = signal<SaveSlot[]>([]);
  showSaveMenu = signal(false);
  showCharacterList = signal(false);
  characterModalTab = signal<'info' | 'quests'>('info');
  
  // Quest Log State
  activeEvents = this.gameService.activeEvents;
  completedEvents = this.gameService.completedEvents;

  // Dialogue Editing State
  editingNpc = signal<(Npc & { npcDialogue: string; npcInnerThought: string; npcBehavior: string; }) | null>(null);
  editedDialogueText = signal<string>('');
  suggestionLoading = signal(false);

  // For stat change animation
  private previousPlayerStats: PlayerStats = this.player();
  hungerChanged = signal(false);
  fatigueChanged = signal(false);
  lustChanged = signal(false);

  constructor() {
    effect(() => {
      const currentStats = this.player();
      
      if (this.previousPlayerStats) {
           if (currentStats.hunger !== this.previousPlayerStats.hunger) this.triggerAnimation('hunger');
           if (currentStats.fatigue !== this.previousPlayerStats.fatigue) this.triggerAnimation('fatigue');
           if (currentStats.lust !== this.previousPlayerStats.lust) this.triggerAnimation('lust');
      }

      this.previousPlayerStats = currentStats;
    });
  }

  formattedTime = computed(() => {
    const minutes = this.time();
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  });


  // Computed value for current NPCs
  currentNpcs = computed(() => {
    const turn = this.currentTurn();
    if (!turn || !turn.npcsInScene) {
      return [];
    }
    const npcs = this.npcs();
    return turn.npcsInScene
      .map(interaction => {
        const npcData = npcs[interaction.npcName];
        if (!npcData) return null;
        return {
          ...npcData,
          npcDialogue: interaction.npcDialogue,
          npcInnerThought: interaction.npcInnerThought,
          npcBehavior: interaction.npcBehavior,
        };
      })
      .filter(npc => npc !== null) as (Npc & { npcDialogue: string; npcInnerThought: string; npcBehavior: string; })[];
  });

  isTrapped = computed(() => {
    return this.currentNpcs().some(npc => npc.desire >= 100);
  });

  allNpcsList = computed(() => {
    // FIX: Explicitly type `a` and `b` as `Npc` to help TypeScript's type inference within the sort callback.
    return Object.values(this.npcs()).sort((a: Npc, b: Npc) => a.name.localeCompare(b.name));
  });

  ngOnInit(): void {
    this.loadSaveSlots();
  }
  
  getNpcMood(affection: number, desire: number): string {
    if (desire >= 100) return '압도';
    if (affection >= 91) return '집착';
    if (desire >= 70) return '격정';
    if (affection >= 81) return '사랑';
    if (desire >= 50) return '열망';
    if (affection >= 61) return '호감';
    if (affection > 40) return '우호적';
    if (affection <= 20) return '경계';
    return '중립';
  }

  getNpcMoodColor(mood: string): string {
    switch (mood) {
      case '압도': return 'bg-red-600 text-white';
      case '집착': return 'bg-purple-800 text-purple-200';
      case '격정': return 'bg-pink-600 text-white';
      case '사랑': return 'bg-rose-500 text-white';
      case '열망': return 'bg-yellow-500 text-gray-900';
      case '호감': return 'bg-green-500 text-white';
      case '우호적': return 'bg-blue-500 text-white';
      case '경계': return 'bg-gray-500 text-gray-100';
      case '중립': return 'bg-gray-700 text-gray-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  }

  getAffectionTier(affection: number): string {
    if (affection <= 0) return '혐오';
    if (affection <= 10) return '껄끄러움';
    if (affection <= 20) return '무관심';
    if (affection <= 30) return '안면인식';
    if (affection <= 40) return '아는 사이';
    if (affection <= 50) return '친구';
    if (affection <= 60) return '친한 친구';
    if (affection <= 70) return '호감';
    if (affection <= 80) return '좋아함';
    if (affection <= 90) return '사랑';
    return '집착';
  }
  
  getAffectionBarColor(affection: number): string {
    if (affection <= 20) return 'bg-red-500';
    if (affection <= 40) return 'bg-gray-400';
    if (affection <= 60) return 'bg-blue-500';
    if (affection <= 80) return 'bg-green-500';
    return 'bg-emerald-400';
  }

  getDesireTier(desire: number): string {
    if (desire < 30) return '평온';
    if (desire < 50) return '관심';
    if (desire < 70) return '열망';
    if (desire < 100) return '격정';
    return '압도';
  }
  
  getDesireBarColor(desire: number): string {
    if (desire < 30) return 'bg-gray-400';
    if (desire < 50) return 'bg-yellow-500';
    if (desire < 70) return 'bg-pink-500';
    if (desire < 100) return 'bg-purple-600';
    return 'bg-red-600';
  }

  getNegativeStatBarColor(value: number): string {
    if (value > 70) return 'bg-red-600';
    if (value > 30) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  startGame(): void {
    this.gameService.startGame();
  }

  moveToLocation(location: Location): void {
      if (this.loading()) return;
      this.gameService.moveToLocation(location);
  }

  returnToLocationSelection(): void {
      if (this.loading() || this.isTrapped()) return;
      this.gameService.returnToLocationSelection();
  }

  returnToMainMenu(): void {
    if (this.loading()) return;
    this.gameService.returnToMainMenu();
  }

  selectChoice(choice: string): void {
    if (this.loading()) return;
    this.gameService.nextTurn(choice);
  }

  submitCustomInput(): void {
    if (this.loading() || !this.customInput().trim()) return;
    this.gameService.nextTurn(this.customInput().trim());
    this.customInput.set('');
  }
  
  fleeFromDanger(): void {
    if (this.loading()) return;
    this.gameService.fleeFromDanger();
  }

  takePersonalTime(): void {
    if (this.loading()) return;
    this.gameService.takePersonalTime();
  }
  
  restInPlace(): void {
    if (this.loading()) return;
    this.gameService.restInPlace();
  }
  
  rest(): void {
    if (this.loading()) return;
    this.gameService.rest();
  }

  sleep(): void {
    if (this.loading()) return;
    this.gameService.sleep();
  }

  private triggerAnimation(stat: 'hunger' | 'fatigue' | 'lust'): void {
    switch (stat) {
      case 'hunger':
        this.hungerChanged.set(true);
        setTimeout(() => this.hungerChanged.set(false), 700);
        break;
      case 'fatigue':
        this.fatigueChanged.set(true);
        setTimeout(() => this.fatigueChanged.set(false), 700);
        break;
      case 'lust':
        this.lustChanged.set(true);
        setTimeout(() => this.lustChanged.set(false), 700);
        break;
    }
  }

  async getSuggestion(): Promise<void> {
    const npc = this.editingNpc();
    const sceneDescription = this.currentTurn()?.sceneDescription;

    if (!npc || !sceneDescription) {
      console.error("Cannot get suggestion: missing NPC or scene description.");
      return;
    }

    this.suggestionLoading.set(true);
    try {
        const suggestion = await this.geminiService.suggestDialogue(npc.name, this.editedDialogueText(), sceneDescription);
        this.editedDialogueText.set(suggestion);
    } catch (e) {
        const error = e as Error;
        console.error("Failed to get dialogue suggestion:", error.message);
        this.error.set(error.message);
        setTimeout(() => this.error.set(null), 3000);
    } finally {
        this.suggestionLoading.set(false);
    }
  }

  // Dialogue Editing Methods
  startEditing(npc: (Npc & { npcDialogue: string; npcInnerThought: string; npcBehavior: string; })): void {
    this.editingNpc.set(npc);
    this.editedDialogueText.set(npc.npcDialogue);
  }

  confirmEdit(): void {
    const npc = this.editingNpc();
    if (npc) {
      this.gameService.updateNpcDialogue(npc.name, this.editedDialogueText());
    }
    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingNpc.set(null);
    this.editedDialogueText.set('');
  }

  // Save/Load Methods
  loadSaveSlots(): void {
    this.saveSlots.set(this.gameService.loadSaveSlots());
  }

  loadGame(slotId: number): void {
    this.gameService.loadGame(slotId);
  }

  deleteSave(slotId: number): void {
    if (confirm(`슬롯 ${slotId + 1}의 데이터를 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
      this.gameService.deleteSave(slotId);
      this.loadSaveSlots();
    }
  }

  saveGame(slotId: number): void {
    const slot = this.saveSlots().find(s => s.id === slotId);
    // If slot exists and is not empty, ask for confirmation to overwrite.
    if (slot && !slot.isEmpty) {
      if (confirm(`슬롯 ${slotId + 1}에 덮어쓰시겠습니까? 기존 저장 데이터는 사라집니다.`)) {
        this.gameService.saveGame(slotId);
        this.showSaveMenu.set(false);
        this.loadSaveSlots();
      }
    } else {
      // If slot is empty or doesn't exist, save without confirmation.
      this.gameService.saveGame(slotId);
      this.showSaveMenu.set(false);
      this.loadSaveSlots();
    }
  }

  exportSave(slotId: number): void {
    const saveData = this.gameService.exportSave(slotId);
    if (saveData) {
      const blob = new Blob([saveData.data], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = saveData.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  }

  async importSave(event: Event, slotId: number): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      try {
        const jsonString = await file.text();
        if (this.gameService.importSave(slotId, jsonString)) {
          this.loadSaveSlots();
          alert(`슬롯 ${slotId + 1}에 성공적으로 데이터를 가져왔습니다.`);
        } else {
          alert(`슬롯 ${slotId + 1}에 데이터를 가져오는 데 실패했습니다. 파일 형식을 확인해주세요.`);
        }
      } catch (e) {
        console.error(e);
        alert('파일을 읽는 중 오류가 발생했습니다.');
      } finally {
        input.value = ''; // Reset input so the same file can be loaded again
      }
    }
  }
}