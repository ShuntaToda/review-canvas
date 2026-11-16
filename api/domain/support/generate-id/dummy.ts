import type { GenerateId } from ".";

export const buildGenerateIdDummy =
  (id: string = "00000000000000000000000000"): GenerateId =>
  () =>
    id;
