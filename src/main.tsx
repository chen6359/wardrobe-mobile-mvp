import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import WardrobeClient, { type View } from "./WardrobeClient";
import "./styles.css";

const routes: Record<string, View> = {
  "/": "home",
  "/start": "start",
  "/wardrobe/add": "add",
  "/wardrobe/ready": "ready",
  "/wardrobe": "wardrobe",
  "/wardrobe/laundry": "laundry",
  "/purchase": "purchase",
  "/purchase/result": "purchase-result",
  "/purchase/detail": "purchase-detail",
  "/wear/status": "wear-status",
  "/today": "today",
};

function currentView(): View {
  const path = window.location.hash.replace(/^#/, "") || "/";
  return routes[path] ?? "home";
}

function WardrobeApp() {
  const [view, setView] = useState<View>(currentView);

  useEffect(() => {
    const handleNavigation = () => setView(currentView());
    window.addEventListener("hashchange", handleNavigation);
    return () => window.removeEventListener("hashchange", handleNavigation);
  }, []);

  return <WardrobeClient initialView={view} />;
}

createRoot(document.getElementById("root")!).render(<WardrobeApp />);
