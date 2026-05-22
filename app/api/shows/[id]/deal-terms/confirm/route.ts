import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dealTermsConfirmed } from "@/db/schema";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const confirmedBy = (body.confirmedBy ?? "").toString().trim();

    if (!confirmedBy) {
      return NextResponse.json(
        { error: "Please enter your name to confirm." },
        { status: 400 },
      );
    }

    const existing = await db
      .select()
      .from(dealTermsConfirmed)
      .where(eq(dealTermsConfirmed.showId, id))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json(
        { error: "No deal terms found for this show." },
        { status: 404 },
      );
    }

    if (existing[0].status === "approved") {
      return NextResponse.json(
        {
          error: "These deal terms have already been confirmed.",
          alreadyConfirmed: true,
          confirmedBy: existing[0].confirmedBy,
          confirmedAt: existing[0].confirmedAt,
        },
        { status: 409 },
      );
    }

    const now = new Date();
    await db
      .update(dealTermsConfirmed)
      .set({
        status: "approved",
        confirmedBy,
        confirmedAt: now,
        updatedAt: now,
      })
      .where(eq(dealTermsConfirmed.showId, id));

    return NextResponse.json({
      ok: true,
      confirmedBy,
      confirmedAt: now.toISOString(),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to confirm deal terms." },
      { status: 500 },
    );
  }
}
