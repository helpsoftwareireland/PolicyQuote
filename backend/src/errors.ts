/** Typed domain errors. The handler maps each to an HTTP status (Architecture §8). */

export interface FieldIssue {
  readonly path: string;
  readonly message: string;
}

/** Client sent a structurally valid request whose content fails the request schema → 400. */
export class ValidationError extends Error {
  constructor(readonly issues: readonly FieldIssue[]) {
    super('Request validation failed');
    this.name = 'ValidationError';
  }
}

/** Client sent something we cannot parse at all (e.g. malformed JSON) → 400. */
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

/** The Knowledge Base is missing, unreadable or invalid → 500 (details logged, never returned). */
export class KnowledgeBaseError extends Error {
  constructor(
    message: string,
    readonly issues: readonly FieldIssue[] = [],
  ) {
    super(message);
    this.name = 'KnowledgeBaseError';
  }
}
