import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Llama al backend Python que corre en localhost:8000
  const resp = await fetch("http://localhost:8000/scraping/lanzar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    return NextResponse.json({ error: "Backend no disponible" }, { status: 502 });
  }

  const data = await resp.json();
  return NextResponse.json(data);
}
