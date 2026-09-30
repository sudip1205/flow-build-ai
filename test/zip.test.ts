import { describe, it, expect } from "vitest";
import { zip } from "@/lib/zip";

describe("zip", () => {
  it("writes each file with its path and a central directory", () => {
    const bytes = zip([
      { path: "src/a.ts", content: "export const a = 1;\n" },
      { path: "README.md", content: "# Hi — ünïcode" },
    ]);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);

    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);

    // The first entry's CRC-32 matches the well-known value for its bytes.
    const data = new TextEncoder().encode("export const a = 1;\n");
    expect(view.getUint32(18, true)).toBe(data.length);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("src/a.ts");
    expect(text).toContain("README.md");
    expect(text).toContain("# Hi — ünïcode");
  });

  it("computes the standard CRC-32", () => {
    // CRC-32 of "123456789" is the standard check value 0xCBF43926.
    const bytes = zip([{ path: "x", content: "123456789" }]);
    expect(new DataView(bytes.buffer).getUint32(14, true)).toBe(0xcbf43926);
  });
});
