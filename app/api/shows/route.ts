import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  artists,
  shows,
  deals,
  dealTermsConfirmed,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  draftToDbValues,
  serializeConversation,
  type ChatMessage,
  type DealTermsDraft,
} from "@/lib/dealTermsCapture";

const VENUE_ID = "venue_crescent";
const MARIANA_NAME = "Mariana Reyes";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function mapDealTypeToLegacy(
  dealType: DealTermsDraft["dealType"],
  basis: DealTermsDraft["percentageBasis"],
):
  | "flat"
  | "percentage_of_gross"
  | "percentage_of_net"
  | "vs"
  | "door" {
  switch (dealType) {
    case "flat":
      return "flat";
    case "door_deal":
      return "door";
    case "percentage_only":
      return basis === "gross" ? "percentage_of_gross" : "percentage_of_net";
    case "guarantee_vs_gross":
      return "vs";
    case "guarantee_vs_net":
    case "escalator":
    case "walkout_pot":
    default:
      return "vs";
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      artistName,
      date,
      doorsTime,
      setTime,
      dealTerms,
      messages,
    } = body as {
      artistName: string;
      date: string;
      doorsTime?: string;
      setTime?: string;
      dealTerms: DealTermsDraft;
      messages: ChatMessage[];
    };

    if (!artistName?.trim() || !date) {
      return NextResponse.json(
        { error: "Artist name and show date are required" },
        { status: 400 },
      );
    }

    const now = new Date();
    const slug = slugify(artistName.trim());
    let artistId = `art_${slug}`;

    const existingArtist = await db
      .select()
      .from(artists)
      .where(eq(artists.name, artistName.trim()))
      .limit(1);

    if (existingArtist.length > 0) {
      artistId = existingArtist[0].id;
    } else {
      const collision = await db
        .select({ id: artists.id })
        .from(artists)
        .where(eq(artists.id, artistId))
        .limit(1);
      if (collision.length > 0) {
        artistId = `art_${slug}_${Date.now().toString(36)}`;
      }
      await db.insert(artists).values({
        id: artistId,
        name: artistName.trim(),
        priorShowCount: 0,
      });
    }

    const countRow = await db
      .select({ count: sql<number>`count(*)` })
      .from(shows);
    const nextNum = (countRow[0]?.count ?? 0) + 1;
    const showId = `show_${String(nextNum).padStart(4, "0")}`;

    await db.insert(shows).values({
      id: showId,
      venueId: VENUE_ID,
      artistId,
      date,
      status: "booked",
      doorsTime: doorsTime || null,
      setTime: setTime || null,
      createdAt: now,
    });

    const termsValues = draftToDbValues(dealTerms);
    const rawConversation = serializeConversation(messages ?? []);

    await db.insert(dealTermsConfirmed).values({
      id: `dtc_${showId}`,
      showId,
      ...termsValues,
      rawConversation,
      confirmedBy: MARIANA_NAME,
      confirmedAt: now,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

    if (dealTerms.dealType) {
      const legacyType = mapDealTypeToLegacy(
        dealTerms.dealType,
        dealTerms.percentageBasis,
      );
      await db.insert(deals).values({
        id: `deal_${showId}`,
        showId,
        dealType: legacyType,
        guaranteeAmount: termsValues.guaranteeAmount,
        percentage: termsValues.artistPercentage,
        percentageBasis:
          termsValues.percentageBasis === "net" ||
          termsValues.percentageBasis === "gross"
            ? termsValues.percentageBasis
            : null,
        expenseCap: termsValues.expenseCap,
        hospitalityCap: termsValues.hospitalityCap,
        dealNotesFreetext: rawConversation,
        createdAt: now,
      });
    }

    return NextResponse.json({ showId });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to save show" },
      { status: 500 },
    );
  }
}
