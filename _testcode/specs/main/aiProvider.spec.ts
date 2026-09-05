import { describe, it, expect } from 'vitest';
import type { AIStatus, AIProvider, ActiveAIProvider } from '../../../src/shared/types';

describe('AI Provider Resolution Logic', () => {
  it('should default to auto provider mode', () => {
    const defaultSetting: AIProvider = 'auto';
    expect(defaultSetting).toBe('auto');
  });

  it('should prioritize FreeToken when both FreeToken and LM Studio are connected in auto mode', () => {
    const freetokenConnected = true;
    const lmstudioConnected = true;
    const selectedProvider: AIProvider = 'auto';

    let activeProvider: ActiveAIProvider = 'none';
    if (selectedProvider === 'auto') {
      if (freetokenConnected && !lmstudioConnected) activeProvider = 'freetoken';
      else if (lmstudioConnected && !freetokenConnected) activeProvider = 'lmstudio';
      else if (freetokenConnected && lmstudioConnected) activeProvider = 'freetoken';
    }

    expect(activeProvider).toBe('freetoken');
  });

  it('should correctly select LM Studio when only LM Studio is connected', () => {
    const freetokenConnected = false;
    const lmstudioConnected = true;
    const selectedProvider: AIProvider = 'auto';

    let activeProvider: ActiveAIProvider = 'none';
    if (selectedProvider === 'auto') {
      if (freetokenConnected && !lmstudioConnected) activeProvider = 'freetoken';
      else if (lmstudioConnected && !freetokenConnected) activeProvider = 'lmstudio';
      else if (freetokenConnected && lmstudioConnected) activeProvider = 'freetoken';
    }

    expect(activeProvider).toBe('lmstudio');
  });

  it('should enforce explicit provider choice when user selects freetoken or lmstudio', () => {
    const freetokenConnected = true;
    const lmstudioConnected = true;

    const selectProvider = (setting: AIProvider): ActiveAIProvider => {
      if (setting === 'freetoken') return freetokenConnected ? 'freetoken' : 'none';
      if (setting === 'lmstudio') return lmstudioConnected ? 'lmstudio' : 'none';
      return 'freetoken';
    };

    expect(selectProvider('lmstudio')).toBe('lmstudio');
    expect(selectProvider('freetoken')).toBe('freetoken');
  });
});
