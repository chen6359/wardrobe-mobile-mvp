"use client";

import { useEffect, useState } from "react";
import WardrobeClient, { type View } from "../src/WardrobeClient";

const routes: Record<string, View> = {
  "/": "home",
  "/start": "start",
  "/wardrobe/add": "add",
  "/wardrobe/ready": "ready",
  "/wardrobe": "wardrobe",
  "/wardrobe/laundry": "laundry",
  "/wear/status": "wear-status",
  "/today": "today",
};

function currentView(): View {
  if (typeof window === "undefined") return "home";
  const path = window.location.hash.replace(/^#/, "") || "/";
  return routes[path] ?? "home";
}

export default function Home() {
  const [view, setView] = useState<View>("home");

  useEffect(() => {
    const handleNavigation = () => setView(currentView());
    handleNavigation();
    window.addEventListener("hashchange", handleNavigation);
    return () => window.removeEventListener("hashchange", handleNavigation);
  }, []);

  return <WardrobeClient initialView={view} />;
}
