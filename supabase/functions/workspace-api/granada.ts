export const granadaInputs = ["D3", "H3", "D4", "H4", "D5", "H5", "D6", "H6", "D7", "H7", "D8", "H8", "B9", "H9", "B10", "H10", "B11", "H11", "N15", "N16", "N17", "N18", "N19", "N20", "N21", "N22", "N23", "N24", "N25", "N26", "N27", "N28", "N29", "N30", "N31", "Q35", "R35", "Q36", "R36", "T40", "T41", "T42", "W46", "W47", "W48", "Z51", "AA54", "AB57", "AC60", "AD63", "AL67", "AL68", "AL69", "AL70", "AL71", "AL72", "AL73", "AL74", "AL75"];
export function validGranada(values: unknown): boolean {
  if (!values || typeof values !== "object" || Array.isArray(values)) return false;
  return Object.entries(values).every(([k,v]) => {
    if (!granadaInputs.includes(k) || typeof v !== "number" || !Number.isFinite(v)) return false;
    if (["Z51","AA54"].includes(k)) return v >= 0 && v < 1;
    if (["AB57","AC60","AD63"].includes(k)) return v >= -1 && v <= 1;
    return v >= 0 && (!/^(H\d|AL\d|N\d)/.test(k) || (Number.isSafeInteger(v) && v >= 1));
  });
}
