import { Injectable, signal } from '@angular/core';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GeminiGameResponse } from '../models';
import { GAME_LORE } from './game-lore';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  private async withRetry<T extends GenerateContentResponse>(apiCall: () => Promise<T>): Promise<T> {
    const maxRetries = 6;
    let delay = 3000; // Start with 3 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        const errorMessage = (error instanceof Error ? error.message : String(error)).toLowerCase();
        
        // Check for rate limit error signatures from the API
        if (errorMessage.includes('429') || errorMessage.includes('resource_exhausted')) {
          if (attempt === maxRetries) {
            console.error(`Max retries (${maxRetries}) reached. Failing with final error:`, error);
            throw new Error('API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
          }
          
          const jitter = Math.random() * 1000; // Increased jitter up to 1s
          const waitTime = delay + jitter;

          console.warn(`Rate limit hit. Retrying in ~${Math.round(waitTime / 1000)}s... (Attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          delay *= 2; // Exponential backoff
        } else {
          // It's a different kind of error, fail immediately.
          console.error('Unhandled API error:', error);
          throw error;
        }
      }
    }
    // This line should be unreachable due to the loop structure, but it satisfies TypeScript's control flow analysis.
    throw new Error('An unexpected error occurred in the retry logic.');
  }

  async generateGameTurn(prompt: string): Promise<GeminiGameResponse> {
    try {
      const response = await this.withRetry(() => this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: this.getGameResponseSchema(),
        },
      }));

      const jsonString = response.text.trim();
      return JSON.parse(jsonString) as GeminiGameResponse;

    } catch (error) {
      if (error instanceof Error && error.message.startsWith('API 요청 한도')) {
        throw error;
      }
      console.error('Unhandled error generating game turn:', error);
      throw new Error('AI로부터 응답을 받지 못했습니다. 콘솔을 확인해주세요.');
    }
  }

  async suggestDialogue(npcName: string, currentDialogue: string, sceneDescription: string): Promise<string> {
    const prompt = this.buildDialoguePrompt(npcName, currentDialogue, sceneDescription);
    
    try {
      const response = await this.withRetry(() => this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedDialogue: {
                type: Type.STRING,
                description: "The rewritten, in-character dialogue for the NPC."
              }
            },
            required: ["suggestedDialogue"]
          },
        },
      }));

      const jsonString = response.text.trim();
      const result = JSON.parse(jsonString);
      return result.suggestedDialogue;

    } catch (error) {
      if (error instanceof Error && error.message.startsWith('API 요청 한도')) {
        throw error;
      }
      console.error('Error suggesting dialogue:', error);
      throw new Error('AI로부터 대사 제안을 받지 못했습니다.');
    }
  }

  private buildDialoguePrompt(npcName: string, currentDialogue: string, sceneDescription: string): string {
    const shortSceneDescription = sceneDescription.substring(0, 500);

    return `You are a creative writer for a text-based RPG. Your task is to rewrite a line of dialogue for a character to make it more fitting to their established personality.

${GAME_LORE}

[SCENE CONTEXT]
Scene Description: "${shortSceneDescription}..."
Character to rewrite for: "${npcName}"
Original Dialogue: "${currentDialogue}"

[INSTRUCTIONS]
Rewrite the "Original Dialogue" to better match the personality of "${npcName}" as described in the character lore. The new dialogue should be more immersive and in-character. Do not explain your reasoning. Return only the dialogue.

Your response MUST be a single, valid JSON object with one key: "suggestedDialogue".
Example response: { "suggestedDialogue": "This is the new, improved dialogue." }
`;
  }

  private getGameResponseSchema() {
    return {
      type: Type.OBJECT,
      properties: {
        sceneDescription: { type: Type.STRING, description: "A vivid description of the current scene and what is happening." },
        npcsInScene: {
          type: Type.ARRAY,
          description: "An array of NPCs currently in the scene (0-2).",
          items: {
            type: Type.OBJECT,
            properties: {
              npcName: { type: Type.STRING, description: "The full name of the NPC." },
              npcDialogue: { type: Type.STRING, description: "The exact words the NPC speaks to the player." },
              npcInnerThought: { type: Type.STRING, description: "The hidden, inner thoughts of the NPC." },
              npcBehavior: { type: Type.STRING, description: "A brief description of the NPC's current action or idle behavior in the scene (e.g., 'sharpening a kunai', 'reading a scroll')." }
            },
            required: ["npcName", "npcDialogue", "npcInnerThought", "npcBehavior"]
          }
        },
        playerChoices: {
          type: Type.ARRAY,
          description: "An array of 3 distinct, compelling choices for the player to make.",
          items: { type: Type.STRING }
        },
        statChanges: {
          type: Type.ARRAY,
          description: "An array of objects detailing the changes to NPC and player stats based on the last action.",
          items: {
            type: Type.OBJECT,
            properties: {
              npcName: { type: Type.STRING, description: "The name of the NPC whose stats are changing. Can be empty string if no NPC stat change." },
              affectionChange: { type: Type.INTEGER, description: "Integer change in affection (-30 to 20)." },
              desireChange: { type: Type.INTEGER, description: "Integer change in desire (-30 to 20)." },
              playerHungerChange: { type: Type.INTEGER, description: "Integer change in player's hunger." },
              playerFatigueChange: { type: Type.INTEGER, description: "Integer change in player's fatigue." },
              playerLustChange: { type: Type.INTEGER, description: "Integer change in player's lust." }
            }
          }
        }
      },
      required: ["sceneDescription", "npcsInScene", "playerChoices", "statChanges"]
    };
  }
}