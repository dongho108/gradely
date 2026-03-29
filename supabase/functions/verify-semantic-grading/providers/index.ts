/// <reference lib="deno.ns" />
import { GeminiSemanticProvider } from './gemini.ts';

export function createProvider(type?: string) {
  const providerType = type || 'gemini';
  switch (providerType) {
    case 'gemini':
      return new GeminiSemanticProvider();
    default:
      throw new Error(`Unknown provider type: ${providerType}`);
  }
}
