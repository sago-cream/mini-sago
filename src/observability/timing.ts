/** Metadata-only timing: never record prompts, tool arguments, or credentials. */
export type TimingEvent = {
  name: string;
  phase: "start" | "end" | "mark";
  at: number;
  failed?: boolean;
};
export type TimingSink = (event: TimingEvent) => void;
export function timing(sink?: TimingSink) {
  const emit = (
    name: string,
    phase: TimingEvent["phase"],
    failed?: boolean,
  ) => {
    sink?.({
      name,
      phase,
      at: performance.timeOrigin + performance.now(),
      ...(failed ? { failed } : {}),
    });
  };
  return {
    mark: (name: string) => emit(name, "mark"),
    start(name: string) {
      emit(name, "start");
      return (failed = false) => emit(name, "end", failed);
    },
    async span<T>(name: string, work: () => Promise<T>): Promise<T> {
      emit(name, "start");
      try {
        const result = await work();
        emit(name, "end");
        return result;
      } catch (error) {
        emit(name, "end", true);
        throw error;
      }
    },
  };
}
