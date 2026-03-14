import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Edge Function: se ejecuta via Database Webhook cuando se inserta un lead nuevo
// Envía email a Manuel usando Resend (gratis hasta 3000 emails/mes)

serve(async (req) => {
  try {
    const payload = await req.json();
    const lead = payload.record;

    if (!lead) return new Response("No record", { status: 400 });

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const MANUEL_EMAIL = Deno.env.get("MANUEL_EMAIL") ?? "manulopezz2002@gmail.com";

    if (!RESEND_API_KEY) {
      console.log("RESEND_API_KEY no configurada — email no enviado");
      return new Response("OK (no email configured)", { status: 200 });
    }

    const nombre = [lead.nombre, lead.apellidos].filter(Boolean).join(" ") || "Sin nombre";
    const telefono = lead.telefono_whatsapp ?? lead.telefono ?? "No indicado";
    const ciudad = lead.ciudad ?? "No indicada";
    const fuente = lead.fuente_detalle ?? lead.fuente ?? "Desconocida";
    const producto = lead.producto_interes_principal ?? (lead.productos_recomendados?.[0]) ?? "No definido";

    const html = `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
        <div style="background: #4f46e5; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0; font-size: 20px;">Nuevo lead recibido</h2>
          <p style="margin: 4px 0 0; opacity: 0.85; font-size: 14px;">Sistema de prospección · Manuel García</p>
        </div>
        <div style="background: white; border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 140px;">Nombre</td><td style="padding: 8px 0; font-weight: 600; color: #1e293b;">${nombre}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Teléfono</td><td style="padding: 8px 0; font-weight: 600; color: #1e293b;">${telefono}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Ciudad</td><td style="padding: 8px 0; color: #1e293b;">${ciudad}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Fuente</td><td style="padding: 8px 0; color: #1e293b;">${fuente}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Producto</td><td style="padding: 8px 0; color: #1e293b;">${producto}</td></tr>
            ${lead.notas ? `<tr><td style="padding: 8px 0; color: #64748b; font-size: 14px; vertical-align: top;">Notas</td><td style="padding: 8px 0; color: #1e293b; font-size: 13px;">${lead.notas}</td></tr>` : ""}
          </table>
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #f1f5f9;">
            <a href="https://prospeccion-manuel.vercel.app/leads/${lead.id}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Ver lead en el sistema →
            </a>
          </div>
        </div>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Prospección Manuel <notificaciones@resend.dev>",
        to: [MANUEL_EMAIL],
        subject: `Nuevo lead: ${nombre} — ${fuente}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Error Resend:", err);
      return new Response("Email error", { status: 500 });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("Error", { status: 500 });
  }
});
