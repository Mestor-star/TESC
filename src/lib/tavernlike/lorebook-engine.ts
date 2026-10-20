/**
 * Lorebook Matching Engine
 */

import type { Lorebook, LorebookEntry, MatchedEntry } from './types';

export class LorebookEngine {
  private lorebook: Lorebook;

  constructor(lorebook: Lorebook) {
    this.lorebook = lorebook;
  }

  scan(text: string, additionalContext?: string): MatchedEntry[] {
    const normalizedText = this.lorebook.caseSensitive ? text : text.toLowerCase();
    const normalizedContext = additionalContext
      ? this.lorebook.caseSensitive ? additionalContext : additionalContext.toLowerCase()
      : normalizedText;

    const matched: MatchedEntry[] = [];

    for (const entry of this.lorebook.entries) {
      // 预设调配：被逐条关闭的词条不参与注入（常驻亦然），在唯一的取词入口拦下
      if (entry.enabled === false) continue;

      if (entry.constant) {
        matched.push({ entry, score: -9999, matchedKeywords: ['constant'] });
        continue;
      }

      if (Math.random() * 100 >= entry.probability) {
        continue;
      }

      const isMatch = this.checkEntryMatch(entry, normalizedText, normalizedContext);

      if (isMatch) {
        matched.push({
          entry,
          score: entry.order,
          matchedKeywords: entry.keys.filter(k =>
            this.containsKeyword(normalizedText, this.normalizeKeyword(k))
          ),
        });
      }
    }

    return matched.sort((a, b) => a.score - b.score);
  }

  recursiveScan(initialText: string, maxDepth: number = 3, additionalContext?: string): MatchedEntry[] {
    if (!this.lorebook.recursiveScanning || maxDepth <= 0) {
      return this.scan(initialText, additionalContext);
    }

    const allMatched = new Map<string, MatchedEntry>();
    let currentText = initialText;
    let depth = 0;

    while (depth < maxDepth) {
      const newMatches = this.scan(currentText, additionalContext);
      let hasNewMatches = false;

      for (const match of newMatches) {
        if (!allMatched.has(match.entry.id)) {
          allMatched.set(match.entry.id, match);
          currentText += ' ' + match.entry.content;
          hasNewMatches = true;
        }
      }

      if (!hasNewMatches) break;
      depth++;
    }

    return Array.from(allMatched.values()).sort((a, b) => a.score - b.score);
  }

  groupByPosition(matched: MatchedEntry[]): Record<LorebookEntry['position'], MatchedEntry[]> {
    const grouped: Record<LorebookEntry['position'], MatchedEntry[]> = {
      before_char: [], after_char: [], before_example: [], after_example: [], at_depth: [],
      example_msg_top: [], example_msg_bottom: [], outlet: [],
    };

    for (const m of matched) {
      grouped[m.entry.position].push(m);
    }

    return grouped;
  }

  formatEntriesContent(entries: MatchedEntry[]): string {
    if (entries.length === 0) return '';
    return entries.map(e => e.entry.content).join('\n\n');
  }

  private checkEntryMatch(entry: LorebookEntry, text: string, context: string): boolean {
    const { keys, secondaryKeys, selective, selectiveLogic } = entry;

    if (keys.length === 0) return false;

    const primaryMatches = keys.map(k => this.containsKeyword(text, this.normalizeKeyword(k)));
    /* 主键恒为「任一命中」。
       ST 的口径里 selectiveLogic 只决定**次键**怎么配合，主键不参与与/非；
       从前这里把 selectiveLogic 也套在主键上，而 importLorebook 对缺字段的 ST 条目
       默认落成 'not_all' —— 于是**单主键词条永不命中**（本机 fuzz：not_all / not_any
       下单主键命中数 0，同一份词条换个 logic 就是 1）。表现是「世界书导进来在册，
       正文里一个字都没进过」，一路不报错。 */
    const primaryOk = primaryMatches.some(m => m);

    if (!primaryOk) return false;

    if (!selective || secondaryKeys.length === 0) {
      return primaryOk;
    }

    const secondaryMatches = secondaryKeys.map(k =>
      this.containsKeyword(context, this.normalizeKeyword(k))
    );
    const allSecondary = secondaryMatches.every(m => m);
    const anySecondary = secondaryMatches.some(m => m);

    /* 次键：not_* 是「取反」不是「取正」—— 从前 not_all / not_any 两支原样返回
       allSecondary / anySecondary，与 ST 语义正好相反（本机 fuzz：文本有 a 无 b 时
       四种 logic 全落 0 命中，not_all / not_any 本该放行）。 */
    switch (selectiveLogic) {
      case 'and_all':
        return allSecondary;
      case 'not_all':
        return !allSecondary;
      case 'not_any':
        return !anySecondary;
      case 'and_any':
      default:
        return anySecondary;
    }
  }

  private normalizeKeyword(keyword: string): string {
    return this.lorebook.caseSensitive ? keyword : keyword.toLowerCase();
  }

  private containsKeyword(text: string, keyword: string): boolean {
    if (this.lorebook.matchWholeWords) {
      const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'i');
      return regex.test(text);
    }
    return text.includes(keyword);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export function createLorebookEngine(lorebook: Lorebook): LorebookEngine {
  return new LorebookEngine(lorebook);
}
