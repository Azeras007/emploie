import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionAvec } from "@/lib/auth";
import { deleteStore, listApplicants, listStores, saveStore } from "@/lib/db";
import { uid } from "@/lib/ids";
import type { Store } from "@/lib/types";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Le magasin a besoin d'un nom.").max(120),
  city: z.string().trim().max(80).default(""),
  address: z.string().trim().max(240).default(""),
  active: z.boolean().default(true),
});

export async function GET() {
  if (!(await sessionAvec("magasins"))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, magasins: await listStores() });
}

export async function PUT(request: Request) {
  if (!(await sessionAvec("magasins"))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const existants = await listStores();
  const id = parsed.data.id?.trim() || uid();
  const ancien = existants.find((m) => m.id === id);

  // Deux magasins du même nom se confondraient dans tous les sélecteurs, et
  // rendraient le filtrage des dossiers illisible.
  const doublon = existants.find(
    (m) => m.id !== id && m.name.trim().toLowerCase() === parsed.data.name.toLowerCase()
  );
  if (doublon) {
    return NextResponse.json(
      { error: `Un magasin porte déjà le nom « ${doublon.name} ».` },
      { status: 409 }
    );
  }

  const magasin: Store = {
    id,
    name: parsed.data.name,
    city: parsed.data.city,
    address: parsed.data.address,
    active: parsed.data.active,
    createdAt: ancien?.createdAt ?? new Date().toISOString(),
  };

  await saveStore(magasin);
  return NextResponse.json({ ok: true, magasin });
}

export async function DELETE(request: Request) {
  if (!(await sessionAvec("magasins"))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Magasin non précisé." }, { status: 400 });

  // Fermer un magasin n'efface pas ses dossiers — la clé étrangère les détache
  // — mais on préfère le dire avant plutôt que de le faire découvrir après.
  const rattaches = (await listApplicants()).filter((a) => a.storeId === id).length;
  await deleteStore(id);

  return NextResponse.json({
    ok: true,
    detaches: rattaches,
    message:
      rattaches > 0
        ? `Magasin supprimé. ${rattaches} dossier${rattaches > 1 ? "s" : ""} ${
            rattaches > 1 ? "restent" : "reste"
          } accessible${rattaches > 1 ? "s" : ""}, sans magasin.`
        : "Magasin supprimé.",
  });
}
