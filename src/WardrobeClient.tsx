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
  | "laundry";
type Category = "top" | "bottom" | "shoes" | "socks" | "outer";
type Scene = "work" | "gym" | "leisure";
type GarmentState = "ready" | "laundry" | "paused";
type WearPlacement = "hanger" | "laundry";

type Profile = {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
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

type WardrobeData = {
  profile: Profile | null;
  garments: Garment[];
  wearHistory: WearRecord[];
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
};

function normalizeWardrobeData(value: unknown): WardrobeData {
  if (!value || typeof value !== "object") return EMPTY_DATA;
  const candidate = value as Partial<WardrobeData>;
  const garments = Array.isArray(candidate.garments)
    ? candidate.garments.map((item) => {
        const legacyState = String(item.state);
        const state: GarmentState =
          legacyState === "ready" || legacyState === "laundry" || legacyState === "paused"
            ? legacyState
            : legacyState === "washing"
              ? "laundry"
              : "paused";
        return { ...item, state };
      })
    : [];
  const wearHistory = Array.isArray(candidate.wearHistory)
    ? candidate.wearHistory.map((record) => ({
        ...record,
        needsSorting: record.needsSorting === true,
      }))
    : [];
  return {
    profile: candidate.profile ?? null,
    garments,
    wearHistory,
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
  work: "工作",
  gym: "健身",
  leisure: "朋友聚会 / 日常休闲",
};

const subtypeOptions: Record<Category, string[]> = {
  top: ["T恤", "Polo", "短袖衬衫", "长袖衬衫", "针织衫"],
  bottom: ["休闲裤", "西裤", "牛仔裤", "运动裤", "短裤"],
  shoes: ["运动鞋", "休闲鞋", "皮鞋", "凉鞋"],
  socks: ["短袜", "中筒袜", "长袜", "运动袜"],
  outer: ["夹克", "风衣", "西装外套", "羽绒服", "大衣"],
};

const knownCities: Record<string, Omit<Profile, "city">> = {
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

function scoreItem(item: Garment, scene: Scene, temperature: number) {
  let score = item.scenes.length === 0 ? 4 : item.scenes.includes(scene) ? 14 : 1;

  if (scene === "work" && ["短袖衬衫", "长袖衬衫", "Polo", "西裤", "休闲裤", "皮鞋"].includes(item.subtype)) score += 8;
  if (scene === "gym" && ["T恤", "运动裤", "短裤", "运动鞋", "运动袜"].includes(item.subtype)) score += 10;
  if (scene === "leisure" && ["T恤", "Polo", "牛仔裤", "休闲裤", "休闲鞋", "运动鞋"].includes(item.subtype)) score += 7;

  if (temperature >= 26 && item.thickness === "薄") score += 7;
  if (temperature >= 18 && temperature < 26 && item.thickness === "适中") score += 6;
  if (temperature < 18 && item.thickness === "厚") score += 7;
  if (!item.thickness || item.thickness === "不知道") score += 2;
  return score;
}

function selectBest(items: Garment[], scene: Scene, temperature: number, overrideId?: string) {
  if (overrideId) {
    const overridden = items.find((item) => item.id === overrideId);
    if (overridden) return overridden;
  }
  return [...items].sort(
    (a, b) => scoreItem(b, scene, temperature) - scoreItem(a, scene, temperature),
  )[0];
}

function buildOutfit(
  garments: Garment[],
  scene: Scene,
  weather: Weather,
  overrides: Partial<Record<Category, string>>,
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
      : scene === "gym"
        ? "训练时先保证活动方便，再在现有衣物里尽量保持颜色协调。"
        : "朋友聚会可以放松一些，但上衣、裤子和鞋仍然要有连贯感。";
  const weatherReason = `体感约 ${Math.round(weather.apparentTemperature)}°，${top?.thickness && top.thickness !== "不知道" ? `这件${top.thickness}上衣` : "这套的层次"}更适合现在的温度${needOuter ? "，并补上了外套" : ""}。`;
  const matchReason = `${top?.color ?? "上衣"}与${bottom?.color ?? "下装"}保持主次，${socks?.color ?? "袜子"}负责连接裤装和鞋，不会在坐下时突然断开。`;

  return {
    items: selected.filter(Boolean),
    missing: [],
    limitation,
    reasons: [sceneReason, weatherReason, matchReason],
  };
}

async function compressImage(file: File) {
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
  const scale = Math.min(1, 900 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.78);
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, hydrated]);

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

  const currentWeather = weather;
  const outfit = currentWeather
    ? buildOutfit(data.garments, scene, currentWeather, overrides)
    : null;

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
      .sort((a, b) => scoreItem(b, scene, currentWeather.apparentTemperature) - scoreItem(a, scene, currentWeather.apparentTemperature));
    const current = outfit.items.find((item) => item.category === category);
    const index = Math.max(0, candidates.findIndex((item) => item.id === current?.id));
    const next = candidates[(index + 1) % candidates.length];
    setOverrides((previous) => ({ ...previous, [category]: next.id }));
    setNotice(`${categoryLabels[category]}已经换好了。看看这一套是不是更像你。`);
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
    setData((previous) => ({
      ...previous,
      wearHistory: [...previous.wearHistory, record],
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
        setOverrides({});
        setNotice("");
      }}
      weather={currentWeather}
      weatherStatus={weatherStatus}
      setWeather={setWeather}
      outfit={outfit}
      notice={notice}
      swapOne={swapOne}
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
  const [city, setCity] = useState(data.profile?.city ?? "首尔");
  const [saving, setSaving] = useState(false);

  async function saveCity(event: FormEvent) {
    event.preventDefault();
    const trimmed = city.trim();
    if (trimmed.length < 2) {
      setNotice("请先输入常用城市或地区。 ");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      let profile: Profile;
      const known = knownCities[trimmed];
      if (known) {
        profile = { city: trimmed, ...known };
      } else {
        const params = new URLSearchParams({ name: trimmed, count: "1", language: "zh", format: "json" });
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
        if (!response.ok) throw new Error("city lookup failed");
        const result = await response.json();
        const location = result.results?.[0];
        if (!location) throw new Error("city not found");
        profile = {
          city: location.name,
          country: location.country ?? "",
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          timezone: location.timezone ?? "auto",
        };
      }
      setData((previous) => ({ ...previous, profile }));
      navigate("/wardrobe/add");
    } catch {
      setNotice("没有找到这个地区。你可以换成城市名，例如“首尔”或“上海”。 ");
      setSaving(false);
    }
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
          <div className="city-row">
            <input
              id="city"
              list="popular-cities"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="例如：首尔"
              autoComplete="address-level2"
            />
            <datalist id="popular-cities">
              {Object.keys(knownCities).map((name) => <option value={name} key={name} />)}
            </datalist>
            <button type="submit" className="primary-button compact" disabled={saving}>
              {saving ? "正在保存" : "下一步"}
            </button>
          </div>
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
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [totalCount, setTotalCount] = useState(3);
  const [cleanCount, setCleanCount] = useState(3);
  const [message, setMessage] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const progress = readiness(data.garments);

  function changeCategory(next: Category) {
    setCategory(next);
    setSubtype(subtypeOptions[next][0]);
  }

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
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
      scenes,
      totalCount: category === "socks" ? totalCount : undefined,
      cleanCount: category === "socks" ? cleanCount : undefined,
      createdAt: new Date().toISOString(),
    };
    const nextGarments = [...data.garments, garment];
    setData((previous) => ({ ...previous, garments: nextGarments }));
    if (readiness(nextGarments).ready) {
      navigate("/wardrobe/ready");
      return;
    }
    setPhoto("");
    setMessage(`${color}${subtype}已经收好。再添一件没打勾的衣服，就能看到第一套。`);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

        <form className="garment-form" onSubmit={submit}>
          <label className={`photo-picker ${photo ? "has-photo" : ""}`}>
            {photo ? <img src={photo} alt="准备添加的衣服" /> : <div><b>＋</b><span>{photoBusy ? "正在处理照片…" : "拍照或从相册选择"}</span><small>平铺或挂起来拍，更容易看清颜色</small></div>}
            <input type="file" accept="image/*" capture="environment" onChange={pickPhoto} />
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
            <div className="two-fields">
              <label>材质
                <select value={material} onChange={(event) => setMaterial(event.target.value)}>
                  {["不知道", "棉", "亚麻", "羊毛", "牛仔", "聚酯纤维", "皮革", "混纺"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>厚薄
                <select value={thickness} onChange={(event) => setThickness(event.target.value)}>
                  {["不知道", "薄", "适中", "厚"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            </div>
            <div className="scene-checks">
              {(Object.keys(sceneLabels) as Scene[]).map((item) => (
                <label key={item}><input type="checkbox" checked={scenes.includes(item)} onChange={() => toggleScene(item)} />{sceneLabels[item]}</label>
              ))}
            </div>
          </details>

          {message && <p className="form-message" role="status">{message}</p>}
          <button className="primary-button full" type="submit" disabled={photoBusy}>放进我的衣橱</button>
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

function BottomNav({ current }: { current: "today" | "laundry" | "wardrobe" | "add" }) {
  const items: { key: typeof current; label: string; path: string }[] = [
    { key: "today", label: "今天", path: "/today" },
    { key: "laundry", label: "脏衣篓", path: "/wardrobe/laundry" },
    { key: "wardrobe", label: "衣橱", path: "/wardrobe" },
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
  confirmWear: () => void;
  worn: boolean;
}) {
  const [manualTemp, setManualTemp] = useState("22");
  const [manualCondition, setManualCondition] = useState("1");
  const today = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date());

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
        <div className="scene-strip" aria-label="选择今天的场景">
          {(Object.keys(sceneLabels) as Scene[]).map((item) => (
            <button className={scene === item ? "selected" : ""} type="button" key={item} onClick={() => setScene(item)}>{item === "leisure" ? "休闲聚会" : sceneLabels[item]}</button>
          ))}
        </div>

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
            {notice && <p className="inline-notice today-notice" role="status">{notice}</p>}
            <div className="today-actions">
              <button className="secondary-button" type="button" onClick={swapOne}>换一件</button>
              <button className="primary-button" type="button" onClick={confirmWear}>今天穿这套</button>
            </div>
          </>
        ) : null}

        <BottomNav current="today" />
      </section>
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
                        : "洗好前不会参与推荐"}
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
  function moveToLaundry(item: Garment) {
    setData((previous) => ({
      ...previous,
      garments: previous.garments.map((candidate) => {
        if (candidate.id !== item.id) return candidate;
        if (candidate.category === "socks") {
          return { ...candidate, cleanCount: 0, state: "laundry" };
        }
        return { ...candidate, state: "laundry" };
      }),
    }));
  }

  function pause(item: Garment) {
    setData((previous) => ({
      ...previous,
      garments: previous.garments.map((candidate) =>
        candidate.id === item.id ? { ...candidate, state: "paused" } : candidate,
      ),
    }));
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

  function statusCopy(item: Garment) {
    const location = garmentLocation(item);
    if (location === "paused") return "先收起来 · 不参与推荐";
    if (item.category === "socks" && dirtySockCount(item) > 0 && (item.cleanCount ?? 0) > 0) {
      return `衣架还有 ${item.cleanCount} 双 · ${dirtySockCount(item)} 双待洗`;
    }
    if (location === "laundry") return "脏衣篓 · 洗好前不推荐";
    return "衣架 · 可以推荐";
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

      <section className="collection-content">
        {data.garments.length === 0 ? (
          <div className="empty-collection glass-panel">
            <h2>衣橱还是空的</h2>
            <p>先添加上衣、下装、鞋和袜子，就能开始搭配。</p>
            <button className="primary-button full" type="button" onClick={() => navigate("/wardrobe/add")}>添加第一件衣服</button>
          </div>
        ) : (
          <div className="wardrobe-list">
            {data.garments.map((item) => {
              const location = garmentLocation(item);
              return (
                <article className="wardrobe-item" key={item.id}>
                  <img src={item.photo} alt={`${item.color}${item.subtype}`} />
                  <div className="wardrobe-item-copy">
                    <span>{categoryLabels[item.category]}</span>
                    <h2>{item.color}{item.subtype}</h2>
                    <p>{statusCopy(item)}</p>
                    <div className="wardrobe-actions">
                      {location === "ready" && (
                        <>
                          <button type="button" onClick={() => moveToLaundry(item)}>要洗了</button>
                          <button type="button" onClick={() => pause(item)}>先收起来</button>
                        </>
                      )}
                      {location === "laundry" && (
                        <button type="button" onClick={() => activate(item)}>洗好放回衣架</button>
                      )}
                      {location === "paused" && (
                        <button type="button" onClick={() => activate(item)}>重新启用</button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <BottomNav current="wardrobe" />
    </main>
  );
}
