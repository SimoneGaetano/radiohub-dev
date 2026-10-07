import { prisma } from '../db/prisma';

/** Minimal post shape an AI provider needs to produce a summary. */
export interface SummarizablePost {
  id: string;
  title: string;
  content: string;
}

/**
 * Abstract contract for any AI summarisation backend. Swap the implementation
 * (real LLM, external API, ...) without touching the callers.
 */
export interface AiSummaryProvider {
  readonly name: string;
  generateSummary(post: SummarizablePost): Promise<string>;
}

/**
 * Deterministic, offline implementation used until a real AI provider is wired
 * in. It simply builds a short preview of the post content.
 */
export class MockAiSummaryProvider implements AiSummaryProvider {
  readonly name = 'mock';

  async generateSummary(post: SummarizablePost): Promise<string> {
    const words = post.content.split(/\s+/).filter((word) => word.length > 0);
    const preview = words.slice(0, 30).join(' ');
    const ellipsis = words.length > 30 ? '…' : '';
    return `[MOCK SUMMARY] ${post.title} — ${preview}${ellipsis}`;
  }
}

export interface SummaryResult {
  id: string;
  title: string;
  summary: string;
  generated: boolean;
  provider: string;
}

/**
 * Orchestrates summary generation and persistence on the `Post` model.
 */
export class SummaryService {
  constructor(private readonly provider: AiSummaryProvider) {}

  /**
   * Returns the persisted summary when present, otherwise generates one with
   * the configured provider and stores it in `Post.summary`.
   * Returns `null` when the post does not exist.
   */
  async summarize(postId: string): Promise<SummaryResult | null> {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      return null;
    }

    if (post.summary) {
      return {
        id: post.id,
        title: post.title,
        summary: post.summary,
        generated: false,
        provider: this.provider.name,
      };
    }

    const summary = await this.provider.generateSummary({
      id: post.id,
      title: post.title,
      content: post.content,
    });

    const updated = await prisma.post.update({
      where: { id: post.id },
      data: { summary },
    });

    return {
      id: updated.id,
      title: updated.title,
      summary: updated.summary ?? summary,
      generated: true,
      provider: this.provider.name,
    };
  }
}

export const summaryService = new SummaryService(new MockAiSummaryProvider());
