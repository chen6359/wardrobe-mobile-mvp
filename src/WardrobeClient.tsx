/* User-selected data URLs are rendered directly because they are device-local previews. */

import {
  ChangeEvent,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type View =
  | "home"
  | "start"
  | "add"
  | "ready"
  | "today"
  | "wear-status"
  | "wardrobe"
  | "laundry"
  | "purchase";
type Category = "top" | "bottom" | "shoes" | "socks" | "outer";
type Scene = "work" | "meeting" | "gym" | "casual" | "friends" | "date" | "travel";
type GarmentState = "ready" | "laundry" | "paused";
type WearPlacement = "hanger" | "laundry";
type FeedbackAction = "adopted" | "swapped" | "skipped";
type FeedbackReason = "color" | "formal" | "casual" | "hot" | "comfort" | "other";

type Profile = {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
  preferredScenes: Scene[];
};

type Garment = {
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

type Weather = {
  temperature: number;
  apparentTemperature: number;
  code: number;
  rainProbability: number;
  source: "live" | "manual";
};

type WearRecord = {
  id: string;
  date: string;
  scene: Scene;
  garmentIds: string[];
  city: string;
  temperature: number;
  needsSorting?: boolean;
  sortedAt?: string;
  placements?: Record<string, WearPlacement>;
};

type OutfitFeedback = {
  id: string;
  date: string;
  scene: Scene;
  garmentIds: string[];
  action: FeedbackAction;
  reason?: FeedbackReason;
};

type WardrobeData = {
  profile: Profile | null;
  garments: Garment[];
  wearHistory: WearRecord[];
  feedbackHistory: OutfitFeedback[];
  recentScenes: Scene[];
};

type Outfit = {
  items: Garment[];
  missing: string[];
  limitation: string;
  reasons: [string, string, string];
};

const STORAGE_KEY = "wardrobe-mobile-mvp-v1";

const EMPTY_DATA: WardrobeData = {
  profile: null,
  garments: [],
  wearHistory: [],
  feedbackHistory: [],
  recentScenes: ["work", "meeting", "gym"],
};

const allScenes: Scene[] = ["work", "meeting", "gym", "casual", "friends", "date", "travel"];

function normalizeScene(value: unknown): Scene | null {
  if (value === "leisure") return "friends";
  return allScenes.includes(value as Scene) ? value as Scene : null;
}

function normalizeWardrobeData(value: unknown): WardrobeData {
  if (!value || typeof value !== "object") return EMPTY_DATA;
  const candidate = value as Partial<WardrobeData>;
  const garments: Garment[] = Array.isArray(candidate.garments)
    ? candidate.garments.map((item) => {
        const legacyState = String(item.state);
        const state: GarmentState =
          legacyState === "ready" || legacyState === "laundry" || legacyState === "paused"
            ? legacyState
            : legacyState === "washing"
              ? "laundry"
              : "paused";
        const scenes = Array.isArray(item.scenes)
          ? item.scenes.map(normalizeScene).filter((scene): scene is Scene => Boolean(scene))
          : [];
        return {
          ...item,
          state,
          scenes,
          size: item.size ?? "",
          careNotes: item.careNotes ?? "",
          labelText: item.labelText ?? "",
          careLabelPhoto: item.careLabelPhoto ?? "",
          hangtagPhoto: item.hangtagPhoto ?? "",
        };
      })
    : [];
  const wearHistory: WearRecord[] = Array.isArray(candidate.wearHistory)
    ? candidate.wearHistory.flatMap((record) => {
        const scene = normalizeScene(record.scene);
        return scene
          ? [{ ...record, scene, needsSorting: record.needsSorting === true }]
          : [];
      })
    : [];
  const feedbackActions: FeedbackAction[] = ["adopted", "swapped", "skipped"];
  const feedbackReasons: FeedbackReason[] = ["color", "formal", "casual", "hot", "comfort", "other"];
  const feedbackHistory: OutfitFeedback[] = Array.isArray(candidate.feedbackHistory)
    ? candidate.feedbackHistory.flatMap((entry) => {
        const scene = normalizeScene(entry.scene);
        if (!scene || !feedbackActions.includes(entry.action)) return [];
        const reason = feedbackReasons.includes(entry.reason as FeedbackReason)
          ? entry.reason as FeedbackReason
          : undefined;
        return [{
          ...entry,
          scene,
          garmentIds: Array.isArray(entry.garmentIds) ? entry.garmentIds : [],
          reason,
        }];
      })
    : [];
  const preferredScenes = Array.isArray(candidate.profile?.preferredScenes)
    ? candidate.profile.preferredScenes
        .map(normalizeScene)
        .filter((scene): scene is Scene => Boolean(scene))
    : ["work", "meeting", "gym", "casual", "friends"] as Scene[];
  const profile = candidate.profile
    ? { ...candidate.profile, preferredScenes: preferredScenes.length > 0 ? preferredScenes : ["work"] as Scene[] }
    : null;
  const recentScenes = Array.isArray(candidate.recentScenes)
    ? candidate.recentScenes
        .map(normalizeScene)
        .filter((scene): scene is Scene => Boolean(scene))
        .slice(0, 3)
    : [];
  return {
    profile,
    garments,
    wearHistory,
    feedbackHistory,
    recentScenes: recentScenes.length > 0
      ? recentScenes
      : (profile?.preferredScenes.slice(0, 3) ?? EMPTY_DATA.recentScenes),
  };
}

function findPendingWear(data: WardrobeData) {
  return [...data.wearHistory].reverse().find((record) => record.needsSorting === true);
}

function garmentLocation(item: Garment): GarmentState {
  if (item.state === "paused") return "paused";
  if (item.category === "socks" && (item.cleanCount ?? 0) <= 0) return "laundry";
  return item.state;
}

function dirtySockCount(item: Garment) {
  if (item.category !== "socks") return 0;
  return Math.max(0, (item.totalCount ?? 0) - (item.cleanCount ?? 0));
}

function applyWearPlacements(
  data: WardrobeData,
  recordId: string,
  placements: Record<string, WearPlacement>,
): WardrobeData {
  const record = data.wearHistory.find((item) => item.id === recordId);
  if (!record) return data;
  const wornIds = new Set(record.garmentIds);
  const garments = data.garments.map((item) => {
    if (!wornIds.has(item.id)) return item;
    const placement = placements[item.id];
    if (!placement) return item;
    if (placement === "hanger") {
      return { ...item, state: "ready" as GarmentState };
    }
    if (item.category === "socks") {
      const cleanCount = Math.max(0, (item.cleanCount ?? 0) - 1);
      return {
        ...item,
        cleanCount,
        state: cleanCount > 0 ? "ready" as GarmentState : "laundry" as GarmentState,
      };
    }
    return { ...item, state: "laundry" as GarmentState };
  });
  const sortedAt = new Date().toISOString();
  return {
    ...data,
    garments,
    wearHistory: data.wearHistory.map((item) =>
      item.id === recordId
        ? { ...item, needsSorting: false, sortedAt, placements }
        : item,
    ),
  };
}

function restoreCleanGarments(data: WardrobeData, garmentIds: string[]): WardrobeData {
  const selected = new Set(garmentIds);
  return {
    ...data,
    garments: data.garments.map((item) => {
      if (!selected.has(item.id)) return item;
      if (item.category === "socks") {
        return {
          ...item,
          cleanCount: Math.max(1, item.totalCount ?? item.cleanCount ?? 1),
          state: "ready",
        };
      }
      return { ...item, state: "ready" };
    }),
  };
}

const categoryLabels: Record<Category, string> = {
  top: "上衣",
  bottom: "下装",
  shoes: "鞋",
  socks: "袜子组",
  outer: "外套",
};

const sceneLabels: Record<Scene, string> = {
  work: "普通办公",
  meeting: "公司会议",
  gym: "健身",
  casual: "日常休闲",
  friends: "朋友聚会",
  date: "约会",
  travel: "旅行出行",
};

const sceneDescriptions: Record<Scene, string> = {
  work: "整洁、舒服，适合日常坐班",
  meeting: "比日常办公更利落正式",
  gym: "方便活动，优先透气和支撑",
  casual: "放松但不随便",
  friends: "有一点亮点，也要自然",
  date: "更重视整体感和细节",
  travel: "耐走、好活动，也方便增减",
};

const subtypeOptions: Record<Category, string[]> = {
  top: ["T恤", "Polo", "短袖衬衫", "长袖衬衫", "针织衫"],
  bottom: ["休闲裤", "西裤", "牛仔裤", "运动裤", "短裤"],
  shoes: ["运动鞋", "休闲鞋", "皮鞋", "凉鞋"],
  socks: ["短袜", "中筒袜", "长袜", "运动袜"],
  outer: ["夹克", "风衣", "西装外套", "羽绒服", "大衣"],
};

const knownCities: Record<string, Omit<Profile, "city" | "preferredScenes">> = {
  首尔: { country: "韩国", latitude: 37.5665, longitude: 126.978, timezone: "Asia/Seoul" },
  北京: { country: "中国", latitude: 39.9042, longitude: 116.4074, timezone: "Asia/Shanghai" },
  上海: { country: "中国", latitude: 31.2304, longitude: 121.4737, timezone: "Asia/Shanghai" },
  深圳: { country: "中国", latitude: 22.5431, longitude: 114.0579, timezone: "Asia/Shanghai" },
  广州: { country: "中国", latitude: 23.1291, longitude: 113.2644, timezone: "Asia/Shanghai" },
  杭州: { country: "中国", latitude: 30.2741, longitude: 120.1551, timezone: "Asia/Shanghai" },
};

function navigate(path: string) {
  window.location.hash = path;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function weatherDescription(code: number) {
  if (code === 0) return "晴朗";
  if (code <= 3) return "多云";
  if (code <= 48) return "有雾";
  if (code <= 67) return "有雨";
  if (code <= 77) return "有雪";
  if (code <= 82) return "阵雨";
  if (code <= 86) return "阵雪";
  return "雷雨";
}

function weatherMark(code: number) {
  if (code === 0) return "☀";
  if (code <= 3) return "☁";
  if (code <= 48) return "≋";
  if (code <= 67 || code <= 82) return "☂";
  if (code <= 86) return "❄";
  return "ϟ";
}

function readiness(garments: Garment[]) {
  const available = garments.filter(
    (item) => item.state === "ready" && (item.category !== "socks" || (item.cleanCount ?? 0) > 0),
  );
  const required: Category[] = ["top", "bottom", "shoes", "socks"];
  const completed = required.filter((category) =>
    available.some((item) => item.category === category),
  );
  return { completed, ready: completed.length === required.length };
}

function preferenceAdjustment(item: Garment, scene: Scene, history: OutfitFeedback[]) {
  const formalTypes = ["短袖衬衫", "长袖衬衫", "Polo", "西裤", "皮鞋", "西装外套"];
  const relaxedTypes = ["T恤", "牛仔裤", "运动裤", "短裤", "运动鞋", "运动袜"];
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

function scoreItem(item: Garment, scene: Scene, temperature: number, history: OutfitFeedback[] = []) {
  let score = item.scenes.length === 0 ? 4 : item.scenes.includes(scene) ? 14 : 1;

  if (scene === "work" && ["短袖衬衫", "长袖衬衫", "Polo", "西裤", "休闲裤", "皮鞋"].includes(item.subtype)) score += 8;
  if (scene === "meeting" && ["短袖衬衫", "长袖衬衫", "Polo", "西裤", "皮鞋", "西装外套"].includes(item.subtype)) score += 11;
  if (scene === "gym" && ["T恤", "运动裤", "短裤", "运动鞋", "运动袜"].includes(item.subtype)) score += 10;
  if (scene === "casual" && ["T恤", "Polo", "牛仔裤", "休闲裤", "休闲鞋", "运动鞋"].includes(item.subtype)) score += 7;
  if (scene === "friends" && ["T恤", "Polo", "短袖衬衫", "牛仔裤", "休闲裤", "休闲鞋"].includes(item.subtype)) score += 8;
  if (scene === "date" && ["Polo", "短袖衬衫", "长袖衬衫", "休闲裤", "西裤", "休闲鞋", "皮鞋"].includes(item.subtype)) score += 9;
  if (scene === "travel" && ["T恤", "Polo", "运动裤", "休闲裤", "运动鞋", "休闲鞋"].includes(item.subtype)) score += 8;

  if (temperature >= 26 && item.thickness === "薄") score += 7;
  if (temperature >= 18 && temperature < 26 && item.thickness === "适中") score += 6;
  if (temperature < 18 && item.thickness === "厚") score += 7;
  if (temperature >= 24 && ["棉", "亚麻"].includes(item.material)) score += 3;
  if (temperature < 16 && item.material === "羊毛") score += 4;
  if (!item.thickness || item.thickness === "不知道") score += 2;
  return score + preferenceAdjustment(item, scene, history);
}

function selectBest(
  items: Garment[],
  scene: Scene,
  temperature: number,
  history: OutfitFeedback[],
  overrideId?: string,
) {
  if (overrideId) {
    const overridden = items.find((item) => item.id === overrideId);
    if (overridden) return overridden;
  }
  return [...items].sort(
    (a, b) => scoreItem(b, scene, temperature, history) - scoreItem(a, scene, temperature, history),
  )[0];
}

function buildOutfit(
  garments: Garment[],
  scene: Scene,
  weather: Weather,
  overrides: Partial<Record<Category, string>>,
  feedbackHistory: OutfitFeedback[],
): Outfit {
  const available = garments.filter(
    (item) => item.state === "ready" && (item.category !== "socks" || (item.cleanCount ?? 0) > 0),
  );
  const needOuter = weather.apparentTemperature < 16;
  const required: Category[] = ["top", "bottom", "shoes", "socks"];
  if (needOuter) required.push("outer");

  const missing = required
    .filter((category) => !available.some((item) => item.category === category))
    .map((category) => categoryLabels[category]);

  if (missing.length > 0) {
    return {
      items: [],
      missing,
      limitation: "",
      reasons: ["", "", ""],
    };
  }

  const selected = required.map((category) =>
    selectBest(
      available.filter((item) => item.category === category),
      scene,
      weather.apparentTemperature,
      feedbackHistory,
      overrides[category],
    ),
  );

  const shoes = selected.find((item) => item.category === "shoes");
  const counts = required.map(
    (category) => available.filter((item) => item.category === category).length,
  );
  let limitation = "";
  if (scene === "gym" && shoes?.subtype !== "运动鞋") {
    limitation = "衣橱里没有已确认的运动鞋，今天仍选了现有鞋中最合适的一双；正式训练前需要确认它的支撑和防滑是否合适。";
  } else if (counts.every((count) => count === 1)) {
    limitation = "你现在每一类衣服都只有一件可以选，所以今天先这样穿。以后多添几件，我再帮你换出不同搭法。";
  }

  const top = selected.find((item) => item.category === "top");
  const bottom = selected.find((item) => item.category === "bottom");
  const socks = selected.find((item) => item.category === "socks");
  const sceneReason =
    scene === "work"
      ? "普通办公需要整洁利落，但不必穿得像正式商务宴会。"
      : scene === "meeting"
        ? "公司会议比日常办公更正式，今天优先选择线条利落、颜色稳妥的衣服。"
      : scene === "gym"
        ? "训练时先保证活动方便，再在现有衣物里尽量保持颜色协调。"
        : scene === "date"
          ? "约会更看重整体感，衣服要显得认真，但不需要刻意用力。"
          : scene === "travel"
            ? "旅行出行先照顾走动和久坐，再保证照片里看起来整齐。"
            : scene === "friends"
              ? "朋友聚会可以放松一些，但上衣、裤子和鞋仍然要有连贯感。"
              : "日常休闲可以舒服一些，但舒服不等于随便拼在一起。";
  const weatherReason = `体感约 ${Math.round(weather.apparentTemperature)}°，${top?.thickness && top.thickness !== "不知道" ? `这件${top.thickness}上衣` : "这套的层次"}更适合现在的温度${needOuter ? "，并补上了外套" : ""}。`;
  const matchReason = top?.color === bottom?.color
    ? `${top?.color ?? "同色"}上衣和同色下装让整体更统一，${socks?.color ?? "袜子"}袜子连接裤装和鞋，不会突然跳色。`
    : `${top?.color ?? "上衣"}上衣与${bottom?.color ?? "下装"}下装颜色能接在一起，${socks?.color ?? "袜子"}袜子负责连接裤装和鞋，不会在坐下时突然断开。`;

  return {
    items: selected.filter(Boolean),
    missing: [],
    limitation,
    reasons: [sceneReason, weatherReason, matchReason],
  };
}

function nextUsefulCategory(garments: Garment[]): Category {
  const required: Category[] = ["top", "bottom", "shoes", "socks"];
  const missing = required.find((category) =>
    !garments.some((item) => item.category === category && garmentLocation(item) === "ready"),
  );
  if (missing) return missing;
  const order: Category[] = ["top", "bottom", "shoes", "outer", "socks"];
  return [...order].sort((a, b) =>
    garments.filter((item) => item.category === a).length
      - garments.filter((item) => item.category === b).length,
  )[0];
}

type PurchaseVerdict = "preview" | "consider" | "conditional" | "skip";

type PurchaseAnalysis = {
  verdict: PurchaseVerdict;
  title: string;
  summary: string;
  similar: Garment[];
  matchSets: Garment[][];
  missing: Category[];
};

const neutralColors = ["黑色", "白色", "灰色", "藏青", "卡其", "棕色"];
const colorPartners: Record<string, string[]> = {
  蓝色: ["黑色", "白色", "灰色", "藏青", "卡其", "棕色"],
  绿色: ["黑色", "白色", "灰色", "藏青", "卡其", "棕色"],
  红色: ["黑色", "白色", "灰色", "藏青", "卡其"],
};

function colorsWorkTogether(first: string, second: string) {
  if (first === second) return true;
  if (neutralColors.includes(first) || neutralColors.includes(second)) return true;
  return colorPartners[first]?.includes(second) || colorPartners[second]?.includes(first) || false;
}

function purchasePartners(category: Category): Category[] {
  if (category === "top") return ["bottom", "shoes"];
  if (category === "bottom") return ["top", "shoes"];
  if (category === "shoes") return ["top", "bottom"];
  if (category === "outer") return ["top", "bottom", "shoes"];
  return ["bottom", "shoes"];
}

function analyzePurchase(candidate: Garment, garments: Garment[]): PurchaseAnalysis {
  const similar = garments.filter((item) =>
    item.category === candidate.category
      && (item.subtype === candidate.subtype || item.color === candidate.color),
  );
  const usableForMatching = garments.filter((item) => item.state !== "paused");
  const partnerCategories = purchasePartners(candidate.category);
  const pools = partnerCategories.map((category) =>
    usableForMatching.filter((item) =>
      item.category === category && colorsWorkTogether(candidate.color, item.color),
    ),
  );
  const missing = partnerCategories.filter((_, index) => pools[index].length === 0);
  const matchSets: Garment[][] = [];
  if (missing.length === 0) {
    for (let index = 0; index < 3; index += 1) {
      const set = pools.map((pool, poolIndex) => pool[(index + poolIndex) % pool.length]);
      const signature = set.map((item) => item.id).join("-");
      if (!matchSets.some((items) => items.map((item) => item.id).join("-") === signature)) {
        matchSets.push(set);
      }
    }
  }

  if (garments.length < 15) {
    return {
      verdict: "preview",
      title: matchSets.length > 0 ? "先看看这些穿法" : "先别急着买",
      summary: matchSets.length > 0
        ? "它已经能和现有衣服搭起来。等你再添几件常穿的衣服，我再给你更明确的建议。"
        : "现在还凑不出完整的一套。先看看缺什么，再决定要不要下单。",
      similar,
      matchSets,
      missing,
    };
  }
  if (similar.length >= 2 && matchSets.length < 2) {
    return {
      verdict: "skip",
      title: "建议先不买",
      summary: "相近的衣服已经不少，它能带来的新穿法又比较有限。",
      similar,
      matchSets,
      missing,
    };
  }
  if (similar.length === 0 && matchSets.length >= 3) {
    return {
      verdict: "consider",
      title: "值得考虑",
      summary: "衣橱里没有明显重复，而且能接上多套现有衣服。",
      similar,
      matchSets,
      missing,
    };
  }
  return {
    verdict: "conditional",
    title: "有条件地买",
    summary: similar.length > 0
      ? "有相近款，但仍能接上现有衣服。确认版型和价格合适后再决定。"
      : "重复不明显，但现在能确认的搭法还不多。确认你会常穿再决定。",
    similar,
    matchSets,
    missing,
  };
}

async function compressImage(file: File, maxEdge = 900, quality = 0.78) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const preview = new Image();
    preview.onload = () => resolve(preview);
    preview.onerror = reject;
    preview.src = dataUrl;
  });
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function readLabelDetails(text: string) {
  const normalized = text.replaceAll(/\s+/g, " ").trim();
  const materialRules: [RegExp, string][] = [
    [/亚麻|linen/i, "亚麻"],
    [/羊毛|wool/i, "羊毛"],
    [/聚酯|polyester/i, "聚酯纤维"],
    [/牛仔|denim/i, "牛仔"],
    [/皮革|leather/i, "皮革"],
    [/棉|cotton/i, "棉"],
  ];
  const materials = materialRules.filter(([rule]) => rule.test(normalized)).map(([, value]) => value);
  const sizeMatch = normalized.match(/(?:尺码|SIZE|Size|size|码数)\s*[:：]?\s*([2-6]?X?[SML]{1,3}|\d{2,3})\b/);
  const careRules: [RegExp, string][] = [
    [/手洗|hand wash/i, "建议手洗"],
    [/机洗|machine wash/i, "可以机洗"],
    [/不可漂白|do not bleach/i, "不可漂白"],
    [/不可烘干|do not tumble dry/i, "不可烘干"],
    [/悬挂晾干|hang dry/i, "悬挂晾干"],
    [/平铺晾干|dry flat/i, "平铺晾干"],
    [/阴干|dry in shade/i, "阴干"],
    [/干洗|dry clean/i, "按标签要求干洗"],
    [/低温熨|low iron/i, "低温熨烫"],
  ];
  const careNotes = careRules.filter(([rule]) => rule.test(normalized)).map(([, value]) => value);
  return {
    material: materials.length > 1 ? "混纺" : materials[0] ?? "",
    size: sizeMatch?.[1]?.toUpperCase() ?? "",
    careNotes: [...new Set(careNotes)].join("、"),
  };
}

async function recognizeLabels(
  images: string[],
  onProgress: (progress: number) => void,
) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["chi_sim", "eng"], undefined, {
    logger(message) {
      if (message.status === "recognizing text") onProgress(message.progress);
    },
  });
  try {
    const textParts: string[] = [];
    for (let index = 0; index < images.length; index += 1) {
      const result = await worker.recognize(images[index]);
      textParts.push(result.data.text);
      onProgress((index + 1) / images.length);
    }
    return textParts.join("\n");
  } finally {
    await worker.terminate();
  }
}

export default function WardrobeClient({ initialView }: { initialView: View }) {
  const [data, setData] = useState<WardrobeData>(EMPTY_DATA);
  const [hydrated, setHydrated] = useState(false);
  const [scene, setScene] = useState<Scene>("work");
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<"idle" | "loading" | "failed">("idle");
  const [overrides, setOverrides] = useState<Partial<Record<Category, string>>>({});
  const [notice, setNotice] = useState("");
  const [worn, setWorn] = useState(false);
  const sceneInitialized = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) setData(normalizeWardrobeData(JSON.parse(saved)));
      } catch {
        setNotice("衣橱没有打开成功，请刷新后再试。 ");
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      window.setTimeout(() => {
        setNotice("这台设备留给衣橱的空间不够了。请先删掉几张不需要的标签照片，再继续添加。 ");
      }, 0);
    }
  }, [data, hydrated]);

  useEffect(() => {
    if (!hydrated || sceneInitialized.current) return;
    sceneInitialized.current = true;
    setScene(data.recentScenes[0] ?? data.profile?.preferredScenes[0] ?? "work");
  }, [data.profile, data.recentScenes, hydrated]);

  const pendingWear = findPendingWear(data);
  const requestedView: View =
    initialView === "home" ? (data.profile ? "today" : "start") : initialView;
  const actualView: View =
    pendingWear && !worn && requestedView === "today"
      ? "wear-status"
      : requestedView === "wear-status" && !pendingWear
        ? "today"
        : requestedView;

  useEffect(() => {
    if (!hydrated || actualView !== "today" || !data.profile) return;
    const controller = new AbortController();
    async function loadWeather() {
      setWeatherStatus("loading");
      try {
        const profile = data.profile as Profile;
        const params = new URLSearchParams({
          latitude: String(profile.latitude),
          longitude: String(profile.longitude),
          current: "temperature_2m,apparent_temperature,weather_code",
          daily: "precipitation_probability_max",
          timezone: profile.timezone || "auto",
          forecast_days: "1",
        });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("weather unavailable");
        const result = await response.json();
        setWeather({
          temperature: Number(result.current.temperature_2m),
          apparentTemperature: Number(result.current.apparent_temperature),
          code: Number(result.current.weather_code),
          rainProbability: Number(result.daily?.precipitation_probability_max?.[0] ?? 0),
          source: "live",
        });
        setWeatherStatus("idle");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setWeatherStatus("failed");
      }
    }
    void loadWeather();
    return () => controller.abort();
  }, [actualView, data.profile, hydrated]);

  if (!hydrated) {
    return (
      <main className="weather-shell loading-shell" aria-live="polite">
        <div className="loading-orb" />
        <p>正在打开你的衣橱…</p>
      </main>
    );
  }

  if (actualView === "start") {
    return <StartScreen data={data} setData={setData} notice={notice} setNotice={setNotice} />;
  }

  if (actualView === "add") {
    return <AddScreen data={data} setData={setData} />;
  }

  if (actualView === "ready") {
    return <ReadyScreen garments={data.garments} />;
  }

  if (actualView === "wear-status" && pendingWear) {
    return (
      <WearStatusScreen
        data={data}
        record={pendingWear}
        setData={setData}
      />
    );
  }

  if (actualView === "wardrobe") {
    return <WardrobeScreen data={data} setData={setData} />;
  }

  if (actualView === "laundry") {
    return <LaundryScreen data={data} setData={setData} />;
  }

  if (actualView === "purchase") {
    return <PurchaseScreen data={data} setData={setData} />;
  }

  const currentWeather = weather;
  const outfit = currentWeather
    ? buildOutfit(data.garments, scene, currentWeather, overrides, data.feedbackHistory)
    : null;

  function addFeedback(action: FeedbackAction, reason?: FeedbackReason) {
    if (!outfit || outfit.items.length === 0) return;
    const feedback: OutfitFeedback = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      scene,
      garmentIds: outfit.items.map((item) => item.id),
      action,
      reason,
    };
    setData((previous) => ({
      ...previous,
      feedbackHistory: [...previous.feedbackHistory, feedback].slice(-200),
    }));
  }

  function swapOne() {
    if (!outfit || outfit.items.length === 0 || !currentWeather) return;
    const available = data.garments.filter(
      (item) => item.state === "ready" && (item.category !== "socks" || (item.cleanCount ?? 0) > 0),
    );
    const order: Category[] = ["top", "bottom", "shoes", "socks", "outer"];
    const category = order.find(
      (candidate) => available.filter((item) => item.category === candidate).length > 1,
    );
    if (!category) {
      setNotice("现在每一类都只有一件可以选。再添一件同类衣服，就能试试别的搭法。 ");
      return;
    }
    const candidates = available
      .filter((item) => item.category === category)
      .sort((a, b) => scoreItem(b, scene, currentWeather.apparentTemperature, data.feedbackHistory) - scoreItem(a, scene, currentWeather.apparentTemperature, data.feedbackHistory));
    const current = outfit.items.find((item) => item.category === category);
    const index = Math.max(0, candidates.findIndex((item) => item.id === current?.id));
    const next = candidates[(index + 1) % candidates.length];
    addFeedback("swapped");
    setOverrides((previous) => ({ ...previous, [category]: next.id }));
    setNotice(`${categoryLabels[category]}已经换好了。看看这一套是不是更像你。`);
  }

  function rejectOutfit(reason: FeedbackReason) {
    if (!outfit || !currentWeather) return;
    addFeedback("skipped", reason);
    const available = data.garments.filter(
      (item) => item.state === "ready" && (item.category !== "socks" || (item.cleanCount ?? 0) > 0),
    );
    const nextOverrides: Partial<Record<Category, string>> = {};
    for (const current of outfit.items) {
      const candidates = available
        .filter((item) => item.category === current.category)
        .sort((a, b) => scoreItem(b, scene, currentWeather.apparentTemperature, data.feedbackHistory) - scoreItem(a, scene, currentWeather.apparentTemperature, data.feedbackHistory));
      if (candidates.length < 2) continue;
      const index = Math.max(0, candidates.findIndex((item) => item.id === current.id));
      nextOverrides[current.category] = candidates[(index + 1) % candidates.length].id;
    }
    if (Object.keys(nextOverrides).length === 0) {
      setNotice("记下了。现在没有别的衣服可换，下次推荐会避开你不喜欢的方向。 ");
      return;
    }
    setOverrides(nextOverrides);
    setNotice("记下了，已经换一套试试。 ");
  }

  function confirmWear() {
    if (!outfit || !currentWeather || !data.profile || outfit.items.length === 0) return;
    const record: WearRecord = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      scene,
      garmentIds: outfit.items.map((item) => item.id),
      city: data.profile.city,
      temperature: currentWeather.temperature,
      needsSorting: true,
    };
    const feedback: OutfitFeedback = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      scene,
      garmentIds: record.garmentIds,
      action: "adopted",
    };
    setData((previous) => ({
      ...previous,
      wearHistory: [...previous.wearHistory, record],
      feedbackHistory: [...previous.feedbackHistory, feedback].slice(-200),
    }));
    setWorn(true);
    setNotice("");
  }

  return (
    <TodayScreen
      data={data}
      scene={scene}
      setScene={(next) => {
        setScene(next);
        setData((previous) => ({
          ...previous,
          recentScenes: [next, ...previous.recentScenes.filter((item) => item !== next)].slice(0, 3),
        }));
        setOverrides({});
        setNotice(`已按${sceneLabels[next]}更新今天的搭配。`);
      }}
      weather={currentWeather}
      weatherStatus={weatherStatus}
      setWeather={setWeather}
      outfit={outfit}
      notice={notice}
      swapOne={swapOne}
      rejectOutfit={rejectOutfit}
      confirmWear={confirmWear}
      worn={worn}
    />
  );
}

function StartScreen({
  data,
  setData,
  notice,
  setNotice,
}: {
  data: WardrobeData;
  setData: React.Dispatch<React.SetStateAction<WardrobeData>>;
  notice: string;
  setNotice: (notice: string) => void;
}) {
  type CityOption = Omit<Profile, "preferredScenes"> & { id: string; detail: string };
  const [city, setCity] = useState(data.profile?.city ?? "");
  const [cityOptions, setCityOptions] = useState<CityOption[]>([]);
  const [selectedCity, setSelectedCity] = useState<CityOption | null>(() =>
    data.profile ? { ...data.profile, id: "saved-city", detail: [data.profile.country].filter(Boolean).join(" · ") } : null,
  );
  const [searchStatus, setSearchStatus] = useState<"idle" | "searching" | "failed">("idle");
  const [locating, setLocating] = useState(false);
  const [preferredScenes, setPreferredScenes] = useState<Scene[]>(
    data.profile?.preferredScenes?.length
      ? data.profile.preferredScenes
      : ["work", "meeting", "gym", "casual", "friends"],
  );

  useEffect(() => {
    const trimmed = city.trim();
    if (selectedCity?.city === trimmed || trimmed.length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchStatus("searching");
      setNotice("");
      const localOptions: CityOption[] = Object.entries(knownCities)
        .filter(([name]) => name.includes(trimmed) || trimmed.includes(name))
        .map(([name, location]) => ({
          id: `known-${name}`,
          city: name,
          ...location,
          detail: location.country,
        }));
      if (localOptions.length > 0) setCityOptions(localOptions);
      try {
        async function search(name: string) {
          const params = new URLSearchParams({ name, count: "6", language: "zh", format: "json" });
          const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("city lookup failed");
          const result = await response.json();
          return Array.isArray(result.results) ? result.results : [];
        }
        let remoteResults = await search(trimmed);
        if (remoteResults.length === 0 && trimmed.endsWith("市")) {
          remoteResults = await search(trimmed.slice(0, -1));
        }
        const remoteOptions: CityOption[] = remoteResults.map((location: Record<string, unknown>) => ({
          id: String(location.id ?? `${location.latitude}-${location.longitude}`),
          city: String(location.name ?? trimmed),
          country: String(location.country ?? ""),
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          timezone: String(location.timezone ?? "auto"),
          detail: [location.admin1, location.country].filter(Boolean).join(" · "),
        }));
        const unique = [...localOptions, ...remoteOptions].filter(
          (option, index, items) => items.findIndex((item) => item.latitude === option.latitude && item.longitude === option.longitude) === index,
        );
        setCityOptions(unique.slice(0, 6));
        setSearchStatus("idle");
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setCityOptions(localOptions);
          setSearchStatus(localOptions.length > 0 ? "idle" : "failed");
        }
      }
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [city, selectedCity?.city, setNotice]);

  function chooseCity(option: CityOption) {
    setSelectedCity(option);
    setCity(option.city);
    setCityOptions([]);
    setSearchStatus("idle");
    setNotice(`已选择${option.city}${option.detail ? ` · ${option.detail}` : ""}`);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setNotice("这台设备暂时不能读取位置，请搜索并选择城市。 ");
      return;
    }
    setLocating(true);
    setNotice("正在读取当前位置…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const option: CityOption = {
          id: "current-location",
          city: "当前位置",
          country: "",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timezone: "auto",
          detail: "已按设备定位",
        };
        setSelectedCity(option);
        setCity(option.city);
        setCityOptions([]);
        setLocating(false);
        setNotice("已获取当前位置，天气会按这里读取。 ");
      },
      () => {
        setLocating(false);
        setNotice("没有取得位置权限，请搜索并选择城市。 ");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  function togglePreferredScene(scene: Scene) {
    setPreferredScenes((previous) =>
      previous.includes(scene)
        ? previous.filter((item) => item !== scene)
        : [...previous, scene],
    );
  }

  function saveCity(event: FormEvent) {
    event.preventDefault();
    if (!selectedCity || selectedCity.city !== city.trim()) {
      setNotice("请从搜索结果里选中一个城市，或使用当前位置。 ");
      return;
    }
    if (preferredScenes.length === 0) {
      setNotice("请至少选择一个你常用的穿衣场景。 ");
      return;
    }
    const profile: Profile = {
      city: selectedCity.city,
      country: selectedCity.country,
      latitude: selectedCity.latitude,
      longitude: selectedCity.longitude,
      timezone: selectedCity.timezone,
      preferredScenes,
    };
    setData((previous) => ({
      ...previous,
      profile,
      recentScenes: previous.profile ? previous.recentScenes : preferredScenes.slice(0, 3),
    }));
    navigate("/wardrobe/add");
  }

  return (
    <main className="weather-shell start-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="start-content">
        <div className="brand-chip">穿搭助手</div>
        <p className="eyebrow">出门前，少纠结一会儿</p>
        <h1>今天穿什么，<br />让衣橱帮你想。</h1>
        <p className="start-copy">先告诉我你通常从哪里出门，我会把当地天气算进每天的搭配里。</p>

        <form className="glass-panel city-form" onSubmit={saveCity}>
          <label htmlFor="city">你通常从哪里出门？</label>
          <div className="city-search-wrap">
            <input
              id="city"
              value={city}
              onChange={(event) => {
                setCity(event.target.value);
                setSelectedCity(null);
                setCityOptions([]);
              }}
              placeholder="搜索城市，例如：石家庄"
              autoComplete="address-level2"
            />
            {searchStatus === "searching" && <span className="city-search-status">正在搜索…</span>}
            {cityOptions.length > 0 && (
              <div className="city-results" role="listbox" aria-label="城市搜索结果">
                {cityOptions.map((option) => (
                  <button type="button" role="option" aria-selected="false" key={option.id} onClick={() => chooseCity(option)}>
                    <strong>{option.city}</strong>
                    <span>{option.detail || "选择这个位置"}</span>
                  </button>
                ))}
              </div>
            )}
            {searchStatus === "failed" && <p className="city-search-error">城市搜索暂时不可用，请稍后再试。</p>}
          </div>
          <button className="location-button" type="button" onClick={useCurrentLocation} disabled={locating}>
            <span aria-hidden="true">⌖</span>{locating ? "正在获取位置" : "使用当前位置"}
          </button>

          <fieldset className="start-scenes">
            <legend>你平时会遇到哪些场景？</legend>
            <p>先选常用的，以后随时可以换。</p>
            <div>
              {allScenes.map((item) => (
                <button
                  className={preferredScenes.includes(item) ? "selected" : ""}
                  type="button"
                  key={item}
                  onClick={() => togglePreferredScene(item)}
                  aria-pressed={preferredScenes.includes(item)}
                >
                  {sceneLabels[item]}
                </button>
              ))}
            </div>
          </fieldset>

          <button type="submit" className="primary-button full">
              下一步
            </button>
          {notice && <p className="inline-notice" role="alert">{notice}</p>}
        </form>

        <p className="local-note">你的衣服照片和穿搭记录只保存在这台设备的当前浏览器里。</p>
      </section>
    </main>
  );
}

function AddScreen({
  data,
  setData,
}: {
  data: WardrobeData;
  setData: React.Dispatch<React.SetStateAction<WardrobeData>>;
}) {
  const [category, setCategory] = useState<Category>("top");
  const [subtype, setSubtype] = useState(subtypeOptions.top[0]);
  const [color, setColor] = useState("黑色");
  const [state, setState] = useState<GarmentState>("ready");
  const [photo, setPhoto] = useState("");
  const [material, setMaterial] = useState("不知道");
  const [thickness, setThickness] = useState("不知道");
  const [size, setSize] = useState("");
  const [careNotes, setCareNotes] = useState("");
  const [labelText, setLabelText] = useState("");
  const [careLabelPhoto, setCareLabelPhoto] = useState("");
  const [hangtagPhoto, setHangtagPhoto] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [totalCount, setTotalCount] = useState(3);
  const [cleanCount, setCleanCount] = useState(3);
  const [message, setMessage] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelProgress, setLabelProgress] = useState(0);
  const [lastAdded, setLastAdded] = useState<Garment | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const progress = readiness(data.garments);
  const suggestedCategory = nextUsefulCategory(data.garments);

  function changeCategory(next: Category) {
    setCategory(next);
    setSubtype(subtypeOptions[next][0]);
  }

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLastAdded(null);
    setPhotoBusy(true);
    setMessage("");
    try {
      setPhoto(await compressImage(file));
    } catch {
      setMessage("这张照片没有读取成功，请重新拍摄或换一张。 ");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function pickLabelPhoto(event: ChangeEvent<HTMLInputElement>, kind: "care" | "hangtag") {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    try {
      const image = await compressImage(file, 1200, 0.72);
      if (kind === "care") setCareLabelPhoto(image);
      else setHangtagPhoto(image);
    } catch {
      setMessage("这张标签照片没有读取成功，请重新拍摄或换一张。 ");
    }
  }

  async function readLabels() {
    const images = [careLabelPhoto, hangtagPhoto].filter(Boolean);
    if (images.length === 0) return;
    setLabelBusy(true);
    setLabelProgress(0);
    setMessage("第一次读取标签会多等一会儿，文字会留在这台设备上处理。 ");
    try {
      const text = await recognizeLabels(images, setLabelProgress);
      const details = readLabelDetails(text);
      setLabelText(text.trim());
      if (details.material) setMaterial(details.material);
      if (details.size) setSize(details.size);
      if (details.careNotes) setCareNotes(details.careNotes);
      setMessage(
        details.material || details.size || details.careNotes
          ? "标签读好了。请检查下面的信息，不准确的地方可以直接改。"
          : "照片已保留，但没有读出可靠信息。你可以在下面手动补充。",
      );
    } catch {
      setMessage("标签文字没有读取成功，照片已经保留。你可以直接在下面补充信息。 ");
    } finally {
      setLabelBusy(false);
      setLabelProgress(0);
    }
  }

  function toggleScene(value: Scene) {
    setScenes((previous) =>
      previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value],
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!photo) {
      setMessage(category === "socks" ? "请拍一张这组袜子的照片，不需要逐双拍。 " : "请先拍照或从相册选择一张照片。 ");
      return;
    }
    if (category === "socks" && (totalCount < 1 || cleanCount < 0 || cleanCount > totalCount)) {
      setMessage("袜子数量需要确认：干净数量不能超过总数量。 ");
      return;
    }
    const garment: Garment = {
      id: crypto.randomUUID(),
      category,
      subtype,
      color,
      state,
      photo,
      material,
      thickness,
      size,
      careNotes,
      labelText,
      careLabelPhoto,
      hangtagPhoto,
      scenes,
      totalCount: category === "socks" ? totalCount : undefined,
      cleanCount: category === "socks" ? cleanCount : undefined,
      createdAt: new Date().toISOString(),
    };
    const nextGarments = [...data.garments, garment];
    setData((previous) => ({ ...previous, garments: nextGarments }));
    setLastAdded(garment);
    setPhoto("");
    if (photoInputRef.current) photoInputRef.current.value = "";
    setCareLabelPhoto("");
    setHangtagPhoto("");
    setLabelText("");
    setSize("");
    setCareNotes("");
    setMessage(`${color}${subtype}已经放进衣橱。`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function continueSameKind() {
    setLastAdded(null);
    setMessage("照片拍好后，刚才选过的信息会继续保留。 ");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => photoInputRef.current?.click(), 350);
  }

  function changeToSuggestedKind() {
    const next = nextUsefulCategory(data.garments);
    changeCategory(next);
    setLastAdded(null);
    setMessage(`接下来可以加${categoryLabels[next]}，其他信息按这件衣服重新选。`);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="form-shell">
      <header className="simple-header">
        <button className="text-button" type="button" onClick={() => navigate("/start")}>返回</button>
        <div>
          <p>我的衣橱</p>
          <strong>{data.garments.length} 件 / 组</strong>
        </div>
        <button className="text-button" type="button" onClick={() => navigate("/today")}>看推荐</button>
      </header>

      <section className="form-content">
        <div className="entry-intro">
          <h1>先加最近常穿的</h1>
          <p>不用一次整理完整个衣柜。相似的衣服可以连续拍，刚选过的信息会保留。</p>
        </div>
        <div className="progress-copy">
          <p>{progress.completed.length === 4 ? "已经可以开始搭配" : `第一套还差 ${4 - progress.completed.length} 样`}</p>
          <strong>{progress.completed.length} / 4</strong>
        </div>
        <div className="progress-track"><span style={{ width: `${progress.completed.length * 25}%` }} /></div>
        <div className="category-progress">
          {(["top", "bottom", "shoes", "socks"] as Category[]).map((item) => (
            <span className={progress.completed.includes(item) ? "done" : ""} key={item}>
              {progress.completed.includes(item) ? "✓" : "○"} {categoryLabels[item]}
            </span>
          ))}
        </div>

        <form className="garment-form" onSubmit={submit} ref={formRef}>
          <label className={`photo-picker ${photo ? "has-photo" : ""}`}>
            {photo ? <img src={photo} alt="准备添加的衣服" /> : <div><b>＋</b><span>{photoBusy ? "正在处理照片…" : "拍照或从相册选择"}</span><small>平铺或挂起来拍，更容易看清颜色</small></div>}
            <input ref={photoInputRef} type="file" accept="image/*" onChange={pickPhoto} />
          </label>

          <div className="field-group">
            <label htmlFor="category">这是什么</label>
            <div className="segmented-grid" id="category">
              {(Object.keys(categoryLabels) as Category[]).map((item) => (
                <button className={category === item ? "selected" : ""} type="button" key={item} onClick={() => changeCategory(item)}>
                  {categoryLabels[item]}
                </button>
              ))}
            </div>
          </div>

          <div className="two-fields">
            <label>具体类别
              <select value={subtype} onChange={(event) => setSubtype(event.target.value)}>
                {subtypeOptions[category].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>主颜色
              <select value={color} onChange={(event) => setColor(event.target.value)}>
                {["黑色", "白色", "灰色", "藏青", "蓝色", "卡其", "棕色", "绿色", "红色", "其他"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <div className="field-group">
            <p className="field-label">现在能穿吗</p>
            <div className="state-grid">
              {([
                ["ready", "可以穿"], ["laundry", "要洗了"], ["paused", "先收起来"],
              ] as [GarmentState, string][]).map(([value, label]) => (
                <button className={state === value ? "selected" : ""} type="button" key={value} onClick={() => setState(value)}>{label}</button>
              ))}
            </div>
          </div>

          {category === "socks" && (
            <div className="sock-counts">
              <label>这组共有
                <input type="number" min="1" value={totalCount} onChange={(event) => setTotalCount(Number(event.target.value))} />
              </label>
              <label>现在干净
                <input type="number" min="0" max={totalCount} value={cleanCount} onChange={(event) => setCleanCount(Number(event.target.value))} />
              </label>
            </div>
          )}

          <details className="optional-fields">
            <summary>多告诉我一点，搭配会更贴近你 <span>选填</span></summary>
            <div className="label-section">
              <div className="label-section-heading">
                <strong>衣服标签</strong>
                <span>上传一张或两张都可以</span>
              </div>
              <div className="label-upload-grid">
                <label className={careLabelPhoto ? "has-label-photo" : ""}>
                  {careLabelPhoto ? <img src={careLabelPhoto} alt="水洗标" /> : <><b>＋</b><span>水洗标</span><small>材质和洗护说明</small></>}
                  <input type="file" accept="image/*" capture="environment" onChange={(event) => void pickLabelPhoto(event, "care")} />
                </label>
                <label className={hangtagPhoto ? "has-label-photo" : ""}>
                  {hangtagPhoto ? <img src={hangtagPhoto} alt="购买吊牌" /> : <><b>＋</b><span>购买吊牌</span><small>尺码和商品信息</small></>}
                  <input type="file" accept="image/*" capture="environment" onChange={(event) => void pickLabelPhoto(event, "hangtag")} />
                </label>
              </div>
              {(careLabelPhoto || hangtagPhoto) && (
                <button className="label-read-button" type="button" onClick={() => void readLabels()} disabled={labelBusy}>
                  {labelBusy ? `正在读取 ${Math.round(labelProgress * 100)}%` : "读取标签信息"}
                </button>
              )}
            </div>
            <div className="two-fields">
              <label>材质
                <select value={material} onChange={(event) => setMaterial(event.target.value)}>
                  {["不知道", "棉", "亚麻", "羊毛", "牛仔", "聚酯纤维", "皮革", "混纺"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>尺码
                <input value={size} onChange={(event) => setSize(event.target.value)} placeholder="例如：L" />
              </label>
            </div>
            <div className="two-fields">
              <label>厚薄
                <select value={thickness} onChange={(event) => setThickness(event.target.value)}>
                  {["不知道", "薄", "适中", "厚"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>洗护提醒
                <input value={careNotes} onChange={(event) => setCareNotes(event.target.value)} placeholder="例如：不可烘干" />
              </label>
            </div>
            {labelText && <p className="label-read-note">已经读过标签文字；上面的内容以你最后确认的为准。</p>}
            <p className="field-label scene-field-label">更适合哪些场景</p>
            <div className="scene-checks">
              {(Object.keys(sceneLabels) as Scene[]).map((item) => (
                <label key={item}><input type="checkbox" checked={scenes.includes(item)} onChange={() => toggleScene(item)} />{sceneLabels[item]}</label>
              ))}
            </div>
          </details>

          {message && <p className="form-message" role="status">{message}</p>}
          {lastAdded ? (
            <section className="continue-entry-card" aria-live="polite">
              <div className="continue-entry-photo"><img src={lastAdded.photo} alt={`${lastAdded.color}${lastAdded.subtype}`} /></div>
              <div>
                <p>{progress.ready ? "已经够一套了" : `下一件先加${categoryLabels[suggestedCategory]}`}</p>
                <h2>{progress.ready ? "现在就能看今天怎么穿" : "再添一件，就更接近第一套"}</h2>
              </div>
              <div className="continue-entry-actions">
                <button className="secondary-button" type="button" onClick={continueSameKind}>继续拍同类</button>
                {progress.ready ? (
                  <button className="primary-button" type="button" onClick={() => navigate("/today")}>看今天穿什么</button>
                ) : (
                  <button className="primary-button" type="button" onClick={changeToSuggestedKind}>换成{categoryLabels[suggestedCategory]}</button>
                )}
              </div>
            </section>
          ) : (
            <button className="primary-button full" type="submit" disabled={photoBusy || labelBusy}>放进我的衣橱</button>
          )}
        </form>
      </section>
    </main>
  );
}

function ReadyScreen({ garments }: { garments: Garment[] }) {
  const counts = (category: Category) => garments.filter((item) => item.category === category && item.state === "ready").length;
  return (
    <main className="weather-shell ready-shell">
      <div className="ambient ambient-one" />
      <section className="ready-content glass-panel">
        <div className="ready-check">✓</div>
        <p className="eyebrow">可以开始搭了</p>
        <h1>你的第一套准备好了</h1>
        <p className="ready-lead">不用一次把整个衣柜都搬进来。先看看今天怎么穿，其他衣服以后慢慢添加。</p>
        <div className="ready-categories">
          {(["top", "bottom", "shoes", "socks"] as Category[]).map((category) => (
            <div key={category}><span>✓</span><p>{categoryLabels[category]}</p><strong>{counts(category)}</strong></div>
          ))}
        </div>
        <div className="honest-note">
          衣服越多，遇到不同天气和场合时，能换的搭法也会更多。
        </div>
        <button className="primary-button full" type="button" onClick={() => navigate("/today")}>看看今天穿什么</button>
        <button className="secondary-button full" type="button" onClick={() => navigate("/wardrobe/add")}>再添几件衣服</button>
      </section>
    </main>
  );
}

function BottomNav({ current }: { current: "today" | "laundry" | "wardrobe" | "purchase" | "add" }) {
  const items: { key: typeof current; label: string; path: string }[] = [
    { key: "today", label: "今天", path: "/today" },
    { key: "laundry", label: "脏衣篓", path: "/wardrobe/laundry" },
    { key: "wardrobe", label: "衣橱", path: "/wardrobe" },
    { key: "purchase", label: "想买", path: "/purchase" },
    { key: "add", label: "添加", path: "/wardrobe/add" },
  ];
  return (
    <nav className="bottom-nav" aria-label="主要页面">
      {items.map((item) => (
        <button
          className={current === item.key ? "selected" : ""}
          type="button"
          key={item.key}
          onClick={() => navigate(item.path)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function TodayScreen({
  data,
  scene,
  setScene,
  weather,
  weatherStatus,
  setWeather,
  outfit,
  notice,
  swapOne,
  rejectOutfit,
  confirmWear,
  worn,
}: {
  data: WardrobeData;
  scene: Scene;
  setScene: (scene: Scene) => void;
  weather: Weather | null;
  weatherStatus: "idle" | "loading" | "failed";
  setWeather: (weather: Weather) => void;
  outfit: Outfit | null;
  notice: string;
  swapOne: () => void;
  rejectOutfit: (reason: FeedbackReason) => void;
  confirmWear: () => void;
  worn: boolean;
}) {
  const [manualTemp, setManualTemp] = useState("22");
  const [manualCondition, setManualCondition] = useState("1");
  const [scenePickerOpen, setScenePickerOpen] = useState(false);
  const [feedbackPickerOpen, setFeedbackPickerOpen] = useState(false);
  const sceneCloseRef = useRef<HTMLButtonElement>(null);
  const feedbackCloseRef = useRef<HTMLButtonElement>(null);
  const today = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date());

  useEffect(() => {
    if (!scenePickerOpen) return;
    sceneCloseRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setScenePickerOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [scenePickerOpen]);

  useEffect(() => {
    if (!feedbackPickerOpen) return;
    feedbackCloseRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setFeedbackPickerOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [feedbackPickerOpen]);

  function chooseScene(next: Scene) {
    setScene(next);
    setScenePickerOpen(false);
  }

  if (!data.profile) {
    return (
      <main className="weather-shell empty-shell">
        <section className="glass-panel empty-panel">
          <h1>你今天从哪里出门？</h1>
          <p>告诉我城市，我才能按今天的温度帮你挑衣服。</p>
          <button className="primary-button full" type="button" onClick={() => navigate("/start")}>选择城市</button>
        </section>
      </main>
    );
  }

  return (
    <main className="today-shell">
      <section className="weather-hero">
        <div className="hero-topline"><span>{today}</span><button type="button" onClick={() => navigate("/start")}>{data.profile.city} · 修改</button></div>
        {weather ? (
          <div className="weather-main">
            <div><span className="weather-symbol">{weatherMark(weather.code)}</span><strong>{Math.round(weather.temperature)}°</strong></div>
            <p>{weatherDescription(weather.code)} · 体感 {Math.round(weather.apparentTemperature)}°</p>
            <small>{weather.rainProbability >= 35 ? `今天最高降雨概率 ${weather.rainProbability}%，出门记得看一眼雨具。` : "今天降雨概率不高，按当前温度搭配即可。"}</small>
          </div>
        ) : weatherStatus === "failed" ? (
          <form className="manual-weather glass-panel" onSubmit={(event) => {
            event.preventDefault();
            setWeather({ temperature: Number(manualTemp), apparentTemperature: Number(manualTemp), code: Number(manualCondition), rainProbability: 0, source: "manual" });
          }}>
            <p>天气没有读取成功，请补充今天的大致情况。</p>
            <div><label>温度<input type="number" value={manualTemp} onChange={(event) => setManualTemp(event.target.value)} /></label><label>天气<select value={manualCondition} onChange={(event) => setManualCondition(event.target.value)}><option value="0">晴朗</option><option value="1">多云</option><option value="61">有雨</option><option value="71">有雪</option></select></label></div>
            <button className="secondary-button" type="submit">继续推荐</button>
          </form>
        ) : (
          <div className="weather-loading" aria-live="polite"><span />正在读取今天的天气…</div>
        )}
      </section>

      <section className="today-content">
        <div className="scene-picker-bar">
          <div className="scene-strip" aria-label="最近使用的场景">
            {data.recentScenes.slice(0, 3).map((item) => (
              <button className={scene === item ? "selected" : ""} type="button" key={item} onClick={() => chooseScene(item)}>{sceneLabels[item]}</button>
            ))}
          </div>
          <button className="all-scenes-button" type="button" onClick={() => setScenePickerOpen(true)} aria-haspopup="dialog">
            <span>全部场景</span><b aria-hidden="true">＋</b>
          </button>
        </div>
        {notice && <p className="inline-notice today-notice scene-change-notice" role="status">{notice}</p>}

        {worn ? (
          <section className="success-panel glass-panel">
            <div className="ready-check">✓</div>
            <h1>今天就穿这套</h1>
            <p>穿完以后，把每件衣服放回衣架或脏衣篓。你也可以先关掉，下次打开时再整理。</p>
            <button className="secondary-button full" type="button" onClick={() => navigate("/wear/status")}>现在整理衣服</button>
          </section>
        ) : outfit?.missing.length ? (
          <section className="missing-panel glass-panel">
            <p className="eyebrow">还差一件就能出门</p>
            <h1>衣橱里还没有能穿的{outfit.missing.join("、")}</h1>
            <p>添上以后，我就能把今天这一整套搭出来。</p>
            <button className="primary-button full" type="button" onClick={() => navigate("/wardrobe/add")}>去添加衣服</button>
          </section>
        ) : outfit && outfit.items.length > 0 ? (
          <>
            <div className="recommend-title"><div><p>今天建议穿这套</p><h1>{sceneLabels[scene]}</h1></div><span>首选</span></div>
            <div className={`outfit-grid items-${outfit.items.length}`}>
              {outfit.items.map((item) => (
                <figure className="garment-card" key={item.id}>
                  <img src={item.photo} alt={`${item.color}${item.subtype}`} />
                  <figcaption><span>{categoryLabels[item.category]}</span><strong>{item.color}{item.subtype}</strong>{item.category === "socks" && <small>干净 {item.cleanCount} / {item.totalCount}</small>}</figcaption>
                </figure>
              ))}
            </div>

            <section className="why-panel glass-panel">
              <h2>为什么这样穿</h2>
              <div><span>场合</span><p>{outfit.reasons[0]}</p></div>
              <div><span>天气</span><p>{outfit.reasons[1]}</p></div>
              <div><span>搭配</span><p>{outfit.reasons[2]}</p></div>
            </section>
            {outfit.limitation && <p className="limitation"><b>有一件事要提醒你</b>{outfit.limitation}</p>}
            <div className="today-actions">
              <button className="secondary-button" type="button" onClick={swapOne}>换一件</button>
              <button className="primary-button" type="button" onClick={confirmWear}>今天穿这套</button>
            </div>
            <button className="feedback-trigger" type="button" onClick={() => setFeedbackPickerOpen(true)}>这套不合适</button>
          </>
        ) : null}

        <BottomNav current="today" />
      </section>

      {scenePickerOpen && (
        <div className="scene-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setScenePickerOpen(false);
        }}>
          <section className="scene-sheet" role="dialog" aria-modal="true" aria-labelledby="scene-sheet-title">
            <header>
              <div>
                <p>今天准备做什么？</p>
                <h2 id="scene-sheet-title">换一个场景</h2>
              </div>
              <button ref={sceneCloseRef} type="button" onClick={() => setScenePickerOpen(false)} aria-label="关闭场景选择">×</button>
            </header>
            <div className="scene-library">
              {allScenes.map((item) => (
                <button className={scene === item ? "selected" : ""} type="button" key={item} onClick={() => chooseScene(item)}>
                  <span><strong>{sceneLabels[item]}</strong><small>{sceneDescriptions[item]}</small></span>
                  <b aria-hidden="true">{scene === item ? "✓" : "›"}</b>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {feedbackPickerOpen && (
        <div className="scene-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setFeedbackPickerOpen(false);
        }}>
          <section className="scene-sheet feedback-sheet" role="dialog" aria-modal="true" aria-labelledby="feedback-sheet-title">
            <header>
              <div>
                <p>说一项就够了</p>
                <h2 id="feedback-sheet-title">哪一点不合适？</h2>
              </div>
              <button ref={feedbackCloseRef} type="button" onClick={() => setFeedbackPickerOpen(false)} aria-label="关闭评价">×</button>
            </header>
            <div className="feedback-reasons">
              {([
                ["color", "颜色不喜欢"],
                ["formal", "太正式"],
                ["casual", "太休闲"],
                ["hot", "今天太热"],
                ["comfort", "穿着不舒服"],
                ["other", "其他"],
              ] as [FeedbackReason, string][]).map(([reason, label]) => (
                <button type="button" key={reason} onClick={() => {
                  rejectOutfit(reason);
                  setFeedbackPickerOpen(false);
                }}>{label}</button>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function WearStatusScreen({
  data,
  record,
  setData,
}: {
  data: WardrobeData;
  record: WearRecord;
  setData: React.Dispatch<React.SetStateAction<WardrobeData>>;
}) {
  type SortLocation = "tray" | WearPlacement;
  const wornItems = useMemo(
    () =>
      record.garmentIds
        .map((id) => data.garments.find((item) => item.id === id))
        .filter((item): item is Garment => Boolean(item)),
    [data.garments, record.garmentIds],
  );
  const [placements, setPlacements] = useState<Record<string, SortLocation>>(() =>
    Object.fromEntries(wornItems.map((item) => [item.id, "tray"])),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dropTarget, setDropTarget] = useState<WearPlacement | null>(null);
  const pointerStart = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const remaining = wornItems.filter((item) => placements[item.id] === "tray").length;

  function itemsAt(location: SortLocation) {
    return wornItems.filter((item) => placements[item.id] === location);
  }

  function placeItem(id: string, location: WearPlacement) {
    setPlacements((previous) => ({ ...previous, [id]: location }));
    setSelectedId(null);
    setDraggingId(null);
    setDragOffset({ x: 0, y: 0 });
    setDropTarget(null);
  }

  function detectDropTarget(clientX: number, clientY: number): WearPlacement | null {
    const zones = document.querySelectorAll<HTMLElement>("[data-drop-zone]");
    for (const zone of zones) {
      const rect = zone.getBoundingClientRect();
      if (
        clientX >= rect.left
        && clientX <= rect.right
        && clientY >= rect.top
        && clientY <= rect.bottom
      ) {
        return zone.dataset.dropZone as WearPlacement;
      }
    }
    return null;
  }

  function startTouchDrag(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStart.current = { id, x: event.clientX, y: event.clientY, moved: false };
  }

  function moveTouchDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = pointerStart.current;
    if (!start) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (!start.moved && Math.abs(x) + Math.abs(y) < 8) return;
    start.moved = true;
    setDraggingId(start.id);
    setDragOffset({ x, y });
    setDropTarget(detectDropTarget(event.clientX, event.clientY));
  }

  function endTouchDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const target = start.moved ? detectDropTarget(event.clientX, event.clientY) : null;
    if (target) {
      suppressClick.current = true;
      placeItem(start.id, target);
      return;
    }
    setDraggingId(null);
    setDragOffset({ x: 0, y: 0 });
    setDropTarget(null);
    if (!start.moved) setSelectedId((current) => current === start.id ? null : start.id);
  }

  function handleNativeDrop(event: React.DragEvent<HTMLElement>, location: WearPlacement) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    if (id && placements[id]) placeItem(id, location);
  }

  function confirmSorting() {
    if (remaining > 0) return;
    const finalized = Object.fromEntries(
      Object.entries(placements).map(([id, location]) => [id, location as WearPlacement]),
    );
    setData((previous) => applyWearPlacements(previous, record.id, finalized));
    navigate("/today");
  }

  function renderGarmentButton(item: Garment) {
    const isDragging = draggingId === item.id;
    return (
      <button
        key={item.id}
        className={`sort-garment ${selectedId === item.id ? "selected" : ""} ${isDragging ? "dragging" : ""}`}
        type="button"
        draggable
        style={isDragging ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` } : undefined}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          setSelectedId((current) => current === item.id ? null : item.id);
        }}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", item.id);
          setDraggingId(item.id);
        }}
        onDragEnd={() => {
          setDraggingId(null);
          setDropTarget(null);
        }}
        onPointerDown={(event) => startTouchDrag(event, item.id)}
        onPointerMove={moveTouchDrag}
        onPointerUp={endTouchDrag}
        aria-label={`${item.color}${item.subtype}，拖动或点击选择`}
      >
        <img src={item.photo} alt="" />
        <span>{item.color}{item.subtype}</span>
      </button>
    );
  }

  return (
    <main className="weather-shell sorting-shell">
      <section className="sorting-content">
        <p className="eyebrow">穿后整理</p>
        <h1>这套穿完了，整理一下</h1>
        <p className="sorting-intro">拖到衣架或脏衣篓。点一下衣服，也可以直接选择。</p>

        <section className="sort-tray glass-panel">
          <header>
            <h2>刚刚穿过</h2>
            <span>{remaining > 0 ? `${remaining} 件待整理` : "都整理好了"}</span>
          </header>
          <div className="sort-items">
            {itemsAt("tray").map(renderGarmentButton)}
            {itemsAt("tray").length === 0 && <p className="sort-empty">下面两边确认无误后，就可以完成整理。</p>}
          </div>
        </section>

        <div className="drop-zone-grid">
          <section
            className={`drop-zone glass-panel ${dropTarget === "hanger" ? "drag-over" : ""}`}
            data-drop-zone="hanger"
            onDragOver={(event) => {
              event.preventDefault();
              setDropTarget("hanger");
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(event) => handleNativeDrop(event, "hanger")}
          >
            <header><h2>衣架</h2><span>还能穿</span></header>
            <div className="drop-items">
              {itemsAt("hanger").map(renderGarmentButton)}
              {itemsAt("hanger").length === 0 && <p>明天还能推荐</p>}
            </div>
          </section>

          <section
            className={`drop-zone glass-panel ${dropTarget === "laundry" ? "drag-over" : ""}`}
            data-drop-zone="laundry"
            onDragOver={(event) => {
              event.preventDefault();
              setDropTarget("laundry");
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(event) => handleNativeDrop(event, "laundry")}
          >
            <header><h2>脏衣篓</h2><span>要洗了</span></header>
            <div className="drop-items">
              {itemsAt("laundry").map(renderGarmentButton)}
              {itemsAt("laundry").length === 0 && <p>洗好前不再推荐</p>}
            </div>
          </section>
        </div>

        {selectedId && (
          <div className="sort-tap-actions" aria-label="选择衣服去向">
            <button type="button" onClick={() => placeItem(selectedId, "hanger")}>挂回衣架</button>
            <button type="button" onClick={() => placeItem(selectedId, "laundry")}>放进脏衣篓</button>
          </div>
        )}

        <button
          className="primary-button full sorting-confirm"
          type="button"
          disabled={remaining > 0}
          onClick={confirmSorting}
        >
          {remaining > 0 ? `还有 ${remaining} 件没整理` : "确认整理"}
        </button>
      </section>
    </main>
  );
}

function PurchaseScreen({
  data,
  setData,
}: {
  data: WardrobeData;
  setData: React.Dispatch<React.SetStateAction<WardrobeData>>;
}) {
  const [category, setCategory] = useState<Category>("top");
  const [subtype, setSubtype] = useState(subtypeOptions.top[0]);
  const [color, setColor] = useState("黑色");
  const [photo, setPhoto] = useState("");
  const [material, setMaterial] = useState("不知道");
  const [thickness, setThickness] = useState("不知道");
  const [size, setSize] = useState("");
  const [careNotes, setCareNotes] = useState("");
  const [labelText, setLabelText] = useState("");
  const [careLabelPhoto, setCareLabelPhoto] = useState("");
  const [hangtagPhoto, setHangtagPhoto] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [message, setMessage] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelProgress, setLabelProgress] = useState(0);
  const [result, setResult] = useState<{ candidate: Garment; analysis: PurchaseAnalysis } | null>(null);
  const [added, setAdded] = useState(false);

  function resetPurchaseResult() {
    setResult(null);
    setAdded(false);
  }

  function changeCategory(next: Category) {
    resetPurchaseResult();
    setCategory(next);
    setSubtype(subtypeOptions[next][0]);
  }

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    resetPurchaseResult();
    setPhotoBusy(true);
    setMessage("");
    try {
      setPhoto(await compressImage(file));
    } catch {
      setMessage("这张照片没有读取成功，请换一张再试。 ");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function pickLabelPhoto(event: ChangeEvent<HTMLInputElement>, kind: "care" | "hangtag") {
    const file = event.target.files?.[0];
    if (!file) return;
    resetPurchaseResult();
    try {
      const image = await compressImage(file, 1200, 0.72);
      if (kind === "care") setCareLabelPhoto(image);
      else setHangtagPhoto(image);
    } catch {
      setMessage("这张标签照片没有读取成功，请换一张再试。 ");
    }
  }

  async function readLabels() {
    const images = [careLabelPhoto, hangtagPhoto].filter(Boolean);
    if (images.length === 0) return;
    setLabelBusy(true);
    setLabelProgress(0);
    setMessage("正在读取标签，第一次会多等一会儿…");
    try {
      const text = await recognizeLabels(images, setLabelProgress);
      const details = readLabelDetails(text);
      setLabelText(text.trim());
      if (details.material) setMaterial(details.material);
      if (details.size) setSize(details.size);
      if (details.careNotes) setCareNotes(details.careNotes);
      setMessage("标签读好了，请检查并修改不准确的地方。 ");
    } catch {
      setMessage("标签文字没有读取成功，照片已经保留。 ");
    } finally {
      setLabelBusy(false);
      setLabelProgress(0);
    }
  }

  function toggleScene(value: Scene) {
    resetPurchaseResult();
    setScenes((previous) =>
      previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value],
    );
  }

  function inspectPurchase(event: FormEvent) {
    event.preventDefault();
    if (!photo) {
      setMessage("请先拍下商品，或从相册选择商品截图。 ");
      return;
    }
    const candidate: Garment = {
      id: "purchase-preview",
      category,
      subtype,
      color,
      state: "ready",
      photo,
      material,
      thickness,
      size,
      careNotes,
      labelText,
      careLabelPhoto,
      hangtagPhoto,
      scenes,
      totalCount: category === "socks" ? 1 : undefined,
      cleanCount: category === "socks" ? 1 : undefined,
      createdAt: new Date().toISOString(),
    };
    setResult({ candidate, analysis: analyzePurchase(candidate, data.garments) });
    setMessage("");
    window.setTimeout(() => document.querySelector(".purchase-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function addPurchasedItem() {
    if (!result) return;
    const garment: Garment = {
      ...result.candidate,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    setData((previous) => ({ ...previous, garments: [...previous.garments, garment] }));
    setAdded(true);
  }

  return (
    <main className="collection-shell purchase-shell">
      <header className="collection-header purchase-header">
        <div>
          <p>买之前先问衣橱</p>
          <h1>想买</h1>
        </div>
        <button type="button" onClick={() => navigate("/wardrobe")}>看衣橱</button>
      </header>

      <section className="collection-content purchase-content">
        <div className="purchase-intro">
          <span>先别急着下单</span>
          <h2>看看它能不能融进衣橱</h2>
          <p>拍张商品图，看看衣橱里有没有相近款，还能和哪些衣服搭。</p>
        </div>

        <form className="purchase-form" onSubmit={inspectPurchase}>
          <label className={`purchase-photo ${photo ? "has-photo" : ""}`}>
            {photo ? <img src={photo} alt="准备判断的商品" /> : <div><b>＋</b><strong>{photoBusy ? "正在处理照片…" : "拍商品或选择截图"}</strong><small>网店截图、试衣照都可以</small></div>}
            <input type="file" accept="image/*" onChange={pickPhoto} />
          </label>

          <div className="field-group">
            <p className="field-label">这是什么</p>
            <div className="segmented-grid">
              {(Object.keys(categoryLabels) as Category[]).map((item) => (
                <button className={category === item ? "selected" : ""} type="button" key={item} onClick={() => changeCategory(item)}>{categoryLabels[item]}</button>
              ))}
            </div>
          </div>
          <div className="two-fields">
            <label>具体类别
              <select value={subtype} onChange={(event) => { resetPurchaseResult(); setSubtype(event.target.value); }}>
                {subtypeOptions[category].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>主颜色
              <select value={color} onChange={(event) => { resetPurchaseResult(); setColor(event.target.value); }}>
                {["黑色", "白色", "灰色", "藏青", "蓝色", "卡其", "棕色", "绿色", "红色", "其他"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <details className="optional-fields purchase-details">
            <summary>有标签或商品信息 <span>选填</span></summary>
            <div className="label-section">
              <div className="label-section-heading"><strong>商品标签</strong><span>一张或两张都可以</span></div>
              <div className="label-upload-grid">
                <label className={careLabelPhoto ? "has-label-photo" : ""}>
                  {careLabelPhoto ? <img src={careLabelPhoto} alt="水洗标" /> : <><b>＋</b><span>水洗标</span><small>材质和洗护说明</small></>}
                  <input type="file" accept="image/*" onChange={(event) => void pickLabelPhoto(event, "care")} />
                </label>
                <label className={hangtagPhoto ? "has-label-photo" : ""}>
                  {hangtagPhoto ? <img src={hangtagPhoto} alt="购买吊牌" /> : <><b>＋</b><span>购买吊牌</span><small>尺码和商品信息</small></>}
                  <input type="file" accept="image/*" onChange={(event) => void pickLabelPhoto(event, "hangtag")} />
                </label>
              </div>
              {(careLabelPhoto || hangtagPhoto) && (
                <button className="label-read-button" type="button" onClick={() => void readLabels()} disabled={labelBusy}>
                  {labelBusy ? `正在读取 ${Math.round(labelProgress * 100)}%` : "读取标签信息"}
                </button>
              )}
            </div>
            <div className="two-fields">
              <label>材质
                <select value={material} onChange={(event) => { resetPurchaseResult(); setMaterial(event.target.value); }}>
                  {["不知道", "棉", "亚麻", "羊毛", "牛仔", "聚酯纤维", "皮革", "混纺"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>厚薄
                <select value={thickness} onChange={(event) => { resetPurchaseResult(); setThickness(event.target.value); }}>
                  {["不知道", "薄", "适中", "厚"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            </div>
            <div className="two-fields">
              <label>尺码<input value={size} onChange={(event) => { resetPurchaseResult(); setSize(event.target.value); }} placeholder="例如：L" /></label>
              <label>洗护提醒<input value={careNotes} onChange={(event) => { resetPurchaseResult(); setCareNotes(event.target.value); }} placeholder="例如：不可烘干" /></label>
            </div>
            <p className="field-label scene-field-label">你打算什么时候穿</p>
            <div className="scene-checks">
              {allScenes.map((item) => (
                <label key={item}><input type="checkbox" checked={scenes.includes(item)} onChange={() => toggleScene(item)} />{sceneLabels[item]}</label>
              ))}
            </div>
          </details>
          {message && <p className="form-message" role="status">{message}</p>}
          <button className="primary-button full purchase-submit" type="submit" disabled={photoBusy || labelBusy}>看看能不能搭</button>
        </form>

        {result && (
          <section className={`purchase-result verdict-${result.analysis.verdict}`} aria-live="polite">
            <header>
              <span>{result.analysis.verdict === "preview" ? "先试着搭" : "衣橱给的建议"}</span>
              <h2>{result.analysis.title}</h2>
              <p>{result.analysis.summary}</p>
            </header>

            <div className="purchase-facts">
              <div><strong>{result.analysis.similar.length}</strong><span>件相近款</span></div>
              <div><strong>{result.analysis.matchSets.length}</strong><span>套现成搭法</span></div>
            </div>

            {result.analysis.similar.length > 0 && (
              <div className="purchase-section">
                <h3>衣橱里已经有点像的</h3>
                <div className="purchase-photo-row">
                  {result.analysis.similar.slice(0, 4).map((item) => (
                    <figure key={item.id}><img src={item.photo} alt={`${item.color}${item.subtype}`} /><figcaption>{item.color}{item.subtype}</figcaption></figure>
                  ))}
                </div>
              </div>
            )}

            {result.analysis.matchSets.length > 0 ? (
              <div className="purchase-section">
                <h3>可以先这样搭</h3>
                <div className="purchase-match-list">
                  {result.analysis.matchSets.map((items, index) => (
                    <article key={items.map((item) => item.id).join("-")}>
                      <span>穿法 {index + 1}</span>
                      <div>
                        <figure><img src={result.candidate.photo} alt={`${result.candidate.color}${result.candidate.subtype}`} /><figcaption>想买的</figcaption></figure>
                        {items.map((item) => <figure key={item.id}><img src={item.photo} alt={`${item.color}${item.subtype}`} /><figcaption>{item.color}{item.subtype}</figcaption></figure>)}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <p className="purchase-gap">现在还缺能接住它的{result.analysis.missing.map((item) => categoryLabels[item]).join("、")}，暂时搭不出完整的一套。</p>
            )}

            <p className="purchase-boundary">下单前，记得再确认尺码、上身效果和价格。</p>
            {added ? (
              <div className="purchase-added">
                <strong>已经放进衣橱</strong>
                <button className="secondary-button" type="button" onClick={() => navigate("/wardrobe")}>去衣橱看看</button>
              </div>
            ) : (
              <button className="secondary-button full" type="button" onClick={addPurchasedItem}>买了，放进衣橱</button>
            )}
          </section>
        )}
      </section>
      <BottomNav current="purchase" />
    </main>
  );
}

function LaundryScreen({
  data,
  setData,
}: {
  data: WardrobeData;
  setData: React.Dispatch<React.SetStateAction<WardrobeData>>;
}) {
  const laundryItems = data.garments.filter(
    (item) => garmentLocation(item) === "laundry" || dirtySockCount(item) > 0,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  function toggle(id: string) {
    setSelectedIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    );
  }

  function restoreSelected() {
    if (selectedIds.length === 0) return;
    setData((previous) => restoreCleanGarments(previous, selectedIds));
    setMessage(`${selectedIds.length} 件衣物已经回到衣架。`);
    setSelectedIds([]);
  }

  return (
    <main className="collection-shell">
      <header className="collection-header">
        <div>
          <p>洗好再回来</p>
          <h1>脏衣篓</h1>
        </div>
        <button type="button" onClick={() => navigate("/today")}>看今天</button>
      </header>

      <section className="collection-content">
        {laundryItems.length === 0 ? (
          <div className="empty-collection glass-panel">
            <div>✓</div>
            <h2>脏衣篓是空的</h2>
            <p>这里没有等待清洗的衣服。</p>
          </div>
        ) : (
          <>
            <p className="collection-lead">选中已经洗净并晾干的衣服，再把它们放回衣架。</p>
            <div className="laundry-list">
              {laundryItems.map((item) => (
                <label className="laundry-item" key={item.id}>
                  <img src={item.photo} alt="" />
                  <span>
                    <strong>{item.color}{item.subtype}</strong>
                    <small>
                      {item.category === "socks"
                        ? `${Math.max(1, dirtySockCount(item))} 双待洗`
                        : item.careNotes
                          ? `洗护：${item.careNotes}`
                          : "洗好前不会再选它"}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggle(item.id)}
                    aria-label={`选择${item.color}${item.subtype}`}
                  />
                </label>
              ))}
            </div>
            {message && <p className="collection-message" role="status">{message}</p>}
            <button
              className="primary-button full collection-action"
              type="button"
              disabled={selectedIds.length === 0}
              onClick={restoreSelected}
            >
              洗净并晾干，放回衣架
            </button>
          </>
        )}
      </section>
      <BottomNav current="laundry" />
    </main>
  );
}

function WardrobeScreen({
  data,
  setData,
}: {
  data: WardrobeData;
  setData: React.Dispatch<React.SetStateAction<WardrobeData>>;
}) {
  const categoryOrder: Category[] = ["top", "bottom", "outer", "shoes", "socks"];
  const firstWithItems = categoryOrder.find((category) => data.garments.some((item) => item.category === category));
  const [activeCategory, setActiveCategory] = useState<Category>(firstWithItems ?? "top");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailProgress, setDetailProgress] = useState(0);
  const [detailMessage, setDetailMessage] = useState("");
  const [draft, setDraft] = useState({
    photo: "",
    material: "不知道",
    thickness: "不知道",
    size: "",
    careNotes: "",
    labelText: "",
    careLabelPhoto: "",
    hangtagPhoto: "",
    scenes: [] as Scene[],
  });
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const selectedItem = data.garments.find((item) => item.id === selectedId) ?? null;
  const visibleItems = data.garments.filter((item) => item.category === activeCategory);

  function openGarment(item: Garment) {
    setDraft({
      photo: item.photo,
      material: item.material,
      thickness: item.thickness,
      size: item.size,
      careNotes: item.careNotes,
      labelText: item.labelText,
      careLabelPhoto: item.careLabelPhoto,
      hangtagPhoto: item.hangtagPhoto,
      scenes: item.scenes,
    });
    setDetailMessage("");
    setSelectedId(item.id);
    window.setTimeout(() => detailCloseRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (!selectedId) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedId]);

  function updateGarment(id: string, update: Partial<Garment>) {
    setData((previous) => ({
      ...previous,
      garments: previous.garments.map((item) => item.id === id ? { ...item, ...update } : item),
    }));
  }

  function moveToLaundry(item: Garment) {
    updateGarment(item.id, item.category === "socks" ? { cleanCount: 0, state: "laundry" } : { state: "laundry" });
  }

  function pause(item: Garment) {
    updateGarment(item.id, { state: "paused" });
  }

  function activate(item: Garment) {
    setData((previous) =>
      item.category === "socks"
        ? restoreCleanGarments(previous, [item.id])
        : {
            ...previous,
            garments: previous.garments.map((candidate) =>
              candidate.id === item.id ? { ...candidate, state: "ready" } : candidate,
            ),
          },
    );
  }

  function statusBadge(item: Garment) {
    const location = garmentLocation(item);
    if (location === "paused") return "已收起";
    if (item.category === "socks" && dirtySockCount(item) > 0 && (item.cleanCount ?? 0) > 0) {
      return `${dirtySockCount(item)} 双待洗`;
    }
    if (location === "laundry") return "脏衣篓";
    return "";
  }

  async function replaceDetailPhoto(event: ChangeEvent<HTMLInputElement>, key: "photo" | "careLabelPhoto" | "hangtagPhoto") {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const image = await compressImage(file, key === "photo" ? 900 : 1200, key === "photo" ? 0.78 : 0.72);
      setDraft((previous) => ({ ...previous, [key]: image }));
      setDetailMessage("新照片已经放好，保存后生效。 ");
    } catch {
      setDetailMessage("这张照片没有读取成功，请换一张再试。 ");
    }
  }

  async function rereadDetailLabels() {
    const images = [draft.careLabelPhoto, draft.hangtagPhoto].filter(Boolean);
    if (images.length === 0) return;
    setDetailBusy(true);
    setDetailProgress(0);
    setDetailMessage("正在重新读取标签…");
    try {
      const text = await recognizeLabels(images, setDetailProgress);
      const details = readLabelDetails(text);
      setDraft((previous) => ({
        ...previous,
        labelText: text.trim(),
        material: details.material || previous.material,
        size: details.size || previous.size,
        careNotes: details.careNotes || previous.careNotes,
      }));
      setDetailMessage("标签读好了，请检查并修改不准确的地方。 ");
    } catch {
      setDetailMessage("标签文字没有读取成功，原有信息没有改变。 ");
    } finally {
      setDetailBusy(false);
      setDetailProgress(0);
    }
  }

  function toggleDraftScene(scene: Scene) {
    setDraft((previous) => ({
      ...previous,
      scenes: previous.scenes.includes(scene)
        ? previous.scenes.filter((item) => item !== scene)
        : [...previous.scenes, scene],
    }));
  }

  function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!selectedItem) return;
    updateGarment(selectedItem.id, draft);
    setSelectedId(null);
  }

  return (
    <main className="collection-shell">
      <header className="collection-header">
        <div>
          <p>{data.garments.length} 件 / 组</p>
          <h1>我的衣橱</h1>
        </div>
        <button type="button" onClick={() => navigate("/wardrobe/add")}>添加衣物</button>
      </header>

      <section className="collection-content wardrobe-content">
        {data.garments.length === 0 ? (
          <div className="empty-collection glass-panel">
            <h2>衣橱还是空的</h2>
            <p>先添加上衣、下装、鞋和袜子，就能开始搭配。</p>
            <button className="primary-button full" type="button" onClick={() => navigate("/wardrobe/add")}>添加第一件衣服</button>
          </div>
        ) : (
          <div className="wardrobe-browser">
            <nav className="wardrobe-categories" aria-label="衣物分类">
              {categoryOrder.map((category) => {
                const count = data.garments.filter((item) => item.category === category).length;
                return (
                  <button
                    className={activeCategory === category ? "selected" : ""}
                    type="button"
                    key={category}
                    onClick={() => setActiveCategory(category)}
                  >
                    <span>{category === "socks" ? "袜子" : categoryLabels[category]}</span>
                    <small>{count}</small>
                  </button>
                );
              })}
            </nav>
            <div className="wardrobe-grid" aria-live="polite">
              {visibleItems.map((item) => {
                const badge = statusBadge(item);
                return (
                  <button
                    className="wardrobe-tile"
                    type="button"
                    key={item.id}
                    data-garment-category={item.category}
                    onClick={() => openGarment(item)}
                  >
                    <span className="wardrobe-photo">
                      <img src={item.photo} alt={`${item.color}${item.subtype}`} />
                      {badge && <b>{badge}</b>}
                    </span>
                    <strong>{item.color}{item.subtype}</strong>
                    {item.size && <small>{item.size}</small>}
                  </button>
                );
              })}
              {visibleItems.length === 0 && (
                <div className="empty-category">
                  <p>这里还没有{activeCategory === "socks" ? "袜子" : categoryLabels[activeCategory]}</p>
                  <button type="button" onClick={() => navigate("/wardrobe/add")}>添加一件</button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
      <BottomNav current="wardrobe" />

      {selectedItem && (
        <div className="detail-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedId(null);
        }}>
          <form className="garment-detail" role="dialog" aria-modal="true" aria-labelledby="garment-detail-title" onSubmit={saveDetails}>
            <header>
              <div>
                <p>{categoryLabels[selectedItem.category]}</p>
                <h2 id="garment-detail-title">{selectedItem.color}{selectedItem.subtype}</h2>
              </div>
              <button ref={detailCloseRef} type="button" onClick={() => setSelectedId(null)} aria-label="关闭衣物详情">×</button>
            </header>

            <label className="detail-main-photo">
              <img src={draft.photo} alt="当前衣物照片" />
              <span>更换照片</span>
              <input type="file" accept="image/*" onChange={(event) => void replaceDetailPhoto(event, "photo")} />
            </label>

            <div className="detail-fields">
              <label>材质
                <select value={draft.material} onChange={(event) => setDraft((previous) => ({ ...previous, material: event.target.value }))}>
                  {["不知道", "棉", "亚麻", "羊毛", "牛仔", "聚酯纤维", "皮革", "混纺"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>厚薄
                <select value={draft.thickness} onChange={(event) => setDraft((previous) => ({ ...previous, thickness: event.target.value }))}>
                  {["不知道", "薄", "适中", "厚"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>尺码
                <input value={draft.size} onChange={(event) => setDraft((previous) => ({ ...previous, size: event.target.value }))} placeholder="例如：L" />
              </label>
              <label>洗护提醒
                <input value={draft.careNotes} onChange={(event) => setDraft((previous) => ({ ...previous, careNotes: event.target.value }))} placeholder="例如：不可烘干" />
              </label>
            </div>

            <div className="detail-labels">
              <div className="label-section-heading"><strong>衣服标签</strong><span>点照片可以更换</span></div>
              <div className="label-upload-grid">
                <label className={draft.careLabelPhoto ? "has-label-photo" : ""}>
                  {draft.careLabelPhoto ? <img src={draft.careLabelPhoto} alt="水洗标" /> : <><b>＋</b><span>水洗标</span></>}
                  <input type="file" accept="image/*" onChange={(event) => void replaceDetailPhoto(event, "careLabelPhoto")} />
                </label>
                <label className={draft.hangtagPhoto ? "has-label-photo" : ""}>
                  {draft.hangtagPhoto ? <img src={draft.hangtagPhoto} alt="购买吊牌" /> : <><b>＋</b><span>购买吊牌</span></>}
                  <input type="file" accept="image/*" onChange={(event) => void replaceDetailPhoto(event, "hangtagPhoto")} />
                </label>
              </div>
              {(draft.careLabelPhoto || draft.hangtagPhoto) && (
                <button className="label-read-button" type="button" onClick={() => void rereadDetailLabels()} disabled={detailBusy}>
                  {detailBusy ? `正在读取 ${Math.round(detailProgress * 100)}%` : "重新读取标签"}
                </button>
              )}
            </div>

            <div className="detail-scenes">
              <p>适合这些场景</p>
              <div>
                {allScenes.map((scene) => (
                  <button className={draft.scenes.includes(scene) ? "selected" : ""} type="button" key={scene} onClick={() => toggleDraftScene(scene)}>
                    {sceneLabels[scene]}
                  </button>
                ))}
              </div>
            </div>

            <div className="detail-state-actions">
              {garmentLocation(selectedItem) === "ready" && (
                <><button type="button" onClick={() => moveToLaundry(selectedItem)}>放进脏衣篓</button><button type="button" onClick={() => pause(selectedItem)}>先收起来</button></>
              )}
              {garmentLocation(selectedItem) === "laundry" && <button type="button" onClick={() => activate(selectedItem)}>洗好放回衣架</button>}
              {garmentLocation(selectedItem) === "paused" && <button type="button" onClick={() => activate(selectedItem)}>重新启用</button>}
            </div>
            {detailMessage && <p className="detail-message" role="status">{detailMessage}</p>}
            <button className="primary-button full" type="submit" disabled={detailBusy}>保存修改</button>
          </form>
        </div>
      )}
    </main>
  );
}
