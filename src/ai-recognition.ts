export type AiRecognitionResult = {
  category: "top" | "bottom" | "shoes" | "socks" | "outer" | null;
  subtype: string | null;
  color: string | null;
  material: string | null;
  materials: string[];
  pattern: string | null;
  thickness: string | null;
  size: string;
  careNotes: string;
  labelText: string;
  uncertaintyNotes: string[];
};

type AiRecognitionResponse = {
  result: AiRecognitionResult;
  meta: { model: string; elapsedMs: number };
};

type RecognitionImage = {
  kind: "garment" | "care_label" | "hangtag";
  dataUrl: string;
};

export class AiRecognitionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AiRecognitionError";
    this.code = code;
  }
}

export function aiRecognitionEndpoint() {
  if (typeof window === "undefined") return "";
  return ["127.0.0.1", "localhost"].includes(window.location.hostname)
    ? "http://127.0.0.1:8787/api/recognize"
    : "";
}

export async function recognizeGarmentWithAi(images: RecognitionImage[]): Promise<AiRecognitionResponse> {
  const endpoint = aiRecognitionEndpoint();
  if (!endpoint) throw new AiRecognitionError("UNAVAILABLE", "当前版本尚未连接衣物识别服务");
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 70_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.result) {
      throw new AiRecognitionError(payload?.error?.code || "FAILED", payload?.error?.message || "没有识别成功");
    }
    return payload as AiRecognitionResponse;
  } catch (error) {
    if (error instanceof AiRecognitionError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AiRecognitionError("TIMEOUT", "识别等待时间过长");
    }
    throw new AiRecognitionError("NETWORK", "没有连接到衣物识别服务");
  } finally {
    window.clearTimeout(timer);
  }
}
