export interface Generation {
  text: string;
  /** The model stopped at its output limit, so the reply ends mid-file. */
  truncated: boolean;
}

export interface LLMProvider {
  /** The model requests go to, shown to the user alongside the result. */
  readonly model: string;
  generate(prompt: string): Promise<Generation>;
}
