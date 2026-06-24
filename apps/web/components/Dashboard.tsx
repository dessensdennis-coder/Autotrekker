"use client";

import { useMemo, useState } from "react";
import type { CarDTO, ModelTrend } from "@/lib/data";
import { MODEL_LABELS, isNewCar } from "@/lib/format";
import { CarCard } from "@/components/CarCard";
import { TrendStrip } from "@/components/TrendStrip";

type SortKey = "newest" | "price-asc" | "price-desc" | "deal";
type AssessmentFilter = "all" | "koopje" | "redelijk" | "duur";

export function Dashboard({ initialCars, trends }: { initialCars: CarDTO[]; trends: ModelTrend[] }) {
  const [cars, setCars] = useState(initialCars);
  const [model, setModel] = useState<string>("all");
  const [assessment, setAssessment] = useState<AssessmentFilter>("all");
  const [onlyInteresting, setOnlyInteresting] = useState(false);
  const [onlyNew, setOnlyNew] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("newest");

  const availableModels = useMemo(() => [...new Set(cars.map((c) => c.model))], [cars]);

  const filtered = useMemo(() => {
    let list = cars;
    if (model !== "all") list = list.filter((c) => c.model === model);
    if (assessment !== "all") list = list.filter((c) => c.priceAssessment === assessment);
    if (onlyInteresting) list = list.filter((c) => c.isInteresting);
    if (onlyNew) list = list.filter((c) => isNewCar(c.firstSeenAt));

    const sorted = [...list];
    switch (sortBy) {
      case "price-asc":
        sorted.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        sorted.sort((a, b) => b.price - a.price);
        break;
      case "deal":
        sorted.sort((a, b) => (a.priceDeltaPct ?? 0) - (b.priceDeltaPct ?? 0));
        break;
      case "newest":
      default:
        sorted.sort((a, b) => new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime());
    }
    return sorted;
  }, [cars, model, assessment, onlyInteresting, onlyNew, sortBy]);

  async function toggleInteresting(vin: string) {
    const target = cars.find((c) => c.vin === vin);
    if (!target) return;
    const next = !target.isInteresting;

    setCars((prev) => prev.map((c) => (c.vin === vin ? { ...c, isInteresting: next } : c)));

    try {
      const res = await fetch(`/api/cars/${vin}/interesting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interesting: next }),
      });
      if (!res.ok) throw new Error("request failed");
    } catch {
      setCars((prev) => prev.map((c) => (c.vin === vin ? { ...c, isInteresting: !next } : c)));
    }
  }

  return (
    <div className="page">
      <div className="header">
        <div>
          <h1>Autotrekker</h1>
          <div className="subtitle">{cars.length} occasions nu bij Tesla NL</div>
        </div>
      </div>

      <TrendStrip trends={trends} />

      <div className="filters">
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="all">Alle modellen</option>
          {availableModels.map((m) => (
            <option key={m} value={m}>
              {MODEL_LABELS[m] ?? m}
            </option>
          ))}
        </select>

        <select value={assessment} onChange={(e) => setAssessment(e.target.value as AssessmentFilter)}>
          <option value="all">Alle prijzen</option>
          <option value="koopje">Koopje</option>
          <option value="redelijk">Redelijk</option>
          <option value="duur">Duur</option>
        </select>

        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
          <option value="newest">Nieuwste eerst</option>
          <option value="price-asc">Prijs laag-hoog</option>
          <option value="price-desc">Prijs hoog-laag</option>
          <option value="deal">Beste deal eerst</option>
        </select>

        <button className={onlyNew ? "active" : ""} onClick={() => setOnlyNew((v) => !v)}>
          Alleen nieuw
        </button>
        <button className={onlyInteresting ? "active" : ""} onClick={() => setOnlyInteresting((v) => !v)}>
          ♥ Interessant
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">Geen occasions gevonden met deze filters.</div>
      ) : (
        <div className="grid">
          {filtered.map((car) => (
            <CarCard key={car.vin} car={car} onToggleInteresting={toggleInteresting} />
          ))}
        </div>
      )}
    </div>
  );
}
