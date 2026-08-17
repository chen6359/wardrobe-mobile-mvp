export type Category = "top" | "bottom" | "shoes" | "socks" | "outer";
export type Scene = "work" | "meeting" | "gym" | "casual" | "friends" | "date" | "travel";
export type GarmentState = "ready" | "laundry" | "paused";
export type FeedbackAction = "adopted" | "swapped" | "skipped";
export type FeedbackReason = "color" | "formal" | "casual" | "hot" | "comfort" | "other";

export type Garment = {
  id: string;
  category: Category;
  subtype: string;
  color: string;
  state: GarmentState;
  photo: string;
  material: string;
  thickness: string;
  size: string;
  careNotes: string;
  labelText: string;
  careLabelPhoto: string;
  hangtagPhoto: string;
  scenes: Scene[];
  totalCount?: number;
  cleanCount?: number;
  createdAt: string;
};

export type OutfitFeedback = {
  id: string;
  date: string;
  scene: Scene;
  garmentIds: string[];
  action: FeedbackAction;
  reason?: FeedbackReason;
};

export type OutfitWeather = {
  apparentTemperature: number;
  rainProbability: number;
};

export type Outfit = {
  items: Garment[];
  missing: string[];
  limitation: string;
  reasons: [string, string, string];
  totalScore: number;
};

type OutfitAssessment = {
  total: number;
  color: number;
  style: number;
  weather: number;
};

const categoryLabels: Record<Category, string> = {
  top: "上衣",
  bottom: "下装",
  shoes: "鞋",
  socks: "袜子组",
  outer: "外套",
};

const colorFamilies: Record<string, string> = Object.fromEntries([
  ...["黑色", "炭黑", "白色", "米白", "奶油白", "浅灰", "灰色", "深灰", "银灰", "银色"].map((color) => [color, "neutral"]),
  ...["米色", "卡其", "驼色", "棕色", "咖啡色", "巧克力色", "金色"].map((color) => [color, "earth"]),
  ...["浅蓝", "天蓝", "蓝色", "宝蓝", "牛仔蓝", "深蓝", "藏青"].map((color) => [color, "blue"]),
  ...["薄荷绿", "浅绿", "绿色", "军绿", "橄榄绿", "墨绿"].map((color) => [color, "green"]),
  ...["黄色", "芥末黄", "橙色"].map((color) => [color, "warm"]),
  ...["红色", "酒红", "粉色", "玫红"].map((color) => [color, "red"]),
  ...["紫色", "薰衣草紫"].map((color) => [color, "purple"]),
]);
const versatileColorFamilies = ["neutral", "earth"];

function colorFamily(color: string) {
  return colorFamilies[color] ?? color;
}

const formalityBySubtype: Record<string, number> = {
  T恤: 1,
  Polo: 2.5,
  短袖衬衫: 3,
  长袖衬衫: 3.5,
  无袖背心: 0.5,
  针织衫: 2.5,
  针织开衫: 2.5,
  毛衣: 2.5,
  卫衣: 1,
  连帽卫衣: 0.5,
  运动上衣: 0.5,
  保暖内衣: 0.5,
  其他上衣: 2,
  休闲裤: 2.5,
  西裤: 4,
  牛仔裤: 1.5,
  工装裤: 1,
  运动裤: 0.5,
  卫裤: 0.5,
  束脚裤: 0.5,
  短裤: 0,
  牛仔短裤: 0.5,
  运动短裤: 0,
  压缩裤: 0,
  保暖裤: 0.5,
  其他下装: 2,
  运动鞋: 1,
  跑步鞋: 0.5,
  训练鞋: 0.5,
  篮球鞋: 0.5,
  足球鞋: 0,
  徒步鞋: 1,
  板鞋: 1,
  帆布鞋: 1.5,
  休闲鞋: 2.5,
  皮鞋: 4,
  乐福鞋: 3.5,
  牛津鞋: 4,
  德比鞋: 4,
  靴子: 2.5,
  凉鞋: 0,
  拖鞋: 0,
  洞洞鞋: 0,
  其他鞋履: 2,
  夹克: 2,
  牛仔夹克: 1.5,
  飞行夹克: 1.5,
  棒球夹克: 1,
  皮衣: 2,
  风衣: 3,
  西装外套: 4,
  羽绒服: 1.5,
  大衣: 3.5,
  棉服: 1.5,
  冲锋衣: 1,
  抓绒外套: 1,
  防晒衣: 0.5,
  运动外套: 0.5,
  马甲: 2,
  其他外套: 2,
};

const formalTypes = ["短袖衬衫", "长袖衬衫", "Polo", "西裤", "皮鞋", "乐福鞋", "牛津鞋", "德比鞋", "西装外套", "大衣"];
const relaxedTypes = ["T恤", "无袖背心", "卫衣", "连帽卫衣", "牛仔裤", "工装裤", "运动裤", "卫裤", "束脚裤", "短裤", "牛仔短裤", "运动鞋", "板鞋", "帆布鞋", "运动袜"];
const trainingTypes = ["运动上衣", "T恤", "运动裤", "运动短裤", "压缩裤", "运动鞋", "跑步鞋", "训练鞋", "篮球鞋", "足球鞋", "运动袜"];
const athleticShoeTypes = ["运动鞋", "跑步鞋", "训练鞋", "篮球鞋", "足球鞋"];
const workTypes = ["短袖衬衫", "长袖衬衫", "Polo", "针织衫", "毛衣", "休闲裤", "西裤", "休闲鞋", "皮鞋", "乐福鞋", "牛津鞋", "德比鞋"];
const casualTypes = ["T恤", "Polo", "卫衣", "连帽卫衣", "针织衫", "牛仔裤", "工装裤", "休闲裤", "卫裤", "休闲鞋", "运动鞋", "板鞋", "帆布鞋"];
const travelTypes = ["T恤", "Polo", "卫衣", "运动裤", "卫裤", "休闲裤", "工装裤", "运动鞋", "跑步鞋", "徒步鞋", "休闲鞋"];

export function colorsWorkTogether(first: string, second: string) {
  if (first === second) return true;
  const firstFamily = colorFamily(first);
  const secondFamily = colorFamily(second);
  if (firstFamily === secondFamily) return true;
  return versatileColorFamilies.includes(firstFamily) || versatileColorFamilies.includes(secondFamily);
}

function colorPairScore(first: string, second: string) {
  if (first === second) return 5;
  const firstFamily = colorFamily(first);
  const secondFamily = colorFamily(second);
  if (firstFamily === secondFamily) return 4;
  if (versatileColorFamilies.includes(firstFamily) && versatileColorFamilies.includes(secondFamily)) return 4;
  if (versatileColorFamilies.includes(firstFamily) || versatileColorFamilies.includes(secondFamily)) return 3;
  if (colorsWorkTogether(first, second)) return 2;
  return -6;
}

function itemByCategory(items: Garment[], category: Category) {
  return items.find((item) => item.category === category);
}

function colorHarmonyScore(items: Garment[]) {
  const top = itemByCategory(items, "top");
  const bottom = itemByCategory(items, "bottom");
  const shoes = itemByCategory(items, "shoes");
  const socks = itemByCategory(items, "socks");
  const outer = itemByCategory(items, "outer");
  if (!top || !bottom || !shoes || !socks) return -100;

  let score = colorPairScore(top.color, bottom.color) * 2;
  score += colorPairScore(bottom.color, shoes.color);
  score += colorPairScore(bottom.color, socks.color);
  score += colorPairScore(socks.color, shoes.color) * 2;
  if (outer) score += colorPairScore(outer.color, top.color);

  const uniqueColors = new Set(items.map((item) => colorFamily(item.color)));
  if (uniqueColors.size <= 3) score += 4;
  if (uniqueColors.size >= 5) score -= 8;
  return score;
}

function styleCohesionScore(items: Garment[], scene: Scene) {
  const core = items
    .filter((item) => item.category !== "socks")
    .map((item) => formalityBySubtype[item.subtype] ?? 2);
  const spread = Math.max(...core) - Math.min(...core);
  let score = spread <= 1 ? 9 : spread <= 2 ? 3 : -9;

  if (scene === "gym") {
    score += items.filter((item) => trainingTypes.includes(item.subtype)).length * 3;
    score += athleticShoeTypes.includes(itemByCategory(items, "shoes")?.subtype ?? "") ? 7 : -9;
  }

  const top = itemByCategory(items, "top");
  const bottom = itemByCategory(items, "bottom");
  const shoes = itemByCategory(items, "shoes");
  if (["casual", "friends", "travel"].includes(scene) && top?.material === "棉" && bottom?.material === "牛仔") {
    score += 3;
  }
  if (scene === "meeting" && bottom?.material === "牛仔") score -= 3;
  if (scene === "meeting" && shoes?.material === "皮革") score += 2;
  return score;
}

function weatherCohesionScore(items: Garment[], temperature: number) {
  const clothing = items.filter((item) => ["top", "bottom", "outer"].includes(item.category));
  let score = 0;
  for (const item of clothing) {
    if (temperature >= 26) {
      if (item.thickness === "薄") score += 5;
      if (item.thickness === "厚") score -= 8;
      if (["棉", "亚麻"].includes(item.material)) score += 3;
      if (["羊毛", "皮革"].includes(item.material)) score -= 5;
      if (item.category === "outer") score -= 10;
    } else if (temperature < 16) {
      if (item.thickness === "厚") score += 5;
      if (item.thickness === "薄") score -= 3;
      if (item.material === "羊毛") score += 4;
      if (item.category === "outer") score += 8;
    } else if (item.thickness === "适中") {
      score += 4;
    }
  }
  return score;
}

function preferenceAdjustment(item: Garment, scene: Scene, history: OutfitFeedback[]) {
  return history.slice(-60).reduce((total, entry) => {
    if (entry.scene !== scene || !entry.garmentIds.includes(item.id)) return total;
    if (entry.action === "adopted") return total + 3;
    if (entry.action === "swapped") return total - 1;
    let adjustment = -2;
    if (entry.reason === "formal" && formalTypes.includes(item.subtype)) adjustment -= 2;
    if (entry.reason === "casual" && relaxedTypes.includes(item.subtype)) adjustment -= 2;
    if (entry.reason === "hot" && (item.thickness === "厚" || item.category === "outer")) adjustment -= 3;
    if (entry.reason === "comfort") adjustment -= 2;
    return total + adjustment;
  }, 0);
}

export function scoreItem(item: Garment, scene: Scene, temperature: number, history: OutfitFeedback[] = []) {
  let score = item.scenes.length === 0 ? 4 : item.scenes.includes(scene) ? 14 : 1;

  if (scene === "work" && workTypes.includes(item.subtype)) score += 8;
  if (scene === "meeting" && formalTypes.includes(item.subtype)) score += 11;
  if (scene === "gym" && trainingTypes.includes(item.subtype)) score += 10;
  if (scene === "casual" && casualTypes.includes(item.subtype)) score += 7;
  if (scene === "friends" && [...casualTypes, "短袖衬衫", "长袖衬衫"].includes(item.subtype)) score += 8;
  if (scene === "date" && ["Polo", "针织衫", "毛衣", "短袖衬衫", "长袖衬衫", "休闲裤", "西裤", "休闲鞋", "皮鞋", "乐福鞋", "牛津鞋", "德比鞋"].includes(item.subtype)) score += 9;
  if (scene === "travel" && travelTypes.includes(item.subtype)) score += 8;

  if (temperature >= 26 && item.thickness === "薄") score += 7;
  if (temperature >= 18 && temperature < 26 && item.thickness === "适中") score += 6;
  if (temperature < 18 && item.thickness === "厚") score += 7;
  if (temperature >= 24 && ["棉", "亚麻"].includes(item.material)) score += 3;
  if (temperature < 16 && item.material === "羊毛") score += 4;
  if (!item.thickness || item.thickness === "不知道") score += 2;
  return score + preferenceAdjustment(item, scene, history);
}

export function scoreOutfit(
  items: Garment[],
  scene: Scene,
  weather: OutfitWeather,
  history: OutfitFeedback[] = [],
): OutfitAssessment {
  const individual = items.reduce(
    (total, item) => total + scoreItem(item, scene, weather.apparentTemperature, history),
    0,
  );
  const color = colorHarmonyScore(items);
  const style = styleCohesionScore(items, scene);
  const weatherScore = weatherCohesionScore(items, weather.apparentTemperature);
  return {
    total: individual + color + style + weatherScore,
    color,
    style,
    weather: weatherScore,
  };
}

function candidatePool(
  items: Garment[],
  scene: Scene,
  temperature: number,
  history: OutfitFeedback[],
  overrideId?: string,
) {
  if (overrideId) {
    const overridden = items.find((item) => item.id === overrideId);
    if (overridden) return [overridden];
  }
  return [...items]
    .sort((first, second) => {
      const scoreDifference = scoreItem(second, scene, temperature, history) - scoreItem(first, scene, temperature, history);
      return scoreDifference || first.id.localeCompare(second.id);
    })
    .slice(0, 5);
}

function combinePools(pools: Garment[][]) {
  return pools.reduce<Garment[][]>(
    (combinations, pool) => combinations.flatMap((combination) => pool.map((item) => [...combination, item])),
    [[]],
  );
}

function describeScene(scene: Scene, items: Garment[]) {
  const top = itemByCategory(items, "top");
  const bottom = itemByCategory(items, "bottom");
  const shoes = itemByCategory(items, "shoes");
  if (!top || !bottom || !shoes) return "这套先按当前场景选择了现有衣物。";

  if (scene === "meeting") {
    const casualParts = [top, bottom, shoes]
      .filter((item) => ["T恤", "卫衣", "连帽卫衣", "牛仔裤", "工装裤", "运动裤", "卫裤", "束脚裤", "短裤", "运动鞋", "跑步鞋", "训练鞋", "篮球鞋", "足球鞋", "凉鞋", "拖鞋", "洞洞鞋"].includes(item.subtype))
      .map((item) => item.subtype);
    return casualParts.length > 0
      ? `${[...new Set(casualParts)].join("和")}让正式度偏低；在现有衣橱里，这仍是公司会议下相对合适的一套。`
      : `${top.subtype}、${bottom.subtype}和${shoes.subtype}的正式程度比较接近，适合公司会议。`;
  }
  if (scene === "work") {
    return `${top.subtype}、${bottom.subtype}和${shoes.subtype}组成了整洁但不过分正式的日常办公搭配。`;
  }
  if (scene === "gym") {
    return athleticShoeTypes.includes(shoes.subtype)
      ? `${top.subtype}、${bottom.subtype}和${shoes.subtype}都优先照顾活动方便。`
      : `${top.subtype}和${bottom.subtype}先保证活动方便；现有鞋里没有适合运动的鞋，所以鞋子只能选择相对接近的一双。`;
  }
  if (scene === "date") return `${top.subtype}、${bottom.subtype}和${shoes.subtype}的正式程度接近，整体显得认真但不会太刻意。`;
  if (scene === "travel") return `${bottom.subtype}和${shoes.subtype}优先照顾走动，再用${top.subtype}保持整体整齐。`;
  if (scene === "friends") return `${top.subtype}、${bottom.subtype}和${shoes.subtype}都偏放松，组合起来适合朋友聚会。`;
  return `${top.subtype}、${bottom.subtype}和${shoes.subtype}的休闲程度比较接近，穿起来舒服但不会像随手拼在一起。`;
}

function describeWeather(weather: OutfitWeather, items: Garment[]) {
  const temperature = Math.round(weather.apparentTemperature);
  const top = itemByCategory(items, "top");
  const outer = itemByCategory(items, "outer");
  if (!top) return `体感约 ${temperature}°，目前只能根据已有衣物判断。`;
  const knownThickness = top.thickness && top.thickness !== "不知道";
  const knownMaterial = top.material && top.material !== "不知道";
  const rainNote = weather.rainProbability >= 50
    ? " 今天有雨，但衣物没有防水信息，鞋子仍按现有搭配选择。"
    : "";

  if (temperature >= 26) {
    if (top.thickness === "厚") {
      return `体感约 ${temperature}°，这件上衣标记为厚，穿着可能闷热；它是现有可穿上衣中的选择。${rainNote}`.trim();
    }
    if (!knownThickness && !knownMaterial) {
      return `体感约 ${temperature}°，今天没有叠加外套；上衣材质和厚度尚未确认，出门前要留意是否闷热。${rainNote}`.trim();
    }
    const evidence = [knownThickness ? `${top.thickness}款` : "", knownMaterial ? top.material : ""].filter(Boolean).join("、");
    return `体感约 ${temperature}°，选择了${evidence}上衣，并且没有叠加外套。${rainNote}`.trim();
  }

  if (temperature < 16) {
    const outerEvidence = outer
      ? `${outer.color}${outer.subtype}${outer.thickness && outer.thickness !== "不知道" ? `（${outer.thickness}）` : ""}`
      : "现有衣物";
    return `体感约 ${temperature}°，这套加入了${outerEvidence}；是否足够保暖还要结合你实际体感。${rainNote}`.trim();
  }

  if (!knownThickness && !knownMaterial) {
    return `体感约 ${temperature}°，上衣材质和厚度尚未确认，目前只按款式和现有层数判断。${rainNote}`.trim();
  }
  const evidence = [knownThickness ? `${top.thickness}款` : "", knownMaterial ? top.material : ""].filter(Boolean).join("、");
  return `体感约 ${temperature}°，这件${evidence}上衣处在当前可选范围内。${rainNote}`.trim();
}

function describeMatch(items: Garment[]) {
  const top = itemByCategory(items, "top");
  const bottom = itemByCategory(items, "bottom");
  const shoes = itemByCategory(items, "shoes");
  const socks = itemByCategory(items, "socks");
  if (!top || !bottom || !shoes || !socks) return "目前还不能说明整套衣服的颜色关系。";

  const parts: string[] = [];
  if (top.color === bottom.color) {
    parts.push(`${top.color}上衣和同色下装让主体颜色保持统一`);
  } else if (colorsWorkTogether(top.color, bottom.color)) {
    parts.push(`${top.color}上衣与${bottom.color}下装的颜色可以放在一起`);
  } else {
    parts.push(`${top.color}上衣与${bottom.color}下装的颜色联系较弱`);
  }

  if (socks.color === shoes.color) {
    parts.push(`${socks.color}袜子和${shoes.color}${shoes.subtype}同色，让下半身衔接更自然`);
  } else if (socks.color === bottom.color) {
    parts.push(`${socks.color}袜子延续了裤装颜色，再过渡到${shoes.color}${shoes.subtype}`);
  } else if (colorsWorkTogether(socks.color, bottom.color) && colorsWorkTogether(socks.color, shoes.color)) {
    parts.push(`${socks.color}袜子能同时接住裤装和${shoes.color}${shoes.subtype}`);
  } else {
    parts.push(`${socks.color}袜子与裤装、鞋的颜色联系较弱，是这套里最需要调整的地方`);
  }

  const uniqueColors = new Set(items.map((item) => colorFamily(item.color)));
  const monochromeNote = uniqueColors.size === 1 && top.color === "黑色"
    ? "；全黑搭配不会杂乱，但比较依赖材质差异形成层次"
    : "";
  return `${parts.join("；")}${monochromeNote}。`;
}

function describeLimitation(
  items: Garment[],
  available: Garment[],
  required: Category[],
  scene: Scene,
  assessment: OutfitAssessment,
) {
  const shoes = itemByCategory(items, "shoes");
  if (scene === "gym" && !athleticShoeTypes.includes(shoes?.subtype ?? "")) {
    return "衣橱里没有已确认适合运动的鞋，今天仍选了现有鞋中相对合适的一双；正式训练前需要确认它的支撑和防滑是否合适。";
  }

  if (scene === "meeting") {
    const suggestions: string[] = [];
    const top = itemByCategory(items, "top");
    const bottom = itemByCategory(items, "bottom");
    if (top && !["Polo", "短袖衬衫", "长袖衬衫"].includes(top.subtype)) suggestions.push("Polo或衬衫");
    if (bottom && !["休闲裤", "西裤"].includes(bottom.subtype)) suggestions.push("休闲裤或西裤");
    if (shoes && !["休闲鞋", "皮鞋", "乐福鞋", "牛津鞋", "德比鞋"].includes(shoes.subtype)) suggestions.push("休闲鞋或皮鞋");
    if (suggestions.length > 0) {
      return `现有衣橱里，这套已经是会议场景下相对合适的一套；如果以后有${suggestions.join("、")}，正式度会更完整。`;
    }
  }

  if (assessment.color < 0) {
    return "这是现有衣物里颜色冲突较少的一套，但还不算理想；以后增加能和裤子、鞋呼应的袜子，会更容易搭。";
  }

  const counts = required.map((category) => available.filter((item) => item.category === category).length);
  if (counts.every((count) => count === 1)) {
    return "你现在每一类衣服都只有一件可以选，所以今天先这样穿。以后多添几件，我再帮你换出不同搭法。";
  }
  return "";
}

export function buildOutfit(
  garments: Garment[],
  scene: Scene,
  weather: OutfitWeather,
  overrides: Partial<Record<Category, string>>,
  feedbackHistory: OutfitFeedback[],
): Outfit {
  const available = garments.filter(
    (item) => item.state === "ready" && (item.category !== "socks" || (item.cleanCount ?? 0) > 0),
  );
  const required: Category[] = ["top", "bottom", "shoes", "socks"];
  if (weather.apparentTemperature < 16) required.push("outer");

  const missing = required
    .filter((category) => !available.some((item) => item.category === category))
    .map((category) => categoryLabels[category]);
  if (missing.length > 0) {
    return { items: [], missing, limitation: "", reasons: ["", "", ""], totalScore: 0 };
  }

  const pools = required.map((category) => candidatePool(
    available.filter((item) => item.category === category),
    scene,
    weather.apparentTemperature,
    feedbackHistory,
    overrides[category],
  ));
  const ranked = combinePools(pools)
    .map((items) => ({ items, assessment: scoreOutfit(items, scene, weather, feedbackHistory) }))
    .sort((first, second) => {
      const scoreDifference = second.assessment.total - first.assessment.total;
      if (scoreDifference) return scoreDifference;
      return first.items.map((item) => item.id).join("-").localeCompare(second.items.map((item) => item.id).join("-"));
    });
  const best = ranked[0];
  if (!best) return { items: [], missing, limitation: "", reasons: ["", "", ""], totalScore: 0 };

  return {
    items: best.items,
    missing: [],
    limitation: describeLimitation(best.items, available, required, scene, best.assessment),
    reasons: [
      describeScene(scene, best.items),
      describeWeather(weather, best.items),
      describeMatch(best.items),
    ],
    totalScore: best.assessment.total,
  };
}

export function findBestSingleSwap(
  garments: Garment[],
  current: Outfit,
  scene: Scene,
  weather: OutfitWeather,
  feedbackHistory: OutfitFeedback[],
) {
  const available = garments.filter(
    (item) => item.state === "ready" && (item.category !== "socks" || (item.cleanCount ?? 0) > 0),
  );
  const options = current.items.flatMap((currentItem) =>
    available
      .filter((item) => item.category === currentItem.category && item.id !== currentItem.id)
      .sort((first, second) =>
        scoreItem(second, scene, weather.apparentTemperature, feedbackHistory)
          - scoreItem(first, scene, weather.apparentTemperature, feedbackHistory),
      )
      .slice(0, 5)
      .map((item) => {
        const outfit = buildOutfit(garments, scene, weather, { [currentItem.category]: item.id }, feedbackHistory);
        return { category: currentItem.category, garmentId: item.id, outfit };
      }),
  );
  return options.sort((first, second) => {
    const scoreDifference = second.outfit.totalScore - first.outfit.totalScore;
    if (scoreDifference) return scoreDifference;
    return first.garmentId.localeCompare(second.garmentId);
  })[0] ?? null;
}
