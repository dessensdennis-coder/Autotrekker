import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, cars } from "@autotrekker/db";

export async function POST(request: Request, { params }: { params: Promise<{ vin: string }> }) {
  const { vin } = await params;
  const body = await request.json().catch(() => ({}));

  if (typeof body.interesting !== "boolean") {
    return NextResponse.json({ error: "interesting (boolean) is required" }, { status: 400 });
  }

  const db = getDb();
  const [updated] = await db
    .update(cars)
    .set({ isInteresting: body.interesting, updatedAt: new Date() })
    .where(eq(cars.vin, vin))
    .returning({ vin: cars.vin, isInteresting: cars.isInteresting });

  if (!updated) {
    return NextResponse.json({ error: "car not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
