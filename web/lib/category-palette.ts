export const CATEGORY_PALETTE = [
  { id: "pink", label: "草莓粉", value: "#ff4d9e" },
  { id: "cyan", label: "汽水蓝", value: "#85f2ff" },
  { id: "yellow", label: "柠檬黄", value: "#ffe05b" },
  { id: "violet", label: "葡萄紫", value: "#7457ff" },
  { id: "mint", label: "薄荷绿", value: "#79f2b5" },
  { id: "coral", label: "珊瑚红", value: "#ff6b6b" },
  { id: "orange", label: "橘子橙", value: "#ffad5c" },
  { id: "blue", label: "天空蓝", value: "#65b8ff" },
  { id: "lime", label: "青柠绿", value: "#b9ed63" },
  { id: "lavender", label: "棉花紫", value: "#b99cff" },
] as const;

export type CategoryColorId = (typeof CATEGORY_PALETTE)[number]["id"];

const PREFERRED_CATEGORY_COLORS: Readonly<Record<string, CategoryColorId>> = {
  学习: "lavender",
  课程学习: "blue",
  研究: "cyan",
  身体: "mint",
  表达: "pink",
  生活: "yellow",
  工作: "orange",
  未分类: "lavender",
};

export function colorIdForCategory(category: string): CategoryColorId {
  const normalized = category.trim() || "未分类";
  const preferred = PREFERRED_CATEGORY_COLORS[normalized];
  if (preferred) return preferred;
  let hash = 0;
  for (const character of normalized) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  const categoryColors = CATEGORY_PALETTE.filter((item) => item.id !== "violet");
  return categoryColors[hash % categoryColors.length]!.id;
}

export function paletteColorValue(color: string | undefined): string {
  return CATEGORY_PALETTE.find((item) => item.id === color)?.value ?? CATEGORY_PALETTE[0].value;
}

export function isCategoryColorId(color: string): color is CategoryColorId {
  return CATEGORY_PALETTE.some((item) => item.id === color);
}

export function colorForCategory(category: string, configuredColor?: string): string {
  return paletteColorValue(configuredColor ?? colorIdForCategory(category));
}

function channelToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function readableTextColor(background: string): "#302447" | "#ffffff" {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(background);
  if (!match) return "#302447";
  const luminance = 0.2126 * channelToLinear(Number.parseInt(match[1]!, 16))
    + 0.7152 * channelToLinear(Number.parseInt(match[2]!, 16))
    + 0.0722 * channelToLinear(Number.parseInt(match[3]!, 16));
  const inkLuminance = 0.2126 * channelToLinear(0x30) + 0.7152 * channelToLinear(0x24) + 0.0722 * channelToLinear(0x47);
  const inkContrast = (luminance + 0.05) / (inkLuminance + 0.05);
  const whiteContrast = 1.05 / (luminance + 0.05);
  return whiteContrast > inkContrast ? "#ffffff" : "#302447";
}
